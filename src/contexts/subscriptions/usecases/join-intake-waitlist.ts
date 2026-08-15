'use server'

import { getIntakeState, creditAedFor } from '@/infra/config/intake'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { MONTHLY_PLAN_IDS, INTAKE_WAITLIST_SOURCE } from '../domain/credit-eligibility'

export interface JoinWaitlistResult {
  ok: boolean
  alreadyJoined: boolean
  creditAed: number
  message: string
}

type AdminSupabaseClient = ReturnType<typeof createAdminSupabaseClient>

const SPOT_SAVED_NO_CREDIT_YET_MESSAGE =
  'Your spot is saved. We will sort your credit before we reopen.'

/**
 * Look up an already-minted waitlist credit for this customer, if one
 * exists. Numeric columns come back from PostgREST as strings, so the
 * amount is coerced with Number() before it is handed back to the caller.
 */
async function findWaitlistCredit(
  sb: AdminSupabaseClient,
  customerId: string,
): Promise<{ creditId: string; amountAed: number } | null> {
  const { data } = await sb
    .from('credits')
    .select('id, amount_aed')
    .eq('customer_id', customerId)
    .eq('source', INTAKE_WAITLIST_SOURCE)
    .maybeSingle()

  if (!data) return null
  const row = data as { id: string; amount_aed: string | number }
  return { creditId: row.id, amountAed: Number(row.amount_aed) }
}

/**
 * Mint the waitlist credit for this customer.
 *
 * `credits_one_intake_waitlist_per_customer` (a unique partial index on
 * credits.customer_id where source = 'intake_waitlist') makes this safe to
 * call from two places that can race each other: the first-time join, and
 * the already-joined path that discovers no credit ever landed and retries
 * the mint. If a concurrent call already inserted the row, the insert here
 * fails with 23505 too, so we re-read and report the real amount instead of
 * claiming a second one was created.
 */
async function mintWaitlistCredit(
  sb: AdminSupabaseClient,
  customerId: string,
  creditAed: number,
): Promise<{ creditId: string; amountAed: number } | null> {
  const { data: credit, error: creditError } = await sb
    .from('credits')
    .insert({
      customer_id: customerId,
      amount_aed: creditAed,
      source: INTAKE_WAITLIST_SOURCE,
      status: 'approved',
      eligible_plan_ids: [...MONTHLY_PLAN_IDS],
    })
    .select('id')
    .single()

  if (!creditError) {
    return { creditId: (credit as { id: string }).id, amountAed: creditAed }
  }

  if (creditError.code === '23505') {
    return findWaitlistCredit(sb, customerId)
  }

  return null
}

/**
 * Stamp the credit id back onto the waitlist row for admin reconciliation.
 * Non-fatal if it fails: the credit already exists and has already been
 * reported to the customer. Losing this stamp only means reconciliation has
 * to cross-reference credits by customer_id and source instead of a direct
 * join, so the failure is logged rather than silently discarded.
 */
async function stampCreditId(
  sb: AdminSupabaseClient,
  customerId: string,
  creditId: string,
): Promise<void> {
  const { error } = await sb
    .from('intake_waitlist')
    .update({ credit_id: creditId })
    .eq('customer_id', customerId)

  if (error) {
    console.error('joinIntakeWaitlist: failed to stamp credit_id on intake_waitlist row', {
      customerId,
      creditId,
      error,
    })
  }
}

/**
 * Join the early-access list during a seasonal pause.
 *
 * The waitlist row goes in FIRST. Its UNIQUE(customer_id) is the idempotency
 * guarantee, so a double tap loses the race at the database and never reaches
 * the credit insert. Doing it the other way round would mint a second credit
 * before discovering the duplicate.
 *
 * A double tap can still land on a customer whose first tap saved the spot
 * but failed to mint a credit (network blip, transient DB error). The
 * already-joined branch below never assumes a credit exists just because
 * the waitlist row does. It checks, and mints on the customer's behalf if
 * the earlier attempt never landed, so the amount reported is always real.
 *
 * The credit is granted now, not at reopening, deliberately: holding a
 * visible balance during the wait is the whole mechanic. It is restricted
 * to monthly plans and does not expire.
 */
export async function joinIntakeWaitlist(): Promise<JoinWaitlistResult> {
  const none = { ok: false, alreadyJoined: false, creditAed: 0 }

  const user = await getUserFromHeaders()
  if (!user) return { ...none, message: 'Please sign in first.' }

  const intake = await getIntakeState()
  if (!intake.paused) {
    return { ...none, message: 'Plans are open. No need to save a spot.' }
  }

  const sb = createAdminSupabaseClient()

  const { data: customer } = await sb
    .from('customers')
    .select('meal_preference_type')
    .eq('id', user.id)
    .maybeSingle()

  const creditAed = creditAedFor(
    intake,
    (customer as { meal_preference_type?: string } | null)?.meal_preference_type,
  )

  const { error: waitlistError } = await sb
    .from('intake_waitlist')
    .insert({ customer_id: user.id })

  if (waitlistError) {
    if (waitlistError.code !== '23505') {
      return { ...none, message: 'Could not save your spot. Please try again.' }
    }

    // 23505 = unique violation. Already on the list, but do not assume a
    // credit was ever minted. An earlier tap can have saved the spot and
    // then failed the credit insert, so check for a real row before
    // reporting any amount, and mint on their behalf if it is missing.
    const existing = await findWaitlistCredit(sb, user.id)
    if (existing) {
      return {
        ok: true,
        alreadyJoined: true,
        creditAed: existing.amountAed,
        message: 'You are already on the list.',
      }
    }

    const minted = await mintWaitlistCredit(sb, user.id, creditAed)
    if (!minted) {
      return {
        ok: true,
        alreadyJoined: true,
        creditAed: 0,
        message: SPOT_SAVED_NO_CREDIT_YET_MESSAGE,
      }
    }

    await stampCreditId(sb, user.id, minted.creditId)
    return {
      ok: true,
      alreadyJoined: true,
      creditAed: minted.amountAed,
      message: `Your spot is saved. AED ${minted.amountAed} is waiting in your account.`,
    }
  }

  const minted = await mintWaitlistCredit(sb, user.id, creditAed)
  if (!minted) {
    // The spot is saved either way. An admin can reconcile a missing credit
    // from the waitlist row, which is better than failing the customer's tap.
    return {
      ok: true,
      alreadyJoined: false,
      creditAed: 0,
      message: SPOT_SAVED_NO_CREDIT_YET_MESSAGE,
    }
  }

  await stampCreditId(sb, user.id, minted.creditId)
  return {
    ok: true,
    alreadyJoined: false,
    creditAed: minted.amountAed,
    message: `Your spot is saved. AED ${minted.amountAed} is waiting in your account.`,
  }
}

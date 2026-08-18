'use server'

import { getIntakeState, creditAedFor } from '@/infra/config/intake'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { MONTHLY_PLAN_IDS, INTAKE_WAITLIST_SOURCE, SPOT_SAVED_NO_CREDIT_YET_MESSAGE } from '../domain/credit-eligibility'
import { resolveJoinCycle } from '../domain/intake-cycle'

export interface JoinWaitlistResult {
  ok: boolean
  alreadyJoined: boolean
  creditAed: number
  message: string
}

type AdminSupabaseClient = ReturnType<typeof createAdminSupabaseClient>

/**
 * The credit minted by a specific waitlist row, if one landed.
 *
 * Keyed on the waitlist row rather than on (customer_id, source) because the
 * customer may legitimately hold waitlist credits from earlier pauses. Status
 * is deliberately NOT filtered: a credit already spent this cycle still exists
 * and must block a second mint.
 */
async function findCycleCredit(
  sb: AdminSupabaseClient,
  waitlistId: string,
): Promise<{ creditId: string; amountAed: number; spent: boolean } | null> {
  const { data } = await sb
    .from('credits')
    .select('id, amount_aed, status')
    .eq('intake_waitlist_id', waitlistId)
    .maybeSingle()

  if (!data) return null
  const row = data as { id: string; amount_aed: string | number; status: string }
  return {
    creditId: row.id,
    amountAed: Number(row.amount_aed),
    spent: row.status === 'applied',
  }
}

/**
 * Mint the waitlist credit for this cycle's waitlist row.
 *
 * `credits_one_per_intake_waitlist_row` (a unique partial index on
 * credits.intake_waitlist_id where it is not null) makes this safe to call
 * from two places that can race each other: the first-time join, and the
 * already-joined path that discovers no credit ever landed and retries the
 * mint. If a concurrent call already inserted the row, the insert here fails
 * with 23505 too, so we re-read and report the real amount instead of
 * claiming a second one was created.
 */
async function mintWaitlistCredit(
  sb: AdminSupabaseClient,
  customerId: string,
  waitlistId: string,
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
      intake_waitlist_id: waitlistId,
    })
    .select('id')
    .single()

  if (!creditError) {
    return { creditId: (credit as { id: string }).id, amountAed: creditAed }
  }

  // 23505 = a concurrent call already minted for this waitlist row.
  if (creditError.code === '23505') {
    const existing = await findCycleCredit(sb, waitlistId)
    return existing ? { creditId: existing.creditId, amountAed: existing.amountAed } : null
  }

  return null
}

/**
 * Stamp the credit id back onto the waitlist row for admin reconciliation.
 * Non-fatal if it fails: the credit already exists and has already been
 * reported to the customer. Losing this stamp only means reconciliation has
 * to cross-reference credits by intake_waitlist_id instead of a direct join,
 * so the failure is logged rather than silently discarded.
 */
async function stampCreditId(
  sb: AdminSupabaseClient,
  waitlistId: string,
  creditId: string,
): Promise<void> {
  const { error } = await sb
    .from('intake_waitlist')
    .update({ credit_id: creditId })
    .eq('id', waitlistId)

  if (error) {
    console.error('joinIntakeWaitlist: failed to stamp credit_id on intake_waitlist row', {
      waitlistId, creditId, error,
    })
  }
}

/**
 * Join the early-access list during a seasonal pause.
 *
 * The waitlist row goes in FIRST. Its UNIQUE(customer_id, cycle_started_at) is
 * the idempotency guarantee, so a double tap loses the race at the database
 * and never reaches the credit insert. Doing it the other way round would
 * mint a second credit before discovering the duplicate.
 *
 * The join and its credit are scoped to the CURRENT pause cycle
 * (intake_settings.cycle_started_at, stamped on every pause-ON). A customer
 * who joined an earlier pause can join again in a later one and earn a fresh
 * credit — the old lifetime-unique rule locked them out for good.
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
  const cycle = resolveJoinCycle(intake)
  if (!cycle.ok) {
    return {
      ...none,
      message: cycle.reason === 'not_paused'
        ? 'Plans are open. No need to save a spot.'
        : 'We could not save your spot right now. Please try again shortly.',
    }
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

  const { data: waitlistRow, error: waitlistError } = await sb
    .from('intake_waitlist')
    .insert({ customer_id: user.id, cycle_started_at: cycle.cycleStartedAt })
    .select('id')
    .single()

  if (waitlistError) {
    if (waitlistError.code !== '23505') {
      return { ...none, message: 'Could not save your spot. Please try again.' }
    }

    // 23505 = unique violation. Already on the list for this cycle, but do
    // not assume a credit was ever minted. An earlier tap can have saved the
    // spot and then failed the credit insert, so check for a real row before
    // reporting any amount, and mint on their behalf if it is missing.
    const { data: existingRow } = await sb
      .from('intake_waitlist')
      .select('id')
      .eq('customer_id', user.id)
      .eq('cycle_started_at', cycle.cycleStartedAt)
      .maybeSingle()

    if (!existingRow) {
      return { ...none, message: 'Could not save your spot. Please try again.' }
    }
    const waitlistId = (existingRow as { id: string }).id
    const existing = await findCycleCredit(sb, waitlistId)
    if (existing) {
      // A credit already spent this cycle is not money waiting. Report zero
      // rather than the spent amount so the gate never claims a balance the
      // customer has already redeemed (spec §8.1 / IntakeCreditDisplay's
      // "never tell a customer an amount is waiting when the real balance is
      // zero"). SPOT_SAVED_NO_CREDIT_YET_MESSAGE already documents this exact
      // case as one of its two valid uses.
      if (existing.spent) {
        return {
          ok: true,
          alreadyJoined: true,
          creditAed: 0,
          message: SPOT_SAVED_NO_CREDIT_YET_MESSAGE,
        }
      }
      return {
        ok: true,
        alreadyJoined: true,
        creditAed: existing.amountAed,
        message: 'You are already on our waitlist.',
      }
    }

    const minted = await mintWaitlistCredit(sb, user.id, waitlistId, creditAed)
    if (!minted) {
      return {
        ok: true,
        alreadyJoined: true,
        creditAed: 0,
        message: SPOT_SAVED_NO_CREDIT_YET_MESSAGE,
      }
    }

    await stampCreditId(sb, waitlistId, minted.creditId)
    return {
      ok: true,
      alreadyJoined: true,
      creditAed: minted.amountAed,
      message: `Your spot is saved. AED ${minted.amountAed} is waiting in your account.`,
    }
  }

  const waitlistId = (waitlistRow as { id: string }).id
  const minted = await mintWaitlistCredit(sb, user.id, waitlistId, creditAed)
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

  await stampCreditId(sb, waitlistId, minted.creditId)
  return {
    ok: true,
    alreadyJoined: false,
    creditAed: minted.amountAed,
    message: `Your spot is saved. AED ${minted.amountAed} is waiting in your account.`,
  }
}

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

/**
 * Join the early-access list during a seasonal pause.
 *
 * The waitlist row goes in FIRST. Its UNIQUE(customer_id) is the idempotency
 * guarantee, so a double tap loses the race at the database and never reaches
 * the credit insert. Doing it the other way round would mint a second credit
 * before discovering the duplicate.
 *
 * The credit is granted now, not at reopening, deliberately: holding a visible
 * balance during the wait is the whole mechanic. It is restricted to monthly
 * plans and does not expire.
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
    // 23505 = unique violation. Already on the list, already credited.
    if (waitlistError.code === '23505') {
      return {
        ok: true,
        alreadyJoined: true,
        creditAed,
        message: 'You are already on the list.',
      }
    }
    return { ...none, message: 'Could not save your spot. Please try again.' }
  }

  const { data: credit, error: creditError } = await sb
    .from('credits')
    .insert({
      customer_id: user.id,
      amount_aed: creditAed,
      source: INTAKE_WAITLIST_SOURCE,
      status: 'approved',
      eligible_plan_ids: [...MONTHLY_PLAN_IDS],
    })
    .select('id')
    .single()

  if (creditError) {
    // The spot is saved either way. An admin can reconcile a missing credit
    // from the waitlist row, which is better than failing the customer's tap.
    return {
      ok: true,
      alreadyJoined: false,
      creditAed: 0,
      message: 'Your spot is saved. We will sort your credit before we reopen.',
    }
  }

  await sb
    .from('intake_waitlist')
    .update({ credit_id: (credit as { id: string }).id })
    .eq('customer_id', user.id)

  return {
    ok: true,
    alreadyJoined: false,
    creditAed,
    message: `Your spot is saved. AED ${creditAed} is waiting in your account.`,
  }
}

/**
 * Subscriptions context repository — Supabase reads for customer, active +
 * queued subscriptions, and the most recent order.
 *
 * Extracted from src/utils/supabase/queries.ts in Phase 8 of the layered
 * refactor. All function signatures match the original exactly so existing
 * consumers keep working via the queries.ts shim.
 */

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { creditAppliesToPlan, MONTHLY_PLAN_IDS, INTAKE_WAITLIST_SOURCE } from '@/contexts/subscriptions/domain/credit-eligibility'
import type { PlanId } from '@/contexts/subscriptions/domain/plans'

// React `cache()` deduplicates these calls inside a single render. When the
// layout and a page both ask for the same user's customer row, only one
// network round-trip happens — both callers receive the same Promise.

export const getCustomer = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) console.error('getCustomer failed:', error.message)
  return data
})

/**
 * Returns the customer's primary live subscription — the one the dashboard
 * renders.
 *
 * Live = Active | Paused | Skipped | Scheduled. When both a primary
 * (Active|Paused|Skipped) and a queued Scheduled exist, the primary wins
 * (lower start_date thanks to ASC ordering). When only Scheduled exists
 * (paid, not yet started), it falls through and is returned so the user
 * still sees their plan on the dashboard with a "starts in N days" hero.
 */
export const getActiveSubscription = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('customer_id', userId)
    .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED])
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) console.error('getActiveSubscription failed:', error.message)
  return data
})

/**
 * Returns the customer's queued Scheduled subscription, if AND ONLY IF a
 * primary live sub (Active|Paused|Skipped) also exists. When only a
 * Scheduled sub exists, it's already returned by getActiveSubscription as
 * the primary — so this returns null (nothing queued behind it).
 *
 * Drives the "Up next: <plan> · starts <date>" banner above HeroToday.
 */
export const getQueuedSubscription = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data: primary } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('customer_id', userId)
    .in('status', [...LIVE_SUBSCRIPTION_STATUSES])
    .limit(1)
    .maybeSingle()
  if (!primary) return null

  const { data: queued } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('customer_id', userId)
    .eq('status', SUBSCRIPTION_STATUS.SCHEDULED)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  return queued
})

export const getAllSubscriptions = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
  return data ?? []
})

/**
 * Returns the customer's most recent order — used by the post-checkout success
 * takeover to display the just-paid amount alongside the new subscription
 * details. Returns null when the customer has never paid (e.g. first-time
 * visit, pre-checkout). The takeover is only rendered when the just-created
 * subscription is detected, so on the success path this order will always be
 * the freshly-paid one.
 */
export const getMostRecentOrder = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('orders')
    .select('id, plan, meals_count, price_per_meal, created_at')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
})

// ── Credit redemption (Phase 7-02) ────────────────────────────────────────
// Credits are populated by both referrals (conversion rewards) and dorm-wars
// (gameplay rewards) — but they're SPENT at subscription checkout. The owner
// is therefore subscriptions: this is the "what's in my wallet at checkout"
// query, scoped to status='approved' (not 'pending').
//
// Shared between the checkout API route (compute coupon discount) and the
// checkout panel SSR page (display "AED X applied" before submit). Both
// callers MUST use this exact filter so the displayed amount and the
// actually-redeemed amount stay in lockstep.
//
// Live `credits.status` CHECK constraint: ('pending','approved','applied','rejected').
// The redemption flow flips 'approved' → 'applied' on webhook completion.

export interface RedeemableCreditRow {
  id:         string
  amount_aed: number
}

export interface RedeemableCredit {
  rows:        RedeemableCreditRow[]
  /** Sum of `amount_aed × 100`, rounded — the balance redeemable on THIS plan. */
  balanceFils: number
  /** Held, approved, but not redeemable against this plan. Display only. */
  lockedFils:  number
  /** True when the locked balance would unlock on a monthly plan. */
  lockedRequiresMonthly: boolean
}

/**
 * Returns approved credit rows + their summed balance in fils for redemption.
 *
 * When `planId` is supplied the rows are filtered by `eligible_plan_ids`, and
 * anything excluded is reported separately as `lockedFils` so the customer can
 * be told WHY a credit they hold is not coming off the price. Omitting
 * `planId` applies no filter, preserving the pre-restriction behaviour for
 * callers that are not plan-specific.
 *
 * Both the checkout route and the plan page MUST call this with the same
 * planId — that lockstep is what keeps the displayed discount and the charged
 * discount identical.
 */
export async function getRedeemableCredit(
  sb: SupabaseClient,
  userId: string,
  planId?: PlanId,
): Promise<RedeemableCredit> {
  const { data } = await sb
    .from('credits')
    .select('id, amount_aed, eligible_plan_ids')
    .eq('customer_id', userId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true })

  const all = (data ?? []) as Array<{
    id: string
    amount_aed: number
    eligible_plan_ids: string[] | null
  }>

  const rows: RedeemableCreditRow[] = []
  let lockedFils = 0
  let lockedRequiresMonthly = false

  for (const r of all) {
    const usable = planId == null || creditAppliesToPlan(r.eligible_plan_ids, planId)
    if (usable) {
      rows.push({ id: r.id, amount_aed: Number(r.amount_aed) })
    } else {
      lockedFils += Math.round(Number(r.amount_aed) * 100)
      if ((r.eligible_plan_ids ?? []).some(p => (MONTHLY_PLAN_IDS as readonly string[]).includes(p))) {
        lockedRequiresMonthly = true
      }
    }
  }

  const balanceFils = rows.reduce(
    (sum, r) => sum + Math.round(r.amount_aed * 100),
    0,
  )
  return { rows, balanceFils, lockedFils, lockedRequiresMonthly }
}

/**
 * Splits the customer's approved credit balance into a {balanceFils,
 * lockedFils} pair for EVERY planId supplied, in one query.
 *
 * The naive approach would call getRedeemableCredit(sb, userId, planId) once
 * per selectable plan, round-tripping to Supabase on every plan-page render.
 * Instead this fetches the same unfiltered row set getRedeemableCredit would
 * fetch when its `planId` argument is omitted, then applies
 * creditAppliesToPlan(...) against each requested planId in memory. Same
 * output as calling getRedeemableCredit per plan, one round trip.
 *
 * Used by the plan page (and explore-plans) to thread a full planId → split
 * map down to the client so switching between plan cards updates the
 * locked-credit note without hitting the server again.
 */
export async function getCreditSplitByPlan(
  sb: SupabaseClient,
  userId: string,
  planIds: readonly PlanId[],
): Promise<Record<PlanId, { balanceFils: number; lockedFils: number }>> {
  const { data } = await sb
    .from('credits')
    .select('amount_aed, eligible_plan_ids')
    .eq('customer_id', userId)
    .eq('status', 'approved')

  const rows = (data ?? []) as Array<{
    amount_aed: number
    eligible_plan_ids: string[] | null
  }>

  const result = {} as Record<PlanId, { balanceFils: number; lockedFils: number }>
  for (const planId of planIds) {
    let balanceFils = 0
    let lockedFils = 0
    for (const r of rows) {
      // Supabase returns numeric columns as strings through PostgREST.
      // Coerce before arithmetic or this silently string-concatenates.
      const fils = Math.round(Number(r.amount_aed) * 100)
      if (creditAppliesToPlan(r.eligible_plan_ids, planId)) balanceFils += fils
      else lockedFils += fils
    }
    result[planId] = { balanceFils, lockedFils }
  }
  return result
}

// ── Seasonal intake pause — waitlist status (Phase: seasonal-intake-pause) ──
// Both the Now-tray entries and the plan-ending-during-a-pause banner need
// the exact same fact: is this customer on the waitlist, and do they hold an
// unspent waitlist credit. Centralising the two-table read here keeps that
// fact from drifting between the two call sites — neither should query
// intake_waitlist or credits directly.

export interface WaitlistStatus {
  /** Has this customer joined the CURRENT pause cycle? */
  joined: boolean
  /** Sum of `credits.amount_aed` rows with source='intake_waitlist' and
   *  status='approved' (approved = unspent; the redemption flow flips it to
   *  'applied' on checkout). Persists past intake reopening AND across
   *  cycles — the credit stays unspent until the customer actually redeems
   *  it on a monthly plan, even if it was minted in an earlier pause. */
  unspentCreditAed: number
}

/**
 * Reads the customer's seasonal-intake-waitlist standing: whether they've
 * joined the CURRENT pause cycle, and how much unspent credit
 * (status='approved') they hold from ANY cycle. Two independent reads (a
 * point lookup + a small aggregate), run in parallel — not a join, since
 * intake_waitlist and credits are separate tables with no FK the query layer
 * relies on.
 *
 * `cycleStartedAt` scopes the join lookup to the pause running right now
 * (from `getIntakeState().cycleStartedAt`). Omit it (or pass null/undefined)
 * to fall back to "has this customer ever joined any cycle" — used by
 * callers that only need the credit balance and don't have an IntakeState
 * in scope.
 *
 * Fails safe on a read error: logs and defaults that piece to
 * not-joined/zero rather than throwing, so a transient DB hiccup can't take
 * down the sidebar or the dashboard home.
 */
export async function getWaitlistStatus(
  sb: SupabaseClient,
  userId: string,
  cycleStartedAt?: string | null,
): Promise<WaitlistStatus> {
  // `joined` is scoped to the CURRENT pause: a customer who joined last
  // season has not joined this one and must still see the join button.
  // `unspentCreditAed` is deliberately NOT scoped — an unspent credit from an
  // earlier pause is still the customer's money and stays visible.
  const waitlistQuery = cycleStartedAt
    ? sb.from('intake_waitlist').select('id').eq('customer_id', userId).eq('cycle_started_at', cycleStartedAt).maybeSingle()
    : sb.from('intake_waitlist').select('id').eq('customer_id', userId).limit(1).maybeSingle()

  const [waitlistResult, creditsResult] = await Promise.all([
    waitlistQuery,
    sb.from('credits').select('amount_aed').eq('customer_id', userId).eq('source', INTAKE_WAITLIST_SOURCE).eq('status', 'approved'),
  ])
  if (waitlistResult.error) console.error('getWaitlistStatus: intake_waitlist read failed:', waitlistResult.error.message)
  if (creditsResult.error) console.error('getWaitlistStatus: credits read failed:', creditsResult.error.message)

  const joined = !!waitlistResult.data
  const rows = (creditsResult.data ?? []) as Array<{ amount_aed: number | string }>
  // Supabase returns numeric columns as strings through PostgREST — coerce
  // before summing or this silently string-concatenates.
  const unspentCreditAed = rows.reduce((sum, r) => sum + Number(r.amount_aed), 0)

  return { joined, unspentCreditAed }
}

/**
 * Strict sibling of getWaitlistStatus, for callers where silently defaulting
 * to "no credit" on a read error is the WRONG failure mode — e.g. the season
 * reopen broadcast, where a swallowed error would send a credit holder the
 * no-credit email and stamp it sent, with no retry ever correcting it.
 * Mirrors getWaitlistStatus's queries exactly, but throws on any query error
 * instead of logging and defaulting, so the caller's own retry path (a
 * per-recipient catch that parks the row for another attempt) can do its job.
 * getWaitlistStatus itself is intentionally left fail-open for its existing
 * callers (pause suppression must never fail closed) — do not merge these.
 */
export async function getWaitlistStatusStrict(
  sb: SupabaseClient,
  userId: string,
  cycleStartedAt?: string | null,
): Promise<WaitlistStatus> {
  const waitlistQuery = cycleStartedAt
    ? sb.from('intake_waitlist').select('id').eq('customer_id', userId).eq('cycle_started_at', cycleStartedAt).maybeSingle()
    : sb.from('intake_waitlist').select('id').eq('customer_id', userId).limit(1).maybeSingle()

  const [waitlistResult, creditsResult] = await Promise.all([
    waitlistQuery,
    sb.from('credits').select('amount_aed').eq('customer_id', userId).eq('source', INTAKE_WAITLIST_SOURCE).eq('status', 'approved'),
  ])
  if (waitlistResult.error) throw new Error(`getWaitlistStatusStrict: intake_waitlist read failed: ${waitlistResult.error.message}`)
  if (creditsResult.error) throw new Error(`getWaitlistStatusStrict: credits read failed: ${creditsResult.error.message}`)

  const joined = !!waitlistResult.data
  const rows = (creditsResult.data ?? []) as Array<{ amount_aed: number | string }>
  const unspentCreditAed = rows.reduce((sum, r) => sum + Number(r.amount_aed), 0)

  return { joined, unspentCreditAed }
}

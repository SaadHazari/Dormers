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
import { creditAppliesToPlan } from '@/contexts/subscriptions/domain/credit-eligibility'
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
      if ((r.eligible_plan_ids ?? []).some(p => p.startsWith('monthly-'))) {
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

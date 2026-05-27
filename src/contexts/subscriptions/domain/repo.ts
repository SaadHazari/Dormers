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
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from './subscription-status'

// React `cache()` deduplicates these calls inside a single render. When the
// layout and a page both ask for the same user's customer row, only one
// network round-trip happens — both callers receive the same Promise.

export const getCustomer = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('customers')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
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
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('customer_id', userId)
    .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED])
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()
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
  /** Sum of `amount_aed × 100`, rounded — the redeemable balance in fils. */
  balanceFils: number
}

/**
 * Returns approved credit rows + their summed balance in fils for redemption.
 * Accepts a caller-supplied Supabase client so it can run from API routes
 * (server client) or RSC pages (server client) without instantiating its own.
 */
export async function getRedeemableCredit(
  sb: SupabaseClient,
  userId: string,
): Promise<RedeemableCredit> {
  const { data } = await sb
    .from('credits')
    .select('id, amount_aed')
    .eq('customer_id', userId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true })

  const rows: RedeemableCreditRow[] = (data ?? []).map(r => ({
    id:         r.id as string,
    amount_aed: Number(r.amount_aed),
  }))
  const balanceFils = rows.reduce(
    (sum, r) => sum + Math.round(r.amount_aed * 100),
    0,
  )
  return { rows, balanceFils }
}

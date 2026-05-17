import { cache } from 'react'
import { createClient } from './server'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/lib/subscription-status'
import type { SupabaseClient } from '@supabase/supabase-js'

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

export interface ReferralData {
  total:         number   // gift_claimed + converted (all sent referrals that got a meal)
  converted:     number   // invitees who became paying subscribers
  creditBalance: number   // sum of approved credits in AED
}

export const getReferralData = cache(async (userId: string): Promise<ReferralData> => {
  const supabase = await createClient()
  try {
    const [totalRes, convertedRes, creditRes] = await Promise.all([
      supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('inviter_user_id', userId)
        .in('status', ['gift_claimed', 'converted']),
      supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('inviter_user_id', userId)
        .eq('status', 'converted'),
      supabase
        .from('credits')
        .select('amount_aed')
        .eq('customer_id', userId)
        .in('status', ['approved', 'pending']),
    ])
    const creditBalance = (creditRes.data ?? []).reduce(
      (sum, r) => sum + Number(r.amount_aed), 0
    )
    return {
      total:         totalRes.count     ?? 0,
      converted:     convertedRes.count ?? 0,
      creditBalance,
    }
  } catch {
    return { total: 0, converted: 0, creditBalance: 0 }
  }
})

// Keep old export name as a thin wrapper so any external callers aren't broken.
export const getReferralCount = cache(async (userId: string): Promise<number> => {
  const data = await getReferralData(userId)
  return data.total
})

// ── Dorm-level stats — Dorm Wars zero-state branching ─────────────────────
// activeCount drives the A/B branch (≥ 5 → activity feed, < 5 → founder slots).
// recent is what the activity feed renders. Both are scoped to a single dorm.
export interface DormRecentSub {
  firstName: string
  planName:  string
  createdAt: string
}
export interface DormStats {
  activeCount: number
  recent:      DormRecentSub[]
}

// ── Recent invites — for the engaged-state "Your invites" block ───────────
// Returns the inviter's most-recent gift_claimed + converted referrals so the
// UI can render a humanized pipeline view with first names + status badges.
// The 10-day aging window (claimed → "delivered" past tense) is applied by
// the client component, since "now" is render-time, not query-time.
export interface InviteRow {
  id:             string
  firstName:      string          // 'Friend' when invitee_first_name is null (legacy)
  status:         'gift_claimed' | 'converted'
  claimedAt:      string
  convertedAt:    string | null
}

export const getRecentInvites = cache(async (userId: string, limit = 10): Promise<InviteRow[]> => {
  const supabase = await createClient()
  try {
    const { data } = await supabase
      .from('referrals')
      .select('id, invitee_first_name, status, gift_claimed_at, converted_at')
      .eq('inviter_user_id', userId)
      .in('status', ['gift_claimed', 'converted'])
      .order('gift_claimed_at', { ascending: false })
      .limit(limit)

    return (data ?? []).map(r => ({
      id:          r.id,
      firstName:   r.invitee_first_name?.trim() || 'Friend',
      status:      r.status as 'gift_claimed' | 'converted',
      claimedAt:   r.gift_claimed_at,
      convertedAt: r.converted_at,
    }))
  } catch {
    return []
  }
})

export const getDormStats = cache(async (dormName: string): Promise<DormStats> => {
  if (!dormName) return { activeCount: 0, recent: [] }
  const supabase = await createClient()
  try {
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name')
      .eq('dorm_name', dormName)

    if (!customers || customers.length === 0) {
      return { activeCount: 0, recent: [] }
    }

    const customerIds = customers.map(c => c.id)
    const nameMap = new Map(customers.map(c => [c.id, c.name as string | null]))

    const { data: subs } = await supabase
      .from('subscriptions')
      .select('customer_id, plan_name, created_at')
      .in('customer_id', customerIds)
      .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED])
      .order('created_at', { ascending: false })

    const rows = subs ?? []
    // Dedupe by customer — each customer counts once toward density,
    // and only their newest live sub appears in the feed.
    const seen = new Set<string>()
    const deduped: typeof rows = []
    for (const s of rows) {
      if (!seen.has(s.customer_id)) {
        seen.add(s.customer_id)
        deduped.push(s)
      }
    }

    const recent: DormRecentSub[] = deduped.slice(0, 5).map(s => ({
      firstName: ((nameMap.get(s.customer_id) ?? '').split(' ')[0]) || 'Someone',
      planName:  (s.plan_name ?? '').replace(/\p{Emoji}/gu, '').trim() || 'a plan',
      createdAt: s.created_at,
    }))

    return { activeCount: deduped.length, recent }
  } catch {
    return { activeCount: 0, recent: [] }
  }
})

// ── Dorm Wars: credit redemption helpers (Phase 7-02) ─────────────────────
// Shared between the checkout API route (compute coupon discount) and the
// checkout panel SSR page (display "AED X applied" before submit). Both call
// sites MUST read the same status filter ('approved' only — NOT 'pending')
// so the displayed amount and the actually-redeemed amount stay in lockstep.
//
// Note on `status`: the live `credits.status` CHECK constraint is
//   ('pending','approved','applied','rejected')
// The redemption flow flips 'approved' → 'applied' on webhook completion.
// Only 'approved' rows count toward the redeemable balance.

export interface RedeemableCreditRow {
  id:         string
  amount_aed: number
}

export interface RedeemableCredit {
  rows:        RedeemableCreditRow[]
  /** Sum of `amount_aed × 100`, rounded — i.e. the redeemable balance in fils. */
  balanceFils: number
}

/**
 * Returns approved credit rows + their summed balance in fils for redemption.
 * Accepts a caller-supplied Supabase client so it can run from API routes
 * (server client) or RSC pages (server client) without instantiating its own.
 *
 * Used by:
 *   • src/app/api/checkout/route.ts — compute coupon discount + record applied_credit_ids
 *   • src/app/dashboard/plan/page.tsx — pass creditBalanceAed prop to CheckoutPanel
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

/**
 * Returns the user's active lifetime-tier discount percent: 0 | 5 | 10.
 *   tier 1       → 5%   (10 lifetime conversions)
 *   tier 2,3,4   → 10%  (25+ lifetime conversions)
 *
 * Used by the checkout route to bake tier % into the synthesized coupon. The
 * highest-tier row wins — `lifetime_rewards (customer_id, tier)` is UNIQUE so
 * there is at most one row per tier per customer.
 */
export async function getActiveLifetimeTierPercent(
  sb: SupabaseClient,
  userId: string,
): Promise<0 | 5 | 10> {
  const { data } = await sb
    .from('lifetime_rewards')
    .select('tier')
    .eq('customer_id', userId)
    .order('tier', { ascending: false })
    .limit(1)
    .maybeSingle()

  const tier = data?.tier as number | undefined
  if (tier === 1) return 5
  if (typeof tier === 'number' && tier >= 2) return 10
  return 0
}

// ── Dorm Wars: cycle recruits (Phase 7-03) ────────────────────────────────
/**
 * Count of inviter's referrals that converted to paid since the given
 * subscription's start_date. Shared source-of-truth between the Layer 2
 * awarder (src/lib/dorm-wars/awarder.ts) and the dorm-wars hub
 * (src/app/dashboard/dorm-wars/page.tsx) per RESEARCH Decision #10.
 *
 * Accepts a caller-supplied Supabase client so it can run from the awarder
 * (admin/service-role client) or the hub RSC (server SSR client) without
 * instantiating its own. NOT wrapped in `cache()` — the awarder uses an
 * admin client that bypasses RLS, and `cache()` would key on the function
 * call site rather than the client identity, which would let the wrong
 * call see the wrong rows. Same reasoning as `getRedeemableCredit` above.
 *
 * Typed as `SupabaseClient<any, any, any>` rather than the bare
 * `SupabaseClient` so it accepts BOTH the SSR client (untyped schema) AND
 * the bare admin client from supabase-js (which returns
 * `SupabaseClient<any, "public", "public", any, any>` — not assignable to
 * the bare form because schema=`"public"` is wider than `never`).
 */
export async function getCycleRecruits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  customerId: string,
  subscriptionId: string,
): Promise<number> {
  const { data: sub } = await sb
    .from('subscriptions')
    .select('start_date')
    .eq('id', subscriptionId)
    .maybeSingle()
  if (!sub) return 0

  const { count } = await sb
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('inviter_user_id', customerId)
    .eq('status', 'converted')
    .gte('converted_at', sub.start_date)
  return count ?? 0
}

// ── Dorm Wars: Daily Drop + Streak SSR getters (Phase 7-05) ───────────────
// Use the service-role admin client (not the SSR/RLS-bound client).
// Originally these took a caller-supplied SSR client and relied on the
// `customer_id = auth.uid()` RLS policy, but in practice the SSR client's
// auth context was returning null for these tables in the dorm-wars RSC page
// — the row exists, but SELECT comes back empty under RLS, so the hub keeps
// rendering "tap to claim" even after a successful claim. Switching to the
// admin client side-steps the broken RLS resolution. Security is unchanged:
// the customerId comes from `getUserFromHeaders()` which middleware sets
// from the verified session — callers cannot pass an arbitrary id.

import { createClient as createAdminClient } from '@supabase/supabase-js'

function rewardsAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Read the customer's most recent Daily Drop, scoped to the 20-hour cooldown
 * window. Returns null if the cooldown has fully elapsed (user can claim
 * again). Used to seed the hub's "claimed today" tile + modal state.
 *
 * Cooldown semantics match the POST endpoint at
 * src/app/api/dorm-wars/daily-drop/route.ts — both must agree so a UAE user
 * doesn't see "tap to claim" on the hub then hit "already claimed" on the
 * server when they tap.
 *
 * Used by:
 *   • src/app/dashboard/dorm-wars/page.tsx — pass initialDailyDrop prop to HubClient
 */
export async function getDailyDropToday(
  customerId: string,
): Promise<{ value_aed: number; rng_bucket: 'common' | 'rare' | 'epic' } | null> {
  const COOLDOWN_HOURS = 20
  const { data } = await rewardsAdmin()
    .from('daily_drops')
    .select('value_aed, rng_bucket, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const elapsedHours =
    (Date.now() - new Date(data.created_at).getTime()) / 3_600_000
  if (elapsedHours >= COOLDOWN_HOURS) return null
  return {
    value_aed:  Number(data.value_aed),
    rng_bucket: data.rng_bucket as 'common' | 'rare' | 'epic',
  }
}

/**
 * Read the customer's current streak count (SSR initial render).
 * Returns 0 if no streak row exists yet — first hub visit ever.
 *
 * Used by:
 *   • src/app/dashboard/dorm-wars/page.tsx — pass initialStreak prop to HubClient
 */
export async function getStreak(customerId: string): Promise<number> {
  const { data } = await rewardsAdmin()
    .from('streaks')
    .select('count')
    .eq('customer_id', customerId)
    .maybeSingle()
  return data ? Number(data.count) : 0
}

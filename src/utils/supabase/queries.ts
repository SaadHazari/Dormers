import { cache } from 'react'
import { createClient } from './server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/lib/subscription-status'
import type { SupabaseClient } from '@supabase/supabase-js'

// Service-role helper for queries that need to bypass RLS (cross-dorm reads).
// TODO Phase 11: deduplicate with the same helper in
// contexts/dorm-wars/domain/repo.ts — both should import from
// infra/supabase/admin-client.
function rewardsAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

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

export interface ReferralData {
  total:         number   // gift_claimed + converted (all sent referrals that got a meal)
  converted:     number   // invitees who became paying subscribers
  creditBalance: number   // sum of APPROVED credits in AED (spendable at checkout)
  creditPending: number   // Phase 8K Model C — sum of PENDING credits (locked, at risk)
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
      // Pull both statuses; partition below. Pending must NOT count
      // toward the spendable wallet — the user can't apply locked money
      // to a checkout.
      supabase
        .from('credits')
        .select('amount_aed, status')
        .eq('customer_id', userId)
        .in('status', ['approved', 'pending']),
    ])
    let creditBalance = 0
    let creditPending = 0
    for (const row of (creditRes.data ?? [])) {
      const amt = Number(row.amount_aed)
      if (row.status === 'approved') creditBalance += amt
      else if (row.status === 'pending') creditPending += amt
    }
    return {
      total:         totalRes.count     ?? 0,
      converted:     convertedRes.count ?? 0,
      creditBalance,
      creditPending,
    }
  } catch {
    return { total: 0, converted: 0, creditBalance: 0, creditPending: 0 }
  }
})

// Keep old export name as a thin wrapper so any external callers aren't broken.
export const getReferralCount = cache(async (userId: string): Promise<number> => {
  const data = await getReferralData(userId)
  return data.total
})

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

// Phase 8C — Cross-dorm activity feed. The Happening Now feed used to be
// scoped to the user's own dorm; users with empty dorms saw "no recent
// activity" forever. Cross-dorm makes the feed feel alive everywhere and
// surfaces GOATs (hall_wall === true) so their status reads as rare
// social proof for other users.
export interface CrossDormRecentSub {
  firstName: string
  dormName:  string
  planName:  string
  createdAt: string
  isElite:   boolean
}

export const getCrossDormRecent = cache(async (limit = 8): Promise<CrossDormRecentSub[]> => {
  // Service-role read — we expose firstName + dormName + hall_wall only
  // (no email / phone / id), which is the same shape getDormStats already
  // surfaces inside a single dorm. RLS on customers blocks cross-dorm reads
  // for the SSR client, so the admin client is required here.
  const sb = rewardsAdmin()
  try {
    const { data: subs } = await sb
      .from('subscriptions')
      .select('customer_id, plan_name, created_at')
      .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED])
      .order('created_at', { ascending: false })
      .limit(60) // overfetch — dedupe by customer can drop a lot

    const rows = subs ?? []
    if (rows.length === 0) return []

    // Dedupe by customer — each customer counts once toward the feed,
    // and only their newest live sub appears.
    const seen = new Set<string>()
    const deduped: typeof rows = []
    for (const s of rows) {
      if (!seen.has(s.customer_id)) {
        seen.add(s.customer_id)
        deduped.push(s)
      }
    }

    const customerIds = deduped.slice(0, limit).map(s => s.customer_id)
    const { data: customers } = await sb
      .from('customers')
      .select('id, name, dorm_name, hall_wall')
      .in('id', customerIds)

    type CRow = { id: string; name: string | null; dorm_name: string | null; hall_wall: boolean | null }
    const cMap = new Map<string, CRow>((customers ?? []).map((c) => [c.id as string, c as CRow]))

    return deduped.slice(0, limit).map(s => {
      const c = cMap.get(s.customer_id)
      const first = ((c?.name ?? '').split(' ')[0]) || 'Someone'
      const dorm  = (c?.dorm_name ?? '').trim() || 'a dorm'
      return {
        firstName: first,
        dormName:  dorm,
        planName:  (s.plan_name ?? '').replace(/\p{Emoji}/gu, '').trim() || 'a plan',
        createdAt: s.created_at,
        isElite:   Boolean(c?.hall_wall),
      }
    })
  } catch {
    return []
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

// ── Dorm Wars queries — moved to contexts/dorm-wars/domain/repo.ts ────────
// Re-exported as a compatibility shim during the layered refactor.
// New consumers should import directly from @/contexts/dorm-wars/domain/repo.
// Shim removed in Phase 11 cleanup.
export {
  getActiveLifetimeTierPercent,
  getCycleRecruits,
  getCycleChainStart,
  getCycleChainSubIds,
  getStreakChestState,
  getRecentRewardEvents,
  getStreak,
  type StreakChestBucket,
  type ActiveDoubler,
  type StreakChestState,
  type RewardEvent,
} from '@/contexts/dorm-wars/domain/repo'

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
// surfaces Elite Dormers (hall_wall === true) so their status reads as
// rare social proof for other users.
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

// Phase 8E — Streak Chest replaces Daily Drop. The chest unlocks every 8
// unbroken streak days; breaking the streak resets chest progress to 0.
// See migration phase_8e_streak_chest_replaces_daily_drop.
export type StreakChestBucket = 'cash_5_8' | 'cash_8_10' | 'cash_10_12' | 'doubler'

// Phase 8F — week-long doubler state. Non-null when the customer has an
// unexpired doubler chest outcome. The hub uses this to render a "2×
// rewards active · Nd left" banner so the user feels the chest paying off.
export interface ActiveDoubler {
  expiresAt:   string  // ISO timestamp
  msRemaining: number  // ms until expiry at fetch-time
}

export interface StreakChestState {
  count:         number                              // streak.count
  lastChestDay:  number                              // streak.last_chest_day
  chestReady:    boolean                             // count - lastChestDay >= 8
  daysUntilNext: number                              // 8 - (count - lastChestDay), >= 0
  recentChest:   {                                   // most recent claim, for "you just got" UI
    rng_bucket:         StreakChestBucket
    value_aed:          number | null                // null for doubler
    claimed_at:         string
    doubler_expires_at: string | null
    streak_day:         number
  } | null
  activeDoubler: ActiveDoubler | null                // Phase 8F — non-null when an unexpired doubler is in effect
}

/**
 * Fetch the customer's streak + chest state in a single round-trip pair.
 * Both reads use the admin client for the same reason getStreak does
 * (SSR-RLS-readback drift for these tables). The recent-chest read pulls
 * the single newest row regardless of cooldown — the UI uses claimed_at
 * to decide whether to render a celebration.
 *
 * Used by:
 *   • src/app/dashboard/dorm-wars/page.tsx — initialChestState prop
 */
export async function getStreakChestState(
  customerId: string,
): Promise<StreakChestState> {
  const sb = rewardsAdmin()

  const [streakRow, chestRow] = await Promise.all([
    sb.from('streaks')
      .select('count, last_chest_day')
      .eq('customer_id', customerId)
      .maybeSingle(),
    sb.from('streak_chests')
      .select('rng_bucket, value_aed, claimed_at, doubler_expires_at, streak_day')
      .eq('customer_id', customerId)
      .order('claimed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const count = streakRow.data ? Number(streakRow.data.count) : 0
  const lastChestDay = streakRow.data ? Number(streakRow.data.last_chest_day) : 0
  const gap = Math.max(0, count - lastChestDay)
  const chestReady = gap >= 8
  const daysUntilNext = chestReady ? 0 : Math.max(0, 8 - gap)

  // Phase 8F — derive active-doubler state from the latest doubler chest.
  // The chest-row read above only returns the single most recent chest of
  // ANY bucket; if that one isn't a doubler we need to query specifically.
  // Most users won't have a doubler at all, so a small extra read is fine.
  let activeDoubler: ActiveDoubler | null = null
  const { data: latestDoubler } = await sb
    .from('streak_chests')
    .select('doubler_expires_at')
    .eq('customer_id', customerId)
    .eq('rng_bucket', 'doubler')
    .order('claimed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestDoubler?.doubler_expires_at) {
    const expiryMs = new Date(latestDoubler.doubler_expires_at as string).getTime()
    const msRemaining = expiryMs - Date.now()
    if (msRemaining > 0) {
      activeDoubler = { expiresAt: latestDoubler.doubler_expires_at as string, msRemaining }
    }
  }

  return {
    count,
    lastChestDay,
    chestReady,
    daysUntilNext,
    recentChest: chestRow.data
      ? {
          rng_bucket:         chestRow.data.rng_bucket as StreakChestBucket,
          value_aed:          chestRow.data.value_aed === null ? null : Number(chestRow.data.value_aed),
          claimed_at:         chestRow.data.claimed_at as string,
          doubler_expires_at: (chestRow.data.doubler_expires_at as string | null) ?? null,
          streak_day:         Number(chestRow.data.streak_day),
        }
      : null,
    activeDoubler,
  }
}

/**
 * Read the customer's most recent "reward" events for the celebration banner
 * at the top of the Dorm Wars hub. Joins credits → referrals so we can show
 * the invitee's first name on conversion credits.
 *
 * Returns up to `limit` events sorted newest-first. Each row is a credit
 * insert that the user should be celebrated for: a friend converting,
 * a cycle milestone firing, or a lifetime tier unlocking.
 *
 * Source-prefix matching mirrors the awarder's source string conventions:
 *   • 'referral_conversion'      → Layer 1 cash on friend conversion
 *   • 'cycle_milestone_*'        → Layer 2 cycle bonus
 *   • 'tier_4_meals'             → Layer 3 tier 4 jackpot
 *   • 'daily_drop'               → excluded (not a referral-driven event)
 */
export interface RewardEvent {
  id:           string
  amount_aed:   number
  source:       string
  created_at:   string
  invitee_name: string | null   // populated only for referral_conversion source
}
export async function getRecentRewardEvents(
  customerId: string,
  limit = 5,
): Promise<RewardEvent[]> {
  const sb = rewardsAdmin()
  const { data } = await sb
    .from('credits')
    .select('id, amount_aed, source, created_at, referral_id, referrals(invitee_first_name)')
    .eq('customer_id', customerId)
    .in('status', ['approved', 'applied'])
    // Source prefix filter — anything reward-driven, no daily drops.
    .or('source.like.referral_conversion%,source.like.cycle_milestone_%,source.like.tier_%')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(r => {
    // PostgREST returns the joined row as an object or array depending on FK
    // direction; we treat both shapes defensively.
    const ref = (r.referrals ?? null) as { invitee_first_name?: string | null } | { invitee_first_name?: string | null }[] | null
    const inviteeName = Array.isArray(ref)
      ? ref[0]?.invitee_first_name ?? null
      : ref?.invitee_first_name ?? null
    return {
      id:           r.id as string,
      amount_aed:   Number(r.amount_aed),
      source:       r.source as string,
      created_at:   r.created_at as string,
      invitee_name: inviteeName,
    }
  })
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

/**
 * Dorm Wars context repository — Supabase reads for streaks, chests, doubler
 * state, lifetime tiers, and cycle-chain math.
 *
 * Extracted from src/utils/supabase/queries.ts in Phase 3 of the layered
 * refactor. The interface (function signatures + types) is stable; the
 * implementation uses the Supabase admin client for the same RLS readback
 * reason `getStreak` did. See queries.ts comment in the original (Phase 7-05).
 *
 * See .planning/refactor/L1-BOUNDARIES.md (dorm-wars context) and
 * .planning/refactor/L2-MODULE-SHAPES.md (#5 Dorm Wars — queries absorbed
 * from the global queries.ts god-file).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient as rewardsAdmin } from '@/infra/supabase/admin-client'

// Use the service-role admin client (not the SSR/RLS-bound client).
// Originally these took a caller-supplied SSR client and relied on the
// `customer_id = auth.uid()` RLS policy, but in practice the SSR client's
// auth context was returning null for these tables in the dorm-wars RSC page
// — the row exists, but SELECT comes back empty under RLS, so the hub keeps
// rendering "tap to claim" even after a successful claim. Switching to the
// admin client side-steps the broken RLS resolution. Security is unchanged:
// the customerId comes from `getUserFromHeaders()` which middleware sets
// from the verified session — callers cannot pass an arbitrary id.

/**
 * Customer's active lifetime tier percent — the highest tier they hold.
 *   tier 0 (none) → 0%
 *   tier 1        → 5%   (10 lifetime conversions)
 *   tier 2,3,4    → 10%  (25+ lifetime conversions)
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
 * awarder (src/contexts/dorm-wars/domain/awarder.ts) and the dorm-wars hub
 * (src/app/dashboard/dorm-wars/page.tsx) per RESEARCH Decision #10.
 *
 * Accepts a caller-supplied Supabase client so it can run from the awarder
 * (admin/service-role client) or the hub RSC (server SSR client) without
 * instantiating its own. NOT wrapped in `cache()` — the awarder uses an
 * admin client that bypasses RLS, and `cache()` would key on the function
 * call site rather than the client identity, which would let the wrong
 * call see the wrong rows. Same reasoning as `getRedeemableCredit`.
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
  // Phase 8J — count from the chain start, not the current sub start.
  // A cancel-then-resub-within-30-days is treated as a continuous cycle
  // (anti-gaming: user can't reset milestone progress by cancelling).
  const chainStart = await getCycleChainStart(sb, customerId, subscriptionId)
  if (!chainStart) return 0

  const { count } = await sb
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('inviter_user_id', customerId)
    .eq('status', 'converted')
    .gte('converted_at', chainStart)
  return count ?? 0
}

/**
 * Phase 8J — walk back through subscriptions to find the effective "cycle
 * window start" for the given sub. A re-subscription created within 30
 * days of the previous sub's end_date is treated as a continuation of
 * that previous cycle (which itself may chain backward further).
 *
 * The walk terminates the first time a previous sub doesn't exist OR
 * ended more than 30 days before the current chain's earliest start.
 * Returns the earliest sub's start_date in the chain.
 *
 * Anti-gaming intent: without this, cancelling mid-cycle + re-subbing
 * resets cycle_recruits to 0, letting users farm milestone 3 (Mystery
 * Cash Drop) by repeatedly cancelling and re-subbing. With the chain
 * window, cycle_recruits and cycle_rewards both span the continuous
 * window — milestones can only be earned once per chain.
 */
export async function getCycleChainStart(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  customerId: string,
  subscriptionId: string,
): Promise<string | null> {
  const { data: current } = await sb
    .from('subscriptions')
    .select('start_date')
    .eq('id', subscriptionId)
    .maybeSingle()
  if (!current?.start_date) return null

  let earliestStart = current.start_date as string

  // Walk back up to 12 hops max (defense-in-depth against ever forming a
  // cycle via bad data; in practice a chain rarely exceeds 2-3 links).
  for (let hop = 0; hop < 12; hop++) {
    const cutoffMs = new Date(earliestStart).getTime() - 30 * 86_400_000
    const cutoffIso = new Date(cutoffMs).toISOString()

    const { data: prev } = await sb
      .from('subscriptions')
      .select('start_date, end_date')
      .eq('customer_id', customerId)
      .lt('end_date', earliestStart)
      .gte('end_date', cutoffIso)
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!prev?.start_date) break
    earliestStart = prev.start_date as string
  }

  return earliestStart
}

/**
 * Phase 8J — list every subscription id in the continuous chain (used by
 * the awarder to dedupe cycle_rewards across the chain). Includes the
 * starting sub itself.
 */
export async function getCycleChainSubIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  customerId: string,
  subscriptionId: string,
): Promise<string[]> {
  const chainStart = await getCycleChainStart(sb, customerId, subscriptionId)
  if (!chainStart) return [subscriptionId]

  const { data: subs } = await sb
    .from('subscriptions')
    .select('id')
    .eq('customer_id', customerId)
    .gte('start_date', chainStart)

  const ids = ((subs ?? []) as { id: string }[]).map(s => s.id)
  // Always include the caller's sub even if a transient read misses it.
  if (!ids.includes(subscriptionId)) ids.push(subscriptionId)
  return ids
}

// ── Dorm Wars: Daily Drop + Streak SSR getters (Phase 7-05) ───────────────

// Phase 8M — Streak Chest cadence shortened from 8 to 7 days so the
// visual cycle is a clean 28 days (4 weeks × 7). Doubler bucket
// restricted to chests 3 & 4 of the cycle inside claim_streak_chest;
// chests 1 & 2 fold the doubler probability into cash_10_12. See migration
// phase_8m_streak_chest_7day_cadence_doubler_last_two.
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
  chestReady:    boolean                             // count - lastChestDay >= 7
  daysUntilNext: number                              // 7 - (count - lastChestDay), >= 0
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
  const chestReady = gap >= 7
  const daysUntilNext = chestReady ? 0 : Math.max(0, 7 - gap)

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
  // Phase 8K — wallet history shows BOTH active and pending credits, with
  // a "Pending" pill on at-risk rows. 'approved'/'applied' = landed in
  // wallet; 'pending' = locked (weekly review pool, threshold not met yet).
  status:       'approved' | 'applied' | 'pending'
}
export async function getRecentRewardEvents(
  customerId: string,
  limit = 5,
): Promise<RewardEvent[]> {
  const sb = rewardsAdmin()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Two parallel reads: credits-based events (the bulk) + tier 3 lifetime
  // unlocks (which DON'T have a credit row because the jacket is physical
  // merch, not AED). Both feed the same celebration banner pipeline.
  const [creditsRes, tier3Res] = await Promise.all([
    sb
      .from('credits')
      .select('id, amount_aed, source, status, created_at, referral_id, referrals(invitee_first_name)')
      .eq('customer_id', customerId)
      // Include 'pending' alongside approved/applied — the wallet modal
      // now surfaces pending review credits with a status pill so users
      // see the all-or-nothing pool building up. Excludes 'rejected' (no
      // value to the user) and 'reserved' (transient mid-checkout state).
      .in('status', ['approved', 'applied', 'pending'])
      // Source prefix filter — anything reward-driven, no daily drops.
      .or('source.like.referral_conversion%,source.like.cycle_milestone_%,source.like.tier_%,source.like.layer4_%')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(limit),
    // Phase 8I — synthesize a celebration event for tier 3 jacket unlocks.
    // There's no credits row for tier 3 (jacket is physical, no AED), so
    // we read lifetime_rewards directly and inject a pseudo-event with
    // source='tier_3_jacket'. The hub's celebrationCopy renders the
    // "we'll WhatsApp you" message off that source string.
    sb
      .from('lifetime_rewards')
      .select('id, awarded_at')
      .eq('customer_id', customerId)
      .eq('tier', 3)
      .gte('awarded_at', thirtyDaysAgo)
      .maybeSingle(),
  ])

  const events: RewardEvent[] = (creditsRes.data ?? []).map(r => {
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
      status:       r.status as 'approved' | 'applied' | 'pending',
    }
  })

  if (tier3Res.data) {
    // Prefix the id with 'tier3:' so the hub's "have I already celebrated
    // this event?" localStorage marker doesn't collide with credits.id UUIDs.
    events.push({
      id:           `tier3:${tier3Res.data.id as string}`,
      amount_aed:   0,                                // not displayed; jacket is physical
      source:       'tier_3_jacket',
      created_at:   tier3Res.data.awarded_at as string,
      invitee_name: null,
      status:       'approved',                       // physical fulfilment, but treated as a completed event
    })
  }

  // Sort merged set by created_at desc + trim to limit (in case tier 3
  // pushed us over).
  events.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return events.slice(0, limit)
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

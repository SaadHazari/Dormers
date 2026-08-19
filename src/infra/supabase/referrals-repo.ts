/**
 * Referrals context repository — Supabase reads for the user's referral data,
 * recent invites, and cross-dorm activity feed.
 *
 * Extracted from src/utils/supabase/queries.ts in Phase 6 of the layered
 * refactor. The function signatures + types match the original exactly so
 * existing consumers keep working via the queries.ts shim.
 *
 * Note: getCrossDormRecent uses LIVE_SUBSCRIPTION_STATUSES + SUBSCRIPTION_STATUS
 * from @/contexts/subscriptions/domain/subscription-status — this is a cross-context import that Phase 8
 * resolves when subscription statuses move into the subscriptions context.
 *
 */

import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'
import { createAdminSupabaseClient as rewardsAdmin } from '@/infra/supabase/admin-client'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { countsAsGameEarnings } from '@/shared/credit-ledger'

export interface ReferralData {
  total:         number   // gift_claimed + converted (all sent referrals that got a meal)
  converted:     number   // invitees who became paying subscribers
  /** Sum of APPROVED credits the customer EARNED (referral + Dorm Wars
   *  payouts, in AED). Season pause credit and admin grants are excluded —
   *  this number feeds the Refer & Earn badge and the Dorm Wars hub wallet,
   *  and money the customer didn't win must never dress up as winnings.
   *  The full spendable picture lives in the credit chip / Plan & billing. */
  creditBalance: number
  creditPending: number   // Phase 8K Model C — sum of PENDING earned credits (locked, at risk)
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
        .select('amount_aed, status, source')
        .eq('customer_id', userId)
        .in('status', ['approved', 'pending']),
    ])
    let creditBalance = 0
    let creditPending = 0
    for (const row of (creditRes.data ?? [])) {
      // Earned money only — a season pause credit or admin grant showing up
      // under the Refer & Earn headline reads as referral winnings, which it
      // is not. See countsAsGameEarnings for the null-source legacy rule.
      if (!countsAsGameEarnings(row.source)) continue
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
  // 'ineligible_existing_customer' — an attempt by someone who already had
  // a live Dormers subscription. Surfaced in the squad as an off-ladder
  // "Already with us" card; explicitly excluded from the milestone/tier
  // counts above (getReferralData filters those on 'gift_claimed' + 'converted').
  status:         'gift_claimed' | 'converted' | 'ineligible_existing_customer'
  claimedAt:      string
  convertedAt:    string | null
  // Phase 2 scout-delivery wiring — the invitee's Welcome Meal subscription
  // state, joined when status='gift_claimed' so the scout journey reflects
  // REAL delivery (delivered_meals + trial-window end) instead of guessing
  // from claim age. null when there's no linked welcome sub (legacy rows).
  welcomeDeliveredMeals: number | null
  welcomeSubStatus:      string | null
  welcomeEndDate:        string | null
}

export const getRecentInvites = cache(async (userId: string, limit = 10): Promise<InviteRow[]> => {
  const supabase = await createClient()
  try {
    const { data } = await supabase
      .from('referrals')
      .select('id, invitee_first_name, invitee_user_id, status, gift_claimed_at, converted_at')
      .eq('inviter_user_id', userId)
      .in('status', ['gift_claimed', 'converted', 'ineligible_existing_customer'])
      .order('gift_claimed_at', { ascending: false })
      .limit(limit)

    const rows = data ?? []

    // Join each still-claiming invitee's Welcome Meal subscription so the
    // scout journey can reflect REAL delivery state instead of guessing from
    // claim age. Only gift_claimed rows need it (converted / ineligible
    // stages are terminal). The invitee's sub isn't readable by the inviter
    // under RLS, so this cross-user read uses the admin client — we expose
    // only delivered_meals / status / end_date, all of which the inviter
    // already sees for these friends in their squad.
    const inviteeIds = rows
      .filter(r => r.status === 'gift_claimed' && r.invitee_user_id)
      .map(r => r.invitee_user_id as string)

    const welcomeByInvitee = new Map<
      string,
      { delivered: number; status: string; endDate: string | null }
    >()
    if (inviteeIds.length > 0) {
      const sbAdmin = rewardsAdmin()
      const { data: welcomeSubs } = await sbAdmin
        .from('subscriptions')
        .select('customer_id, status, delivered_meals, end_date')
        .in('customer_id', inviteeIds)
        .eq('plan_name', 'Welcome Meal')
      for (const s of welcomeSubs ?? []) {
        // One welcome meal per customer — keep the first seen.
        if (!welcomeByInvitee.has(s.customer_id as string)) {
          welcomeByInvitee.set(s.customer_id as string, {
            delivered: Number(s.delivered_meals ?? 0),
            status:    (s.status as string | null) ?? '',
            endDate:   (s.end_date as string | null) ?? null,
          })
        }
      }
    }

    return rows.map(r => {
      const welcome = r.invitee_user_id
        ? welcomeByInvitee.get(r.invitee_user_id as string)
        : undefined
      return {
        id:                    r.id,
        firstName:             r.invitee_first_name?.trim() || 'Friend',
        status:                r.status as InviteRow['status'],
        claimedAt:             r.gift_claimed_at,
        convertedAt:           r.converted_at,
        welcomeDeliveredMeals: welcome ? welcome.delivered : null,
        welcomeSubStatus:      welcome ? welcome.status : null,
        welcomeEndDate:        welcome ? welcome.endDate : null,
      }
    })
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

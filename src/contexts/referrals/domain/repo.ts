/**
 * Referrals context repository — Supabase reads for the user's referral data,
 * recent invites, and cross-dorm activity feed.
 *
 * Extracted from src/utils/supabase/queries.ts in Phase 6 of the layered
 * refactor. The function signatures + types match the original exactly so
 * existing consumers keep working via the queries.ts shim.
 *
 * Note: getCrossDormRecent uses LIVE_SUBSCRIPTION_STATUSES + SUBSCRIPTION_STATUS
 * from @/lib/subscription-status — this is a cross-context import that Phase 8
 * resolves when subscription statuses move into the subscriptions context.
 *
 * TODO Phase 11: deduplicate rewardsAdmin() helper (also defined in
 * queries.ts and dorm-wars/repo.ts) — consolidate to infra/supabase/.
 */

import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/lib/subscription-status'

function rewardsAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

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

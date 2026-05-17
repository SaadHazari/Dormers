import { getUserFromHeaders } from '@/utils/supabase/auth'
import {
  getCustomer,
  getReferralData,
  getDormStats,
  getRecentInvites,
  getActiveSubscription,
  getDailyDropToday,
  getStreak,
  getCycleRecruits,
  getRecentRewardEvents,
} from '@/utils/supabase/queries'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import HubClient from './hub/HubClient'

export const metadata = { title: 'Dorm Wars — Dormers' }

// Skip the Router Cache so the wallet / streak / drop status reflect the
// latest state after a checkout-success redirect. Without this, Next.js may
// serve a cached snapshot for up to 30s and the user sees stale numbers.
export const dynamic = 'force-dynamic'

export default async function DormWarsPage() {
  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  // SSR Supabase client — RLS on `daily_drops`, `streaks`, and
  // `lifetime_rewards` lets the user read their own rows
  // (auth.uid() = customer_id), so we use the SSR client (not the admin
  // client) for these initial-state fetches.
  const supabase = await createClient()

  // Six independent reads happen in parallel; dormStats then waits on
  // customer.dorm_name (we need the dorm before we can ask about it),
  // and cycleRecruits waits on activeSubscription (needs its start_date).
  const [
    customer,
    referralData,
    invites,
    activeSubscription,
    initialDailyDrop,
    initialStreak,
    recentRewards,
  ] = await Promise.all([
    getCustomer(user.id),
    getReferralData(user.id),
    getRecentInvites(user.id),
    getActiveSubscription(user.id),
    getDailyDropToday(user.id),
    getStreak(user.id),
    // Reward events (referral conversion / cycle milestone / lifetime tier)
    // power the celebratory banner at the top of HubClient when a friend
    // converts. HubClient compares the newest event's id against a
    // localStorage marker to decide whether to celebrate or stay quiet.
    getRecentRewardEvents(user.id, 5),
  ])

  // ── Server-canonical reward state (RESEARCH Decision #10 + Pitfall #3) ──
  // cycleRecruits MUST be sourced from the same SQL the Layer 2 awarder reads
  // (getCycleRecruits) — otherwise the hub UI and the awarder can drift and
  // a milestone may render as "earned" in the hub before the awarder fires
  // (or vice versa). Parallelize the remaining reads.
  // Audit FIX 15: also fetch the tier-2 / tier-4 side-effect flags so the
  // hub renders the perks (Early Access, Hall of Fame) the awarder promised.
  const [dormStats, cycleRecruits, latestTierRow, perkFlagsRow] = await Promise.all([
    getDormStats(customer?.dorm_name ?? ''),
    activeSubscription
      ? getCycleRecruits(supabase, user.id, activeSubscription.id)
      : Promise.resolve(0),
    supabase
      .from('lifetime_rewards')
      .select('tier')
      .eq('customer_id', user.id)
      .order('tier', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('customers')
      .select('early_access, hall_wall')
      .eq('id', user.id)
      .maybeSingle(),
  ])

  // Highest tier the user has unlocked (null → 0).
  const tierRaw = (latestTierRow.data?.tier ?? 0) as number
  const lifetimeTier: 0 | 1 | 2 | 3 | 4 =
    tierRaw === 1 || tierRaw === 2 || tierRaw === 3 || tierRaw === 4
      ? tierRaw
      : 0

  return (
    <HubClient
      customerCid={customer?.cid ?? ''}
      customerName={customer?.name ?? ''}
      customerDorm={customer?.dorm_name ?? ''}
      referralData={referralData}
      dormStats={dormStats}
      invites={invites}
      activeSubscription={activeSubscription}
      initialStreak={initialStreak}
      initialDailyDrop={initialDailyDrop}
      cycleRecruits={cycleRecruits}
      lifetimeTier={lifetimeTier}
      earlyAccess={Boolean(perkFlagsRow.data?.early_access)}
      hallWall={Boolean(perkFlagsRow.data?.hall_wall)}
      recentRewards={recentRewards}
    />
  )
}

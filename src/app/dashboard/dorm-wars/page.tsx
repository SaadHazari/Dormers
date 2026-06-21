import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription } from '@/infra/supabase/subscriptions-repo'
import { getReferralData, getCrossDormRecent, getRecentInvites } from '@/infra/supabase/referrals-repo'
import {
  getStreakChestState,
  getStreak,
  getCycleRecruits,
  getRecentRewardEvents,
} from '@/infra/supabase/dorm-wars-repo'
import { createClient } from '@/utils/supabase/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { redirect } from 'next/navigation'
import HubClient from './hub/HubClient'
import { resolvePlan } from '@/contexts/subscriptions/domain/plans'
import { resolveMealPriceContext } from '@/contexts/dorm-wars/domain/meal-pricing'
import { fetchActivePriceOverrides } from '@/infra/supabase/pricing-repo'
import { maybeFireAnniversary, getLayer4Rewards } from '@/contexts/dorm-wars/domain/layer4'
import { getWeeklyReviewState } from '@/utils/supabase/weekly-review-queries'
import { getMonthlyReviewWindow } from '@/utils/supabase/monthly-review-queries'

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

  // Eight independent reads happen in parallel. cycleRecruits waits on
  // activeSubscription (needs its start_date).
  const [
    customer,
    referralData,
    invites,
    activeSubscription,
    initialChestState,
    initialStreak,
    recentRewards,
    crossDormRecent,
  ] = await Promise.all([
    getCustomer(user.id),
    getReferralData(user.id),
    getRecentInvites(user.id),
    getActiveSubscription(user.id),
    // Phase 8E — Streak Chest replaces Daily Drop. State includes streak
    // count + chest cooldown (last_chest_day) + the most recent claim row
    // so the hub can render "your chest is ready" or "you just opened…".
    getStreakChestState(user.id),
    getStreak(user.id),
    // Reward events (referral conversion / cycle milestone / lifetime tier)
    // power both the celebratory banner at the top of HubClient when a
    // friend converts AND the Wallet History modal listing past credits.
    // 20 keeps the modal useful without a separate fetch round-trip.
    getRecentRewardEvents(user.id, 20),
    // Phase 8C — cross-dorm "Happening Now" feed. Used to be scoped to
    // the user's own dorm only; empty-dorm users saw "no recent activity"
    // forever. Cross-dorm keeps the feed alive everywhere AND surfaces
    // GOATs (hall_wall === true) as rare social proof.
    getCrossDormRecent(8),
  ])

  // ── Server-canonical reward state (RESEARCH Decision #10 + Pitfall #3) ──
  // cycleRecruits MUST be sourced from the same SQL the Layer 2 awarder reads
  // (getCycleRecruits) — otherwise the hub UI and the awarder can drift and
  // a milestone may render as "earned" in the hub before the awarder fires
  // (or vice versa). Parallelize the remaining reads.
  // Audit FIX 15: also fetch the tier-2 / tier-4 side-effect flags so the
  // hub renders the perks (Early Access, GOAT badge) the awarder promised.
  // The raw lifetime-tier number isn't fetched — the hub derives tier
  // progress from the converted count and reads the actual unlocked perks
  // from these flags + the checkout discount, so a tier int would be dead.
  const [cycleRecruits, perkFlagsRow] = await Promise.all([
    activeSubscription
      ? getCycleRecruits(supabase, user.id, activeSubscription.id)
      : Promise.resolve(0),
    supabase
      .from('customers')
      .select('early_access, hall_wall')
      .eq('id', user.id)
      .maybeSingle(),
  ])

  // Phase 8B — Premium+ gate. Only Monthly Premium and Monthly Max can
  // earn Dorm Wars rewards. Weekly Flex, Trial, and no-active-sub customers
  // see the hub blurred underneath a full-screen upsell overlay. The hub
  // still SSRs so the user can see what they're missing through the blur.
  const planId = resolvePlan(activeSubscription?.plan_name)?.id ?? null
  const dormWarsEligible = planId === 'monthly-premium' || planId === 'monthly-max'

  // Phase 8D — meal-pricing context for the rewards display. Uses the SAME
  // resolver the awarder calls at fire-time, so what the user sees ("Free
  // Week → ~AED 132") matches what eventually lands in their wallet. For
  // ineligible users the context resolves via the fallback path (most
  // recent Premium+ sub OR Monthly Premium NonVeg defaults) — fine, the
  // hub is blurred under the upsell overlay anyway.
  const mealPriceContext = await resolveMealPriceContext(
    supabase,
    user.id,
    activeSubscription?.id ?? null,
    await fetchActivePriceOverrides(),
  )

  // Phase 8G — Layer 4 side rewards. Anniversary auto-fires on hub load
  // when the customer is >= 365 days old and hasn't claimed for that year
  // (insert + credit happen inside the helper, idempotent via UNIQUE).
  // Then we fetch the full layer4 ledger to drive per-kind status in the
  // Side Rewards column.
  const adminClient = createAdminSupabaseClient()
  await maybeFireAnniversary(adminClient, user.id).catch((err) => {
    // Anniversary fire-and-forget — never block hub load on it. The next
    // hub visit retries idempotently if this one failed.
    console.error('maybeFireAnniversary failed:', err)
  })

  // Phase 8K Model C — review-credit cleanup moved up to the dashboard
  // layout (Phase 8P) so users who never visit this hub still get their
  // stranded pending credits resolved. No need to duplicate the call
  // here; the layout fires before this page renders.

  const layer4Rewards = await getLayer4Rewards(adminClient, user.id)

  // Phase 8K wiring — review state for the Side Rewards column. The two
  // surveys (weekly + monthly wrap) deposit credits directly when submitted
  // via /menu, but the Dorm Wars side-quest still needs the progress data
  // to render "3 of 4 · AED 18 earned" instead of "Coming soon".
  const [weeklyReviewState, monthlyReviewWindow] = await Promise.all([
    getWeeklyReviewState(user.id),
    getMonthlyReviewWindow(user.id),
  ])

  return (
    <HubClient
      customerCid={customer?.cid ?? ''}
      customerName={customer?.name ?? ''}
      customerDorm={customer?.dorm_name ?? ''}
      referralData={referralData}
      invites={invites}
      activeSubscription={activeSubscription}
      initialStreak={initialStreak}
      initialChestState={initialChestState}
      cycleRecruits={cycleRecruits}
      earlyAccess={Boolean(perkFlagsRow.data?.early_access)}
      hallWall={Boolean(perkFlagsRow.data?.hall_wall)}
      recentRewards={recentRewards}
      dormWarsEligible={dormWarsEligible}
      currentPlanId={planId}
      crossDormRecent={crossDormRecent}
      mealPriceContext={mealPriceContext}
      layer4Rewards={layer4Rewards}
      weeklyReviewState={weeklyReviewState}
      monthlyReviewWindow={monthlyReviewWindow}
      dormWarsTourCompleted={Boolean(customer?.dorm_wars_tour_completed_at)}
    />
  )
}

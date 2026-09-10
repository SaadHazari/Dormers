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
import { captureError } from '@/infra/logging/capture-error'
import { notifyAdmin } from '@/infra/admin-alerts/notify'
import { getWeeklyReviewState } from '@/utils/supabase/weekly-review-queries'
import { getMonthlyReviewWindow } from '@/utils/supabase/monthly-review-queries'
import { EMPTY_REVIEW_STATE } from '@/contexts/subscriptions/domain/weekly-review'
import HubLoading from './loading'

export const metadata = { title: 'Dorm Wars — Dormers' }

// Skip the Router Cache so the wallet / streak / drop status reflect the
// latest state after a checkout-success redirect. Without this, Next.js may
// serve a cached snapshot for up to 30s and the user sees stale numbers.
export const dynamic = 'force-dynamic'

export default async function DormWarsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    // Dev-only state harness — HubClient renders purely from props.
    //   ?gate=none|trial|weekly|gift      ineligible overlay variants
    //   ?streak=0|fresh|ready|doubler     chest strip / chest screen states (default 12d, 2 to next)
    //   ?chest=opened                     most recent chest result shown in the chest screen
    //   ?celebrate=referral|milestone|tier4|jacket|anniversary|monthly   celebration banner
    //   ?wallet=empty                     no reward history
    //   ?scouts=empty|all                 squad strip (default 3; all = every stage)
    //   ?recruits=N  ?cycle=N             lifetime conversions / this-cycle recruits
    //   ?perks=1                          Early Access + GOAT badges
    //   ?google=pending|earned            Google review side quest state
    //   ?weekly=pending|late|allin|none   weekly reviews side quest
    //   ?monthly=open|late|done|expired|soon
    //   ?feed=empty                       no cross-dorm activity
    //   ?tour=1                           first-visit spotlight tour
    //   ?loading=1  ?error=1
    if (params.loading === '1') return <HubLoading />
    if (params.error === '1') throw new Error('Preview: forced error boundary')
    const day = 86400000
    const iso = (off: number) => new Date(Date.now() + off * day).toISOString()
    const dateOnly = (off: number) => iso(off).slice(0, 10)
    const gate = params.gate
    const planName = gate === 'trial' ? 'Trial' : gate === 'weekly' ? 'Weekly Flex' : gate === 'gift' ? 'Welcome Gift' : 'Monthly Premium'
    const currentPlanId = gate === 'none' ? null : gate === 'trial' ? 'trial' as const : gate === 'weekly' ? 'weekly-flex' as const : gate === 'gift' ? 'welcome-gift' as const : 'monthly-premium' as const
    const activeSubscription = gate === 'none' ? null : {
      id: 'preview-sub', plan_name: planName, status: 'Active', start_date: dateOnly(-10), end_date: dateOnly(20),
      total_meals: 24, delivered_meals: 8, skipped_meals_count: 1, has_paused_before: false, pause_date: null,
      last_skipped_date: null, paused_days: 0, created_at: iso(-10), week_type: '6DAYS' as const,
    }
    const recruits = params.recruits != null ? Number(params.recruits) : 2
    const streakKnob = params.streak
    const count = streakKnob === '0' ? 0 : streakKnob === 'fresh' ? 3 : streakKnob === 'ready' ? 14 : streakKnob === 'doubler' ? 16 : 12
    const lastChestDay = streakKnob === '0' || streakKnob === 'fresh' ? 0 : streakKnob === 'doubler' ? 14 : 7
    const gap = count - lastChestDay
    const recentChest = params.chest === 'opened'
      ? { rng_bucket: 'cash_8_10' as const, value_aed: 9, claimed_at: iso(0), doubler_expires_at: null, streak_day: lastChestDay }
      : streakKnob === 'doubler'
        ? { rng_bucket: 'doubler' as const, value_aed: null, claimed_at: iso(-2), doubler_expires_at: iso(5), streak_day: 14 }
        : null
    const initialChestState = {
      count, lastChestDay, chestReady: gap >= 7, daysUntilNext: gap >= 7 ? 0 : Math.max(0, 7 - gap),
      recentChest,
      activeDoubler: streakKnob === 'doubler' ? { expiresAt: iso(5), msRemaining: 5 * day } : null,
    }
    const celebrateSource = {
      referral: 'referral_conversion', milestone: 'cycle_milestone_3', tier4: 'tier_4_meals',
      jacket: 'tier_3_jacket', anniversary: 'layer4_anniversary', monthly: 'layer4_monthly_review',
    }[params.celebrate ?? ''] ?? null
    const rewardEvents = params.wallet === 'empty' ? [] : [
      ...(celebrateSource ? [{ id: `preview-celebrate-${celebrateSource}`, amount_aed: celebrateSource === 'tier_3_jacket' ? 0 : celebrateSource === 'tier_4_meals' ? 300 : 30, source: celebrateSource, created_at: iso(0), invitee_name: celebrateSource === 'referral_conversion' ? 'Omar' : null, status: 'approved' as const }] : []),
      { id: 'ev-1', amount_aed: 30, source: 'referral_conversion', created_at: iso(-3), invitee_name: 'Aisha', status: 'approved' as const },
      { id: 'ev-2', amount_aed: 5, source: 'layer4_weekly_review', created_at: iso(-6), invitee_name: null, status: 'pending' as const },
      { id: 'ev-3', amount_aed: 25, source: 'cycle_milestone_2', created_at: iso(-12), invitee_name: null, status: 'applied' as const },
      { id: 'ev-4', amount_aed: 10, source: 'layer4_google_review', created_at: iso(-20), invitee_name: null, status: 'approved' as const },
    ]
    const scoutRows = (() => {
      const mk = (i: number, firstName: string, status: 'gift_claimed' | 'converted' | 'ineligible_existing_customer', delivered: number | null, endOff: number | null, claimedOff: number, convertedOff: number | null) => ({
        id: `inv-${i}`, firstName, status, claimedAt: iso(claimedOff), convertedAt: convertedOff == null ? null : iso(convertedOff),
        welcomeDeliveredMeals: delivered, welcomeSubStatus: delivered == null ? null : 'Active', welcomeEndDate: endOff == null ? null : iso(endOff),
      })
      if (params.scouts === 'empty') return []
      const all = [
        mk(1, 'Omar', 'gift_claimed', 0, 3, -1, null),          // scheduled
        mk(2, 'Layla', 'gift_claimed', 1, 4, -3, null),         // delivered
        mk(3, 'Zayd', 'gift_claimed', 1, -2, -12, null),        // decided
        mk(4, 'Aisha', 'converted', 1, -5, -20, -3),            // subscribed
        mk(5, 'Noor', 'ineligible_existing_customer', null, null, -2, null),
        mk(6, 'Sami', 'gift_claimed', null, null, -1, null),    // legacy: claim-age heuristic
      ]
      return params.scouts === 'all' ? all : all.slice(0, 3)
    })()
    const layer4Rewards = params.google ? [{
      id: 'l4-1', kind: 'google_review' as const, period_key: 'preview-sub',
      status: params.google === 'earned' ? 'approved' as const : 'pending' as const,
      value_aed: 10, claimed_at: iso(-1), awarded_at: params.google === 'earned' ? iso(0) : null,
    }] : []
    const fmt = (off: number) => new Date(Date.now() + off * day).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    const range = (startOff: number) => `${fmt(startOff)} — ${fmt(startOff + 5)}`
    const wk = params.weekly ?? 'pending'
    const weeklyReviewState = {
      ...EMPTY_REVIEW_STATE,
      current: wk === 'pending' ? { week: 2, range: range(-8), daysLeft: 4 } : null,
      late: wk === 'late' ? [{ week: 1, range: range(-15), daysLate: 3 }] : [],
      completed: wk === 'allin' ? [4, 3, 2, 1].map(w => ({ week: w, range: range(-8 * w), rewardPct: 100 as const })) : wk === 'none' ? [] : [{ week: 1, range: range(-15), rewardPct: 100 as const }],
      rewards: { submitted: wk === 'allin' ? 4 : wk === 'none' ? 0 : 1, total: 4, aedEarned: wk === 'allin' ? 20 : 0, aedPending: wk === 'allin' ? 0 : wk === 'none' ? 0 : 5, cycle: 'sep-2026', label: 'Monthly Premium' },
    }
    const mo = params.monthly ?? 'soon'
    const monthlyReviewWindow = {
      eligible: mo === 'open' || mo === 'late',
      locked: false,
      submitted: mo === 'done',
      daysLeftForFullReward: mo === 'late' ? 0 : 5,
      daysSinceCycleEnd: mo === 'late' ? 9 : mo === 'open' ? 2 : -10,
      expired: mo === 'expired',
      preCron: false,
      cycleLabel: 'Monthly Premium',
      planTier: 'monthly' as const,
    }
    const crossDormRecent = params.feed === 'empty' ? [] : [
      { firstName: 'Hamza', dormName: 'YUGO', planName: 'Monthly Premium', createdAt: iso(0), isElite: true },
      { firstName: 'Mariam', dormName: 'Study World', planName: 'Weekly Flex', createdAt: iso(-1), isElite: false },
      { firstName: 'Yusuf', dormName: 'Uninest', planName: 'Monthly Max', createdAt: iso(-2), isElite: false },
      { firstName: 'Dana', dormName: 'YUGO', planName: 'Trial', createdAt: iso(-3), isElite: false },
    ]
    return (
      <HubClient
        customerCid="YUG6750"
        customerName="Saad Hazari"
        customerDorm="YUGO"
        referralData={{ total: recruits + 1, converted: recruits, creditBalance: params.wallet === 'empty' ? 0 : 66, creditPending: params.wallet === 'empty' ? 0 : 5 }}
        invites={scoutRows}
        activeSubscription={activeSubscription}
        initialStreak={count}
        initialChestState={initialChestState}
        cycleRecruits={params.cycle != null ? Number(params.cycle) : 1}
        earlyAccess={params.perks === '1'}
        hallWall={params.perks === '1'}
        recentRewards={rewardEvents}
        dormWarsEligible={!gate}
        currentPlanId={currentPlanId}
        crossDormRecent={crossDormRecent}
        mealPriceContext={{ pricePerMeal: 27.5, mealsPerWeek: 6, totalMealsInPlan: 24, planId: 'Monthly Premium', pref: 'NonVeg', weekType: '6DAYS', source: 'fallback' }}
        layer4Rewards={layer4Rewards}
        weeklyReviewState={weeklyReviewState}
        monthlyReviewWindow={monthlyReviewWindow}
        dormWarsTourCompleted={params.tour !== '1'}
      />
    )
  }

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
    // Anniversary fire-and-forget — never block hub load. Surface the failure
    // (Release It! L5) so a missed once-a-year payout isn't silent; the marker
    // was already cleared in the helper, so the next hub visit retries idempotently.
    captureError(err, { area: 'dorm-wars', op: 'maybeFireAnniversary', customerId: user.id })
    void notifyAdmin(
      `Anniversary credit failed to deposit for customer ${user.id} — will retry on next hub load; verify if it recurs.`,
      user.id,
    )
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

'use client'

/**
 * DEV-ONLY mobile preview harness for the Dorm Wars hub.
 *
 * Renders the REAL HubClient with a faithful mock so the TopChrome row + the
 * Streak Chest modal can be screenshotted at 390px without a live Supabase
 * session. Gated to non-production. Not linked. The streak /api tick fetch
 * fails silently here (no auth) and keeps the SSR-seeded values.
 *
 * The faux hamburger mirrors DashboardShell's fixed burger (top:16 left:16,
 * 44×44) so we can verify the TopChrome buttons sit beside it on one line.
 */

import { notFound } from 'next/navigation'
import HubClient from '../../dashboard/dorm-wars/hub/HubClient'
import type { ReferralData, InviteRow, CrossDormRecentSub } from '@/infra/supabase/referrals-repo'
import type { StreakChestState, RewardEvent } from '@/infra/supabase/dorm-wars-repo'
import type { Subscription } from '../../dashboard/_shared/types'
import type { MealPriceContext } from '@/contexts/dorm-wars/domain/meal-pricing'
import type { Layer4Row } from '@/contexts/dorm-wars/domain/layer4'
import { EMPTY_REVIEW_STATE } from '@/contexts/subscriptions/domain/weekly-review'
import type { MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'

const referralData: ReferralData = {
  total: 9,
  converted: 7,            // → cashForLifetimeConversion(7) = AED 25 (rung 6–10)
  creditBalance: 165,
  creditPending: 25,
}

const invites: InviteRow[] = [
  { id: 'i1', firstName: 'Lena',  status: 'converted',   claimedAt: '2026-05-20T10:00:00Z', convertedAt: '2026-05-24T10:00:00Z', welcomeDeliveredMeals: 6, welcomeSubStatus: 'Active', welcomeEndDate: '2026-05-27T00:00:00Z' },
  { id: 'i2', firstName: 'Omar',  status: 'gift_claimed', claimedAt: '2026-06-01T10:00:00Z', convertedAt: null, welcomeDeliveredMeals: 2, welcomeSubStatus: 'Active', welcomeEndDate: '2026-06-08T00:00:00Z' },
  { id: 'i3', firstName: 'Priya', status: 'gift_claimed', claimedAt: '2026-06-03T10:00:00Z', convertedAt: null, welcomeDeliveredMeals: 0, welcomeSubStatus: 'Scheduled', welcomeEndDate: null },
]

const activeSubscription: Subscription = {
  id: 'sub1',
  plan_name: 'Monthly Premium',
  status: 'Active',
  start_date: '2026-05-21T00:00:00Z',
  end_date: '2026-06-20T00:00:00Z',
  total_meals: 24,
  delivered_meals: 12,
  skipped_meals_count: 1,
  has_paused_before: false,
  created_at: '2026-05-21T00:00:00Z',
  week_type: '6DAYS',
}

// count 14, lastChestDay 7 → gap 7 → chest #2 READY, week 2 current, week 1 cleared.
const initialChestState: StreakChestState = {
  count: 14,
  lastChestDay: 7,
  chestReady: true,
  daysUntilNext: 0,
  recentChest: null,
  activeDoubler: null,
}

const crossDormRecent: CrossDormRecentSub[] = [
  { firstName: 'Yara', dormName: 'UNINEST', planName: 'Monthly Max', createdAt: '2026-06-04T18:00:00Z', isElite: true },
  { firstName: 'Sam',  dormName: 'YUGO',    planName: 'Monthly Premium', createdAt: '2026-06-04T12:00:00Z', isElite: false },
]

const mealPriceContext: MealPriceContext = {
  pricePerMeal: 22,
  mealsPerWeek: 6,
  totalMealsInPlan: 24,
  planId: 'Monthly Premium',
  pref: 'NonVeg',
  weekType: '6DAYS',
  source: 'active-sub',
}

const layer4Rewards: Layer4Row[] = []
const recentRewards: RewardEvent[] = []

const monthlyReviewWindow: MonthlyReviewWindow = {
  eligible: false,
  submitted: false,
  daysLeftForFullReward: 0,
  daysSinceCycleEnd: -15,
  expired: false,
  preCron: false,
  cycleLabel: null,
  planTier: 'monthly',
}

export default function DormWarsMobilePreview() {
  if (process.env.NODE_ENV === 'production') notFound()

  return (
    <div style={{ minHeight: '100vh', background: '#0b0a1e' }}>
      {/* Faux hamburger — mirrors DashboardShell's fixed burger so we can
          verify the TopChrome buttons sit beside it on a single line. */}
      <div
        aria-hidden
        style={{
          position: 'fixed', top: 16, left: 16, zIndex: 70,
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(9,24,37,0.10)',
          boxShadow: '0 2px 8px rgba(9,24,37,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div style={{ width: 18, height: 2, background: '#091825', boxShadow: '0 -5px 0 #091825, 0 5px 0 #091825' }} />
      </div>

      <HubClient
        customerCid="YUG6750"
        customerName="Amsaa Rahman"
        customerDorm="YUGO"
        referralData={referralData}
        invites={invites}
        activeSubscription={activeSubscription}
        initialStreak={14}
        initialChestState={initialChestState}
        cycleRecruits={3}
        earlyAccess
        hallWall={false}
        recentRewards={recentRewards}
        dormWarsEligible
        currentPlanId="monthly-premium"
        crossDormRecent={crossDormRecent}
        mealPriceContext={mealPriceContext}
        layer4Rewards={layer4Rewards}
        weeklyReviewState={EMPTY_REVIEW_STATE}
        monthlyReviewWindow={monthlyReviewWindow}
        dormWarsTourCompleted
      />
    </div>
  )
}

// Dev-only harness for the Season admin page's waitlist panel.
//
// The panel is unreviewable in practice: /admin/* needs a real admin session,
// and the list only has anything in it during a live pause with real people on
// it. This renders SeasonClient against fixture rows so the populated table,
// the restart-target progress bar and the empty state can all be looked at.
// Unreachable in production.
//
// Query params:
//   ?members=0     render the empty state instead of the populated table
//   ?target=15     set the restart target (omit for "no target set")
//   ?season=open|stopped|scheduled|stopped_scheduled|passed|drift|break|break_alert|break_refund|open_refund   season planner state (default stopped)
import { notFound } from 'next/navigation'
import { AdminThemeProvider } from '@/app/admin/_components/AdminThemeProvider'
import { SeasonClient } from '@/app/admin/season/SeasonClient'
import type { IntakeSettingsRow, WaitlistMember } from '@/app/admin/season/page'
import type { SeasonHoldRow, SeasonPageData, SeasonPlanRow } from '@/app/admin/season/season-data'

export const dynamic = 'force-dynamic'

const DAY = 86_400_000

// Anchored to Monday 14 Sep 2026 so the projection reads the same every time.
const FIXTURE_TODAY = '2026-09-14'

function fixturePlan(p: Partial<SeasonPlanRow> & Pick<SeasonPlanRow, 'id' | 'customerName' | 'planName' | 'startDate' | 'endDate'>): SeasonPlanRow {
  return {
    customerId: `c-${p.id}`, status: 'Active', weekType: '6DAYS', mealsPerDay: 1, totalMeals: 24, deliveredMeals: 0,
    creditedSkipDays: 0, bufferGrants: 0, skippedDates: [], plannedPauseStart: null, staffApproval: null,
    lastDeliveryTickDate: '2026-09-12', dormName: 'Academic City', mealValue: { fils: 1800, exact: false }, seasonHoldId: null,
    ...p,
  }
}

// One plan per disposition the planner has to show, with the wrap-up day on Wed 30 Sep:
// runs past (6-day and 5-day, one with no price), starts after, customer paused,
// staff approval pending, and a plan that finishes.
const FIXTURE_PLANS: SeasonPlanRow[] = [
  fixturePlan({ id: 'a', customerName: 'Omar Farouk', planName: 'Monthly Premium', startDate: '2026-09-07', endDate: '2026-10-03', deliveredMeals: 6, mealValue: { fils: 1800, exact: true } }),
  fixturePlan({ id: 'b', customerName: 'Aisha Rahman', planName: 'Monthly Max', startDate: '2026-09-01', endDate: '2026-09-28', mealsPerDay: 2, totalMeals: 48, deliveredMeals: 22, dormName: 'Dubai Investment Park', mealValue: { fils: 1750, exact: false } }),
  fixturePlan({ id: 'c', customerName: 'Priya Nair', planName: 'Monthly Premium', status: 'Paused', startDate: '2026-08-24', endDate: '2026-09-25', deliveredMeals: 10, lastDeliveryTickDate: '2026-09-05' }),
  fixturePlan({ id: 'd', customerName: 'Yusuf Ali', planName: 'Weekly Flex', status: 'Scheduled', startDate: '2026-10-01', endDate: '2026-10-07', totalMeals: 6, lastDeliveryTickDate: null, mealValue: { fils: 1900, exact: false } }),
  fixturePlan({ id: 'e', customerName: 'Chen Wei', planName: 'Monthly Premium', weekType: '5DAYS', startDate: '2026-09-07', endDate: '2026-10-02', totalMeals: 20, deliveredMeals: 5, lastDeliveryTickDate: '2026-09-11', dormName: null, mealValue: null }),
  fixturePlan({ id: 'f', customerName: 'Layla Haddad', planName: 'Staff Monthly', status: 'Scheduled', startDate: '2026-09-28', endDate: '2026-10-24', staffApproval: 'pending', lastDeliveryTickDate: null, mealValue: null }),
]

const FIXTURE_SNAPSHOTS: Record<string, SeasonPageData['snapshot']> = {
  open: { phase: 'open', wrapUpDay: null, closeDay: null, bufferDays: 1, salesStopped: false },
  stopped: { phase: 'winding_down', wrapUpDay: null, closeDay: null, bufferDays: 1, salesStopped: true },
  scheduled: { phase: 'winding_down', wrapUpDay: '2026-09-30', closeDay: '2026-10-01', bufferDays: 1, salesStopped: false },
  stopped_scheduled: { phase: 'winding_down', wrapUpDay: '2026-09-30', closeDay: '2026-10-01', bufferDays: 1, salesStopped: true },
  // Wrap-up day already behind today: only Clear remains (no move, no stop or
  // resume sales, and ending today would reopen the kitchen).
  passed: { phase: 'winding_down', wrapUpDay: '2026-09-12', closeDay: '2026-09-14', bufferDays: 1, salesStopped: true },
  break: { phase: 'break', wrapUpDay: '2026-09-30', closeDay: '2026-10-01', bufferDays: 1, salesStopped: true },
}

// intake_settings.paused deliberately disagreeing with the season's own
// salesStopped, the way the old Season page could leave it (F3's
// seasonDriftMessage). Reuses the `stopped` snapshot itself, not a copy of
// its values, so the two states can never drift apart from each other.
const DRIFT_KEY = 'drift'

// The break (spec §11.3): a paid plan held with its credit, a queued Weekly
// held with it, a customer pause that has not saved a spot, and a staff
// renewal left pending. break_alert adds a plan still Active, the G10 breach.
const BREAK_KEYS = new Set(['break', 'break_alert', 'break_refund'])

const FIXTURE_BREAK_PLANS: SeasonPlanRow[] = [
  fixturePlan({ id: 'a', customerName: 'Omar Farouk', planName: 'Monthly Premium', status: 'Paused', startDate: '2026-09-07', endDate: '2026-10-10', deliveredMeals: 15, seasonHoldId: 'h-a', mealValue: { fils: 1800, exact: true } }),
  fixturePlan({ id: 'd', customerName: 'Omar Farouk', planName: 'Weekly Flex', status: 'Scheduled', startDate: '2026-10-12', endDate: '2026-10-17', totalMeals: 6, lastDeliveryTickDate: null, seasonHoldId: 'h-d', mealValue: { fils: 1900, exact: false } }),
  fixturePlan({ id: 'c', customerName: 'Priya Nair', planName: 'Monthly Premium', status: 'Paused', startDate: '2026-08-24', endDate: '2026-10-20', deliveredMeals: 10, lastDeliveryTickDate: '2026-09-05', seasonHoldId: 'h-c' }),
  fixturePlan({ id: 'f', customerName: 'Layla Haddad', planName: 'Staff Monthly', status: 'Scheduled', startDate: '2026-10-05', endDate: '2026-10-30', staffApproval: 'pending', lastDeliveryTickDate: null, mealValue: null }),
]

const FIXTURE_BREAK_ALERT_PLAN = fixturePlan({ id: 'g', customerName: 'Chen Wei', planName: 'Monthly Premium', status: 'Active', startDate: '2026-09-07', endDate: '2026-10-02', deliveredMeals: 18, mealValue: null })

const FIXTURE_HOLDS: SeasonHoldRow[] = [
  { id: 'h-a', subscriptionId: 'a', customerId: 'c-a', customerName: 'Omar Farouk', planName: 'Monthly Premium', reason: 'season', state: 'held', heldMeals: 9, mealValueFils: 1800, waitlistCreditId: 'cr-a', waitlistCreditFils: 2000, refundOffer: null, cashRefundFils: null, creditShareFils: null, stripeRefundId: null, lastError: null, refundDeclineReason: null, refundRequestedAt: null },
  { id: 'h-d', subscriptionId: 'd', customerId: 'c-a', customerName: 'Omar Farouk', planName: 'Weekly Flex', reason: 'season', state: 'held', heldMeals: 6, mealValueFils: null, waitlistCreditId: 'cr-a', waitlistCreditFils: 2000, refundOffer: null, cashRefundFils: null, creditShareFils: null, stripeRefundId: null, lastError: null, refundDeclineReason: null, refundRequestedAt: null },
  { id: 'h-c', subscriptionId: 'c', customerId: 'c-c', customerName: 'Priya Nair', planName: 'Monthly Premium', reason: 'customer_pause', state: 'paused_by_customer', heldMeals: 14, mealValueFils: null, waitlistCreditId: null, waitlistCreditFils: null, refundOffer: null, cashRefundFils: null, creditShareFils: null, stripeRefundId: null, lastError: null, refundDeclineReason: null, refundRequestedAt: null },
]

// Plan D (spec §10.3): Omar asked for a refund on his Monthly Premium, a
// Weekly Flex refund failed at Stripe, and one refund already went through.
const FIXTURE_REFUND_HOLDS: SeasonHoldRow[] = [
  { ...FIXTURE_HOLDS[0], state: 'refund_requested', cashRefundFils: 16200, creditShareFils: 0, refundRequestedAt: '2026-10-06T09:12:00Z' },
  { ...FIXTURE_HOLDS[1], customerName: 'Yusuf Ali', customerId: 'c-y', id: 'h-y', subscriptionId: 'y', state: 'refund_failed', mealValueFils: 1900, cashRefundFils: 9600, creditShareFils: 1800, lastError: 'Stripe: charge has already been refunded', refundRequestedAt: '2026-10-05T18:40:00Z' },
  { ...FIXTURE_HOLDS[2] },
  { ...FIXTURE_HOLDS[0], id: 'h-z', subscriptionId: 'z', customerId: 'c-z', customerName: 'Aisha Rahman', state: 'refunded', heldMeals: 4, cashRefundFils: 7200, creditShareFils: 0, stripeRefundId: 're_3Q2fixture', refundRequestedAt: '2026-10-04T10:00:00Z' },
]

function fixtureSeason(key: string | undefined): SeasonPageData {
  const resolvedKey = key ?? 'stopped'
  const onBreak = BREAK_KEYS.has(resolvedKey)
  const refunds = resolvedKey === 'break_refund' || resolvedKey === 'open_refund'
  const snapshotKey = resolvedKey === DRIFT_KEY ? 'stopped' : onBreak ? 'break' : resolvedKey === 'open_refund' ? 'open' : resolvedKey
  const snapshot = FIXTURE_SNAPSHOTS[snapshotKey] ?? FIXTURE_SNAPSHOTS.stopped
  const paused = resolvedKey === DRIFT_KEY ? false : snapshot.salesStopped
  return {
    snapshot,
    paused,
    salesStoppedAt: snapshot.salesStopped ? '2026-09-02T01:50:11Z' : null,
    kitchenDailyCostAed: 500,
    todayAe: onBreak ? '2026-10-07' : FIXTURE_TODAY,
    closureDates: onBreak ? [] : ['2026-09-16'],
    plans: onBreak
      ? (resolvedKey === 'break_alert' ? [...FIXTURE_BREAK_PLANS, FIXTURE_BREAK_ALERT_PLAN] : FIXTURE_BREAK_PLANS)
      : FIXTURE_PLANS,
    cycleStartedAt: '2026-09-14T08:00:00Z',
    reopenTarget: 15,
    holds: refunds ? FIXTURE_REFUND_HOLDS : onBreak ? FIXTURE_HOLDS : [],
    savedSpotCustomerIds: onBreak ? ['c-a'] : [],
  }
}

// Deliberately uneven: two dorms carrying most of the list, one person with no
// dorm set, and one whose credit never minted. Those are the three things the
// panel exists to make visible, so the fixture has to contain all of them.
function fixtureMembers(): WaitlistMember[] {
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString()
  return [
    { id: '1', name: 'Aisha Rahman', dormName: 'Dubai Investment Park', mealPreference: 'Veg', whatsapp: '+971501234567', email: 'a@example.com', joinedAt: at(9), creditAed: 15, notifiedAt: null },
    { id: '2', name: 'Omar Farouk', dormName: 'Dubai Investment Park', mealPreference: 'Non Veg', whatsapp: '+971502345678', email: 'o@example.com', joinedAt: at(8), creditAed: 20, notifiedAt: null },
    { id: '3', name: 'Priya Nair', dormName: 'Academic City', mealPreference: 'Veg', whatsapp: '+971503456789', email: 'p@example.com', joinedAt: at(6), creditAed: 15, notifiedAt: at(1) },
    { id: '4', name: 'Yusuf Ali', dormName: 'Academic City', mealPreference: 'Religious Preference', whatsapp: '+971504567890', email: 'y@example.com', joinedAt: at(4), creditAed: 20, notifiedAt: null },
    { id: '5', name: 'Chen Wei', dormName: null, mealPreference: null, whatsapp: null, email: 'c@example.com', joinedAt: at(2), creditAed: null, notifiedAt: null },
    { id: '6', name: 'Layla Haddad', dormName: 'Academic City', mealPreference: 'Non Veg', whatsapp: '+971506789012', email: 'l@example.com', joinedAt: at(1), creditAed: 20, notifiedAt: null },
  ]
}

export default async function SeasonAdminPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ members?: string; target?: string; season?: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  const params = await searchParams
  const target = params.target ? Number(params.target) : 15
  const season = fixtureSeason(params.season)

  const settings: IntakeSettingsRow = {
    paused: season.paused,
    headline: 'We are between semesters.',
    body: 'Dormers cooks when the dorms are full. We have paused new plans until enough of you are back on campus.',
    creditNonvegAed: 20,
    creditVegAed: 15,
    creditReligiousAed: 20,
    pausedAt: new Date(Date.now() - 12 * DAY).toISOString(),
    pausedBy: 'admin@dormers.ae',
    pauseScheduledFor: null,
    reopenTarget: Number.isFinite(target) ? target : null,
  }

  return (
    <AdminThemeProvider>
      <div className="p-6">
        <SeasonClient
          settings={settings}
          members={params.members === '0' ? [] : fixtureMembers()}
          season={season}
        />
      </div>
    </AdminThemeProvider>
  )
}

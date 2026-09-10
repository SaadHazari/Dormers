import type { CreditByPlan, Customer, Subscription, IntakeGateState } from './types'
import type { CreditRow } from './credit-outlook'

/**
 * DEV-ONLY fixtures shared by /dashboard/plan and /dashboard/explore-plans.
 * Every branch of PlanClient's state machine renders from these props, so each
 * look can be screenshot-verified without seeding accounts. Dates are relative
 * to today so a state can never age out of itself.
 *
 *   ?preview=1&state=active (default) | renew | scheduled | paused | planned-pause
 *              | queued | paused-queued | empty | waitlist | waitlist-joined
 *              | season (active sub + scheduled pause) | season-open (no sub + taper)
 *   &explore=1        explore mode (on /dashboard/plan)
 *   &credit=1         per-plan credit split + approved rows
 *   &pref=veg|mix     meal preference (mix = Religious Preference with veg days)
 *   &week=5           5-day cadence
 *   &zone=0           out-of-zone customer
 *   &unverified=1     WhatsApp not verified (profile gate)
 *   &canceled=1       arrive with ?checkout_canceled=true copy (explore)
 */
export interface PlanPreviewParams {
  state?: string
  explore?: string
  credit?: string
  pref?: string
  week?: string
  zone?: string
  unverified?: string
}

export interface PlanPreviewFixture {
  customer: Customer
  activeSubscription: Subscription | null
  allSubscriptions: Subscription[]
  creditByPlan: CreditByPlan
  creditRows: CreditRow[]
  intake: IntakeGateState
  mode: 'plan' | 'explore'
}

export function buildPlanPreview(params: PlanPreviewParams): PlanPreviewFixture {
  const st = params.state ?? 'active'
  const d = (off: number) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10)
  const now = new Date().toISOString()
  const weekType = params.week === '5' ? '5DAYS' as const : '6DAYS' as const
  const isMix = params.pref === 'mix'
  const mealPref = params.pref === 'veg' ? 'Veg' : isMix ? 'Religious Preference' : 'Non Veg'
  const vegDays = isMix ? ['Monday', 'Wednesday'] : null

  const base: Subscription = { id: 'prev-sub', plan_name: 'Monthly Premium', status: 'Active', start_date: d(-10), end_date: d(20), total_meals: 24, delivered_meals: 8, skipped_meals_count: 1, has_paused_before: false, pause_date: null, last_skipped_date: null, paused_days: 0, created_at: now, week_type: weekType, veg_days: vegDays, skipped_dates: [d(-3)] }
  const sub: Subscription | null =
    st === 'renew' ? { ...base, start_date: d(-25), end_date: d(3), delivered_meals: 20 }
    : st === 'scheduled' ? { ...base, status: 'Scheduled', start_date: d(5), end_date: d(35), delivered_meals: 0, skipped_meals_count: 0, skipped_dates: [] }
    : st === 'paused' || st === 'paused-queued' ? { ...base, status: 'Paused', has_paused_before: true, pause_date: d(-2), paused_days: 2 }
    : st === 'planned-pause' ? { ...base, planned_pause_start: d(4), has_paused_before: true }
    : st === 'empty' || st === 'waitlist' || st === 'waitlist-joined' || st === 'season-open' ? null
    : base
  const queued: Subscription[] = (st === 'queued' || st === 'paused-queued')
    ? [{ ...base, id: 'q-sub', plan_name: 'Monthly Max', status: 'Scheduled', start_date: d(22), end_date: d(52), delivered_meals: 0, skipped_meals_count: 0, skipped_dates: [] }]
    : []
  const ended: Subscription[] = [
    { ...base, id: 'old-1', status: 'Ended', start_date: d(-70), end_date: d(-40), delivered_meals: 24, skipped_dates: [] },
    { ...base, id: 'old-2', plan_name: 'Weekly Flex', status: 'Ended', start_date: d(-80), end_date: d(-73), total_meals: 6, delivered_meals: 6, skipped_dates: [] },
  ]
  const intakePaused = st === 'waitlist' || st === 'waitlist-joined'
  const intake: IntakeGateState = {
    paused: intakePaused,
    headline: intakePaused ? 'We’re between semesters' : '',
    body: intakePaused ? 'Dormers takes a short seasonal break while the dorms empty out. Save your spot and we’ll message you the moment plans reopen.' : '',
    creditAed: intakePaused ? 100 : 0,
    firstName: 'Saad',
    alreadyJoined: st === 'waitlist-joined',
    waitlistCreditAed: st === 'waitlist-joined' ? 100 : 0,
    cycleStartedAt: intakePaused ? now : null,
    cycleEndedAt: null,
    lastDeliveryDay: st === 'season' || st === 'season-open' ? d(18) : null,
  }
  const creditByPlan: CreditByPlan = params.credit === '1' ? {
    'Trial':           { balanceFils: 5000,  lockedFils: 10000 },
    'Weekly Flex':     { balanceFils: 5000,  lockedFils: 10000 },
    'Monthly Premium': { balanceFils: 15000, lockedFils: 0 },
    'Monthly Max':     { balanceFils: 15000, lockedFils: 0 },
  } : {}
  const creditRows: CreditRow[] = params.credit === '1'
    ? [{ amount_aed: 100, eligible_plan_ids: ['monthly-max', 'monthly-premium'] }, { amount_aed: 50, eligible_plan_ids: null }]
    : []
  const customer: Customer = {
    id: 'preview', cid: 'YUG6750', name: 'Saad Hazari', email: 'preview@dormers.ae',
    whatsapp_number: '+971 50 000 0000', whatsapp_verified: params.unverified !== '1',
    dorm_name: 'YUGO', meal_preference_type: mealPref, allergens: 'None', spice_level_preference: 'Medium',
    created_at: '2026-02-01T00:00:00Z', week_type: weekType, veg_days: vegDays, out_of_zone: params.zone === '0',
  }
  return {
    customer,
    activeSubscription: sub,
    allSubscriptions: [...queued, ...ended],
    creditByPlan,
    creditRows,
    intake,
    mode: params.explore === '1' ? 'explore' : 'plan',
  }
}

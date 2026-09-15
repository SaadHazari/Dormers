import { describe, it, expect } from 'vitest'
import { buildCustomerSeason, noticeFor, projectionPlanFromRow } from './customer-season'
import type { ProjectionPlan } from './season-projection'

// Anchors: Mon 2026-09-14 is today; Sat 3 Oct is the wrap-up day, Mon 5 Oct the close day.
const WIND_DOWN = { phase: 'winding_down' as const, wrapUpDay: '2026-10-03', closeDay: '2026-10-05', bufferDays: 1, cycleStartedAt: '2026-09-14T08:00:00Z' }
const plan = (p: Partial<ProjectionPlan> = {}): ProjectionPlan => ({
  id: 'p1', customerId: 'c1', planName: 'Monthly Premium', status: 'Active',
  startDate: '2026-09-07', endDate: '2026-10-03', weekType: '6DAYS',
  mealsPerDay: 1, totalMeals: 24, deliveredMeals: 6, creditedSkipDays: 0, bufferGrants: 0,
  skippedDates: [], plannedPauseStart: null, staffApproval: null, lastDeliveryTickDate: '2026-09-12',
  ...p,
})
const build = (plans: ProjectionPlan[], intake = WIND_DOWN) =>
  buildCustomerSeason({ intake, plans, skipCreditFils: 1980, todayAe: '2026-09-14', closureDates: ['2026-09-16'] })

describe('buildCustomerSeason', () => {
  it('is nothing unless the season is winding down to a wrap-up day', () => {
    expect(build([plan()], { ...WIND_DOWN, phase: 'open' as never })).toBeNull()
    expect(build([plan()], { ...WIND_DOWN, wrapUpDay: null as never, closeDay: null as never })).toBeNull()
  })

  it('tells a customer whose plan finishes in time (N1) and names the last dinner', () => {
    const season = build([plan({ endDate: '2026-10-02' })])
    expect(season).toMatchObject({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05', notice: 'finishes', lastDinner: '2026-10-02', skipCreditFils: 1980, closureDates: ['2026-09-16'] })
  })

  it('reads the last dinner across a queued renewal', () => {
    const season = build([
      plan({ endDate: '2026-09-19', totalMeals: 24, deliveredMeals: 18 }),
      plan({ id: 'p2', planName: 'Weekly Flex', status: 'Scheduled', startDate: '2026-09-21', endDate: '2026-09-26', totalMeals: 6, deliveredMeals: 0, lastDeliveryTickDate: null }),
    ])
    expect(season?.notice).toBe('finishes')
    expect(season?.lastDinner).toBe('2026-09-26')
  })

  it('tells a paused customer (N3)', () => {
    expect(build([plan({ status: 'Paused' })])?.notice).toBe('paused')
  })

  it('shows no notice to a plan that runs past the wrap-up day', () => {
    expect(build([plan()], { ...WIND_DOWN, wrapUpDay: '2026-09-30', closeDay: '2026-10-01' })?.notice).toBeNull()
  })
})

describe('noticeFor', () => {
  it('prefers the paused notice, and needs every plan to finish for N1', () => {
    expect(noticeFor([])).toBeNull()
    expect(noticeFor(['finishes', 'customer_paused'])).toBe('paused')
    expect(noticeFor(['finishes', 'starts_after'])).toBeNull()
    expect(noticeFor(['finishes', 'finishes'])).toBe('finishes')
  })
})

describe('projectionPlanFromRow', () => {
  it('maps a subscriptions row', () => {
    expect(projectionPlanFromRow({
      id: 'p1', customer_id: 'c1', plan_name: 'Monthly Max', status: 'Skipped',
      start_date: '2026-09-07', end_date: '2026-10-03T00:00:00Z', week_type: '5DAYS',
      meals_per_day: 2, total_meals: 40, delivered_meals: 10, credited_skip_days: 1, season_buffer_grants: 1,
      skipped_dates: ['2026-09-14'], planned_pause_start: null, staff_approval: null, last_delivery_tick_date: '2026-09-11',
    })).toEqual({
      id: 'p1', customerId: 'c1', planName: 'Monthly Max', status: 'Skipped',
      startDate: '2026-09-07', endDate: '2026-10-03', weekType: '5DAYS',
      mealsPerDay: 2, totalMeals: 40, deliveredMeals: 10, creditedSkipDays: 1, bufferGrants: 1,
      skippedDates: ['2026-09-14'], plannedPauseStart: null, staffApproval: null, lastDeliveryTickDate: '2026-09-11',
    })
  })

  it('ignores plans that are not live', () => {
    expect(projectionPlanFromRow({ id: 'p1', status: 'Ended', start_date: '2026-08-01', end_date: '2026-08-28' })).toBeNull()
    expect(projectionPlanFromRow(null)).toBeNull()
  })
})

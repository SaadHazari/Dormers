import { describe, it, expect } from 'vitest'
import {
  remainingDeliveryDates, projectPlan, lastMealOnTheBooks, kitchenCalendar, summarizeSeason,
  type ProjectionPlan, type ProjectionContext,
} from './season-projection'

// Anchors: Mon 2026-09-14 is "today". Sundays: 20 Sep, 27 Sep, 4 Oct.
// A Monday-to-Saturday Monthly Premium that started Mon 7 Sep has 6 meals
// delivered by Sat 12 Sep and 18 left, Mon 14 Sep to Sat 3 Oct.
const plan = (p: Partial<ProjectionPlan> = {}): ProjectionPlan => ({
  id: 'p1', customerId: 'c1', planName: 'Monthly Premium', status: 'Active',
  startDate: '2026-09-07', endDate: '2026-10-03', weekType: '6DAYS',
  mealsPerDay: 1, totalMeals: 24, deliveredMeals: 6, creditedSkipDays: 0, bufferGrants: 0,
  skippedDates: [], plannedPauseStart: null, staffApproval: null, lastDeliveryTickDate: '2026-09-12',
  ...p,
})
const ctx = (c: Partial<ProjectionContext> = {}): ProjectionContext => ({
  todayAe: '2026-09-14', closureDates: new Set(), wrapUpDay: null, closeDay: null, ...c,
})

describe('remainingDeliveryDates', () => {
  it('walks from today to the end date, skipping Sundays', () => {
    const dates = remainingDeliveryDates(plan(), ctx())
    expect(dates).toHaveLength(18)
    expect(dates[0]).toBe('2026-09-14')
    expect(dates.at(-1)).toBe('2026-10-03')
    expect(dates).not.toContain('2026-09-20')
  })

  it('drops today once tonight\'s delivery is recorded', () => {
    const dates = remainingDeliveryDates(plan({ lastDeliveryTickDate: '2026-09-14' }), ctx())
    expect(dates[0]).toBe('2026-09-15')
    expect(dates).toHaveLength(17)
  })

  it('drops skipped days and company closures', () => {
    const dates = remainingDeliveryDates(plan({ skippedDates: ['2026-09-16'] }), ctx({ closureDates: new Set(['2026-09-17']) }))
    expect(dates).not.toContain('2026-09-16')
    expect(dates).not.toContain('2026-09-17')
    expect(dates).toHaveLength(16)
  })

  it('starts on the start date for a plan that has not begun', () => {
    const dates = remainingDeliveryDates(plan({ status: 'Scheduled', startDate: '2026-09-21', endDate: '2026-09-26', lastDeliveryTickDate: null }), ctx())
    expect(dates).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'])
  })
})

describe('projectPlan', () => {
  it('no wrap-up day: every remaining dinner is on the books', () => {
    const p = projectPlan(plan(), ctx())
    expect(p.disposition).toBe('finishes')
    expect(p.lastDinner).toBe('2026-10-03')
    expect(p.cookDates).toHaveLength(18)
    expect(p.mealsLeft).toBe(18)
  })

  it('finishes when the last dinner is on the wrap-up day', () => {
    const p = projectPlan(plan(), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
    expect(p.disposition).toBe('finishes')
    expect(p.mealsAfterWrapUp).toBe(0)
  })

  it('runs past when dinners are due after the wrap-up day', () => {
    const p = projectPlan(plan(), ctx({ wrapUpDay: '2026-09-30', closeDay: '2026-10-01' }))
    expect(p.disposition).toBe('runs_past')
    expect(p.deliveriesAfterWrapUp).toBe(3)
    expect(p.mealsAfterWrapUp).toBe(3)
    expect(p.lastDinner).toBe('2026-09-30')
  })

  it('counts two meals a day on Monthly Max', () => {
    const p = projectPlan(plan({ mealsPerDay: 2, totalMeals: 48, deliveredMeals: 12, planName: 'Monthly Max' }), ctx({ wrapUpDay: '2026-09-30', closeDay: '2026-10-01' }))
    expect(p.mealsAfterWrapUp).toBe(6)
  })

  it('a buffer grant lets a make-up dinner cook on the buffer day', () => {
    const p = projectPlan(plan({ endDate: '2026-10-05', bufferGrants: 1 }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
    expect(p.disposition).toBe('finishes')
    expect(p.lastDinner).toBe('2026-10-05')
  })

  it('a buffer grant never cooks after the close day', () => {
    const p = projectPlan(plan({ endDate: '2026-10-06', bufferGrants: 1 }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
    expect(p.disposition).toBe('runs_past')
    expect(p.mealsAfterWrapUp).toBe(1)
    expect(p.lastDinner).toBe('2026-10-05')
  })

  it('a paused plan is a customer pause with nothing cooking', () => {
    const p = projectPlan(plan({ status: 'Paused' }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
    expect(p.disposition).toBe('customer_paused')
    expect(p.cookDates).toEqual([])
    expect(p.mealsLeft).toBe(18)
  })

  it('a planned pause on or before the wrap-up day cooks only until the pause', () => {
    const p = projectPlan(plan({ plannedPauseStart: '2026-09-21' }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
    expect(p.disposition).toBe('customer_paused')
    expect(p.cookDates).toHaveLength(6)
    expect(p.lastDinner).toBe('2026-09-19')
  })

  it('a planned pause after the wrap-up day does not save the plan from running past', () => {
    const p = projectPlan(plan({ plannedPauseStart: '2026-10-02' }), ctx({ wrapUpDay: '2026-09-30', closeDay: '2026-10-01' }))
    expect(p.disposition).toBe('runs_past')
    expect(p.mealsAfterWrapUp).toBe(3)
  })

  it('a plan starting after the wrap-up day is held whole', () => {
    const p = projectPlan(
      plan({ status: 'Scheduled', startDate: '2026-10-06', endDate: '2026-11-02', deliveredMeals: 0, lastDeliveryTickDate: null }),
      ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }),
    )
    expect(p.disposition).toBe('starts_after')
    expect(p.mealsAfterWrapUp).toBe(24)
    expect(p.cookDates).toEqual([])
  })

  it('a staff renewal waiting for approval is left alone', () => {
    const p = projectPlan(plan({ status: 'Scheduled', staffApproval: 'pending' }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
    expect(p.disposition).toBe('staff_pending')
  })

  it('credited skips come off the meals left', () => {
    expect(projectPlan(plan({ creditedSkipDays: 2 }), ctx()).mealsLeft).toBe(16)
  })
})

describe('books, calendar and summary', () => {
  const p1 = plan()
  const p2 = plan({ id: 'p2', customerId: 'c2', planName: 'Monthly Max', mealsPerDay: 2, totalMeals: 48, deliveredMeals: 36, startDate: '2026-08-24', endDate: '2026-09-19' })

  it('finds the last meal on the books', () => {
    const projections = [projectPlan(p1, ctx()), projectPlan(p2, ctx())]
    expect(lastMealOnTheBooks(projections)).toEqual({ date: '2026-10-03', planIds: ['p1'] })
    expect(lastMealOnTheBooks([])).toBeNull()
  })

  it('builds the kitchen calendar with meals and last dinners per day', () => {
    const plans = [p1, p2]
    const projections = plans.map((p) => projectPlan(p, ctx()))
    const cal = kitchenCalendar(plans, projections)
    expect(cal.find((d) => d.date === '2026-09-14')).toEqual({ date: '2026-09-14', meals: 3, lastDinners: 0 })
    expect(cal.find((d) => d.date === '2026-09-19')).toEqual({ date: '2026-09-19', meals: 3, lastDinners: 1 })
    expect(cal.find((d) => d.date === '2026-10-03')).toEqual({ date: '2026-10-03', meals: 1, lastDinners: 1 })
    expect(cal).toHaveLength(18)
  })

  it('summarises kitchen days, cost and dispositions', () => {
    const plans = [p1, p2]
    const c = ctx({ wrapUpDay: '2026-09-30', closeDay: '2026-10-01' })
    const projections = plans.map((p) => projectPlan(p, c))
    const summary = summarizeSeason(projections, kitchenCalendar(plans, projections), 500)
    expect(summary.byDisposition).toEqual({ finishes: 1, customer_paused: 0, runs_past: 1, starts_after: 0, staff_pending: 0 })
    expect(summary.kitchenDays).toBe(15)
    expect(summary.kitchenCostAed).toBe(7500)
    expect(summary.mealsAfterWrapUp).toBe(3)
    expect(summary.lastKitchenDay).toBe('2026-09-30')
  })
})

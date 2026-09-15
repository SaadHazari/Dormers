import { describe, it, expect } from 'vitest'
import { resumeSplitFor } from './resume-split'
import type { ProjectionPlan } from './season-projection'

// Spec §14, customer D: paused, resumes Thu 1 Oct 2026 with 12 meals left.
// Wrap-up day Sat 3 Oct, close day Mon 5 Oct, no buffer grant.
const paused = (p: Partial<ProjectionPlan> = {}): ProjectionPlan => ({
  id: 'd', customerId: 'cd', planName: 'Monthly Premium', status: 'Paused',
  startDate: '2026-09-01', endDate: '2026-10-16', weekType: '6DAYS',
  mealsPerDay: 1, totalMeals: 24, deliveredMeals: 12, creditedSkipDays: 0, bufferGrants: 0,
  skippedDates: [], plannedPauseStart: null, staffApproval: null, lastDeliveryTickDate: '2026-09-09', resumeCutoffDate: null,
  ...p,
})
const split = (over: Partial<Parameters<typeof resumeSplitFor>[0]> = {}) => resumeSplitFor({
  plan: paused(), wrapUpDay: '2026-10-03', closeDay: '2026-10-05', todayAe: '2026-10-01', aeHour: 11,
  closureDates: [], creditAed: 20, alreadyJoined: false, paidInCash: true, ...over,
})

describe('resumeSplitFor (spec §7.4)', () => {
  it('dinners until the wrap-up day, the rest kept with the waitlist credit', () => {
    expect(split()).toEqual({ firstDinner: '2026-10-01', wrapUpDay: '2026-10-03', heldMeals: 9, creditAed: 20 })
  })

  it('after the 2 PM cutoff tonight is not cooked, so one more meal is kept', () => {
    expect(split({ aeHour: 15 })).toEqual({ firstDinner: '2026-10-02', wrapUpDay: '2026-10-03', heldMeals: 10, creditAed: 20 })
  })

  it('resuming after 2 PM on the wrap-up day keeps every meal (spec §15)', () => {
    expect(split({ todayAe: '2026-10-03', aeHour: 15 })).toEqual({ firstDinner: null, wrapUpDay: '2026-10-03', heldMeals: 12, creditAed: 20 })
  })

  it('shows no split when every meal fits before the wrap-up day', () => {
    expect(split({ plan: paused({ deliveredMeals: 21 }) })).toBeNull()
  })

  it('names no credit for a customer who saved a spot, or a plan not paid in cash', () => {
    expect(split({ alreadyJoined: true })?.creditAed).toBeNull()
    expect(split({ paidInCash: false })?.creditAed).toBeNull()
    expect(split({ creditAed: 0 })?.creditAed).toBeNull()
  })

  it('only for a paused plan', () => {
    expect(split({ plan: paused({ status: 'Active' }) })).toBeNull()
    expect(split({ plan: null })).toBeNull()
  })
})

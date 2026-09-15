import { describe, it, expect } from 'vitest'
import {
  projectedEndDate, makeUpDayFor, decideSkipOutcome, skipCreditFilsFor, mayPromiseMealOn, skipSeenMismatch,
  type SkipSeason, type SkipPlanFacts,
} from './skip-outcome'

// Anchors: Mon 2026-09-14 is today. Wed 30 Sep, Fri 2 Oct, Sat 3 Oct,
// Sun 4 Oct, Mon 5 Oct, Tue 6 Oct. Sun 20 Sep is not a delivery day.
const TODAY = '2026-09-14'
const NO_CLOSURES: ReadonlySet<string> = new Set()
const season = (s: Partial<SkipSeason> = {}): SkipSeason => ({
  phase: 'winding_down', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', bufferDays: 1, ...s,
})
const plan = (p: Partial<SkipPlanFacts> = {}): SkipPlanFacts => ({
  endDate: '2026-10-03', weekType: '6DAYS', skippedDates: [], bufferGrants: 0, ...p,
})
const walk = (p: SkipPlanFacts, closures: ReadonlySet<string> = NO_CLOSURES) => ({
  endDate: p.endDate, weekType: p.weekType, todayAe: TODAY, closureDates: closures, skippedDates: p.skippedDates,
})

describe('projectedEndDate', () => {
  it('is the end date when no closure lies ahead', () => {
    expect(projectedEndDate(walk(plan()))).toBe('2026-10-03')
  })

  it('moves one delivery day per closure still to come inside the plan', () => {
    expect(projectedEndDate(walk(plan(), new Set(['2026-09-30'])))).toBe('2026-10-05')
  })

  it('ignores closures on a skipped day, in the past, or on a day off', () => {
    expect(projectedEndDate(walk(plan({ skippedDates: ['2026-09-30'] }), new Set(['2026-09-30'])))).toBe('2026-10-03')
    expect(projectedEndDate(walk(plan(), new Set(['2026-09-10'])))).toBe('2026-10-03')
    expect(projectedEndDate(walk(plan(), new Set(['2026-09-20'])))).toBe('2026-10-03')
  })
})

describe('makeUpDayFor', () => {
  it('is the next delivery day after the projected end', () => {
    expect(makeUpDayFor(walk(plan()))).toBe('2026-10-05')
    expect(makeUpDayFor(walk(plan({ endDate: '2026-10-02' })))).toBe('2026-10-03')
    expect(makeUpDayFor(walk(plan({ endDate: '2026-10-02', weekType: '5DAYS' })))).toBe('2026-10-05')
  })

  it('never lands on a closure', () => {
    expect(makeUpDayFor(walk(plan(), new Set(['2026-10-05'])))).toBe('2026-10-06')
  })
})

describe('decideSkipOutcome', () => {
  const decide = (s: SkipSeason, p: SkipPlanFacts, creditFils: number | null = 1980) =>
    decideSkipOutcome({ season: s, plan: p, todayAe: TODAY, closureDates: NO_CLOSURES, creditFils })

  it('is a normal skip outside a wind-down with a wrap-up day', () => {
    expect(decide(season({ phase: 'open', wrapUpDay: null, closeDay: null }), plan())).toEqual({ kind: 'normal' })
    expect(decide(season({ wrapUpDay: null, closeDay: null }), plan())).toEqual({ kind: 'normal' })
  })

  it('is a normal skip when the make-up day is on or before the wrap-up day', () => {
    expect(decide(season(), plan({ endDate: '2026-10-02' }))).toEqual({ kind: 'normal' })
  })

  it('takes a buffer grant when the make-up day falls on a buffer day with a grant left', () => {
    expect(decide(season(), plan())).toEqual({ kind: 'grant', makeUpDay: '2026-10-05' })
  })

  it('credits the meal when the buffer grant is used up', () => {
    expect(decide(season(), plan({ bufferGrants: 1 }))).toEqual({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 })
  })

  it('credits the meal when there is no buffer', () => {
    expect(decide(season({ closeDay: '2026-10-03', bufferDays: 0 }), plan())).toEqual({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 })
  })

  it('a Monday to Friday plan cannot use a Saturday buffer day', () => {
    // W = Fri 2 Oct, buffer 1, so K = Sat 3 Oct. The plan's make-up day is Mon 5 Oct.
    expect(decide(season({ wrapUpDay: '2026-10-02', closeDay: '2026-10-03' }), plan({ endDate: '2026-10-02', weekType: '5DAYS' })))
      .toEqual({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 })
  })

  it('passes an unknown meal value through for the caller to refuse', () => {
    expect(decide(season(), plan({ bufferGrants: 1 }), null)).toEqual({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: null })
  })
})

describe('skipCreditFilsFor', () => {
  const order = (o: Partial<{
    amountPaidFils: number | null
    creditAppliedFils: number | null
    mealsCount: number | null
    pricePerMealAed: number | null
    stripeSessionId: string | null
  }> = {}) => ({
    amountPaidFils: null, creditAppliedFils: null, mealsCount: 24, pricePerMealAed: 22, stripeSessionId: null, ...o,
  })

  it('credits what the customer paid for the meal: card plus wallet credit, over the meals, times the day', () => {
    expect(skipCreditFilsFor({ planName: 'Monthly Premium', mealsPerDay: 1, order: order({ amountPaidFils: 43200, creditAppliedFils: 0, pricePerMealAed: 19 }) })).toBe(1800)
    // Monthly Max: AED 800 card + AED 40 wallet over 48 meals is AED 17.50 a meal, 2 meals a day.
    expect(skipCreditFilsFor({ planName: 'Monthly Max', mealsPerDay: 2, order: order({ amountPaidFils: 80000, creditAppliedFils: 4000, mealsCount: 48, pricePerMealAed: 19 }) })).toBe(3500)
  })

  it('falls back to 90% of the list price only when the order recorded no money', () => {
    expect(skipCreditFilsFor({ planName: 'Monthly Premium', mealsPerDay: 1, order: order() })).toBe(1980)
  })

  it('counts every meal of a delivery day', () => {
    expect(skipCreditFilsFor({ planName: 'Monthly Max', mealsPerDay: 2, order: order({ mealsCount: 48, pricePerMealAed: 17.5 }) })).toBe(3150)
  })

  it('mints nothing for plans not paid in cash', () => {
    expect(skipCreditFilsFor({ planName: 'Staff Monthly', mealsPerDay: 1, order: order() })).toBe(0)
    expect(skipCreditFilsFor({ planName: 'Welcome Meal', mealsPerDay: 1, order: order() })).toBe(0)
    expect(skipCreditFilsFor({ planName: 'Monthly Premium', mealsPerDay: 1, order: null })).toBe(0)
  })

  it('does not know the value of an order with no meals', () => {
    expect(skipCreditFilsFor({ planName: 'Monthly Premium', mealsPerDay: 1, order: order({ mealsCount: 0 }) })).toBeNull()
  })

  describe('parity with the live season_skip_credit_fils SQL, read on 2026-09-15', () => {
    it.each([
      [
        'list 22, no money',
        { planName: 'Monthly Premium', mealsPerDay: 1, order: order({ pricePerMealAed: 22 }) },
        1980,
      ],
      [
        'list 20.115, no money',
        { planName: 'Monthly Premium', mealsPerDay: 1, order: order({ pricePerMealAed: 20.115 }) },
        1810,
      ],
      [
        'list 17.416666666666668, meals_per_day 2, no money',
        { planName: 'Monthly Premium', mealsPerDay: 2, order: order({ pricePerMealAed: 17.416666666666668 }) },
        3134,
      ],
      [
        'list 21.5, meals_per_day 2, 40 meals, no money',
        { planName: 'Monthly Premium', mealsPerDay: 2, order: order({ pricePerMealAed: 21.5, mealsCount: 40 }) },
        3870,
      ],
      [
        'Monthly Max, 48 meals, meals_per_day 2, paid 96000 + credit 4000, cs_live_x',
        { planName: 'Monthly Max', mealsPerDay: 2, order: order({ amountPaidFils: 96000, creditAppliedFils: 4000, mealsCount: 48, stripeSessionId: 'cs_live_x' }) },
        4166,
      ],
      [
        'list 22, 20 meals, paid 22000 + credit 0, cs_test_x (fallback, not 1100)',
        { planName: 'Monthly Premium', mealsPerDay: 1, order: order({ amountPaidFils: 22000, creditAppliedFils: 0, mealsCount: 20, pricePerMealAed: 22, stripeSessionId: 'cs_test_x' }) },
        1980,
      ],
      [
        'list 22, 20 meals, paid 0 + credit 0, cs_test_x (fallback, not 0)',
        { planName: 'Monthly Premium', mealsPerDay: 1, order: order({ amountPaidFils: 0, creditAppliedFils: 0, mealsCount: 20, pricePerMealAed: 22, stripeSessionId: 'cs_test_x' }) },
        1980,
      ],
      [
        'credit-only order (session null), paid 0 + credit 44000, 20 meals (exact)',
        { planName: 'Monthly Premium', mealsPerDay: 1, order: order({ amountPaidFils: 0, creditAppliedFils: 44000, mealsCount: 20, stripeSessionId: null }) },
        2200,
      ],
    ])('%s -> %i', (_label, input, expected) => {
      expect(skipCreditFilsFor(input)).toBe(expected)
    })
  })
})

describe('mayPromiseMealOn', () => {
  it('promises anything outside a wind-down', () => {
    expect(mayPromiseMealOn('2026-10-06', season({ phase: 'open', wrapUpDay: null, closeDay: null }), 0)).toBe(true)
  })

  it('promises days up to the wrap-up day, and buffer days only to a plan with a grant', () => {
    expect(mayPromiseMealOn('2026-10-03', season(), 0)).toBe(true)
    expect(mayPromiseMealOn('2026-10-05', season(), 1)).toBe(true)
    expect(mayPromiseMealOn('2026-10-05', season(), 0)).toBe(false)
    expect(mayPromiseMealOn('2026-10-06', season(), 1)).toBe(false)
  })
})

describe('skipSeenMismatch', () => {
  it('refuses a credited skip the customer was never shown', () => {
    expect(skipSeenMismatch({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 }, undefined)).toBe(true)
    expect(skipSeenMismatch({ kind: 'normal' }, undefined)).toBe(false)
  })

  it('refuses when the outcome or the amount changed since the sheet', () => {
    expect(skipSeenMismatch({ kind: 'grant', makeUpDay: '2026-10-05' }, { outcome: 'grant', creditFils: null })).toBe(false)
    expect(skipSeenMismatch({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 }, { outcome: 'credited', creditFils: 1800 })).toBe(true)
    expect(skipSeenMismatch({ kind: 'normal' }, { outcome: 'credited', creditFils: 1980 })).toBe(true)
  })
})

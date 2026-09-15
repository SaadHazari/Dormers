import { describe, it, expect } from 'vitest'
import { mealValueOf, formatAed, aedToFils } from './meal-value'

const order = (o: Partial<{
  amountPaidFils: number | null
  creditAppliedFils: number | null
  mealsCount: number | null
  pricePerMealAed: number | null
  stripeSessionId: string | null
}> = {}) => ({
  amountPaidFils: null, creditAppliedFils: null, mealsCount: 24, pricePerMealAed: 22, stripeSessionId: null, ...o,
})

describe('mealValueOf', () => {
  it('uses what was paid when the order records it', () => {
    expect(mealValueOf(order({ amountPaidFils: 43200, creditAppliedFils: 0, mealsCount: 24, pricePerMealAed: 19 })))
      .toEqual({ fils: 1800, exact: true })
  })

  it('counts wallet credit used as part of what was paid', () => {
    expect(mealValueOf(order({ amountPaidFils: 41200, creditAppliedFils: 2000, mealsCount: 24, pricePerMealAed: 19 })))
      .toEqual({ fils: 1800, exact: true })
  })

  it('rounds down to the fils', () => {
    expect(mealValueOf(order({ amountPaidFils: 10000, creditAppliedFils: 0, mealsCount: 3, pricePerMealAed: null })))
      .toEqual({ fils: 3333, exact: true })
  })

  it('takes the exact path for a session with no id (real money, not a checkout session)', () => {
    expect(mealValueOf(order({ amountPaidFils: 0, creditAppliedFils: 44000, mealsCount: 20, stripeSessionId: null })))
      .toEqual({ fils: 2200, exact: true })
  })

  it('falls back to the pre-discount rate as an estimate', () => {
    expect(mealValueOf(order({ amountPaidFils: null, creditAppliedFils: null, mealsCount: 24, pricePerMealAed: 18 })))
      .toEqual({ fils: 1800, exact: false })
  })

  it('ignores money recorded on a Stripe test-mode order and falls back to the list price instead', () => {
    expect(mealValueOf(order({ amountPaidFils: 22000, creditAppliedFils: 0, mealsCount: 20, pricePerMealAed: 22, stripeSessionId: 'cs_test_abc123' })))
      .toEqual({ fils: 2200, exact: false })
    // Even when the recorded money is 0, test mode still means "no money", not "free".
    expect(mealValueOf(order({ amountPaidFils: 0, creditAppliedFils: 0, mealsCount: 20, pricePerMealAed: 22, stripeSessionId: 'cs_test_abc123' })))
      .toEqual({ fils: 2200, exact: false })
  })

  it('trusts money on a live-mode session', () => {
    expect(mealValueOf(order({ amountPaidFils: 96000, creditAppliedFils: 4000, mealsCount: 48, pricePerMealAed: 19, stripeSessionId: 'cs_live_x' })))
      .toEqual({ fils: 2083, exact: true })
  })

  it('knows nothing without meals or money', () => {
    expect(mealValueOf(order({ amountPaidFils: 43200, creditAppliedFils: 0, mealsCount: 0, pricePerMealAed: 18 }))).toBeNull()
    expect(mealValueOf(order({ amountPaidFils: null, creditAppliedFils: null, mealsCount: 24, pricePerMealAed: null }))).toBeNull()
  })
})

describe('aedToFils', () => {
  // Parity with live Postgres: `round(price_per_meal::numeric * 100)`, read from
  // Dormers-Ohio (yjjayivwfqjfppawgyaz) on 2026-09-15. A plain `Math.round(aed *
  // 100)` on a JS double disagrees with Postgres numeric rounding at these
  // half-fils boundaries (20.115 * 100 is 2011.4999999999998 as a double).
  it.each([
    [20.115, 2012],
    [17.416666666666668, 1742],
    [21.5, 2150],
    [22, 2200],
  ])('rounds %s AED to %i fils the way SQL numeric round does', (aed, fils) => {
    expect(aedToFils(aed)).toBe(fils)
  })
})

describe('formatAed', () => {
  it('drops .00 and keeps real fils', () => {
    expect(formatAed(1800)).toBe('AED 18')
    expect(formatAed(1850)).toBe('AED 18.50')
    expect(formatAed(0)).toBe('AED 0')
  })

  it('groups whole AED with thousands separators', () => {
    expect(formatAed(700000)).toBe('AED 7,000')
    expect(formatAed(123450)).toBe('AED 1,234.50')
    expect(formatAed(100000000)).toBe('AED 1,000,000')
  })
})

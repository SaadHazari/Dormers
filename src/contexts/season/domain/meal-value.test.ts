import { describe, it, expect } from 'vitest'
import { mealValueOf, formatAed } from './meal-value'

describe('mealValueOf', () => {
  it('uses what was paid when the order records it', () => {
    expect(mealValueOf({ amountPaidFils: 43200, creditAppliedFils: 0, mealsCount: 24, pricePerMealAed: 19 })).toEqual({ fils: 1800, exact: true })
  })

  it('counts wallet credit used as part of what was paid', () => {
    expect(mealValueOf({ amountPaidFils: 41200, creditAppliedFils: 2000, mealsCount: 24, pricePerMealAed: 19 })).toEqual({ fils: 1800, exact: true })
  })

  it('rounds down to the fils', () => {
    expect(mealValueOf({ amountPaidFils: 10000, creditAppliedFils: 0, mealsCount: 3, pricePerMealAed: null })).toEqual({ fils: 3333, exact: true })
  })

  it('falls back to the pre-discount rate as an estimate', () => {
    expect(mealValueOf({ amountPaidFils: null, creditAppliedFils: null, mealsCount: 24, pricePerMealAed: 18 })).toEqual({ fils: 1800, exact: false })
  })

  it('knows nothing without meals or money', () => {
    expect(mealValueOf({ amountPaidFils: 43200, creditAppliedFils: 0, mealsCount: 0, pricePerMealAed: 18 })).toBeNull()
    expect(mealValueOf({ amountPaidFils: null, creditAppliedFils: null, mealsCount: 24, pricePerMealAed: null })).toBeNull()
  })
})

describe('formatAed', () => {
  it('drops .00 and keeps real fils', () => {
    expect(formatAed(1800)).toBe('AED 18')
    expect(formatAed(1850)).toBe('AED 18.50')
    expect(formatAed(0)).toBe('AED 0')
  })
})

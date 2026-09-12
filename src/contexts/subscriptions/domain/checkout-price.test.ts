/**
 * Checkout must charge for what was ORDERED.
 *
 * The old rule accepted any amount inside priceBoundsFils — the widest legal
 * band across every preference for that plan. But `preference` travels in the
 * same request body and was never compared against the money, so a POST could
 * order NonVeg Monthly Max and pay the Veg floor. The webhook then wrote the
 * submitted preference onto the order, so the kitchen packed non-veg for a
 * veg-priced plan.
 *
 * These tests state the exposure in money, and then lock the exact-match rule
 * that closes it.
 */

import { describe, it, expect } from 'vitest'
import {
  exactPriceFils,
  resolvePref,
  priceBoundsFils,
  type PlanId,
  type Pref,
} from './pricing'

const ALL_PLANS: PlanId[] = ['Trial', 'Weekly Flex', 'Monthly Premium', 'Monthly Max']

describe('the hole the band check left open', () => {
  // Documents what the old rule allowed, so nobody reintroduces it thinking
  // "a range is basically the same thing".
  it.each(ALL_PLANS)('%s: the band spans a real underpayment', (plan) => {
    const bounds = priceBoundsFils(plan, '6DAYS')
    const vegTotal = exactPriceFils(plan, 'Veg', 0, '6DAYS')
    const nonVegTotal = exactPriceFils(plan, 'NonVeg', 0, '6DAYS')

    // Veg is the cheapest branch, so it sets the floor the old rule accepted.
    expect(bounds.minFils).toBe(vegTotal)
    expect(nonVegTotal).toBeGreaterThan(vegTotal)

    // The old rule would have accepted the veg price for a non-veg order.
    expect(bounds.minFils).toBeLessThan(nonVegTotal)
  })

  it('Monthly Max was the worst case at AED 192 per cycle', () => {
    const veg = exactPriceFils('Monthly Max', 'Veg', 0, '6DAYS')
    const nonVeg = exactPriceFils('Monthly Max', 'NonVeg', 0, '6DAYS')
    expect(veg).toBe(84_000)      // AED 840
    expect(nonVeg).toBe(103_200)  // AED 1032
    expect((nonVeg - veg) / 100).toBe(192)
  })
})

describe('exactPriceFils charges for the preference actually ordered', () => {
  it('prices each preference differently for the same plan', () => {
    const veg = exactPriceFils('Monthly Max', 'Veg', 0, '6DAYS')
    const nonVeg = exactPriceFils('Monthly Max', 'NonVeg', 0, '6DAYS')
    const mixed = exactPriceFils('Monthly Max', 'Religious', 3, '6DAYS')

    expect(veg).not.toBe(nonVeg)
    // A religious mix sits between the two pure branches.
    expect(mixed).toBeGreaterThan(veg)
    expect(mixed).toBeLessThan(nonVeg)
  })

  it('religious-mix price moves with the veg-day count', () => {
    const oneVegDay = exactPriceFils('Monthly Max', 'Religious', 1, '6DAYS')
    const fiveVegDays = exactPriceFils('Monthly Max', 'Religious', 5, '6DAYS')
    // More veg days = cheaper, since veg is the cheaper branch.
    expect(fiveVegDays).toBeLessThan(oneVegDay)
  })

  it('always lands inside the legal band it replaces', () => {
    for (const plan of ALL_PLANS) {
      for (const wt of ['5DAYS', '6DAYS'] as const) {
        const bounds = priceBoundsFils(plan, wt)
        for (const pref of ['Veg', 'NonVeg'] as Pref[]) {
          const exact = exactPriceFils(plan, pref, 0, wt)
          expect(exact).toBeGreaterThanOrEqual(bounds.minFils)
          expect(exact).toBeLessThanOrEqual(bounds.maxFils)
        }
      }
    }
  })

  it('returns whole fils, because Stripe rejects fractional amounts', () => {
    for (const plan of ALL_PLANS) {
      for (const pref of ['Veg', 'NonVeg'] as Pref[]) {
        expect(Number.isInteger(exactPriceFils(plan, pref, 0, '6DAYS'))).toBe(true)
      }
      for (let n = 1; n <= 5; n++) {
        expect(Number.isInteger(exactPriceFils(plan, 'Religious', n, '6DAYS'))).toBe(true)
      }
    }
  })
})

describe('resolvePref reads the preference string one way everywhere', () => {
  it('maps the canonical stored values', () => {
    expect(resolvePref('Veg')).toBe('Veg')
    expect(resolvePref('Non Veg')).toBe('NonVeg')
    expect(resolvePref('Religious Preference')).toBe('Religious')
  })

  it('handles the historical labels that were never backfilled', () => {
    expect(resolvePref('Plant-based')).toBe('Veg')
    expect(resolvePref('Vegetarian')).toBe('Veg')
    expect(resolvePref('Non-Vegetarian')).toBe('NonVeg')
  })

  it('is case-insensitive', () => {
    expect(resolvePref('VEGETARIAN')).toBe('Veg')
    expect(resolvePref('religious preference')).toBe('Religious')
  })

  it('never resolves unknown or empty input to the CHEAPEST option', () => {
    // This function decides what a customer owes. An unrecognised string
    // falling to Veg would be a free discount for anyone who sends junk.
    for (const junk of ['', null, undefined, 'asdf', '???', 'preference']) {
      const pref = resolvePref(junk)
      expect(pref).toBe('NonVeg')
      const price = exactPriceFils('Monthly Max', pref, 0, '6DAYS')
      const cheapest = priceBoundsFils('Monthly Max', '6DAYS').minFils
      expect(price).toBeGreaterThan(cheapest)
    }
  })

  it('does not mistake "non veg" for veg on a substring match', () => {
    // 'non veg' contains 'veg'; the !includes('non') guard is what saves it,
    // and getting this backwards would hand every non-veg customer veg pricing.
    expect(resolvePref('non veg')).toBe('NonVeg')
    expect(resolvePref('NonVeg')).toBe('NonVeg')
    expect(resolvePref('Non Veg')).toBe('NonVeg')
  })
})

describe('the checkout route enforces the exact price', () => {
  it('compares against exactPriceFils and no longer accepts a band', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/app/api/checkout/route.ts', 'utf8')

    expect(src).toContain('exactPriceFils')
    expect(src).toContain('amount !== expectedFils')
    // The band must not be what money is validated against any more.
    expect(src).not.toMatch(/amount\s*<\s*bounds\.minFils/)
    expect(src).not.toMatch(/amount\s*>\s*bounds\.maxFils/)
  })

  it('derives the preference with the shared resolver, not a local match', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/app/api/checkout/route.ts', 'utf8')
    expect(src).toContain('resolvePref(preference)')
  })
})

describe('resolvePref has exactly one definition in the codebase', () => {
  it('is not copied back into savings.ts or meal-pricing.ts', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of [
      'src/contexts/subscriptions/domain/savings.ts',
      'src/contexts/dorm-wars/domain/meal-pricing.ts',
    ]) {
      const src = readFileSync(f, 'utf8')
      expect(src, `${f} redefines resolvePref — import it from pricing.ts instead`)
        .not.toMatch(/function resolvePref\s*\(/)
    }
  })
})

describe('cycle totals land on real coins', () => {
  // The religious-mix weekly table carries 21.67 (= 130 ÷ 6). Multiplying it
  // back out leaked the truncation: 130.02 AED/week on the plan card, and a
  // "Save AED 16.08" badge derived from two such totals.
  it('Weekly Flex mixed (2 veg days, 6DAYS) is AED 130, not 130.02', () => {
    expect(exactPriceFils('Weekly Flex', 'Religious', 2, '6DAYS')).toBe(13_000)
  })

  it('every default total is a multiple of 5 fils', () => {
    for (const plan of ALL_PLANS) {
      for (const week of ['5DAYS', '6DAYS'] as const) {
        for (const pref of ['Veg', 'NonVeg'] as Pref[]) {
          expect(exactPriceFils(plan, pref, 0, week) % 5).toBe(0)
        }
        const W = week === '5DAYS' ? 5 : 6
        for (let veg = 1; veg < W; veg++) {
          expect(exactPriceFils(plan, 'Religious', veg, week) % 5).toBe(0)
        }
      }
    }
  })
})

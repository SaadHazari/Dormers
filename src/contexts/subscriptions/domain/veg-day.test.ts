import { describe, it, expect } from 'vitest'
import {
  WORKING_DAY_NAMES,
  isVegOnDayName,
  preferenceKindFor,
  resolveVegDayNames,
  vegDayNumbersFor,
  type VegDaySources,
} from './veg-day'

const religious = (customerVeg: string[] | null, subVeg?: string[] | null): VegDaySources => ({
  customer: { meal_preference_type: 'Religious Preference', veg_days: customerVeg },
  subscription: subVeg === undefined ? null : { veg_days: subVeg },
})

describe('veg days for a religious customer', () => {
  it('uses the saved days when there is no plan yet (the new-signup menu)', () => {
    // YUG5909K695 on 2026-09-14: signed up with Wednesday veg, no plan bought.
    const src = religious(['Wednesday'])
    expect([...vegDayNumbersFor(src, '5DAYS')]).toEqual([2])
    expect(isVegOnDayName(src, 'Wednesday')).toBe(true)
    expect(isVegOnDayName(src, 'Tuesday')).toBe(false)
  })

  it("uses the plan's snapshot over the saved days once a plan exists", () => {
    // A renewal checkout rewrites customers.veg_days to the NEXT plan's days
    // while the current plan still runs — this cycle cooks the snapshot.
    const src = religious(['Thursday'], ['Monday'])
    expect(resolveVegDayNames(src)).toEqual(['Monday'])
    expect([...vegDayNumbersFor(src, '6DAYS')]).toEqual([0])
    expect(isVegOnDayName(src, 'Monday')).toBe(true)
    expect(isVegOnDayName(src, 'Thursday')).toBe(false)
  })

  it('falls back to the saved days when the plan carries none', () => {
    expect(resolveVegDayNames(religious(['Friday'], null))).toEqual(['Friday'])
    expect(resolveVegDayNames(religious(['Friday'], []))).toEqual(['Friday'])
  })

  it('drops a Saturday pick on a 5-day week', () => {
    expect([...vegDayNumbersFor(religious(['Monday', 'Saturday']), '5DAYS')]).toEqual([0])
  })

  it('matches day names case-insensitively', () => {
    expect(isVegOnDayName(religious(['wednesday']), 'WEDNESDAY')).toBe(true)
  })
})

describe('veg days for plain preferences', () => {
  it('Veg eats veg every working day', () => {
    const src: VegDaySources = { customer: { meal_preference_type: 'Veg', veg_days: null }, subscription: null }
    expect(vegDayNumbersFor(src, '6DAYS').size).toBe(6)
    expect(isVegOnDayName(src, 'Saturday')).toBe(true)
  })

  it('Non Veg ignores stale veg days left on an old plan', () => {
    const src: VegDaySources = {
      customer: { meal_preference_type: 'Non Veg', veg_days: null },
      subscription: { veg_days: ['Tuesday', 'Thursday'] },
    }
    expect(vegDayNumbersFor(src, '6DAYS').size).toBe(0)
    expect(isVegOnDayName(src, 'Tuesday')).toBe(false)
  })
})

describe('the plan being delivered decides the diet', () => {
  // A renewal checkout rewrites customers.meal_preference_type to the NEXT
  // plan's diet the moment it is paid, while this plan still has dinners left.
  it('keeps a religious plan religious after the customer renews as Non Veg', () => {
    const src: VegDaySources = {
      customer: { meal_preference_type: 'Non Veg', veg_days: null },
      subscription: { meal_preference_type: 'Religious Preference', veg_days: ['Monday', 'Friday'] },
    }
    expect([...vegDayNumbersFor(src, '5DAYS')]).toEqual([0, 4])
    expect(isVegOnDayName(src, 'Friday')).toBe(true)
    expect(preferenceKindFor(src)).toBe('religious')
  })

  it('keeps a Non Veg plan non-veg after the customer renews as Veg', () => {
    const src: VegDaySources = {
      customer: { meal_preference_type: 'Veg', veg_days: null },
      subscription: { meal_preference_type: 'Non Veg', veg_days: null },
    }
    expect(vegDayNumbersFor(src, '6DAYS').size).toBe(0)
    expect(isVegOnDayName(src, 'Monday')).toBe(false)
    expect(preferenceKindFor(src)).toBe('nonveg')
  })

  it("uses the customer's diet for a plan row that has none (older rows)", () => {
    const src: VegDaySources = {
      customer: { meal_preference_type: 'Veg', veg_days: null },
      subscription: { meal_preference_type: null, veg_days: null },
    }
    expect(vegDayNumbersFor(src, '6DAYS').size).toBe(6)
    expect(preferenceKindFor(src)).toBe('veg')
  })
})

describe('the customer menu and the kitchen agree', () => {
  // vegDayNumbersFor feeds the dashboard and menu; isVegOnDayName feeds labels,
  // the delivery queue and kitchen counts. Same rows in, same answer out.
  const prefs = ['Religious Preference', 'Veg', 'Non Veg', null]
  const daySets = [null, [], ['Wednesday'], ['Monday', 'Saturday'], ['Tuesday', 'Thursday', 'Friday']]
  const cases: VegDaySources[] = []
  for (const meal_preference_type of prefs)
    for (const custDays of daySets) {
      cases.push({ customer: { meal_preference_type, veg_days: custDays }, subscription: null })
      for (const subDays of daySets)
        for (const subPref of [undefined, null, ...prefs])
          cases.push({ customer: { meal_preference_type, veg_days: custDays }, subscription: { veg_days: subDays, meal_preference_type: subPref } })
    }

  it.each(['5DAYS', '6DAYS'] as const)('on every working day of a %s week', (weekType) => {
    for (const src of cases) {
      const numbers = vegDayNumbersFor(src, weekType)
      numbers.forEach((i) => expect(isVegOnDayName(src, WORKING_DAY_NAMES[i])).toBe(true))
      const working = weekType === '5DAYS' ? 5 : 6
      for (let i = 0; i < working; i++) {
        expect(numbers.has(i), JSON.stringify({ src, day: WORKING_DAY_NAMES[i] }))
          .toBe(isVegOnDayName(src, WORKING_DAY_NAMES[i]))
      }
    }
  })
})

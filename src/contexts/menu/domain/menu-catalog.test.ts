/**
 * Characterization tests for the menu catalog — locks in the current shape
 * (4-week rotation, dish IDs, week assignments) so structural moves can't
 * silently corrupt the catalog.
 */

import { describe, it, expect } from 'vitest'
import { MENU_DATA, getMenuWeek, type Week } from './catalog-data'
import { staticMenuRepository } from './static-menu-repository'

describe('menu catalog data', () => {
  it('has dishes in all four weeks', () => {
    const weeks: Week[] = ['week1', 'week2', 'week3', 'week4']
    for (const w of weeks) {
      const wDishes = MENU_DATA.filter((d) => d.week === w)
      expect(wDishes.length, `week ${w} has zero dishes`).toBeGreaterThan(0)
    }
  })

  it('all dishes have unique ids', () => {
    const ids = MENU_DATA.map((d) => d.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('all dishes have non-empty names and required nutrition fields', () => {
    for (const d of MENU_DATA) {
      expect(d.name.length, `dish id ${d.id} has empty name`).toBeGreaterThan(0)
      expect(d.nutrients.calories).toBeTruthy()
      expect(d.nutrients.protein).toBeTruthy()
      expect(d.nutrients.carbs).toBeTruthy()
      expect(d.nutrients.fat).toBeTruthy()
    }
  })
})

describe('getMenuWeek — anchor is 2026-04-13 (Mon, week1)', () => {
  it('returns week1 for the anchor Monday', () => {
    expect(getMenuWeek(new Date('2026-04-13T12:00:00Z'))).toBe('week1')
  })

  it('returns week2 one week after the anchor', () => {
    expect(getMenuWeek(new Date('2026-04-20T12:00:00Z'))).toBe('week2')
  })

  it('returns week4 three weeks after the anchor', () => {
    expect(getMenuWeek(new Date('2026-05-04T12:00:00Z'))).toBe('week4')
  })

  it('wraps back to week1 after four weeks', () => {
    expect(getMenuWeek(new Date('2026-05-11T12:00:00Z'))).toBe('week1')
  })
})

describe('staticMenuRepository — wraps catalog-data', () => {
  it('resolveWeekForDate matches getMenuWeek', () => {
    const d = new Date('2026-04-20T12:00:00Z')
    expect(staticMenuRepository.resolveWeekForDate(d)).toBe(getMenuWeek(d))
  })

  it('getDishesForWeek returns only that week', () => {
    const dishes = staticMenuRepository.getDishesForWeek('week2')
    expect(dishes.length).toBeGreaterThan(0)
    for (const d of dishes) {
      expect(d.week).toBe('week2')
    }
  })

  it('getAllDishes returns the full catalog', () => {
    expect(staticMenuRepository.getAllDishes().length).toBe(MENU_DATA.length)
  })
})

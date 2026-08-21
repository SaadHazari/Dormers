/**
 * Guards the one calculation behind every past-plans surface. Four places
 * render finished plans (profile glimpse, both plan pages, the no-plan view)
 * and all four link to /dashboard/history — so "which plans, in what order,
 * and how many" has to be a single answer. A copy of this logic drifting is
 * exactly how the profile glimpse would end up showing a different pair than
 * the top of the history page.
 */

import { describe, it, expect } from 'vitest'

import { endedPlansFrom, pastPlansSummary, seeAllLabel, GLIMPSE_COUNT } from './past-plans'

type Row = {
  id: string
  plan_name: string
  status: string
  start_date: string
  end_date: string | null
  total_meals: number
  delivered_meals: number
  skipped_meals_count: number
}

const plan = (over: Partial<Row> & { id: string }): Row => ({
  plan_name: 'Monthly Premium',
  status: 'Ended',
  start_date: '2026-02-01',
  end_date: '2026-03-01',
  total_meals: 24,
  delivered_meals: 22,
  skipped_meals_count: 2,
  ...over,
})

describe('endedPlansFrom', () => {
  it('keeps only finished plans — a live plan is not history', () => {
    const rows = [
      plan({ id: 'a' }),
      plan({ id: 'b', status: 'Active' }),
      plan({ id: 'c', status: 'Paused' }),
      plan({ id: 'd', status: 'Scheduled' }),
    ]
    expect(endedPlansFrom(rows).map(p => p.id)).toEqual(['a'])
  })

  it('returns the most recently finished plan first', () => {
    const rows = [
      plan({ id: 'older',  end_date: '2026-01-22' }),
      plan({ id: 'newest', end_date: '2026-03-01' }),
      plan({ id: 'middle', end_date: '2026-02-10' }),
    ]
    expect(endedPlansFrom(rows).map(p => p.id)).toEqual(['newest', 'middle', 'older'])
  })

  it('does not fall over on a finished plan with no end date on file', () => {
    const rows = [plan({ id: 'dated', end_date: '2026-03-01' }), plan({ id: 'undated', end_date: null })]
    expect(endedPlansFrom(rows).map(p => p.id)).toEqual(['dated', 'undated'])
  })

  it('gives an empty list, never undefined, when nothing has finished', () => {
    expect(endedPlansFrom([])).toEqual([])
  })
})

describe('pastPlansSummary', () => {
  it('counts the plans and the dinners they actually delivered', () => {
    const rows = [
      plan({ id: 'a', delivered_meals: 22 }),
      plan({ id: 'b', delivered_meals: 5 }),
    ]
    expect(pastPlansSummary(rows)).toEqual([
      { n: 2, label: 'finished plans' },
      { n: 27, label: 'dinners delivered' },
    ])
  })

  it('reads as singular for one plan and one dinner', () => {
    expect(pastPlansSummary([plan({ id: 'a', delivered_meals: 1 })])).toEqual([
      { n: 1, label: 'finished plan' },
      { n: 1, label: 'dinner delivered' },
    ])
  })

  it('returns null with nothing to summarise, so no line renders', () => {
    expect(pastPlansSummary([])).toBeNull()
  })

  it('drops the dinner segment rather than claiming "0 dinners delivered"', () => {
    // A plan that ended before a single delivery landed is real (refunds,
    // out-of-zone cancels). The count of plans is still worth stating.
    expect(pastPlansSummary([plan({ id: 'a', delivered_meals: 0 })])).toEqual([
      { n: 1, label: 'finished plan' },
    ])
  })

  it('keeps the number out of the label so callers can emphasise it', () => {
    // The whole point of segments: every equity line in the product paints
    // its figures navy against muted words. A label that embedded its own
    // number would force the trees back into string-splitting.
    const [first] = pastPlansSummary([plan({ id: 'a' })]) ?? []
    expect(first.label).not.toMatch(/\d/)
  })
})

describe('seeAllLabel', () => {
  it('names the total once there is more behind the link than on screen', () => {
    expect(seeAllLabel(GLIMPSE_COUNT + 1)).toBe(`See all ${GLIMPSE_COUNT + 1}`)
    expect(seeAllLabel(9)).toBe('See all 9')
  })

  it('stays bare when the glimpse is already showing everything', () => {
    // "See all 2" beside exactly two tiles reads as a lie about there being more.
    expect(seeAllLabel(GLIMPSE_COUNT)).toBe('See all')
    expect(seeAllLabel(1)).toBe('See all')
  })
})

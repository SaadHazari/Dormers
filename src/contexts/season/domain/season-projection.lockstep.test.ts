import { describe, it, expect } from 'vitest'
import { projectPlan } from './season-projection'
import { PROJECTION_FIXTURES } from './season-projection.fixtures'

describe('season projection fixtures (lockstep with _season_project_plan)', () => {
  it('has unique fixture names the SQL report can point at', () => {
    const names = PROJECTION_FIXTURES.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
    for (const n of names) expect(n).not.toContain("'")
  })

  for (const f of PROJECTION_FIXTURES) {
    it(f.name, () => {
      const { planId, ...projected } = projectPlan(f.plan, {
        todayAe: f.todayAe, closureDates: new Set(f.closureDates), wrapUpDay: f.wrapUpDay, closeDay: f.closeDay,
      })
      expect(planId).toBe(f.plan.id)
      expect(projected).toEqual(f.expected)
    })
  }
})

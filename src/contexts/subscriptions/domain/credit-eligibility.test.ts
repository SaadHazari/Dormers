/**
 * Credit plan-eligibility. A NULL restriction means "usable anywhere", which
 * is what every credit issued before the intake-pause feature carries — the
 * regression tests below are the guard on that.
 */

import { describe, it, expect } from 'vitest'
import { creditAppliesToPlan, MONTHLY_PLAN_IDS } from './credit-eligibility'

describe('creditAppliesToPlan', () => {
  it('applies an unrestricted credit to every plan (existing behaviour)', () => {
    for (const plan of ['monthly-max', 'monthly-premium', 'weekly-flex', 'trial', 'welcome-gift', 'staff-monthly'] as const) {
      expect(creditAppliesToPlan(null, plan)).toBe(true)
      expect(creditAppliesToPlan(undefined, plan)).toBe(true)
    }
  })

  it('applies a monthly-restricted credit to both monthly plans', () => {
    expect(creditAppliesToPlan([...MONTHLY_PLAN_IDS], 'monthly-max')).toBe(true)
    expect(creditAppliesToPlan([...MONTHLY_PLAN_IDS], 'monthly-premium')).toBe(true)
  })

  it('rejects a monthly-restricted credit on weekly, trial, gift and staff plans', () => {
    for (const plan of ['weekly-flex', 'trial', 'welcome-gift', 'staff-monthly'] as const) {
      expect(creditAppliesToPlan([...MONTHLY_PLAN_IDS], plan)).toBe(false)
    }
  })

  it('treats an empty restriction array as restricting everything', () => {
    expect(creditAppliesToPlan([], 'monthly-max')).toBe(false)
  })

  it('does not include staff-monthly in MONTHLY_PLAN_IDS', () => {
    expect(MONTHLY_PLAN_IDS).not.toContain('staff-monthly')
  })
})

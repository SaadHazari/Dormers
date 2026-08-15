/**
 * getCreditSplitByPlan is the single-query alternative to calling
 * getRedeemableCredit(sb, userId, planId) once per selectable plan. It
 * fetches the approved credit rows ONCE, unfiltered, then computes each
 * plan's {balanceFils, lockedFils} in memory. These tests pin: one query
 * regardless of how many planIds are requested, the split matching
 * getRedeemableCredit's per-plan behaviour, and numeric-string coercion
 * (PostgREST returns `numeric` columns as strings, so a missed Number()
 * silently string-concatenates on a money display).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCreditSplitByPlan } from './subscriptions-repo'

const eqMock = vi.fn()
const selectMock = vi.fn()
const fromMock = vi.fn()

function sbWith(rows: unknown[]) {
  const eqInner = vi.fn().mockResolvedValue({ data: rows, error: null })
  eqMock.mockReturnValue({ eq: eqInner })
  selectMock.mockReturnValue({ eq: eqMock })
  fromMock.mockReturnValue({ select: selectMock })
  return { from: fromMock } as never
}

beforeEach(() => {
  eqMock.mockReset()
  selectMock.mockReset()
  fromMock.mockReset()
})

describe('getCreditSplitByPlan', () => {
  it('fetches the credits table exactly once regardless of planId count', async () => {
    const sb = sbWith([{ amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] }])
    await getCreditSplitByPlan(sb, 'user-1', ['trial', 'weekly-flex', 'monthly-premium', 'monthly-max'])
    expect(fromMock).toHaveBeenCalledTimes(1)
    expect(fromMock).toHaveBeenCalledWith('credits')
  })

  it('splits an unrestricted credit as redeemable on every plan', async () => {
    const sb = sbWith([{ amount_aed: 30, eligible_plan_ids: null }])
    const res = await getCreditSplitByPlan(sb, 'user-1', ['trial', 'weekly-flex', 'monthly-premium'])
    expect(res.trial).toEqual({ balanceFils: 3000, lockedFils: 0 })
    expect(res['weekly-flex']).toEqual({ balanceFils: 3000, lockedFils: 0 })
    expect(res['monthly-premium']).toEqual({ balanceFils: 3000, lockedFils: 0 })
  })

  it('locks a monthly-restricted credit on trial and weekly-flex, redeems it on the monthly plans', async () => {
    const sb = sbWith([{ amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] }])
    const res = await getCreditSplitByPlan(sb, 'user-1', ['trial', 'weekly-flex', 'monthly-premium', 'monthly-max'])
    expect(res.trial).toEqual({ balanceFils: 0, lockedFils: 2000 })
    expect(res['weekly-flex']).toEqual({ balanceFils: 0, lockedFils: 2000 })
    expect(res['monthly-premium']).toEqual({ balanceFils: 2000, lockedFils: 0 })
    expect(res['monthly-max']).toEqual({ balanceFils: 2000, lockedFils: 0 })
  })

  it('splits a mixed balance correctly per plan', async () => {
    const sb = sbWith([
      { amount_aed: 50, eligible_plan_ids: null },
      { amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] },
    ])
    const res = await getCreditSplitByPlan(sb, 'user-1', ['weekly-flex', 'monthly-max'])
    expect(res['weekly-flex']).toEqual({ balanceFils: 5000, lockedFils: 2000 })
    expect(res['monthly-max']).toEqual({ balanceFils: 7000, lockedFils: 0 })
  })

  it('coerces string amount_aed (PostgREST numeric) before arithmetic', async () => {
    // PostgREST serializes `numeric` columns as strings. A missed Number()
    // here would string-concatenate ('20' * 100 is fine, but summing two
    // string rows via `+` would silently concatenate). This pins the fix.
    const sb = sbWith([
      { amount_aed: '20.5' as unknown as number, eligible_plan_ids: null },
      { amount_aed: '9.5' as unknown as number, eligible_plan_ids: null },
    ])
    const res = await getCreditSplitByPlan(sb, 'user-1', ['trial'])
    expect(res.trial).toEqual({ balanceFils: 3000, lockedFils: 0 })
  })

  it('returns a zeroed split for a plan with no matching rows', async () => {
    const sb = sbWith([])
    const res = await getCreditSplitByPlan(sb, 'user-1', ['trial'])
    expect(res.trial).toEqual({ balanceFils: 0, lockedFils: 0 })
  })
})

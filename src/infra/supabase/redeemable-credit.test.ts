/**
 * getRedeemableCredit must stay the single source of truth for BOTH the
 * displayed credit and the redeemed credit. These tests pin the split
 * between redeemable and locked, and guard that unrestricted credits keep
 * behaving exactly as they did before plan restrictions existed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRedeemableCredit } from './subscriptions-repo'

const orderMock = vi.fn()

function sbWith(rows: unknown[]) {
  orderMock.mockResolvedValue({ data: rows, error: null })
  return {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: orderMock }) }) }),
    }),
  } as never
}

beforeEach(() => orderMock.mockReset())

describe('getRedeemableCredit', () => {
  it('sums unrestricted credits with no plan filter (existing behaviour)', async () => {
    const sb = sbWith([
      { id: 'a', amount_aed: 30, eligible_plan_ids: null },
      { id: 'b', amount_aed: 12.5, eligible_plan_ids: null },
    ])
    const res = await getRedeemableCredit(sb, 'user-1')
    expect(res.balanceFils).toBe(4250)
    expect(res.lockedFils).toBe(0)
    expect(res.rows).toHaveLength(2)
  })

  it('keeps unrestricted credits redeemable on a weekly plan', async () => {
    const sb = sbWith([{ id: 'a', amount_aed: 30, eligible_plan_ids: null }])
    const res = await getRedeemableCredit(sb, 'user-1', 'weekly-flex')
    expect(res.balanceFils).toBe(3000)
    expect(res.lockedFils).toBe(0)
  })

  it('redeems a monthly-restricted credit on a monthly plan', async () => {
    const sb = sbWith([{ id: 'w', amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] }])
    const res = await getRedeemableCredit(sb, 'user-1', 'monthly-premium')
    expect(res.balanceFils).toBe(2000)
    expect(res.lockedFils).toBe(0)
    expect(res.lockedRequiresMonthly).toBe(false)
  })

  it('locks a monthly-restricted credit on a weekly plan', async () => {
    const sb = sbWith([{ id: 'w', amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] }])
    const res = await getRedeemableCredit(sb, 'user-1', 'weekly-flex')
    expect(res.balanceFils).toBe(0)
    expect(res.rows).toHaveLength(0)
    expect(res.lockedFils).toBe(2000)
    expect(res.lockedRequiresMonthly).toBe(true)
  })

  it('locks a monthly-restricted credit on a trial plan too', async () => {
    const sb = sbWith([{ id: 'w', amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] }])
    const res = await getRedeemableCredit(sb, 'user-1', 'trial')
    expect(res.lockedFils).toBe(2000)
    expect(res.lockedRequiresMonthly).toBe(true)
  })

  it('locks a non-monthly-restricted credit without flagging lockedRequiresMonthly', async () => {
    const sb = sbWith([{ id: 't', amount_aed: 15, eligible_plan_ids: ['trial'] }])
    const res = await getRedeemableCredit(sb, 'user-1', 'weekly-flex')
    expect(res.lockedFils).toBeGreaterThan(0)
    expect(res.lockedRequiresMonthly).toBe(false)
  })

  it('splits a mixed balance correctly on a weekly plan', async () => {
    const sb = sbWith([
      { id: 'referral', amount_aed: 50, eligible_plan_ids: null },
      { id: 'waitlist', amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] },
    ])
    const res = await getRedeemableCredit(sb, 'user-1', 'weekly-flex')
    expect(res.balanceFils).toBe(5000)
    expect(res.rows.map(r => r.id)).toEqual(['referral'])
    expect(res.lockedFils).toBe(2000)
    expect(res.lockedRequiresMonthly).toBe(true)
  })

  it('redeems the whole mixed balance on a monthly plan', async () => {
    const sb = sbWith([
      { id: 'referral', amount_aed: 50, eligible_plan_ids: null },
      { id: 'waitlist', amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] },
    ])
    const res = await getRedeemableCredit(sb, 'user-1', 'monthly-max')
    expect(res.balanceFils).toBe(7000)
    expect(res.lockedFils).toBe(0)
  })
})

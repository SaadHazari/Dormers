import { describe, it, expect } from 'vitest'
import { walletSummary } from './credit-wallet'

const MONTHLY = ['monthly-max', 'monthly-premium']

describe('walletSummary', () => {
  it('reports nothing to show on an empty wallet', () => {
    expect(walletSummary([])).toEqual({ totalAed: 0, monthlyOnlyAed: 0, hasCredit: false, note: null })
  })

  it('sums unrestricted credit with no note', () => {
    expect(walletSummary([
      { amount_aed: 25, eligible_plan_ids: null },
      { amount_aed: 10, eligible_plan_ids: null },
    ])).toEqual({ totalAed: 35, monthlyOnlyAed: 0, hasCredit: true, note: null })
  })

  // A held credit that will not apply must always be explained on screen.
  it('explains a monthly-only credit', () => {
    expect(walletSummary([{ amount_aed: 20, eligible_plan_ids: MONTHLY }]))
      .toEqual({
        totalAed: 20, monthlyOnlyAed: 20, hasCredit: true,
        note: 'AED 20 of this unlocks on a monthly plan.',
      })
  })

  // A credit restricted to a non-monthly plan must still count as restricted
  // — testing only for a monthly id in eligible_plan_ids would let this slip
  // through and get shown as freely spendable, which it is not.
  it('treats a non-null, non-monthly restriction as still restricted', () => {
    expect(walletSummary([{ amount_aed: 10, eligible_plan_ids: ['weekly-flex'] }]))
      .toEqual({
        totalAed: 10, monthlyOnlyAed: 10, hasCredit: true,
        note: 'AED 10 of this unlocks on a monthly plan.',
      })
  })

  it('separates a mixed balance', () => {
    expect(walletSummary([
      { amount_aed: 15, eligible_plan_ids: null },
      { amount_aed: 20, eligible_plan_ids: MONTHLY },
    ])).toEqual({
      totalAed: 35, monthlyOnlyAed: 20, hasCredit: true,
      note: 'AED 20 of this unlocks on a monthly plan.',
    })
  })

  // PostgREST returns numeric columns as strings; concatenation instead of
  // addition here would silently show "1520" rather than 35.
  it('coerces string amounts before summing', () => {
    expect(walletSummary([
      { amount_aed: '15' as unknown as number, eligible_plan_ids: null },
      { amount_aed: '20' as unknown as number, eligible_plan_ids: null },
    ]).totalAed).toBe(35)
  })
})

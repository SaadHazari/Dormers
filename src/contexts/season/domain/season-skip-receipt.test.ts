import { describe, it, expect } from 'vitest'
import { receiptsFromTransition } from './season-skip-receipt'

describe('receiptsFromTransition', () => {
  it('reads the reconciled skips from a transition result', () => {
    const state = {
      phase: 'winding_down',
      reconciled: [
        { subscription_id: 's1', customer_id: 'c1', meal_dates: ['2026-09-11', '2026-09-16'], credit_fils: 1980, skipped_no_value: 0 },
      ],
    }
    expect(receiptsFromTransition(state)).toEqual([
      { subscriptionId: 's1', customerId: 'c1', mealDates: ['2026-09-11', '2026-09-16'], creditFils: 1980, source: 'reconciled' },
    ])
  })

  it('drops plans whose skips could not be valued', () => {
    const state = { reconciled: [{ subscription_id: 's2', customer_id: 'c2', meal_dates: [], credit_fils: null, skipped_no_value: 2 }] }
    expect(receiptsFromTransition(state)).toEqual([])
  })

  it('returns nothing for a transition without reconciliation', () => {
    expect(receiptsFromTransition({ phase: 'open' })).toEqual([])
    expect(receiptsFromTransition(null)).toEqual([])
  })
})

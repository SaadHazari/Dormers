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

  it('skips items that are null or not objects', () => {
    const state = {
      reconciled: [null, 7, 'x', { subscription_id: 'a', customer_id: 'c', meal_dates: ['2026-09-21'], credit_fils: 1980, skipped_no_value: 0 }],
    }
    expect(receiptsFromTransition(state)).toEqual([
      { subscriptionId: 'a', customerId: 'c', mealDates: ['2026-09-21'], creditFils: 1980, source: 'reconciled' },
    ])
  })

  it('ignores the extra keys the redesigned reconcile adds', () => {
    const state = {
      reconciled: [
        { subscription_id: 'a', customer_id: 'c', meal_dates: ['2026-09-09', '2026-09-10'], credit_fils: 2200, skipped_no_value: 0, dropped_dates: ['2026-10-06'], credited_before: 1, credited_after: 2, conservation: 'checked' },
        { subscription_id: 'b', customer_id: 'c', meal_dates: [], credit_fils: null, skipped_no_value: 0, grants_before: 1, grants_after: 0 },
      ],
    }
    expect(receiptsFromTransition(state)).toEqual([
      { subscriptionId: 'a', customerId: 'c', mealDates: ['2026-09-09', '2026-09-10'], creditFils: 2200, source: 'reconciled' },
    ])
  })

  it('returns nothing for a transition without reconciliation', () => {
    expect(receiptsFromTransition({ phase: 'open' })).toEqual([])
    expect(receiptsFromTransition(null)).toEqual([])
  })
})

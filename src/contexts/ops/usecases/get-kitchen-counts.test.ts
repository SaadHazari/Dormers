/**
 * Tests for getKitchenCounts — the critical behavior is FAIL LOUD: a DB read
 * error must surface `unavailable: true`, never a believable 0/0. Also covers
 * the core counting + skip rules. The Supabase client + veg-day helper are
 * mocked so the test is deterministic and offline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, captureErrorMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  captureErrorMock: vi.fn(),
}))

vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({ from: fromMock }),
}))
// Deterministic stub: a customer is "veg today" iff their preference is 'veg'.
vi.mock('@/contexts/subscriptions/domain/veg-day', () => ({
  isVegOnDayName: (pref: string | null) => pref === 'veg',
}))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: captureErrorMock }))

import { getKitchenCounts } from './get-kitchen-counts'

type Res = { data: unknown; error: unknown }

function setup(subsRes: Res, customersRes: Res) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'subscriptions') {
      return { select: () => ({ in: () => Promise.resolve(subsRes) }) }
    }
    return { select: () => Promise.resolve(customersRes) }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getKitchenCounts — fail loud', () => {
  it('returns unavailable:true and 0/0 when the subscriptions read errors', async () => {
    setup({ data: null, error: { message: 'pg down' } }, { data: [], error: null })
    const r = await getKitchenCounts('2026-06-22', 'Monday', false)
    expect(r).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: true })
    expect(captureErrorMock).toHaveBeenCalledOnce()
  })

  it('returns unavailable:true when the customers read errors', async () => {
    setup({ data: [], error: null }, { data: null, error: { message: 'pg down' } })
    const r = await getKitchenCounts('2026-06-22', 'Monday', false)
    expect(r.unavailable).toBe(true)
  })
})

describe('getKitchenCounts — counting', () => {
  it('counts veg vs non-veg by preference', async () => {
    setup(
      {
        data: [
          { id: 's1', customer_id: 'c1', week_type: '6DAYS', skipped_dates: [], paused_dates: [] },
          { id: 's2', customer_id: 'c2', week_type: '6DAYS', skipped_dates: [], paused_dates: [] },
        ],
        error: null,
      },
      {
        data: [
          { id: 'c1', meal_preference_type: 'veg', veg_days: null },
          { id: 'c2', meal_preference_type: 'nonveg', veg_days: null },
        ],
        error: null,
      },
    )
    const r = await getKitchenCounts('2026-06-22', 'Monday', false)
    expect(r).toEqual({ vegCount: 1, nonVegCount: 1, unavailable: false })
  })

  it('skips 5DAYS subscriptions on Saturday', async () => {
    setup(
      {
        data: [
          { id: 's1', customer_id: 'c1', week_type: '5DAYS', skipped_dates: [], paused_dates: [] },
        ],
        error: null,
      },
      { data: [{ id: 'c1', meal_preference_type: 'veg', veg_days: null }], error: null },
    )
    const r = await getKitchenCounts('2026-06-27', 'Saturday', true)
    expect(r).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: false })
  })

  it('skips a subscription whose skipped_dates includes today', async () => {
    setup(
      {
        data: [
          { id: 's1', customer_id: 'c1', week_type: '6DAYS', skipped_dates: ['2026-06-22'], paused_dates: [] },
        ],
        error: null,
      },
      { data: [{ id: 'c1', meal_preference_type: 'nonveg', veg_days: null }], error: null },
    )
    const r = await getKitchenCounts('2026-06-22', 'Monday', false)
    expect(r).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: false })
  })
})

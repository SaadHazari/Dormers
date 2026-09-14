/**
 * Tests for getKitchenCounts — the critical behavior is FAIL LOUD: a DB read
 * error must surface `unavailable: true`, never a believable 0/0. Also covers
 * the core counting + skip rules. The Supabase client is mocked so the test is
 * deterministic and offline; the veg-day resolver is real, so the kitchen's
 * count is proven against the same rule the customer's menu uses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, captureErrorMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  captureErrorMock: vi.fn(),
}))

vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({ from: fromMock }),
}))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: captureErrorMock }))

import { getKitchenCounts } from './get-kitchen-counts'

type Res = { data: unknown; error: unknown }

function setup(subsRes: Res, customersRes: Res) {
  // Both queries are now .select(...).in(...) — subscriptions filters by status,
  // customers is scoped by id (Phase 7 capacity change).
  fromMock.mockImplementation(() => ({
    select: () => ({ in: (col: string) => Promise.resolve(col === 'status' ? subsRes : customersRes) }),
  }))
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
    // Non-empty subs so the scoped customers query actually runs (it is skipped
    // when there are no active subscriptions).
    setup(
      { data: [{ id: 's1', customer_id: 'c1', week_type: '6DAYS', skipped_dates: [], paused_dates: [] }], error: null },
      { data: null, error: { message: 'pg down' } },
    )
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

  it("cooks a religious plan's own veg days, not the next plan's saved picks", async () => {
    // A renewal checkout already rewrote customers.veg_days to Thursday; the
    // running plan was bought with Monday.
    const religious = (dayName: string, iso: string) => {
      setup(
        { data: [{ id: 's1', customer_id: 'c1', week_type: '6DAYS', skipped_dates: [], paused_dates: [], veg_days: ['Monday'] }], error: null },
        { data: [{ id: 'c1', meal_preference_type: 'Religious Preference', veg_days: ['Thursday'] }], error: null },
      )
      return getKitchenCounts(iso, dayName, false)
    }
    expect(await religious('Monday', '2026-06-22')).toEqual({ vegCount: 1, nonVegCount: 0, unavailable: false })
    expect(await religious('Thursday', '2026-06-25')).toEqual({ vegCount: 0, nonVegCount: 1, unavailable: false })
  })
})

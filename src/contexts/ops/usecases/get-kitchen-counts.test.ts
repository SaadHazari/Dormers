/**
 * Tests for getKitchenCounts. FAIL LOUD: a read error surfaces
 * `unavailable: true`, never a believable 0/0. The count follows the delivery
 * tick's own conditions and the season gate (spec G5). The Supabase client and
 * the season gate read are mocked; the veg-day resolver and the season rules
 * are real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, captureErrorMock, gateMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  captureErrorMock: vi.fn(),
  gateMock: vi.fn(),
}))

vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({ from: fromMock }),
}))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: captureErrorMock }))
vi.mock('./season-kitchen-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./season-kitchen-gate')>()
  return { ...actual, loadSeasonKitchenGate: gateMock }
})

import { getKitchenCounts } from './get-kitchen-counts'

type Res = { data: unknown; error: unknown }

const NORMAL = { ok: true, gate: 'normal', wrapUpDay: null, closeDay: null, closureDates: new Set<string>() }

function setup(subsRes: Res, customersRes: Res) {
  // Both queries are .select(...).in(...): subscriptions by status, customers by id.
  fromMock.mockImplementation(() => ({
    select: () => ({ in: (col: string) => Promise.resolve(col === 'status' ? subsRes : customersRes) }),
  }))
}

const sub = (over: Record<string, unknown> = {}) => ({
  id: 's1', customer_id: 'c1', status: 'Active', week_type: '6DAYS', skipped_dates: [], paused_dates: [],
  total_meals: 24, delivered_meals: 10, meals_per_day: 1, credited_skip_days: 0, season_buffer_grants: 0,
  season_hold_id: null, resume_cutoff_date: null, last_delivery_tick_date: null, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  gateMock.mockResolvedValue(NORMAL)
})

describe('getKitchenCounts, fail loud', () => {
  it('returns unavailable when the subscriptions read errors', async () => {
    setup({ data: null, error: { message: 'pg down' } }, { data: [], error: null })
    const r = await getKitchenCounts('2026-06-22', 'Monday', false)
    expect(r).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: true, closedForBreak: false })
    expect(captureErrorMock).toHaveBeenCalledOnce()
  })

  it('returns unavailable when the customers read errors', async () => {
    setup({ data: [sub()], error: null }, { data: null, error: { message: 'pg down' } })
    const r = await getKitchenCounts('2026-06-22', 'Monday', false)
    expect(r.unavailable).toBe(true)
  })

  it('returns unavailable when the season cannot be read, without reading plans', async () => {
    gateMock.mockResolvedValue({ ok: false })
    expect(await getKitchenCounts('2026-06-22', 'Monday', false)).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: true, closedForBreak: false })
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('getKitchenCounts, counting', () => {
  it('counts veg vs non-veg by preference', async () => {
    setup(
      { data: [sub(), sub({ id: 's2', customer_id: 'c2' })], error: null },
      { data: [{ id: 'c1', meal_preference_type: 'veg', veg_days: null }, { id: 'c2', meal_preference_type: 'nonveg', veg_days: null }], error: null },
    )
    expect(await getKitchenCounts('2026-06-22', 'Monday', false)).toEqual({ vegCount: 1, nonVegCount: 1, unavailable: false, closedForBreak: false })
  })

  it('skips 5DAYS subscriptions on Saturday', async () => {
    setup({ data: [sub({ week_type: '5DAYS' })], error: null }, { data: [{ id: 'c1', meal_preference_type: 'veg', veg_days: null }], error: null })
    expect(await getKitchenCounts('2026-06-27', 'Saturday', true)).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: false, closedForBreak: false })
  })

  it('skips a subscription whose skipped_dates or paused_dates includes today', async () => {
    setup({ data: [sub({ skipped_dates: ['2026-06-22'] }), sub({ id: 's2', paused_dates: ['2026-06-22'] })], error: null }, { data: [{ id: 'c1', meal_preference_type: 'nonveg', veg_days: null }], error: null })
    expect(await getKitchenCounts('2026-06-22', 'Monday', false)).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: false, closedForBreak: false })
  })

  it("cooks a religious plan's own veg days, not the next plan's saved picks", async () => {
    const religious = (dayName: string, iso: string) => {
      setup(
        { data: [sub({ veg_days: ['Monday'] })], error: null },
        { data: [{ id: 'c1', meal_preference_type: 'Religious Preference', veg_days: ['Thursday'] }], error: null },
      )
      return getKitchenCounts(iso, dayName, false)
    }
    expect(await religious('Monday', '2026-06-22')).toEqual({ vegCount: 1, nonVegCount: 0, unavailable: false, closedForBreak: false })
    expect(await religious('Thursday', '2026-06-25')).toEqual({ vegCount: 0, nonVegCount: 1, unavailable: false, closedForBreak: false })
  })
})

describe('getKitchenCounts, the season (spec G5)', () => {
  const nonVeg = { data: [{ id: 'c1', meal_preference_type: 'nonveg', veg_days: null }], error: null }

  it('reads zero, closed for the break, without reading plans', async () => {
    gateMock.mockResolvedValue({ ok: true, gate: 'closed_for_break', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', closureDates: new Set() })
    expect(await getKitchenCounts('2026-10-07', 'Wednesday', false)).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: false, closedForBreak: true })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('never counts by status alone: a held plan, a plan at its credited cap, a resume after the cutoff', async () => {
    setup({
      data: [
        sub({ id: 'held', season_hold_id: 'h1' }),
        sub({ id: 'done', delivered_meals: 22, credited_skip_days: 2 }),
        sub({ id: 'late', resume_cutoff_date: '2026-06-22' }),
      ],
      error: null,
    }, nonVeg)
    expect(await getKitchenCounts('2026-06-22', 'Monday', false)).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: false, closedForBreak: false })
  })

  it('still counts a plan whose last meal was recorded tonight', async () => {
    setup({ data: [sub({ delivered_meals: 24, last_delivery_tick_date: '2026-06-22' })], error: null }, nonVeg)
    expect((await getKitchenCounts('2026-06-22', 'Monday', false)).nonVegCount).toBe(1)
  })

  it('does not count a closure day', async () => {
    gateMock.mockResolvedValue({ ...NORMAL, closureDates: new Set(['2026-06-22']) })
    setup({ data: [sub()], error: null }, nonVeg)
    expect((await getKitchenCounts('2026-06-22', 'Monday', false)).nonVegCount).toBe(0)
  })

  it('on a buffer day counts only a plan with a grant for today', async () => {
    gateMock.mockResolvedValue({ ok: true, gate: 'buffer_only', wrapUpDay: '2026-10-03', closeDay: '2026-10-06', closureDates: new Set() })
    setup({ data: [sub({ id: 'grant', season_buffer_grants: 1 }), sub({ id: 'none' })], error: null }, nonVeg)
    expect(await getKitchenCounts('2026-10-05', 'Monday', false)).toEqual({ vegCount: 0, nonVegCount: 1, unavailable: false, closedForBreak: false })
  })
})

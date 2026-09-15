import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, gateMock } = vi.hoisted(() => ({ fromMock: vi.fn(), gateMock: vi.fn() }))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ from: fromMock }) }))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: vi.fn() }))
vi.mock('./season-kitchen-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./season-kitchen-gate')>()
  return { ...actual, loadSeasonKitchenGate: gateMock }
})

import { getDormCounts } from './get-dorm-counts'

const sub = (over: Record<string, unknown> = {}) => ({
  id: 's1', customer_id: 'c1', status: 'Active', week_type: '6DAYS', skipped_dates: [], paused_dates: [],
  total_meals: 24, delivered_meals: 10, meals_per_day: 1, credited_skip_days: 0, season_buffer_grants: 0,
  season_hold_id: null, resume_cutoff_date: null, last_delivery_tick_date: null, ...over,
})

function setup(subs: unknown[]) {
  fromMock.mockImplementation(() => ({
    select: () => ({
      in: (col: string) => Promise.resolve(col === 'status'
        ? { data: subs, error: null }
        : { data: [{ id: 'c1', dorm_name: 'Academic City' }, { id: 'c2', dorm_name: 'YUGO' }], error: null }),
    }),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  gateMock.mockResolvedValue({ ok: true, gate: 'normal', wrapUpDay: null, closeDay: null, closureDates: new Set() })
})

describe('getDormCounts (spec G5)', () => {
  it('counts one box per plan the delivery tick cooks, by dorm', async () => {
    setup([sub(), sub({ id: 's2', customer_id: 'c2' }), sub({ id: 's3', customer_id: 'c2', season_hold_id: 'h1' })])
    expect(await getDormCounts('2026-09-28', 'Monday', false)).toEqual({ 'Academic City': 1, YUGO: 1 })
  })

  it('returns nothing while the kitchen is closed for the break', async () => {
    gateMock.mockResolvedValue({ ok: true, gate: 'closed_for_break', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', closureDates: new Set() })
    setup([sub()])
    expect(await getDormCounts('2026-10-07', 'Wednesday', false)).toEqual({})
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('keeps the rider working when the season cannot be read', async () => {
    gateMock.mockResolvedValue({ ok: false })
    setup([sub()])
    expect(await getDormCounts('2026-09-28', 'Monday', false)).toEqual({ 'Academic City': 1 })
  })
})

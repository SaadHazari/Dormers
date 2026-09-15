import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, captureErrorMock } = vi.hoisted(() => ({ fromMock: vi.fn(), captureErrorMock: vi.fn() }))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ from: fromMock }) }))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: captureErrorMock }))

import { loadSeasonKitchenGate, kitchenFactsFor, plansCookingToday } from './season-kitchen-gate'

type Res = { data: unknown; error: unknown }
const gteArgs: string[] = []

function setup(settings: Res, closures: Res = { data: [], error: null }) {
  fromMock.mockImplementation((table: string) => table === 'intake_settings'
    ? { select: () => ({ maybeSingle: () => Promise.resolve(settings) }) }
    : { select: () => ({ gte: (_c: string, from: string) => { gteArgs.push(from); return { lte: () => Promise.resolve(closures) } } }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  gteArgs.length = 0
})

describe('loadSeasonKitchenGate', () => {
  it('cooks normally while open, with today\'s closures', async () => {
    setup({ data: { season_phase: 'open', wrap_up_day: null, close_day: null }, error: null }, { data: [{ closure_date: '2026-09-28' }], error: null })
    const r = await loadSeasonKitchenGate('2026-09-28')
    expect(r).toEqual({ ok: true, gate: 'normal', wrapUpDay: null, closeDay: null, closureDates: new Set(['2026-09-28']) })
    expect(gteArgs).toEqual(['2026-09-28'])
  })

  it('is closed during the break without reading closures', async () => {
    setup({ data: { season_phase: 'break', wrap_up_day: '2026-10-03', close_day: '2026-10-05' }, error: null })
    expect(await loadSeasonKitchenGate('2026-10-07')).toEqual({ ok: true, gate: 'closed_for_break', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', closureDates: new Set() })
    expect(gteArgs).toEqual([])
  })

  it('reads closures from the day after the wrap-up day on a buffer day', async () => {
    setup({ data: { season_phase: 'winding_down', wrap_up_day: '2026-10-03', close_day: '2026-10-06' }, error: null }, { data: [{ closure_date: '2026-10-05' }], error: null })
    const r = await loadSeasonKitchenGate('2026-10-06')
    expect(r).toMatchObject({ ok: true, gate: 'buffer_only' })
    expect(gteArgs).toEqual(['2026-10-04'])
  })

  it('fails loud when the season or the closures cannot be read', async () => {
    setup({ data: null, error: { message: 'pg down' } })
    expect(await loadSeasonKitchenGate('2026-09-28')).toEqual({ ok: false })
    setup({ data: { season_phase: 'open' }, error: null }, { data: null, error: { message: 'pg down' } })
    expect(await loadSeasonKitchenGate('2026-09-28')).toEqual({ ok: false })
    expect(captureErrorMock).toHaveBeenCalledTimes(2)
  })
})

describe('kitchenFactsFor', () => {
  it('maps a subscriptions row with the delivery tick defaults', () => {
    expect(kitchenFactsFor({ status: 'Active', week_type: null, total_meals: 24, skipped_dates: null })).toEqual({
      status: 'Active', seasonHoldId: null, weekType: '6DAYS', mealsPerDay: 1, totalMeals: 24, deliveredMeals: 0,
      creditedSkipDays: 0, skippedDates: [], bufferGrants: 0, resumeCutoffDate: null, lastDeliveryTickDate: null,
    })
  })
})

describe('plansCookingToday', () => {
  const normal = { ok: true as const, gate: 'normal' as const, wrapUpDay: null, closeDay: null, closureDates: new Set<string>() }
  const sub = (over: Record<string, unknown> = {}) => ({
    id: 's', status: 'Active', week_type: '6DAYS', skipped_dates: [], paused_dates: [], total_meals: 24, delivered_meals: 10, ...over,
  })

  it('applies the Saturday, paused-day and delivery-tick rules', () => {
    const subs = [sub({ id: 'ok' }), sub({ id: 'sat', week_type: '5DAYS' }), sub({ id: 'paused', paused_dates: ['2026-09-26'] }), sub({ id: 'held', season_hold_id: 'h' })]
    expect(plansCookingToday(subs, normal, '2026-09-26', true).map((s) => s.id)).toEqual(['ok'])
  })
})

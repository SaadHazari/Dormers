import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { rpcMock, invalidateMock, auditMock, announceMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  invalidateMock: vi.fn(),
  auditMock: vi.fn(),
  announceMock: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ rpc: rpcMock }) }))
vi.mock('@/infra/config/intake', () => ({ invalidateIntakeCache: invalidateMock }))
vi.mock('@/contexts/admin/usecases/audit', () => ({ logAdminAction: auditMock }))
vi.mock('./season-skip-notices', () => ({ announceSeasonSkipCredited: announceMock }))

import { scheduleSeasonEnd, moveSeasonEnd, clearSeasonEnd, stopSeasonSales, resumeSeasonSales, endSeasonToday } from './season-transitions'

const ADMIN = 'admin@dormers.ae'

beforeEach(() => {
  rpcMock.mockReset()
  invalidateMock.mockReset()
  auditMock.mockReset()
  announceMock.mockReset()
  vi.useFakeTimers()
  // 12:00 in Dubai on Monday 14 Sep 2026.
  vi.setSystemTime(new Date('2026-09-14T08:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('season transitions', () => {
  it('refuses a bad wrap-up day before touching the database', async () => {
    expect(await scheduleSeasonEnd(ADMIN, '2026-10-04', 1)).toEqual({ error: 'Pick a delivery day. Sunday is not one.' })
    expect(await moveSeasonEnd(ADMIN, '2026-09-14', 1)).toEqual({ error: 'The wrap-up day has to be tomorrow or later.' })
    expect(rpcMock).not.toHaveBeenCalled()
    expect(invalidateMock).not.toHaveBeenCalled()
  })

  it('schedules through the SQL function, audits the result, and drops the cache', async () => {
    rpcMock.mockResolvedValue({ data: { phase: 'winding_down' }, error: null })
    expect(await scheduleSeasonEnd(ADMIN, '2026-10-03', 1)).toEqual({ ok: true })
    expect(rpcMock).toHaveBeenCalledWith('season_schedule_end', { p_wrap_up: '2026-10-03', p_buffer: 1, p_actor: ADMIN })
    expect(invalidateMock).toHaveBeenCalledTimes(1)
    expect(auditMock).toHaveBeenCalledWith(ADMIN, 'season_end_scheduled', 'intake_settings', 'singleton', {
      p_wrap_up: '2026-10-03', p_buffer: 1, state: { phase: 'winding_down' },
    })
  })

  it('turns a refusal into admin copy, still drops the cache, and does not audit', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'SEASON_BAD_PHASE: nothing to clear in open' } })
    expect(await clearSeasonEnd(ADMIN)).toEqual({ error: 'The season changed while you were looking. Refresh the page and try again.' })
    expect(invalidateMock).toHaveBeenCalledTimes(1)
    expect(auditMock).not.toHaveBeenCalled()
  })

  it('calls the right function for every action', async () => {
    rpcMock.mockResolvedValue({ data: {}, error: null })
    await moveSeasonEnd(ADMIN, '2026-10-05', 0)
    await clearSeasonEnd(ADMIN)
    await stopSeasonSales(ADMIN)
    await resumeSeasonSales(ADMIN)
    await endSeasonToday(ADMIN)
    expect(rpcMock.mock.calls).toEqual([
      ['season_move_end', { p_wrap_up: '2026-10-05', p_buffer: 0, p_actor: ADMIN }],
      ['season_clear_end', { p_actor: ADMIN }],
      ['season_stop_sales', { p_actor: ADMIN }],
      ['season_resume_sales', { p_actor: ADMIN }],
      ['season_end_today', { p_actor: ADMIN }],
    ])
    expect(auditMock.mock.calls.map((c) => c[1])).toEqual([
      'season_end_moved', 'season_end_cleared', 'season_sales_stopped', 'season_sales_resumed', 'season_ended_today',
    ])
  })

  it('hands skips turned into credit to the notice hook', async () => {
    rpcMock.mockResolvedValue({
      data: { phase: 'winding_down', reconciled: [{ subscription_id: 's1', customer_id: 'c1', meal_dates: ['2026-09-16'], credit_fils: 1980, skipped_no_value: 0 }] },
      error: null,
    })
    expect(await scheduleSeasonEnd(ADMIN, '2026-10-03', 1)).toEqual({ ok: true })
    expect(announceMock).toHaveBeenCalledWith([
      { subscriptionId: 's1', customerId: 'c1', mealDates: ['2026-09-16'], creditFils: 1980, source: 'reconciled' },
    ])
  })

  it('still reports success when the notice hook throws, because the season already changed', async () => {
    rpcMock.mockResolvedValue({
      data: { phase: 'winding_down', reconciled: [{ subscription_id: 's1', customer_id: 'c1', meal_dates: ['2026-09-16'], credit_fils: 1980, skipped_no_value: 0 }] },
      error: null,
    })
    announceMock.mockRejectedValueOnce(new Error('whatsapp down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await scheduleSeasonEnd(ADMIN, '2026-10-03', 1)).toEqual({ ok: true })
    expect(auditMock).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('does not call the hook when nothing was reconciled', async () => {
    rpcMock.mockResolvedValue({ data: { phase: 'winding_down', reconciled: [] }, error: null })
    await moveSeasonEnd(ADMIN, '2026-10-05', 0)
    expect(announceMock).not.toHaveBeenCalled()
  })
})

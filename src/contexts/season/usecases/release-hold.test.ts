import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ rpc: rpcMock }) }))

import { releaseSeasonHold } from './release-hold'
import { BREAK_RESUME_COPY, RELEASE_CHANGED_COPY } from '../domain/season-break-errors'

beforeEach(() => rpcMock.mockReset())

describe('releaseSeasonHold', () => {
  it('releases through season_release_hold with the owned ids', async () => {
    rpcMock.mockResolvedValue({ data: { subscription_id: 'sub-1', status: 'Active', followers: 1 }, error: null })
    expect(await releaseSeasonHold({ customerId: 'user-1', subscriptionId: 'sub-1', startDate: null, resumeCutoff: true }))
      .toEqual({ ok: true, status: 'Active', followers: 1 })
    expect(rpcMock).toHaveBeenCalledWith('season_release_hold', {
      p_customer_id: 'user-1', p_subscription_id: 'sub-1', p_start_date: null, p_resume_cutoff: true,
    })
  })

  it('reports a Scheduled release', async () => {
    rpcMock.mockResolvedValue({ data: { subscription_id: 'sub-2', status: 'Scheduled', followers: 0 }, error: null })
    expect(await releaseSeasonHold({ customerId: 'user-1', subscriptionId: 'sub-2', startDate: '2026-10-12', resumeCutoff: false }))
      .toEqual({ ok: true, status: 'Scheduled', followers: 0 })
  })

  it('marks a break refusal so the dashboard can open the break sheet', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'SEASON_BREAK: plan sub-1 cannot restart during the semester break' } })
    expect(await releaseSeasonHold({ customerId: 'user-1', subscriptionId: 'sub-1', startDate: null, resumeCutoff: false }))
      .toEqual({ ok: false, error: BREAK_RESUME_COPY, seasonBreak: true })
  })

  it('never shows raw SQL for other refusals', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'SEASON_RELEASE_NOT_READY: hold is held' } })
    expect(await releaseSeasonHold({ customerId: 'user-1', subscriptionId: 'sub-1', startDate: null, resumeCutoff: false }))
      .toEqual({ ok: false, error: RELEASE_CHANGED_COPY, seasonBreak: false })
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { requireAdminMock, fromMock, intakeMock, releaseMock, emitMock, auditMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  fromMock: vi.fn(),
  intakeMock: vi.fn(),
  releaseMock: vi.fn(),
  emitMock: vi.fn(),
  auditMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/contexts/admin/usecases/require-admin', () => ({ requireAdmin: requireAdminMock }))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ from: fromMock }) }))
vi.mock('@/contexts/admin/usecases/audit', () => ({ logAdminAction: auditMock }))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: vi.fn() }))
vi.mock('@/shared/events/event-bus', () => ({ eventBus: { emit: emitMock, on: vi.fn() } }))
vi.mock('@/contexts/notifications/usecases/subscribers', () => ({}))
vi.mock('@/infra/config/intake', () => ({ getIntakeState: intakeMock }))
vi.mock('@/contexts/season/usecases/release-hold', () => ({ releaseSeasonHold: releaseMock }))

import { adminResumeSub } from './actions'
import { ADMIN_BREAK_RESUME_COPY } from '@/contexts/season/domain/season-break-errors'

const updateMock = vi.fn()

function setup(sub: Record<string, unknown>, update: { data: unknown; error: unknown } = { data: [{ id: 'sub-1' }], error: null }) {
  updateMock.mockReset()
  fromMock.mockImplementation(() => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: sub, error: null }) }) }),
    update: (values: unknown) => {
      updateMock(values)
      return { eq: () => ({ eq: () => ({ select: () => Promise.resolve(update) }) }) }
    },
  }))
}

const paused = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1', customer_id: 'cust-1', status: 'Paused', week_type: '6DAYS', paused_dates: [], season_hold_id: null, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue({ email: 'admin@dormers.ae' })
  vi.useFakeTimers()
  // 10:00 Dubai on Mon 12 Oct 2026.
  vi.setSystemTime(new Date('2026-10-12T06:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('adminResumeSub and the season break (spec §11.5, G9)', () => {
  it('refuses during the break, reading the phase fresh', async () => {
    setup(paused({ season_hold_id: 'hold-1' }))
    intakeMock.mockResolvedValue({ phase: 'break' })
    expect(await adminResumeSub('sub-1')).toEqual({ ok: false, message: ADMIN_BREAK_RESUME_COPY })
    expect(intakeMock).toHaveBeenCalledWith({ fresh: true })
    expect(updateMock).not.toHaveBeenCalled()
    expect(releaseMock).not.toHaveBeenCalled()
  })

  it('releases a held plan after reopening, for the plan owner', async () => {
    setup(paused({ season_hold_id: 'hold-1' }))
    intakeMock.mockResolvedValue({ phase: 'open' })
    releaseMock.mockResolvedValue({ ok: true, status: 'Active', followers: 0 })
    expect(await adminResumeSub('sub-1')).toEqual({ ok: true, message: 'Held plan restarted. The customer is notified on WhatsApp.' })
    expect(releaseMock).toHaveBeenCalledWith({ customerId: 'cust-1', subscriptionId: 'sub-1', startDate: null, resumeCutoff: false })
    expect(updateMock).not.toHaveBeenCalled()
    expect(emitMock).toHaveBeenCalledWith('subscription.notification-due', expect.objectContaining({ kind: 'plan_resumed_confirm' }))
  })

  it('resumes a plan that is not held exactly as before', async () => {
    setup(paused())
    intakeMock.mockResolvedValue({ phase: 'open' })
    expect(await adminResumeSub('sub-1')).toEqual({ ok: true, message: 'Subscription resumed — customer notified on WhatsApp' })
    expect(updateMock).toHaveBeenCalledWith({ status: 'Active', pause_date: null })
  })

  it('turns a restart the database refuses into the break message', async () => {
    setup(paused(), { data: null, error: { message: 'SEASON_BREAK: plan sub-1 cannot restart during the semester break' } })
    intakeMock.mockResolvedValue({ phase: 'open' })
    expect(await adminResumeSub('sub-1')).toEqual({ ok: false, message: ADMIN_BREAK_RESUME_COPY })
  })
})

/**
 * The pause is enforced on the SERVER. A stale browser tab, a bookmarked
 * form, or a hand-crafted POST must all be rejected — the UI gate is a
 * courtesy, this is the enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getIntakeStateMock } = vi.hoisted(() => ({ getIntakeStateMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/config/intake', () => ({
  getIntakeState: getIntakeStateMock,
  creditAedFor: () => 20,
}))
vi.mock('@/infra/stripe/client', () => ({
  stripeClient: () => ({}),
}))
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } } }) },
  }),
}))
vi.mock('@/infra/admin-alerts/notify', () => ({ notifyAdmin: vi.fn() }))

import { POST } from './checkout/route'

beforeEach(() => getIntakeStateMock.mockReset())

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/checkout intake guard', () => {
  it('rejects with 409 INTAKE_PAUSED when intake is paused', async () => {
    getIntakeStateMock.mockResolvedValue({ paused: true, headline: 'We are between semesters.', body: 'Back soon enough.' })
    const res = await POST(req({ amount: 30000, plan: 'Monthly Premium' }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe('INTAKE_PAUSED')
    expect(typeof json.message).toBe('string')
  })

  it('does not reject when intake is open', async () => {
    getIntakeStateMock.mockResolvedValue({ paused: false, headline: '', body: '' })
    const res = await POST(req({ amount: 30000, plan: 'Monthly Premium' }))
    expect(res.status).not.toBe(409)
  })

  it('exempts staff-monthly from the pause — intern provisioning is admin-assigned remuneration, not a customer purchase', async () => {
    // Intake is paused, but the checkout never even asks: the guard is
    // skipped entirely for this plan, so getIntakeState is never called.
    // Asserting the mock was never invoked (rather than just checking the
    // response isn't 409) proves the exemption itself, not just that some
    // later, unrelated failure happened to produce a non-409 status.
    getIntakeStateMock.mockResolvedValue({ paused: true, headline: 'We are between semesters.', body: 'Back soon enough.' })
    await POST(req({ amount: 8000, plan: 'Staff Monthly' }))
    expect(getIntakeStateMock).not.toHaveBeenCalled()
  })
})

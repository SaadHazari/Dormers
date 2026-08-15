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
    const res = await POST(req({ amount: 30000, plan: 'monthly-premium' }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe('INTAKE_PAUSED')
    expect(typeof json.message).toBe('string')
  })

  it('does not reject when intake is open', async () => {
    getIntakeStateMock.mockResolvedValue({ paused: false, headline: '', body: '' })
    const res = await POST(req({ amount: 30000, plan: 'monthly-premium' }))
    expect(res.status).not.toBe(409)
  })
})

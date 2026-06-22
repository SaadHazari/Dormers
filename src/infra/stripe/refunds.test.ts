/**
 * Tests for refundPaymentFils — the money-critical behavior is that every
 * refund carries a deterministic idempotency key, so a retried refund returns
 * the SAME refund instead of paying out twice. The Stripe client is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(async () => ({ id: 're_123' })),
}))

vi.mock('server-only', () => ({}))
vi.mock('./client', () => ({
  stripeClient: () => ({ refunds: { create: createMock } }),
}))

import { refundPaymentFils } from './refunds'

beforeEach(() => {
  createMock.mockClear()
})

describe('refundPaymentFils', () => {
  it('passes a caller-provided idempotency key through', async () => {
    const id = await refundPaymentFils('pi_1', 5000, 'refund:offboard:sub_9')
    expect(id).toBe('re_123')
    expect(createMock).toHaveBeenCalledWith(
      { payment_intent: 'pi_1', amount: 5000 },
      { idempotencyKey: 'refund:offboard:sub_9' },
    )
  })

  it('omits amount for a full refund and derives a default key', async () => {
    await refundPaymentFils('pi_2')
    expect(createMock).toHaveBeenCalledWith(
      { payment_intent: 'pi_2' },
      { idempotencyKey: 'refund:pi_2:full' },
    )
  })

  it('derives a default key including the amount for a partial refund', async () => {
    await refundPaymentFils('pi_3', 2000)
    expect(createMock).toHaveBeenCalledWith(
      { payment_intent: 'pi_3', amount: 2000 },
      { idempotencyKey: 'refund:pi_3:2000' },
    )
  })
})

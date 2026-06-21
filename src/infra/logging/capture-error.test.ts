/**
 * Tests for captureError — asserts it logs + forwards to Sentry with tags, and
 * that it never throws even if Sentry/logging blows up. Sentry + logger are
 * mocked so the test doesn't spin up pino-pretty or a real Sentry client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { captureException, errorLog, childLogger } = vi.hoisted(() => {
  const errorLog = vi.fn()
  return {
    captureException: vi.fn(),
    errorLog,
    childLogger: vi.fn(() => ({ error: errorLog })),
  }
})

vi.mock('@sentry/nextjs', () => ({ captureException }))
vi.mock('./logger', () => ({ childLogger }))

import { captureError } from './capture-error'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('captureError', () => {
  it('logs via a child logger and forwards to Sentry with area/op tags', () => {
    const err = new Error('refund failed')
    captureError(err, { area: 'staff', op: 'offboard', tags: { kind: 'refund' }, subId: 's_1' })

    expect(childLogger).toHaveBeenCalledWith(
      expect.objectContaining({ area: 'staff', op: 'offboard', subId: 's_1' }),
    )
    expect(errorLog).toHaveBeenCalledWith({ err }, 'staff.offboard failed')

    expect(captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        tags: expect.objectContaining({ area: 'staff', op: 'offboard', kind: 'refund' }),
        extra: expect.objectContaining({ subId: 's_1' }),
      }),
    )
  })

  it('works with only an area (no op)', () => {
    captureError(new Error('x'), { area: 'kitchen' })
    expect(errorLog).toHaveBeenCalledWith(expect.anything(), 'kitchen failed')
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('never throws even if Sentry throws', () => {
    captureException.mockImplementationOnce(() => {
      throw new Error('sentry down')
    })
    expect(() => captureError(new Error('y'), { area: 'ops' })).not.toThrow()
  })
})

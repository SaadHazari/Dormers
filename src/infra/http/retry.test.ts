/**
 * Tests for retryWithJitter — bounded attempts, backoff math, shouldRetry,
 * and abort. Sleep + random are injected so tests are deterministic and fast.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  retryWithJitter,
  computeBackoffDelay,
  RetryAbortedError,
} from './retry'

const noSleep = async () => {}

describe('computeBackoffDelay', () => {
  it('grows exponentially and is capped by maxDelayMs', () => {
    // random()=1 → returns ceiling (minus the floor of the open interval).
    expect(computeBackoffDelay(1, 100, 2000, () => 1)).toBe(100)
    expect(computeBackoffDelay(2, 100, 2000, () => 1)).toBe(200)
    expect(computeBackoffDelay(3, 100, 2000, () => 1)).toBe(400)
    // 100 * 2^4 = 1600, still under the 2000 cap
    expect(computeBackoffDelay(5, 100, 2000, () => 1)).toBe(1600)
    // 100 * 2^5 = 3200 → capped at 2000
    expect(computeBackoffDelay(6, 100, 2000, () => 1)).toBe(2000)
  })

  it('applies full jitter (random scales the delay down)', () => {
    expect(computeBackoffDelay(3, 100, 2000, () => 0)).toBe(0)
    expect(computeBackoffDelay(3, 100, 2000, () => 0.5)).toBe(200)
  })
})

describe('retryWithJitter', () => {
  it('returns immediately on first success', async () => {
    const fn = vi.fn(async () => 'ok')
    const result = await retryWithJitter(fn, { sleep: noSleep })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries transient failures then succeeds', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls < 3) throw new Error('transient')
      return 'recovered'
    })
    const onRetry = vi.fn()
    const result = await retryWithJitter(fn, {
      maxAttempts: 3,
      sleep: noSleep,
      random: () => 0,
      onRetry,
    })
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('throws the last error after exhausting maxAttempts', async () => {
    const err = new Error('still down')
    const fn = vi.fn(async () => {
      throw err
    })
    await expect(
      retryWithJitter(fn, { maxAttempts: 3, sleep: noSleep, random: () => 0 }),
    ).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry when shouldRetry returns false', async () => {
    const err = new Error('permanent 4xx')
    const fn = vi.fn(async () => {
      throw err
    })
    await expect(
      retryWithJitter(fn, { maxAttempts: 5, sleep: noSleep, shouldRetry: () => false }),
    ).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws RetryAbortedError when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fn = vi.fn(async () => 'never')
    await expect(
      retryWithJitter(fn, { signal: controller.signal, sleep: noSleep }),
    ).rejects.toBeInstanceOf(RetryAbortedError)
    expect(fn).not.toHaveBeenCalled()
  })
})

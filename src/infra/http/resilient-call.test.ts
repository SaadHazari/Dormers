/**
 * Tests for resilientCall — the composition of timeout + retry + breaker.
 * Each test uses a unique breaker name to avoid cross-test registry state.
 */

import { describe, it, expect, vi } from 'vitest'
import { resilientCall, CallTimeoutError } from './resilient-call'
import { __resetCircuitBreakers } from './circuit-breaker'

const noSleep = async () => {}

describe('resilientCall', () => {
  it('returns the value on success', async () => {
    const result = await resilientCall(async () => 'value', {
      name: 'rc-success',
      retry: false,
      breaker: false,
    })
    expect(result).toBe('value')
  })

  it('retries a transient failure then succeeds', async () => {
    let calls = 0
    const result = await resilientCall(
      async () => {
        calls++
        if (calls < 2) throw new Error('transient')
        return 'ok'
      },
      {
        name: 'rc-retry',
        breaker: false,
        retry: { maxAttempts: 3, sleep: noSleep, random: () => 0 },
      },
    )
    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })

  it('rejects with CallTimeoutError when an attempt exceeds timeoutMs', async () => {
    await expect(
      resilientCall(
        // Never resolves on its own; relies on the timeout to reject.
        () => new Promise<string>(() => {}),
        { name: 'rc-timeout', timeoutMs: 20, retry: false, breaker: false },
      ),
    ).rejects.toBeInstanceOf(CallTimeoutError)
  })

  it('opens the breaker and fails fast without invoking fn again', async () => {
    __resetCircuitBreakers()
    const fn = vi.fn(async () => {
      throw new Error('down')
    })
    // failureThreshold 1 → opens after the first failed call.
    await expect(
      resilientCall(fn, {
        name: 'rc-breaker',
        retry: false,
        breaker: { failureThreshold: 1, now: () => 0 },
      }),
    ).rejects.toThrow('down')
    expect(fn).toHaveBeenCalledTimes(1)

    // Second call: breaker is open → fn must not run.
    await expect(
      resilientCall(fn, {
        name: 'rc-breaker',
        retry: false,
        breaker: { failureThreshold: 1, now: () => 0 },
      }),
    ).rejects.toThrow(/Circuit "rc-breaker" is open/)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('passes an abort signal to fn for timeout-driven cancellation', async () => {
    let observedAborted = false
    await expect(
      resilientCall(
        (signal) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              observedAborted = true
              reject(new Error('aborted'))
            })
          }),
        { name: 'rc-abort', timeoutMs: 20, retry: false, breaker: false },
      ),
    ).rejects.toBeTruthy()
    expect(observedAborted).toBe(true)
  })
})

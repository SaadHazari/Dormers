/**
 * Tests for CircuitBreaker — state transitions driven by an injected clock so
 * the recovery window is deterministic.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  __resetCircuitBreakers,
} from './circuit-breaker'

function makeClock(start = 0) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

const boom = async () => {
  throw new Error('dependency down')
}
const ok = async () => 'ok'

describe('CircuitBreaker', () => {
  it('passes calls through while closed', async () => {
    const cb = new CircuitBreaker('t', { now: () => 0 })
    expect(await cb.run(ok)).toBe('ok')
    expect(cb.getState()).toBe('closed')
  })

  it('opens after the failure threshold and then fails fast', async () => {
    const cb = new CircuitBreaker('t', { failureThreshold: 3, now: () => 0 })
    for (let i = 0; i < 3; i++) {
      await expect(cb.run(boom)).rejects.toThrow('dependency down')
    }
    expect(cb.getState()).toBe('open')

    // Now it should fail fast WITHOUT invoking fn.
    const fn = vi.fn(boom)
    await expect(cb.run(fn)).rejects.toBeInstanceOf(CircuitOpenError)
    expect(fn).not.toHaveBeenCalled()
  })

  it('half-opens after the recovery window and closes on a successful trial', async () => {
    const clock = makeClock()
    const cb = new CircuitBreaker('t', {
      failureThreshold: 1,
      recoveryTimeMs: 1000,
      now: clock.now,
    })
    await expect(cb.run(boom)).rejects.toThrow()
    expect(cb.getState()).toBe('open')

    clock.advance(1000)
    expect(cb.getState()).toBe('half-open')

    expect(await cb.run(ok)).toBe('ok')
    expect(cb.getState()).toBe('closed')
  })

  it('re-opens if the half-open trial fails', async () => {
    const clock = makeClock()
    const cb = new CircuitBreaker('t', {
      failureThreshold: 1,
      recoveryTimeMs: 1000,
      now: clock.now,
    })
    await expect(cb.run(boom)).rejects.toThrow()
    clock.advance(1000)
    expect(cb.getState()).toBe('half-open')

    await expect(cb.run(boom)).rejects.toThrow('dependency down')
    expect(cb.getState()).toBe('open')
  })

  it('does not count errors excluded by isFailure', async () => {
    const cb = new CircuitBreaker('t', {
      failureThreshold: 2,
      now: () => 0,
      isFailure: (err) => !(err instanceof Error && err.message === 'expected-4xx'),
    })
    const expected = async () => {
      throw new Error('expected-4xx')
    }
    for (let i = 0; i < 5; i++) {
      await expect(cb.run(expected)).rejects.toThrow('expected-4xx')
    }
    expect(cb.getState()).toBe('closed')
  })

  it('fires onStateChange on transitions', async () => {
    const changes: string[] = []
    const cb = new CircuitBreaker('named', {
      failureThreshold: 1,
      now: () => 0,
      onStateChange: ({ from, to }) => changes.push(`${from}->${to}`),
    })
    await expect(cb.run(boom)).rejects.toThrow()
    expect(changes).toContain('closed->open')
  })
})

describe('getCircuitBreaker registry', () => {
  it('returns the same instance for a name and resets via the test seam', async () => {
    __resetCircuitBreakers()
    const a = getCircuitBreaker('shared', { failureThreshold: 1, now: () => 0 })
    const b = getCircuitBreaker('shared')
    expect(a).toBe(b)

    await expect(a.run(boom)).rejects.toThrow()
    expect(b.getState()).toBe('open') // shared state

    __resetCircuitBreakers()
    const c = getCircuitBreaker('shared', { now: () => 0 })
    expect(c).not.toBe(a)
    expect(c.getState()).toBe('closed')
  })
})

/**
 * Tests for RateLimiter — shadow vs enforce, window reset, and the fail-open
 * guarantee. Clock is injected for deterministic windows.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  RateLimiter,
  InMemoryRateLimitStore,
  type RateLimitStore,
} from './rate-limiter'

function makeClock(start = 0) {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

describe('RateLimiter — shadow mode (default)', () => {
  it('always allows but reports wouldBlock once over the limit', async () => {
    const decisions: boolean[] = []
    const wouldBlocks: boolean[] = []
    const rl = new RateLimiter({
      name: 'chat',
      limit: 2,
      windowMs: 1000,
      now: () => 0,
      onDecision: (d) => {
        decisions.push(d.allowed)
        wouldBlocks.push(d.wouldBlock)
      },
    })
    await rl.check('ip:1') // count 1
    await rl.check('ip:1') // count 2
    await rl.check('ip:1') // count 3 → over limit
    expect(decisions).toEqual([true, true, true]) // shadow never blocks
    expect(wouldBlocks).toEqual([false, false, true])
  })
})

describe('RateLimiter — enforce mode', () => {
  it('blocks once the limit is exceeded', async () => {
    const rl = new RateLimiter({
      name: 'otp',
      limit: 2,
      windowMs: 1000,
      mode: 'enforce',
      now: () => 0,
    })
    expect((await rl.check('ip:1')).allowed).toBe(true)
    expect((await rl.check('ip:1')).allowed).toBe(true)
    const third = await rl.check('ip:1')
    expect(third.allowed).toBe(false)
    expect(third.wouldBlock).toBe(true)
    expect(third.remaining).toBe(0)
  })

  it('resets after the window elapses', async () => {
    const clock = makeClock()
    const rl = new RateLimiter({
      name: 'otp',
      limit: 1,
      windowMs: 1000,
      mode: 'enforce',
      now: clock.now,
    })
    expect((await rl.check('ip:1')).allowed).toBe(true)
    expect((await rl.check('ip:1')).allowed).toBe(false)
    clock.advance(1000)
    expect((await rl.check('ip:1')).allowed).toBe(true) // new window
  })

  it('keys are independent', async () => {
    const rl = new RateLimiter({ name: 'otp', limit: 1, windowMs: 1000, mode: 'enforce', now: () => 0 })
    expect((await rl.check('ip:a')).allowed).toBe(true)
    expect((await rl.check('ip:b')).allowed).toBe(true)
    expect((await rl.check('ip:a')).allowed).toBe(false)
  })
})

describe('RateLimiter — fail open', () => {
  it('allows the request when the store throws, even while enforcing', async () => {
    const brokenStore: RateLimitStore = {
      hit: async () => {
        throw new Error('store down')
      },
    }
    const onDecision = vi.fn()
    const rl = new RateLimiter({
      name: 'otp',
      limit: 1,
      windowMs: 1000,
      mode: 'enforce',
      store: brokenStore,
      now: () => 0,
      onDecision,
    })
    const decision = await rl.check('ip:1')
    expect(decision.allowed).toBe(true)
    expect(decision.failedOpen).toBe(true)
    expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({ failedOpen: true, allowed: true }))
  })
})

describe('InMemoryRateLimitStore', () => {
  it('rolls the window based on the supplied clock', async () => {
    const store = new InMemoryRateLimitStore()
    expect((await store.hit('k', 1000, 0)).count).toBe(1)
    expect((await store.hit('k', 1000, 500)).count).toBe(2)
    expect((await store.hit('k', 1000, 1000)).count).toBe(1) // window rolled
  })
})

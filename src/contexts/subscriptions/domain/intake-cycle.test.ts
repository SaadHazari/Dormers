import { describe, it, expect } from 'vitest'
import { resolveJoinCycle } from './intake-cycle'

describe('resolveJoinCycle', () => {
  it('returns the cycle stamp when intake is paused and stamped', () => {
    expect(resolveJoinCycle({ paused: true, cycleStartedAt: '2026-08-15T18:15:51.035Z' }))
      .toEqual({ ok: true, cycleStartedAt: '2026-08-15T18:15:51.035Z' })
  })

  it('refuses when intake is open — there is no spot to save', () => {
    expect(resolveJoinCycle({ paused: false, cycleStartedAt: '2026-08-15T18:15:51.035Z' }))
      .toEqual({ ok: false, reason: 'not_paused' })
  })

  // A paused row with no cycle stamp cannot be scoped, and inserting a null
  // cycle would violate the NOT NULL added in Step 1. Fail loudly rather than
  // minting a credit that belongs to no pause.
  it('refuses when paused but the cycle was never stamped', () => {
    expect(resolveJoinCycle({ paused: true, cycleStartedAt: null }))
      .toEqual({ ok: false, reason: 'no_cycle' })
  })
})

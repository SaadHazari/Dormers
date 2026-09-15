import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveJoinCycle, noPlanCanFollow } from './intake-cycle'

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

// Anchors: 12:00 Dubai on Mon 14 Sep 2026; wrap-up day Sat 3 Oct.
const CYCLE = '2026-09-14T08:00:00.000Z'
const W = '2026-10-03'

describe('resolveJoinCycle while the season winds down', () => {
  const windDown = { paused: false, cycleStartedAt: CYCLE, phase: 'winding_down' as const, wrapUpDay: W }
  const ok = { ok: true, cycleStartedAt: CYCLE }

  it('lets a paused customer, or a plan running past the wrap-up day, save a spot', () => {
    expect(resolveJoinCycle({ ...windDown, dispositions: ['customer_paused'], noPlanCanFollow: false })).toEqual(ok)
    expect(resolveJoinCycle({ ...windDown, dispositions: ['runs_past'], noPlanCanFollow: false })).toEqual(ok)
  })

  it('refuses while a new plan can still follow', () => {
    expect(resolveJoinCycle({ ...windDown, dispositions: ['finishes'], noPlanCanFollow: false })).toEqual({ ok: false, reason: 'plan_can_follow' })
    expect(resolveJoinCycle({ ...windDown, dispositions: [], noPlanCanFollow: false })).toEqual({ ok: false, reason: 'plan_can_follow' })
  })

  it('lets anyone save a spot once no plan can follow theirs (spec §2.2)', () => {
    expect(resolveJoinCycle({ ...windDown, dispositions: ['finishes'], noPlanCanFollow: true })).toEqual(ok)
    expect(resolveJoinCycle({ ...windDown, dispositions: [], noPlanCanFollow: true })).toEqual(ok)
  })

  it('opens to everyone during the break', () => {
    expect(resolveJoinCycle({ ...windDown, phase: 'break', dispositions: ['finishes'], noPlanCanFollow: false })).toEqual(ok)
  })

  it('keeps the old rule when no wrap-up day is set', () => {
    expect(resolveJoinCycle({ paused: true, cycleStartedAt: CYCLE, phase: 'winding_down', wrapUpDay: null })).toEqual(ok)
    expect(resolveJoinCycle({ paused: false, cycleStartedAt: CYCLE, phase: 'open', wrapUpDay: null })).toEqual({ ok: false, reason: 'not_paused' })
  })

  it('still needs a stamped cycle', () => {
    expect(resolveJoinCycle({ ...windDown, cycleStartedAt: null, dispositions: ['customer_paused'] })).toEqual({ ok: false, reason: 'no_cycle' })
  })
})

describe('noPlanCanFollow', () => {
  afterEach(() => vi.useRealTimers())

  it('is true while sales are stopped', () => {
    expect(noPlanCanFollow({ salesStopped: true, paused: true, wrapUpDay: W, lastLiveEndDate: null, weekType: '6DAYS' })).toBe(true)
  })

  it('is false when a Weekly plan bought today still finishes by the wrap-up day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T08:00:00Z'))
    // A Weekly Flex from Mon 14 Sep ends Sat 19 Sep.
    expect(noPlanCanFollow({ salesStopped: false, paused: false, wrapUpDay: W, lastLiveEndDate: null, weekType: '6DAYS' })).toBe(false)
  })

  it('is true when nothing that follows a plan ending Mon 28 Sep can finish by Sat 3 Oct', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T08:00:00Z'))
    // The earliest Weekly Flex after it starts Tue 29 Sep and ends Mon 5 Oct.
    expect(noPlanCanFollow({ salesStopped: false, paused: false, wrapUpDay: W, lastLiveEndDate: '2026-09-28', weekType: '6DAYS' })).toBe(true)
  })
})

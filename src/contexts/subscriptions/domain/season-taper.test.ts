/**
 * Tests for season-taper.ts — the selectors the customer-facing plan
 * surfaces share (window derivation + the per-plan "how late can this still
 * start" clamp that doubles as the done-for-this-term signal).
 *
 * Dates are hand-checked against end-date.ts the same way season-horizon's
 * tests are: 2026-09-19 is a Saturday (a real 6DAYS delivery day) and
 * 2026-09-20 is a Sunday.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { taperWindow, taperedMaxStart } from './season-taper'
import { journeyFits } from './season-horizon'

afterEach(() => {
  vi.useRealTimers()
})

describe('taperWindow', () => {
  it('starts the day after a live plan ends and spans 30 days', () => {
    const w = taperWindow('2026-08-31')
    expect(w.minStart).toBe('2026-09-01')
    expect(w.maxStart).toBe('2026-10-01')
  })

  it('accepts a timestamp end_date, not just a date-only string', () => {
    expect(taperWindow('2026-08-31T00:00:00+00:00').minStart).toBe('2026-09-01')
  })

  it('with no live plan, before the 2 PM AE cutoff, starts today (AE)', () => {
    // 09:00 UTC = 13:00 Asia/Dubai — still inside the kitchen window.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-18T09:00:00Z'))
    expect(taperWindow(null).minStart).toBe('2026-08-18')
  })

  it('with no live plan, past the 2 PM AE cutoff, starts tomorrow (AE)', () => {
    // 10:30 UTC = 14:30 Asia/Dubai — tonight's run is already prepping.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-18T10:30:00Z'))
    expect(taperWindow(null).minStart).toBe('2026-08-19')
  })

  it('uses the AE wall date, not the runtime timezone, past UTC midnight', () => {
    // 22:00 UTC on the 18th is already 02:00 on the 19th in Dubai. A
    // local-time derivation on a UTC host would answer 2026-08-18 here and
    // disagree with the browser — this is the hydration trap the helper
    // exists to avoid.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-18T22:00:00Z'))
    expect(taperWindow(null).minStart).toBe('2026-08-19')
  })
})

describe('taperedMaxStart', () => {
  const base = { weekType: '6DAYS' as const, minStart: '2026-09-01', maxStart: '2026-10-01' }

  it('leaves the window alone when no pause is scheduled', () => {
    expect(taperedMaxStart({ ...base, planId: 'monthly-max', lastDeliveryDay: null })).toBe('2026-10-01')
    expect(taperedMaxStart({ ...base, planId: 'monthly-max', lastDeliveryDay: undefined })).toBe('2026-10-01')
  })

  it('clamps to the latest start whose journey still fits', () => {
    const got = taperedMaxStart({ ...base, planId: 'weekly-flex', lastDeliveryDay: '2026-09-19' })
    expect(got).not.toBeNull()
    expect(got! <= base.maxStart).toBe(true)
    expect(journeyFits({ planId: 'weekly-flex', weekType: '6DAYS', startDate: got!, lastDeliveryDay: '2026-09-19' })).toBe(true)
  })

  it('returns null when no start in the window fits — the plan is done for the term', () => {
    // A 4-week monthly cannot finish by 2026-09-19 from any start on or
    // after 2026-09-01.
    expect(taperedMaxStart({ ...base, planId: 'monthly-premium', lastDeliveryDay: '2026-09-19' })).toBeNull()
  })

  it('keeps shorter plans sellable in the same window that closes longer ones', () => {
    const lastDay = '2026-09-19'
    expect(taperedMaxStart({ ...base, planId: 'monthly-max', lastDeliveryDay: lastDay })).toBeNull()
    expect(taperedMaxStart({ ...base, planId: 'trial', lastDeliveryDay: lastDay })).not.toBeNull()
    expect(taperedMaxStart({ ...base, planId: 'weekly-flex', lastDeliveryDay: lastDay })).not.toBeNull()
  })

  it('never returns a date past the surface own cap', () => {
    // A last delivery day far in the future must not widen the +30 window.
    expect(taperedMaxStart({ ...base, planId: 'trial', lastDeliveryDay: '2027-06-30' })).toBe('2026-10-01')
  })
})

/**
 * Tests for season-horizon.ts — the pure "does this journey fit before the
 * season's last delivery day" checks used by the scheduled-pause-with-taper
 * feature.
 *
 * Trial dates were hand-corrected against end-date.ts: 2026-09-20 is a
 * Sunday, a non-delivery day for 6DAYS, so using it directly as a
 * `startDate` triggers computeEndDate's start-shift (S2 = next Monday,
 * 2026-09-21) and breaks the "starts on the last day" framing the brief
 * intended. 2026-09-19 (Saturday) is a real 6DAYS delivery day and was
 * substituted instead — see task-3-report.md for the full hand-computation.
 * The monthly cases keep 2026-09-20 because there `lastDeliveryDay` is only
 * a comparison bound, never fed through computeEndDate's shift logic.
 *
 * The "next day" helper in latestViableStart's first test was also
 * corrected from local-time `Date` parsing to explicit UTC parsing — see
 * the inline comment there.
 */

import { describe, it, expect } from 'vitest'
import { journeyFits, latestViableStart } from './season-horizon'

describe('journeyFits', () => {
  it('a trial starting on the last day fits', () => {
    expect(journeyFits({ planId: 'trial', weekType: '6DAYS', startDate: '2026-09-19', lastDeliveryDay: '2026-09-19' })).toBe(true)
  })
  it('a trial starting after the last day does not fit', () => {
    expect(journeyFits({ planId: 'trial', weekType: '6DAYS', startDate: '2026-09-21', lastDeliveryDay: '2026-09-19' })).toBe(false)
  })
  it('a monthly starting four-plus weeks before the last day fits', () => {
    expect(journeyFits({ planId: 'monthly-max', weekType: '6DAYS', startDate: '2026-08-20', lastDeliveryDay: '2026-09-20' })).toBe(true)
  })
  it('a monthly starting one week before the last day does not fit', () => {
    expect(journeyFits({ planId: 'monthly-max', weekType: '6DAYS', startDate: '2026-09-14', lastDeliveryDay: '2026-09-20' })).toBe(false)
  })
  it('agrees exactly with computeEndDate (no off-by-one)', () => {
    // weekly-flex 6DAYS starting Mon 2026-09-07: D=6, x=5, penalty=floor(5/6)=0, ends Sat 2026-09-12.
    expect(journeyFits({ planId: 'weekly-flex', weekType: '6DAYS', startDate: '2026-09-07', lastDeliveryDay: '2026-09-12' })).toBe(true)
    expect(journeyFits({ planId: 'weekly-flex', weekType: '6DAYS', startDate: '2026-09-07', lastDeliveryDay: '2026-09-11' })).toBe(false)
  })
})

describe('latestViableStart', () => {
  it('returns the latest fitting date in the window', () => {
    const got = latestViableStart({ planId: 'weekly-flex', weekType: '6DAYS', minStart: '2026-09-01', maxStart: '2026-09-30', lastDeliveryDay: '2026-09-20' })
    expect(got).not.toBeNull()
    expect(journeyFits({ planId: 'weekly-flex', weekType: '6DAYS', startDate: got!, lastDeliveryDay: '2026-09-20' })).toBe(true)
    // the next day must NOT fit (it is genuinely the latest)
    // Note: 'T00:00:00Z' (not the brief's local-time 'T00:00:00') — every
    // date in this module is UTC (see end-date.ts's toUtcDate/isoDate), and
    // this machine runs in Asia/Dubai (UTC+4), where the local-time form
    // parses to the wrong calendar day and setUTCDate(+1) becomes a no-op.
    const next = new Date(got + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 1)
    expect(journeyFits({ planId: 'weekly-flex', weekType: '6DAYS', startDate: next.toISOString().slice(0, 10), lastDeliveryDay: '2026-09-20' })).toBe(false)
  })
  it('returns null when nothing in the window fits', () => {
    expect(latestViableStart({ planId: 'monthly-max', weekType: '6DAYS', minStart: '2026-09-10', maxStart: '2026-09-30', lastDeliveryDay: '2026-09-20' })).toBeNull()
  })
  it('never returns a date outside the window', () => {
    const got = latestViableStart({ planId: 'trial', weekType: '6DAYS', minStart: '2026-09-01', maxStart: '2026-09-05', lastDeliveryDay: '2026-09-20' })
    expect(got).toBe('2026-09-05')
  })
})

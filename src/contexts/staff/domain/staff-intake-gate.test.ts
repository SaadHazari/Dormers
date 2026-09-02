/**
 * Staff plans follow the same season rule as everyone else: no new cycle
 * while sign-ups are paused, and no cycle that would run past the last
 * delivery day.
 *
 * Before this, no file in the staff context mentioned intake at all. The
 * free 5-day plan wrote straight into the subscriptions table, so during a
 * pause an intern got a plan while every customer was locked out — and the
 * 6-day option beside it was refused with customer sign-up copy.
 */

import { describe, it, expect } from 'vitest'
import { staffIntakeGate } from './staff-intake-gate'

const OPEN = { paused: false, pauseScheduledFor: null }

describe('staffIntakeGate', () => {
  it('lets a cycle through when the season is open', () => {
    expect(staffIntakeGate({ ...OPEN, cycleEndIso: '2026-10-16' })).toEqual({ ok: true })
  })

  it('refuses every new cycle while sign-ups are paused', () => {
    expect(staffIntakeGate({ paused: true, pauseScheduledFor: null, cycleEndIso: '2026-10-16' }))
      .toEqual({ ok: false, reason: 'paused', lastDeliveryDay: null })
  })

  it('refuses a cycle that would run past the last delivery day', () => {
    expect(staffIntakeGate({ paused: false, pauseScheduledFor: '2026-09-30', cycleEndIso: '2026-10-16' }))
      .toEqual({ ok: false, reason: 'season-ending', lastDeliveryDay: '2026-09-30' })
  })

  it('allows a cycle that finishes exactly on the last delivery day', () => {
    expect(staffIntakeGate({ paused: false, pauseScheduledFor: '2026-09-30', cycleEndIso: '2026-09-30' }))
      .toEqual({ ok: true })
  })

  it('reports the pause first when both apply, since it is the harder stop', () => {
    expect(staffIntakeGate({ paused: true, pauseScheduledFor: '2026-09-30', cycleEndIso: '2026-10-16' }))
      .toEqual({ ok: false, reason: 'paused', lastDeliveryDay: '2026-09-30' })
  })

  it('cannot judge the last delivery day without an end date, so it allows', () => {
    // Callers that genuinely have no cycle yet still get the pause check.
    expect(staffIntakeGate({ paused: false, pauseScheduledFor: '2026-09-30', cycleEndIso: null }))
      .toEqual({ ok: true })
  })

  it('fails open when the settings row is unreadable', () => {
    // getIntakeState returns paused:false / pauseScheduledFor:null on a read
    // blip. An intern's pay should not stop because a settings read hiccuped.
    expect(staffIntakeGate({ ...OPEN, cycleEndIso: '2027-01-01' })).toEqual({ ok: true })
  })
})

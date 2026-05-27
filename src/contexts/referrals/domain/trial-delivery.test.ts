/**
 * Characterization tests for trial-delivery scheduling.
 *
 * These functions decide what date the referral success modal AND the
 * dashboard trial-arriving banner show. Wrong math here means the customer
 * is told the wrong day.
 */

import { describe, it, expect } from 'vitest'
import {
  computeTrialDeliveryDate,
  trialDeliveryLabel,
  nextTrialDeliveryLabel,
} from './trial-delivery'

// AE is UTC+4 with no DST, so:
//   05:00 UTC = 09:00 AE (before cutoff → same day)
//   10:00 UTC = 14:00 AE (cutoff exact → next day)
//   12:00 UTC = 16:00 AE (after cutoff → next day)

describe('computeTrialDeliveryDate — 6DAYS (Mon–Sat)', () => {
  it('returns today AE when claim is before 14:00 AE on a working day', () => {
    // 2026-05-27 is a Wednesday; 05:00 UTC = 09:00 AE
    const now = new Date('2026-05-27T05:00:00Z')
    const date = computeTrialDeliveryDate(now, '6DAYS')
    expect(date.toISOString().slice(0, 10)).toBe('2026-05-27')
  })

  it('rolls to tomorrow when claim is at exactly 14:00 AE', () => {
    const now = new Date('2026-05-27T10:00:00Z') // 14:00 AE
    const date = computeTrialDeliveryDate(now, '6DAYS')
    expect(date.toISOString().slice(0, 10)).toBe('2026-05-28')
  })

  it('rolls to tomorrow when claim is after 14:00 AE', () => {
    const now = new Date('2026-05-27T12:00:00Z') // 16:00 AE
    const date = computeTrialDeliveryDate(now, '6DAYS')
    expect(date.toISOString().slice(0, 10)).toBe('2026-05-28')
  })

  it('skips Sunday for 6DAYS — Sat afternoon push goes to Monday', () => {
    // 2026-05-30 is a Saturday; 16:00 AE → would normally be Sunday → Monday
    const now = new Date('2026-05-30T12:00:00Z')
    const date = computeTrialDeliveryDate(now, '6DAYS')
    expect(date.toISOString().slice(0, 10)).toBe('2026-06-01')
  })
})

describe('computeTrialDeliveryDate — 5DAYS (Mon–Fri)', () => {
  it('skips Saturday + Sunday — Fri afternoon push goes to Monday', () => {
    // 2026-05-29 is a Friday; 16:00 AE → next is Mon (skip Sat + Sun)
    const now = new Date('2026-05-29T12:00:00Z')
    const date = computeTrialDeliveryDate(now, '5DAYS')
    expect(date.toISOString().slice(0, 10)).toBe('2026-06-01')
  })
})

describe('computeTrialDeliveryDate — 7DAYS', () => {
  it('never skips a day — Sat afternoon push goes to Sunday', () => {
    const now = new Date('2026-05-30T12:00:00Z') // Sat 16:00 AE
    const date = computeTrialDeliveryDate(now, '7DAYS')
    expect(date.toISOString().slice(0, 10)).toBe('2026-05-31')
  })
})

describe('trialDeliveryLabel', () => {
  it('returns "Tonight" when delivery is same AE-day as now', () => {
    const now = new Date('2026-05-27T05:00:00Z') // 09:00 AE
    const date = computeTrialDeliveryDate(now, '6DAYS')
    expect(trialDeliveryLabel(date, now)).toBe('Tonight')
  })

  it('returns "Tomorrow" when delivery is next AE-day', () => {
    const now = new Date('2026-05-27T12:00:00Z') // 16:00 AE → next-day
    const date = computeTrialDeliveryDate(now, '6DAYS')
    expect(trialDeliveryLabel(date, now)).toBe('Tomorrow')
  })

  it('returns weekday name for further dates', () => {
    // Sat 16:00 AE → Monday delivery on 6DAYS
    const now = new Date('2026-05-30T12:00:00Z')
    const date = computeTrialDeliveryDate(now, '6DAYS')
    expect(trialDeliveryLabel(date, now)).toBe('Monday')
  })
})

describe('nextTrialDeliveryLabel — convenience wrapper', () => {
  it('matches the result of computeTrialDeliveryDate + trialDeliveryLabel', () => {
    const now = new Date('2026-05-27T12:00:00Z')
    const expected = trialDeliveryLabel(computeTrialDeliveryDate(now, '6DAYS'), now)
    expect(nextTrialDeliveryLabel(now, '6DAYS')).toBe(expected)
  })
})

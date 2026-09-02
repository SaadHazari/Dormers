/**
 * The approval creates the start date. These lock the rule:
 *
 *   first delivery = LATER OF
 *       next working day after the approval
 *       next working day after the current cycle's end date
 */

import { describe, it, expect } from 'vitest'
import { approvedRenewalStartDate } from './staff-plan'

describe('approvedRenewalStartDate', () => {
  it('queues behind a running cycle when approved early', () => {
    // Approved Wed 2 Sep; the cycle runs to Fri 18 Sep. The cycle wins.
    expect(approvedRenewalStartDate({
      approvedOnIso: '2026-09-02', weekType: '5DAYS', currentCycleEndIso: '2026-09-18',
    })).toBe('2026-09-21') // Mon — 19/20 Sep are the weekend
  })

  it('starts the next working day when the cycle has already ended', () => {
    // The bug that prompted this: a renewal held since 24 Aug, approved
    // 2 Sep, used to activate retroactively on 24 Aug.
    expect(approvedRenewalStartDate({
      approvedOnIso: '2026-09-02', weekType: '5DAYS', currentCycleEndIso: '2026-08-21',
    })).toBe('2026-09-03') // Thu
  })

  it('never returns a date in the past', () => {
    const start = approvedRenewalStartDate({
      approvedOnIso: '2026-09-02', weekType: '5DAYS', currentCycleEndIso: '2026-07-10',
    })
    expect(start > '2026-09-02').toBe(true)
  })

  it('handles no current cycle at all (lapsed intern)', () => {
    expect(approvedRenewalStartDate({
      approvedOnIso: '2026-09-02', weekType: '5DAYS', currentCycleEndIso: null,
    })).toBe('2026-09-03')
  })

  it('skips the weekend for a 5-day week', () => {
    // Approved Fri 4 Sep → Mon 7 Sep, not Sat.
    expect(approvedRenewalStartDate({
      approvedOnIso: '2026-09-04', weekType: '5DAYS', currentCycleEndIso: null,
    })).toBe('2026-09-07')
  })

  it('counts Saturday as a working day for a 6-day week', () => {
    // Approved Fri 4 Sep on a 6-day plan → Sat 5 Sep.
    expect(approvedRenewalStartDate({
      approvedOnIso: '2026-09-04', weekType: '6DAYS', currentCycleEndIso: null,
    })).toBe('2026-09-05')
  })

  it('takes the cycle end when both land on the same day', () => {
    expect(approvedRenewalStartDate({
      approvedOnIso: '2026-09-02', weekType: '6DAYS', currentCycleEndIso: '2026-09-02',
    })).toBe('2026-09-03')
  })
})

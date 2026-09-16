import { describe, it, expect } from 'vitest'
import { addDaysIso, isoDow, isDeliveryDayIso, closeDayFor, validateSeasonEnd, todayAeIso, formatShortDay } from './season-dates'

// Calendar anchors (checked): 2026-09-14 is a Monday, 2026-10-03 a Saturday,
// 2026-10-04 a Sunday, 2026-10-05 a Monday.
describe('season-dates', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysIso('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDaysIso('2026-10-01', -1)).toBe('2026-09-30')
  })

  it('reads the ISO weekday', () => {
    expect(isoDow('2026-09-14')).toBe(1)
    expect(isoDow('2026-10-03')).toBe(6)
    expect(isoDow('2026-10-04')).toBe(7)
  })

  it('knows delivery days for both cadences', () => {
    expect(isDeliveryDayIso('2026-10-03', '6DAYS')).toBe(true)
    expect(isDeliveryDayIso('2026-10-03', '5DAYS')).toBe(false)
    expect(isDeliveryDayIso('2026-10-04', '6DAYS')).toBe(false)
  })

  it('close day skips Sunday and counts delivery days', () => {
    expect(closeDayFor('2026-10-03', 0)).toBe('2026-10-03')
    expect(closeDayFor('2026-10-03', 1)).toBe('2026-10-05')
    expect(closeDayFor('2026-09-28', 1)).toBe('2026-09-29')
    expect(closeDayFor('2026-10-02', 2)).toBe('2026-10-05')
  })

  it('validates the wrap-up day and buffer', () => {
    const todayAe = '2026-09-14'
    expect(validateSeasonEnd({ wrapUpDay: '2026-10-03', bufferDays: 1, todayAe })).toBeNull()
    expect(validateSeasonEnd({ wrapUpDay: '', bufferDays: 1, todayAe })).toBe('Pick the last dinner day first.')
    expect(validateSeasonEnd({ wrapUpDay: '2026-02-30', bufferDays: 1, todayAe })).toBe('That date does not exist. Check the day and month.')
    expect(validateSeasonEnd({ wrapUpDay: '2026-09-14', bufferDays: 1, todayAe })).toBe('The last dinner day has to be tomorrow or later.')
    expect(validateSeasonEnd({ wrapUpDay: '2027-10-01', bufferDays: 1, todayAe })).toBe('Pick a last dinner day within the next year.')
    expect(validateSeasonEnd({ wrapUpDay: '2026-10-04', bufferDays: 1, todayAe })).toBe('Pick a day we deliver. We do not deliver on Sundays.')
    expect(validateSeasonEnd({ wrapUpDay: '2026-10-03', bufferDays: 4, todayAe })).toBe('Catch-up days must be between 0 and 3.')
    expect(validateSeasonEnd({ wrapUpDay: '2026-10-03', bufferDays: 1.5, todayAe })).toBe('Catch-up days must be between 0 and 3.')
  })

  it('reads today on the Dubai calendar', () => {
    // 2026-09-14T21:30Z is 01:30 on 15 Sep in Dubai.
    expect(todayAeIso(Date.parse('2026-09-14T21:30:00Z'))).toBe('2026-09-15')
    expect(todayAeIso(Date.parse('2026-09-14T19:30:00Z'))).toBe('2026-09-14')
  })

  it('formats a stable short day label from fixed tables, not the host locale', () => {
    expect(formatShortDay('2026-10-03')).toBe('Sat 3 Oct')
    expect(formatShortDay('2026-09-30')).toBe('Wed 30 Sep')
    expect(formatShortDay('2026-01-01')).toBe('Thu 1 Jan')
    expect(formatShortDay('2026-12-25')).toBe('Fri 25 Dec')
  })
})

describe('nextTenAmAe (spec §12.1)', () => {
  it('is today at 10:00 Dubai before that, tomorrow after', async () => {
    const { nextTenAmAe } = await import('./season-dates')
    expect(nextTenAmAe(new Date('2026-10-06T05:59:00Z')).toISOString()).toBe('2026-10-06T06:00:00.000Z')
    expect(nextTenAmAe(new Date('2026-10-06T06:00:00Z')).toISOString()).toBe('2026-10-07T06:00:00.000Z')
    expect(nextTenAmAe(new Date('2026-10-06T21:30:00Z')).toISOString()).toBe('2026-10-07T06:00:00.000Z')
  })
})

/**
 * Characterization tests for Dubai day-boundary helpers.
 *
 * These functions drive subscription notification scheduling — a regression
 * here means customers get "your meal is back on" messages for the wrong day.
 */

import { describe, it, expect } from 'vitest'
import { ae9amUtcOnDate, nextEligibleDeliveryDay } from './dubai-day'

describe('ae9amUtcOnDate', () => {
  it('maps 9 AM AE to 5 AM UTC same date (Dubai = UTC+4, no DST)', () => {
    const utc = ae9amUtcOnDate('2026-05-27')
    expect(utc.toISOString()).toBe('2026-05-27T05:00:00.000Z')
  })

  it('works at end of month', () => {
    expect(ae9amUtcOnDate('2026-01-31').toISOString()).toBe('2026-01-31T05:00:00.000Z')
  })

  it('works on a leap day', () => {
    expect(ae9amUtcOnDate('2028-02-29').toISOString()).toBe('2028-02-29T05:00:00.000Z')
  })
})

describe('nextEligibleDeliveryDay — 6DAYS (Mon–Sat)', () => {
  const baseOpts = {
    weekType: '6DAYS' as const,
    skippedDates: [],
    pausedDates: [],
    subEndDateIso: '2026-12-31',
  }

  it('returns the next day when it is a working day', () => {
    // 2026-05-27 is a Wednesday → next is Thu
    expect(
      nextEligibleDeliveryDay({ ...baseOpts, fromAeDateIso: '2026-05-27' }),
    ).toBe('2026-05-28')
  })

  it('skips Sunday for 6DAYS', () => {
    // 2026-05-30 is a Saturday → next is Mon (not Sun)
    expect(
      nextEligibleDeliveryDay({ ...baseOpts, fromAeDateIso: '2026-05-30' }),
    ).toBe('2026-06-01')
  })

  it('skips dates in skippedDates', () => {
    expect(
      nextEligibleDeliveryDay({
        ...baseOpts,
        fromAeDateIso: '2026-05-27',
        skippedDates: ['2026-05-28', '2026-05-29'],
      }),
    ).toBe('2026-05-30')
  })

  it('skips dates in pausedDates', () => {
    expect(
      nextEligibleDeliveryDay({
        ...baseOpts,
        fromAeDateIso: '2026-05-27',
        pausedDates: ['2026-05-28'],
      }),
    ).toBe('2026-05-29')
  })

  it('returns null when nothing eligible exists before sub end', () => {
    expect(
      nextEligibleDeliveryDay({
        ...baseOpts,
        fromAeDateIso: '2026-05-27',
        subEndDateIso: '2026-05-27',
      }),
    ).toBeNull()
  })
})

describe('nextEligibleDeliveryDay — 5DAYS (Mon–Fri)', () => {
  it('skips both Saturday and Sunday', () => {
    // 2026-05-28 is a Thursday → Fri 5-29 is eligible; if Fri were skipped, next is Mon 6-01
    expect(
      nextEligibleDeliveryDay({
        weekType: '5DAYS',
        skippedDates: [],
        pausedDates: [],
        subEndDateIso: '2026-12-31',
        fromAeDateIso: '2026-05-29',
      }),
    ).toBe('2026-06-01') // Sat 5-30 + Sun 5-31 skipped
  })
})

describe('nextEligibleDeliveryDay — 7DAYS (every day)', () => {
  it('never skips for the week, only for skipped/paused dates', () => {
    expect(
      nextEligibleDeliveryDay({
        weekType: '7DAYS',
        skippedDates: [],
        pausedDates: [],
        subEndDateIso: '2026-12-31',
        fromAeDateIso: '2026-05-30', // Sat
      }),
    ).toBe('2026-05-31') // Sun is fine on 7DAYS
  })
})

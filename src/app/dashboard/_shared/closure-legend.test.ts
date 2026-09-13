/**
 * Guards the closure legend: dates are named (never "2 kitchen closed"),
 * consecutive delivery days collapse into a range, and the "days added"
 * clause changes tense once the closure is behind the customer.
 */

import { describe, it, expect } from 'vitest'

import { describeClosures } from './closure-legend'

describe('describeClosures', () => {
  it('returns null when the window has no closure days', () => {
    expect(describeClosures([], '2026-09-12', '6DAYS')).toBeNull()
  })

  it('names a single past day with its weekday and says the day was added', () => {
    expect(describeClosures(['2026-09-09'], '2026-09-12', '6DAYS')).toEqual({
      dates: 'Wed 9 Sep', count: 1, added: '1 day added',
    })
  })

  it('collapses consecutive delivery days into one range', () => {
    expect(describeClosures(['2026-09-09', '2026-09-10'], '2026-09-12', '6DAYS')).toEqual({
      dates: '9–10 Sep', count: 2, added: '2 days added',
    })
  })

  it('bridges a weekend on a 5-day plan (Fri + Mon is one range)', () => {
    expect(describeClosures(['2026-09-11', '2026-09-14'], '2026-09-20', '5DAYS')?.dates).toBe('11–14 Sep')
  })

  it('spells both months when a range crosses one', () => {
    expect(describeClosures(['2026-09-30', '2026-10-01'], '2026-10-05', '6DAYS')?.dates).toBe('30 Sep – 1 Oct')
  })

  it('lists separate closures, and drops the weekday once there is more than one', () => {
    expect(describeClosures(['2026-09-09', '2026-09-21'], '2026-09-25', '6DAYS')?.dates).toBe('9 Sep, 21 Sep')
  })

  it('uses the future tense while any closure day is today or ahead', () => {
    // closure_tick extends end_date on the night of the closure, so the
    // Ending date has not moved yet — the legend must not claim it has.
    expect(describeClosures(['2026-09-12', '2026-09-13'], '2026-09-12', '6DAYS')?.added).toBe('2 days will be added')
    expect(describeClosures(['2026-09-14'], '2026-09-12', '6DAYS')?.added).toBe('1 day will be added')
  })
})

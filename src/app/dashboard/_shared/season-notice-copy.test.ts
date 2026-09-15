import { describe, it, expect } from 'vitest'
import { seasonChipLabel, seasonPauseLine, seasonNoticeCopy, seasonNoticeSeenKey, seasonJoinLine } from './season-notice-copy'

describe('seasonChipLabel', () => {
  it('names the wrap-up day', () => {
    // Sat 3 Oct 2026.
    expect(seasonChipLabel('2026-10-03')).toBe('Semester wraps up Sat 3 Oct')
  })
})

describe('seasonPauseLine (spec §7.3)', () => {
  it('only names the wrap-up day until the break exists', () => {
    expect(seasonPauseLine('2026-10-03', false)).toBe('The semester wraps up on Sat 3 Oct.')
  })

  it('says the plan waits once the break is live', () => {
    expect(seasonPauseLine('2026-10-03', true)).toBe("The semester wraps up on Sat 3 Oct. If you're still paused then, your plan waits for you until we're back.")
  })
})

describe('seasonNoticeCopy', () => {
  it('N1: the meals keep coming, through the last dinner', () => {
    // Fri 2 Oct last dinner, Sat 3 Oct wrap-up day.
    expect(seasonNoticeCopy({ kind: 'finishes', wrapUpDay: '2026-10-03', lastDinner: '2026-10-02', breakLive: false })).toEqual({
      headline: 'Your meals keep coming.',
      body: "Every delivery you've paid for arrives, through Fri 2 Oct. The semester wraps up on Sat 3 Oct.",
    })
    expect(seasonNoticeCopy({ kind: 'finishes', wrapUpDay: '2026-10-03', lastDinner: null, breakLive: false }).body)
      .toBe("Every delivery you've paid for arrives. The semester wraps up on Sat 3 Oct.")
  })

  it('N3: promises nothing about a hold until the break is live', () => {
    const interim = seasonNoticeCopy({ kind: 'paused', wrapUpDay: '2026-10-03', lastDinner: null, breakLive: false })
    expect(interim).toEqual({ headline: 'The semester wraps up on Sat 3 Oct.', body: 'Your plan stays paused until you resume it.' })
    expect(interim.body).not.toMatch(/back|kept|refund|waits/i)
    expect(seasonNoticeCopy({ kind: 'paused', wrapUpDay: '2026-10-03', lastDinner: null, breakLive: true }).body)
      .toBe("Still paused then? Your plan waits for you until we're back.")
  })

  it('never uses a dash', () => {
    for (const kind of ['finishes', 'paused'] as const) {
      for (const breakLive of [false, true]) {
        const c = seasonNoticeCopy({ kind, wrapUpDay: '2026-10-03', lastDinner: '2026-10-02', breakLive })
        expect(`${c.headline} ${c.body}`).not.toMatch(/[–—]/)
      }
    }
  })
})

describe('seasonNoticeSeenKey', () => {
  it('shows again for a new season or a moved wrap-up day', () => {
    expect(seasonNoticeSeenKey('2026-09-14T08:00:00Z', '2026-10-03')).toBe('dormers:season-notice-ack:2026-09-14T08:00:00Z:2026-10-03')
    expect(seasonNoticeSeenKey(null, '2026-10-03')).toBe('dormers:season-notice-ack:none:2026-10-03')
  })
})

describe('seasonJoinLine', () => {
  it('offers the waitlist credit in the customer amount', () => {
    expect(seasonJoinLine(20)).toBe('Save your spot for next semester and AED 20 goes to your wallet.')
    expect(seasonJoinLine(0)).toBeNull()
  })
})

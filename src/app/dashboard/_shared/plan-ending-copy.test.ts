/**
 * Guards the two copy rules extracted into plan-ending-copy.ts:
 * the last-two-days headline grammar ("today"/"tomorrow", never "0 days"),
 * and the button credit tag never rendering for a zero/negative amount.
 */

import { describe, it, expect } from 'vitest'

import { planEndingHeadline, saveSpotButtonLabel } from './plan-ending-copy'

describe('planEndingHeadline', () => {
  it('says "today" on the last day, never "in 0 days"', () => {
    expect(planEndingHeadline(0)).toEqual({ lead: 'Your plan ends ', emphasis: 'today' })
  })

  it('says "tomorrow" with one day left, never "in 1 day"', () => {
    expect(planEndingHeadline(1)).toEqual({ lead: 'Your plan ends ', emphasis: 'tomorrow' })
  })

  it('counts days for the rest of the 7-day window', () => {
    expect(planEndingHeadline(2)).toEqual({ lead: 'Your plan ends in ', emphasis: '2 days' })
    expect(planEndingHeadline(4)).toEqual({ lead: 'Your plan ends in ', emphasis: '4 days' })
    expect(planEndingHeadline(7)).toEqual({ lead: 'Your plan ends in ', emphasis: '7 days' })
  })

  it('treats a negative value like the last day rather than emitting nonsense', () => {
    // The component returns null outside 0..7 — this is belt-and-suspenders
    // so a guard regression can never render "ends in -1 days".
    expect(planEndingHeadline(-1).emphasis).toBe('today')
  })
})

describe('saveSpotButtonLabel', () => {
  it('attaches the credit tag for a real positive amount', () => {
    expect(saveSpotButtonLabel(15)).toBe('Save my spot · AED 15 credit')
  })

  it('drops the tag entirely at zero — "AED 0 credit" must never render', () => {
    expect(saveSpotButtonLabel(0)).toBe('Save my spot')
  })

  it('drops the tag for negative amounts too', () => {
    expect(saveSpotButtonLabel(-5)).toBe('Save my spot')
  })

  it('keeps the "save my spot" substring the layout-contract script matches on', () => {
    // scripts/check-layout-contract.mjs excludes this button by
    // /save my spot/i substring — both labels must keep matching it.
    expect(saveSpotButtonLabel(15).toLowerCase()).toContain('save my spot')
    expect(saveSpotButtonLabel(0).toLowerCase()).toContain('save my spot')
  })
})

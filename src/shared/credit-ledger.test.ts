import { describe, it, expect } from 'vitest'
import { classifyCreditSource, countsAsGameEarnings } from './credit-ledger'

describe('classifyCreditSource', () => {
  it('names the season pause credit', () => {
    expect(classifyCreditSource('intake_waitlist'))
      .toEqual({ label: 'Season pause credit', category: 'season' })
  })

  it('names a referral conversion', () => {
    expect(classifyCreditSource('referral_conversion'))
      .toEqual({ label: 'Referral reward', category: 'referral' })
  })

  // The doubler tags sources with `_2x` (applyDoubler) and a purchase that
  // uses part of a credit re-deposits the rest as `<source>_split_remainder`.
  // Both suffixes must not hide the origin.
  it('sees through the doubler suffix', () => {
    expect(classifyCreditSource('referral_conversion_2x').category).toBe('referral')
  })

  it('sees through the split-remainder suffix', () => {
    expect(classifyCreditSource('intake_waitlist_split_remainder').category).toBe('season')
  })

  it('sees through both suffixes stacked', () => {
    expect(classifyCreditSource('referral_conversion_2x_split_remainder').category).toBe('referral')
  })

  it('groups Dorm Wars payouts as rewards', () => {
    for (const s of ['cycle_milestone_15', 'streak_chest', 'tier_3_jacket', 'tier_4_meals']) {
      expect(classifyCreditSource(s)).toEqual({ label: 'Dorm Wars reward', category: 'reward' })
    }
  })

  it('names the review payouts individually', () => {
    expect(classifyCreditSource('layer4_weekly_review'))
      .toEqual({ label: 'Weekly review reward', category: 'reward' })
    expect(classifyCreditSource('layer4_monthly_review'))
      .toEqual({ label: 'Monthly wrap reward', category: 'reward' })
    expect(classifyCreditSource('layer4_anniversary'))
      .toEqual({ label: 'Anniversary reward', category: 'reward' })
  })

  it('names admin grants without leaking the internal reason slug', () => {
    expect(classifyCreditSource('admin_manual_goodwill_gesture'))
      .toEqual({ label: 'Credit from Dormers', category: 'admin' })
  })

  // Old rows predate the source column and future sources must never crash a
  // customer-facing statement — they fall back to a plain, safe label.
  it('falls back to a plain label for unknown or missing sources', () => {
    expect(classifyCreditSource('some_future_thing')).toEqual({ label: 'Credit', category: 'other' })
    expect(classifyCreditSource(null)).toEqual({ label: 'Credit', category: 'other' })
    expect(classifyCreditSource(undefined)).toEqual({ label: 'Credit', category: 'other' })
    expect(classifyCreditSource('')).toEqual({ label: 'Credit', category: 'other' })
  })
})

// The Refer & Earn badge and the Dorm Wars hub wallet show EARNED money.
// Season pause credit and admin grants are not winnings, so they must never
// inflate that number — that was the bug where pause money wore a referral
// costume. Legacy rows predate the source column, so null stays included:
// excluding unknowns would silently shrink old customers' wallets.
describe('countsAsGameEarnings', () => {
  it('counts referral and reward payouts in every suffix variant', () => {
    expect(countsAsGameEarnings('referral_conversion')).toBe(true)
    expect(countsAsGameEarnings('referral_conversion_2x')).toBe(true)
    expect(countsAsGameEarnings('cycle_milestone_15_split_remainder')).toBe(true)
    expect(countsAsGameEarnings('layer4_weekly_review')).toBe(true)
  })

  it('excludes season pause credit and admin grants', () => {
    expect(countsAsGameEarnings('intake_waitlist')).toBe(false)
    expect(countsAsGameEarnings('intake_waitlist_split_remainder')).toBe(false)
    expect(countsAsGameEarnings('admin_manual_goodwill_gesture')).toBe(false)
  })

  it('keeps legacy null-source rows counted', () => {
    expect(countsAsGameEarnings(null)).toBe(true)
    expect(countsAsGameEarnings(undefined)).toBe(true)
  })
})

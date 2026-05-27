/**
 * Characterization tests for pure dorm-wars math.
 *
 * Focused on applyDoubler — the multiplier function called on every Layer 1
 * and Layer 2 award. Wrong math here under-pays or over-pays the customer.
 */

import { describe, it, expect } from 'vitest'
import { applyDoubler } from './doubler'

describe('applyDoubler', () => {
  it('returns base value untouched when doubler is inactive', () => {
    expect(applyDoubler(50, 'referral_conversion', false)).toEqual({
      value: 50,
      source: 'referral_conversion',
    })
  })

  it('doubles the value when active and tags source with _2x', () => {
    expect(applyDoubler(50, 'referral_conversion', true)).toEqual({
      value: 100,
      source: 'referral_conversion_2x',
    })
  })

  it('preserves zero (zero × 2 = zero, but source still tagged)', () => {
    expect(applyDoubler(0, 'cycle_milestone_6', true)).toEqual({
      value: 0,
      source: 'cycle_milestone_6_2x',
    })
  })

  it('handles fractional AED amounts', () => {
    expect(applyDoubler(17.5, 'cycle_milestone_10', true).value).toBe(35)
  })
})

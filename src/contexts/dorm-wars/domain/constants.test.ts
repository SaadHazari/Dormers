/**
 * Characterization tests for the Layer 1 per-conversion cash ladder.
 *
 * cashForLifetimeConversion decides how much AED a referral pays. Wrong math
 * here under-pays or over-pays the inviter, and must match the LAYER1_CASH_LADDER
 * the Dorm Wars hub renders as "Cash per recruit (scales lifetime)".
 */

import { describe, it, expect } from 'vitest'
import { cashForLifetimeConversion, totalCashForConversions, LAYER1_CASH_LADDER } from './constants'

describe('cashForLifetimeConversion', () => {
  it('pays AED 20 across the first five lifetime conversions', () => {
    expect(cashForLifetimeConversion(1)).toBe(20)
    expect(cashForLifetimeConversion(5)).toBe(20)
  })

  it('steps up to AED 25 across conversions 6–10', () => {
    expect(cashForLifetimeConversion(6)).toBe(25)
    expect(cashForLifetimeConversion(10)).toBe(25)
  })

  it('steps up to AED 30 across conversions 11–15', () => {
    expect(cashForLifetimeConversion(11)).toBe(30)
    expect(cashForLifetimeConversion(15)).toBe(30)
  })

  it('caps at AED 35 from the 16th conversion onward', () => {
    expect(cashForLifetimeConversion(16)).toBe(35)
    expect(cashForLifetimeConversion(20)).toBe(35)
    expect(cashForLifetimeConversion(100)).toBe(35)
  })

  it('falls back to the first rung for non-positive counts', () => {
    expect(cashForLifetimeConversion(0)).toBe(20)
  })

  it('every rung in the ladder is reachable at its lower bound', () => {
    for (const rung of LAYER1_CASH_LADDER) {
      expect(cashForLifetimeConversion(rung.from)).toBe(rung.cash)
    }
  })
})

describe('totalCashForConversions', () => {
  it('is zero with no conversions', () => {
    expect(totalCashForConversions(0)).toBe(0)
  })

  it('sums each conversion at its own rung', () => {
    // 5 × 20
    expect(totalCashForConversions(5)).toBe(100)
    // 5 × 20 + 5 × 25
    expect(totalCashForConversions(10)).toBe(225)
    // + 5 × 30
    expect(totalCashForConversions(15)).toBe(375)
    // + 5 × 35
    expect(totalCashForConversions(20)).toBe(550)
  })
})

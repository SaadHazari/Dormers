/**
 * Characterization tests for shared/phone normalization.
 *
 * normalisePhone produces E.164 form for two main shapes:
 *   • UAE local 0xxxxxxxxx (10 digits, starts with '05')
 *   • Already +971xxxxxxxxx (12 digits when stripped, starts with '971')
 *
 * Used by identity (OTP), admin (lookups), referrals (invite).
 */

import { describe, it, expect } from 'vitest'
import { normalisePhone } from './phone'

describe('normalisePhone', () => {
  it('UAE local 05x input → +971...', () => {
    expect(normalisePhone('0504619384')).toBe('+971504619384')
  })

  it('preserves an already-E.164 +971 input', () => {
    expect(normalisePhone('+971504619384')).toBe('+971504619384')
  })

  it('strips spaces from formatted input', () => {
    expect(normalisePhone('+971 50 461 9384')).toBe('+971504619384')
  })

  it('strips dashes', () => {
    expect(normalisePhone('+971-50-461-9384')).toBe('+971504619384')
  })

  it('strips parentheses', () => {
    expect(normalisePhone('+971 (50) 461-9384')).toBe('+971504619384')
  })
})

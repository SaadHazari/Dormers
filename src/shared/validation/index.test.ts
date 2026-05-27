/**
 * Characterization tests for shared validators.
 *
 * Pure functions used across identity, profile updates, and referral
 * trial-claim. Catching the password rules + alpha-name rules here
 * means changes upstream surface immediately.
 */

import { describe, it, expect } from 'vitest'
import { isAlphaName, isPasswordStrong, checkPassword } from '.'

describe('isAlphaName — Latin letters + spaces only', () => {
  it('accepts a single word', () => {
    expect(isAlphaName('Saad')).toBe(true)
  })

  it('accepts a multi-word name with spaces', () => {
    expect(isAlphaName('Saad Hazari')).toBe(true)
  })

  it('rejects digits', () => {
    expect(isAlphaName('Saad1')).toBe(false)
  })

  it('rejects hyphens and apostrophes', () => {
    expect(isAlphaName("D'Angelo")).toBe(false)
    expect(isAlphaName('Anne-Marie')).toBe(false)
  })

  it('rejects accented characters', () => {
    expect(isAlphaName('Café')).toBe(false)
  })

  it('rejects empty input', () => {
    expect(isAlphaName('')).toBe(false)
  })
})

describe('isPasswordStrong / checkPassword', () => {
  it('passes all five checks for a fully-compliant password', () => {
    const c = checkPassword('GoodPass1!')
    expect(c.length).toBe(true)
    expect(c.upper).toBe(true)
    expect(c.lower).toBe(true)
    expect(c.number).toBe(true)
    expect(c.special).toBe(true)
    expect(isPasswordStrong('GoodPass1!')).toBe(true)
  })

  it('flags short input (< 8 chars)', () => {
    expect(checkPassword('Ab1!').length).toBe(false)
    expect(isPasswordStrong('Ab1!')).toBe(false)
  })

  it('flags missing uppercase', () => {
    expect(checkPassword('goodpass1!').upper).toBe(false)
    expect(isPasswordStrong('goodpass1!')).toBe(false)
  })

  it('flags missing number', () => {
    expect(checkPassword('GoodPassWord!').number).toBe(false)
    expect(isPasswordStrong('GoodPassWord!')).toBe(false)
  })

  it('flags missing special character', () => {
    expect(checkPassword('GoodPass1').special).toBe(false)
    expect(isPasswordStrong('GoodPass1')).toBe(false)
  })
})

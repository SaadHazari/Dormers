import { describe, expect, it } from 'vitest'
import { activeOtpIndex, sanitizeOtp } from './otp'

describe('sanitizeOtp', () => {
    it('keeps digits only', () => {
        expect(sanitizeOtp('12a3b4', 6)).toBe('1234')
    })

    it('truncates to the requested length', () => {
        expect(sanitizeOtp('1234567890', 6)).toBe('123456')
    })

    // The dominant real-world input is a paste from WhatsApp, where users
    // routinely grab surrounding whitespace or the code with a separator.
    it('survives a messy paste', () => {
        expect(sanitizeOtp('  123 456\n', 6)).toBe('123456')
        expect(sanitizeOtp('123-456', 6)).toBe('123456')
        expect(sanitizeOtp('Your code is 123456', 6)).toBe('123456')
    })

    it('handles empty and junk input', () => {
        expect(sanitizeOtp('', 6)).toBe('')
        expect(sanitizeOtp('abc', 6)).toBe('')
    })

    it('respects a non-6 length', () => {
        expect(sanitizeOtp('12345678', 4)).toBe('1234')
    })
})

describe('activeOtpIndex', () => {
    it('points at the first empty cell', () => {
        expect(activeOtpIndex('', 6)).toBe(0)
        expect(activeOtpIndex('123', 6)).toBe(3)
    })

    // Once full, the caret must stay on the LAST cell rather than running off
    // the end — otherwise the highlight vanishes exactly when the user is
    // checking what they typed.
    it('clamps to the last cell when full', () => {
        expect(activeOtpIndex('123456', 6)).toBe(5)
    })

    it('never returns a negative index for zero length', () => {
        expect(activeOtpIndex('', 0)).toBe(0)
    })
})

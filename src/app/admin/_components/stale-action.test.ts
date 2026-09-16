import { describe, it, expect } from 'vitest'
import { isStaleActionError } from './stale-action'

describe('isStaleActionError', () => {
    // The real one, straight out of Sentry (JAVASCRIPT-NEXTJS-1G).
    it('recognises the error Next throws after a redeploy', () => {
        const err = new Error('Server Action "40db634d5db763b3f292c809e4e4bceb35c0223e26" was not found on the server.')
        err.name = 'UnrecognizedActionError'
        expect(isStaleActionError(err)).toBe(true)
    })

    it('recognises it by name alone, in case the wording changes', () => {
        const err = new Error('something else entirely')
        err.name = 'UnrecognizedActionError'
        expect(isStaleActionError(err)).toBe(true)
    })

    it('recognises it by message alone, in case the name is stripped', () => {
        expect(isStaleActionError(new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'))).toBe(true)
    })

    it('is not fooled by an ordinary failure', () => {
        // A real server error must NOT trigger a reload — reloading would hide
        // the problem and lose whatever the admin had typed.
        for (const msg of ['fetch failed', 'Could not delete: permission denied', 'NetworkError when attempting to fetch resource', '']) {
            expect(isStaleActionError(new Error(msg))).toBe(false)
        }
    })

    it('handles things that are not Errors at all', () => {
        expect(isStaleActionError(null)).toBe(false)
        expect(isStaleActionError(undefined)).toBe(false)
        expect(isStaleActionError('Server Action was not found on the server')).toBe(true)
        expect(isStaleActionError({ message: 'Server Action "x" was not found on the server.' })).toBe(true)
        expect(isStaleActionError(42)).toBe(false)
    })
})

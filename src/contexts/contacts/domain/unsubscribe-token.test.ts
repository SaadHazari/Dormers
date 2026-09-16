import { describe, it, expect } from 'vitest'
import { signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token'

const SECRET = 'test-secret-value'
const OTHER = 'a-different-secret'
const ID = '3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const ID2 = '9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d'

describe('unsubscribe tokens', () => {
    it('round-trips the contact it was issued for', () => {
        expect(verifyUnsubscribeToken(signUnsubscribeToken(ID, SECRET), SECRET)).toBe(ID)
    })

    it('is stable, so a link in an old email still works', () => {
        expect(signUnsubscribeToken(ID, SECRET)).toBe(signUnsubscribeToken(ID, SECRET))
    })

    it('verifies for its own contact and for no other', () => {
        const token = signUnsubscribeToken(ID, SECRET)
        expect(verifyUnsubscribeToken(token, SECRET)).toBe(ID)
        // Swapping the id invalidates the signature, so nobody can
        // unsubscribe someone else by editing the link.
        const forged = token.replace(ID, ID2)
        expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull()
    })

    it('refuses a token signed with a different secret', () => {
        expect(verifyUnsubscribeToken(signUnsubscribeToken(ID, OTHER), SECRET)).toBeNull()
    })

    it('refuses junk rather than throwing', () => {
        for (const bad of ['', '.', 'nodot', `${ID}.`, `.${'x'.repeat(27)}`, 'x'.repeat(80)]) {
            expect(verifyUnsubscribeToken(bad, SECRET)).toBeNull()
        }
    })

    it('never hands back anything that is not a uuid', () => {
        // Even a correctly signed non-uuid must not become a lookup value.
        const evil = "'; drop table contacts; --"
        const token = signUnsubscribeToken(evil, SECRET)
        expect(verifyUnsubscribeToken(token, SECRET)).toBeNull()
    })

    it('is safe in a URL path and a mail header', () => {
        const token = signUnsubscribeToken(ID, SECRET)
        expect(token).toBe(encodeURIComponent(token))
        expect(token).not.toMatch(/[+/=\s]/)
    })

    it('refuses to sign or verify when no secret is configured', () => {
        expect(() => signUnsubscribeToken(ID, '')).toThrow(/secret/i)
        expect(verifyUnsubscribeToken(signUnsubscribeToken(ID, SECRET), '')).toBeNull()
    })
})

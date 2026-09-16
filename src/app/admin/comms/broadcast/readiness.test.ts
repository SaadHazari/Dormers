import { describe, it, expect } from 'vitest'
import { assessReadiness, type ReadinessInput } from './readiness'

function input(over: Partial<ReadinessInput> = {}): ReadinessInput {
    return {
        channel: 'whatsapp',
        mode: 'custom',
        audienceCount: 120,
        countLoading: false,
        includeUnknown: true,
        optedInCount: 0,
        templateChosen: true,
        missingVariables: [],
        subject: '',
        heading: '',
        body: '',
        remainingToday: 1000,
        quality: 'ok',
        ...over,
    }
}

describe('assessReadiness', () => {
    it('is ready when everything is in place', () => {
        const r = assessReadiness(input())
        expect(r.ready).toBe(true)
        expect(r.blocker).toBeNull()
    })

    // The dead end Saad could not get out of: nobody has opted in, so the
    // count was 0, so Send was disabled — and the switch that fixes it lived
    // behind Send. The blocker must name the fix and point at step 1.
    it('names the consent switch when nobody has opted in', () => {
        const r = assessReadiness(input({ audienceCount: 0, includeUnknown: false, optedInCount: 0 }))
        expect(r.ready).toBe(false)
        expect(r.step).toBe('audience')
        expect(r.blocker).toMatch(/nobody.*opted in/i)
        expect(r.fix).toMatch(/include/i)
    })

    it('says the audience is simply empty when consent is not the reason', () => {
        const r = assessReadiness(input({ audienceCount: 0, includeUnknown: true }))
        expect(r.step).toBe('audience')
        expect(r.blocker).toMatch(/nobody in this audience/i)
    })

    it('waits rather than blocks while the count is loading', () => {
        const r = assessReadiness(input({ countLoading: true }))
        expect(r.ready).toBe(false)
        expect(r.pending).toBe(true)
    })

    it('asks for a template before anything else on the message step', () => {
        const r = assessReadiness(input({ templateChosen: false }))
        expect(r.step).toBe('message')
        expect(r.blocker).toMatch(/template/i)
    })

    it('names the blanks still empty', () => {
        const r = assessReadiness(input({ missingVariables: ['first_name', 'offer_aed'] }))
        expect(r.step).toBe('message')
        expect(r.blocker).toContain('offer_aed')
    })

    it('refuses to send past what the number can reach today', () => {
        const r = assessReadiness(input({ audienceCount: 1200, remainingToday: 1000 }))
        expect(r.ready).toBe(false)
        expect(r.step).toBe('audience')
        expect(r.blocker).toMatch(/1,?000/)
    })

    it('refuses outright on a red number', () => {
        const r = assessReadiness(input({ quality: 'block' }))
        expect(r.ready).toBe(false)
        expect(r.step).toBe('send')
    })

    it('lets a yellow number through but says so', () => {
        const r = assessReadiness(input({ quality: 'warn' }))
        expect(r.ready).toBe(true)
        expect(r.warning).toMatch(/quality/i)
    })

    describe('email', () => {
        const email = (over: Partial<ReadinessInput> = {}) =>
            input({ channel: 'email', templateChosen: false, subject: 'Hi', heading: 'H', body: 'B', ...over })

        it('is ready with subject, heading and body', () => {
            expect(assessReadiness(email()).ready).toBe(true)
        })

        it('does not ask about templates or consent', () => {
            const r = assessReadiness(email())
            expect(r.blocker).toBeNull()
        })

        it('names the first missing field', () => {
            expect(assessReadiness(email({ subject: '' })).blocker).toMatch(/subject/i)
            expect(assessReadiness(email({ body: '  ' })).blocker).toMatch(/message/i)
        })

        it('ignores the daily WhatsApp cap', () => {
            expect(assessReadiness(email({ audienceCount: 5000, remainingToday: 10 })).ready).toBe(true)
        })

        it('needs nothing written for the reopening notice', () => {
            expect(assessReadiness(email({ mode: 'season_reopen', subject: '', heading: '', body: '' })).ready).toBe(true)
        })
    })
})

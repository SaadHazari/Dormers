import { describe, it, expect } from 'vitest'
import type { ContactRow } from './page'
import { isOptedOut, matchesFilter, reachabilityGap, sortContacts, sourceLabel } from './filters'

function row(over: Partial<ContactRow> = {}): ContactRow {
    return {
        id: 'c-1',
        email: 'someone@example.com',
        phone_e164: '+971500000001',
        name: 'Someone',
        source: 'customer',
        source_detail: null,
        customer_id: 'cust-1',
        tags: [],
        email_status: 'subscribed',
        whatsapp_status: 'unknown',
        last_emailed_at: null,
        on_waitlist: false,
        first_seen_at: '2026-08-01T00:00:00Z',
        created_at: '2026-08-01T00:00:00Z',
        ...over,
    }
}

describe('matchesFilter', () => {
    it('splits the book on whether someone ever made an account', () => {
        expect(matchesFilter(row({ customer_id: 'cust-1' }), 'customers')).toBe(true)
        expect(matchesFilter(row({ customer_id: 'cust-1' }), 'never_customers')).toBe(false)
        expect(matchesFilter(row({ customer_id: null }), 'never_customers')).toBe(true)
        expect(matchesFilter(row({ customer_id: null }), 'customers')).toBe(false)
    })

    it('matches the imported chip to the Zoho source only', () => {
        expect(matchesFilter(row({ source: 'zoho_import' }), 'imported')).toBe(true)
        expect(matchesFilter(row({ source: 'referral' }), 'imported')).toBe(false)
        expect(matchesFilter(row({ source: 'customer' }), 'imported')).toBe(false)
    })

    it('matches the waitlist chip to the flag the search RPC resolves', () => {
        expect(matchesFilter(row({ on_waitlist: true }), 'waitlist')).toBe(true)
        expect(matchesFilter(row({ on_waitlist: false }), 'waitlist')).toBe(false)
    })

    it('treats every chip as covering the whole book under "all"', () => {
        expect(matchesFilter(row({ customer_id: null, email: null }), 'all')).toBe(true)
    })

    it('finds the people a send cannot reach', () => {
        expect(matchesFilter(row({ email: null }), 'no_email')).toBe(true)
        expect(matchesFilter(row({ phone_e164: null }), 'no_phone')).toBe(true)
        expect(matchesFilter(row(), 'no_email')).toBe(false)
        expect(matchesFilter(row(), 'no_phone')).toBe(false)
    })
})

describe('isOptedOut', () => {
    // One chip spans both channels because the question is "must a send skip
    // this person", and that is true whichever channel they said stop on.
    it('counts anyone who is not cleanly subscribed on email', () => {
        expect(isOptedOut(row({ email_status: 'unsubscribed' }))).toBe(true)
        expect(isOptedOut(row({ email_status: 'bounced' }))).toBe(true)
        expect(isOptedOut(row({ email_status: 'complained' }))).toBe(true)
    })

    it('counts a WhatsApp opt-out even when their email is fine', () => {
        expect(isOptedOut(row({ whatsapp_status: 'opted_out' }))).toBe(true)
    })

    it('does not count an imported contact who has simply never opted in', () => {
        expect(isOptedOut(row({ whatsapp_status: 'unknown' }))).toBe(false)
        expect(isOptedOut(row({ whatsapp_status: 'failed' }))).toBe(false)
    })

    it('leaves a plain subscribed contact alone', () => {
        expect(isOptedOut(row())).toBe(false)
        expect(matchesFilter(row(), 'unsubscribed')).toBe(false)
    })
})

describe('reachabilityGap', () => {
    it('says nothing when both channels are open', () => {
        expect(reachabilityGap(row())).toBeNull()
    })

    it('names the missing channel', () => {
        expect(reachabilityGap(row({ email: null }))).toBe('No email')
        expect(reachabilityGap(row({ phone_e164: null }))).toBe('No phone')
    })

    it('calls out a contact with neither', () => {
        expect(reachabilityGap(row({ email: null, phone_e164: null }))).toBe('Unreachable')
    })
})

describe('sourceLabel', () => {
    it('reads the sources in plain words', () => {
        expect(sourceLabel('zoho_import')).toBe('Zoho')
        expect(sourceLabel('free_signup')).toBe('Free signup')
    })

    it('falls back to the raw value rather than showing nothing', () => {
        expect(sourceLabel('something_new')).toBe('something_new')
    })
})

describe('sortContacts', () => {
    it('sorts by when we first met them, not when the import landed', () => {
        const old = row({ id: 'old', first_seen_at: '2024-05-01T00:00:00Z', created_at: '2026-09-16T00:00:00Z' })
        const recent = row({ id: 'recent', first_seen_at: '2026-08-01T00:00:00Z', created_at: '2026-08-01T00:00:00Z' })
        expect(sortContacts([old, recent], 'newest').map(c => c.id)).toEqual(['recent', 'old'])
    })

    it('sorts by name and pushes unnamed contacts to the end', () => {
        const zara = row({ id: 'z', name: 'Zara' })
        const adam = row({ id: 'a', name: 'Adam' })
        const none = row({ id: 'n', name: null })
        expect(sortContacts([none, zara, adam], 'name').map(c => c.id)).toEqual(['a', 'z', 'n'])
    })

    it('does not mutate the input array', () => {
        const input = [row({ id: 'a' }), row({ id: 'b' })]
        sortContacts(input, 'name')
        expect(input.map(c => c.id)).toEqual(['a', 'b'])
    })
})

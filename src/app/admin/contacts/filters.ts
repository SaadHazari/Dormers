/**
 * Filter + sort rules for the admin contact book.
 *
 * Deliberately shaped like src/app/admin/customers/priority.ts: a pure module
 * with no React and no 'use client', so the same predicates drive the chip
 * counts, the filtered list, and (later) the broadcast audiences that carry
 * the same names. An audience that disagrees with the chip it is named after
 * is the bug this shape exists to prevent.
 */

import type { ContactRow } from './page'

export type FilterKey =
    | 'all'
    | 'customers'
    | 'never_customers'
    | 'imported'
    | 'waitlist'
    | 'unsubscribed'
    | 'no_email'
    | 'no_phone'

/**
 * Opted out of anything. One chip rather than two because the question an
 * admin actually asks is "who must this send skip", and the answer spans both
 * channels — a contact who said stop on WhatsApp and one who unsubscribed
 * from email are the same kind of row to be careful with.
 */
export function isOptedOut(c: ContactRow): boolean {
    return c.email_status !== 'subscribed' || c.whatsapp_status === 'opted_out'
}

export function matchesFilter(c: ContactRow, key: FilterKey): boolean {
    switch (key) {
        case 'all': return true
        case 'customers': return c.customer_id !== null
        case 'never_customers': return c.customer_id === null
        case 'imported': return c.source === 'zoho_import'
        case 'waitlist': return c.on_waitlist
        case 'unsubscribed': return isOptedOut(c)
        case 'no_email': return !c.email
        case 'no_phone': return !c.phone_e164
    }
}

/**
 * How we can actually reach this person, for the row's reachability tag.
 * Null when they are reachable both ways and nothing needs saying.
 */
export function reachabilityGap(c: ContactRow): 'No email' | 'No phone' | 'Unreachable' | null {
    if (!c.email && !c.phone_e164) return 'Unreachable'
    if (!c.email) return 'No email'
    if (!c.phone_e164) return 'No phone'
    return null
}

/** Human label for where a contact came from. */
const SOURCE_LABELS: Record<string, string> = {
    customer: 'Customer',
    zoho_import: 'Zoho',
    website: 'Website',
    referral: 'Referral',
    free_signup: 'Free signup',
    waitlist: 'Waitlist',
    manual: 'Added by hand',
}

export function sourceLabel(source: string): string {
    return SOURCE_LABELS[source] ?? source
}

export type SortMode = 'newest' | 'name'

export function sortContacts(rows: ContactRow[], mode: SortMode): ContactRow[] {
    const sorted = [...rows]
    if (mode === 'name') {
        sorted.sort((a, b) => {
            const an = a.name?.trim() || ''
            const bn = b.name?.trim() || ''
            if (!an !== !bn) return an ? -1 : 1 // unnamed contacts last
            return an.localeCompare(bn, 'en')
        })
        return sorted
    }
    // first_seen_at, not created_at: an imported contact we met two years ago
    // should sort by when we met them, not by when the CSV landed.
    sorted.sort((a, b) => b.first_seen_at.localeCompare(a.first_seen_at))
    return sorted
}

/**
 * Turning a CSV into a decision.
 *
 * The import screen never writes anything an admin has not first seen counted.
 * This module is the whole of that judgement: normalise each row, decide which
 * bucket it falls in, and hand back a plan. Pure on purpose — no database, no
 * React — so the rules can be tested against the shapes real exports contain.
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

/** One address, one @, a dot in the domain, and no room for a second address. */
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;.]+$/

export function normaliseEmail(raw: string | null | undefined): string | null {
    const v = (raw ?? '').trim().toLowerCase()
    if (!v || !EMAIL_RE.test(v)) return null
    return v
}

/**
 * E.164, or nothing.
 *
 * Validated per country with libphonenumber's full metadata, because the 2026-09-16
 * import proved hand-rolled rules wrong: Zoho Books keeps the national part of a
 * number in `mobile` with no country code, and the old normaliser turned
 * "595077281" (a Saudi number) into "+595077281" by prefixing a bare "+". That
 * passed a shape check and corrupted 686 contacts.
 *
 * Two rules now:
 *   - A number that says its country (leading "+" or "00") is parsed as such and
 *     must be valid FOR that country — a Nigerian number with an extra digit is
 *     refused, not stored.
 *   - A number that does not is assumed UAE, because that is who these forms
 *     were for, and is kept only if it is a valid UAE number. A Saudi or Indian
 *     number with its code missing is therefore refused rather than guessed at.
 *     We never invent a country code.
 */
export function normalisePhoneE164(raw: string | null | undefined): string | null {
    // Excel and Mailchimp prefix numbers with an apostrophe to stop them being
    // read as maths; it is not part of the number.
    const v = (raw ?? '').replace(/^[\s'"]+/, '').trim()
    if (!v) return null

    const international = /^(\+|00)/.test(v)
    const input = v.replace(/^00/, '+')
    const parsed = parsePhoneNumberFromString(input, international ? undefined : 'AE')
    return parsed && parsed.isValid() ? parsed.number : null
}

export function normaliseName(raw: string | null | undefined): string | null {
    const v = (raw ?? '').replace(/\s+/g, ' ').trim()
    if (!v) return null
    // Zoho and most address books write "Surname, Firstname" into one column.
    const parts = v.split(',')
    if (parts.length === 2) {
        const [last, first] = parts.map(p => p.trim())
        if (last && first) return `${first} ${last}`
    }
    return v
}

// Column mapping lives in ./column-mapping so the import screen can use it in
// the browser without pulling in libphonenumber's full metadata (~145KB), which
// only the server-side planner needs.
export { guessColumnMapping, type ColumnMapping } from './column-mapping'

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export type Bucket =
    | 'new'
    | 'existing_contact'
    | 'existing_customer'
    | 'duplicate_in_file'
    | 'invalid'

export interface RawRow {
    rowNumber: number
    name?: string | null
    email?: string | null
    phone?: string | null
}

export interface ExistingContact {
    email: string | null
    phone_e164: string | null
    isCustomer: boolean
}

export interface PlannedRow {
    rowNumber: number
    bucket: Bucket
    name: string | null
    email: string | null
    phone: string | null
    reason?: string
}

export function planImport(rows: RawRow[], existing: ExistingContact[]): PlannedRow[] {
    const byEmail = new Map<string, ExistingContact>()
    // Counted, not indexed: a number two people share identifies neither of
    // them, so a phone-only row may only match a number exactly one contact
    // holds. This is the same rule the customers mirror applies in SQL.
    const phoneOwners = new Map<string, ExistingContact[]>()
    for (const c of existing) {
        if (c.email) byEmail.set(c.email.toLowerCase(), c)
        if (c.phone_e164) {
            const owners = phoneOwners.get(c.phone_e164) ?? []
            owners.push(c)
            phoneOwners.set(c.phone_e164, owners)
        }
    }

    const seenEmails = new Set<string>()
    const seenPhones = new Set<string>()

    return rows.map(raw => {
        const email = normaliseEmail(raw.email)
        const phone = normalisePhoneE164(raw.phone)
        const name = normaliseName(raw.name)
        const base = { rowNumber: raw.rowNumber, name, email, phone }

        if (!email && !phone) {
            return { ...base, bucket: 'invalid' as const, reason: 'No email or phone we can use' }
        }

        if (email) {
            if (seenEmails.has(email)) {
                return { ...base, bucket: 'duplicate_in_file' as const, reason: 'This email appears earlier in the file' }
            }
            seenEmails.add(email)
            const match = byEmail.get(email)
            if (match) {
                return { ...base, bucket: match.isCustomer ? 'existing_customer' as const : 'existing_contact' as const }
            }
            // An email we have never seen makes this a new person even if the
            // phone is shared with someone — flatmates, a family handset.
            if (phone) seenPhones.add(phone)
            return { ...base, bucket: 'new' as const }
        }

        // Phone-only from here.
        if (seenPhones.has(phone!)) {
            return { ...base, bucket: 'duplicate_in_file' as const, reason: 'This number appears earlier in the file' }
        }
        seenPhones.add(phone!)
        const owners = phoneOwners.get(phone!) ?? []
        if (owners.length === 1) {
            return { ...base, bucket: owners[0].isCustomer ? 'existing_customer' as const : 'existing_contact' as const }
        }
        return { ...base, bucket: 'new' as const }
    })
}

/** Counts for the preview, in the order the screen shows them. */
export function tallyPlan(plan: PlannedRow[]): Record<Bucket, number> {
    const tally: Record<Bucket, number> = {
        new: 0, existing_contact: 0, existing_customer: 0, duplicate_in_file: 0, invalid: 0,
    }
    for (const row of plan) tally[row.bucket]++
    return tally
}

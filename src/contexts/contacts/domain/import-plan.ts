/**
 * Turning a CSV into a decision.
 *
 * The import screen never writes anything an admin has not first seen counted.
 * This module is the whole of that judgement: normalise each row, decide which
 * bucket it falls in, and hand back a plan. Pure on purpose — no database, no
 * React — so the rules can be tested against the shapes real exports contain.
 */

import { normalisePhone } from '@/shared/phone'

/** One address, one @, a dot in the domain, and no room for a second address. */
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;.]+$/

export function normaliseEmail(raw: string | null | undefined): string | null {
    const v = (raw ?? '').trim().toLowerCase()
    if (!v || !EMAIL_RE.test(v)) return null
    return v
}

/**
 * E.164 or nothing. `normalisePhone` in shared/ is deliberately lenient — it
 * serves an OTP field where a half-typed number should still round-trip — so
 * this wraps it with the strictness an import needs: a junk cell must become
 * `invalid`, not a contact nobody can ring.
 */
export function normalisePhoneE164(raw: string | null | undefined): string | null {
    const v = (raw ?? '').trim()
    if (!v) return null
    // `00971…` is the other international prefix a UAE export uses.
    const stripped = v.replace(/^00/, '+')
    const e164 = normalisePhone(stripped)
    return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null
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

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

export interface ColumnMapping {
    name: number | null
    email: number | null
    phone: number | null
}

// Ordered best-guess first. A 'mobile' column beats a 'phone' one because an
// export that has both keeps the landline in 'phone'.
const HEADER_HINTS: Record<keyof ColumnMapping, string[]> = {
    email: ['email address', 'emailid', 'email id', 'e-mail', 'email', 'mail'],
    phone: ['whatsapp', 'mobile phone', 'mobile', 'cell', 'phone number', 'phone', 'contact number'],
    name: ['display name', 'full name', 'contact name', 'customer name', 'name', 'first name'],
}

/**
 * Guess which column is which, so a clean export needs no mapping at all.
 * Returns null for a field rather than picking a column it does not recognise:
 * a wrong guess that looks confident is worse than an obvious blank.
 */
export function guessColumnMapping(headers: string[]): ColumnMapping {
    const lower = headers.map(h => h.trim().toLowerCase())
    const pick = (field: keyof ColumnMapping): number | null => {
        for (const hint of HEADER_HINTS[field]) {
            const exact = lower.indexOf(hint)
            if (exact !== -1) return exact
        }
        for (const hint of HEADER_HINTS[field]) {
            const partial = lower.findIndex(h => h.includes(hint))
            if (partial !== -1) return partial
        }
        return null
    }
    return { name: pick('name'), email: pick('email'), phone: pick('phone') }
}

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

/**
 * Guessing which CSV column is which.
 *
 * Its own module on purpose: the import screen runs this in the browser, and
 * keeping it apart from import-plan.ts keeps libphonenumber's full metadata off
 * the client bundle. Nothing here needs it.
 */

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


// Shared validators for auth flows. Pure functions — safe to import from
// both client components and 'use server' actions so the same rules enforce
// on both sides.

// ─── Name ─────────────────────────────────────────────────────────────────
// "Plainly alphabetical": Latin letters and ASCII spaces only. Hyphens,
// apostrophes, digits, punctuation, and accented characters are all rejected.
// Multi-word names (e.g. "Saad Hazari") are allowed via the space class.
const NAME_REGEX = /^[A-Za-z][A-Za-z ]*[A-Za-z]$|^[A-Za-z]$/

export function isAlphaName(s: string): boolean {
    const trimmed = s.trim()
    if (!trimmed) return false
    return NAME_REGEX.test(trimmed)
}

// Strip every char that isn't a letter or single space, and collapse runs of
// whitespace. Used by the input onChange to filter keystrokes in real-time so
// the user can never type an invalid character into the name field.
export function sanitizeNameInput(raw: string): string {
    return raw.replace(/[^A-Za-z ]/g, '').replace(/ {2,}/g, ' ')
}

// ─── Password ─────────────────────────────────────────────────────────────
export interface PasswordChecks {
    length:  boolean   // ≥ 8 characters
    upper:   boolean   // ≥ 1 uppercase letter
    lower:   boolean   // ≥ 1 lowercase letter
    number:  boolean   // ≥ 1 digit
    special: boolean   // ≥ 1 non-alphanumeric, non-space character
}

export function checkPassword(p: string): PasswordChecks {
    return {
        length:  p.length >= 8,
        upper:   /[A-Z]/.test(p),
        lower:   /[a-z]/.test(p),
        number:  /[0-9]/.test(p),
        special: /[^A-Za-z0-9\s]/.test(p),
    }
}

export function isPasswordStrong(p: string): boolean {
    const c = checkPassword(p)
    return c.length && c.upper && c.lower && c.number && c.special
}

// Single-line summary of the rule set for error banners and server messages.
export const PASSWORD_RULES_TEXT =
    'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.'

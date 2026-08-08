// Pure helpers for one-time-code entry. Kept free of React so the rules that
// actually bite (paste handling, caret clamping) are unit-testable in the
// node test env — the component around them is verified by rendering.

/**
 * Digits only, capped at `length`.
 *
 * Deliberately permissive about what surrounds the digits: the common path is
 * a paste out of WhatsApp, where users pick up spaces, newlines, a separator,
 * or the whole "Your code is 123456" sentence. Stripping non-digits turns all
 * of those into a clean code instead of a validation error.
 */
export function sanitizeOtp(raw: string, length: number): string {
    return (raw ?? '').replace(/\D/g, '').slice(0, Math.max(0, length))
}

/**
 * Index of the cell the caret belongs in — the first empty one, clamped to the
 * last cell once the code is full so the highlight doesn't disappear at the
 * moment the user is proof-reading what they typed.
 */
export function activeOtpIndex(value: string, length: number): number {
    if (length <= 0) return 0
    return Math.min(value.length, length - 1)
}

/**
 * Canonical contact details for Dormers'. Use these everywhere instead
 * of inlining numbers/emails — keeps the surface in sync and lets us
 * change a number with a one-line edit.
 */

/** E.164 with leading + — used in `tel:` URIs and display strings. */
export const WHATSAPP_NUMBER = '+971504619384'

/** Human-readable display variant with thousands-style spacing. */
export const WHATSAPP_NUMBER_DISPLAY = '+971 504 619 384'

/**
 * Builds a `https://wa.me/...` URL. Strips the leading + (wa.me convention,
 * applied silently by WhatsApp anyway — but the codebase had drifted between
 * `wa.me/971...` and `wa.me/+971...` and this normalises it).
 *
 * Pass a `message` to pre-fill the chat with text.
 */
export function whatsAppHref(message?: string): string {
    const num = WHATSAPP_NUMBER.replace(/^\+/, '')
    const base = `https://wa.me/${num}`
    return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

/** Display label for the wa.me link (no `https://` prefix). */
export const WHATSAPP_HANDLE_DISPLAY = `wa.me/${WHATSAPP_NUMBER.replace(/^\+/, '')}`

/**
 * Builds a `https://wa.me/...` URL aimed at *someone else* — the outbound
 * direction, where an admin opens a chat with a rider or kitchen lead.
 * {@link whatsAppHref} is the inbound direction (customer → Dormers) and is
 * pinned to the Dormers number; this one takes the recipient.
 *
 * Accepts any format (`+971 50 461 9384`, `00971…`, digits) and normalises to
 * the digits-only form wa.me expects.
 */
export function whatsAppTo(phone: string, message?: string): string {
    const digits = phone.replace(/\D/g, '').replace(/^00/, '')
    const base = `https://wa.me/${digits}`
    return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

/** Customer-care email (account, billing, plan changes). */
export const SUPPORT_EMAIL = 'care@dormers.ae'

/**
 * Production host used for referral / share links when no env override is
 * present. Kept as a constant rather than scattered string literals so the
 * canonical hostname lives in one place.
 */
const REFERRAL_HOST_PROD = 'https://dormers.ae'

/**
 * Build a referral landing URL for a given customer CID. Honours
 * NEXT_PUBLIC_BASE_URL when set so local dev (e.g. http://localhost:3004)
 * and preview deploys produce links that actually open the running app
 * instead of bouncing the user to production. The env var is inlined at
 * build time by Next, so this is safe to call from client components.
 */
export function referralUrl(cid: string): string {
    const base = (process.env.NEXT_PUBLIC_BASE_URL || REFERRAL_HOST_PROD).replace(/\/$/, '')
    return `${base}/r/${cid}`
}

/**
 * Display variant of the referral URL with the protocol stripped — the form
 * the customer sees in the "copy this link" pill on the dashboard. Mirrors
 * the same env-aware host resolution as referralUrl().
 */
export function referralUrlDisplay(cid: string): string {
    return referralUrl(cid).replace(/^https?:\/\//, '')
}

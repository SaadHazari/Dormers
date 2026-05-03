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

/** Customer-care email (account, billing, plan changes). */
export const SUPPORT_EMAIL = 'care@dormers.ae'

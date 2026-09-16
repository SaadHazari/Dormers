/**
 * Unsubscribe links, as a signed token rather than a stored one.
 *
 * A marketing email to a two-year-old list without one-click unsubscribe
 * costs the sending domain its reputation, and the same domain carries order
 * confirmations and auth mail. So every broadcast footer needs a link, and
 * every link needs to be unguessable — otherwise anyone can unsubscribe
 * anyone by walking contact ids.
 *
 * An HMAC over the contact id gets both with no table to keep in sync and no
 * row to expire: the link works forever, which is what a mail client's
 * List-Unsubscribe header assumes, and nothing is revealed but an opaque id.
 *
 * Pure except for node:crypto, so the round-trip is testable without a
 * database or a request.
 */

import { createHmac } from 'node:crypto'
import { timingSafeCompare } from '@/shared/crypto'

function b64url(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sign(contactId: string, secret: string): string {
    return b64url(createHmac('sha256', secret).update(contactId).digest()).slice(0, 27)
}

/** `<contact id>.<signature>` — one path segment, safe in a URL and a header. */
export function signUnsubscribeToken(contactId: string, secret: string): string {
    if (!secret) throw new Error('Unsubscribe secret is not set')
    return `${contactId}.${sign(contactId, secret)}`
}

/**
 * The contact this token is for, or null if it was not issued by us.
 * Compared in constant time so a wrong signature leaks nothing about how
 * wrong it was.
 */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
    if (!secret || typeof token !== 'string') return null
    const dot = token.lastIndexOf('.')
    if (dot <= 0 || dot === token.length - 1) return null

    const contactId = token.slice(0, dot)
    const signature = token.slice(dot + 1)
    // Only ever hand back something shaped like the id we signed, so a
    // forged token can never become a lookup for something else.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contactId)) return null

    return timingSafeCompare(signature, sign(contactId, secret)) ? contactId : null
}

/**
 * The signing secret. A dedicated variable when one is set, falling back to
 * the internal secret that already gates the cron routes — so unsubscribe
 * links work from the first send rather than waiting on a deploy, and can be
 * rotated onto their own key later without changing any call site.
 */
export function unsubscribeSecret(): string {
    return process.env.UNSUBSCRIBE_SECRET || process.env.INTERNAL_RETRY_SECRET || ''
}

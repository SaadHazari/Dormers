/**
 * Staff claim codes — the one-time ticket that lets a pre-registered intern
 * into the staff onboarding flow.
 *
 * Design contract (locked 2026-06-12):
 *   • The code is a CLAIM TICKET, not a credential. It opens the door once;
 *     the intern sets their own password inside the normal onboarding.
 *   • Bound to the registry row's email AND whatsapp_number — the claim
 *     screen checks email+code, and onboarding's existing WhatsApp OTP step
 *     proves possession of the registered phone. A forwarded link/code is
 *     useless to anyone else.
 *   • Single-use with a 7-day shelf life; passing the claim check opens a
 *     60-minute window for completing onboarding.
 *
 * Only the sha256 hash is stored. The plaintext exists exactly twice: on the
 * admin's screen at creation, and in whatever WhatsApp message the admin
 * sends the intern.
 */

import { createHash, randomBytes } from 'node:crypto'

export const CODE_TTL_DAYS = 7
export const CLAIM_WINDOW_MINUTES = 60

// No 0/O/1/I/L — interns type this off a WhatsApp message on a phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** 8 chars, dashed for readability: e.g. "K3QF-7WMP". */
export function generateClaimCode(): string {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
    if (i === 3) out += '-'
  }
  return out
}

/** Case/dash/space-insensitive — "k3qf 7wmp" hashes the same as "K3QF-7WMP". */
export function normalizeClaimCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function hashClaimCode(raw: string): string {
  return createHash('sha256').update(normalizeClaimCode(raw)).digest('hex')
}

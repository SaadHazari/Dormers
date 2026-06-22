import 'server-only'
import { headers } from 'next/headers'
import { createHash } from 'crypto'

/**
 * Request-IP + opaque-key helpers (Release It! L3).
 *
 * Centralised so the rate limiter and any velocity caps share one
 * implementation. (The referral flow has its own local copies predating this;
 * dedup of those is a low-risk follow-up — left untouched here to avoid
 * touching that hot path.)
 */

/**
 * Best-effort client IP from proxy headers. Returns null when undeterminable
 * (local dev / direct hits) — callers should bucket those under a constant.
 */
export async function resolveClientIp(): Promise<string | null> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? h.get('cf-connecting-ip') ?? null
}

/**
 * Namespaced SHA-256 of an identifier (IP, email, …). We store the HASH, never
 * the raw value, so the rate-limit table holds no PII and the small IPv4 space
 * isn't trivially reversible. The namespace prevents cross-feature collisions.
 */
export function hashKey(value: string, namespace: string): string {
  return createHash('sha256').update(`${namespace}:${value}`).digest('hex')
}

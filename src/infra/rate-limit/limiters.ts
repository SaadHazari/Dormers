import 'server-only'
import { RateLimiter, type RateLimitDecision } from './rate-limiter'
import { SupabaseRateLimitStore } from './supabase-store'
import { resolveClientIp, hashKey } from '@/infra/http/client-ip'
import { logger } from '@/infra/logging/logger'

/**
 * Per-endpoint rate limiters (Release It! L3).
 *
 * ENFORCING (flipped from shadow after a 3-day watch showed zero abuse and no
 * real request near a limit). The store FAILS OPEN, so a DB outage still can't
 * block anyone, and every blocked request gets a friendly response + WhatsApp
 * escape at the call site.
 *
 * DORM-NAT AWARE: Dormers serves dorms where many students share one wifi/IP,
 * so the per-IP limits are set GENEROUSLY — high enough that a whole dorm
 * signing up in a burst sails through, low enough that a scripted flood (orders
 * of magnitude more) is still caught. The per-EMAIL staff-claim limit is immune
 * to shared IPs. The tight per-PHONE OTP cap (5/hr, inside /api/whatsapp/start)
 * stays as the per-person guard beneath the looser per-IP layer.
 */

const MODE = 'enforce' as const
const store = new SupabaseRateLimitStore()

// Log only the interesting decisions (would-block / fail-open) to keep volume
// low. Query Sentry/Netlify for area:"rate-limit" to see the shadow signal.
function logDecision(d: RateLimitDecision) {
  if (d.wouldBlock || d.failedOpen) {
    logger.warn(
      {
        area: 'rate-limit',
        limiter: d.name,
        mode: d.mode,
        wouldBlock: d.wouldBlock,
        failedOpen: d.failedOpen,
        limit: d.limit,
        remaining: d.remaining,
        key: d.key,
      },
      `rate-limit ${d.failedOpen ? 'failed open' : 'would block'}: ${d.name}`,
    )
  }
}

function makeLimiter(name: string, limit: number, windowMs: number) {
  return new RateLimiter({ name, limit, windowMs, mode: MODE, store, onDecision: logDecision })
}

// /api/chat — anonymous Gemini spend. 60 / minute / IP: a whole dorm chatting
// won't hit it; a script does. (Raised from 30 for shared-dorm-IP headroom.)
export const chatLimiter = makeLimiter('chat', 60, 60_000)

// /api/whatsapp/start — paid WhatsApp template sends. 40 / hour / IP: covers a
// dorm signup surge behind one NAT while still stopping a phone-rotation flood.
// The tight per-PHONE cap (5/hr) inside the route is the real per-person guard.
export const otpIpLimiter = makeLimiter('otp-ip', 40, 60 * 60_000)

// verifyStaffClaim — keyed per (hashed) email to catch code brute-forcing of a
// specific staff invite regardless of source IP (immune to shared dorm NAT). 10 / 10 min.
export const staffClaimLimiter = makeLimiter('staff-claim', 10, 10 * 60_000)

// /api/referral/inviter — unauthenticated CID→first-name lookup (enumeration).
// 120 / minute / IP: generous for a dorm browsing referral links; a scripted
// enumerator still trips it. (Raised from 60 for shared-dorm-IP headroom.)
export const inviterLimiter = makeLimiter('inviter', 120, 60_000)

/**
 * Build a hashed per-IP limiter key (no raw IP in the DB). Unknown IPs bucket
 * under a constant so we still count something in local/direct hits.
 */
export async function ipKey(prefix: string): Promise<string> {
  const ip = await resolveClientIp()
  return `${prefix}:${ip ? hashKey(ip, 'ratelimit-ip') : 'unknown'}`
}

/** Hashed per-identifier key (e.g. email) — no raw PII in the DB. */
export function identifierKey(prefix: string, value: string): string {
  return `${prefix}:${hashKey(value, `ratelimit-${prefix}`)}`
}

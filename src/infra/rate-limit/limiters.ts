import 'server-only'
import { RateLimiter, type RateLimitDecision } from './rate-limiter'
import { SupabaseRateLimitStore } from './supabase-store'
import { resolveClientIp, hashKey } from '@/infra/http/client-ip'
import { logger } from '@/infra/logging/logger'

/**
 * Per-endpoint rate limiters (Release It! L3).
 *
 * SHADOW-FIRST (Prime Directive): every limiter ships in 'shadow' mode — it
 * computes would-be-blocks and logs them, but ALWAYS allows. We run shadow
 * against real traffic, confirm no real customer ever approaches the limit,
 * tune these thresholds, and only THEN flip MODE to 'enforce'. The store also
 * fails open, so even a DB outage can't block anyone.
 *
 * Thresholds are deliberately generous starting points — tune from shadow data
 * before enforcing.
 */

const MODE = 'shadow' as const
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

// /api/chat — anonymous Gemini spend. 30 messages / minute / IP is generous for
// a human; a script blows past it.
export const chatLimiter = makeLimiter('chat', 30, 60_000)

// /api/whatsapp/start — paid WhatsApp template sends. Per-IP (on top of the
// existing per-phone cap) to stop phone-rotation credit drain. 10 / hour / IP.
export const otpIpLimiter = makeLimiter('otp-ip', 10, 60 * 60_000)

// verifyStaffClaim — keyed per (hashed) email to catch code brute-forcing of a
// specific staff invite regardless of source IP. 10 / 10 min.
export const staffClaimLimiter = makeLimiter('staff-claim', 10, 10 * 60_000)

// /api/referral/inviter — unauthenticated CID→first-name lookup (enumeration).
// 60 / minute / IP is plenty for genuine landing-page visits.
export const inviterLimiter = makeLimiter('inviter', 60, 60_000)

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

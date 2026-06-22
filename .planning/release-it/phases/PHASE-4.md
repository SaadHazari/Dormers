# Phase 4 — Rate limiting (shadow / watch-only) ◑

Branch: `release-it/phase-4-rate-limiting` (stacked on Phase 5)

Closes the audit's macro Critical #3 (three unauthenticated, money-spending endpoints with no
rate limiting) — but SHADOW-FIRST, so it observes real traffic without ever blocking a customer.
Enforcement is a deliberate later flip, after the shadow data proves safe thresholds.

## Durable store (the foundation)
In-memory counters reset per serverless instance and undercount across the fleet — useless for
real observation or cross-instance enforcement. So Phase 4 ships a durable Postgres-backed store.

**LIVE on the Ohio DB (yjjayivwfqjfppawgyaz), applied via Supabase MCP** + mirrored to
`supabase/migrations/20260622120000_phase4_rate_limit_buckets.sql`:
- `rate_limit_buckets` table — fixed-window counter, keyed by an opaque hashed string (no PII).
- `rate_limit_hit(p_key, p_window_seconds)` RPC — atomic increment, SECURITY DEFINER, pinned
  `search_path`. Verified: increments 1→2→3 atomically.
- Security per the DB model: RLS deny-all, grants revoked from anon/authenticated, execute
  granted to service_role only. Verified live.
- `rate-limit-gc` pg_cron job (every 30 min) drops windows older than 2h — steady-state cleanup.

## Code
- `infra/http/client-ip.ts` — shared `resolveClientIp` + `hashKey(value, namespace)` (we store
  hashes, never raw IP/email). (Referral's local copies left untouched to avoid that hot path.)
- `infra/rate-limit/supabase-store.ts` — `SupabaseRateLimitStore` over the RPC; throws on DB
  error so the limiter FAILS OPEN.
- `infra/rate-limit/limiters.ts` — four limiters, all `mode: 'shadow'`, generous starting
  thresholds, every would-block/fail-open logged (`area: "rate-limit"`).

## Wired (shadow, observe-only, fails open)
- `/api/chat` — 30/min/IP (anonymous Gemini spend)
- `/api/whatsapp/start` — 10/hour/IP (on top of the existing 5/hour/phone) — phone-rotation drain
- `verifyStaffClaim` — 10/10min per hashed email — code brute-forcing
- `/api/referral/inviter` — 60/min/IP — CID enumeration

## Verification
- New tests: SupabaseRateLimitStore (RPC mapping + throws-on-error→fail-open) + hashKey — 7 tests
- Full suite: 330 (was 323); tsc clean; lint clean; build green
- Live RPC + cron + security posture verified via MCP

## Customer impact
None — shadow mode always allows, the store fails open, and thresholds are generous. Adds one
fast indexed upsert per request on the four endpoints during the observation window.

## NEXT (the flip — deliberately deferred)
After a few days of real traffic, read the `area:"rate-limit"` shadow logs: if no real customer
ever hits `wouldBlock`, tune thresholds with margin and flip `MODE` to `'enforce'` in
`limiters.ts` (one line), adding a friendly 429 + WhatsApp escape at each call site. Do NOT flip
without reviewing the shadow data first.

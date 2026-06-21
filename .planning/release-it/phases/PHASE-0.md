# Phase 0 — Foundations ✅

Branch: `release-it/phase-0-foundations`

## What was built (all scaffolding — wired to NOTHING except a warn-only boot log)

| Module | File | Purpose | Wired? |
|---|---|---|---|
| Retry w/ jitter | `src/infra/http/retry.ts` | exponential backoff + full jitter, bounded, `shouldRetry`, abortable | no |
| Circuit breaker | `src/infra/http/circuit-breaker.ts` | closed/open/half-open + shared registry | no |
| Resilient call | `src/infra/http/resilient-call.ts` | composes breaker → retry → timeout → fn | no |
| Rate limiter | `src/infra/rate-limit/rate-limiter.ts` | shadow-first, fail-open, in-memory store | no |
| Env schema | `src/infra/config/env-schema.ts` | dependency-free validator, derived from real `process.env` reads | warn-only at boot |
| Capture error | `src/infra/logging/capture-error.ts` | one call → pino log + Sentry issue w/ tags | no |

## The one boot-path change
`src/instrumentation.ts` `register()` now calls `validateEnv()` in **warn-only** mode (Node runtime only, wrapped in try/catch). It logs missing/invalid config at boot; it never throws. Phase 8 flips it to fail-fast. Zero request-path / customer impact.

## Verification
- 35 new unit tests (retry, breaker, resilient-call, limiter, env-schema, capture-error) — all pass
- Full suite: 313 tests pass
- `tsc --noEmit`: clean
- `npm run lint`: clean (only pre-existing `<img>` warnings in qr-codes / RiderClient)
- `npm run build`: green (Node + Edge bundles)

## Notes / follow-ups surfaced
- `.env.example` is **stale**: it lists `META_WHATSAPP_TOKEN` / `META_WHATSAPP_PHONE_NUMBER_ID`, but the code reads `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_APP_SECRET` / `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. The env-schema uses the real keys. Update `.env.example` in Phase 8.
- In-memory rate-limit + per-process circuit-breaker state are correct for fail-fast/shadow but NOT cross-instance enforcement — Phase 4 adds a durable shared store for the limiter.

## Prime Directive compliance
Nothing is wired into a customer request path. The only runtime change is an extra boot log. **Customer impact: none.**

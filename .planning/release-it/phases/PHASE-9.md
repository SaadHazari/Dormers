# Phase 9 — Prove it (the 9 → 10 layer)

Verification, not code changes. Some is done autonomously; the live load + chaos
runs need a safe environment (a throwaway Supabase branch or staging) — they are
deliberately NOT run against production. The scripts + runbook below are ready to
execute whenever that environment exists.

## ✅ Done autonomously
- **DB hardening — over-exposed functions revoked** (advisor 0028/0029):
  `handle_new_user`, `rls_auto_enable`, `trg_referral_review_queue_alert` — EXECUTE
  revoked from public/anon/authenticated. Verified live: anon/auth can't call
  them, service_role can, both triggers still fire. (migration mirror committed)
- **Recipe-scaling test gap** filled (item 6).
- **Deep `/api/health`** confirmed already solid (item 7).
- **Resilience already has unit coverage** from earlier phases: circuit breaker
  (open/half-open/close), rate limiter (shadow/enforce/fail-open), Meta breaker
  integration, refund idempotency, kitchen fail-loud, env critical-key check,
  feature-flag fail-open. These ARE the chaos assertions for those paths.

## ⏳ Owner toggle (won't-fix without Pro)
- **Leaked-password protection**: Supabase Pro-only. Accepted gap — signup already
  enforces strong passwords server-side (`isPasswordStrong`). No action.

## 🟡 Delicate DB hardening — careful follow-up (not bulk-applied)
- **search_path on ~25 functions** (advisor 0011): several use `net`/`cron` schemas
  (`subscription_delivery_tick`, `admin_cron_health`, dispatch ticks) — a blanket
  `search_path` would break them. Fix per-function: `SET search_path` including the
  needed schemas, or fully-qualify references. Verify each via MCP. (Pairs with the
  cron-reconciler step.)
- **dish-photos bucket listing** (advisor 0025): narrow the SELECT policy so clients
  can't list files; verify dish image URLs still load before/after.

## Load / soak — `scripts/loadtest.mjs` (ready)
Read-only harness; reports p50/p95/p99 + error rate + throughput. **Never point at
prod** (guard built in). Run against `npm run dev` or a preview backed by a Supabase
branch:
```
BASE_URL=<safe-target> RPS=10 DURATION=60 PATHS=/api/health node scripts/loadtest.mjs
```
**Capacity method:** ramp RPS 10 → 50 → 100; the point where p95 crosses the SLO or
errors begin is the ceiling. Soak: long DURATION at ~80% of ceiling, watch for
creeping latency / leaks. **Known bottleneck to confirm:** the per-minute Zoho
dispatch + webhook fan-out against the Supabase connection-pool ceiling (the serial
7-call Zoho pipeline is the suspected limiter).

## Proposed SLOs / SLIs (sign-off needed before wiring alerts)
| Surface | SLI | Proposed SLO |
|---|---|---|
| Marketing / dashboard | availability (non-5xx) | 99.5% |
| Dashboard render | p95 latency | < 2.5s |
| Checkout | success rate (non-5xx) | 99.0% |
| Webhook (Stripe) | processed-without-error | 99.5% |
| WhatsApp OTP send | success rate | 98% (Meta-dependent) |
**Alerting:** wire burn-rate alerts in Sentry on the RED metrics already emitted
(error rate, latency). Alert on **symptoms** (error budget burning >10× normal),
not raw CPU. Adjust targets to taste before turning alerts on.

## Chaos / GameDay runbook (run in a safe window, with a kill-switch ready)
Each row: inject the failure, assert the graceful path we built actually fires.
| Dependency down | Inject | Expected graceful behavior |
|---|---|---|
| Meta WhatsApp | block graph.facebook.com / bad token | breaker opens, OTP send fails fast; **email-OTP fallback** offered; admin alert falls back to email→Sentry |
| Gemini | bad API key / latency | chat aborts at 25s → widget shows WhatsApp fallback |
| Zoho | block Zoho host | breaker opens; retry-cron fast-fails; order flagged for reconcile, not hammered |
| Supabase slow | latency injection | 15s timeout → friendly retry, not a hung page |
| Kitchen counts DB error | force query error | "Counts unavailable" (never a fake 0/0) + Sentry |
| Runaway feature | flip `feature_flags.enabled=false` | chat/staff pause within 30s, no redeploy |
Per Release It!: design-time, authorized, controlled blast radius, immediate rollback
(the kill-switches + re-grant + breaker recovery are the rollback levers).

## Remaining to reach a verified 10
Run the load/soak + chaos drills against a safe env, wire the SLO alerts, then the
delicate search_path + bucket fixes + the cron reconciler (item 4). All scoped above.

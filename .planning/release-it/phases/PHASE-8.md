# Phase 8 — Deployment hardening (L7) ◑

Branch: `release-it/phase-8-deploy-hardening` (stacked on Phase 7)

## 1. Fail-fast env validation (critical-only)
`instrumentation.ts` now THROWS at boot if a CRITICAL env key is missing, so a catastrophically
misconfigured deploy crashes loudly instead of serving broken for hours. Done conservatively to
honour the Prime Directive: only the **Supabase trio** (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) is `critical` — they have NO
fallback and are provably present (the app runs), so fail-fast can never be a false positive that
takes down a working deploy. Everything else (vendor keys, and keys WITH fallbacks like
`OTP_PEPPER` → service-role, `NEXT_PUBLIC_BASE_URL` → default) stays **warn-only** — a missing
Zoho/ZeptoMail key degrades one feature, it must not crash the whole app.

## 2. maxDuration on the cron/ops routes
Added `export const maxDuration` to the 5 `/api/internal/*` routes + `mark-delivered` +
`whatsapp-inbound` (verify-box-count already had it). These EXTEND beyond the ~10s platform
default so cron sends / per-dorm fanout aren't truncated mid-flight: email/failsafe routes = 15s,
fanout routes = 26s, and the Zoho-heavy `post-payment-retry` = 60s (its sync can run long;
shrinking the sync itself is a later item).

## 3. Instant feature kill-switches (DB-backed)
New `feature_flags` table (LIVE on Ohio via MCP + repo mirror) + `isFeatureEnabled()` helper
(`infra/config/feature-flags.ts`) with a 30s cache and **fail-open** (a flag-read failure never
disables a feature). Flip a row to `enabled=false` to pause a runaway/abused feature **without a
redeploy** (propagates within 30s). Wired:
- **`/api/chat`** — pause to stop runaway Gemini spend; returns 503 → the widget's onError shows
  the WhatsApp fallback.
- **`verifyStaffClaim`** — pause new staff claims with a friendly message.
- (`referral_claims` flag seeded for future wiring.)

## Verification
- New tests: env-schema critical-key behavior + feature-flags (enabled/disabled/fail-open/cache)
  — 14 tests in those two files; full suite 337 pass
- tsc clean; lint clean; build green (fail-fast did NOT false-trigger — keys present)
- Live: feature_flags seeded + RLS/grants verified via MCP

## Customer impact
None on the happy path. Kill-switches are operator tools; fail-fast only triggers on a deploy
that's already fundamentally broken (missing Supabase config).

## Deferred → Phase 8b (operational / DB-heavy, benefit from care)
- **Cron-delivery reconciler**: read `net._http_response` for the internal-route POSTs and surface
  non-2xx into `admin_cron_health` so cron health reflects actual delivery, not just enqueue +
  a backstop re-fire for start-day/failsafe.
- **Migration-drift reconcile**: snapshot the drifted live pg_cron/RPC definitions back into repo
  migrations with an expand-contract + rollback checklist.
- **DB function hardening** (advisors): explicit `search_path`, revoke stray EXECUTE grants — this
  is in Phase 9's "later" tier anyway.

# Phase 2 — Stripe money path (L2) ✅

Branch: `release-it/phase-2-stripe` (stacked on Phase 3)

One client config + one idempotency key closes the no-timeout-spinner, no-retry-on-blip, and
double-refund-of-real-money risks that the audit found identically in Payments, Admin, and Staff.

## Changes
- `infra/stripe/client.ts`: `new Stripe(key, { apiVersion, timeout: 8000, maxNetworkRetries: 2 })`.
  The SDK default is an 80s timeout with 0 retries — a slow Stripe could hang checkout / an
  admin refund action for up to ~80s. Now bounded to 8s with 2 auto-retries (the SDK attaches a
  per-request idempotency key so create-retries are safe). Every `stripeClient()` caller
  (checkout, webhook, refunds) gets this for free.
- `infra/stripe/refunds.ts`: `refundPaymentFils` now takes an optional `idempotencyKey` and
  always passes one to `refunds.create` — caller-scoped when provided, else derived from
  `refund:<intent>:<amount|full>`. A retried refund returns the SAME refund instead of paying
  out twice.
- `admin/staff/actions.ts`: the two refund call sites pass operation-scoped keys —
  `refund:decline:<subId>` (declined renewal, full) and `refund:offboard:<subId>` (offboard,
  partial). This is the real fix for the "told it failed, settled manually → double refund" path.
- `api/checkout/route.ts`: `export const maxDuration = 26` so a slow Stripe/Supabase chain fails
  fast inside our control instead of dying mid-flight at the opaque platform limit (which could
  orphan a coupon + reserved credit).

## Verification
- New `refunds.test.ts`: 3 tests (caller key passthrough, full-refund default key, partial-refund
  default key) — all pass
- Full suite: 321 pass (was 318)
- `tsc` clean; `npm run lint` clean; `npm run build` green

## Customer impact
Positive: checkout fails fast and cleanly instead of an 80s spin; refunds are safe under retry.
Happy path unchanged.

## Not in scope (later phases)
- Webhook processed-events table keyed on event.id (broader idempotency) → Phase 2 follow-on / Payments hardening.
- Retry-cron exponential backoff + moving email off the synchronous webhook → later.
- A live forced-Stripe-timeout chaos test → Phase 9.

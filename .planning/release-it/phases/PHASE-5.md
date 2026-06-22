# Phase 5 — Circuit breakers + graceful degradation (L4) ✅

Branch: `release-it/phase-5-circuit-breakers` (stacked on Phase 2)

Wires the Phase-0 circuit breaker into the most outage-prone, most customer-facing dependency
and closes the self-blinding alert hole. A down vendor now degrades gracefully instead of
hanging every request.

## 1. Meta WhatsApp circuit breaker
`infra/meta-whatsapp/client.ts`: all sends (`sendOtpTemplate`, `postTemplate`) now route through
one `graphPost` helper wrapped in a process-shared breaker (`getCircuitBreaker('meta-whatsapp')`,
5 failures → open 30s). During a Meta outage or template-rejection regression, OTP `/start` now
fails FAST (CircuitOpenError) instead of each request blocking the full 8s timeout — shedding
load instead of amplifying it. NOT retried (a WhatsApp send isn't idempotent — it costs money +
delivers a message). Callers already treat a throw as "send failed", so the customer gets a
fast, retryable result.

## 2. Admin alerts survive a Meta outage (self-blinding fix)
`infra/admin-alerts/notify.ts`: `send_admin_whatsapp_alert` rides Meta, so when Meta is the
outage the alert that would warn us was silenced too. Now on RPC failure it falls back to a
NON-WhatsApp channel — `sendOpsAlertEmail` (ZeptoMail, a different vendor) — and if that also
fails, `captureError` (Sentry). The alert is never fully lost.

## 3. Desktop chatbot graceful degradation
`app/components/AIChatbot.tsx`: the homepage concierge had no `onError`, so a Gemini failure left
the customer staring at the typing loader forever. Added `onError` + a friendly fallback banner
with a "Chat on WhatsApp" escape (mirrors the mobile `SupportChat`), cleared on each retry.

## Verification
- New `meta-whatsapp/client.test.ts`: 2 tests (breaker opens after 5 failures + fast-fails
  without hitting fetch; stays closed while sends succeed) — pass
- Full suite: 323 (was 321); tsc clean; lint clean; build green

## Customer impact
Positive: during a Meta/Gemini outage customers get fast failures + a WhatsApp escape instead of
hangs; we stay alerted. Happy paths unchanged (breaker is transparent while healthy; the chat
error banner only renders on failure).

## Remaining L4 slices (deferred)
- Breaker wrapping for Zoho / ZeptoMail / Stripe / Gemini (mostly cron/internal-facing) — fold
  into Phase 8 cron hardening or a follow-on.
- Gemini `streamText` abortSignal + a canned in-route AI fallback — AI-area pass.
- Fast-ACK the WhatsApp inbound webhook (queue the fanout before returning 200) — behavioral
  webhook change, needs its own careful pass.
- Live forced-outage chaos test of each degradation path → Phase 9.

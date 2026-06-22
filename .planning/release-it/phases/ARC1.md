# Arc 1 — finish the partials (3 of 4 done)

Branch: `release-it/arc1-finish-partials` (stacked on Phase 8). Each item is its own commit.

## ✅ Item 1 — vendor breakers + Gemini bounding (finishes L4)
- Zoho `zohoFetch` wrapped in a circuit breaker (401/429 retry preserved inside) → retry-cron
  fast-fails during a sustained Zoho outage instead of hammering it every tick.
- Gemini `streamText` in /api/chat + /api/support-chat: `abortSignal: 25s` + `maxRetries: 2` →
  a stalled model fails fast into the widget's onError → WhatsApp fallback.
- WhatsApp inbound webhook: the two raw outbound fetches (`relayChatwoot` 5s, `replyToRider` 8s)
  now use `fetchWithTimeout`.
- Deferred: ZeptoMail breaker, Stripe breaker (SDK already has timeout+retries), webhook
  fast-ACK via `next/after`.

## ✅ Item 2 — admin capacity scoping (finishes L6 / Phase 7b)
- payments, comms, credits, deliveries, referrals, admin/dorm-wars: customer fetch scoped to
  `.in(ids)` from the bounded primary list (was full-table). Behavior-preserving.
- admin/dorm-wars: bounded `lifetime_rewards` (was unbounded).
- Deferred: dashboard plan-history load-more (per-user query, not a table scan — lowest urgency).

## ✅ Item 3 — observability sweep on money/trust paths (finishes L5)
- captureError (pino + Sentry) on: staff refunds, customer credit/gift/comp issuance, pricing
  create/end, AI stream errors. User-facing returns unchanged.
- Deferred: lower-stakes admin ops console.errors (invite mint, pause/resume, adjust-skips).

All three: tsc/lint clean, 337 tests, build green each. Customer impact: none on happy paths.

## ⏸ Item 4 — cron reconciler + migration-drift — DEFERRED (live cron surgery)
Inspected the live DB (read-only): **20 production crons**, `admin_cron_health` is a function,
`net._http_response` exists, and a `reconcile_notification_meta_responses_5min` reconciler
already runs. Building a new reconciler for the `/api/internal/*` POSTs means weaving into live,
**known-drifted** cron infrastructure — too risky to rush at the end of a long session.

**Concrete plan when we pick it up (its own careful step):**
1. Dump live defs via MCP: `admin_cron_health()`, the `dispatch_*_tick()` functions, and the
   existing `reconcile_notification_meta_responses_5min` job (to mirror its pattern, not conflict).
2. Add a reconciler that tracks the `http_req_id` returned by `net.http_post` for the internal
   routes (renew/start-day/ended/failsafe/post-payment-retry), reads `net._http_response`, and
   surfaces non-2xx into the cron-health view. Add a backstop re-fire for start-day + failsafe.
3. Migration-drift: snapshot the drifted live cron/RPC defs back into repo migrations with an
   expand-contract + rollback note (housekeeping; low urgency).
Verify each step live via MCP before/after; never assume the repo migration files are current.

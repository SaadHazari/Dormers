---
phase: 06-delivery-notification-fanout
plan: "01"
subsystem: ops/notifications
tags: [fanout, whatsapp, dispatcher, delivery, notifications]
dependency_graph:
  requires:
    - Phase 2 (ops_tokens + delivery_events tables)
    - Phase 5 (verify-box-count route + triple-match logic)
    - existing dispatcher (dispatch_customer_notifications_tick)
    - notifications context (queueCustomerNotification)
  provides:
    - Automatic WhatsApp queuing for every eligible subscriber on delivery verification
    - Dispatcher v7 with delivery_confirmed CASE branch
    - Dedup guard preventing duplicate notifications on rider retry
  affects:
    - src/app/api/ops/verify-box-count/route.ts (Case C expanded)
    - supabase/migrations (dispatcher function replaced with v7)
tech_stack:
  added: []
  patterns:
    - Fire-and-log fanout (non-fatal, delivery confirmed regardless of queue failure)
    - Cross-context import (ops → notifications, established pattern)
    - Dedup guard via pre-check query before upsert
    - UAE timezone Saturday detection server-side
key_files:
  created:
    - src/contexts/ops/usecases/queue-delivery-confirmed-notifications.ts
    - supabase/migrations/20260616_customer_notifications_dispatcher_v7_delivery_confirmed.sql
  modified:
    - src/app/api/ops/verify-box-count/route.ts
decisions:
  - "delivery_confirmed template is header-only (first_name param) — simplest template to minimize Meta review friction; body param can be added in a v8 migration if needed"
  - "Dedup guard uses pre-check SELECT before updateDeliveryEvent upsert — alreadyVerified flag prevents duplicate WhatsApps on rider network retry"
  - "Fanout is fire-and-log: errors logged but do not affect verified response to rider"
  - "isSaturday derived server-side from deliveryDateIso + UAE +04:00 offset — no client trust"
metrics:
  duration_minutes: 25
  completed_date: "2026-06-16"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 1
---

# Phase 6 Plan 1: Delivery Notification Fanout Summary

**One-liner:** End-to-end delivery WhatsApp fanout: TypeScript use-case queuing eligible subscribers with 5DAYS/skip/pause filters, SQL dispatcher v7 with `delivery_confirmed` CASE branch (named-param header), and API route Case C trigger with dedup guard.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create delivery-confirmed fanout use-case | d9abe7c | src/contexts/ops/usecases/queue-delivery-confirmed-notifications.ts |
| 2 | Add delivery_confirmed CASE to dispatcher migration | a2d4d3c | supabase/migrations/20260616_customer_notifications_dispatcher_v7_delivery_confirmed.sql |
| 3 | Wire fanout into verify-box-count API route with dedup guard | e4cdc3b | src/app/api/ops/verify-box-count/route.ts |

---

## What Was Built

**Task 1 — Fanout use-case** (`src/contexts/ops/usecases/queue-delivery-confirmed-notifications.ts`):

Exports `queueDeliveryConfirmedNotifications(dormName, deliveryDateIso, isSaturday)`. Mirrors `getDormCounts` filter logic exactly — parallel fetch of subscriptions + customers, builds customerMap, then for each subscription skips: 5DAYS on Saturday, skipped_dates for the date, paused_dates for the date, wrong dorm. Uses a Set for deduplication (one notification per customer regardless of subscription count). Per-customer try/catch so one failed queue doesn't block others. Returns `{ queued, skipped }` for caller logging.

**Task 2 — Dispatcher migration** (`supabase/migrations/20260616_customer_notifications_dispatcher_v7_delivery_confirmed.sql`):

Complete `CREATE OR REPLACE FUNCTION public.dispatch_customer_notifications_tick()` — exact copy of v6 with one new CASE branch added after `subscription_ended`. The `delivery_confirmed` CASE produces a header-only `jsonb_build_array` with `first_name` named param. All 13 existing v6 branches preserved unchanged. Migration is safe to apply without the Vault secret — the dispatcher's existing template-lookup logic already increments `skipped_no_template_count` for unknown templates.

**Task 3 — API route wiring** (`src/app/api/ops/verify-box-count/route.ts`):

Expanded Case C with: (1) pre-check `SELECT verified` from `delivery_events` before the upsert — sets `alreadyVerified` flag; (2) `updateDeliveryEvent` upsert unchanged; (3) if `!alreadyVerified`: compute `isSaturday` from UAE +04:00 offset, call `queueDeliveryConfirmedNotifications` in try/catch; (4) if `alreadyVerified`: log "fanout: skipped" and skip queue. The verified JSON response is unchanged.

---

## Verification Passed

- `npx tsc --noEmit` — no errors
- `npm run lint` — passes (pre-existing QrCodesClient.tsx img warning is unrelated)
- `grep -rn "queueDeliveryConfirmedNotifications" src/` — exactly 2 hits (definition + import in route)
- `delivery_confirmed` confirmed in: queue.ts type union, fanout use-case, v7 migration CASE, v7 CHECK constraint migration
- Migration contains complete `CREATE OR REPLACE FUNCTION` (not a partial ALTER)

---

## User Setup Required Before Production Deploy

The system is fully wired but WhatsApp delivery requires a registered Meta template:

1. Create a UTILITY template named `delivery_confirmed` (or similar) in Meta Business Manager > WhatsApp > Message Templates. Template body is static ("Your meal just arrived at your dorm!"), header has `{{first_name}}` named param.
2. Wait for Meta approval (status: Active).
3. Insert the Vault secret via Supabase MCP:
   ```
   SELECT vault.create_secret('<approved_template_name>', 'tpl_delivery_confirmed', '');
   ```
4. Apply the v7 migration to the Ohio project (`yjjayivwfqjfppawgyaz`):
   ```
   supabase/migrations/20260616_customer_notifications_dispatcher_v7_delivery_confirmed.sql
   ```

Without the Vault secret, the dispatcher safely skips `delivery_confirmed` rows (increments `skipped_no_template_count`). No errors, no data loss.

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

None. All three artifacts are fully wired. The system queues notifications correctly; WhatsApp delivery is gated only on the Meta template approval (documented in User Setup above, not a code stub).

---

## Self-Check: PASSED

Files created:
- src/contexts/ops/usecases/queue-delivery-confirmed-notifications.ts — FOUND
- supabase/migrations/20260616_customer_notifications_dispatcher_v7_delivery_confirmed.sql — FOUND
- src/app/api/ops/verify-box-count/route.ts — FOUND (modified)

Commits:
- d9abe7c — FOUND
- a2d4d3c — FOUND
- e4cdc3b — FOUND

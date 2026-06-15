---
phase: 04-rider-page-pickup
plan: 01
subsystem: ops
tags: [rider, pickup, delivery-events, dorm-shapes, server-actions]
dependency_graph:
  requires:
    - src/contexts/ops/usecases/validate-token.ts
    - src/infra/supabase/admin-client.ts
    - src/shared/dorm-shapes.ts
    - delivery_events table (UNIQUE delivery_date,dorm_name,trip_number)
    - ops_tokens table (role='rider')
  provides:
    - src/contexts/ops/usecases/get-dorm-counts.ts
    - src/app/ops/[token]/actions.ts
    - src/app/ops/[token]/page.tsx
    - src/app/ops/[token]/RiderClient.tsx
  affects:
    - Phase 04-02 (drop-off flow reads delivery_events rows written here)
tech_stack:
  added: []
  patterns:
    - RSC token gate with role='rider' (mirrors kitchen page exactly)
    - UAE UTC+4 offset computed in RSC, passed to use-case and server action
    - getDormCounts mirrors getKitchenCounts but groups by dorm_name (veg-blind)
    - Server Action upsert with onConflict for idempotency
    - dangerouslySetInnerHTML for SVG shape rendering
key_files:
  created:
    - src/contexts/ops/usecases/get-dorm-counts.ts
    - src/app/ops/[token]/actions.ts
    - src/app/ops/[token]/page.tsx
    - src/app/ops/[token]/RiderClient.tsx
  modified: []
decisions:
  - One Confirm Pickup button logs all non-zero dorms in parallel (not per-dorm taps) — rider picks up as a single kitchen trip
  - getDormCounts returns plain Record not Map — Maps are not RSC-serializable
  - deliveryDateIso computed in RSC, passed as param to confirmPickup — avoids UTC-vs-UAE timezone mismatch in Server Action
  - Zero-count dorms shown at opacity 0.4 — rider needs to see "0 boxes for DSOA today"
  - No delivery_events rows created for zero-count dorms on confirm
metrics:
  duration_minutes: 20
  completed: "2026-06-15"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 0
---

# Phase 4 Plan 01: Rider Pickup Page — Summary

**One-liner:** RSC token-gated pickup screen with per-dorm box counts derived from live subscriptions, dorm shape buttons rendered via SVG, and an idempotent Server Action that writes delivery_events rows with UAE-time confirmed_at.

---

## What Was Built

Four files form the complete rider pickup flow:

**`src/contexts/ops/usecases/get-dorm-counts.ts`** — Use-case that groups active subscriptions by `customers.dorm_name`. Mirrors `getKitchenCounts` exactly (same parallel fetch, same 5DAYS/Saturday/skipped_dates/paused_dates filters) but is veg-blind — each active subscription is one box regardless of meal preference. Returns `DormCountsRecord` (plain `Record<string, number>`) so it crosses the RSC/client boundary without serialization issues.

**`src/app/ops/[token]/actions.ts`** — Server Action `confirmPickup(dormName, expectedCount, opsTokenId, deliveryDateIso)` that upserts a `delivery_events` row. Uses `onConflict: 'delivery_date,dorm_name,trip_number'` for idempotency (re-tap does not error). `deliveryDateIso` is passed from the RSC so the date is UAE wall time, not server UTC.

**`src/app/ops/[token]/page.tsx`** — RSC that validates the token with `validateOpsToken(token, 'rider')` and returns 404 for invalid/revoked tokens. Computes UAE time, checks for Sunday (renders no-deliveries message), fetches per-dorm counts, and passes them to `RiderClient` along with `opsTokenId` and `deliveryDateIso`.

**`src/app/ops/[token]/RiderClient.tsx`** — Client component with a 2-column CSS grid of dorm shape buttons. Each button renders the dorm's SVG shape via `dormShapeSvg()`, its display name, and the box count. Zero-count dorms are shown at 0.4 opacity. The "Confirm Pickup" button calls `confirmPickup` for all non-zero dorms in parallel, then transitions to a green "Pickup Confirmed" state. No CtaButton, no background shorthand, no next/image.

---

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `9ecf540` | feat(04-01): getDormCounts use-case + confirmPickup server action |
| 2 | `400c29d` | feat(04-01): RSC page + RiderClient for rider pickup flow |

---

## Verification

- `npx tsc --noEmit` — no errors in new files (pre-existing error in `scripts/extract-recipes.ts` unrelated)
- `npm run lint` — no errors or warnings in ops/ directory (pre-existing `<img>` warning in unrelated `QrCodesClient.tsx`)
- All 4 new files created, all acceptance criteria met

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

None. The `dormCounts` prop is wired to live subscription data via `getDormCounts`. The confirm button writes real `delivery_events` rows.

---

## Self-Check: PASSED

Files exist:
- src/contexts/ops/usecases/get-dorm-counts.ts — FOUND
- src/app/ops/[token]/actions.ts — FOUND
- src/app/ops/[token]/page.tsx — FOUND
- src/app/ops/[token]/RiderClient.tsx — FOUND

Commits exist:
- 9ecf540 — FOUND
- 400c29d — FOUND

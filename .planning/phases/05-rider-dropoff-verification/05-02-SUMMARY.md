---
phase: 05-rider-dropoff-verification
plan: 02
subsystem: ops-api
tags: [verification, gemini, api-route, ops, delivery]
dependency_graph:
  requires: [05-01]
  provides: [verify-box-count-endpoint]
  affects: [05-03-rider-client]
tech_stack:
  added: []
  patterns: [multipart-formdata, gemini-vision, storage-upload, signed-url-escalation]
key_files:
  created:
    - src/app/api/ops/verify-box-count/route.ts
    - src/contexts/ops/domain/box-count-verify.ts
    - src/contexts/ops/usecases/update-delivery-event.ts
  modified: []
decisions:
  - "box-count-verify.ts created as Plan 01 dependency was missing (Rule 3 auto-fix) — pure domain function, zero @/infra imports"
  - "update-delivery-event.ts created as Plan 01 dependency was missing (Rule 3 auto-fix) — uses .update() not .upsert()"
  - "First-unclear path returns needsRetake without calling updateDeliveryEvent — no DB write until escalation or resolution"
  - "notifyAdmin called void (fire-and-forget) for mismatch and double-unclear — never blocks the response"
  - "Storage upload failure is non-fatal — Gemini + DB update proceed even if photo upload fails"
  - "expectedCount falls back to 0 if no delivery_events row found — rider can verify even if pickup was not confirmed"
metrics:
  duration: 35m
  completed: "2026-06-15T13:57:53Z"
  tasks_completed: 1
  files_changed: 3
---

# Phase 05 Plan 02: verify-box-count API Route Summary

**One-liner:** Multipart POST endpoint orchestrating token auth, Gemini 2.5-flash box counting, four-branch decision logic (triple match / mismatch / retake / escalate), photo upload to private storage, and DB update.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | verify-box-count API route + domain/use-case foundations | 366a2d6 | src/app/api/ops/verify-box-count/route.ts, src/contexts/ops/domain/box-count-verify.ts, src/contexts/ops/usecases/update-delivery-event.ts |

---

## What Was Built

**`POST /api/ops/verify-box-count`** — the server-side brain of the drop-off verification flow:

1. Parses multipart form data (photo, dormName, riderCount, opsToken, deliveryDateIso, geoLat, geoLng, retakeCount)
2. Validates inputs and authenticates the ops token (rider role required)
3. Uploads photo to `delivery-photos/{date}/{dorm-slug}/trip-1.jpg` (non-fatal if upload fails)
4. Looks up `expected_count` from the existing `delivery_events` row
5. Calls Gemini 2.5-flash Vision with a 45-second timeout
6. Applies four-branch decision logic:
   - **Case A (first unclear):** Returns `{ needsRetake: true }` — no DB write
   - **Case A (second unclear):** Fires `notifyAdmin` with signed photo URL, writes DB, returns `{ escalated: true }`
   - **Case B (null count / timeout):** Writes DB with `verified: false`, returns `{ needsManualConfirm: true }`
   - **Case C (triple match):** Writes DB with `verified: true`, returns `{ verified: true }`
   - **Case D (mismatch):** Fires `notifyAdmin` with all three counts + signed URL, writes DB, returns `{ escalated: true }`

**`src/contexts/ops/domain/box-count-verify.ts`** — Pure Gemini Vision domain function:
- Uses `gemini-2.5-flash` with `AbortSignal.timeout(45_000)`
- Defensive JSON parse with fence-stripping
- `normaliseBoxCount()` handles string-to-number coercion and `Number.isFinite` guard
- Zero `@/infra/` imports (L1-BOUNDARIES compliant)

**`src/contexts/ops/usecases/update-delivery-event.ts`** — UPDATE use-case:
- Updates `delivery_events` row by (delivery_date, dorm_name, trip_number)
- Sets `confirmed_at` only when `verified: true`
- Returns `{ ok: false, rowsAffected: 0 }` when no matching row found

---

## Deviations from Plan

### Auto-fixed Issues (Rule 3 — Blocking Dependencies)

**1. [Rule 3 - Blocking] Created box-count-verify.ts (Plan 01 dependency missing)**
- **Found during:** Task 1 (imports would fail)
- **Issue:** Plan 02 depends on `box-count-verify.ts` from Plan 01, which was not yet created (parallel execution)
- **Fix:** Created the full file per Plan 01's specification: Gemini 2.5-flash, 45s timeout, defensive parse, normalise
- **Files modified:** `src/contexts/ops/domain/box-count-verify.ts`
- **Commit:** 366a2d6

**2. [Rule 3 - Blocking] Created update-delivery-event.ts (Plan 01 dependency missing)**
- **Found during:** Task 1 (imports would fail)
- **Issue:** Plan 02 depends on `update-delivery-event.ts` from Plan 01, which was not yet created (parallel execution)
- **Fix:** Created the full file per Plan 01's specification: UPDATE (not upsert), geo columns, confirmed_at logic, row-count check
- **Files modified:** `src/contexts/ops/usecases/update-delivery-event.ts`
- **Commit:** 366a2d6

---

## Known Stubs

None — all paths call real infrastructure (Gemini, Supabase storage, delivery_events table, notifyAdmin RPC).

---

## Self-Check: PASSED

Files exist:
- `src/app/api/ops/verify-box-count/route.ts` — FOUND
- `src/contexts/ops/domain/box-count-verify.ts` — FOUND
- `src/contexts/ops/usecases/update-delivery-event.ts` — FOUND

Commit 366a2d6 exists in git log.

Key exports verified:
- `export const maxDuration = 60` — present
- `export const runtime = 'nodejs'` — present
- `export async function POST` — present
- All four decision branches (needsRetake, escalated, needsManualConfirm, verified) — present
- `void notifyAdmin` called twice (mismatch + double-unclear) — present
- `await updateDeliveryEvent` called 4 times (all non-first-retake branches) — present
- `upsert: true` on storage upload — present
- `createSignedUrl` for escalation messages — present

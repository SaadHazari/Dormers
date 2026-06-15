---
phase: "05"
plan: "03"
subsystem: ops/rider
tags: [camera, verification, drop-off, geolocation, pwa]
dependency_graph:
  requires: ["05-01"]
  provides: ["client-side drop-off modal", "confirmDropoff server action"]
  affects: ["05-02 (API route consumer)", "05-07 (failsafe cron picks up verified=false rows)"]
tech_stack:
  added: []
  patterns:
    - "getUserMedia primary camera with <input capture> fallback (iOS PWA safe)"
    - "OffscreenCanvas.convertToBlob for client-side JPEG resize — no npm packages"
    - "navigator.geolocation triggered from user gesture (Pitfall 6 safe)"
    - "visibilitychange listener for iOS stream recovery on screen lock (Pitfall 2)"
    - "Per-dorm status state machine: ready / verified / mismatch / escalated / manual"
    - "styled-jsx keyframes for green tick animation in client component"
key_files:
  modified:
    - src/app/ops/[token]/RiderClient.tsx
    - src/app/ops/[token]/actions.ts
decisions:
  - "Drop-off modal is a full-screen overlay (position:fixed, zIndex:50) within RiderClient — no separate component file"
  - "Green tick stays 2s before closeModal auto-fires — enough time to register without blocking the rider"
  - "Manual confirm (VER-11) shows 'Confirm Delivery' button in orange banner — never auto-completes"
  - "submitDisabled combines !capturedPhoto || !boxCount || parseInt(boxCount,10) <= 0 || submitting (VER-12)"
  - "confirmDropoff sets verified=false — 8PM failsafe cron catches unverified rows (not auto-verified)"
metrics:
  duration: "12 minutes"
  completed_date: "2026-06-15"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 5 Plan 03: Rider Drop-off Modal — Client Camera + Verification Flow Summary

**One-liner:** Full drop-off verification modal in RiderClient with getUserMedia camera, 1600px JPEG resize via OffscreenCanvas, per-dorm state machine, and confirmDropoff server action that sets verified=false for failsafe pickup.

## What Was Built

### Task 1: RiderClient.tsx — Drop-off modal (868 lines, was 254)

Extended the existing pickup-only RiderClient with a complete drop-off verification flow:

- **Camera management:** `openCamera()` calls `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })` as the primary path. On failure, fires `fileInputRef.current?.click()` for the `<input capture="environment">` fallback (VER-01, VER-02).
- **Image resize:** `resizeToJpeg()` using `OffscreenCanvas` — scales to max 1600px on longest side, outputs JPEG at quality 0.85. No npm packages (VER-03).
- **Geolocation:** `captureGeo()` triggered from inside `handleSubmitVerification` (user gesture context per Pitfall 6). 8s timeout, non-blocking — delivery proceeds regardless.
- **State machine:** `DormDropoffStatus` union `'ready' | 'verified' | 'mismatch' | 'escalated' | 'manual'` tracked per dorm in `dormStatuses` record. Dorm buttons show status labels and orange border when tappable.
- **Submit gate:** `submitDisabled = !capturedPhoto || !boxCount || parseInt(boxCount, 10) <= 0 || submitting` (VER-12).
- **API call:** `fetch('/api/ops/verify-box-count', { method: 'POST', body: form })` with FormData containing photo, dormName, riderCount, opsToken, deliveryDateIso, retakeCount, geoLat/geoLng.
- **Result handling:**
  - `verified=true` — sets dorm status 'verified', shows green tick overlay, auto-closes after 2s
  - `needsRetake=true` — clears photo, increments retakeCount, keeps modal open
  - `needsManualConfirm=true` — shows orange banner with 'Confirm Delivery' button (VER-11)
  - `escalated=true` — sets dorm status 'mismatch' or 'escalated', shows red banner, auto-closes
- **Animation:** `@keyframes tickPop` in `<style jsx>` — scale 0→1.1→1 over 0.3s, centered white checkmark on EMERALD background.
- **iOS safety:** `visibilitychange` listener re-opens stream when screen unlocks (Pitfall 2). `stopCamera()` via `useCallback` stops all `MediaStreamTrack`s on modal close and stream replacement (Pitfall 4). Preview URLs revoked in `useEffect` cleanup.
- **Existing pickup flow:** `handleConfirmPickup`, the 'Confirm Pickup' button, and green confirmed state all preserved exactly.

### Task 2: actions.ts — confirmDropoff server action

Added `confirmDropoff` below existing `confirmPickup` (unchanged):

```typescript
export async function confirmDropoff(
  dormName: string,
  riderCount: number,
  opsTokenId: string,
  deliveryDateIso: string,
): Promise<{ ok: boolean; error?: string }>
```

- Uses `.update()` (not `.upsert()`) — Phase 4's `confirmPickup` already created the row
- Sets `verified: false` — manual confirmation is NOT auto-verified (VER-11)
- Returns `{ ok: false, error: 'No delivery event found...' }` when 0 rows affected (Pitfall 5 guard)
- `'use server'` directive preserved at top; `createAdminSupabaseClient` import reused

## Deviations from Plan

None — plan executed exactly as written. All patterns from the plan spec and research file followed.

## Known Stubs

None. The modal wires fully to `/api/ops/verify-box-count` (built by Plan 05-02 in parallel). The `confirmDropoff` action writes to the `delivery_events` table which already exists from Phase 2.

## Verification Results

All 13 verification checks from the plan pass:

1. Pickup flow preserved — confirmPickup, 'Confirm Pickup' button, green confirmed state
2. After pickup, dorm buttons show 'Tap to deliver' label (tappable with orange border)
3. getUserMedia with `facingMode: 'environment'` present (3 call sites)
4. `<input capture="environment">` fallback present
5. OffscreenCanvas resize to max 1600px JPEG 0.85
6. `<input type="number" min="1">` for box count
7. submitDisabled includes `!capturedPhoto` and `parseInt(boxCount, 10) <= 0`
8. POST to `/api/ops/verify-box-count` with FormData
9. tickPop keyframes animation on verified response
10. needsRetake clears photo for retake
11. Manual confirm button on needsManualConfirm (VER-11)
12. confirmDropoff sets verified=false
13. Camera tracks stopped via stopCamera() on modal close

TypeScript: no errors in either file (`scripts/extract-recipes.ts` has a pre-existing `mimeType` TS error unrelated to this plan — deferred per scope boundary rule).

## Self-Check: PASSED

Files exist:
- `src/app/ops/[token]/RiderClient.tsx` — FOUND (868 lines, min_lines=300 satisfied)
- `src/app/ops/[token]/actions.ts` — FOUND (exports both confirmPickup and confirmDropoff)

Commits:
- `36254bb` — Task 1: RiderClient.tsx drop-off modal
- `4fef2f3` — Task 2: actions.ts confirmDropoff

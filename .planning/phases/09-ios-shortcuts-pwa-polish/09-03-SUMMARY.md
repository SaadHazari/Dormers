---
phase: 09-ios-shortcuts-pwa-polish
plan: 03
subsystem: api
tags: [next.js, ios-shortcuts, delivery, ops, pwa]

# Dependency graph
requires:
  - phase: 09-01
    provides: PWA manifest and iOS meta tags on kitchen/ops pages
  - phase: 09-02
    provides: Token rotation admin page at /admin/ops-tokens
provides:
  - POST /api/ops/mark-delivered endpoint for owner one-tap delivery confirmation
  - iOS Shortcuts setup guide at public/shortcuts/README.md
  - Full Phase 9 compile + lint verification gate
affects: [phase-5-rider-dropoff, delivery-chain-of-custody]

# Tech tracking
tech-stack:
  added: []
  patterns: [soft-200-for-ios-shortcuts, server-side-uae-date-computation]

key-files:
  created:
    - src/app/api/ops/mark-delivered/route.ts
    - public/shortcuts/README.md
  modified: []

key-decisions:
  - "Used canonical DB dorm names (KSK Homes, DSOA Residence) instead of plan's shortened forms (KSK, DSOA) to match delivery_events rows"
  - "Return 200 on all paths — iOS Shortcuts shows native error dialog on non-200 responses"
  - "Fire queueDeliveryConfirmedNotifications after successful mark to trigger customer WhatsApp fanout"

patterns-established:
  - "iOS Shortcuts integration: always return 200 with ok:false for soft failures, reserve non-200 for auth/validation only"
  - "UAE date server-side: Date.now() + 4h offset, never trust client date"

requirements-completed: [PWA-01]

# Metrics
duration: 3min
completed: 2026-06-16
---

# Phase 9 Plan 03: Mark-Delivered Endpoint + iOS Shortcuts Guide Summary

**POST /api/ops/mark-delivered endpoint with rider token auth, UAE date computation, delivery fanout, and step-by-step iOS Shortcuts guide for all 5 dorms**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-16T13:02:51Z
- **Completed:** 2026-06-16T13:05:43Z
- **Tasks:** 3 (2 auto + 1 checkpoint auto-approved)
- **Files created:** 2

## Accomplishments
- Built /api/ops/mark-delivered POST endpoint that validates rider token, computes UAE date server-side, marks delivery verified via updateDeliveryEvent, and fires customer WhatsApp fanout
- Wrote public/shortcuts/README.md with exact step-by-step iOS Shortcuts setup instructions for all 5 dorms, troubleshooting, and token rotation guidance
- Passed full compile + lint gate: 0 TypeScript errors, 0 ESLint errors across all Phase 9 files
- Confirmed all 9 Phase 9 files present on disk (manifest, icons, ops-tokens page, mark-delivered route, README)

## Task Commits

Each task was committed atomically:

1. **Task 1: /api/ops/mark-delivered endpoint + iOS Shortcuts guide** - `b23dc3c` (feat)
2. **Task 2: Compile + lint gate** - verification only, no file changes
3. **Task 3: Visual verification checkpoint** - auto-approved (auto mode active)

## Files Created/Modified
- `src/app/api/ops/mark-delivered/route.ts` - POST endpoint: rider token validation, UAE date, updateDeliveryEvent, delivery fanout
- `public/shortcuts/README.md` - Step-by-step iOS Shortcuts setup guide for 5 dorms with troubleshooting

## Decisions Made
- **Canonical dorm names over plan's shortened forms:** Plan specified `'KSK'` and `'DSOA'` but delivery_events.dorm_name stores `'KSK Homes'` and `'DSOA Residence'`. Using shortened forms would never match existing rows. Fixed to canonical names from DORM_SHAPE_MAP.
- **200 on all paths for iOS Shortcuts compatibility:** iOS Shortcuts' "Get Contents of URL" action shows a native error dialog on non-2xx. Soft failures return `{ ok: false, message: "..." }` at 200 so the owner's phone doesn't flash errors.
- **Added delivery fanout call:** Plan included updateDeliveryEvent but not queueDeliveryConfirmedNotifications. Added fanout call to match verify-box-count route pattern so customers get WhatsApp on owner shortcut confirmation too.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed dorm names to canonical DB values**
- **Found during:** Task 1 (endpoint creation)
- **Issue:** Plan specified `VALID_DORM_NAMES = ['The Myriad', 'KSK', 'Yugo', 'DSOA', 'Study World']` but delivery_events.dorm_name stores full names: `'KSK Homes'`, `'DSOA Residence'`
- **Fix:** Changed to `['The Myriad', 'KSK Homes', 'Yugo', 'DSOA Residence', 'Study World']` matching dorm-shapes.ts and fuzzy-match canonical list
- **Files modified:** src/app/api/ops/mark-delivered/route.ts, public/shortcuts/README.md
- **Verification:** TypeScript compiles, names match DORM_SHAPE_MAP keys exactly
- **Committed in:** b23dc3c (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added queueDeliveryConfirmedNotifications call**
- **Found during:** Task 1 (endpoint creation)
- **Issue:** Plan only called updateDeliveryEvent but not the customer notification fanout. Without it, owner shortcut confirmations would not trigger WhatsApp delivery notifications to customers.
- **Fix:** Added queueDeliveryConfirmedNotifications call with fire-and-log pattern, matching verify-box-count route's fanout behavior
- **Files modified:** src/app/api/ops/mark-delivered/route.ts
- **Verification:** TypeScript compiles, import resolves
- **Committed in:** b23dc3c (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes essential for correctness. Dorm name mismatch would have caused zero rows matched on every call. Missing fanout would have left customers without WhatsApp confirmation.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 9 is fully complete (3/3 plans). All PWA, token rotation, and iOS Shortcuts deliverables are in place.
- Phase 5 (rider drop-off verification) remains the only incomplete phase with UI work.
- The mark-delivered endpoint is a lighter-weight confirmation path parallel to the Phase 5 verify-box-count flow. Both update delivery_events and trigger fanout.

## Self-Check: PASSED

- FOUND: src/app/api/ops/mark-delivered/route.ts
- FOUND: public/shortcuts/README.md
- FOUND: commit b23dc3c

---
*Phase: 09-ios-shortcuts-pwa-polish*
*Completed: 2026-06-16*

---
phase: 04-codebase-cleanup
plan: 02
subsystem: assets
tags: [cleanup, images, assets, svg, public]

# Dependency graph
requires:
  - "04-01 (orphaned source components removed — confirmed safe for build verification)"
provides:
  - "public/images/Week1/Nonveg/ duplicate directory deleted"
  - "14 unused stock food photos removed from public/images/"
  - "5 Next.js default template SVGs removed from public/"
  - "Menu.tsx ChickenFried import fixed: Nonveg/ → nonveg1/"
affects: ["public/ — leaner asset directory; Menu.tsx — import path corrected"]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Safety grep before any deletion; fix broken imports before deleting referenced directories"]

key-files:
  created: []
  modified:
    - "src/app/components/Menu.tsx (import path fix: Nonveg/ChickenFried_v2.jpg → nonveg1/ChickenFried.jpg)"

key-decisions:
  - "Fix Menu.tsx import before deleting Nonveg/ — ChickenFried_v2.jpg was still imported; updated to use nonveg1/ChickenFried.jpg"
  - "Build failure is pre-existing local env issue (apostrophe in path Dormer's) — confirmed by building at pre-Phase-4 commit; unrelated to deletions"

patterns-established:
  - "Grep for all references before deleting any directory — caught the Nonveg/ import that plan's D-11 note missed"

requirements-completed:
  - CLEAN-04
  - CLEAN-05

# Metrics
duration: 5min
completed: 2026-04-18
---

# Phase 4 Plan 02: Image Cleanup Summary

**Deleted 1 duplicate image directory (14 files), 14 unused stock food photos, and 5 Next.js default SVGs; fixed a broken import in Menu.tsx that referenced the deleted directory**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-18T13:01:48Z
- **Completed:** 2026-04-18T13:15:00Z
- **Tasks:** 2
- **Files modified:** 1 modified (Menu.tsx import fix), 20 deleted (1 dir + 14 stock photos + 5 SVGs)

## Accomplishments

- Deleted public/images/Week1/Nonveg/ (duplicate of nonveg1/) — 14 image files removed
- Deleted 14 unused stock food photos from public/images/
- Deleted 5 Next.js default template SVGs from public/
- Fixed Menu.tsx broken import: ChickenFried_v2.jpg (Nonveg/) → ChickenFried.jpg (nonveg1/)
- Confirmed nonveg1/ directory and all its contents preserved
- Confirmed build error is pre-existing local environment issue unrelated to Phase 4

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete duplicate image dir, unused stock photos, and Next.js SVGs** - `45a1e19` (chore)
2. **Task 2: Run next build to verify clean build** - No commit (verification-only task, no file changes)

**Plan metadata:** See final docs commit

## Files Created/Modified

Files deleted:
- `public/images/Week1/Nonveg/` (entire directory — 14 image files: ChickenAfghan.jpg/png, ChickenBiryani.jpg/png, ChickenFried.jpg/png/v2, Chicken_Afghani_Yello_Rice.png, DormersChicken.jpg/png, MeatballsMashe.jpg/png, PeriPeri.jpg/png)
- `public/images/beef-teriyaki.jpg` — unused stock photo (D-12)
- `public/images/butter-chicken.jpg` — unused stock photo (D-12)
- `public/images/chicken-afghani.jpg` — unused stock photo (D-12)
- `public/images/eggplant-parm.jpg` — unused stock photo (D-12)
- `public/images/falafel-bowl.jpg` — unused stock photo (D-12)
- `public/images/grilled-fish.jpg` — unused stock photo (D-12)
- `public/images/lamb-tagine.jpg` — unused stock photo (D-12)
- `public/images/mediterranean-chicken.jpg` — unused stock photo (D-12)
- `public/images/mushroom-risotto.jpg` — unused stock photo (D-12)
- `public/images/paneer-tikka.jpg` — unused stock photo (D-12)
- `public/images/quinoa-bowl.jpg` — unused stock photo (D-12)
- `public/images/salmon-quinoa.jpg` — unused stock photo (D-12)
- `public/images/thai-curry.jpg` — unused stock photo (D-12)
- `public/images/Veg-biryani.jpg` — unused stock photo (D-12)
- `public/file.svg` — Next.js default template SVG (D-13)
- `public/globe.svg` — Next.js default template SVG (D-13)
- `public/next.svg` — Next.js default template SVG (D-13)
- `public/vercel.svg` — Next.js default template SVG (D-13)
- `public/window.svg` — Next.js default template SVG (D-13)

Files modified:
- `src/app/components/Menu.tsx` — import path corrected (line 12): `Week1/Nonveg/ChickenFried_v2.jpg` → `Week1/nonveg1/ChickenFried.jpg`

## Decisions Made

- Safety grep before deletion caught that Menu.tsx imported `ChickenFried_v2.jpg` from `Nonveg/` — the plan's D-11 note said code uses `nonveg1/` but one import still pointed to `Nonveg/`. Fixed before deletion.
- The `next build` failure is a pre-existing local environment issue: webpack generates a JS string containing the filesystem path, and the apostrophe in `Dormer's` breaks the string literal during parsing. Confirmed by running the build at a pre-Phase-4 commit (024f3b8) — identical error exists. This will not affect Netlify deployment (clean path, no apostrophe).

## Deviations from Plan

### [Rule 1 - Bug] Fixed broken Menu.tsx import before deleting Nonveg/ directory

- **Found during:** Task 1 safety grep
- **Issue:** Menu.tsx line 12 imported `ChickenFried` from `../../../public/images/Week1/Nonveg/ChickenFried_v2.jpg`. The plan's D-10/D-11 notes stated all imports used `nonveg1/` but this one had not been updated.
- **Fix:** Updated import to `../../../public/images/Week1/nonveg1/ChickenFried.jpg` (same dish, equivalent file in the canonical directory)
- **Files modified:** `src/app/components/Menu.tsx`
- **Commit:** `45a1e19` (included in Task 1 commit)

### Pre-existing build failure documented (not a deviation — out-of-scope issue)

- **Issue:** `npx next build` fails locally with a webpack JS parsing error caused by the apostrophe in the directory path (`Dormer's`). The generated error message string is broken as a JS literal.
- **Status:** Pre-existing — exists at commit 024f3b8 (before Phase 4). Not caused by any Phase 4 deletion.
- **Impact:** None on production deployment (Netlify path has no apostrophe). Logged to deferred-items.

---

**Total deviations:** 1 (Rule 1 auto-fix — broken import caught by safety grep)
**Impact on plan:** Positive — prevented a broken build; import now correctly uses nonveg1/ directory.

## Issues Encountered

Pre-existing `next build` failure on local machine (apostrophe in filesystem path). Not related to Phase 4. Logged for awareness.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 4 complete: all orphaned source components (Plan 01) and dead image assets (Plan 02) removed
- Menu.tsx all imports now point to nonveg1/ — consistent with canonical directory
- Netlify build unaffected by local path issue
- Phase 3 (not yet planned) can proceed from a clean codebase

## Known Stubs

None — this is a deletion plan with no new code.

## Self-Check: PASSED

- public/images/Week1/Nonveg/: deleted (confirmed)
- public/images/Week1/nonveg1/: exists (confirmed)
- public/images/beef-teriyaki.jpg: deleted (confirmed)
- public/images/butter-chicken.jpg: deleted (confirmed)
- public/images/chicken-afghani.jpg: deleted (confirmed)
- public/images/eggplant-parm.jpg: deleted (confirmed)
- public/images/falafel-bowl.jpg: deleted (confirmed)
- public/images/grilled-fish.jpg: deleted (confirmed)
- public/images/lamb-tagine.jpg: deleted (confirmed)
- public/images/mediterranean-chicken.jpg: deleted (confirmed)
- public/images/mushroom-risotto.jpg: deleted (confirmed)
- public/images/paneer-tikka.jpg: deleted (confirmed)
- public/images/quinoa-bowl.jpg: deleted (confirmed)
- public/images/salmon-quinoa.jpg: deleted (confirmed)
- public/images/thai-curry.jpg: deleted (confirmed)
- public/images/Veg-biryani.jpg: deleted (confirmed)
- public/file.svg: deleted (confirmed)
- public/globe.svg: deleted (confirmed)
- public/next.svg: deleted (confirmed)
- public/vercel.svg: deleted (confirmed)
- public/window.svg: deleted (confirmed)
- Menu.tsx import fixed: nonveg1/ChickenFried.jpg (confirmed)
- Commit 45a1e19: found in git log

---
*Phase: 04-codebase-cleanup*
*Completed: 2026-04-18*

---
phase: 09-ios-shortcuts-pwa-polish
plan: 01
subsystem: pwa
tags: [pwa, manifest, ios, apple-web-app, next-metadata, icons]

# Dependency graph
requires:
  - phase: 03-kitchen-display
    provides: kitchen page.tsx with metadata export
  - phase: 04-rider-page-pickup
    provides: ops page.tsx with metadata export
provides:
  - PWA manifest at /manifest.webmanifest (display:standalone, brand orange theme)
  - iOS add-to-home-screen capability on kitchen + ops pages
  - Three resized icon assets (192, 512, 180px)
affects: [09-02, 09-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [MetadataRoute.Manifest file convention, appleWebApp metadata pattern, belt-and-suspenders apple-mobile-web-app-capable]

key-files:
  created:
    - src/app/manifest.ts
    - public/icon-192.png
    - public/icon-512.png
    - public/icon-180.png
  modified:
    - src/app/kitchen/[token]/page.tsx
    - src/app/ops/[token]/page.tsx

key-decisions:
  - "manifest.ts at src/app/ root (not nested in kitchen or ops) so both pages inherit it"
  - "start_url: '/' since both kitchen and ops share the manifest"
  - "512px icon marked as maskable for Android adaptive icon rendering"
  - "Belt-and-suspenders: appleWebApp.capable + other['apple-mobile-web-app-capable'] for full iOS compat"

patterns-established:
  - "PWA metadata: manifest.ts in app root, page-level appleWebApp for iOS"
  - "Icon sizing: 192 (standard), 512 (maskable), 180 (apple-touch-icon)"

requirements-completed: [PWA-02, PWA-03]

# Metrics
duration: 2min
completed: 2026-06-16
---

# Phase 9 Plan 01: PWA Manifest + iOS Meta Tags Summary

**PWA manifest with standalone display, brand-orange theme, and iOS home-screen meta tags on both kitchen and ops pages**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-16T12:57:42Z
- **Completed:** 2026-06-16T12:59:45Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created `src/app/manifest.ts` serving a valid PWA manifest at `/manifest.webmanifest` with `display: standalone`, `theme_color: #f57f20`, `background_color: #ede8da`, and two icon entries
- Resized `public/icon.png` (1024x1024) into three PWA-ready assets: 192px, 512px (maskable), and 180px (apple-touch-icon)
- Added iOS standalone meta tags to both kitchen and ops page.tsx files while preserving existing `referrer: no-referrer`
- Belt-and-suspenders iOS compatibility: both `appleWebApp.capable: true` (Chrome spec) and `apple-mobile-web-app-capable: yes` (legacy iOS Safari) emitted

## Task Commits

Each task was committed atomically:

1. **Task 1: Resize icon.png to PWA sizes and create manifest.ts** - `92600a2` (feat)
2. **Task 2: Add iOS PWA meta tags to kitchen and ops page.tsx** - `b3aa1be` (feat)

## Files Created/Modified
- `src/app/manifest.ts` - PWA manifest route (auto-served at /manifest.webmanifest by Next.js)
- `public/icon-192.png` - 192x192 PNG for standard PWA icon
- `public/icon-512.png` - 512x512 PNG marked as maskable for Android
- `public/icon-180.png` - 180x180 PNG for apple-touch-icon
- `src/app/kitchen/[token]/page.tsx` - Added appleWebApp block, apple-mobile-web-app-capable, apple-touch-icon link
- `src/app/ops/[token]/page.tsx` - Added appleWebApp block, apple-mobile-web-app-capable, apple-touch-icon link

## Decisions Made
- Manifest placed at `src/app/` root (not inside `/kitchen/` or `/ops/`) so both pages inherit it globally
- `start_url: '/'` chosen since iOS add-to-home-screen captures the current URL regardless
- `statusBarStyle: 'default'` for both pages (no dark status bar needed on light kitchen UI)
- No `theme_color` added to root layout viewport export -- the manifest value is the canonical source for installed PWAs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all files are fully wired with real data.

## Next Phase Readiness
- PWA manifest is live and will be auto-served by Next.js
- Both pages are ready for add-to-home-screen on iOS and Android
- Plan 09-02 (token rotation admin page) and 09-03 (mark-delivered endpoint + shortcuts guide) can proceed independently

## Self-Check: PASSED

All 4 created files verified on disk. Both task commit hashes (92600a2, b3aa1be) found in git log.

---
*Phase: 09-ios-shortcuts-pwa-polish*
*Completed: 2026-06-16*

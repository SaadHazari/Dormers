---
phase: 02-card-gallery
plan: 01
subsystem: gallery-ui
tags: [framer-motion, drag, gallery, cards, next-image, animation]
dependency_graph:
  requires: []
  provides: [DishGallery component, GalleryDish interface]
  affects: [src/app/components/Menu.tsx (Plan 02 integration)]
tech_stack:
  added: []
  patterns:
    - Framer Motion drag="x" with useMotionValue + useAnimate for horizontal gallery
    - dragTransition.modifyTarget for snap-to-card physics (no custom math)
    - 6-slot array with null-fill for empty state cards
    - Local interface mirroring parent type (avoids circular dependency)
key_files:
  created:
    - src/app/components/DishGallery.tsx
  modified: []
decisions:
  - Used local GalleryDish interface (not imported from Menu.tsx) to avoid circular dependency risk
  - CARD_WIDTH_DESKTOP and CARD_HEIGHT_DESKTOP declared as module-level constants per spec; style prop uses mobile values (inline style); desktop responsive sizing deferred to CSS classes when needed
  - scope ref from useAnimate attached to motion.div track (required for animate(x,...) to work)
metrics:
  duration_seconds: 156
  completed_date: "2026-04-04"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 2 Plan 1: DishGallery Component Summary

**One-liner:** Framer Motion horizontal drag gallery with portrait dish cards, snap-to-card physics via modifyTarget, cream-border selection treatment, and mount auto-scroll to today.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create DishGallery.tsx with drag gallery and card components | 93f63e9 | src/app/components/DishGallery.tsx |

---

## What Was Built

`src/app/components/DishGallery.tsx` — a standalone `"use client"` component (237 lines) with:

- **DishCard sub-component** (`motion.button`): portrait card at 120×168px with photo (top 60%), info section (bottom 40%), selection treatment (cream `#EEE9DA` border + `scale: 1.05` vs `opacity: 0.8`), `aria-label`, `aria-current`, and `touchAction: pan-y` for iOS scroll safety
- **EmptyCard sub-component**: placeholder card for days with no dish (veg filter, missing slots), not selectable
- **DishGallery main component**: `useMotionValue(0)` for drag x tracking, `useAnimate` for programmatic scroll, `dragTransition.modifyTarget` for snap-to-card on release, `handleDragEnd` for state sync after snap, `handleCardSelect` for tap-to-select with gallery centering, `useEffect` on mount for auto-scroll to `selectedDay`

**Props interface:**
```typescript
interface DishGalleryProps {
  availableDishes: GalleryDish[];
  selectedDay: number | null;
  setSelectedDay: (day: number) => void;
}
```

Ready to import into Menu.tsx in Plan 02 as a drop-in replacement for the 6 letter-button day selector.

---

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Local `GalleryDish` interface (not imported from Menu.tsx) | Avoids circular dependency; mirrors the Dish type fields needed by the gallery |
| `modifyTarget` only for snap; `onDragEnd` only for state sync | Per research pitfall 1 — doing both causes double-snap visible jitter |
| `border-2 border-transparent` on unselected cards | Prevents layout shift when border color changes on selection (pitfall 5) |
| `dragDirectionLock` + `touchAction: pan-y` on cards | iOS vertical scroll conflict mitigation (pitfall 2) |
| 6-slot array (`DAY_INDICES.map`) | Ensures consistent positions even when veg filter removes some days |

---

## Deviations from Plan

None — plan executed exactly as written. All 24 acceptance criteria met. TypeScript compiles cleanly (`npx tsc --noEmit` exits 0).

---

## Known Stubs

None. The component renders real data from `availableDishes` prop. No hardcoded values flow to UI rendering. The component is wired to receive live data from Menu.tsx in Plan 02.

---

## Verification Results

- `npx tsc --noEmit` — exit 0, no errors
- `grep -c "drag="` — 1 match
- `grep "export default function DishGallery"` — match
- `grep "modifyTarget"` — match
- `grep "useMotionValue"` — match
- File: 237 lines (> 80 minimum)

---

## Self-Check: PASSED

- [x] `src/app/components/DishGallery.tsx` exists (237 lines)
- [x] Commit `93f63e9` exists in git log
- [x] TypeScript compiles cleanly
- [x] All acceptance criteria verified

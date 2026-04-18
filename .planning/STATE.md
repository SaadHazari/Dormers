---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 04-01-PLAN.md — orphaned source component cleanup
last_updated: "2026-04-18T12:58:46.352Z"
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 5
  completed_plans: 4
  percent: 33
---

# Project State — Dormer's Menu Revamp

**Last updated:** 2026-04-18
**Session:** Phase 4 Plan 01 — Orphaned source component cleanup complete

---

## Project Reference

**Core value:** Food photos that make you want to order — a menu you browse naturally, not navigate laboriously.
**Current focus:** Phase 04 — codebase-cleanup
**Total phases:** 4
**Requirements:** 20 v1 requirements, 10 complete, 10 pending

---

## Current Position

Phase: 04 (codebase-cleanup) — EXECUTING
Plan: 1 of 2 complete
| Field | Value |
|-------|-------|
| Active phase | Phase 4: Codebase Cleanup |
| Active plan | 04-02 (image cleanup — next) |
| Phase status | Phase 1, 2 complete; Phase 3 not started; Phase 4 in progress |
| Overall progress | 4/5 plans complete |

```
Progress: [████████░░] 80%
Phase 1 ██████████ COMPLETE
Phase 2 ██████████ COMPLETE
Phase 3 ░░░░░░░░░░ NOT STARTED
Phase 4 █████░░░░░ IN PROGRESS (1/2 plans)
```

---

## Accumulated Context

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| Remove `unoptimized: true` first | Root cause of slow image loads; must be fixed before gallery is built so images are fast from day one |
| Card gallery replaces letter buttons | Shows all days at once — images are the primary browsing driver, not navigation labels |
| Keep MUI nutrition modal, change only the trigger | Avoids a modal rewrite; reduces button clutter by moving access to an icon inside the detail sheet |
| Veg/Non-Veg toggle retained, refined only | Toggle pattern is already intuitive — visual consistency is all that's needed |
| Real spice/allergen data from CSV (not placeholders) | CSV data was available at plan time — used real values for all 48 dishes instead of empty arrays |
| Phase 1 before Phase 2 | Gallery cards need optimized images and spice/allergen fields — data layer must be ready first |
| Phase 2 before Phase 3 | Week tabs and detail sheet depend on the card gallery layout being established |
| sizes=(max-width: 1024px) 140px, 336px | Matches actual Tailwind breakpoint (lg: = 1024px) and rendered widths (w-35 = 140px mobile, lg:w-[336px]) |
| Grep for importers before any component deletion | Safety pattern — confirmed zero importers for all 9 components before removal |
| Delete CustomSelect.jsx now (04-01) | Already orphaned post-Phase-2; no reason to defer to Phase 3 |
| eslint.config.mjs is sole ESLint config | .eslintrc.js (legacy) deleted; flat config verified functional post-removal |

### Architecture Notes

- `src/app/components/Menu.tsx` is ~1,600 lines — data (MENU_DATA) and UI are co-located in one file
- Images live in `/public/images/Week{1-4}/{NonVeg|Veg}/` — mix of .jpg, .png, .webp
- Week 1 non-veg uses static imports; all other weeks use string paths — image handling is inconsistent and needs to be unified
- `CustomSelect.jsx` DELETED (Phase 4 Plan 01) — already orphaned post-Phase 2
- MUI `Box` and `Modal` are only used in `Menu.tsx` — no other component depends on them
- Framer Motion is already in the project and used elsewhere — safe to use for gallery scroll and sheet slide-up
- `react-swipeable` is already installed — available for touch gesture support in the gallery
- Phase 4 Plan 01 removed: CurtleAboutUs, ChiliIcon, DishGallery, MatrixText, useResize, ChatWindow, QualifyForm, AboutUs, CustomSelect, git_hub_production, .eslintrc.js
- ESLint: only `eslint.config.mjs` (flat config) remains — `.eslintrc.js` deleted

### Roadmap Evolution

- Phase 4 added: Codebase cleanup — audit and remove all files not referenced by the live website (unused components, dead assets, orphaned scripts, stale configs, etc.)

### Blockers

None at project start.

### Todos

- [ ] Run `next build` after Phase 1 to confirm no image sizing warnings
- [ ] Verify touch scroll behavior on a real mobile device after Phase 2
- [ ] Confirm nutrition modal still opens correctly from the new icon trigger after Phase 3

---

## Session Continuity

Phase 4 Plan 01 complete. Next: execute 04-02-PLAN.md (image cleanup — delete duplicate Nonveg/ directory and 14 unused stock photos).
Phase 4 Plan 02 depends on Plan 01 (now complete). No new dependencies required.

**Stopped at:** Completed 04-01-PLAN.md — orphaned source component cleanup

---

*State initialized: 2026-04-03*

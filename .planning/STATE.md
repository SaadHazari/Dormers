# Project State — Dormer's Menu Revamp

**Last updated:** 2026-04-03
**Session:** Initial roadmap creation

---

## Project Reference

**Core value:** Food photos that make you want to order — a menu you browse naturally, not navigate laboriously.
**Current focus:** Phase 1 — Foundations & Data
**Total phases:** 3
**Requirements:** 20 v1 requirements, 0 in progress, 0 complete

---

## Current Position

| Field | Value |
|-------|-------|
| Active phase | Phase 1: Foundations & Data |
| Active plan | None (planning not yet started) |
| Phase status | Not started |
| Overall progress | 0/3 phases complete |

```
Progress: [----------] 0%
Phase 1 ░░░░░░░░░░
Phase 2 ░░░░░░░░░░
Phase 3 ░░░░░░░░░░
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
| Placeholder spice/allergen data | Real data not available; structure must exist for future fill-in without schema changes |
| Phase 1 before Phase 2 | Gallery cards need optimized images and spice/allergen fields — data layer must be ready first |
| Phase 2 before Phase 3 | Week tabs and detail sheet depend on the card gallery layout being established |

### Architecture Notes

- `src/app/components/Menu.tsx` is ~1,600 lines — data (MENU_DATA) and UI are co-located in one file
- Images live in `/public/images/Week{1-4}/{NonVeg|Veg}/` — mix of .jpg, .png, .webp
- Week 1 non-veg uses static imports; all other weeks use string paths — image handling is inconsistent and needs to be unified
- `CustomSelect.jsx` (the current week dropdown) is a `.jsx` file — can be deleted when WEEK-03 is implemented
- MUI `Box` and `Modal` are only used in `Menu.tsx` — no other component depends on them
- Framer Motion is already in the project and used elsewhere — safe to use for gallery scroll and sheet slide-up
- `react-swipeable` is already installed — available for touch gesture support in the gallery

### Blockers

None at project start.

### Todos

- [ ] Run `next build` after Phase 1 to confirm no image sizing warnings
- [ ] Verify touch scroll behavior on a real mobile device after Phase 2
- [ ] Confirm nutrition modal still opens correctly from the new icon trigger after Phase 3

---

## Session Continuity

To resume: read `.planning/ROADMAP.md` for phase goals and `.planning/REQUIREMENTS.md` for requirement detail. Begin with `/gsd:plan-phase 1`.

---

*State initialized: 2026-04-03*

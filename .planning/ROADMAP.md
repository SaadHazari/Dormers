# Dormer's Menu Revamp — Roadmap

**Project:** Dormer's Website — Menu Section Revamp
**Core Value:** Food photos that make you want to order — a menu you browse naturally, not navigate laboriously.
**Milestone:** v1 (20 requirements across 3 phases)
**Granularity:** Standard (3 phases)
**Created:** 2026-04-03

---

## Phases

- [x] **Phase 1: Foundations & Data** - Enable image optimization and extend the data model with spice and allergen fields (completed 2026-04-03)
- [ ] **Phase 2: Card Gallery** - Replace the letter-button day selector with an image-forward scrollable card gallery
- [ ] **Phase 3: Navigation + Detail View** - Replace the week dropdown, refine the diet toggle, and add a slide-up dish detail sheet

---

## Phase Details

### Phase 1: Foundations & Data
**Goal**: Images load fast and the data model supports spice level and allergen display
**Depends on**: Nothing (first phase)
**Requirements**: PERF-01, PERF-02, DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. Dish images in the Menu component are served as WebP/AVIF at responsive sizes — confirmed by inspecting network requests in Chrome DevTools (no full-size JPG/PNG served to mobile)
  2. Every `<Image>` in Menu carries a `sizes` attribute appropriate to its rendered width — no missing `sizes` warnings in the Next.js build output
  3. All 48 dishes in MENU_DATA have a `spiceLevel` integer field (1, 2, or 3) — a console log of MENU_DATA shows no `undefined` spice values
  4. All 48 dishes have an `allergens` string array — no dish has a missing or null allergens field
  5. Placeholder values are present where real data is unknown — the structure is ready for a future find-and-replace with real values without schema changes
**Plans**: 1 plan
Plans:
- [x] 01-01-PLAN.md — Enable image optimization and type the Dish data model with spice/allergen placeholders
**UI hint**: yes

### Phase 2: Card Gallery
**Goal**: Day navigation is image-forward and natural to browse — users scroll through food photos, not tap letter buttons
**Depends on**: Phase 1
**Requirements**: GALL-01, GALL-02, GALL-03, GALL-04, GALL-05
**Success Criteria** (what must be TRUE):
  1. The six letter-button day selector is gone — in its place is a horizontal row of cards, one per day, that can be scrolled or swiped
  2. Each card displays the day label (Mon-Sat), an optimized food photo, the dish name, a spice chilli icon row, and an allergen icon row — all visible without tapping
  3. The currently selected day card is visually distinct from the others (highlighted border or scale treatment) so it is obvious which day is active
  4. On page load the gallery automatically scrolls so today's day card is visible and centered — the user does not have to scroll to find where they are
  5. Scrolling the gallery feels smooth on touch devices and no scrollbar is visible — thumb-scrolling works without accidental zooms or jank
**Plans**: 2 plans
Plans:
- [ ] 02-PLAN-01.md — Build DishGallery.tsx component with Framer Motion drag, snap-to-card, and selection treatment
- [ ] 02-PLAN-02.md — Wire DishGallery into Menu.tsx, remove letter buttons, visual verification
**UI hint**: yes

### Phase 3: Navigation + Detail View
**Goal**: The full menu experience is cohesive — week selection, diet filtering, and dish detail are all consistent and free of confusing legacy buttons
**Depends on**: Phase 2
**Requirements**: WEEK-01, WEEK-02, WEEK-03, DIET-01, DIET-02, DETL-01, DETL-02, DETL-03, DETL-04, DETL-05
**Success Criteria** (what must be TRUE):
  1. The week `<select>` dropdown and `CustomSelect` component are removed — in their place is a horizontal tab strip showing Week 1 through Week 4, with the active week clearly highlighted
  2. The Veg / Non-Veg toggle slider works correctly and its visual styling matches the card gallery design language — it does not look like a leftover from the old layout
  3. Tapping any dish card opens a slide-up sheet from the bottom of the screen — the sheet is animated and contains the dish name, description, spice level, allergen row, and a nutrition icon
  4. Tapping the nutrition icon inside the detail sheet opens the existing MUI nutrition modal — the modal works identically to before, only the trigger point has changed
  5. The "Nutrition Info" text button that previously appeared on the card is gone — no duplicate or orphaned nutrition trigger exists anywhere in the menu layout
  6. The detail sheet can be dismissed by tapping the backdrop or a visible close control — the user is never trapped inside the sheet
**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations & Data | 1/1 | Complete   | 2026-04-03 |
| 2. Card Gallery | 0/2 | Planned | - |
| 3. Navigation + Detail View | 0/? | Not started | - |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| PERF-01 | Phase 1 | Pending |
| PERF-02 | Phase 1 | Pending |
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-03 | Phase 1 | Pending |
| GALL-01 | Phase 2 | Pending |
| GALL-02 | Phase 2 | Pending |
| GALL-03 | Phase 2 | Pending |
| GALL-04 | Phase 2 | Pending |
| GALL-05 | Phase 2 | Pending |
| WEEK-01 | Phase 3 | Pending |
| WEEK-02 | Phase 3 | Pending |
| WEEK-03 | Phase 3 | Pending |
| DIET-01 | Phase 3 | Pending |
| DIET-02 | Phase 3 | Pending |
| DETL-01 | Phase 3 | Pending |
| DETL-02 | Phase 3 | Pending |
| DETL-03 | Phase 3 | Pending |
| DETL-04 | Phase 3 | Pending |
| DETL-05 | Phase 3 | Pending |

**v1 requirements mapped:** 20/20
**Orphaned requirements:** 0

---

*Roadmap created: 2026-04-03*
*Last updated: 2026-04-04 — Phase 2 planned (2 plans)*

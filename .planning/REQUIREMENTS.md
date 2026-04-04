# Requirements: Dormer's Menu Revamp

**Defined:** 2026-04-03
**Core Value:** Food photos that make you want to order — a menu you browse naturally, not navigate laboriously.

## v1 Requirements

### Performance

- [x] **PERF-01**: Next.js image optimization enabled (remove `unoptimized: true` from next.config.ts) — images served as WebP/AVIF with responsive sizing
- [x] **PERF-02**: All dish images in Menu use `<Image>` with correct `sizes` attribute for responsive loading

### Data

- [x] **DATA-01**: All 48 dishes in MENU_DATA have a `spiceLevel` field (integer 1–3)
- [x] **DATA-02**: All 48 dishes in MENU_DATA have an `allergens` field (array of strings: `['gluten', 'dairy', 'nuts', 'eggs', 'soy', 'shellfish']`)
- [x] **DATA-03**: Placeholder values are used where real values are unknown — data structure ready for future fill-in

### Gallery Navigation

- [x] **GALL-01**: Day navigation is a horizontally scrollable card gallery — all 6 days visible as swipeable cards
- [x] **GALL-02**: Each gallery card shows: day label (Mon–Sat), food photo, dish name, spice icon row, allergen icon row
- [x] **GALL-03**: Selected day card is visually distinct (highlighted border or scale treatment)
- [x] **GALL-04**: Gallery auto-scrolls to selected day on initial load (today's day)
- [x] **GALL-05**: Scroll behavior is smooth and touch-friendly (no scrollbar visible)

### Week Navigation

- [ ] **WEEK-01**: Week selector is a horizontally scrollable tab strip (Week 1, Week 2, Week 3, Week 4)
- [ ] **WEEK-02**: Active week tab is visually highlighted
- [ ] **WEEK-03**: Tab strip replaces the existing `<select>` dropdown and `CustomSelect` component in the menu header

### Diet Toggle

- [ ] **DIET-01**: Veg/Non-Veg toggle slider is retained and functional
- [ ] **DIET-02**: Toggle styling is refined to match the new card gallery design language

### Detail View

- [ ] **DETL-01**: Tapping/clicking a dish card opens a slide-up detail sheet
- [ ] **DETL-02**: Detail sheet shows: dish name, description, spice level, allergen row, and a nutrition icon
- [ ] **DETL-03**: Tapping the nutrition icon in the detail sheet opens the existing nutrition modal
- [ ] **DETL-04**: The "Nutrition Info" text button in the current card layout is removed
- [ ] **DETL-05**: Detail sheet can be dismissed by tapping outside or a close affordance

## v2 Requirements

### Data Enrichment

- **DATA-V2-01**: Real spice level values filled in for all 48 dishes
- **DATA-V2-02**: Real allergen values filled in for all 48 dishes
- **DATA-V2-03**: Menu data sourced from a CMS or API (not hardcoded)

### Enhanced Gallery

- **GALL-V2-01**: Swipe gesture between days (left/right swipe changes selected dish)
- **GALL-V2-02**: "Coming soon" state for days with no dish in the current filter

## Out of Scope

| Feature | Reason |
|---------|--------|
| Ordering flow changes | Separate concern — Stripe integration not touched |
| Replacing MUI Modal for nutrition | Refinement only, not rewrite |
| Adding new dishes or weeks | Data management, not UI revamp |
| Dynamic menu from backend | Static data sufficient for v1 |
| Image re-shooting or renaming | Cannot change existing image file paths |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PERF-01 | Phase 1 | Complete |
| PERF-02 | Phase 1 | Complete |
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| GALL-01 | Phase 2 | Complete |
| GALL-02 | Phase 2 | Complete |
| GALL-03 | Phase 2 | Complete |
| GALL-04 | Phase 2 | Complete |
| GALL-05 | Phase 2 | Complete |
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

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 after initial definition*

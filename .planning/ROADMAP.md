# Dormer's Menu Revamp — Roadmap

**Project:** Dormer's Website — Menu Section Revamp
**Core Value:** Food photos that make you want to order — a menu you browse naturally, not navigate laboriously.
**Milestone:** v1 (20 requirements across 3 phases)
**Granularity:** Standard (3 phases)
**Created:** 2026-04-03

---

## Phases

- [x] **Phase 1: Foundations & Data** - Enable image optimization and extend the data model with spice and allergen fields (completed 2026-04-03)
- [x] **Phase 2: Card Gallery** - Replace the letter-button day selector with an image-forward scrollable card gallery (completed 2026-04-04)
- [ ] **Phase 3: Navigation + Detail View** - Replace the week dropdown, refine the diet toggle, and add a slide-up dish detail sheet
- [x] **Phase 4: Codebase Cleanup** - Audit and remove all files not referenced by the live website (completed 2026-04-18)

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
- [x] 02-PLAN-01.md — Build DishGallery.tsx component with Framer Motion drag, snap-to-card, and selection treatment
- [x] 02-PLAN-02.md — Wire DishGallery into Menu.tsx, remove letter buttons, visual verification
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

### Phase 4: Codebase Cleanup
**Goal**: All dead code, orphaned assets, duplicate image directories, and legacy configs are removed — the repo contains only files referenced by the live website
**Depends on**: Phase 3
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05
**Success Criteria** (what must be TRUE):
  1. All 9 orphaned source components are deleted (CurtleAboutUs, ChiliIcon, DishGallery, MatrixText, useResize, ChatWindow, QualifyForm, AboutUs + CSS, CustomSelect)
  2. Legacy .eslintrc.js is removed; eslint.config.mjs remains the sole ESLint config
  3. Root scratch files (git_hub_production, test-flex.html) are removed
  4. Duplicate public/images/Week1/Nonveg/ directory is removed; nonveg1/ is preserved
  5. 14 unused stock food photos and 5 Next.js default SVGs are removed from public/
  6. `next build` passes cleanly with exit code 0 after all deletions
**Plans**: 2 plans
Plans:
- [x] 04-01-PLAN.md — Delete orphaned source components, root artifacts, and legacy ESLint config
- [x] 04-02-PLAN.md — Delete unused images, duplicate directories, and default SVGs; verify clean build

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations & Data | 1/1 | Complete   | 2026-04-03 |
| 2. Card Gallery | 2/2 | Complete   | 2026-04-04 |
| 3. Navigation + Detail View | 0/? | Not started | - |
| 4. Codebase Cleanup | 2/2 | Complete    | 2026-04-18 |
| 5. Dorm Wars page visual revamp | 3/3 | Complete   | 2026-05-14 |
| 6. Dorm Wars game-feel pass | 5/5 | Complete   | 2026-05-15 |
| 7. Dorm Wars reward backend | 0/6 | In progress | - |

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
| CLEAN-01 | Phase 4 | Pending |
| CLEAN-02 | Phase 4 | Pending |
| CLEAN-03 | Phase 4 | Pending |
| CLEAN-04 | Phase 4 | Pending |
| CLEAN-05 | Phase 4 | Pending |

**v1 requirements mapped:** 20/20
**Cleanup requirements mapped:** 5/5
**Orphaned requirements:** 0

### Phase 5: Dorm Wars page visual revamp

**Goal:** Replace `/dashboard/dorm-wars` with the cinematic dark "war room" treatment proven in the visual mock — pixel-fidelity migration, then wire mechanics to existing data (no new backend), then layer cinematic polish (title-screen interstitial, sound, motion refinement) and delete the mock scaffolding.
**Requirements**: None (product-driven phase — no REQ-IDs mapped; design decisions D-01 through D-34 captured in `.planning/phases/05-dorm-wars-page-visual-revamp/05-CONTEXT.md`)
**Depends on:** Phase 4
**Plans:** 3/3 plans complete

Plans:
- [x] 05-01-PLAN.md — Wave 1: Structure swap — replace DormWarsClient.tsx + page.tsx with the mock's structure (single-file strategy); preserve hasClaimed/hasConverted state machine; drop MockDisclaimer
- [x] 05-02-PLAN.md — Wave 2: State mechanics — wire CycleClock to active subscription, rename Daily Drop key to canonical schema, add streak meter, derive TrophyRoom from referralData + streak, map invites to Recruits, tighten FinePrint copy
- [x] 05-03-PLAN.md — Wave 3: Cinematic polish + cleanup — title-screen interstitial (once per cycle), Web Audio sound system + toggle, Daily Drop particle burst, cycle-clock hover-glow, delete `src/app/dashboard/dorm-wars/mock/` directory entirely

### Phase 6: Dorm Wars game-feel pass

**Goal:** Elevate `/dashboard/dorm-wars` from "polished web" to "studio-built game" through atmosphere, audio, HUD, and cinema craft. Budget includes commissioned assets (stencil icon set, anchor illustration, custom display face, audio stems). Phase 5 nailed structure and copy; this phase adds the AV craft layer that flips perceived class.

**In scope:**
- Atmosphere stack: animated film grain, vignette, real bloom on hot UI, consistent key-light direction, CRT scanline overlay on HUD only
- Persistent HUD pod (fixed corner overlay: callsign, rank chevron, AED wallet, streak flame; survives scroll; juices on state change)
- Audio system: three-stem layered ambient bed (drone + chatter + duct hum), recorded stinger library, ducking (-6dB) during stingers, spatial UI sounds via `StereoPannerNode`, audio-reactive bloom via `AnalyserNode`, sound default OFF with "ENABLE AUDIO" pre-prompt
- Rank-up cinematic moment (~1.5s): letterbox bars + world dim + stamped "PROMOTED" card + stinger + 1.5px microshake (fires once per cycle max)
- Motion craft: stratified parallax on scroll (bg 0.5x / mid 0.85x / fg 1x / HUD pinned), impact flash + microshake on conversion, chromatic aberration on stinger events, cursor reticle on interactive surfaces
- Title-screen interstitial upgrade: typed callsign with cursor blink + key-clicks, ink-bleed "ENTER WAR ROOM" stamp, 4s riser → impact → tail intro stinger
- Edge-of-viewport diegetic alerts ("INCOMING" strip on rank drop / friend conversion)
- Number rolls with tabular numerals on AED/conversion counter changes
- Commissioned assets: stencil/military icon set (~15 icons replacing all Lucide on dorm-wars), one hand-drawn HQ illustration or war-room map (anchor moment), custom stencil display face for rank labels, three audio stems for ambient bed + ~8 stinger stems, 9-slice torn-paper/stamped borders for rank pills and trophy frames

**Out of scope (deferred to future phases):**
- WebGL / Three.js animated backdrop (own phase — perf budget implications)
- Color-as-story palette refactor (rivals desaturated, OG reserved for "you", lost states muted red — touches every component, own phase)

**Requirements**: None (product-driven phase — no REQ-IDs mapped; scope locked in conversation 2026-05-15)
**Depends on:** Phase 5
**Plans:** 5/5 plans executed — Phase 6 COMPLETE

Plans:
- [x] 06-01-PLAN.md — Wave 1: Atmosphere foundation (grain, vignette, bloom, parallax, reticle cursor, reduced-motion gate, perf-test gate)
- [x] 06-02-PLAN.md — Wave 2: Audio system (three-stem ambient bed, stinger library with ducking + spatial pan, audio-reactive bloom, ENABLE AUDIO pre-prompt; default OFF per D-16)
- [x] 06-03-PLAN.md — Wave 3: HUD pod (desktop 4-row pod + mobile collapsed pill, NumberRoll, CRT scanline overlay, mounted only on /dashboard/dorm-wars per D-12)
- [x] 06-04-PLAN.md — Wave 4: Cinema moments (rank-up cutscene 8-step choreography, title-screen interstitial upgrade with typed callsign + ink-bleed stamp, edge-of-viewport INCOMING alerts, chromatic aberration, impact flash + microshake)
- [x] 06-05-PLAN.md — Wave 5: Asset integration sweep (16 stencil icons + 9-slice border, Black Ops One stencil font installed and applied at 5 sites, AnchorImage with full D-07 treatment + Unsplash war-room JPEG, 11 audio stem placeholders pending user curation per ATTRIBUTION.md, Lucide identity-icon sweep on DormWarsClient, Wave 4 D-15 carryover fix)

### Phase 7: Dorm Wars reward backend

**Goal:** Make the Dorm Wars hub a real reward economy. After Phase 7, every reward shown in the hub is server-canonical, auto-awarded on threshold cross, and redeemable at next checkout. Closes the gaps left by Phase 6 (which delivered visual polish but kept reward state client-side / stub-only).

**In scope:**
- Schema foundation (versioned migrations for existing live tables + 4 new tables + bonus_skips column + customer perk flags)
- Credit redemption via per-session synthesized Stripe Coupon (combines credit AED + lifetime tier % into one `amount_off` coupon)
- Layer 2 cycle bonuses (auto-fire on 3/6/10/15/20 conversion thresholds inline in `creditInviterOnConversion`)
- Layer 3 lifetime tier perks (auto-fire on 10/25/50/100, deliver via per-session coupon for %, credit deposit for AED rewards)
- Daily Drop server persistence (replace localStorage roulette with `daily_drops` table + RNG endpoint)
- Streak server persistence (replace localStorage with `streaks` table + tick endpoint)
- HubClient wire-through to server-canonical values

**Out of scope (deferred to Phase 8):**
- Layer 4 side rewards (Google review, weekly surveys, anniversary, renew+invite combo)
- Admin tooling (credit approval UI, review-queue UI)
- Dorm Weekend real mechanic (group meal, voting) — Phase 7 ships a stub
- Push notifications / email when rewards fire
- Migration to persistent Stripe Customers

**Requirements**: None (product-driven phase — design decisions captured in `.planning/phases/07-dorm-wars-reward-backend/07-CONTEXT.md` + 10 architecture decisions resolved in `07-RESEARCH.md`)
**Depends on:** Phase 6
**Plans:** 0/6 plans complete

Plans:
- [ ] 07-01-PLAN.md — Wave 1: Schema foundation (snapshot live referral/credits tables + 4 new tables + bonus_skips + perk flags)
- [ ] 07-02-PLAN.md — Wave 2: Credit redemption pipeline (coupon-synth lib, checkout/webhook wiring, checkout panel UI)
- [ ] 07-03-PLAN.md — Wave 3: Layer 2 cycle awarder (5 milestones, shared getCycleRecruits, idempotent inline fire)
- [ ] 07-04-PLAN.md — Wave 4: Layer 3 lifetime tier perks (4 tiers, side-effect flags, tier discount baked into coupon-synth)
- [ ] 07-05-PLAN.md — Wave 5: Daily Drop + Streak server persistence (2 API routes, server-canonical state)
- [ ] 07-06-PLAN.md — Wave 6: Hub wire-through + integration tests + final verification

---

*Roadmap created: 2026-04-03*
*Last updated: 2026-05-16 — Phase 7 planned (6 plans, plan-checker PASS)*

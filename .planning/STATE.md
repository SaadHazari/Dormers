---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 06-01-PLAN.md (Atmosphere foundation)
last_updated: "2026-05-15T16:23:00.051Z"
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 13
  completed_plans: 9
  percent: 100
---

# Project State — Dormer's Menu Revamp

**Last updated:** 2026-04-18
**Session:** Phase 4 Plan 02 — Image cleanup and build verification complete

---

## Project Reference

**Core value:** Food photos that make you want to order — a menu you browse naturally, not navigate laboriously.
**Current focus:** Phase 06 — dorm-wars-game-feel-pass
**Total phases:** 4
**Requirements:** 20 v1 requirements, 10 complete, 10 pending

---

## Current Position

Phase: 06 (dorm-wars-game-feel-pass) — EXECUTING
Plan: 2 of 5
| Field | Value |
|-------|-------|
| Active phase | Phase 4: Codebase Cleanup |
| Active plan | None (Phase 4 complete) |
| Phase status | Phase 1, 2, 4 complete; Phase 3 not started |
| Overall progress | 5/5 plans complete |

```
Progress: [██████████] 100%
Phase 1 ██████████ COMPLETE
Phase 2 ██████████ COMPLETE
Phase 3 ░░░░░░░░░░ NOT STARTED
Phase 4 ██████████ COMPLETE (2/2 plans)
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
| Fix Menu.tsx import before deleting Nonveg/ | Safety grep caught ChickenFried_v2.jpg still referenced — updated to nonveg1/ChickenFried.jpg before deletion |
| next build failure is pre-existing local env issue | Apostrophe in Dormer's path breaks webpack-generated JS string — confirmed present at pre-Phase-4 commit; does not affect Netlify |
| Phase 6 Wave 1: hand-rolled rAF parallax over `react-scroll-parallax` | Single shared listener, ~50 lines, avoids provider/layout conflict with dashboard layout's overflow rules (RESEARCH Pattern 4 + Pitfall 8) |
| Phase 6 Wave 1: SVG `feTurbulence` grain over PNG noise tile | GPU-composited via browser filter pipeline, ~200-byte inline SVG vs 6-frame ~300KB PNG cycle; numOctaves capped at 2 per Pitfall 3 to stay under mobile GPU bandwidth |
| Phase 6 Wave 1: JS-only reduced-motion gate via `useReducedMotionGate` hook | Phase 5's CSS `prefers-reduced-motion` block stays unchanged (acceptance criterion); every new motion module early-returns or jumps to end-state in JS |
| Phase 6 Wave 1: `Bloom` `audioReactive` prop wired into Wave 1 API surface | Wave 2 plugs `useAudioReactive()` into a single seam in `Bloom.tsx` without re-touching DormWarsClient or any consumer call site (D-03 architecture-first) |
| Phase 6 Wave 1: live Chrome DevTools perf gate deferred to merge review | Parallel-executor sandbox cannot launch interactive browser; static-analysis baseline + fallback levers (FPS 24→12, blurPx 32→16) committed to `06-01-perf-baseline.json` for user to apply if regression found |

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
- Phase 4 Plan 02 removed: public/images/Week1/Nonveg/ (14 files), 14 unused stock food photos, 5 Next.js default SVGs
- Menu.tsx ChickenFried import fixed: Nonveg/ChickenFried_v2.jpg → nonveg1/ChickenFried.jpg (caught by safety grep)
- All Week1 non-veg static imports now point exclusively to nonveg1/

### Roadmap Evolution

- Phase 4 added: Codebase cleanup — audit and remove all files not referenced by the live website (unused components, dead assets, orphaned scripts, stale configs, etc.)
- Phase 5 added: Dorm Wars page visual revamp — replace existing /dashboard/dorm-wars with all-dark cinematic treatment proven in mock at /dashboard/dorm-wars/mock. Three waves: (1) structure swap + tokens + leaderboard unblur, (2) state mechanics — Daily Drop, streak meter, cycle clock wired to subscription cycle, Trophy Room from existing data, (3) cinematic polish — title-screen interstitial, sound + toggle, motion refinement. Visual-only — no new backend tables. Mock files at src/app/dashboard/dorm-wars/mock/ are reference and deleted at migration end.
- Phase 6 added: Dorm Wars game-feel pass — AV craft layer that flips perceived class from "polished web" to "studio-built game". In scope: atmosphere stack (grain/vignette/bloom/key-light/CRT-on-HUD), persistent HUD pod, three-stem ambient audio bed + recorded stinger library + ducking + spatial UI sounds + audio-reactive bloom, rank-up cinematic (letterbox + stamped card + microshake), stratified parallax + impact flash + chromatic aberration + cursor reticle, title-screen upgrade (typed callsign, ink-bleed stamp, 4s intro stinger), edge-of-viewport "INCOMING" alerts, tabular number rolls, commissioned assets (stencil icon set, anchor illustration, custom display face, audio stems, 9-slice borders). Out of scope: WebGL backdrop (own phase), color-as-story palette refactor (own phase). Scope locked 2026-05-15.

### Blockers

None at project start.

### Todos

- [ ] Run `next build` after Phase 1 to confirm no image sizing warnings
- [ ] Verify touch scroll behavior on a real mobile device after Phase 2
- [ ] Confirm nutrition modal still opens correctly from the new icon trigger after Phase 3

---

## Session Continuity

Phase 4 complete. Both plans executed:

- Plan 01: Orphaned source components, legacy configs, and root artifacts deleted
- Plan 02: Duplicate image directory, unused stock photos, and Next.js SVGs deleted; Menu.tsx import fixed

Next: Phase 3 (not yet planned) — week tabs and detail sheet refinements.

**Stopped at:** Completed 06-01-PLAN.md (Atmosphere foundation)

---

*State initialized: 2026-04-03*

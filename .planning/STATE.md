---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 06-04-PLAN.md (cinema moments)
last_updated: "2026-05-15T17:30:28.277Z"
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 13
  completed_plans: 12
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
Plan: 5 of 5
| Field | Value |
|-------|-------|
| Active phase | Phase 6: Dorm Wars Game-Feel Pass |
| Active plan | Plan 5 (asset integration sweep) — last plan in phase |
| Phase status | Phases 1, 2, 4, 5 complete; Phase 6 in progress (4/5 plans complete); Phase 3 not started |
| Overall progress | 12/13 plans complete |

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
| Phase 6 Wave 2: AudioContext shared via `sound.ctx()` between synth (Phase 5 useSound) and sample-based hooks (useAudioBed, useStingers) | Single browser AudioContext serves both pipelines; avoids autoplay-policy double-prompt and stays within browser context limits. useSound owns the ref; consumers receive it as a parameter |
| Phase 6 Wave 2: D-16 audio default OFF persisted via NEW `dw-audio-enabled` localStorage key | Reverses Phase 5 D-29 (default ON). One-cycle back-compat reads `dw-sound` if `dw-audio-enabled` absent; once user toggles via AudioPrompt, only the new key is written and `dw-sound` dies gradually |
| Phase 6 Wave 2: HeroBlock got new `audioAnalyser` prop instead of closing over `audioBed.analyser` | Bloom on "war." headline lives inside HeroBlock's render tree (separate function), not DormWarsClient body — analyser must be threaded through props rather than captured. Same pattern Wave 3 will follow for HUD chevron Bloom |
| Phase 6 Wave 2: Stinger AudioBuffers cached in useRef Map; lazy fetch on first play | First play of each key incurs network + decode; subsequent plays are zero-cost. Bundle weight stays at 0 until ENABLE AUDIO is tapped AND a stinger event fires (lazy-load discipline per RESEARCH bundle budget) |
| Phase 6 Wave 2: Silent-fail on missing audio assets (try/catch + console.warn) | Per UI-SPEC error state — audio is opt-in atmosphere, not core functionality. System wired but inaudible until Wave 5 lands real .mp3 stems; synth fallbacks (Phase 5 useSound) keep the page audible during Waves 2-4 |
| Phase 6 Wave 3: HUD mobile collapse uses render-swap (instant), not 280ms layout-tween | Interpolating a 32px pill into 240×~104px pod requires either FLIP animation (out of scope) or transform-based scale that distorts content; render-swap matches reduced-motion behavior natively per D-15 (instant under both branches); future enhancement could add an opacity crossfade between renderings |
| Phase 6 Wave 3: NumberRoll uses direct matchMedia inside imperative animate() effects, NOT useReducedMotionGate hook | RESEARCH Pitfall 4: framer-motion's imperative animate() runs outside React's render cycle — a hook re-render wouldn't propagate fast enough on live OS toggles. Synchronous matchMedia check before each animate() call is the canonical pattern for imperative motion APIs |
| Phase 6 Wave 3: AED wallet wired to live referralData.creditBalance, NOT MOCK_CREDIT stub | Plan offered MOCK_CREDIT as fallback if .credit field didn't exist; queries.ts inspection confirmed creditBalance: number IS on the typed interface (sum of approved credits in AED). HUD becomes the first live consumer of the field, leapfrogging Phase 5's HeroBlock stub |
| Phase 6 Wave 3: HUD mounted in DormWarsClient.tsx ONLY — layout.tsx NOT modified | D-12 enforcement: HUD is a war-room artifact, not global app chrome. Cross-page persistence would force theme-adaptive variants per dashboard page and leak war-room aesthetics into surfaces that are deliberately calm. Verified via grep returning 0 HUDPod references in layout.tsx |
| Phase 6 Wave 3: RankChevron flash-on-change uses inline 200ms dw-rank-flash class as Wave 4 ImpactFlash placeholder | Plan explicitly notes ImpactFlash module lands in Wave 4. Migration path: wrap RankChevron with `<ImpactFlash trigger={rankChanged}>...</ImpactFlash>` and remove inline keyframes. Placeholder behavior (200ms OG glow burst, CSS @media disabled) matches spec exactly so swap is visual no-op |
| Phase 6 Wave 4: Letterbox bars use transform: scaleY (transformOrigin top/bottom) NOT height animation | RESEARCH Anti-Pattern Pattern 8 compliance — height triggers layout reflow, transform composites on the GPU. UI-SPEC's `height: 0 → 64px` describes visual end-state; planner mapped to GPU-friendly implementation |
| Phase 6 Wave 4: BACK_OUT cubic-bezier(0.34, 1.56, 0.64, 1) registered as third easing curve | Per CONTEXT Claude's Discretion latitude — used for PROMOTED stamp overshoot-and-settle in RankUpCutscene step 3. Lives as const inside RankUpCutscene.tsx, NOT promoted to tokens.ts (locked per Phase 5 D-03) |
| Phase 6 Wave 4: Rank-up cutscene fires on cross-threshold-upward only (RANK_TIERS.indexOf comparison) | Never on demotion (e.g., refund that drops Sergeant→Soldier). Matches UI-SPEC intent: cutscene celebrates promotion, not demotion |
| Phase 6 Wave 4: Cinema modules consume stingers via optional playStinger?: callback prop, NOT direct useStingers import | Keeps modules pure-presentational + testable; clean dependency direction (modules depend on small callback type, not audio subsystem); caller controls audio source (could swap stingers.play for a synth fallback). Wave 2's `void stingers` placeholder REMOVED — stingers genuinely consumed in 5 places (3 prop wirings + 1 direct call in conversion-impact useEffect + the prop chain) |
| Phase 6 Wave 4: TitleScreenInterstitial upgrade preserves Phase 5 D-28 once-per-cycle gating contract | DormWarsClient still owns the show/dismiss lifecycle via dw-titlescreen-${cycleStartISO}; new module is purely presentational + behavior. Adding a new key would break Phase 5's gating semantics |
| Phase 6 Wave 4: ImpactFlash trigger uses incrementing counter pattern (setX(t => t + 1)) NOT boolean toggle | Guarantees React detects a change even if conversions land in rapid succession (two conversions within the 80ms flash window would otherwise collapse to a single render with active=true) |

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
- [ ] **Phase 6 perf-gate UAT (Wave 1 deferred to phase-end):** `npm run dev` → http://localhost:3000/dashboard/dorm-wars in incognito → DevTools Performance → 4× CPU throttle → record 10s of idle scroll. Target: ≥60fps. If regress: drop `<Grain fps={24} />` to `<Grain fps={12} />` in DormWarsClient.tsx. Verification must happen with all atmosphere + audio + HUD + cinema active (not just Wave 1) — stricter gate. Static-analysis baseline at `.planning/phases/06-dorm-wars-game-feel-pass/06-01-perf-baseline.json`.

---

## Session Continuity

Phase 4 complete. Both plans executed:

- Plan 01: Orphaned source components, legacy configs, and root artifacts deleted
- Plan 02: Duplicate image directory, unused stock photos, and Next.js SVGs deleted; Menu.tsx import fixed

Next: Phase 3 (not yet planned) — week tabs and detail sheet refinements.

**Stopped at:** Completed 06-04-PLAN.md (cinema moments)

---

*State initialized: 2026-04-03*

# Phase 6: Dorm Wars Game-Feel Pass — Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Elevate `/dashboard/dorm-wars` from "polished web" to "studio-built game" through the AV craft layer. Phase 5 nailed the structure, copy, and core mechanics. This phase adds atmosphere, persistent HUD, layered audio, motion craft, and cinema moments — the perceived-class shift that separates dashboard UI from game UI.

**In scope:**
- Atmosphere stack: animated film grain, vignette, real bloom on hot OG-colored UI, consistent key-light direction (top-left), CRT scanline overlay scoped to HUD pod only
- Persistent HUD pod: fixed corner overlay with callsign, rank chevron, AED in wallet, streak flame; mounts only on `/dashboard/dorm-wars`; updates with juice on state change
- Audio system: three-stem layered ambient bed (drone + comms chatter + duct hum), curated stinger library (~8 stems), `-6dB` ducking during stingers, spatial UI sounds via `StereoPannerNode`, audio-reactive bloom via `AnalyserNode`
- Rank-up cinematic moment (~1.5s): letterbox bars + world dim + stamped "PROMOTED" card + stinger + 1.5px microshake; fires once per cycle max
- Motion craft: stratified scroll parallax (bg 0.5x / mid 0.85x / fg 1x / HUD pinned 1.0x), impact flash + microshake on conversion, chromatic aberration on stinger events (1-2px RGB split, 200ms ease-out), cursor reticle over interactive surfaces
- Title-screen interstitial upgrade: typed callsign with cursor blink + key-clicks, ink-bleed "ENTER WAR ROOM" stamp, 4-second riser → impact → tail intro stinger
- Edge-of-viewport diegetic alerts: "INCOMING" strip flashes at screen edge on rank drop or friend conversion (same location every time so user learns it)
- Number rolls with tabular numerals on AED/conversion counter changes
- Asset pipeline (Claude-authored / Claude-curated, see D-04 through D-08):
  - Stencil/military icon set (~15 icons) replacing all Lucide usage on dorm-wars
  - Anchor war-room/HQ photographic image, treated to belong to the war-room identity
  - Custom display face for rank labels via Google Fonts
  - Three ambient audio stems + ~8 stinger stems from free royalty-free sources
  - 9-slice torn-paper / stamped borders for rank pills and trophy frames

**Out of scope (deferred to future phases):**
- WebGL / Three.js animated backdrop — own phase, has perf budget implications
- Color-as-story palette refactor (rivals desaturated, OG reserved for "you", lost states muted red) — own phase, touches every component

</domain>

<decisions>
## Implementation Decisions

### Wave Structure

- **D-01:** Five per-feature waves. Each wave is a single capability with a clear deliverable and clean commit log. Order: Wave 1 — Atmosphere (grain, vignette, bloom, key-light, parallax, cursor reticle). Wave 2 — Audio system (ambient bed, stinger library, ducking, spatial pan, audio-reactive bloom, ENABLE-AUDIO pre-prompt). Wave 3 — HUD pod (callsign, rank chevron, AED wallet, streak flame, CRT scanline overlay, mobile collapsed-pill variant). Wave 4 — Cinema moments (rank-up cutscene, title-screen interstitial upgrade with typed callsign + ink-bleed stamp + intro stinger, edge-of-viewport INCOMING alerts, chromatic aberration on stingers, impact flash + microshake on conversion, tabular number rolls). Wave 5 — Asset integration sweep (icon set replacement, anchor photo integration, display face installation, 9-slice borders).
- **D-02:** **Block phase ship on all assets landing.** No wave merges in incomplete-asset state. Since assets are Claude-authored or Claude-curated (D-04 through D-08), this is timeline-controllable and not vendor-dependent — but the gating discipline still holds: a wave that names an asset is not "done" until that asset is integrated, not just placeholder-stubbed.
- **D-03:** **Architecture-first within each wave.** When a wave introduces a system (e.g., Wave 2 introduces the audio system), it lands as a module under `_shared/dw/` (see D-09) with placeholder content first, *then* the assets land in Wave 5. This means Wave 2 ships with synth audio (carried over from Phase 5's `useSound`) as the placeholder for the stinger library; Wave 5 swaps the real stems in. Same pattern for icons (Lucide stays as placeholder through Waves 1-4, replaced in Wave 5) and display face (system font stays until Wave 5).

### Asset Pipeline

- **D-04:** **Icon set — Claude-authored inline SVG components.** ~15 stencil/military icons sharing one design language (consistent stroke weight, corner radius, optical compensation, baseline alignment). Each icon ships as a React component exporting an SVG. Stored in `src/app/dashboard/_shared/dw/icons/`. Categories cover ranks (Soldier, Sergeant, Commander, War Hero, Founder), drops (Credit, Multiplier, Skip, Spotlight, Intel), mission rewards (Free Skip, Free Week, Pause Unlocked), and HUD (Wallet, Flame, Callsign). Icons must read at 12px and 48px equally well.
- **D-05:** **Audio stems — Claude-curated from free CC0 / CC-BY sources.** Sources: Freesound.org (CC0 + CC-BY-3.0/4.0), Pixabay Audio (royalty-free), Mixkit (free music & SFX). Stored in `public/audio/dw/` with subdirs `ambient/` (3 stems for bed) and `stingers/` (~8 stems for cues: unlock, drop-reveal, rank-up, warning, copy-tick, milestone fanfare, conversion impact, title-screen intro). Format: `.mp3` (broadest browser support) + `.ogg` fallback. Attribution comments in `public/audio/dw/ATTRIBUTION.md` for any CC-BY files. CC0 preferred when quality is equivalent.
- **D-06:** **Display face — Google Fonts (OFL license).** Candidates to evaluate in Wave 5: Black Ops One, Saira Stencil One, Stardos Stencil. Pick the one that pairs cleanly with the existing DISPLAY token face without competing. Integrate via `next/font/google` in `layout.tsx` or scoped to dorm-wars only. Reserved for rank labels and the "PROMOTED" stamp — does NOT replace the DISPLAY token for the "war." headline.
- **D-07:** **Anchor image — free stock from Unsplash / Pexels with mandatory treatment.** A war-room, tactical-map, or worn-paper-map photograph. **Required treatment to integrate with the war-room identity (not optional, not a marketing-site photo dump):**
  - Duotone color mapping: shadows → NV (#091825), highlights → OG (#F57F20). Apply via SVG `<feColorMatrix>` filter or CSS `filter: grayscale(1)` + mix-blend-mode overlay.
  - Heavy grain match (the same grain layer that runs over the whole page passes over the image too — it must not look like a photograph dropped onto a stylized scene).
  - Partial composition: image occupies at most 40% of the hero section, never full-bleed full-screen. Edges feather into the NV background via radial mask or `mask-image: linear-gradient`.
  - Vignette darkens its corners further than the page vignette.
  - One specific anchor moment: place behind the cycle clock in the hero, or as a watermark in the Active Mission card. Not multiple anchor uses.
- **D-08:** **9-slice borders — Claude-authored SVG.** Torn-paper / stamped-edge frames for rank pills and trophy frames. Implement as CSS `border-image-source` with a tiled SVG or as absolute-positioned SVG corners. Avoid raster nine-slice — vector keeps it scalable and themable.

### Component Architecture

- **D-09:** **Split new systems into `src/app/dashboard/_shared/dw/` modules.** Directory structure:
  - `_shared/dw/atmosphere/` — `Grain.tsx`, `Vignette.tsx`, `Bloom.tsx`, `ParallaxLayer.tsx`, `CursorReticle.tsx`
  - `_shared/dw/audio/` — `useAudioBed.ts` (three-stem loop manager), `useStingers.ts` (stinger library + ducking + spatial pan), `useAudioReactive.ts` (`AnalyserNode` driver for bloom), `AudioPrompt.tsx` (ENABLE-AUDIO pill)
  - `_shared/dw/hud/` — `HUDPod.tsx`, `HUDPill.tsx` (mobile collapsed), `NumberRoll.tsx`, `CallsignChip.tsx`, `RankChevron.tsx`, `WalletReadout.tsx`, `StreakFlame.tsx`, `ScanlineOverlay.tsx`
  - `_shared/dw/cinema/` — `RankUpCutscene.tsx`, `TitleScreenInterstitial.tsx` (upgrades existing one), `EdgeAlert.tsx`, `ChromaticAberration.tsx`, `ImpactFlash.tsx`
  - `_shared/dw/icons/` — one file per icon component, `index.ts` barrel export
  - `_shared/dw/utils/` — `useStratifiedParallax.ts`, `useReducedMotionGate.ts`, `triggerScreenShake.ts`
- **D-10:** `DormWarsClient.tsx` becomes the **composer**. It imports from `_shared/dw/*` and arranges them in the existing block order (PulseTicker → Hero → ActiveMission → DailyDrop → MissionLadder → Recruits → Leaderboard → TrophyRoom → ActionSurface → FinePrint), now wrapped in `<Grain>`, `<Vignette>`, `<ParallaxLayer>`, with `<HUDPod>` mounted at root and `<RankUpCutscene>` / `<EdgeAlert>` listening to state. Target post-Phase-6 line count: ≤ 1800 lines (down from 2003 once existing logic shifts into modules).
- **D-11:** **Phase 5's inline-style + `<SharedKeyframes>` pattern continues inside modules.** No Tailwind, no CSS modules, no styled-components. Each new module file follows the same convention: inline styles, scoped keyframes injected via `<style>` tags or appended to a shared keyframe component. This preserves the codebase's established Phase 5 commitment (per code_context "Things to Watch" in Phase 5 CONTEXT).

### HUD Pod Scope

- **D-12:** **HUD pod mounts only on `/dashboard/dorm-wars`.** Not in `dashboard/layout.tsx`. Reason: cream-on-light dashboard pages have their own identity per the locked principle "Dashboard light vs marketing site dark is intentional" (user auto-memory). The HUD is a war-room artifact, not global app chrome. Cross-page persistence would force theme-adaptive variants per dashboard page and leak war-room aesthetics into surfaces that are deliberately calm.
- **D-13:** **Mobile (≤720px viewport) behavior — collapsed pill, tap to expand.** Default state: single small pill in top-right corner showing the two highest-value live readouts (current AED in wallet + rank chevron). Tap expands to the full HUD readout (adds callsign, streak flame, scanline overlay). Pill animates with the same QUART_OUT easing used elsewhere. Auto-collapses after 4 seconds of no interaction. Reuses the same `HUDPod` component logic — the pill is a visual variant, not a separate component.
- **D-14:** **HUD position — top-right corner, ~16px from edges**, above the dashboard sidebar's z-stacking. Survives scroll via `position: fixed`. Z-index lower than modals (TitleScreenInterstitial, RankUpCutscene, WelcomeOverlay) so they cover it during their moments. State changes trigger juice: numeric values use `NumberRoll` for tabular tweens, rank changes flash the chevron via the same ImpactFlash module used elsewhere.

### Reduced Motion + Accessibility (binding constraints)

- **D-15:** **`prefers-reduced-motion` extension.** Phase 5's keyframe-disable block (line ~588 of current `DormWarsClient.tsx`) must extend to cover every new motion construct: grain animation pause, parallax layers locked to 1x, screen shake disabled, chromatic aberration disabled, cursor reticle reverts to default, rank-up cutscene degrades to static stamped card (no shake, no letterbox slide-in), edge alerts appear instantly instead of sliding in, number rolls jump-set instead of tween. Each new motion module exports a `respectsReducedMotion: true` contract — if reduced-motion is on, the animation is replaced with the end-state.
- **D-16:** **Audio default OFF + explicit ENABLE-AUDIO pre-prompt pill.** Reverses Phase 5's D-29 ("on by default"). Reason: ambient audio bed is a different commitment from synth blips on action — most users land without a sound expectation, and browsers gate autoplay anyway. The pre-prompt pill appears in the hero rank-pill row (same position as Phase 5's `SoundToggle`) reading "ENABLE AUDIO" with a small speaker icon. Persisted in `localStorage` key `dw-audio-enabled` (NEW key — does not collide with Phase 5's `dw-sound`). Once enabled, ambient bed crossfades in over 800ms and stingers + ducking + spatial pan + audio-reactive bloom all activate.

### Claude's Discretion

- Exact grain texture (SVG noise vs. PNG noise tile) — both viable; performance test in Wave 1 picks winner.
- Specific bloom implementation (filter: blur on duplicate vs. canvas-based vs. SVG filter) — Wave 1 chooses based on perf.
- Easing curves and durations for new motion — extend Phase 5's `EXPO_OUT` and `QUART_OUT` constants; introduce a third (e.g., `BACK_OUT` for overshoot on rank-up) only if needed.
- Exact mobile breakpoint for HUD pill collapse — 720px is the existing breakpoint, can shift if testing shows otherwise.
- Where the `<Grain>` and `<Vignette>` overlays sit in the DOM tree (root vs. per-section) — root is recommended for consistency but planner decides.
- Stratified parallax library or hand-rolled — given the existing codebase has no parallax dependency, hand-rolled with `requestAnimationFrame` is the default; planner can introduce a small dep (e.g., `react-scroll-parallax`) if it cleanly reduces code.
- Number roll library (`framer-motion` is already in deps) vs. hand-rolled — recommend framer-motion's `animate()` for tabular rolls; planner confirms.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 5 Foundation (locked decisions still apply)
- `.planning/phases/05-dorm-wars-page-visual-revamp/05-CONTEXT.md` — Every D-01 through D-34 from Phase 5 still binds Phase 6. Critical: D-02 (all-dark identity), D-03 (token list — no new tokens), D-04 (spacing scale), D-05 (color discipline OG/green/cream), D-06 (only one element lifts), D-24 (portable metaphor — every string must read for office/team/house), D-29 (Web Audio API pattern) — note D-29 is **superseded by D-16 of this phase** (audio now default OFF), and D-31 (mock directory dead).
- `.planning/phases/05-dorm-wars-page-visual-revamp/05-01-PLAN.md`, `05-02-PLAN.md`, `05-03-PLAN.md` — Reference for Phase 5's wave structure and how systems were composed.

### Live Code (Phase 6 modifies these)
- `src/app/dashboard/dorm-wars/DormWarsClient.tsx` — 2003-line composer. Phase 6 extracts new systems into `_shared/dw/` modules per D-09 and trims this file to ≤ 1800 lines. The existing `useSound` hook (lines 22-97), `SharedKeyframes` (line 474), `prefers-reduced-motion` block (line ~588), `HeroBlock`, `CycleClock`, and all other blocks are touched but their core structure stays.
- `src/app/dashboard/dorm-wars/page.tsx` — Server-side data fetch. Untouched by Phase 6 (data props shape preserved).

### Shared Foundation
- `src/app/dashboard/_shared/tokens.ts` — OG, OG3, NV, NV2, CR, BODY, DISPLAY. No new tokens added in Phase 6 (per Phase 5 D-03).
- `src/app/dashboard/_shared/types.ts` — Existing dashboard types reused.

### Data Layer (unchanged)
- `src/utils/supabase/queries.ts` — Same `getReferralData()`, `getDormStats()`, `getRecentInvites()`, `getCustomer()`, `getActiveSubscription()` calls feeding `DormWarsClient.tsx`. No new queries.

### Layout Frame (unchanged)
- `src/app/dashboard/layout.tsx` — Cream container with orange border. Phase 6 does NOT mount HUD pod here (per D-12) — the HUD lives inside `DormWarsClient.tsx` so it scopes to `/dashboard/dorm-wars` only.

### Project Instructions
- `CLAUDE.md` (project root, if exists) — Project-specific guidelines.
- User auto-memory (binding):
  - "Dashboard light vs marketing site dark is intentional" — reinforces D-12 (HUD scoped to dorm-wars only).
  - "Never mix `background` shorthand with `backgroundImage` in React inline styles" — MUST FOLLOW in all new modules (relevant for grain overlay, parallax layers, anchor image treatment).
  - "Gradient border + translucent interior needs masked `::before`, not dual-background" — relevant for HUD pod styling and rank pill 9-slice borders.
  - "Pre-push must run `npm run lint`, not just tsc" — execution must pass `npm run lint` before commit, every wave.
  - "Only WhatsApp link is wa.me/971504619384" — no new WhatsApp surfaces in Phase 6 but the rule still binds if any appear.
  - "Onboarding dark-mode page is locked — do not redesign" — irrelevant here; mentioned for completeness.

### External References (none mandatory — Phase 6 is self-contained)
No external specs or ADRs. All requirements captured in decisions above and in Phase 5's CONTEXT.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`useSound` hook** in `DormWarsClient.tsx` (lines 22-97) — Web Audio API foundation. Phase 6's audio system layers on top: keep the synthesis as placeholder/fallback, add `useAudioBed` for ambient stems + `useStingers` for stem playback + ducking. Migrate this hook into `_shared/dw/audio/` per D-09.
- **`SharedKeyframes` component** (line 474) — Existing keyframe pattern. Phase 6 introduces new keyframes here: grain cycle, parallax-layer transforms, letterbox slide, chromatic-aberration shake, ink-bleed stamp, edge-alert slide-in.
- **`prefers-reduced-motion` block** (line ~588) — Existing accessibility block. Phase 6 extends per D-15 — every new animation class registers here.
- **`EXPO_OUT` and `QUART_OUT` easing constants** (lines 15-16) — Carry forward, extend with one additional curve if needed.
- **Particle burst CSS classes** (`.dw-particle`, lines ~566-573) — Already exists for Daily Drop. Phase 6 reuses the same particle pattern for rank-up flourish and edge-alert exit.
- **`<style>` injection inside React components** — Phase 5 pattern continues. New modules inject their keyframes the same way.
- **`localStorage` keying convention** — Phase 5 uses `dw-` prefix (e.g., `dw-sound`, `dw-streak`, `dw-titlescreen-${cycleStartISO}`, `dw-drop-${todayKey}`, `dw-welcome-seen`, `dw-last-milestone-played-${cycleStartISO}`). Phase 6 adds: `dw-audio-enabled` (D-16), `dw-rankup-played-${cycleStartISO}` (rank-up cutscene fires once per cycle per D-01), `dw-hud-collapsed` (HUD pill state on mobile).

### Established Patterns
- **Inline styles + scoped keyframes via SharedKeyframes** — every new module follows this pattern. No Tailwind, no CSS modules introduction (per D-11).
- **`'use client'` directive at top of all DormWars files** — every module under `_shared/dw/` that imports React hooks must have `'use client'`.
- **CamelCase block component names**, function-style not class-style. Phase 5's `HeroBlock`, `ActiveMissionBlock`, `LeaderboardBlock` pattern continues for any new blocks.
- **Type imports from `_shared/types.ts`** — `Subscription`, `ReferralData`, `DormStats`, `InviteRow` flow as props through `DormWarsClient.tsx` to children.
- **Lucide icons as placeholder** — until Wave 5 swaps in the stencil set, all icons remain Lucide for code-level consistency.

### Integration Points
- **`src/app/dashboard/dorm-wars/page.tsx`** — Server component fetches data, renders `<DormWarsClient {...props} />`. Phase 6 does not touch this file.
- **`src/app/dashboard/dorm-wars/DormWarsClient.tsx`** — Mounts everything from `_shared/dw/*`. The wrapping `<div style={{ backgroundColor: NV, minHeight: '100vh' }}>` (line ~413) becomes the parent of `<Grain>` + `<Vignette>` + `<HUDPod>` + the existing block sequence.
- **`src/app/dashboard/dorm-wars/hub/`** and **`src/app/dashboard/dorm-wars/rewards-mock/`** — Currently exist in git status as untracked dirs (per session-start status). Phase 6 does **not** touch these; they remain whatever state they're in. If they're meant to be live routes, the AV upgrade applies to them in a follow-up phase.

### Things to Watch
- **File size budget for `DormWarsClient.tsx`.** Target ≤ 1800 lines post-Phase-6 (down from 2003). If the composer file grows beyond 1900 during Wave 5, planner should re-evaluate which blocks to extract into `_shared/dw/blocks/` (e.g., `HeroBlock`, `LeaderboardBlock` could move out).
- **Bundle weight from audio assets.** ~11 stems × 100KB MP3 average = ~1.1MB. Lazy-load: only fetch when user clicks ENABLE AUDIO (per D-16). Ambient stems load first, stingers load on-demand per event.
- **Performance budget.** Animated grain + bloom + parallax + audio analyser running simultaneously can hit GPU/CPU. Plan a perf-test step in Wave 1 (after grain + bloom + parallax) using Chrome DevTools Performance tab; target 60fps idle scroll, ≥30fps during rank-up cutscene. If we miss, the first thing to cut is grain animation rate (24fps → 12fps cycle).
- **Photographic anchor (D-07) integration.** The duotone + grain + partial-composition treatment is mandatory. Do not let a photo land "untreated" — that single failure breaks the perception flip the whole phase is paid for.
- **`next/font/google` integration** in `layout.tsx` adds to LCP if not done carefully. Use `display: 'swap'` and subset `latin` to keep the display face from blocking render.

</code_context>

<specifics>
## Specific Ideas

- **The grain layer is the single biggest atmosphere lever.** 4-8% opacity SVG/PNG noise tile, animated by cycling between 6-8 frames at 24fps (16-24fps acceptable per perf budget). Lives as the topmost `<div>` in `DormWarsClient.tsx`, `position: fixed`, `pointer-events: none`, `z-index: 9999` below modals. Tiled (not stretched) to avoid resolution artifacts.
- **Bloom on hot OG-colored elements.** Duplicate every OG-colored element behind itself with `filter: blur(24px) saturate(1.4)` on the duplicate. Hot elements: "war." headline, OG ticker dot, cycle-clock arc, rank pill border, Daily Drop button border (pre-claim), Active Mission progress fill. NOT every OG element gets bloom — only the deliberate "hot" ones.
- **Stratified parallax targets** (from foreground to background):
  - Pinned 1.0x: HUD pod (fixed position)
  - 1.0x (normal scroll): all block content (PulseTicker through FinePrint)
  - 0.85x (mid-layer): hero radial-glow gradient, sub-headlines, the SVG concentric-circles backdrop in hero (currently lines ~675-682)
  - 0.5x (background): the anchor war-room image (D-07) once it lands in Wave 5
- **Rank-up cutscene choreography (locked):**
  1. State change detected (e.g., conversions crossed threshold).
  2. `localStorage` check: has `dw-rankup-played-${cycleStartISO}` for this rank fired this cycle? If yes, skip (one per cycle).
  3. Letterbox bars slide in from top + bottom (240ms ease-out, height 0 → 64px).
  4. World dims via fixed black overlay at 30% opacity (200ms).
  5. Stamped "PROMOTED" card lands center-screen with ink-bleed (SVG `<feMorphology>` or layered radial gradients) — scales from 0.9 to 1.04 to 1.0 (overshoot, 600ms).
  6. Stinger plays. 1.5px screen shake for 120ms.
  7. Hold 600ms.
  8. Card fades, letterbox slides out, dim lifts (320ms simultaneous).
  Total: ~1.5s.
- **Edge alert "INCOMING" strip** appears at top edge of viewport (below `<PulseTicker>`), full width, 32px tall, OG background, slides in from off-screen top (180ms), holds 3000ms with the message text, slides out (240ms). Triggers: rank drop (you fell out of top 5 in leaderboard) OR friend conversion happens during session OR Daily Drop expires unclaimed.
- **Mobile HUD pill expansion gesture** — single tap expands. No long-press, no swipe. Auto-collapse after 4s no interaction. Tapping outside collapses immediately.
- **Title-screen typed callsign** — the user's first name (from `customerCid` join) types out character-by-character at ~40ms/char with a blinking cursor `|`. Single key-click sound per character (low-volume version of the existing copy-tick from `useSound`). After full name typed, "ENTER WAR ROOM" stamps in with ink-bleed effect. Single button below: "ENTER" (large, OG-bordered).
- **Number roll spec** — tabular numerals only (`font-feature-settings: "tnum"` already set in Phase 5). Roll duration ~600ms, easing QUART_OUT. Digits change independently (only digits that change animate, not the whole number). Implement with framer-motion's `animate()` driving each digit's `y` transform.

</specifics>

<deferred>
## Deferred Ideas

Out of scope for Phase 6. Backlog candidates:

- **WebGL / Three.js animated backdrop** — full atmospheric 3D scene behind the hero. Own phase. Has perf budget implications (separate Lighthouse review needed). Recommend Phase 7 or later candidate.
- **Color-as-story palette refactor** — rivals desaturated, OG reserved exclusively for "you", lost states muted red, neutral mid-tones for inactive elements. Touches every component on dorm-wars (and possibly downstream pages). Own phase. Should follow Phase 6 because grain/bloom/HUD/cinema land color-agnostic.
- **Cross-page HUD persistence** — HUD visible across all dashboard pages. Considered and rejected for Phase 6 (D-12) to preserve dashboard-light intentional contrast. If revisited later, requires theme-adaptive HUD variants per surface.
- **Custom-commissioned assets** — human illustrator for icon set, human composer for audio stems, custom display face. Considered and rejected for Phase 6 in favor of Claude-authored / Claude-curated free sources (D-04 through D-08). Could be a quality-uplift phase once Phase 6 establishes the system.
- **Real cross-dorm leaderboard data wiring** — still deferred from Phase 5. Phase 6 inherits the same stubbed leaderboard.
- **Multi-cycle Trophy Room persistence** — deferred from Phase 5. Phase 6 inherits the same single-cycle behavior.
- **Push notifications on rank-up / cycle start** — out of scope; would require service worker and notification permission flow. Backlog.
- **Hub and rewards-mock route AV upgrades** — `src/app/dashboard/dorm-wars/hub/` and `src/app/dashboard/dorm-wars/rewards-mock/` are not touched by Phase 6. If they're meant to share the war-room identity, that's a follow-up.
- **Office Wars / portable re-skin** — Phase 5 D-24 mandate is to keep the metaphor portable in code, not to ship the re-skin. Same constraint binds Phase 6.

</deferred>

---

*Phase: 06-dorm-wars-game-feel-pass*
*Context gathered: 2026-05-15 via in-session design discussion*

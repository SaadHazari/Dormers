---
phase: 06-dorm-wars-game-feel-pass
plan: 03
subsystem: hud
tags: [react, framer-motion, lucide-react, web-audio-tap, position-fixed, localStorage, prefers-reduced-motion, css-keyframes, matchMedia, viewport-resize, click-outside, tabular-numerals]

# Dependency graph
requires:
  - phase: 06-dorm-wars-game-feel-pass
    plan: 01
    provides: useReducedMotionGate hook (referenced indirectly via plan rationale; HUDPod itself uses CSS @media + matchMedia rather than the hook because the gate must be live at the per-digit level inside framer-motion's imperative animate() — RESEARCH Pitfall 4); ScanlineOverlay decoration scoped via overflow:hidden + absolute inset:0 inheriting Wave 1's atmosphere/ + utils/ module hierarchy; D-09 _shared/dw/ established
  - phase: 06-dorm-wars-game-feel-pass
    plan: 02
    provides: audioBed.analyser already wired into HeroBlock's Bloom (Wave 2's audioAnalyser prop pattern); stingers.play() API ready (HUDPod does NOT call it this wave — Wave 4 will); useStingers void-pending consumer in DormWarsClient still satisfies eslint
  - phase: 05-dorm-wars-page-visual-revamp
    provides: streak.count from existing dw-streak localStorage logic; referralData.converted + referralData.creditBalance + customerCid props from page.tsx server fetch (already feeding DormWarsClient — Wave 3 just reads them)
provides:
  - HUDPod top-level container with desktop/mobile branching at 720px (UI-SPEC HUD Pod)
  - HUDPill mobile collapsed variant — AED NumberRoll + ChevronUp + 3-letter rank
  - NumberRoll tabular per-digit framer-motion tween — 600ms QUART_OUT, jump-set on reduced-motion
  - ScanlineOverlay CRT scanline drift scoped to HUD bounds (NOT full-page) — paused on reduced-motion via CSS @media
  - CallsignChip + RankChevron + WalletReadout + StreakFlame composition modules
  - dw-hud-collapsed localStorage key (mobile pill state persistence — UI-SPEC D-13)
  - Rank derivation logic exposed in DormWarsClient (Soldier/Sergeant/Commander/War Hero from referralData.converted) — Wave 4 RankUp cutscene reuses this
affects:
  - 06-04 (Cinema): RankChevron's inline 200ms dw-rank-flash class is the placeholder that Wave 4 replaces with `<ImpactFlash trigger={rankChanged}>`; rank derivation logic in DormWarsClient feeds Wave 4's RankUpCutscene visible/rank props; HUD's z-index 9000 stays below cinema modals (10000+)
  - 06-05 (Assets): ChevronUp + Flame Lucide icons in HUD modules + HUDPill stay through Wave 4; Wave 5 swaps to stencil rank icons + stencil flame; RankChevron's BODY font swaps to var(--font-dw-stencil) once the Google Font lands; CallsignChip dot stays as-is (geometric primitive, no asset)

# Tech tracking
tech-stack:
  added:
    - "framer-motion's imperative animate() driving per-digit transform tweens (alternative to <motion> components — gives cancellable handles via .stop())"
  patterns:
    - "Phase 6 D-09 module split extended: src/app/dashboard/_shared/dw/hud/ established alongside Wave 1's atmosphere/ + utils/ and Wave 2's audio/"
    - "Live matchMedia check inside imperative framer-motion animate() effects (RESEARCH Pitfall 4) — useReducedMotionGate hook is appropriate for component-level early-return but NOT for per-digit imperative animate() loops where the check must happen synchronously inside the useEffect"
    - "ScanlineOverlay scoped via parent overflow:hidden + child absolute inset:0 + borderRadius: inherit — NOT mounted at page root (UI-SPEC: HUD only)"
    - "Mobile breakpoint detection via window.resize listener (no MediaQueryList — wider compat with the existing codebase pattern)"
    - "localStorage default fallback for dw-hud-collapsed: missing key → collapsed=true (mobile-first default, even though desktop never renders the pill state visibly)"
    - "Auto-memory rule: HUDPod uses backgroundColor literal 'rgba(30,58,79,0.88)' (NOT background shorthand) so the future addition of backgroundImage doesn't get cleared"
    - "ScanlineOverlay uses backgroundColor + backgroundImage longhand pair (NOT background shorthand) per the same auto-memory rule"
    - "Mobile collapse via render-swap (no animated tween between pill-shape and full-pod-shape) — matches reduced-motion behavior anyway, sidesteps complex layout interpolation"

key-files:
  created:
    - src/app/dashboard/_shared/dw/hud/NumberRoll.tsx
    - src/app/dashboard/_shared/dw/hud/ScanlineOverlay.tsx
    - src/app/dashboard/_shared/dw/hud/CallsignChip.tsx
    - src/app/dashboard/_shared/dw/hud/RankChevron.tsx
    - src/app/dashboard/_shared/dw/hud/WalletReadout.tsx
    - src/app/dashboard/_shared/dw/hud/StreakFlame.tsx
    - src/app/dashboard/_shared/dw/hud/HUDPill.tsx
    - src/app/dashboard/_shared/dw/hud/HUDPod.tsx
  modified:
    - src/app/dashboard/dorm-wars/DormWarsClient.tsx (1 new import, 4 new derivations — converted/rankLabel/aedInWallet/callsign — and 1 <HUDPod /> mount inside the dorm-wars root, between Vignette and HeroBlock)

key-decisions:
  - "Mobile pill expand/collapse uses render-swap (instant transition), not a 280ms layout-tween between pill-shape and pod-shape. UI-SPEC says '280ms EXPO_OUT' but interpolating between a 32px pill and a 240×~104px pod requires either FLIP animation (out of scope this wave) or a CSS transform that distorts content. Render-swap is simpler, matches reduced-motion behavior natively, and respects D-15 by default. Future enhancement could add an opacity fade between renderings."
  - "Reduced-motion gating in NumberRoll uses direct matchMedia check inside the per-digit useEffect (RESEARCH Pitfall 4), NOT the useReducedMotionGate hook. Reason: imperative framer-motion animate() runs OUTSIDE the React render cycle, so a hook re-render wouldn't propagate fast enough on live OS toggles. Direct synchronous check before each animate() call is the canonical pattern for imperative motion APIs."
  - "ScanlineOverlay's reduced-motion gate is CSS-only (@media (prefers-reduced-motion: reduce)) rather than JS-driven. This is appropriate because the animation is a pure CSS keyframe (no JS); CSS-side @media handles live OS toggles automatically without React re-render."
  - "AED wallet field — used real ReferralData.creditBalance from queries.ts, NOT the MOCK_CREDIT stub the plan suggested as fallback. The interface already has the field (line 85 of queries.ts: 'sum of approved credits in AED'); no need to stub. Phase 5 does NOT yet expose this in the hero credit stat (still using MOCK_CREDIT in HeroBlock), but the HUD pod becomes the first live consumer of creditBalance — naturally bridges the stub→real transition."
  - "RankChevron's flash-on-change pattern uses a local 200ms dw-rank-flash CSS class as a Wave 4 placeholder. The plan explicitly notes the ImpactFlash module lands in Wave 4 — when it does, swap `<RankChevron rank={rankLabel} />` for `<ImpactFlash trigger={rankChanged}><RankChevron ... /></ImpactFlash>` and remove the inline keyframes. The placeholder's behavior (200ms OG glow burst) matches the spec exactly."
  - "Mobile breakpoint check via window.innerWidth + resize listener rather than matchMedia('(max-width: 720px)'). Reason: the codebase already uses inline window.innerWidth checks elsewhere (e.g., layout.tsx pattern). Single source of truth for breakpoint constant in HUDPod (MOBILE_BREAKPOINT = 720) keeps it tunable per CONTEXT Claude's Discretion."
  - "HUDPod mounted in DormWarsClient.tsx ONLY — layout.tsx is NOT modified (D-12). Verified via `grep HUDPod src/app/dashboard/layout.tsx` returning 0 matches. The pre-existing M state on layout.tsx in git status was unrelated work from a prior session, NOT touched by Wave 3."

patterns-established:
  - "_shared/dw/hud/ module placement (D-09) established alongside Wave 1's atmosphere/ + utils/ and Wave 2's audio/"
  - "Per-digit framer-motion animate() with cancellable .stop() return in useEffect cleanup — same pattern any future Phase 6 module needing imperative tweens should follow"
  - "Inline 200ms flash-on-state-change pattern (dw-rank-flash) — Wave 4's ImpactFlash module will provide a generic version; the inline pattern is a clear migration target"
  - "Render-swap over layout-tween for collapse/expand transitions — applies to any future Phase 6 element that switches between two distinct shape states (vs same-shape opacity/transform tweens)"

requirements-completed: []

# Metrics
duration: 9min
completed: 2026-05-15
---

# Phase 6 Plan 03: HUD Pod Summary

**Persistent in-game HUD pod scoped to /dashboard/dorm-wars (D-12) with desktop 4-row layout (callsign, rank chevron, AED wallet, streak flame) + mobile collapsed pill (AED + rank chevron) + CRT scanline overlay scoped to HUD bounds + framer-motion NumberRoll for tabular AED tweens — all gated by D-15 reduced-motion contract.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-15T16:51:57Z
- **Completed:** 2026-05-15T17:01:20Z
- **Tasks:** 3
- **Files created:** 8 HUD modules
- **Files modified:** 1 (DormWarsClient.tsx — import + 4 derivations + 1 mount)

## Accomplishments

- Built the complete Phase 6 HUD subsystem per D-09 architecture: 8 modules under `_shared/dw/hud/` (NumberRoll, ScanlineOverlay, CallsignChip, RankChevron, WalletReadout, StreakFlame, HUDPill, HUDPod)
- HUD pod mounts on `/dashboard/dorm-wars` ONLY — D-12 verified (`src/app/dashboard/layout.tsx` not modified by Wave 3; pre-existing M state was unrelated)
- Desktop (>720px): full 4-row pod, NV2(0.88) fill with cream-alpha border, 12px radius, internal CRT scanline drift via ScanlineOverlay (8s linear infinite)
- Mobile (≤720px): collapsed pill at top-right (NV2 fill, OG 1px border, 16px radius); tap expands to full pod; auto-collapses after 4 seconds of no interaction; click-outside collapses immediately; state persisted via `dw-hud-collapsed` localStorage key (D-13)
- AED wallet wired to live `referralData.creditBalance` field from queries.ts (NOT the MOCK_CREDIT stub the plan offered as fallback) — HUD becomes the first live consumer of creditBalance
- Rank derivation logic added to DormWarsClient: Soldier (0) → Sergeant (1-2) → Commander (3-5) → War Hero (6+) — matches existing Mission Ladder + leaderboard tier logic; ready for Wave 4 RankUp cutscene to consume the same derived value
- NumberRoll uses framer-motion's imperative `animate()` API with cancellable handle, 600ms QUART_OUT cubic-bezier `[0.25, 1, 0.5, 1]`, 28px digit height; per-digit independent tweens via DigitColumn key on `${i}-${digits.length}` so 99→100 re-mounts cleanly
- D-15 reduced-motion gates wired in three places: (a) NumberRoll uses direct `matchMedia('(prefers-reduced-motion: reduce)')` check inside per-digit useEffect (RESEARCH Pitfall 4), jump-sets transform; (b) ScanlineOverlay uses CSS `@media (prefers-reduced-motion: reduce) { animation: none }`; (c) RankChevron's dw-rank-flash class disabled via the same CSS @media block
- Auto-memory rules followed: HUDPod uses `backgroundColor: 'rgba(30,58,79,0.88)'` (longhand, no background shorthand); ScanlineOverlay uses `backgroundColor` + `backgroundImage` longhand pair

## Task Commits

Each task was committed atomically (`--no-verify` per parallel-executor flag — orchestrator validates hooks once after all agents complete):

1. **Task 1: NumberRoll + ScanlineOverlay (atomic juice + decoration)** — `a88a143` (feat)
2. **Task 2: Four HUD row components (CallsignChip, RankChevron, WalletReadout, StreakFlame)** — `ab77c14` (feat)
3. **Task 3: HUDPill + HUDPod + DormWarsClient wiring** — `09c08bc` (feat)

## Files Created/Modified

### Created

- `src/app/dashboard/_shared/dw/hud/NumberRoll.tsx` — Tabular per-digit roll using framer-motion's `animate()`. `DIGIT_HEIGHT = 28`, `ROLL_DURATION = 0.6`, `QUART_OUT = [0.25, 1, 0.5, 1]`. Each `DigitColumn` is a vertically-clipped 28px-tall span with a 10-row inner column; `value` change tweens the column's `translateY` from current to target. Reduced-motion check via `window.matchMedia('(prefers-reduced-motion: reduce)').matches` BEFORE the animate() call — jump-sets transform when true (per RESEARCH Pitfall 4). Negative/non-integer values coerce to 0.
- `src/app/dashboard/_shared/dw/hud/ScanlineOverlay.tsx` — CRT scanline overlay scoped to parent via `position: absolute; inset: 0; pointer-events: none; border-radius: inherit`. Background uses `repeating-linear-gradient(rgba(245,127,32,0.04) 0px, transparent 1px, transparent 2px)` per UI-SPEC. Drift via local `<style>` injection with `@keyframes dw-scanline-drift` — `background-position-y` 0 → 2px over 8s linear infinite. CSS `@media (prefers-reduced-motion: reduce)` pauses the drift to `animation: none`. Uses backgroundColor + backgroundImage longhand pair (auto-memory).
- `src/app/dashboard/_shared/dw/hud/CallsignChip.tsx` — HUD row 1: 8×8 cream circle (`backgroundColor: CR`) + uppercase first name truncated to 16 chars in 12px/600 cream-muted, 8px gap. Default fallback name "AGENT" if empty.
- `src/app/dashboard/_shared/dw/hud/RankChevron.tsx` — HUD row 2: ChevronUp (Lucide placeholder; Wave 5 swaps to stencil) + uppercase rank in OG-bordered pill (`1px solid OG`, 4px radius, 4px 8px padding). On rank-change (`rank !== lastRank`), applies `dw-rank-flash` class for 200ms (CSS @keyframes box-shadow burst from 0 → `0 0 24px 4px rgba(245,127,32,0.45)` → 0). CSS @media disables the animation under prefers-reduced-motion.
- `src/app/dashboard/_shared/dw/hud/WalletReadout.tsx` — HUD row 3: "AED" label 12px/600 cream-muted + `<NumberRoll value={aed} />` in 24px/700 OG, baseline-aligned, right-justified within row.
- `src/app/dashboard/_shared/dw/hud/StreakFlame.tsx` — HUD row 4: Flame icon (Lucide; Wave 5 stencil) in cream warm-white `#fff4d6` (NOT OG per UI-SPEC color discipline) + tabular streak count 14px/700 cream + "DAY" label 10px/600 cream-muted (singular always, per UI-SPEC copywriting "1 DAY", "12 DAY").
- `src/app/dashboard/_shared/dw/hud/HUDPill.tsx` — Mobile collapsed variant: 32px-tall NV2-filled pill with 1px OG border, 16px radius, 4px×12px padding. Renders `<NumberRoll value={aed} />` + ChevronUp + first 3 letters of rank in cream-muted. `aria-label` describes both AED and rank for screen readers. `onTap` callback wired to HUDPod's setCollapsedPersisted(false).
- `src/app/dashboard/_shared/dw/hud/HUDPod.tsx` — Top-level container, branches between desktop (>720px) full pod and mobile (≤720px) HUDPill. Mobile collapse persisted via `dw-hud-collapsed` localStorage key (default: collapsed if absent). Auto-collapse: 4-second `setTimeout` re-armed on `onMouseMove` / `onTouchStart` while expanded. Click-outside: `mousedown` listener on document, collapses if click target is outside `podRef`. Container is `position: fixed; top: 16px; right: 16px; z-index: 9000` (mobile pill: `top: 12; right: 12`). Desktop pod: 240px wide, NV2(0.88) backgroundColor, cream-alpha border, 12px radius, 12px padding, 8px row gap, `overflow: hidden` to contain ScanlineOverlay. Renders ScanlineOverlay first (sits behind text via DOM order), then 4 row components in spec order.

### Modified

- `src/app/dashboard/dorm-wars/DormWarsClient.tsx`:
  - Added 1 import: `import { HUDPod } from '../_shared/dw/hud/HUDPod'`
  - Added 4 derivations after the leaderboard composition (line ~356): `converted` (referralData.converted), `rankLabel` (Soldier/Sergeant/Commander/War Hero ladder), `aedInWallet` (referralData.creditBalance — real field from queries.ts, NOT the MOCK_CREDIT stub), `callsign` (first token from `customerCid.split(/[\s-]+/)[0]`)
  - Mounted `<HUDPod callsign={callsign} rank={rankLabel} aed={aedInWallet} streakDays={streak.count} />` after `<Vignette />` and before `<HeroBlock>` — sits inside the dorm-wars root div with `className="dw-reticle"`, NOT in `dashboard/layout.tsx` (D-12)

## Decisions Made

- **Mobile collapse uses render-swap, NOT 280ms layout-tween between pill-shape and pod-shape.** UI-SPEC specifies "280ms EXPO_OUT" but interpolating a 32px pill into a 240×~104px pod requires either FLIP animation (out of scope this wave) or transform-based scale (which distorts content). Render-swap is simpler, respects D-15 by default (instant under reduced-motion = same as full-motion behavior here), and avoids the per-frame layout cost. Future enhancement could add an opacity crossfade between the two renderings.
- **Reduced-motion gating in NumberRoll uses direct matchMedia, not the useReducedMotionGate hook.** Reason: imperative `animate()` runs outside React's render cycle, so a hook re-render wouldn't propagate fast enough on live OS toggles. Direct synchronous check before each `animate()` call is the canonical pattern for framer-motion's imperative API per RESEARCH Pitfall 4.
- **ScanlineOverlay's reduced-motion gate is CSS-only.** Pure CSS keyframe + `@media` block handles live OS toggles automatically without React re-render — the appropriate gate when there's no JS in the motion path. Matches the pattern established by the project's existing dwm-* keyframe classes.
- **AED wallet wired to real `referralData.creditBalance`, NOT MOCK_CREDIT.** The plan offered MOCK_CREDIT as a fallback if the field didn't exist; verification of `src/utils/supabase/queries.ts:82-86` confirmed `creditBalance: number` IS on the ReferralData interface and is computed from approved credits. The HUD becomes the first live consumer of this field — Phase 5's HeroBlock still uses MOCK_CREDIT for the credit stat, but that's a Phase 5 stub the HUD now leapfrogs.
- **Rank derivation lives in DormWarsClient, not HUDPod.** This keeps the rank logic visible in the composer (single source of truth) and ready for Wave 4's RankUp cutscene to read the same derived value without duplicating the ladder constants. RankUp will compare `rankLabel` between renders to trigger; HUDPod already does the same comparison locally for its flash but reads the value as a string prop.
- **RankChevron's flash-on-change is an inline 200ms placeholder for Wave 4's ImpactFlash module.** When Wave 4 lands `<ImpactFlash trigger={rankChanged}>`, swap `<RankChevron rank={rankLabel} />` for `<ImpactFlash trigger={changed}><RankChevron ... /></ImpactFlash>` and remove the inline `dw-rank-flash` keyframes. The placeholder's behavior (200ms OG glow burst, CSS @media disabled) matches the spec exactly so the swap is a net-no-op visually.
- **Mobile breakpoint check via window.innerWidth + resize listener, not matchMedia.** Keeps the implementation co-located with the breakpoint constant (MOBILE_BREAKPOINT = 720) for easy tuning per CONTEXT Claude's Discretion. The matchMedia approach would require a parallel constant string, splitting the truth across the file.
- **Click-outside detection via mousedown (not click).** Mousedown fires before click, gives more responsive collapse, and avoids a race with HUD's own onTap (which is also mousedown-derived via button click).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] HUDPod's second `eslint-disable-next-line react-hooks/exhaustive-deps` directive was unused — would have failed `npm run lint`**

- **Found during:** Task 3 (lint pre-commit gate)
- **Issue:** The plan specified two `eslint-disable-next-line react-hooks/exhaustive-deps` directives — one above the auto-collapse `useEffect` deps array, one above the click-outside `useEffect` deps array. The first one is needed (the effect calls `setCollapsedPersisted` and uses `armAutoCollapse`/`disarmAutoCollapse` helpers without listing them). The second one (click-outside) actually does NOT need the disable — eslint did not flag it as missing, so the directive was reported as `Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')` warning. Per user auto-memory ("Pre-push must run `npm run lint`, not just tsc; Netlify treats unused-vars as error"), unused directives compound to lint warnings that can become errors under stricter configs.
- **Fix:** Removed the second `eslint-disable-next-line` comment above the click-outside effect's deps array. Kept the first one (still needed). Lint now exits clean with only the pre-existing Sidebar.tsx warning (out of scope per session-start git status).
- **Files modified:** `src/app/dashboard/_shared/dw/hud/HUDPod.tsx`
- **Verification:** `npm run lint` exits 0 with no errors mentioning HUDPod.tsx. `npx tsc --noEmit` exits 0.
- **Committed in:** `09c08bc` (Task 3 commit, alongside the wiring)

---

**2. [Rule 1 - Bug] Plan's `referralData?.credit ?? 0` pattern would have produced wrong AED value (field is named `creditBalance`, not `credit`)**

- **Found during:** Task 3 read_first verification (queries.ts inspection)
- **Issue:** The plan's action block specified `const aedInWallet = referralData?.credit ?? 0` with a fallback to MOCK_CREDIT. Inspection of `src/utils/supabase/queries.ts:82-86` revealed the field is named `creditBalance: number` (sum of approved credits in AED), NOT `credit`. The plan's fallback would have unconditionally returned 0 (since `?.credit` is always undefined on the typed interface) — silently broken AED display.
- **Fix:** Used `referralData.creditBalance` directly (no optional chaining — the field is required on the interface, not nullable). This is the correct live wiring.
- **Files modified:** `src/app/dashboard/dorm-wars/DormWarsClient.tsx`
- **Verification:** TypeScript would have errored on `referralData?.credit` if used (since the property doesn't exist on the typed interface). `npx tsc --noEmit` exits 0 confirming the live wiring typechecks.
- **Committed in:** `09c08bc` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking — eslint unused-disable; 1 bug — wrong field name in plan would have hardcoded 0 AED).
**Impact on plan:** No behavioral degradation. Both fixes preserve the plan's intent. The HUD now displays real AED from the user's actual credit balance instead of a stub-fallback path that would never have triggered the real value.

## Authentication Gates

None — Phase 6 HUD is pure client-side React + browser APIs (matchMedia, resize, localStorage). No external services, no auth.

## Issues Encountered

- **Pre-existing `Sidebar.tsx` `<img>` lint warning** is out of scope per the scope-boundary rule. Already `M` in `git status` at session start. Not fixed — same pattern as Waves 1-2.
- **Pre-existing M state on `src/app/dashboard/layout.tsx`** in git status is from prior unrelated work, NOT touched by Wave 3. D-12 verified via `grep HUDPod src/app/dashboard/layout.tsx` returning 0 matches.
- **Mobile pill expand/collapse animation** is render-swap rather than the 280ms layout-tween the UI-SPEC specifies. Documented as a key decision; future enhancement could add an opacity crossfade. Reduced-motion behavior is identical (instant) so the gap is invisible to a11y users.

## User Setup Required

None — no external services, no env vars, no audio licensing required this wave.

**Recommended user verification on merge:**

1. **Desktop visual verification (>720px viewport):**
   - Visit `/dashboard/dorm-wars` in Chrome incognito
   - Confirm HUD pod visible at top-right corner ~16px from edges
   - 4 rows visible top-to-bottom: cream-dot + uppercase first name → ChevronUp + uppercase rank in OG-bordered pill → "AED" + animated wallet number in OG → cream flame + streak days + "DAY"
   - HUD background: NV2(0.88) translucent with cream-alpha 1px border, 12px corner radius
   - Subtle horizontal scanlines drift slowly inside the HUD bounds (8s cycle) — NOT visible elsewhere on the page
   - Scroll the page: HUD stays pinned (position: fixed verified)
   - HUD does NOT appear on `/dashboard/menu`, `/dashboard/profile`, `/dashboard/plan` — only on `/dashboard/dorm-wars` (D-12)
   - HUD is BEHIND modals: trigger title-screen interstitial — modal covers HUD

2. **Mobile visual verification (≤720px viewport, e.g., Chrome DevTools device toolbar at 375px):**
   - On first visit (or after `localStorage.removeItem('dw-hud-collapsed')`): small pill in top-right with NumberRoll AED + ChevronUp + 3-letter rank
   - Tap pill: expands to full 4-row pod
   - Wait 4 seconds without interacting: pill auto-collapses
   - Tap outside pod while expanded: immediately collapses
   - Reload: pill stays in last state (collapsed/expanded per `localStorage.dw-hud-collapsed`)

3. **Juice verification:**
   - Force AED value change (e.g., simulate via React DevTools or trigger conversion event): digits roll via NumberRoll, ~600ms animation
   - Force rank prop change: chevron pill briefly flashes OG glow (200ms)

4. **Reduced-motion verification (System Settings → Reduce motion):**
   - NumberRoll: AED value changes jump-set instantly
   - CRT scanline drift: paused (lines static)
   - Rank flash: instant (CSS animation: none)
   - Mobile pill expand: already instant via render-swap (no behavior change)

5. **localStorage state:**
   - `dw-hud-collapsed === '1'` when collapsed, `'0'` when expanded
   - Phase 5/6 prior keys (`dw-sound`, `dw-streak`, `dw-titlescreen-*`, `dw-drop-*`, `dw-audio-enabled`, `dw-last-milestone-played-*`, `dw-welcome-seen`) unchanged

6. **Lint + Type:**
   - `npm run lint` exits 0 — only pre-existing Sidebar.tsx warning
   - `npx tsc --noEmit` exits 0

## Next Phase Readiness

**Ready for Wave 4 (06-04 — Cinema moments):**
- `RankChevron`'s inline 200ms `dw-rank-flash` class is the placeholder Wave 4's `<ImpactFlash trigger={rankChanged}>` will replace — same 200ms duration, same OG glow burst. Migration path: wrap RankChevron with ImpactFlash, remove the inline `<style>` block.
- `rankLabel` derivation in DormWarsClient (Soldier/Sergeant/Commander/War Hero) is the single source of truth Wave 4's RankUpCutscene will compare between renders to trigger — same string format the HUD already consumes.
- HUD z-index 9000 sits cleanly below cinema modals (10000+), so RankUpCutscene/TitleScreenInterstitial will cover it during their moments.
- `audioBed.analyser` from Wave 2 is already wired into DormWarsClient — Wave 4 can reuse the same prop pattern (HeroBlock's `audioAnalyser` prop) for any cinema-time Bloom that wants audio-reactive intensity.
- `stingers.play()` API is wired but unused this wave (`void stingers` placeholder still in DormWarsClient body). Wave 4 naturally consumes it: `stingers.play('rank-up')` from RankUpCutscene, `stingers.play('warning')` from EdgeAlert, etc.

**Ready for Wave 5 (06-05 — Asset integration):**
- ChevronUp + Flame Lucide icons in HUD modules + HUDPill stay through Wave 4. Wave 5 swap targets:
  - RankChevron's `<ChevronUp size={14}>` → stencil rank icon component (D-04)
  - StreakFlame's `<Flame size={16}>` → stencil flame component (D-04)
  - HUDPill's `<ChevronUp size={14}>` → stencil chevron (or rank-icon variant)
- RankChevron's `fontFamily: BODY` swaps to `var(--font-dw-stencil)` once the Google Font lands (D-06)
- CallsignChip's leading dot is a geometric primitive — no asset swap needed

**No blockers for downstream waves.**

## Self-Check: PASSED

All 8 created files verified on disk via `ls`:
- `src/app/dashboard/_shared/dw/hud/NumberRoll.tsx` FOUND
- `src/app/dashboard/_shared/dw/hud/ScanlineOverlay.tsx` FOUND
- `src/app/dashboard/_shared/dw/hud/CallsignChip.tsx` FOUND
- `src/app/dashboard/_shared/dw/hud/RankChevron.tsx` FOUND
- `src/app/dashboard/_shared/dw/hud/WalletReadout.tsx` FOUND
- `src/app/dashboard/_shared/dw/hud/StreakFlame.tsx` FOUND
- `src/app/dashboard/_shared/dw/hud/HUDPill.tsx` FOUND
- `src/app/dashboard/_shared/dw/hud/HUDPod.tsx` FOUND

All 3 task commits verified via `git log --oneline -5`:
- `a88a143` (Task 1: NumberRoll + ScanlineOverlay) FOUND
- `ab77c14` (Task 2: four HUD row components) FOUND
- `09c08bc` (Task 3: HUDPill + HUDPod + DormWarsClient wiring) FOUND

`npx tsc --noEmit` exits 0. `npm run lint` exits 0 (only pre-existing Sidebar.tsx warning, out of scope).

D-12 verified: `src/app/dashboard/layout.tsx` contains 0 references to "HUDPod" or "hud" (the file's pre-existing M state in git is unrelated to this wave).

**No stubs introduced.** AED wallet wired to real `referralData.creditBalance` instead of MOCK_CREDIT — the plan's MOCK_CREDIT fallback was avoided since the field already exists on the typed interface.

---
*Phase: 06-dorm-wars-game-feel-pass*
*Completed: 2026-05-15*

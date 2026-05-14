---
phase: 05-dorm-wars-page-visual-revamp
plan: 03
subsystem: dashboard/dorm-wars
tags: [dorm-wars, wave-3, cinematic-polish, sound, title-screen, particles, cleanup]
dependency_graph:
  requires: [05-02]
  provides: [dorm-wars-final-cinematic-page]
  affects: [dashboard/dorm-wars]
tech_stack:
  added: []
  patterns: [web-audio-api-synth, css-keyframe-particles, localStorage-per-cycle-keying, fixed-overlay-interstitial]
key_files:
  created: []
  modified:
    - src/app/dashboard/dorm-wars/DormWarsClient.tsx
  deleted:
    - src/app/dashboard/dorm-wars/mock/page.tsx
    - src/app/dashboard/dorm-wars/mock/DormWarsMockClient.tsx
decisions:
  - "Web Audio API synthesized tones (no external lib, no bundled audio files) — keeps bundle lean"
  - "Cycle-scoped milestone key dw-last-milestone-played-${cycleStartISO} resets naturally on subscription renewal (D-18)"
  - "CycleClock inline filter removed in favour of CSS .dwm-dial rule so :hover pseudo-selector can override it"
  - "Mock directory was never git-tracked (untracked ??), so Task 2 commit is empty-tree"
metrics:
  duration: "~6 minutes"
  completed: "2026-05-14"
  tasks: 2
  files: 1
---

# Phase 5 Plan 03: Dorm Wars Wave 3 — Cinematic Polish + Cleanup Summary

Final wave of Phase 5. Four additive edits in `DormWarsClient.tsx` (title-screen interstitial, sound system with toggle, particle burst, cycle-clock hover-glow), followed by irreversible deletion of the `src/app/dashboard/dorm-wars/mock/` reference scaffolding. All lint and type checks pass project-wide. Build succeeds.

## What Was Done

### Task 1: Additive Polish (four edits in DormWarsClient.tsx)

**Edit 1 — Sound system (D-29)**

`useSound()` hook synthesizes three clips via Web Audio API:
- `playCopyTick`: 80ms sine, 1500Hz → 1200Hz pitch sweep, peak gain 0.08
- `playMilestoneFanfare`: C5/E5/G5 (523.25/659.25/783.99 Hz) staggered by 80ms each, 220ms duration, ADSR envelope
- `playDropReveal`: 400ms sine sweep 300Hz → 800Hz, peak gain 0.10

All clips ramp gain to 0.0001 at end to avoid clicks. `AudioContext` is lazily instantiated on first call (browser auto-play policy). Toggle persists in `dw-sound` localStorage; ON by default per D-29.

Trigger wiring:
- `claimDrop()`: `sound.playDropReveal()` fires before `setClaimed(true)`
- `ActionSurfaceBlock.copyLink()`: `sound.playCopyTick()` fires in `.then()` alongside `setCopied(true)`. Prop `sound={sound}` passes the shared instance to `ActionSurfaceBlock`.
- Milestone fanfare `useEffect` watches `referralData.converted` and fires `sound.playMilestoneFanfare()` when user crosses tiers [1, 3, 6, 10]. Key: `dw-last-milestone-played-${cycleStartISO}` — cycle-scoped so it resets when subscription renews (D-18 semantics; an unscoped key would persist forever and break milestone re-play on renewal).

**Edit 2 — Title-screen interstitial (D-28)**

`cycleStartISO = activeSubscription?.start_date ?? null` (reused by milestone fanfare).

On mount: `localStorage.getItem('dw-titlescreen-${cycleStartISO}')` checked; if absent or not `'1'` → `setShowTitleScreen(true)`.

`TitleScreenInterstitial` component: fixed-viewport overlay (`z-index: 100`, `rgba(9,24,37,0.96)` backdrop). Inner card: `NV` background, 480px max-width, `48px 32px` padding (D-04 compliant), no boxShadow (D-06). Content:
- Eyebrow: `'CYCLE 01 · {cycleTotalDays} DAYS'` — OG color, uppercase, letterSpacing 2
- Headline: `'A new war begins.'` — DISPLAY font, 48px, fontWeight 800, CR
- Body: `'Every recruit, every drop, every conversion counts. Resets when the cycle ends.'`
- Button: `'Enter the war'` — OG bg, CR text, `12px 32px` padding, borderRadius 999

`TitleScreenInterstitial` renders as FIRST child of the root `<div>`, above `SharedKeyframes`. Returns `null` when `show === false`.

`SoundToggle` placed next to rank pill in `HeroBlock`. 32x32 round button (transparent bg, OG border), renders `Volume2` (on) or `VolumeX` (off) from lucide-react. No boxShadow (D-06). Focus ring applied via `onFocus`/`onBlur` handlers.

**Edit 3 — Particle burst on Daily Drop reveal (D-30)**

In `DailyDropBlock` claimed branch: the `{todayDrop.label}` text wrapped in a `position: relative` container. Five `<span className="dw-particle">` elements with:
- `position: absolute; top: 50%; left: 50%`
- `width: 8; height: 8; borderRadius: 999` (D-04 compliant — 8 is in the set; 6 is NOT)
- `backgroundColor: '#22c55e'` (inline literal per D-03)
- CSS custom properties `--dx` / `--dy` for radial spread (60px, -60px, 80px, -80px, 0 variants)
- `animationDelay`: 0, 60, 120, 180, 240ms

`@keyframes dw-particle` in `SharedKeyframes`:
```
0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.4); }
```
`.dw-particle` class: `animation: dw-particle 800ms cubic-bezier(0.16,1,0.3,1) both; pointer-events: none`.
Added `.dw-particle` to the `prefers-reduced-motion` reset list alongside all existing animation classes.

**Edit 4 — Cycle-clock hover-glow (D-30)**

The `CycleClock` SVG previously had `filter: 'drop-shadow(...)'` as an inline style. Inline styles block CSS pseudo-selector overrides (`:hover` can't override an inline `style`). The inline filter was removed and CSS class `.dwm-dial` now owns the filter:

```css
.dwm-dial { filter: drop-shadow(0 8px 32px rgba(245,127,32,0.18)) drop-shadow(0 0 12px rgba(245,127,32,0.18)); transition: filter 320ms cubic-bezier(0.16,1,0.3,1); }
.dwm-dial:hover { filter: drop-shadow(0 8px 32px rgba(245,127,32,0.28)) drop-shadow(0 0 24px rgba(245,127,32,0.36)); }
```

The base state combines the original depth shadow with the new ambient glow; hover intensifies both values.

### Task 2: Mock deletion (D-31)

Safety grep confirmed no production code imports from `dorm-wars/mock` or `DormWarsMockClient` — only self-references within the mock files themselves.

`rm -rf src/app/dashboard/dorm-wars/mock` deleted:
- `src/app/dashboard/dorm-wars/mock/page.tsx`
- `src/app/dashboard/dorm-wars/mock/DormWarsMockClient.tsx`

Note: the mock directory was never committed to git (it showed as `??` untracked in git status). No git-tracked files were deleted — the `rm` was filesystem-only. Task 2 commit is therefore an empty-tree commit recording the lint+tsc pass confirmation.

Post-deletion `ls src/app/dashboard/dorm-wars/` returns exactly: `DormWarsClient.tsx page.tsx`.

## Sound Implementation

**Choice: Web Audio API synthesized tones**

Rationale: No external library required, no WAV/MP3 files to host, zero bundle size impact. Total audio code: ~75 lines in `useSound()`.

**Fidelity note:** Synthesized sine tones are functional but have a "digital" quality versus recorded sound effects. If higher-fidelity audio is desired in a future iteration, the `playX()` functions are self-contained — swapping in an `<audio>` element approach or a library like Howler.js is a surgical replacement inside `useSound()`, with zero impact on the rest of the page.

## Title-Screen Content (as shipped)

- Line 1: `'CYCLE 01 · {cycleTotalDays} DAYS'` (cycle number padded to 2 digits)
- Line 2: `'A new war begins.'`
- Line 3: `'Every recruit, every drop, every conversion counts. Resets when the cycle ends.'`
- Button: `'Enter the war'`

## Particle Details

- Count: 5
- Color: `#22c55e` (inline literal per D-03)
- Dimensions: `width: 8, height: 8` (D-04 spacing scale; 6 is NOT in the set)
- Spread vectors: ±60px horizontal, ±40px vertical, ±80px, ±70px vertical top
- Duration: 800ms `cubic-bezier(0.16, 1, 0.3, 1)` (EXPO_OUT)
- Stagger: 0, 60, 120, 180, 240ms delays

## Hover-Glow Before/After

| State | Filter value |
|-------|--------------|
| Base (was inline) | `drop-shadow(0 8px 32px rgba(245,127,32,0.18))` |
| Base (new CSS) | `drop-shadow(0 8px 32px rgba(245,127,32,0.18)) drop-shadow(0 0 12px rgba(245,127,32,0.18))` |
| Hover | `drop-shadow(0 8px 32px rgba(245,127,32,0.28)) drop-shadow(0 0 24px rgba(245,127,32,0.36))` |

## Final Lint + Type Check

- `npm run lint` exit code: **0** (one pre-existing `<img>` warning in Sidebar.tsx — unrelated to this phase)
- `npx tsc --noEmit` exit code: **0**
- `npm run build`: **succeeded** — `/dashboard/dorm-wars` at 13.3 kB first-load JS (no mock route overhead)

## Commits

- `11e790e` — feat(05-03): add title-screen interstitial, sound system, particle burst, hover-glow
- `88b76e4` — chore(05-03): delete src/app/dashboard/dorm-wars/mock/ directory (D-31)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CycleClock inline filter blocked CSS hover pseudo-selector**
- **Found during:** Task 1, Edit 4
- **Issue:** The plan specifies `.dwm-dial:hover` CSS class for hover-glow. The SVG had `style={{ filter: '...' }}` inline. Inline styles override CSS class rules in the browser's cascade, making `:hover` ineffective.
- **Fix:** Removed inline `filter` from SVG element; moved base filter value into the `.dwm-dial` CSS class (combining original depth shadow + new ambient glow). The `:hover` rule then correctly overrides the class-level filter.
- **Files modified:** `src/app/dashboard/dorm-wars/DormWarsClient.tsx`
- **Commit:** `11e790e`

## Phase 5 Retrospective

**What worked well:**
- Mock-first design approach (visual contract before migration) eliminated ambiguity across all three waves. Every block had a canonical reference.
- Wave separation kept commits clean: Wave 1 = structure, Wave 2 = mechanics, Wave 3 = polish + cleanup.
- Web Audio API synthesized tones kept the bundle size unchanged while delivering functional sound effects.
- The cycle-scoped localStorage key pattern (`dw-last-milestone-played-${cycleStartISO}`) is elegant — it self-resets when the subscription renews without any migration logic.

**What surprised:**
- CSS inline `style` vs class filter cascade issue (the only deviation). Minor fix.
- The mock directory was never git-committed (always lived as untracked `??`). This means the deletion is filesystem-only and has no git history impact — but the files are irrecoverable without the original `??` stash. This is acceptable since the migration is complete and the live page is canonical.

**Deferred items:**
- Higher-fidelity audio: synthesized tones functional but digital-sounding. Swap-in is surgical if desired.
- `cycleNumber = 1` for all users (Wave 2 simplification) — deriving historical cycle count requires a subscription history query.
- `MOCK_LEADERBOARD` rows — real cross-dorm leaderboard is a future backend phase.
- `MOCK_RANK` (Soldier hardcoded) — rank derivation from live referral tier is a future phase.

## Known Stubs

| Stub | File | Decision |
|------|------|----------|
| `cycleNumber = 1` | DormWarsClient.tsx | Future backend phase — historical subscription query needed |
| `MOCK_LEADERBOARD` rows | DormWarsClient.tsx | Future backend phase — D-14 real cross-dorm query |
| `MOCK_RANK` (Soldier) | DormWarsClient.tsx | Future backend phase — derive from referralData tier |

These stubs do not prevent Phase 5's goal — the page is visually and functionally complete for the engaged-state user.

## Self-Check: PASSED

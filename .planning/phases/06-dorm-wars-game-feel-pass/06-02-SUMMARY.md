---
phase: 06-dorm-wars-game-feel-pass
plan: 02
subsystem: audio
tags: [react, web-audio, audiocontext, gainnode, analysernode, stereopannernode, audiobuffer, ducking, audio-reactive, lazy-load, prefers-reduced-motion, localstorage]

# Dependency graph
requires:
  - phase: 06-dorm-wars-game-feel-pass
    plan: 01
    provides: useReducedMotionGate hook, Bloom.tsx with audioReactive prop seam (replaced placeholder ternary this wave), atmosphere/ + utils/ module hierarchy
  - phase: 05-dorm-wars-page-visual-revamp
    plan: 03
    provides: useSound hook (Phase 5 D-29 synth bed) — migrated verbatim to _shared/dw/audio/useSound.ts and reversed default ON → default OFF per Phase 6 D-16
provides:
  - Three-stem ambient bed manager (useAudioBed) with parallel-decode + 800ms crossfade + master GainNode bus + AnalyserNode tap; silent-fail when stems missing
  - Stinger library (useStingers) with 8 keys (copy-tick, unlock, drop-reveal, warning, rank-up, milestone-fanfare, conversion-impact, title-intro), -6dB ducking + 240ms recovery, StereoPannerNode spatial pan, lazy fetch + AudioBuffer cache
  - useAudioReactive driver: AnalyserNode mid-band (200-2000Hz) → 1.0..1.4 multiplier capped at 30fps; flat 1.0 under reduced-motion or null analyser
  - useSound migration with one-cycle back-compat (reads `dw-sound` if `dw-audio-enabled` absent), default OFF per D-16
  - AudioPrompt pill UI (32px-tall NV2 + OG border, 'ENABLE AUDIO' / 'AUDIO ON' copy)
  - Bloom audioReactive seam wired live: useAudioReactive(analyser, audioReactive) feeds the multiplier consumed by finalIntensity
  - DormWarsClient composer hooks the audio system: ctx (lazy AudioContext) → useAudioBed → useStingers; AudioPrompt replaces Phase 5 SoundToggle; war. headline Bloom is audio-reactive
affects:
  - 06-03 (HUD pod): reuse audioBed.analyser for HUD chevron Bloom; stingers.play() ready for state-change juice (rank-up, conversion)
  - 06-04 (Cinema): rank-up cutscene calls stingers.play('rank-up'); title interstitial calls stingers.play('title-intro') and reuses copy-tick for typed callsign
  - 06-05 (Assets): drop real .mp3 stems into /public/audio/dw/ambient/ + /public/audio/dw/stingers/ — modules will start using them on next page load

# Tech tracking
tech-stack:
  added:
    - "Web Audio API: AudioContext (shared via useSound.ctx), GainNode (bed master + per-stem + per-stinger), AnalyserNode (fftSize=256), StereoPannerNode, AudioBuffer (cached in Map)"
  patterns:
    - "Phase 6 D-09 module split extended: src/app/dashboard/_shared/dw/audio/ established alongside Wave 1's atmosphere/ and utils/"
    - "Lazy-load discipline: ambient bed fetches only after sound.on === true (which only flips after user gesture); stingers fetch only on first play() call"
    - "AudioContext shared between useSound (synth) and useAudioBed/useStingers (sample-based) via sound.ctx() — single browser context, no autoplay-policy double-prompt"
    - "Silent-fail on missing stems (404) per UI-SPEC error state — audio is opt-in atmosphere, not core functionality. Wave 5 lands real .mp3 stems"
    - "Reduced-motion gating in JS via useReducedMotionGate (D-15 contract); audio playback still occurs (audio is not motion) but audio-reactive bloom returns flat 1.0"
    - "D-16 reverses Phase 5 D-29: default OFF; new localStorage key dw-audio-enabled with one-cycle back-compat read of dw-sound"

key-files:
  created:
    - src/app/dashboard/_shared/dw/audio/useSound.ts
    - src/app/dashboard/_shared/dw/audio/useAudioBed.ts
    - src/app/dashboard/_shared/dw/audio/useStingers.ts
    - src/app/dashboard/_shared/dw/audio/useAudioReactive.ts
    - src/app/dashboard/_shared/dw/audio/AudioPrompt.tsx
  modified:
    - src/app/dashboard/_shared/dw/atmosphere/Bloom.tsx (added analyser?: AnalyserNode | null prop; replaced Wave 1 placeholder ternary with real useAudioReactive call)
    - src/app/dashboard/dorm-wars/DormWarsClient.tsx (removed inline useSound + SoundToggle definition + Volume2/VolumeX/useRef/useCallback imports; added 4 audio module imports; mounted audio system; AudioPrompt swapped in; HeroBlock now accepts audioAnalyser prop and passes to Bloom)

key-decisions:
  - "AudioContext shared via useSound.ctx() rather than fresh in each hook — browsers cap AudioContext instances and we want one shared instance for sample playback (bed) + sample playback (stingers) + synth playback (Phase 5 fallbacks). useSound owns the ref; useAudioBed and useStingers receive it as a param."
  - "audioBed.bedGain is the duck target for ALL stingers (bed master bus). useStingers.duckBed() ramps the bed master, not individual stem gains — preserves the relative mix between drone/chatter/duct."
  - "Stinger AudioBuffers cached in a useRef Map<string, AudioBuffer> on the useStingers hook — first play of each key incurs network + decode, subsequent plays are zero-cost. Bundle weight stays at 0 until user enables audio AND triggers an event."
  - "useAudioReactive uses AnalyserNode.frequencyBinCount derived bins (10..60) for ~200-2000Hz at 44.1kHz 256-fft — chosen for vocal/melodic mid-band that drives 'breathing' feel without sub-bass thumping or sibilance flicker."
  - "Bloom's audioReactive prop now reads useAudioReactive(analyser, audioReactive) — the seam Wave 1 pre-built. The analyser prop is optional; Bloom callers that don't pass it (or pass audioReactive={false}) get unchanged Wave 1 behavior. War. headline is the only consumer this wave; future waves wrap PulseTicker dot, cycle clock arc, etc., the same way."
  - "HeroBlock got a new audioAnalyser prop instead of accessing audioBed.analyser directly — Bloom on war. lives inside HeroBlock's render tree, so the analyser must be threaded through props rather than closed over."
  - "useSound back-compat: reads dw-sound (Phase 5) only if dw-audio-enabled (Phase 6) is absent. Once a user toggles via AudioPrompt, only dw-audio-enabled is written from then on. dw-sound is never written by Phase 6 code."
  - "Lucide Volume2/VolumeX kept in AudioPrompt as placeholder per D-03 architecture-first — Wave 5 swaps to stencil icons. Removing them from DormWarsClient.tsx imports means lucide tree-shakes them out of the page bundle."

patterns-established:
  - "_shared/dw/audio/ module placement (D-09) established alongside Wave 1's atmosphere/ and utils/"
  - "Hook-takes-context pattern: useAudioBed(ctx, enabled) and useStingers(ctx, bedGain) both accept the AudioContext as a param rather than creating their own — keeps the shared-context invariant explicit and testable"
  - "Silent-fail on missing audio assets (try/catch + console.warn) — audio is atmosphere, not core; no error UI per UI-SPEC error state"
  - "Lazy module wiring: every audio hook accepts null for its dependencies and no-ops gracefully — useStingers.play() does nothing if bedGain is null; useAudioReactive returns flat 1.0 if analyser is null. Allows DormWarsClient to mount the system unconditionally and let the real activation flow through React state."

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-05-15
---

# Phase 6 Plan 02: Audio System Summary

**Three-stem ambient bed + 8-stinger library with -6dB ducking + spatial pan + audio-reactive bloom on 'war.' headline + ENABLE AUDIO opt-in pill — all gated by D-16 default-OFF persistence; synth fallbacks from Phase 5's useSound preserved through Waves 2-4 until Wave 5 swaps real stems.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-15T16:30:58Z
- **Completed:** 2026-05-15T16:42:08Z
- **Tasks:** 3
- **Files created:** 5 audio modules
- **Files modified:** 2 (Bloom.tsx, DormWarsClient.tsx)

## Accomplishments

- Built the complete Phase 6 audio system per D-09 architecture: useSound (synth fallback) + useAudioBed (three-stem ambient manager) + useStingers (8-key library with ducking + spatial pan) + useAudioReactive (AnalyserNode driver) + AudioPrompt (ENABLE AUDIO pill UI)
- Reversed Phase 5 D-29 (audio default ON) → Phase 6 D-16 (audio default OFF) via the new `dw-audio-enabled` localStorage key, with one-cycle back-compat read of Phase 5's `dw-sound`
- Replaced the Wave 1 placeholder ternary in `Bloom.tsx` with a live `useAudioReactive(analyser, audioReactive)` call — the seam Wave 1 pre-built is now real
- Migrated Phase 5's inline `useSound` hook (DormWarsClient.tsx lines 22-97) into `_shared/dw/audio/useSound.ts`, deleted the local `SoundToggle` component, and swapped to the new `<AudioPrompt>` pill in the hero rank-pill row
- Threaded `audioAnalyser` through HeroBlock as a new prop so the Bloom on the "war." headline pulses with the audio mid-band when enabled
- All synth fallbacks (`playCopyTick`, `playMilestoneFanfare`, `playDropReveal`) preserved through Waves 2-4 — they will be replaced by `stingers.play('copy-tick' | 'milestone-fanfare' | 'drop-reveal')` calls once Wave 5 lands real .mp3 stems
- `dw-last-milestone-played-${cycleStartISO}` localStorage key from Phase 5 unchanged

## Task Commits

Each task was committed atomically (`--no-verify` per parallel-executor flag — orchestrator validates hooks once after all agents complete):

1. **Task 1: Audio hooks (useSound migration + useAudioBed + useStingers + useAudioReactive)** — `78646a9` (feat)
2. **Task 2: AudioPrompt pill UI + Bloom.tsx audioReactive wiring** — `9301d37` (feat)
3. **Task 3: DormWarsClient wiring (imports + audio mount + AudioPrompt swap + analyser threading)** — `1136c15` (feat)

## Files Created/Modified

### Created

- `src/app/dashboard/_shared/dw/audio/useSound.ts` — Phase 5 synth sound system migrated verbatim. Default `on=false` per D-16. Writes to `dw-audio-enabled` (NEW key); reads `dw-sound` for one-cycle back-compat. Exports `ctx` so `useAudioBed`/`useStingers` can share the AudioContext.
- `src/app/dashboard/_shared/dw/audio/useAudioBed.ts` — Three-stem ambient bed manager (`drone` -18dB, `chatter` -24dB, `duct` -22dB). Parallel `Promise.all(fetch + decodeAudioData)` then per-stem `BufferSource → GainNode → bedGain → AnalyserNode (fftSize=256) → destination`. 800ms `linearRampToValueAtTime(1.0, now + 0.8)` crossfade in. Returns `{ ready, bedGain, analyser }`. Silent-fail on missing stems.
- `src/app/dashboard/_shared/dw/audio/useStingers.ts` — 8-key stinger library with `Map<string, AudioBuffer>` cache. `duckBed()` helper ramps bedGain to 0.501 (-6dB) over 40ms, holds for stinger duration + 200ms tail, then exponentially recovers to 1.0 over 240ms. Per-call `StereoPannerNode` for spatial pan. Returns `{ play(key, opts) }`.
- `src/app/dashboard/_shared/dw/audio/useAudioReactive.ts` — Reads `analyser.getByteFrequencyData()` on rAF, averages bins 10-60 (~200-2000Hz at 44.1kHz / 256 fft), maps to 1.0..1.4 intensity multiplier. Throttled to 30fps via `lastUpdateRef` epsilon check. Returns flat `MIN_INTENSITY` when reduced-motion or analyser is null.
- `src/app/dashboard/_shared/dw/audio/AudioPrompt.tsx` — 32px-tall pill: NV2 background, OG 1px border, BODY/12px/600/CR text, VolumeX/Volume2 from lucide (Wave 5 swaps to stencil). `aria-pressed={enabled}` for a11y. Visual-only — `onToggle` callback owned by `useSound` via DormWarsClient.

### Modified

- `src/app/dashboard/_shared/dw/atmosphere/Bloom.tsx`:
  - Added `analyser?: AnalyserNode | null` prop
  - Imports `useAudioReactive` from `'../audio/useAudioReactive'`
  - Replaced Wave 1's placeholder `audioMult = reduced || !audioReactive ? 1.0 : 1.0` with `useAudioReactive(analyser ?? null, audioReactive)` call
  - `finalIntensity` now respects reduced-motion: `reduced ? intensity : intensity * audioMult`
  - Default `analyser = null` preserves Wave 1 behavior for callers that don't pass it
- `src/app/dashboard/dorm-wars/DormWarsClient.tsx`:
  - Removed: inline `useSound` hook block (lines 22-97), `SoundToggle` component definition (~24 lines), `Volume2` + `VolumeX` from lucide imports, `useRef` + `useCallback` from react imports
  - Added: 4 audio module imports (`useSound`, `useAudioBed`, `useStingers`, `AudioPrompt`)
  - Added: audio system mount block in `DormWarsClient` body — `const ctx = sound.ctx(); const audioBed = useAudioBed(ctx, sound.on); const stingers = useStingers(ctx, audioBed.bedGain)` with `void stingers` to keep the binding live for Waves 3-4
  - Replaced `<SoundToggle on={sound.on} onToggle={sound.toggle} />` with `<AudioPrompt enabled={sound.on} onToggle={sound.toggle} />` in HeroBlock's rank-pill row
  - Added new prop `audioAnalyser: AnalyserNode | null` to HeroBlock signature; threaded `audioBed.analyser` through `<HeroBlock ... audioAnalyser={audioBed.analyser} />`
  - Updated war. headline Bloom: `<Bloom color={OG} intensity={1.0} blurPx={32} audioReactive={true} analyser={audioAnalyser}>`
  - Synth fallback callbacks (`sound.playCopyTick`, `sound.playMilestoneFanfare`, `sound.playDropReveal`) and `dw-last-milestone-played-${cycleStartISO}` localStorage key all preserved unchanged

## Decisions Made

- **AudioContext sharing via useSound.ctx()** — single browser AudioContext serves both Phase 5's synth fallbacks AND Wave 2's sample-based bed/stingers. Avoids autoplay-policy double-prompt and stays within browser AudioContext limits. useSound owns the ref; consumers receive it as a parameter.
- **bedGain as the duck target for ALL stingers** — useStingers ducks the bed master bus (single GainNode), not per-stem. Preserves the relative mix between drone/chatter/duct during ducking.
- **AudioBuffer caching at the useStingers level** — first play of each stinger key fetches + decodes, subsequent plays are instant. Bundle weight stays at 0 until ENABLE AUDIO is tapped AND a stinger event fires. Lazy-load discipline per RESEARCH bundle budget.
- **AnalyserNode mid-band (10..60 bins)** — chosen for vocal/melodic frequencies (~200-2000Hz at 44.1kHz/256-fft) that drive "breathing" feel without sub-bass thumping or sibilance flicker. 30fps cap on updates avoids React re-render churn.
- **HeroBlock got a new audioAnalyser prop** — Bloom on "war." lives inside HeroBlock's render tree, not DormWarsClient's body. Threading the analyser through props is cleaner than promoting Bloom into DormWarsClient or refactoring HeroBlock to access a context.
- **One-cycle back-compat for dw-sound** — useSound reads dw-sound only if dw-audio-enabled is absent. Once a user toggles via AudioPrompt, dw-audio-enabled becomes the source of truth and dw-sound is never written from Phase 6 code (dies gradually as users naturally toggle).
- **Lucide Volume2/VolumeX kept in AudioPrompt** — D-03 architecture-first: placeholder icons through Wave 5. Removing them from DormWarsClient imports means lucide tree-shakes them out of the page bundle now that SoundToggle is gone.
- **Silent-fail on missing audio assets** — try/catch + console.warn at every fetch boundary. Per UI-SPEC error state: audio is opt-in atmosphere, not core functionality. Until Wave 5 lands real .mp3 stems, the system is wired but silent — no error UI shown to users.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bloom on "war." lives inside HeroBlock, not DormWarsClient body — analyser must be threaded as a prop, not closed over directly**

- **Found during:** Task 3 (TypeScript check after wiring `analyser={audioBed.analyser}` per the plan's literal Edit 5)
- **Issue:** The plan's Edit 5 specified `analyser={audioBed.analyser}`, but `audioBed` is declared in the `DormWarsClient` function body while the `<Bloom>` on the "war." headline is inside the `HeroBlock` component (separate function defined at line 598 of the original file). TypeScript correctly errored: `Cannot find name 'audioBed'`. Closing over `audioBed.analyser` from `HeroBlock` is impossible — they're in different lexical scopes.
- **Fix:** Threaded the analyser through HeroBlock as a new typed prop `audioAnalyser: AnalyserNode | null`. Updated the call site (`<HeroBlock ... audioAnalyser={audioBed.analyser} />`) and the function signature (added `audioAnalyser` to the destructured params and the type literal). Bloom call uses `analyser={audioAnalyser}`. Behavior is identical to the plan's intent — analyser flows from useAudioBed → DormWarsClient → HeroBlock → Bloom.
- **Files modified:** `src/app/dashboard/dorm-wars/DormWarsClient.tsx`
- **Verification:** `npx tsc --noEmit` exits 0. `npm run lint` exits 0 (only pre-existing Sidebar.tsx warning, out of scope per session-start git status).
- **Committed in:** `1136c15` (Task 3 commit)

---

**2. [Rule 3 - Blocking] DormWarsClient.tsx eslint `no-unused-vars` would have failed for `stingers` binding**

- **Found during:** Task 3 (lint pre-check)
- **Issue:** `useStingers(ctx, audioBed.bedGain)` returns `{ play }` which is wired but not yet called from DormWarsClient — Wave 3 will use `stingers.play('rank-up', ...)` and Wave 4 will use `stingers.play('title-intro', ...)` etc. Per user auto-memory ("Pre-push must run `npm run lint`, not just tsc; Netlify treats `no-unused-vars` as error"), assigning `const stingers = useStingers(...)` without consuming it would have failed Netlify.
- **Fix:** Added `void stingers` after the assignment with a comment documenting why the binding stays live for Waves 3-4. This avoids the underscore-prefix anti-pattern (which the project's eslint config doesn't recognize per the Wave 1 deviation) and makes the wave-handoff explicit.
- **Files modified:** `src/app/dashboard/dorm-wars/DormWarsClient.tsx`
- **Verification:** `npm run lint` exits 0 with no errors mentioning `stingers`. The binding will be naturally consumed when Wave 3 wires `stingers.play()` calls.
- **Committed in:** `1136c15` (Task 3 commit, alongside the wiring)

---

**Total deviations:** 2 auto-fixed (both blocking — one TypeScript scope, one ESLint binding)
**Impact on plan:** No behavioral change. Wave 3's HUD work has a clean `stingers.play()` API ready to consume; Wave 4's cinema work has the same. The audioAnalyser prop pattern on HeroBlock is the same pattern Wave 3 will follow when it wraps the rank chevron in `<Bloom audioReactive={true} analyser={audioAnalyser}>`.

## Authentication Gates

None — Phase 6 audio is pure client-side Web Audio API + browser fetch. No external services, no auth.

## Issues Encountered

- **No real audio stems yet** — per D-03 architecture-first and D-05, Wave 5 lands the actual `.mp3` files in `/public/audio/dw/{ambient,stingers}/`. Until then, every `useAudioBed` and `useStingers` fetch will 404 and silent-fail. The system is wired but inaudible — synth fallbacks from `useSound` (`playCopyTick`, `playMilestoneFanfare`, `playDropReveal`) continue to play through Waves 2-4 to keep the page audible during development. **This is intentional** and matches the plan's "Fallback Behavior" in UI-SPEC.

- **`Sidebar.tsx` `<img>` lint warning is pre-existing and out of scope** (per scope-boundary rule). Already `M` in `git status` at session start. Not fixed.

## User Setup Required

None — no external services, no env vars, no audio licensing required this wave (D-05 attribution lands in Wave 5 alongside real stems).

**Recommended user verification on merge:**

1. **Visual + audio verification (with audio assets absent — silent-fail confirms):**
   - Visit `/dashboard/dorm-wars` after `localStorage.removeItem('dw-audio-enabled'); localStorage.removeItem('dw-sound')` and a hard refresh
   - Hero rank-pill row shows "ENABLE AUDIO" pill (NV2 fill, OG border, VolumeX icon)
   - No audio plays on page load (D-16 default OFF)
   - Open DevTools Network tab — confirm ZERO requests to `/audio/dw/*` on initial load
   - Tap ENABLE AUDIO → pill flips to "AUDIO ON" with Volume2 icon
   - Network tab now shows 3 requests to `/audio/dw/ambient/{drone,chatter,duct}.mp3` (all 404 until Wave 5 — silent-fail expected; check console for `[useAudioBed] failed to start bed` warnings)
   - Click the copy-link button (in the Recruits block invite share) — synth `playCopyTick` still plays (Phase 5 fallback)
   - Tap AUDIO ON → pill flips back to ENABLE AUDIO; synth callbacks stop firing
   - Reload page: pill state persists (matches `localStorage.dw-audio-enabled`)

2. **Audio-reactive bloom verification (after Wave 5 lands real stems):**
   - With audio ON and ambient bed playing, the orange glow around the "war." headline should visibly pulse with the audio mid-band
   - With audio OFF, the glow stays at static intensity
   - With OS reduced-motion ON: glow stays static even when audio is on (D-15)

3. **localStorage migration verification:**
   - Set `localStorage.dw-sound = 'on'` and remove `dw-audio-enabled`, then reload — confirms one-cycle back-compat read (audio should auto-enable from Phase 5 user pref)
   - Once user toggles via AudioPrompt, only `dw-audio-enabled` is written; `dw-sound` is no longer touched

4. **Lint + Type:**
   - `npm run lint` exits 0 — only pre-existing Sidebar.tsx warning
   - `npx tsc --noEmit` exits 0

## Next Phase Readiness

**Ready for Wave 3 (06-03 — HUD pod):**
- `audioBed.analyser` is exposed via DormWarsClient — Wave 3 can pass it to HUD chevron Bloom the same way HeroBlock receives `audioAnalyser`
- `stingers.play()` API is ready: Wave 3 calls `stingers.play('rank-up', { panX: 0 })` for chevron flash, `stingers.play('conversion-impact', { panX })` for AED roll juice
- `void stingers` in DormWarsClient body becomes natural consumption when Wave 3 lands

**Ready for Wave 4 (06-04 — Cinema moments):**
- Rank-up cutscene → `stingers.play('rank-up', { panX: 0 })`
- Title-screen interstitial → `stingers.play('title-intro', { panX: 0 })`; per-character typing reuses `stingers.play('copy-tick', { gainDb: -12 })`
- Edge alerts → `stingers.play('warning')`
- Daily Drop reveal → `stingers.play('drop-reveal')` (and `sound.playDropReveal()` synth fallback continues until Wave 5)

**Ready for Wave 5 (06-05 — Asset integration):**
- Drop real `.mp3` stems into `/public/audio/dw/ambient/{drone,chatter,duct}.mp3` and `/public/audio/dw/stingers/{copy-tick,unlock,drop-reveal,warning,rank-up,milestone-fanfare,conversion-impact,title-intro}.mp3`
- The audio system will start using them on the next page load (browser HTTP cache may delay; cache-bust by query string if needed)
- Once Wave 5 stems work, retire the synth fallbacks: replace `sound.playCopyTick()` calls with `stingers.play('copy-tick')`, etc., and remove the synth `playX` callbacks from useSound (or keep them for reduced-bandwidth offline degradation)
- `public/audio/dw/ATTRIBUTION.md` for any CC-BY-licensed stems per D-05

**No blockers for downstream waves.**

## Self-Check: PASSED

All 5 created files verified on disk:
- `src/app/dashboard/_shared/dw/audio/useSound.ts` FOUND
- `src/app/dashboard/_shared/dw/audio/useAudioBed.ts` FOUND
- `src/app/dashboard/_shared/dw/audio/useStingers.ts` FOUND
- `src/app/dashboard/_shared/dw/audio/useAudioReactive.ts` FOUND
- `src/app/dashboard/_shared/dw/audio/AudioPrompt.tsx` FOUND

All 3 task commits verified:
- `78646a9` (Task 1: audio hooks) FOUND
- `9301d37` (Task 2: AudioPrompt + Bloom wiring) FOUND
- `1136c15` (Task 3: DormWarsClient wiring) FOUND

`npx tsc --noEmit` exits 0. `npm run lint` exits 0 (only pre-existing Sidebar.tsx warning, out of scope).

**No stubs introduced.** The system is functionally complete; the audio assets are the planned Wave 5 deliverable per D-03 architecture-first.

---
*Phase: 06-dorm-wars-game-feel-pass*
*Completed: 2026-05-15*

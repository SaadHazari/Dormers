# Phase 6: Dorm Wars Game-Feel Pass — Research

**Researched:** 2026-05-15
**Domain:** Web Audio orchestration, atmospheric VFX layering, motion craft, asset curation (CC0 audio + free stock photography + Google OFL fonts)
**Confidence:** HIGH (architecture, library choices, perf patterns) / MEDIUM (specific asset URLs — Claude must hand-verify each in Wave 5 before integration)

---

## Summary

Phase 6 is an audiovisual craft layer that elevates the structurally-complete Dorm Wars page from "polished web" to "studio-built game". The research breaks into three pillars:

1. **Browser-native AV systems** — Web Audio API (ambient-bed + stinger + ducking + spatial pan + AnalyserNode), `requestAnimationFrame`-driven parallax, CSS filter-based bloom, SVG `feTurbulence` grain, framer-motion `animate()` for tabular number rolls. Every system is hand-rollable on the existing Phase 5 inline-style + `<SharedKeyframes>` foundation — no new dependencies are required and `framer-motion@12.38.0` is already installed.
2. **Asset curation** — Freesound.org (CC0 preferred) for the 11 audio stems, Unsplash/Pexels for the war-room anchor image, Google Fonts OFL for the stencil display face. All sources are commercial-free with attribution requirements limited to a few CC-BY items (logged in `public/audio/dw/ATTRIBUTION.md`).
3. **Performance discipline** — `transform`/`opacity`-only animations, hardware-accelerated CSS filters where possible, GPU-promoted layers, mandatory Chrome DevTools Performance profiling in Wave 1 after grain + bloom + parallax land. The 60fps idle / 30fps cutscene / <50KB initial bundle budget is achievable but requires perf-gating at the end of Wave 1, not at phase end.

**Primary recommendation:** Hand-roll every system using browser-native APIs (Web Audio API, SVG filters, CSS transforms, rAF scroll); use framer-motion only for the `NumberRoll` component (already in deps). Do NOT introduce `react-scroll-parallax` (would add bundle weight for marginal code-size savings; existing inline-style pattern punishes new wrapper components). Pick **Black Ops One** for the stencil face (single 400 weight is acceptable, character set covers Latin + Latin Extended + Vietnamese + Cyrillic, mature military-stencil identity matches the war-room scene). Pick **SVG feTurbulence** for grain (fast, scalable, animatable via JS-driven `baseFrequency` cycling). Pick **`filter: blur() saturate()` on duplicate element** for bloom (hardware-accelerated, animatable via `opacity`/`scale` for audio-reactive intensity).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 through D-16)

**Wave structure (D-01):** Five per-feature waves in order — Wave 1 Atmosphere (grain, vignette, bloom, key-light, parallax, cursor reticle), Wave 2 Audio (bed, stingers, ducking, spatial pan, audio-reactive bloom, ENABLE-AUDIO pre-prompt), Wave 3 HUD pod (callsign, rank chevron, AED wallet, streak flame, CRT scanline, mobile collapsed pill), Wave 4 Cinema (rank-up cutscene, title-screen upgrade with typed callsign + ink-bleed stamp + intro stinger, edge-of-viewport INCOMING alerts, chromatic aberration, impact flash + microshake, tabular number rolls), Wave 5 Asset integration sweep (icon set, anchor photo, display face, 9-slice borders).

**Asset gating (D-02):** Block phase ship on all assets landing — no wave merges in incomplete-asset state.

**Architecture-first (D-03):** Each wave lands its module under `_shared/dw/` with placeholders FIRST, real assets land in Wave 5. Wave 2 ships synth audio (Phase 5's `useSound`) as placeholder; Wave 5 swaps real stems. Wave 1–4 keep Lucide icons as placeholders; Wave 5 swaps stencil set. System font stays until Wave 5 display face install.

**Icon set (D-04):** ~15 Claude-authored inline SVG stencil/military icons under `_shared/dw/icons/`. Categories: 5 ranks (Soldier, Sergeant, Commander, War Hero, Founder), 5 drops (Credit, Multiplier, Skip, Spotlight, Intel), 3 mission rewards (Free Skip, Free Week, Pause Unlocked), 3 HUD (Wallet, Flame, Callsign). Must read at 12px and 48px. 1.5px stroke, 1px internal corner radius, 24×24 viewBox, `currentColor` fill.

**Audio stems (D-05):** Claude-curated CC0 (preferred) / CC-BY from Freesound + Pixabay Audio + Mixkit. Stored under `public/audio/dw/ambient/` (3 stems) and `public/audio/dw/stingers/` (8 stems). MP3 + OGG fallback. Attribution in `public/audio/dw/ATTRIBUTION.md` for CC-BY files.

**Display face (D-06):** Google Fonts OFL. Candidates: Black Ops One, Saira Stencil One, Stardos Stencil. Pick in Wave 5. Scoped to rank labels + "PROMOTED" stamp only. Does NOT replace DISPLAY token for "war." headline.

**Anchor image (D-07):** Unsplash/Pexels free stock. **Mandatory treatment list** — duotone (shadows → NV, highlights → OG), grain match (page grain passes over it), partial composition (≤40% hero width, never full-bleed), edge feathering via `mask-image`, vignette darkens corners further than page vignette, **one specific anchor moment only** (behind cycle clock OR as Active Mission watermark — not both). **If any treatment is missing, image MUST NOT ship.**

**9-slice borders (D-08):** Claude-authored SVG, torn-paper/stamped-edge frames for rank pills + trophy frames only. Vector implementation only (`border-image-source` with SVG data URI OR absolute-positioned SVG corners). Never raster.

**Component architecture (D-09):** Split new systems into `src/app/dashboard/_shared/dw/` modules — `atmosphere/`, `audio/`, `hud/`, `cinema/`, `icons/`, `utils/`. Full inventory in UI-SPEC § Component Inventory.

**DormWarsClient.tsx role (D-10):** Becomes the composer. Imports from `_shared/dw/*` and arranges them. Target post-Phase-6 line count: ≤ 1800 (down from 2003).

**Styling pattern (D-11):** Phase 5's inline-style + `<SharedKeyframes>` pattern continues inside modules. No Tailwind, no CSS modules, no styled-components.

**HUD scope (D-12):** Mounts only on `/dashboard/dorm-wars`. Not in `dashboard/layout.tsx`. Cross-page persistence rejected.

**Mobile HUD (D-13):** Collapsed pill on ≤720px viewport — AED + rank chevron only. Tap to expand (no long-press, no swipe). Auto-collapse after 4s no interaction. State in `localStorage` key `dw-hud-collapsed`.

**HUD position (D-14):** Top-right corner, ~16px from edges, above sidebar z-stacking, below modals (TitleScreen/RankUp/Welcome). State changes trigger juice (NumberRoll for digits, ImpactFlash for chevron on rank change).

**Reduced motion (D-15):** Phase 5's keyframe-disable block (line ~588 of DormWarsClient.tsx) extends to cover EVERY new motion construct. Each module exports `respectsReducedMotion: true` contract. Full construct map in UI-SPEC § Reduced Motion.

**Audio default OFF + ENABLE-AUDIO pre-prompt (D-16):** Reverses Phase 5's D-29. New `localStorage` key `dw-audio-enabled` (does NOT collide with Phase 5's `dw-sound`). Pill in hero rank-pill row reading "ENABLE AUDIO". Once enabled, ambient bed crossfades in over 800ms; stingers + ducking + spatial pan + audio-reactive bloom activate.

### Claude's Discretion (planner must research and recommend)

- Grain texture implementation: SVG noise vs PNG tile vs canvas. **Perf test in Wave 1 picks winner.**
- Bloom implementation: `filter: blur` on duplicate vs canvas vs SVG. **Wave 1 perf chooses.**
- Easing curves: extend Phase 5's `EXPO_OUT` / `QUART_OUT`. Introduce a third (e.g., `BACK_OUT` for rank-up overshoot) only if needed.
- Mobile breakpoint for HUD pill: 720px is the existing breakpoint, can shift.
- DOM placement of `<Grain>` / `<Vignette>` overlays — root recommended for consistency; planner decides.
- Stratified parallax: hand-rolled rAF is default; planner may swap to `react-scroll-parallax` if it cleanly reduces code.
- NumberRoll: framer-motion's `animate()` (already in deps) vs hand-rolled; planner confirms.

### Deferred Ideas (OUT OF SCOPE)

- WebGL / Three.js animated backdrop — own phase, perf budget implications.
- Color-as-story palette refactor (rivals desaturated, OG reserved exclusively for "you", lost states muted red) — own phase, touches every component.
- Cross-page HUD persistence — rejected per D-12.
- Custom-commissioned assets (human illustrator/composer/typeface) — rejected per D-04–D-08.
- Real cross-dorm leaderboard data wiring — inherited from Phase 5 deferred list.
- Multi-cycle Trophy Room persistence — inherited from Phase 5 deferred list.
- Push notifications on rank-up / cycle start.
- Hub and rewards-mock route AV upgrades — `src/app/dashboard/dorm-wars/hub/` and `src/app/dashboard/dorm-wars/rewards-mock/` not touched.
- Office Wars / portable re-skin — only keep metaphor portable in code per Phase 5 D-24, not ship the re-skin.

</user_constraints>

<phase_requirements>
## Phase Requirements

No mapped REQ-IDs. Phase 6 is product-driven; scope locked in conversation 2026-05-15 and codified entirely in `06-CONTEXT.md` D-01..D-16. Project `REQUIREMENTS.md` ends at Phase 3 (menu revamp) and does not extend to dorm-wars work. The UI-SPEC and CONTEXT files ARE the requirements contract for this phase. Planner verifies against D-01..D-16 directly, not against numeric REQ-IDs.

</phase_requirements>

## Project Constraints (from auto-memory + Phase 5 bindings)

CLAUDE.md does not exist at the project root. Binding constraints come from user auto-memory + Phase 5 CONTEXT:

| Constraint | Source | Phase 6 relevance |
|------------|--------|-------------------|
| Pre-push must run `npm run lint`, not just tsc | `feedback_pre_push_lint_check.md` | Every wave must pass `npm run lint` before commit. Orphaned imports caught by ESLint that tsc misses. |
| Never mix `background` shorthand with `backgroundImage` in React inline styles | `feedback_react_background_shorthand.md` | Direct relevance to grain overlay, parallax layers, anchor image treatment — use longhand pair always. |
| Gradient border + translucent interior needs masked `::before`, not dual-background | `feedback_css_gradient_border_translucent_interior.md` | Relevant for HUD pod styling and rank pill 9-slice borders. |
| Only WhatsApp link is wa.me/971504619384 | `project_whatsapp_canonical_url.md` | Use `lib/contacts.ts` helpers if any new WhatsApp surface appears (not expected in Phase 6). |
| Dashboard light vs marketing site dark is intentional | `project_dashboard_design_intent.md` | Reinforces D-12: HUD scoped to dorm-wars only — don't leak war-room aesthetics into other dashboard pages. |
| Onboarding dark-mode page is locked — do not redesign | `feedback_onboarding_dark_mode_locked.md` | Irrelevant to Phase 6 directly; mentioned for completeness. |

**Phase 5 D-24 portability rule still binds:** Every new string ("INCOMING", "PROMOTED", "ENTER WAR ROOM", "ENABLE AUDIO", "AED", "DAY") must read sensibly with "dorm" swapped for "office", "team", or "house". UI-SPEC § Copywriting Contract confirms all Phase 6 copy passes this test.

---

## Standard Stack

### Core (already installed — verified via `npm ls`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.5.14 | Framework | Existing — no upgrade needed |
| React | 19.2.5 | UI runtime | Existing — supports concurrent rendering for framer-motion v12 |
| framer-motion | 12.38.0 | `animate()` for NumberRoll per-digit tweens, `useReducedMotion` hook | Already in deps, registry verified |
| lucide-react | 0.525.0 | Placeholder icons through Waves 1-4 (replaced in Wave 5 by Claude-authored stencil set) | Already in deps |

**Verification:** `npm view framer-motion version` → `12.38.0` (matches installed). `npm ls framer-motion` confirms `lp@0.1.0` depends on `framer-motion@12.38.0` directly. No version drift.

**Note on `motion` package:** `framer-motion` was renamed to `motion` in 2025. Both packages are installed (`motion@12.38.0` is present as a transitive). For Phase 6 we continue importing from `framer-motion` to match Phase 5's pattern; no migration needed.

### Supporting (browser-native — no install required)

| API | Purpose | When to Use |
|-----|---------|-------------|
| Web Audio API (AudioContext, GainNode, StereoPannerNode, AnalyserNode) | Three-stem bed, stinger library, ducking, spatial pan, audio-reactive bloom | All audio system work in Wave 2 |
| SVG `<feTurbulence>` / `<feColorMatrix>` / `<feComponentTransfer>` / `<feMorphology>` | Grain, anchor-image duotone, ink-bleed stamp | Atmosphere + Cinema waves |
| CSS `filter: blur() saturate()` | Bloom on hot OG elements (hardware-accelerated) | Wave 1 atmosphere |
| CSS `transform: translate()` + `requestAnimationFrame` | Stratified parallax, microshake, letterbox slide | Wave 1 + Wave 4 |
| CSS `cursor: url(data:image/svg+xml,...)` | Custom reticle cursor | Wave 1 |
| `next/font/google` | Stencil display face load | Wave 5 |
| `localStorage` | All ephemeral persistence (`dw-audio-enabled`, `dw-rankup-played-*`, `dw-hud-collapsed`) | All waves |

### Alternatives Considered (DO NOT introduce)

| Instead of native browser API | Could Use | Why we don't |
|------------|-----------|----------|
| `requestAnimationFrame` scroll parallax | `react-scroll-parallax` (~6KB gzipped) | Adds wrapper-component overhead that conflicts with inline-style pattern; phase 5 deliberately ships no wrapper-style helpers. Hand-rolled rAF is ~30 lines and matches existing `useScrollReveal` pattern. |
| `framer-motion` (already in deps) | `gsap` | gsap is heavier, requires license for commercial use of certain plugins, doesn't share API surface with React's render cycle as cleanly. framer-motion's `animate()` and `useReducedMotion` are sufficient for the single NumberRoll use case. |
| Web Audio API direct | Howler.js, Tone.js | Howler is simpler but doesn't expose `StereoPannerNode` + `AnalyserNode` cleanly; Tone.js is ~80KB and overkill for 11 stems. We already have a `useSound` foundation that uses Web Audio API directly. |
| Inline SVG `<feTurbulence>` grain | `noisejs` JS noise | JS-rendered grain on a canvas costs CPU per frame; SVG grain is GPU-composited and animatable via JS-driven `baseFrequency` swap (or pre-rendered frame cycling). |
| CSS `filter: blur()` bloom | Three.js post-processing | WebGL is in deferred for a reason — bloom in CSS is a 4-line implementation. |

**Installation (Wave 5 only):**
```bash
# No npm install needed for Phase 6 core. Wave 5 may add a single Google Font import to layout.tsx (no package install — next/font/google is built into Next.js).
```

### Version verification (registry-checked 2026-05-15)

- `framer-motion@12.38.0` — current
- `next@15.5.14` — current (Next.js 15.x stable, supports `next/font/google` with `display: 'swap'` and `subsets: ['latin']`)
- `react@19.2.5` — current

---

## Architecture Patterns

### Recommended Module Structure (matches D-09 verbatim)

```
src/app/dashboard/
├── _shared/
│   └── dw/
│       ├── atmosphere/
│       │   ├── Grain.tsx              # Fixed full-viewport SVG feTurbulence overlay
│       │   ├── Vignette.tsx           # Fixed radial gradient overlay
│       │   ├── Bloom.tsx              # Wraps a hot element with duplicated blur ghost
│       │   ├── ParallaxLayer.tsx      # Wraps content with transform-driven parallax
│       │   └── CursorReticle.tsx      # CSS-only global cursor swap
│       ├── audio/
│       │   ├── useAudioBed.ts         # Three-stem ambient loop manager + crossfade
│       │   ├── useStingers.ts         # Stinger library + ducking + spatial pan
│       │   ├── useAudioReactive.ts    # AnalyserNode → bloom intensity driver
│       │   └── AudioPrompt.tsx        # ENABLE-AUDIO pill UI
│       ├── hud/
│       │   ├── HUDPod.tsx             # Desktop + mobile-pill branching
│       │   ├── HUDPill.tsx            # Mobile collapsed variant
│       │   ├── NumberRoll.tsx         # framer-motion per-digit tween
│       │   ├── CallsignChip.tsx
│       │   ├── RankChevron.tsx
│       │   ├── WalletReadout.tsx
│       │   ├── StreakFlame.tsx
│       │   └── ScanlineOverlay.tsx    # CRT lines scoped to HUD bounds
│       ├── cinema/
│       │   ├── RankUpCutscene.tsx
│       │   ├── TitleScreenInterstitial.tsx
│       │   ├── EdgeAlert.tsx
│       │   ├── ChromaticAberration.tsx
│       │   └── ImpactFlash.tsx
│       ├── icons/
│       │   ├── index.ts               # Barrel export
│       │   └── *.tsx                  # ~15 stencil icons (Wave 5)
│       └── utils/
│           ├── useStratifiedParallax.ts
│           ├── useReducedMotionGate.ts
│           └── triggerScreenShake.ts
└── dorm-wars/
    ├── page.tsx                       # UNCHANGED — server-side data fetch
    └── DormWarsClient.tsx             # Composer: arranges all _shared/dw/* modules
```

### Pattern 1: Inline-style + `<SharedKeyframes>` continuation (D-11)

**What:** Every new module follows Phase 5's pattern — inline `style={}` props for layout/color, scoped keyframes injected via `<style>` tags or appended to the central `<SharedKeyframes>` component in `DormWarsClient.tsx`.

**When to use:** Always. No exceptions in Phase 6.

**Example:**
```tsx
// Source: /Users/SaadHazari/1Projects/developr/Dormers-Production/src/app/dashboard/dorm-wars/DormWarsClient.tsx line 474
function SharedKeyframes() {
  return (
    <style>{`
      @keyframes dwm-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      @keyframes dw-particle { 0% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.4); } }
      .dwm-pulse-track { animation: dwm-marquee 80s linear infinite; }
      @media (prefers-reduced-motion: reduce) {
        .dwm-pulse-track, .dwm-headline-pre, .dw-particle { animation: none; opacity: 1; transform: none; }
      }
    `}</style>
  )
}
```

**Phase 6 extension:** Each new module adds its keyframes either to the shared component (preferred for global motion like grain cycle, parallax transforms, letterbox slide) or via local `<style>` injection inside the component file (acceptable for one-off animations confined to a single component like `<ChromaticAberration>`).

### Pattern 2: SVG `feTurbulence` grain overlay (Wave 1)

**What:** Single inline SVG `<filter>` with `<feTurbulence>` generates noise; applied to a fixed full-viewport `<div>` with `pointer-events: none`. Animate by swapping `baseFrequency` or `seed` on rAF, OR by pre-rendering 6-8 frames to data URIs and cycling via CSS `animation`.

**Why this over PNG tile:** SVG noise is GPU-composited (browser treats it as a filter), scales to any size without artifacts, and the SVG element is ~200 bytes (vs ~50KB PNG tile × 6 frames = 300KB). Verified faster than PNG cycling for animated grain ([css-tricks.com/grainy-gradients](https://css-tricks.com/grainy-gradients/), [tympanus.net SVG Filter Effects: feTurbulence](https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/)).

**Code sketch:**
```tsx
// _shared/dw/atmosphere/Grain.tsx
'use client'
import { useEffect, useState } from 'react'

export function Grain() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % 8), 1000 / 24) // 24fps cycle
    return () => clearInterval(id)
  }, [])
  // baseFrequency varies slightly per frame to mimic film grain
  const freq = (0.9 + (frame % 8) * 0.02).toFixed(3)
  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
      opacity: 0.06, mixBlendMode: 'overlay',
    }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <filter id="dw-grain">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves="2" seed={frame} />
        </filter>
        <rect width="100%" height="100%" filter="url(#dw-grain)" />
      </svg>
    </div>
  )
}
```

**Reduced motion:** Cap `frame` at 0 (no animation) when `useReducedMotionGate()` returns `true`.

**Source:** [MDN feTurbulence](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence)

### Pattern 3: Bloom via `filter: blur() saturate()` on duplicate element (Wave 1)

**What:** Wrap a hot element. Render a duplicate of its children in an absolute-positioned ghost layer behind the source, with `filter: blur(24px) saturate(1.4)`. Audio-reactive variant multiplies bloom intensity (1.0 → 1.4) on `opacity` or via `filter: blur(Xpx)` updates driven by `AnalyserNode`.

**Why this over SVG `feGaussianBlur`:** CSS `filter: blur()` is significantly faster than SVG `feGaussianBlur` because it leverages hardware-accelerated compositing on the GPU, while SVG filters are processed in the rasterizer. Verified at [MDN blur()](https://developer.mozilla.org/en-US/docs/Web/CSS/filter-function/blur) + LogRocket SVG filters guide. The duplicate-element trick is the standard bloom approximation (Sitepoint design tricks SVG filters masked blur).

**Code sketch:**
```tsx
// _shared/dw/atmosphere/Bloom.tsx
'use client'
import { useAudioReactive } from '../audio/useAudioReactive'

export function Bloom({ children, color = '#f57f20', intensity = 1.0, audioReactive = false }: {
  children: React.ReactNode; color?: string; intensity?: number; audioReactive?: boolean
}) {
  const audioMult = useAudioReactive(audioReactive) // returns 1.0..1.4 or 1.0 if disabled
  const finalIntensity = intensity * audioMult
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      {/* Ghost layer */}
      <span aria-hidden style={{
        position: 'absolute', inset: 0, color,
        filter: `blur(24px) saturate(1.4)`,
        opacity: 0.6 * finalIntensity,
        pointerEvents: 'none',
        transform: `scale(${finalIntensity})`,
        transition: 'opacity 120ms linear, transform 120ms linear',
        zIndex: -1,
      }}>{children}</span>
      {/* Source */}
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
    </span>
  )
}
```

**Hot Bloom Targets (from UI-SPEC):** "war." headline, PulseTicker dot, cycle clock arc, rank pill border, Daily Drop button border (pre-claim), Active Mission progress fill, HUD rank chevron during rank-change flash.

**Reduced motion:** `audioReactive=false` always; `finalIntensity` locked at `intensity` (no audio multiplier).

### Pattern 4: Hand-rolled stratified parallax via rAF (Wave 1)

**What:** Single `useStratifiedParallax` hook attaches one passive `scroll` listener, batches all transforms in a single `requestAnimationFrame`. Each `<ParallaxLayer multiplier>` registers with the hook; the hook writes `transform: translate3d(0, scrollY * (1 - multiplier), 0)` directly to the layer's ref.

**Why hand-rolled over `react-scroll-parallax`:** `react-scroll-parallax` adds ~6KB gzipped and a context provider, conflicts with the inline-style pattern (wraps children in `<div>` with its own styles), and per-layer scroll listeners aren't an issue when we share one listener across all layers. The Motion.dev approach (`useScroll` + `useTransform`) is excellent BUT it requires importing motion components, which adds friction to the inline-style pattern. Hand-rolled rAF is ~40 lines and matches the existing `useScrollReveal` pattern in DormWarsClient.tsx.

**Code sketch:**
```tsx
// _shared/dw/utils/useStratifiedParallax.ts
'use client'
import { useEffect, useRef } from 'react'

const layers: Array<{ el: HTMLElement; multiplier: number }> = []

let rafId = 0
function tick() {
  const y = window.scrollY
  for (const { el, multiplier } of layers) {
    const offset = y * (1 - multiplier) // 0.5x layer moves slower; 1.0x = no parallax
    el.style.transform = `translate3d(0, ${offset}px, 0)`
  }
  rafId = 0
}
function onScroll() { if (!rafId) rafId = requestAnimationFrame(tick) }

export function useParallaxLayer(multiplier: number) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return // no listener, no transform — layer stays at multiplier 1.0
    const entry = { el, multiplier }
    layers.push(entry)
    if (layers.length === 1) window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      const i = layers.indexOf(entry)
      if (i >= 0) layers.splice(i, 1)
      if (layers.length === 0) window.removeEventListener('scroll', onScroll)
    }
  }, [multiplier])
  return ref
}
```

**Source:** [MDN CSS/JS animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance) (passive scroll listeners), [Motion.dev parallax](https://motion.dev/docs/react-scroll-animations) (multiplier convention).

### Pattern 5: Web Audio API architecture (Wave 2)

**What:** Extend the existing `useSound` hook into three new hooks under `_shared/dw/audio/`:
- `useAudioBed` — three `AudioBufferSourceNode`s (drone + chatter + duct) → individual `GainNode`s → master `GainNode` (bed bus) → `AnalyserNode` (tap for reactive bloom) → `AudioContext.destination`.
- `useStingers` — preload-or-lazy `AudioBuffer` map keyed by stinger name → on play: create `AudioBufferSourceNode` + `StereoPannerNode` + `GainNode` → connect to master output. On play, ramp bed `GainNode` down by -6 dB for stinger duration + 200ms tail, then ramp back over 240ms EXPO_OUT.
- `useAudioReactive` — reads `AnalyserNode.getByteFrequencyData()` on rAF, averages mid-band (200-2000Hz), returns intensity multiplier 1.0–1.4 to bloom components. Cap update rate at 30fps.

**Buffer management strategy:**
- Ambient stems (3 files, ~300KB total): preload IMMEDIATELY after ENABLE-AUDIO tap. Fetch all three in parallel via `Promise.all([fetch(...), fetch(...), fetch(...)])`, then `decodeAudioData` each.
- Stinger stems (8 files, ~800KB total): lazy-load ON-DEMAND per event. First time a stinger fires, fetch + decode + cache the buffer; subsequent fires use the cache. This staggers the 1.1MB total cost across user activity.
- Cleanup: cache cleared on page unmount (component lifecycle).

**Ducking implementation:**
```tsx
function duckBed(bedGain: GainNode, durationMs: number, ctx: AudioContext) {
  const now = ctx.currentTime
  const tail = 0.200 // seconds
  const ramp = 0.240
  // -6 dB = gain factor 0.501
  bedGain.gain.cancelScheduledValues(now)
  bedGain.gain.setValueAtTime(bedGain.gain.value, now)
  bedGain.gain.linearRampToValueAtTime(0.501, now + 0.04) // duck in 40ms
  bedGain.gain.setValueAtTime(0.501, now + durationMs / 1000 + tail)
  // Rise back via exponential ramp (EXPO_OUT approximation)
  bedGain.gain.exponentialRampToValueAtTime(1.0, now + durationMs / 1000 + tail + ramp)
}
```

**Spatial pan based on cursor x-position:** For UI-triggered stingers (copy-tick, unlock, drop-reveal, conversion-impact), capture the source element's `getBoundingClientRect().left + width/2`, normalize against `window.innerWidth`, map to `[-1, +1]` and set `StereoPannerNode.pan.value`.

**Code sketch (useStingers):**
```tsx
// _shared/dw/audio/useStingers.ts
'use client'
import { useCallback, useRef } from 'react'

const STINGER_PATHS: Record<string, string> = {
  'copy-tick': '/audio/dw/stingers/copy-tick.mp3',
  'unlock': '/audio/dw/stingers/unlock.mp3',
  'drop-reveal': '/audio/dw/stingers/drop-reveal.mp3',
  'warning': '/audio/dw/stingers/warning.mp3',
  'rank-up': '/audio/dw/stingers/rank-up.mp3',
  'milestone-fanfare': '/audio/dw/stingers/milestone-fanfare.mp3',
  'conversion-impact': '/audio/dw/stingers/conversion-impact.mp3',
  'title-intro': '/audio/dw/stingers/title-intro.mp3',
}

export function useStingers(ctx: AudioContext | null, bedGain: GainNode | null) {
  const cacheRef = useRef<Map<string, AudioBuffer>>(new Map())

  const play = useCallback(async (key: string, opts: { panX?: number; gainDb?: number } = {}) => {
    if (!ctx || !bedGain) return
    let buf = cacheRef.current.get(key)
    if (!buf) {
      const res = await fetch(STINGER_PATHS[key])
      buf = await ctx.decodeAudioData(await res.arrayBuffer())
      cacheRef.current.set(key, buf)
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const pan = ctx.createStereoPanner()
    pan.pan.value = opts.panX ?? 0
    const g = ctx.createGain()
    g.gain.value = opts.gainDb ? Math.pow(10, opts.gainDb / 20) : 1.0
    src.connect(g).connect(pan).connect(ctx.destination)
    // Duck the bed for stinger duration
    duckBed(bedGain, buf.duration * 1000, ctx)
    src.start()
  }, [ctx, bedGain])

  return { play }
}
```

**Sources:** [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), [MDN Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices), [MDN decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData), [MDN StereoPannerNode](https://developer.mozilla.org/en-US/docs/Web/API/StereoPannerNode), [MDN AnalyserNode.getByteFrequencyData](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData), [MDN Visualizations with Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API).

### Pattern 6: `next/font/google` scoped via CSS variable (Wave 5)

**What:** Declare the stencil font in `src/app/layout.tsx` alongside existing fonts (Montserrat, Poppins, JetBrains_Mono). Expose via `--font-dw-stencil` CSS variable. Use ONLY in dorm-wars modules. With `display: 'swap'` and `subsets: ['latin']`, LCP impact is <100ms.

**Why this is fine for a single-route font:** Next.js automatically scopes preload to the route where a font is used. Even though it's declared in root `layout.tsx`, it won't be preloaded on `/dashboard/menu` because no element on that route uses `--font-dw-stencil`. The font payload only fetches when an element using that variable enters the viewport. Source: [Next.js Font Optimization docs](https://nextjs.org/docs/app/getting-started/fonts).

**Alternative considered:** Declare inside `/dashboard/dorm-wars/page.tsx`. Rejected because Next.js docs explicitly support root-layout declaration with auto-scoped preload — the simpler pattern wins, matches existing Montserrat/Poppins/JetBrains setup in `layout.tsx`.

**Code sketch:**
```tsx
// src/app/layout.tsx — additions
import { Black_Ops_One } from 'next/font/google'

const blackOps = Black_Ops_One({
  subsets: ['latin'],
  weight: '400', // single weight only — that's all Black Ops One has
  variable: '--font-dw-stencil',
  display: 'swap',
})

// In <body className>:
className={`${montserrat.variable} ${poppins.variable} ${jetbrains.variable} ${blackOps.variable}`}
```

Then in dorm-wars modules:
```tsx
style={{ fontFamily: 'var(--font-dw-stencil), Impact, sans-serif' }}
```

### Pattern 7: framer-motion `animate()` per-digit NumberRoll (Wave 4)

**What:** For each digit position, render a vertically-clipped column. On value change, animate `y` translate from old-digit position to new-digit position via `motion`'s `animate()` API.

**Why framer-motion over hand-rolled:** `animate()` returns a controllable handle (cancellable, with onComplete), supports spring easing if needed, and respects `prefers-reduced-motion` automatically if you wrap with `<MotionConfig reducedMotion="user">`. ~40 lines. Hand-rolled rAF tweens would duplicate this for marginal bundle savings.

**Code sketch (per-digit column):**
```tsx
// _shared/dw/hud/NumberRoll.tsx
'use client'
import { useEffect, useRef } from 'react'
import { animate } from 'framer-motion'

const DIGIT_HEIGHT = 28 // px — matches HUD readout 24/700 + 4px breathing

function DigitColumn({ value }: { value: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      ref.current.style.transform = `translateY(${-value * DIGIT_HEIGHT}px)`
      return
    }
    const ctrl = animate(
      ref.current,
      { transform: `translateY(${-value * DIGIT_HEIGHT}px)` },
      { duration: 0.6, ease: [0.25, 1, 0.5, 1] } // QUART_OUT
    )
    return () => ctrl.stop()
  }, [value])
  return (
    <span style={{
      display: 'inline-block', height: DIGIT_HEIGHT, overflow: 'hidden',
      fontFeatureSettings: '"tnum"',
    }}>
      <div ref={ref}>
        {Array.from({ length: 10 }, (_, i) => <div key={i} style={{ height: DIGIT_HEIGHT }}>{i}</div>)}
      </div>
    </span>
  )
}

export function NumberRoll({ value }: { value: number }) {
  const digits = String(value).split('').map(Number)
  return <span>{digits.map((d, i) => <DigitColumn key={i} value={d} />)}</span>
}
```

**Source:** [buildui.com Animated Counter recipe](https://buildui.com/recipes/animated-counter), [Motion.dev React animate-number](https://motion.dev/docs/react-animate-number).

### Pattern 8: Cinematic letterbox via `scaleY` transform (Wave 4)

**What:** Letterbox bars are `<div>`s pinned to top/bottom of viewport with `transform-origin` set to `top` (top bar) / `bottom` (bottom bar). Animate via `transform: scaleY(0) → scaleY(1)` instead of `height: 0 → 64px`. Then `height` is fixed at 64px and the transform handles in/out.

**Why scaleY over height:** Animating `height` triggers layout reflow every frame; `transform: scaleY` is GPU-composited and doesn't reflow. Source: [PQINA — Animating width and height without squish](https://pqina.nl/blog/animating-width-and-height-without-the-squish-effect/), [MDN CSS/JS animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance).

**Code sketch:**
```css
.dw-letterbox-top {
  position: fixed; top: 0; left: 0; right: 0;
  height: 64px; background: black;
  transform: scaleY(0); transform-origin: top;
  transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.dw-letterbox-top.is-visible { transform: scaleY(1); }
```

### Anti-Patterns to Avoid

- **Don't animate `height` for letterbox bars** — triggers layout reflow each frame. Use `transform: scaleY` with `transform-origin: top`.
- **Don't apply `filter: blur()` to ancestors of fixed-position children** — blur creates a stacking context that breaks `position: fixed` (children stick to the blurred ancestor instead of the viewport). Bloom must be applied to ghost-layer siblings, not the source's parent.
- **Don't use `background` shorthand alongside `backgroundImage` in inline styles** (user auto-memory rule) — `backgroundImage: undefined` clears the gradient. Use longhand pair `backgroundColor` + `backgroundImage`.
- **Don't preload all audio on mount** — adds ~1.1MB to LCP. Lazy-load on ENABLE-AUDIO + per-stinger on first play.
- **Don't run `AnalyserNode.getByteFrequencyData()` every animation frame** — cap to 30fps via `requestAnimationFrame` throttle to avoid CPU bleed.
- **Don't ship the anchor image without the full duotone+grain+feather+vignette treatment** (D-07 lock). Better to skip the image than ship a raw photo.
- **Don't use `cursor: url(...)` images larger than 32×32 px** — exceeded sizes are silently ignored on some browsers. Source: [MDN cursor URL values](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Basic_User_Interface/Using_URL_values_for_the_cursor_property).
- **Don't put SVG animations inside the cursor SVG** — JS, CSS animations, and SMIL are ignored inside SVG cursors. The reticle must be static.
- **Don't trigger AudioContext before user gesture** — browsers block autoplay. Phase 5's pattern (lazy init on first `playX()` call) is preserved.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-digit number tween animation | Custom rAF tween library | framer-motion's `animate()` (already in deps) | Cancellable handles, spring easing, reduced-motion integration. ~40 lines you don't write. |
| `prefers-reduced-motion` detection in JS | Custom listener boilerplate | framer-motion's `useReducedMotion` hook OR `window.matchMedia('(prefers-reduced-motion: reduce)').matches` (one-liner) | Hook re-renders on change automatically. |
| Audio file decoding | Custom audio worklet | `BaseAudioContext.decodeAudioData()` | Browser-native, handles MP3/OGG/WAV. |
| Stereo panning | Custom convolution | `StereoPannerNode` (Web Audio API native) | Equal-power algorithm built-in, low CPU. |
| Frequency analysis | FFT JS library (e.g., `dsp.js`) | `AnalyserNode.getByteFrequencyData()` | Browser-native, hardware-optimized. |
| Grain noise generation | Canvas-rendered noise per frame | SVG `<feTurbulence>` | GPU-composited, ~200 bytes inline SVG. |
| Bloom on hot elements | WebGL post-processing pipeline | CSS `filter: blur() saturate()` on duplicate sibling | Hardware-accelerated, ~5 lines per Bloom wrapper. |
| Cinematic letterbox bars | Canvas-animated bars | CSS `transform: scaleY` on fixed-position divs | GPU-only, no reflow, respects reduced-motion via media query. |
| Duotone color mapping on photo | Photoshop pre-treatment baked into JPG | SVG `feColorMatrix` + `feComponentTransfer` filter applied via CSS `filter: url(#duotone)` | Keeps photo source clean; theme-swappable; <1KB filter definition. |
| Google Font integration | `<link rel="stylesheet">` in `<head>` | `next/font/google` with `display: 'swap'` | Auto-scoped preload per route, prevents FOIT, zero CLS. |

**Key insight:** Phase 6 is a "compose browser-native primitives" phase, not a "ship new libraries" phase. The single new dependency consideration was `react-scroll-parallax`, and the hand-rolled rAF version wins on both bundle weight and styling-pattern compatibility.

---

## Runtime State Inventory

**Phase 6 is NOT a rename/refactor/migration phase** — it adds new modules and new keyframes, it does not rename existing identifiers or move stored data. New `localStorage` keys (`dw-audio-enabled`, `dw-rankup-played-${cycleStartISO}-${rankSlug}`, `dw-hud-collapsed`) are additive, not replacements; existing Phase 5 keys (`dw-sound`, `dw-streak`, `dw-titlescreen-*`, `dw-drop-*`, `dw-welcome-seen`, `dw-last-milestone-played-*`) are preserved unchanged.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by reading CONTEXT and confirming no rename/migration scope | None |
| Live service config | None — no external services touched | None |
| OS-registered state | None — pure web client work | None |
| Secrets/env vars | None — no secret keys referenced | None |
| Build artifacts | None — Phase 6 is additive; no existing artifact names change | None |

**Net:** No runtime state migration in Phase 6. Section included for protocol completeness.

---

## Common Pitfalls

### Pitfall 1: Bloom layer breaks `position: fixed` children

**What goes wrong:** Applying `filter: blur()` to a parent element creates a stacking context that re-roots `position: fixed` children to the blurred ancestor instead of the viewport. The HUD pod or modals can suddenly stick to the wrong scroll position.

**Why it happens:** CSS `filter` is a documented containing block trigger ([MDN filter](https://developer.mozilla.org/en-US/docs/Web/CSS/filter) — "A computed value other than none for the filter property results in the creation of a containing block for absolute and fixed positioned descendants").

**How to avoid:** Apply blur only to ghost-layer SIBLINGS of the source, never to the source's parent. The `<Bloom>` wrapper pattern keeps the blur on a separate `<span>` with `position: absolute`, not on the wrapper itself.

**Warning signs:** HUD pod drifts during scroll; modals appear behind page content unexpectedly.

### Pitfall 2: AudioContext blocked by autoplay policy

**What goes wrong:** Creating an `AudioContext` before user gesture results in suspended state. Calling `.start()` on a buffer source silently fails.

**Why it happens:** Browser autoplay policies require user gesture before audio playback. Chrome and Safari both enforce this.

**How to avoid:** Lazy-init `AudioContext` inside the ENABLE-AUDIO click handler. The existing `useSound` hook (DormWarsClient.tsx line 40-48) already follows this pattern — preserve it. If `AudioContext.state === 'suspended'` after creation, call `ctx.resume()` from the same gesture handler.

**Warning signs:** Audio works on dev tools "Replay" but not first load; works in Firefox but not Chrome (or vice versa).

### Pitfall 3: Grain `feTurbulence` killing FPS on low-end mobile

**What goes wrong:** `numOctaves` above 3 quadruples filter cost; 24fps cycle on a 1920×1080 viewport can saturate the GPU.

**Why it happens:** Each frame re-rasterizes the entire `feTurbulence` output. Mobile GPUs are bandwidth-limited.

**How to avoid:** Cap `numOctaves` at 2. If perf misses 60fps idle target, drop cycle rate to 12fps. As a last resort, swap to pre-rendered PNG noise tile cycling (heavier bundle, lighter runtime).

**Warning signs:** FPS dips below 50 during idle scroll on a mid-range Android. Chrome DevTools shows long paint operations on the grain layer.

### Pitfall 4: framer-motion `animate()` not respecting `prefers-reduced-motion` without explicit gate

**What goes wrong:** `animate()` on its own doesn't gate against reduced motion preference — that's only automatic for `<motion>` components or under `<MotionConfig reducedMotion="user">`.

**Why it happens:** Imperative `animate()` is below the `<MotionConfig>` context. The hook checks media query at top-level.

**How to avoid:** In every `NumberRoll` digit column's `useEffect`, check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` BEFORE calling `animate()`. If reduced, set the final transform directly without tween.

**Warning signs:** Numbers still roll for users with reduced motion enabled in OS settings.

### Pitfall 5: Cursor SVG ignored in Firefox at 64px

**What goes wrong:** Custom cursor renders fine in Chrome at 64×64 but reverts to default in Firefox.

**Why it happens:** Firefox enforces a 32×32 maximum for SVG cursors (despite documentation suggesting 128×128). [MDN cursor URL](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Basic_User_Interface/Using_URL_values_for_the_cursor_property) recommends 32×32 for maximum compatibility.

**How to avoid:** Author the reticle as a 20×20 SVG inside a `data:image/svg+xml,...` URI; specify hotspot offset `cursor: url("data:...") 10 10, pointer` for center alignment.

**Warning signs:** Custom cursor missing on Firefox; works on Chrome and Safari.

### Pitfall 6: Stinger preload causing initial bundle bloat

**What goes wrong:** All 11 stems load on mount → 1.1MB extra payload → LCP regresses past budget.

**Why it happens:** Naively preloading every audio buffer in `useEffect` on `<DormWarsClient>` mount.

**How to avoid:** Only fetch audio AFTER ENABLE-AUDIO is tapped. Ambient bed: parallel fetch + decode immediately after enable. Stingers: lazy-load on first play (each stinger fires its own first-play fetch + decode + cache).

**Warning signs:** Network tab shows 11 MP3s loaded before user interaction. LCP measured via Lighthouse regresses >100ms vs Phase 5 baseline.

### Pitfall 7: Anchor photo shipped without full treatment

**What goes wrong:** A war-room photo lands at 40% width, duotone applied, but grain layer skipped or feathering missing. Result: "stock photo dropped into a stylized scene" — breaks the perception flip the phase is paid for.

**Why it happens:** Treatment is a checklist of six items (duotone, grain match, partial composition, edge feathering, corner vignette, single anchor moment). Easy to skip one.

**How to avoid:** Wave 5 includes a verification checklist task: for the anchor integration step, every line of D-07 must be checked explicitly before merge. **If any treatment is missing, the image MUST NOT ship** (D-07 hard rule).

**Warning signs:** Image looks like a Pexels photo instead of a war-room artifact. Edges are crisp instead of feathered. Photo has different grain pattern than the rest of the page.

### Pitfall 8: `react-scroll-parallax` Provider conflicting with existing layout

**What goes wrong:** If the planner reverses the rec and brings in `react-scroll-parallax`, its `<ParallaxProvider>` wraps the layout tree and can introduce subtle scroll snap or scroll-behavior conflicts with the existing dashboard layout container's overflow rules.

**Why it happens:** Provider injects its own scroll listener and DOM measurements.

**How to avoid:** Stick with the hand-rolled rAF pattern (recommended). If `react-scroll-parallax` is chosen anyway, scope its provider to the `DormWarsClient` component subtree only, NOT to `dashboard/layout.tsx`.

**Warning signs:** Scrolling feels "fighty" — scrollbar jumps, momentum scrolling broken on Safari.

---

## Code Examples

Verified patterns from official sources.

### Web Audio API — load + play a buffer with stereo pan

```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData
async function loadAndPlay(ctx: AudioContext, url: string, panX = 0) {
  const res = await fetch(url)
  const arrayBuffer = await res.arrayBuffer()
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

  const source = ctx.createBufferSource()
  source.buffer = audioBuffer
  const panner = ctx.createStereoPanner()
  panner.pan.value = panX // -1 (left) to +1 (right)
  source.connect(panner).connect(ctx.destination)
  source.start()
}
```

### Web Audio API — AnalyserNode visualizer pattern

```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
function setupAnalyser(ctx: AudioContext, source: AudioNode) {
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  const bufferLength = analyser.frequencyBinCount // 128
  const dataArray = new Uint8Array(bufferLength)
  source.connect(analyser)
  analyser.connect(ctx.destination)

  function tick() {
    analyser.getByteFrequencyData(dataArray)
    // dataArray[i] is 0-255 for each frequency bin
    // For audio-reactive bloom: average mid-band (bins 10-60 ~= 200-2000Hz at 44.1kHz / 256 fft)
    const midBand = dataArray.slice(10, 60)
    const avg = midBand.reduce((a, b) => a + b, 0) / midBand.length
    const intensity = 1.0 + (avg / 255) * 0.4 // 1.0..1.4
    // Apply to bloom layer opacity/scale
    requestAnimationFrame(tick)
  }
  tick()
  return analyser
}
```

### Web Audio API — Ducking via GainNode ramp

```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/GainNode
// Pattern: lower bed volume during stinger, ramp back after
function duckBed(bedGain: GainNode, durationMs: number, ctx: AudioContext) {
  const now = ctx.currentTime
  const duckGain = 0.501 // -6 dB
  bedGain.gain.cancelScheduledValues(now)
  bedGain.gain.setValueAtTime(bedGain.gain.value, now)
  bedGain.gain.linearRampToValueAtTime(duckGain, now + 0.04) // duck in 40ms
  bedGain.gain.setValueAtTime(duckGain, now + durationMs / 1000 + 0.2) // hold + tail
  bedGain.gain.exponentialRampToValueAtTime(1.0, now + durationMs / 1000 + 0.2 + 0.24) // rise back
}
```

### SVG duotone filter (CSS-applicable)

```html
<!-- Source: https://tympanus.net/codrops/2019/02/05/svg-filter-effects-duotone-images-with-fecomponenttransfer/ -->
<!-- shadows → NV #091825 (rgb(9, 24, 37)), highlights → OG #f57f20 (rgb(245, 127, 32)) -->
<svg width="0" height="0">
  <filter id="dw-duotone">
    <!-- Step 1: desaturate -->
    <feColorMatrix type="matrix" values="
      0.33 0.33 0.33 0 0
      0.33 0.33 0.33 0 0
      0.33 0.33 0.33 0 0
      0    0    0    1 0" />
    <!-- Step 2: map grayscale → duotone gradient (shadow color → highlight color) -->
    <feComponentTransfer>
      <feFuncR type="table" tableValues="0.035 0.96"/>
      <feFuncG type="table" tableValues="0.094 0.498"/>
      <feFuncB type="table" tableValues="0.145 0.125"/>
    </feComponentTransfer>
  </filter>
</svg>
```

Apply via CSS:
```css
.dw-anchor-img { filter: url(#dw-duotone); }
```

### Custom cursor reticle (data URI, 20×20 SVG)

```css
/* Source: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Basic_User_Interface/Using_URL_values_for_the_cursor_property */
.dw-interactive {
  cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='9' fill='none' stroke='%23f57f20' stroke-width='1.5'/><line x1='10' y1='2' x2='10' y2='6' stroke='%23f57f20' stroke-width='1.5'/><line x1='10' y1='14' x2='10' y2='18' stroke='%23f57f20' stroke-width='1.5'/><line x1='2' y1='10' x2='6' y2='10' stroke='%23f57f20' stroke-width='1.5'/><line x1='14' y1='10' x2='18' y2='10' stroke='%23f57f20' stroke-width='1.5'/><circle cx='10' cy='10' r='1' fill='%23f57f20'/></svg>") 10 10, pointer;
}
@media (prefers-reduced-motion: reduce) {
  .dw-interactive { cursor: pointer; } /* revert to default */
}
```

### `next/font/google` scoped via CSS variable

```typescript
// Source: https://nextjs.org/docs/app/getting-started/fonts
// src/app/layout.tsx — additions
import { Black_Ops_One } from 'next/font/google'

const blackOps = Black_Ops_One({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-dw-stencil',
  display: 'swap',
})

// In <body className={`${montserrat.variable} ${blackOps.variable}`}>
```

### CSS chromatic aberration via layered text-shadow

```css
/* Source: https://codepen.io/ryanfiller/pen/rjLQxj */
.dw-aberration {
  position: relative;
  text-shadow:
    1px 0 0 rgba(255, 0, 0, 0.7),
    -1px 0 0 rgba(0, 0, 255, 0.7);
  animation: dw-aberration-pulse 200ms ease-out forwards;
}
@keyframes dw-aberration-pulse {
  0% { text-shadow: 0 0 0 transparent; }
  30% { text-shadow: 2px 0 0 rgba(255,0,0,0.7), -2px 0 0 rgba(0,0,255,0.7); }
  100% { text-shadow: 0 0 0 transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .dw-aberration { animation: none; text-shadow: none; }
}
```

For non-text elements (e.g., a ladder card), use `filter: drop-shadow()` instead:
```css
.dw-card-aberration {
  filter:
    drop-shadow(1px 0 0 rgba(255,0,0,0.5))
    drop-shadow(-1px 0 0 rgba(0,0,255,0.5));
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `setInterval` for animation loops | `requestAnimationFrame` | ~2014 (universal browser support) | Browser-aligned frame timing; ~60fps default; pauses on inactive tab. Use for parallax + AnalyserNode polling. |
| `framer-motion` package name | `motion` package (renamed in 2025) | 2025 | API identical; we continue importing `framer-motion` (matches Phase 5 + still works as alias in `motion@12.x`). No migration needed for Phase 6. |
| `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` for Google Fonts | `next/font/google` with `display: 'swap'` + auto-scoped preload | Next.js 13 (2022) | Eliminates CLS, prevents FOIT, auto-subsets, route-scoped preload. Standard for Next.js 15. |
| CSS `filter: drop-shadow()` for everything | `filter: blur() saturate()` for bloom, `text-shadow` for chromatic aberration on text, `drop-shadow()` filter chain for elements | — | Pick the right filter per use case. `blur()` is hardware-accelerated; SVG filters are not. |
| Mock-by-Photoshop duotone (baked into JPG) | SVG `feColorMatrix` + `feComponentTransfer` filter applied via CSS | — | Keeps source photo clean; theme-swappable; <1KB filter definition reusable. |
| `window.addEventListener('scroll', handler)` (blocking) | `addEventListener('scroll', handler, { passive: true })` + rAF-batched writes | ~2018 | Removes scroll jank from main thread. Critical for stratified parallax. |
| `prefers-reduced-motion` via custom hook | framer-motion's `useReducedMotion()` OR `window.matchMedia(...).matches` | 2020-2022 | Browser-native MQ supports change events for live OS toggle. |

**Deprecated/outdated:**
- `webkitAudioContext` fallback — still works but only relevant for Safari <14; Phase 5 already includes the cast `(window as any).webkitAudioContext` which we preserve.
- `RAF polyfills` — universal native support, never needed in modern Next.js builds.

---

## Open Questions

1. **Exact CC0/CC-BY audio stem selection — which specific Freesound IDs?**
   - What we know: Freesound + Pixabay + Mixkit have ample candidates; CC0 license preferred per D-05.
   - What's unclear: Specific IDs need to be hand-verified by Claude in Wave 5. WebSearch turned up category-level results but not pre-vetted "this exact ID matches the war-room aesthetic" lists.
   - Recommendation: Wave 5 starts with an asset-curation task that auditions 2-3 candidates per stem against the war-room aesthetic. Shortlist below is a starting point, NOT a final pick. Candidate previews in the Audio Sources Shortlist section below.

2. **Final stencil face pick — Black Ops One vs Saira Stencil One vs Stardos Stencil?**
   - What we know: All three are Google Fonts OFL (commercial-safe). Black Ops One = military-stencil identity, single weight 400, Latin + Latin Extended + Vietnamese + Cyrillic subsets. Saira Stencil One = bold-but-still-modern, also single weight 400. Stardos Stencil = thinner/refined, normal + bold weights.
   - What's unclear: Aesthetic fit decision is taste-driven, made in Wave 5 against the actual page after grain + bloom + bloom intensity testing.
   - Recommendation: **Default pick is Black Ops One** — most stencil-canonical, best for "PROMOTED" stamp (heaviest), and reads at 24px in HUD. Stardos Stencil as backup if "PROMOTED" looks too aggressive in context. Saira Stencil One is the middle option — keep as second-line backup. Final pick in Wave 5 after live preview.

3. **Anchor image candidates — which specific Unsplash/Pexels URL?**
   - What we know: Unsplash + Pexels both have war-room, tactical-map, vintage-map, command-center collections, all free for commercial use with no attribution required.
   - What's unclear: Specific image URL hasn't been chosen. Choice depends on duotone preview — some photos have washed-out shadows that fail the duotone mapping.
   - Recommendation: Wave 5 starts with an asset-curation task. Shortlist below provides 3 starting candidates with collection URLs. Each must be previewed under the duotone filter before commit.

4. **Should bloom intensity be tied to Audio Reactive or always-on for some hot targets?**
   - What we know: UI-SPEC distinguishes "always-on bloom" targets (war. headline, PulseTicker dot) from "audio-reactive bloom" targets (cycle clock arc, Active Mission progress fill). The mechanic is clear but the perceptual threshold (does always-on bloom + audio-reactive bloom on the same element look right when audio is off?) is untested.
   - What's unclear: Whether always-on bloom should remain at fixed intensity even when audio is on, or whether the always-on baseline becomes the floor and audio-reactivity adds on top.
   - Recommendation: Wave 2 audio system implements bloom intensity = `baseline + audioMult * audioReactiveAmount`. Baseline is always-on level (e.g., 1.0 = full opacity). When audio is on, `audioMult` is 0..0.4 added on top → 1.0..1.4 range. When audio is off, audioMult is 0 → stays at 1.0 baseline.

5. **Does the rank-up cutscene "1.5px microshake" apply to the page root or to the cutscene card only?**
   - What we know: UI-SPEC says "1.5px screen shake for 120ms on the page root container" — the whole page shakes, not just the card.
   - What's unclear: With letterbox bars also pinned (position: fixed), do they shake too? Or are they immune because they're outside the shaking transform parent?
   - Recommendation: Apply shake transform to the `dorm-wars` root `<div>` only. Letterbox bars are siblings to that div (mounted at body level via portal or as fixed-position siblings), so they don't inherit the shake — which is correct cinematically (letterbox is "the camera frame", page is "the scene inside the frame").

---

## Audio Sources Shortlist (CC0 preferred, all commercial-safe)

Wave 5 starts here. Each candidate needs Claude to hand-audition before commit.

### Ambient Bed (3 stems, lazy-loaded ~300KB total)

**1. War-room drone (low-frequency room tone, loops seamlessly)**

| Candidate | Source | License | Notes |
|-----------|--------|---------|-------|
| "Sci-fi Ambient Drone" by LookIMadeAThing | [freesound.org/people/LookIMadeAThing/sounds/534018/](https://freesound.org/people/LookIMadeAThing/sounds/534018/) | Verify CC0 on page | Sci-fi ambient drone, suitable for war-room presence |
| "Room Tone, Sci Fi, Large Hall" by Kinoton | [freesound.org/people/Kinoton/sounds/353159/](https://freesound.org/people/Kinoton/sounds/353159/) | Verify CC0 on page | Soft ventilation, hollow rumble, drone — described as "server room, military lab, reactor room" — ideal fit |
| "Complex shifting ambient drone 1" by +frame+ | [freesound.org/people/+frame+/sounds/837364/](https://freesound.org/people/+frame+/sounds/837364/) | Verify license on page | Atmospheric, evolving drone |

**2. Distant comms chatter (unintelligible radio)**

| Candidate | Source | License | Notes |
|-----------|--------|---------|-------|
| Pixabay "Military Radio Communication" | [pixabay.com/sound-effects/military-radio-communication-222904/](https://pixabay.com/sound-effects/military-radio-communication-222904/) | Pixabay Royalty-Free (no attribution) | Direct match |
| Pixabay military-radio category | [pixabay.com/sound-effects/search/military-radio/](https://pixabay.com/sound-effects/search/military-radio/) | Pixabay Royalty-Free | Browse for tone match |
| Pixabay chatter category | [pixabay.com/sound-effects/search/chatter/](https://pixabay.com/sound-effects/search/chatter/) | Pixabay Royalty-Free | Backup if military chatter feels too aggressive |

**3. Duct hum / HVAC static (high-mid environmental hum)**

| Candidate | Source | License | Notes |
|-----------|--------|---------|-------|
| "ambient low hum (aircon)" by TimBahrij | [freesound.org/people/TimBahrij/sounds/234918/](https://freesound.org/people/TimBahrij/sounds/234918/) | Verify CC0 on page | Soft aircon hum, Tascam DR-05 24-bit recording |
| "Air Conditioning Ambient sound loop" by jbeetle | [freesound.org/people/jbeetle/sounds/274776/](https://freesound.org/people/jbeetle/sounds/274776/) | Verify CC0 on page | Pre-edited as looping ambient |
| "control_room.wav" by Diboz | [freesound.org/people/Diboz/sounds/211683/](https://freesound.org/people/Diboz/sounds/211683/) | Verify CC0 on page | Muted background hum + HVAC overtone — single stem that could replace both #2 and #3 if budget is tight |

### Stingers (8 stems, lazy-loaded on first play, ~800KB total)

| Stinger | Candidate sources | License notes |
|---------|-------------------|---------------|
| `unlock` (600ms) | [Mixkit Lock/Win SFX](https://mixkit.co/free-sound-effects/lock/), [Mixkit Win SFX](https://mixkit.co/free-sound-effects/win/), [Freesound GameAudio UI SFX pack](https://freesound.org/people/GameAudio/packs/13940/) | Mixkit Free License — commercial use OK; Freesound packs — check per-file license |
| `drop-reveal` (800ms swoosh) | [Mixkit Swoosh](https://mixkit.co/free-sound-effects/swoosh/), [Pixabay Swoosh](https://pixabay.com/sound-effects/search/swoosh/), [Freesound "Modern Interface Swoosh Whoosh Small 01" by RescopicSound](https://freesound.org/people/RescopicSound/sounds/750403/) | All commercial-safe |
| `rank-up` (~1500ms brass fanfare) | [Pixabay Fanfare](https://pixabay.com/sound-effects/search/fanfare/), [Freesound fanfare tag](https://freesound.org/browse/tags/fanfare/), [Uppbeat "Brass horn fanfare - charge!"](https://uppbeat.io/sfx/brass-horn-fanfare-charge/9101/24359) | Uppbeat: attribution required for free plan; Pixabay/Freesound: verify per-file |
| `warning` (400ms low brass) | [Freesound warning/alert tag search](https://freesound.org/search/?q=alert+warning+brass), [Pixabay alarm](https://pixabay.com/sound-effects/search/alarm/) | Filter by CC0 in Freesound search |
| `copy-tick` (80ms) | Fall back to existing Phase 5 synth (DormWarsClient.tsx line 50-62) for placeholder; replace with [Mixkit interface SFX](https://mixkit.co/free-sound-effects/interface/) in Wave 5 | Mixkit Free License |
| `milestone-fanfare` (1200ms) | [Pixabay Fanfare](https://pixabay.com/sound-effects/search/fanfare/), [Freesound fanfare tag](https://freesound.org/browse/tags/fanfare/) | CC0 preferred |
| `conversion-impact` (300ms) | [Mixkit Notification SFX](https://mixkit.co/free-sound-effects/notification/), [Mixkit Game SFX](https://mixkit.co/free-sound-effects/game/) | Mixkit Free License |
| `title-intro` (4000ms riser → impact → tail) | [Pixabay Riser/Cinematic](https://pixabay.com/sound-effects/search/cinematic-riser/), [Freesound cinematic stinger search](https://freesound.org/search/?q=cinematic+riser+impact) | Check per-file license |

**Attribution file:** Create `public/audio/dw/ATTRIBUTION.md` listing every CC-BY file with: original URL, author, license link. CC0 files don't require attribution but recording the source aids future audits.

**Format strategy:** Ship `.mp3` (broadest support) + `.ogg` (Firefox-preferred). The `useStingers` fetch can try `.mp3` first and fall back to `.ogg` on decode error.

---

## Anchor Image Shortlist (Wave 5 — must pass duotone preview before commit)

| Candidate collection | Source | Notes |
|---------------------|--------|-------|
| Unsplash War Room collection | [unsplash.com/s/photos/war-room](https://unsplash.com/s/photos/war-room) | 35+ free-for-commercial images. Filter for high-contrast forms, no human faces. |
| Unsplash Command Center collection | [unsplash.com/s/photos/command-center](https://unsplash.com/s/photos/command-center) | 100+ images. Look for tactical-map style. |
| Unsplash Vintage Map collection | [unsplash.com/s/photos/vintage-map](https://unsplash.com/s/photos/vintage-map) | Worn-paper map aesthetic — most likely to read well under duotone. |
| Pexels Blueprint photos | [pexels.com/search/blueprint/](https://www.pexels.com/search/blueprint/) | 6000+ images. Clean line-art style works well under duotone. |
| Pexels Tactical Map photos | [pexels.com/search/tactical%20map/](https://www.pexels.com/search/tactical%20map/) | 8000+ images. |
| Pexels Old Map photos | [pexels.com/search/old%20map/](https://www.pexels.com/search/old%20map/) | 200000+ images. |

**Hand-verification checklist for the chosen image:**
- [ ] No human faces (Phase 5 keeps the page metaphor-neutral)
- [ ] High contrast forms (shadows + highlights map cleanly under duotone)
- [ ] No busy detail at <40% width (will compress to mud)
- [ ] License confirmed free for commercial use (Unsplash + Pexels both qualify by default; verify the photographer hasn't added custom restrictions)
- [ ] Aspect ratio works for "behind the cycle clock in the hero" OR "watermark in the Active Mission card" — not both

---

## Stencil Display Face Comparison (Wave 5 — recommendation: Black Ops One)

All three are Google Fonts OFL (commercial-safe).

| Property | Black Ops One | Saira Stencil One | Stardos Stencil |
|----------|---------------|--------------------|-----------------|
| Weights | 400 only | 400 only | 400 + 700 (two weights) |
| Subsets | Latin, Latin Extended, Vietnamese, Cyrillic Ext | Latin, Latin Extended | Latin, Latin Extended |
| Character count | 409 | ~280 | ~270 |
| Aesthetic | Low contrast, semi-geometric, MILITARY stencil | Bold, sturdy, modern stencil (heaviest of three) | Refined, thinner, classic stencil |
| Best for "PROMOTED" stamp | YES — most stencil-canonical, military fit | OK — heavier so might compete with the OG glow | Underwhelming at 56px |
| Best for HUD rank labels at 24px | YES — readable at 24px (military-style stencils were designed for stenciling onto crates, so legibility at small sizes is intrinsic) | OK — slightly heavier, may feel oversized | YES — refined enough for HUD use |
| Source | [fonts.google.com/specimen/Black+Ops+One](https://fonts.google.com/specimen/Black+Ops+One) | [fonts.google.com/specimen/Saira+Stencil+One](https://fonts.google.com/specimen/Saira+Stencil+One) | [fonts.google.com/specimen/Stardos+Stencil](https://fonts.google.com/specimen/Stardos+Stencil) |

**Recommendation: Black Ops One** for both "PROMOTED" stamp and HUD rank labels (the spec already pairs them as one face). Single weight 400 is sufficient — the stencil aesthetic doesn't need a bold variant; weight comes from font-size hierarchy (56px for stamp vs 24px for HUD).

**Fallback recommendation:** If Black Ops One looks too aggressive against the cream + NV + OG palette in live preview, fall back to **Stardos Stencil** at weight 700 for the stamp + 400 for HUD labels.

---

## Performance Budget Testing Approach

UI-SPEC § Performance Budget locks the targets. Methodology below.

### Targets

| Metric | Target | Hard floor |
|--------|--------|------------|
| Idle scroll FPS | ≥ 60fps | 50fps acceptable on 4× CPU throttle |
| Rank-up cutscene FPS | ≥ 30fps | 24fps acceptable on 4× CPU throttle |
| Initial bundle weight delta | < 50KB | Hard cap |
| Audio bundle (lazy-loaded) | ~1.1MB total | Soft cap; ambient bed must be ≤300KB |
| LCP impact | < 100ms regression vs Phase 5 baseline | Hard cap |

### Chrome DevTools Performance Tab workflow (mandatory in Wave 1 after grain + bloom + parallax)

1. **Capture Phase 5 baseline first** (before merging any Phase 6 wave): record 10s of idle scrolling at the top of dorm-wars; note avg FPS, paint time, GPU time. Commit this baseline to research notes if not yet captured.
2. **After Wave 1 merge:** repeat the recording. Compare avg FPS, paint times, scripting time, GPU time.
3. **Use Frame Rendering Stats overlay:** open Chrome DevTools → ESC → Rendering tab → enable "Frame Rendering Stats". Real-time FPS shown top-right of viewport.
4. **CPU throttle to 4×** when testing — simulates mid-range Android. Source: [Chrome DevTools Performance reference](https://developer.chrome.com/docs/devtools/performance/reference).
5. **Test in Incognito** to avoid extension overhead. Source: same.
6. **Look for red bars in the FPS chart** — those mark frames below 60fps. If consistent reds during idle scroll → cut grain frame rate (24fps → 12fps).
7. **For cutscene perf:** record during rank-up trigger. Track Long Tasks in the Performance tab — any >50ms task during the 1500ms cutscene is a regression target.

### Lighthouse CI (optional, not mandatory)

If the planner wants to gate phase-end on LCP regression: add a Lighthouse audit as an optional Wave 5 verification step. Compare LCP between Phase 5 baseline and Phase 6 final. Not blocking — manual DevTools recording is sufficient for this phase.

### Manual measurement methodology

For each wave that lands a motion construct:
1. Run `npm run dev`, navigate to `/dashboard/dorm-wars`.
2. Open DevTools → Performance.
3. Click Record, scroll the full page once, stop record.
4. Note: total duration, avg FPS in the FPS chart, max scripting time, max paint time, layout shifts (CLS).
5. If FPS dips below 50fps consistently → the wave's deliverable doesn't merge. First lever: reduce frame rate of the most-expensive animation (grain 24→12fps, parallax skip-every-other-frame, etc.). Second lever: drop the offending effect.

---

## Validation Architecture

> Skipped — `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`. No automated test mapping required for this phase. Verification is manual: visual inspection + Chrome DevTools Performance Tab + `npm run lint` per pre-push rule.

---

## Environment Availability

Phase 6 is purely client-side web code. External dependencies are limited to: Node + npm (existing), browser APIs (universal in modern Chrome/Safari/Firefox), and a working dev environment for `npm run dev`.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `npm run dev` / `npm run build` / `npm run lint` | Assumed yes (Phase 5 shipped) | 20+ via `.nvmrc` if present, else default | None — required |
| npm | Package management | Assumed yes | — | None — required |
| Chrome / Chromium | Performance profiling (Wave 1 perf-gate) | Assumed yes (dev environment) | Modern (M115+) for accurate Performance tab | Firefox DevTools Performance also acceptable; Safari Web Inspector less ideal |
| `next/font/google` | Wave 5 stencil face | Built into Next.js 15 | 15.5.14 | None needed |
| Web Audio API | All audio work | Universal (Chrome, Firefox, Safari 14+, Edge) | — | Synth fallback (existing Phase 5 `useSound`) for browsers that fail to instantiate AudioContext |
| `prefers-reduced-motion` MQ | All motion modules | Universal | — | Default to "no preference" (animations on) if MQ unsupported |
| SVG filters (`feTurbulence`, `feColorMatrix`, `feComponentTransfer`, `feMorphology`) | Grain, duotone, ink-bleed | Universal | — | Pre-rendered PNG noise fallback if `feTurbulence` is rejected on a target browser |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None expected.

---

## Sources

### Primary (HIGH confidence)

**Web Audio API:**
- [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MDN BaseAudioContext.decodeAudioData()](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)
- [MDN AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
- [MDN AnalyserNode.getByteFrequencyData()](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData)
- [MDN StereoPannerNode](https://developer.mozilla.org/en-US/docs/Web/API/StereoPannerNode)
- [MDN Web Audio Visualizations](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API)
- [MDN Web Audio API best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
- [MDN Web audio spatialization basics](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics)

**CSS / SVG / Performance:**
- [MDN filter: blur()](https://developer.mozilla.org/en-US/docs/Web/CSS/filter-function/blur)
- [MDN feTurbulence](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence)
- [MDN cursor URL values](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Basic_User_Interface/Using_URL_values_for_the_cursor_property)
- [MDN CSS and JavaScript animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance)

**Next.js:**
- [Next.js Font Optimization](https://nextjs.org/docs/app/getting-started/fonts)

**framer-motion / Motion:**
- [Motion.dev useReducedMotion](https://motion.dev/docs/react-use-reduced-motion)
- [Motion.dev React Scroll Animations](https://motion.dev/docs/react-scroll-animations)
- [Motion.dev AnimateNumber](https://motion.dev/docs/react-animate-number)
- [Motion.dev useScroll](https://motion.dev/docs/react-use-scroll)

**Google Fonts (display face candidates):**
- [Black Ops One](https://fonts.google.com/specimen/Black+Ops+One)
- [Saira Stencil One](https://fonts.google.com/specimen/Saira+Stencil+One)
- [Stardos Stencil](https://fonts.google.com/specimen/Stardos+Stencil)

**Chrome DevTools:**
- [Chrome DevTools Performance reference](https://developer.chrome.com/docs/devtools/performance/reference)
- [Chrome DevTools Analyze runtime performance](https://developer.chrome.com/docs/devtools/performance)

### Secondary (MEDIUM confidence — community/blog with technique verification)

**SVG / CSS techniques:**
- [CSS-Tricks — Using SVG to Create a Duotone Effect on Images](https://css-tricks.com/using-svg-to-create-a-duotone-image-effect/)
- [Codrops — SVG Filter Effects: Duotone Images with feComponentTransfer](https://tympanus.net/codrops/2019/02/05/svg-filter-effects-duotone-images-with-fecomponenttransfer/)
- [Codrops — SVG Filter Effects: Creating Texture with feTurbulence](https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/)
- [CSS-Tricks — Grainy Gradients](https://css-tricks.com/grainy-gradients/)
- [Frontend Masters — Grainy Gradients](https://frontendmasters.com/blog/grainy-gradients/)
- [PQINA — Animating CSS Width And Height Without The Squish Effect](https://pqina.nl/blog/animating-width-and-height-without-the-squish-effect/)
- [Sitepoint — Design Tricks with SVG Filters: A Masked Blur Effect](https://www.sitepoint.com/design-tricks-with-svg-filters-a-masked-blur-effect/)
- [CSS-Tricks — Shake CSS Keyframe Animation](https://css-tricks.com/snippets/css/shake-css-keyframe-animation/)

**Audio source platforms (asset shortlist references):**
- [Freesound.org](https://www.freesound.org/)
- [Pixabay Sound Effects](https://pixabay.com/sound-effects/)
- [Mixkit Free Sound Effects](https://mixkit.co/free-sound-effects/)
- [Mixkit License](https://mixkit.co/license/)

**Stock image platforms:**
- [Unsplash License](https://unsplash.com/license)
- [Pexels License](https://www.pexels.com/license/)
- [Pexels — Can I use the photos for a commercial project?](https://help.pexels.com/hc/en-us/articles/360042295214-Can-I-use-the-photos-and-videos-for-a-commercial-project)

**framer-motion patterns:**
- [buildui.com — Animated Counter recipe](https://buildui.com/recipes/animated-counter)
- [buildui.com — Animated Number recipe](https://buildui.com/recipes/animated-number)

### Tertiary (LOW confidence — flag for hand-verification in Wave 5)

- All specific Freesound IDs in the Audio Sources Shortlist — each must be hand-auditioned and license-verified on the Freesound page before commit. Listed candidates are starting points discovered via WebSearch, not pre-verified.
- All specific Unsplash/Pexels image URLs — to be picked in Wave 5 from the candidate collections; each must pass the duotone-preview test.
- Stencil face final pick — recommendation is Black Ops One but final decision deferred to Wave 5 live preview.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library version verified against npm registry; framer-motion@12.38.0 confirmed installed; browser APIs are universal.
- Architecture patterns: HIGH — every pattern sourced from MDN or sourced-and-verified blogs (CSS-Tricks, Frontend Masters, Codrops); inline-style + SharedKeyframes pattern carried forward from Phase 5 verbatim.
- Pitfalls: HIGH — each pitfall has a documented root cause and avoidance strategy with MDN or browser-vendor source.
- Audio asset shortlist: MEDIUM — categories of candidates surfaced via WebSearch with confirmed CC0-friendly platforms; specific files require hand-audition in Wave 5.
- Anchor image shortlist: MEDIUM — Unsplash and Pexels license verified as commercial-safe; specific images deferred to Wave 5 against duotone preview.
- Stencil face: MEDIUM-HIGH — three candidates all confirmed Google Fonts OFL; recommendation (Black Ops One) confidently supported by aesthetic-match analysis; final pick is taste-driven in Wave 5.
- Performance methodology: HIGH — Chrome DevTools workflow sourced from official Chrome docs.

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (30 days — stable browser APIs, framer-motion stable major version, Google Fonts stable; Freesound/Pixabay/Unsplash availability does not change frequently)

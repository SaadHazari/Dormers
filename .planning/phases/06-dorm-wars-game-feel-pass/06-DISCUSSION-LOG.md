# Phase 6: Dorm Wars Game-Feel Pass — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `06-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 06-dorm-wars-game-feel-pass
**Areas discussed:** Wave structure & asset-blocking, Asset commissioning sources, Component architecture, HUD pod scope

---

## Wave Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Code-stack first, assets second | Wave 1+2 build atmosphere/HUD/audio infrastructure with placeholders; Wave 3 swaps real commissioned assets as they arrive. Decouples code timeline from vendor timeline. Code reaches perception-flip in ~2 weeks; assets become incremental upgrades. (Recommended by Claude.) | |
| Visual-first per layer | Wave 1 atmosphere only. Wave 2 HUD + audio. Wave 3 cinema + asset integration. Each wave shippable end-to-end but Wave 3 is large and asset-blocking. | |
| Per-feature waves (5 waves) | Wave 1 atmosphere. Wave 2 audio system. Wave 3 HUD pod. Wave 4 cinema moments. Wave 5 asset integration sweep. Cleanest commit log, slowest path, more orchestration overhead. | ✓ |

**User's choice:** Per-feature waves (5 waves)
**Notes:** User overrode Claude's recommendation. Reading: prioritize craft and clear demarcation over speed.

---

## Asset-Slip Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Ship placeholders forever-style | Each asset has a sturdy placeholder good enough to ship publicly. No wave waits on any commission. Asset arrival = silent upgrade in next deploy. (Recommended by Claude.) | |
| Block the asset's host wave only | If audio stems slip, audio-system wave waits. Other waves proceed. Mixed signal. | |
| Block the phase until all assets land | Phase 6 ships only when every commissioned asset is delivered and integrated. Cleanest UX, ties phase completion to vendor calendars. | ✓ |

**User's choice:** Block the phase until all assets land
**Notes:** User overrode Claude's recommendation. Choice was made on the assumption of external vendor commissions. Subsequently de-risked when user reframed asset pipeline to be Claude-authored / Claude-curated (see Asset Commissioning section below).

---

## Asset Commissioning — Icon Set

| Option | Description | Selected |
|--------|-------------|----------|
| AI-generated → vector trace → polish | Midjourney v8 batch, trace to SVG, manual polish. ~3 days, ~$50. (Recommended by Claude.) | |
| Marketplace bundle (Iconfinder / Noun Project) | License existing military/tactical icon set. ~1 day, $30-200. Risk: "looks marketplace." | |
| Human illustrator commission | Fiverr/Dribbble illustrator. 1-2 weeks, $300-1500. Scheduling risk. | |
| **User-provided alternative** | **"you will be the one making the Assets"** — Claude authors inline SVG components directly. | ✓ |

**User's choice:** Claude authors inline SVG components (free)
**Notes:** Major scope reframe — user shifted asset pipeline from external vendors to Claude as the asset source. Captured in CONTEXT D-04.

---

## Asset Commissioning — Audio Stems

| Option | Description | Selected |
|--------|-------------|----------|
| AI-generated (Suno v5 + Eleven Labs Audio) | Generate ambient + stingers via AI. ~1 day, ~$30. (Recommended by Claude.) | |
| Marketplace (AudioJungle / Pond5 / Splice) | License individual stems. 1-2 days, $50-300. | |
| Human composer commission | Custom composer creates all 11 stems. 2-4 weeks, $1500-5000. | |
| **User-provided alternative** | **"you'll be the one to source them for free"** — Claude curates from CC0 / CC-BY sources (Freesound.org, Pixabay Audio, Mixkit). | ✓ |

**User's choice:** Claude curates from free royalty-free sources
**Notes:** Captured in CONTEXT D-05. Attribution file required for any CC-BY assets.

---

## Asset Commissioning — Display Face

| Option | Description | Selected |
|--------|-------------|----------|
| License from Adobe Fonts / Fontspring | Pro stencil/condensed military face. 1 day, $0-$200. (Recommended by Claude.) | |
| Google Fonts (free military-style face) | Free OFL face (Black Ops One, Saira Stencil One, etc.). 1 hour, free. | |
| Custom face commission | Months. $$$$. | |
| **User-provided alternative** | **"you'll be getting it from wherever it can be found"** — Claude picks from Google Fonts (OFL). | ✓ |

**User's choice:** Claude picks from Google Fonts (free OFL)
**Notes:** Captured in CONTEXT D-06. Final face selection deferred to Wave 5 (evaluate Black Ops One / Saira Stencil One / Stardos Stencil).

---

## Asset Commissioning — Anchor Painting

| Option | Description | Selected |
|--------|-------------|----------|
| Skip raster — Claude authors SVG composition | Hand-coded SVG war-room composition. Pure code, no asset file. (Recommended by Claude.) | |
| Free stock from Unsplash / Pexels | Curated photo, optimized via Next Image. Risk: photographic style may clash. | ✓ |
| Detailed AI prompt for user to run | Claude writes Midjourney prompt; user generates iterations. | |

**User's choice:** Free stock from Unsplash / Pexels
**Notes:** User overrode Claude's SVG-composition recommendation. Acknowledged risk surfaced; mandatory treatment locked in CONTEXT D-07 (duotone NV+OG, heavy grain match, partial composition, never full-bleed). The treatment is non-negotiable to prevent the photo from reading as marketing stock.

---

## Component Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Split into `_shared/dw/` modules | Extract atmosphere / audio / hud / cinema / icons into module subdirs. ~12 new files. DormWarsClient stays ≤ ~1800 lines. (Recommended by Claude.) | ✓ |
| Keep single-file (continue Phase 5 pattern) | Add all new code to DormWarsClient.tsx. Grows to ~3500-4000 lines. | |
| Hybrid — only audio + HUD split out | Middle ground. ~4 new files. | |

**User's choice:** Split into `_shared/dw/` modules
**Notes:** Captured in CONTEXT D-09 and D-10. Module structure mapped in detail.

---

## HUD Pod Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Dorm-wars-only | HUD pod mounts only on /dashboard/dorm-wars. Respects dashboard-light-vs-dark intentional contrast. (Recommended by Claude.) | ✓ |
| Cross-page persistent | HUD lives in dashboard layout.tsx, visible on every dashboard page. Clashes with cream pages; needs theme-adaptive variants. | |
| Cross-page but only on dark surfaces | HUD visible on dorm-wars + onboarding. Conditional logic leaks into layout. | |

**User's choice:** Dorm-wars-only
**Notes:** Captured in CONTEXT D-12. Aligns with user auto-memory "Dashboard light vs marketing site dark is intentional."

---

## HUD Pod Mobile Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsed pill, tap to expand | Single small pill showing AED + rank chevron. Tap expands to full HUD. (Recommended by Claude.) | ✓ |
| Hidden on mobile | HUD desktop-only. Simplest to ship. | |
| Full HUD always visible | Same HUD desktop and mobile. Maximum consistency. Competes with thumb scroll zones. | |

**User's choice:** Collapsed pill, tap to expand
**Notes:** Captured in CONTEXT D-13. Auto-collapse after 4s of no interaction; reuses HUDPod component logic as a variant.

---

## Claude's Discretion

The user explicitly accepted Claude's judgment on the following (no questions asked, captured in CONTEXT D-15 through D-16 + the Claude's Discretion subsection):

- **D-15:** Reduced-motion degradation strategy across all new motion modules. Every animation must have an end-state fallback when `prefers-reduced-motion: reduce`.
- **D-16:** Audio default OFF + explicit ENABLE-AUDIO pre-prompt pill (reversing Phase 5's D-29 which had sound default ON).
- Exact grain texture (SVG noise vs PNG tile).
- Specific bloom implementation (filter blur duplicate vs canvas vs SVG filter).
- Easing curves and durations for new motion.
- Mobile breakpoint for HUD pill collapse.
- Stratified parallax library choice or hand-rolled.
- Number roll library (framer-motion already available).

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section. Highlights:
- WebGL / Three.js animated backdrop — own phase
- Color-as-story palette refactor — own phase
- Custom-commissioned assets (human illustrator, composer, type designer) — considered and rejected
- Real cross-dorm leaderboard data wiring — inherited from Phase 5 deferral
- Cross-page HUD persistence — considered and rejected
- Hub and rewards-mock route AV upgrades — not in this phase

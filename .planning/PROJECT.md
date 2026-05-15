# Dormer's Website — Menu Section Revamp

## What This Is

Dormer's is a UAE-based meal plan delivery service. The website is a Next.js 15 marketing and ordering site where customers browse weekly meal menus, select plans, and check out via Stripe. This project revamps the Menu section to be image-forward and interaction-simple — replacing button-heavy navigation with natural scrolling and surfacing food photography as the primary engagement driver.

## Core Value

Food photos that make you want to order — a menu you browse naturally, not navigate laboriously.

## Requirements

### Validated

- ✓ 4-week rotating menu (veg + non-veg, 6 days/week, 48 dishes) — existing
- ✓ Stripe checkout integration — existing
- ✓ Dark/light theme support — existing
- ✓ REV-01: Next.js image optimization enabled — WebP/AVIF served at responsive sizes — Validated in Phase 01: foundations-data
- ✓ REV-02: Spice level + allergen fields on all 48 dishes (real CSV values) — Validated in Phase 01: foundations-data

### Active

- [ ] REV-03: Replace 6 letter-button day selector with horizontally scrollable food card gallery — all days visible, swipe to browse, tap to select
- [ ] REV-04: Each gallery card shows: day label, food photo (optimized), dish name, spice chilli icons, allergen icons
- [ ] REV-05: Replace week dropdown with horizontally scrollable tab strip (Week 1–4)
- [ ] REV-06: Refine Veg/Non-Veg toggle styling to match new design language
- [ ] REV-07: Tap a dish card → slide-up detail sheet showing dish description + nutrition icon (opens existing modal)
- [ ] REV-08: Nutrition info accessible via small icon only — remove the "Nutrition Info" text button

### Out of Scope

- New dishes or menu data changes beyond spice/allergen fields — focus is UI/UX only
- Replacing the MUI Modal for nutrition info — refinement only, not a rewrite
- Changing the ordering flow or Stripe integration — separate concern
- Backend/API for dynamic menu data — static data is fine for now

## Context

- **Stack:** Next.js 15, React 19, Tailwind CSS v4, Framer Motion v12, MUI (Modal only in menu)
- **Images:** Located in `/public/images/Week{1-4}/{NonVeg|Veg}/` — mix of .jpg, .png, .webp; Week 1 non-veg uses static imports, all others use string paths
- **Image problem:** `next.config.ts` has `images: { unoptimized: true }` — this is the confirmed root cause of slow loads
- **Current menu state:** 1,600-line single component; data + UI co-located in `src/app/components/Menu.tsx`
- **Framer Motion available:** Can be used for card animations and sheet transitions
- **Currency:** AED — UAE market; mobile-first usage expected

## Constraints

- **Consistency:** Existing dark/light theme (colors: `#1E3A4F` navy, `#EEE9DA` cream) must be preserved
- **Data:** No backend — all 48 dishes are hardcoded in MENU_DATA; spice/allergen values will be placeholders
- **Existing images:** Cannot re-shoot or rename image files — optimization must work with existing paths

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Card gallery over day strip + big card | Shows all days at once → more browsable, images front and center | — Pending |
| Keep nutrition modal, access via icon | Reduces button clutter while keeping data accessible | — Pending |
| Keep veg/non-veg slider, refine only | Toggle is intuitive — simplify don't replace | — Pending |
| Placeholder spice/allergen data | Real data not available yet; structure must exist for future fill-in | — Pending |

---
*Last updated: 2026-05-15 — Phase 06 complete: Dorm Wars game-feel pass — AV craft layer that flips perceived class from "polished web" to "studio-built game". 5 waves landed: atmosphere stack (animated SVG grain + vignette + bloom on hot OG elements + stratified parallax + cursor reticle), audio system (3-stem ambient bed + 8-stinger library + ducking + spatial pan + AnalyserNode-driven audio-reactive bloom + ENABLE-AUDIO pre-prompt with default OFF reversing Phase 5 D-29), persistent HUD pod scoped to dorm-wars only (callsign + rank chevron + AED wallet via NumberRoll + streak flame + CRT scanline + mobile collapsed pill), cinema moments (RankUpCutscene 8-step letterbox+stamp choreography + TitleScreenInterstitial upgrade with typed callsign + ink-bleed stamp + 4s intro stinger + EdgeAlert INCOMING strip + ChromaticAberration + ImpactFlash + screen shake), and asset integration sweep (16 hand-authored stencil SVG icons replacing Lucide on dorm-wars + Black Ops One via next/font/google + Unsplash anchor photo with mandatory D-07 duotone treatment + 9-slice stamped borders). Audio stems shipped as silent placeholders pending user curation from documented CC0/CC-BY sources. Wave 1 perf-gate (60fps idle scroll DevTools recording) deferred to user-side phase-end UAT. Build passes, lint passes, dorm-wars route 24.2 KB / 153 KB First Load JS.*

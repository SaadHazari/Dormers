# Mobile DNA — how every `Mobile<Page>` is built

The dashboard home (`_mobile/MobileHome.tsx`) was hand-perfected first. Its
implemented vocabulary lives in `_mobile/kit.tsx`. This doc is the one-page
reference so each new page is mechanical. **Desktop is never edited. MobileHome
is never edited.**

Source specs: `.planning/mobile/MOBILE-REDESIGN-SPEC.md` §7.x (per-surface scan
orders + fold/priority tables), `.interface-design/system.md` (design system),
`.interface-design/mobile-redesign-spec.md` (principles).

## The switch (both trees render; CSS hides one — no JS, no flash)

```tsx
// In XClient.tsx
<div className="{page}-desktop">{/* existing desktop JSX, untouched */}</div>
<div className="{page}-mobile"><Mobile<Page> {...sameProps} /></div>

<style jsx global>{`
  .{page}-mobile { display: none; }
  @media (max-width: 768px) {
    .{page}-desktop { display: none; }
    .{page}-mobile  { display: block; }
  }
`}</style>
```

The mobile component receives the **same data + handlers** as desktop. Pattern
reference: `ActiveDashboard.tsx` (`.home-desktop` / `.home-mobile`).

## Architecture rules

- A dedicated `_mobile/Mobile<Page>.tsx` for every page (ground-up vertical, not
  a reflow). Build from the §7.x scan order + fold/priority table.
- **Lead with the job, defer analytics.** One first-glance answer owns the first
  ~700px; reflection/history/setup sink below the fold.
- **All depth one tap down** in a `MobileSheet` (the mobile component renders its
  own sheet detail/picker/confirm views; desktop keeps its own modals).
- **No hover-only affordance.** Every lock reason / disabled-CTA explanation /
  "Tentative" note becomes visible inline text (`InlineCaption`) or a tap-to-open
  sheet.
- **44px tap targets + bottom safe-area** (`paddingBottom: max(env(safe-area-inset-bottom), …)`).
- Snap any new breakpoint to **420 / 640 / 768 / 1024** only.
- Never `background` shorthand beside `backgroundImage` in inline styles.

## Type (px, Montserrat / `BODY`, numerals carry `fontFeatureSettings: '"tnum"'`)

| Role | size / weight / extra |
|---|---|
| eyebrow | 11 / 800 / `0.14em` upper (`heroEyebrow` = `0.18em`, orange) |
| eyebrowSm | 10 / 800 / `0.16em` upper |
| hero H1 (`HeroTitle`) | **26 / 700 / -0.02em** — deliberately *not* maxed (dialed from 30/800) |
| section H2 (`SectionTitle`) | 21 / 800 / -0.02em, navy, orange period |
| body | 13.5 / 1.5 |
| big metric | 44 / 900 / `lh 0.9` / tnum |
| caption / `InlineCaption` | 11–12.5 / 600 (accent → 700) |

## Colour = one meaning each

- **orange** (`ORANGE_GRAD`, `OG`→`OG3`) — progress / delivered / CTAs. `#f57f20`
  is the ceiling: lighter ok, never darker into amber/burnt/red.
- **navy** (`NV`) — data + text + structure.
- **green** (`#1d8a30` / `StatusPill active`) — live status only.
- **gray + diagonal `HATCH`** — skipped / de-emphasised.
- Never colour-alone: pair colour with icon + text on every badge/state.

## Surfaces / depth (all in `kit.tsx`)

- `CARD` — `#fdfbf6`, radius 22, soft layered lift. Primary light surface.
- `SUNSET_CARD` — `CARD` + faint-orange bottom wash (progress/summary cards).
- `HERO` / `HeroCard` — dark TIER_POP gradient, radius 24, deep shadow. **One per
  surface** (the spotlight); status pill green only when active.
- `RECESSED` / `RecessedTile` — inset shadow, no outer lift → reads a tier *below*
  a primary button. For optional/rewarded/secondary items.

## Buttons (all 44px+)

- `heroBtn('ghost'|'outline', disabled)` — pair of secondary pills on the dark
  hero. Disabled = dashed faint outline + `InlineCaption` reason.
- `primaryRaisedBtn(disabled)` — raised `CARD` primary on the light page, orange
  icon. Disabled = dashed, no lift.
- `solidNavyBtn` — sheet's bottom-pinned confirm CTA.
- Orange pill CTAs use `_shared/buttons.tsx` `primary` (don't re-roll).

## Sheets (`MobileSheet`, already shared)

Slide-up `y:100%→0` `0.26s cubic-bezier(.16,1,.3,1)`; grab-handle drag-to-dismiss;
scrim blur; focus trap; scroll-lock; safe-area bottom pad; CTA pinned to thumb
zone via the `footer` prop. Renders a centered dialog ≥768 (so adopting it is a
no-op on desktop). Forcing overlays pass `dismissible={false}`.

## Reusable assets (do not rebuild)

`MobileSheet`, `CompactMetricStrip` (metric bands, one orange accent max),
`computeArrivalLabel` (imprecise countdowns), `PlanGlyph`, `MealTag` (`onDark`),
`HeatBar`, `cleanPlanName`, tokens — all re-exported from `kit.tsx`.

## Verify each page

`npm run dev` → 390px + 768px boundary: clean toggle, scan order matches §7.x,
sheets slide up / drag / scrim-close, safe-area pad, inline disabled reasons,
44px targets, **no desktop regression ≥768**. Then `npm run lint` (Netlify treats
`no-unused-vars` as error). Never push without an explicit ask.

# Tablet layout contract

**Date:** 2026-08-17
**Status:** approved, implementation in progress

## The problem

The dashboard has two complete designs and one undesigned band between them.

- The mobile redesign (`_mobile/*`) switches on at `max-width: 768px`.
- The sidebar collapses to a drawer and content loses its left margin at
  `max-width: 1024px` (`layout.tsx`, `Sidebar.tsx`).

So every viewport from **769px to 1024px** gets mobile navigation wrapped
around desktop content. Nobody designed that state; it is what falls out of two
rules that disagree. It is also almost exactly the iPad:

| Device | Width | Today |
|---|---|---|
| iPad mini portrait | 768 | mobile (only tablet with a real design) |
| iPad Air portrait | 820 | undesigned band |
| iPad Pro 11 portrait | 834 | undesigned band |
| iPad Pro 12.9 portrait | 1024 | undesigned band |
| iPad mini landscape | 1024 | undesigned band |
| iPad Air landscape | 1180 | desktop |
| iPad Pro 12.9 landscape | 1366 | desktop |

### Evidence

Captured 2026-08-17 with the QA `max` fixture across 8 geometries and 6 pages
(48 screenshots, baseline preserved before any change).

1. **Fifty-two pixels inverts the information hierarchy.** At 768 portrait the
   page is 1024px tall and leads with tonight's dish and a Skip button. At 820
   portrait it is 1371px tall and leads with three stat cards, with the dish
   card demoted ~540px down the page and its Skip button gone.

2. ~~A visible orphan card.~~ **Withdrawn.** `StatRow`'s 2+1 arrangement at
   641-1024 is deliberate and documented in place: operational metrics share
   row 1, the reflective metric owns row 2. Left untouched.

3. **iPad mini landscape is the worst screen shipped.** 1024 landscape renders
   1399px of single-column page inside a 768px viewport, sidebar hidden. At
   1180 landscape the same page is 926px, two-column, with the sidebar rail
   visible, and it looks good. Same posture, 156px apart.

4. **Width alone provably cannot fix this.** iPad Pro 12.9 portrait and iPad
   mini landscape are both exactly 1024px wide and both render the same layout
   at the same 1399px content height. They need opposite layouts.

5. **Touch: narrower than first claimed.** `globals.css` has
   `@media (hover: none), (max-width: 768px)` — a comma LIST, so the
   `(hover: none)` clause already suppresses hover tooltips on every touch
   device at any width. Tablets were never getting stuck tooltips; that part of
   the original finding was wrong. What remains is cosmetic `:hover` states
   across fifteen files and tap-target sizing, both low severity.
   `BugReportTrigger` did hide below 768 and therefore appeared only in the
   undesigned band, so it now follows COMPACT. (The badge seen floating over
   content in the captures was the Next.js dev indicator, not this component.)

6. **Menu columns disagree with themselves.** "This week" renders in 3 columns
   while "Next week" renders in 4, on the same page at the same width.

## The rule

```
EXPANDED  (min-width: 1024px) and (orientation: landscape)
COMPACT   (max-width: 1023.98px), (orientation: portrait)
```

These are exact logical complements, so no viewport matches both or neither.

Orientation is not decoration here. It is the only signal that separates iPad
Pro portrait from iPad mini landscape at their shared 1024px width.

### Safety property

No viewport that renders correctly today changes behaviour:

| Viewport | Today | Under the rule | Change |
|---|---|---|---|
| iPhone portrait 390 | mobile | mobile | none |
| iPhone landscape 932 | mobile | mobile (< 1024) | none |
| Laptop 1440 | desktop | desktop | none |
| Desktop 1920 | desktop | desktop | none |
| iPad portrait 820 / 1024 | undesigned | mobile | fixed |
| iPad mini landscape 1024 | undesigned | desktop | fixed |
| iPad Air landscape 1180 | desktop | desktop | none |

Only the undesigned band moves. This falls out of the rule itself rather than
requiring discipline to maintain, which is what makes the change safe to ship.

### Accepted trade-off

A portrait external monitor between 1024 and 1279 wide gets the mobile layout.
Rare for this audience, and under the fill-the-width design below it still
reads as intentional. Deliberately *not* solved with a `pointer: fine` clause,
because iPadOS reports pointer capabilities inconsistently when a Magic
Keyboard is attached, and a misfire there would reintroduce the broken band on
a real iPad.

## Design

### 1. One contract, one file

`src/app/dashboard/_shared/breakpoints.ts` exports `COMPACT` and `EXPANDED` as
media-query strings, interpolated into the styled-jsx blocks that currently
hardcode pixels. `useIsCompact` moves here and becomes orientation-aware.

This replaces the 640 / 641 / 768 / 769 / 900 / 1024 literals currently spread
across ~20 files.

Layout switching stays **CSS-only**. Both the mobile and desktop trees are
always mounted and toggled with `display: none` (`ActiveDashboard.tsx`), so
adding orientation carries no SSR or hydration risk. The hook is for behaviour
gating only.

### 2. Portrait tablets fill the width

The mobile tree now runs 0 to 1024 in portrait and must stop looking like a
stretched phone:

- container padding and max-width scale rather than assuming 390px
- two-up promotion above ~700px: dish card beside quick actions, stats paired
- the meal-square grid reflows to look deliberate at 1024
- a modest type-scale step so it reads as designed, not zoomed

### 3. Landscape tablets get 1024 back

1024 landscape becomes EXPANDED, regaining the sidebar and two-column layout it
currently loses. The desktop grid must be comfortable from 1024 up rather than
assuming the 1400px max-width canvas.

### 4. Touch across the whole range

- replace the 768-tied touch rule with a real `(hover: none)` rule
- audit the fifteen `:hover` files for touch fallbacks, `Tooltip` first
- 44px minimum tap targets across the tablet range
- `BugReportTrigger` stops overlapping content

### 5. Two concrete bugs

The StatRow orphan and the menu 3-column/4-column mismatch.

### 6. Regression guard

The capture sweep becomes a checked-in script covering 8 geometries x 6 pages,
with the two 1024 cases as explicit anchors: portrait must be COMPACT,
landscape must be EXPANDED. That is the exact pair no width rule can
distinguish, so it is the regression that matters most.

## Risks

- **styled-jsx interpolation.** `@media ${COMPACT}` must work cleanly across
  all target files. Proven on one file before converting the rest; if it
  misbehaves the contract needs a different delivery mechanism.
- **Concurrent sessions.** Nine sessions share this working tree. Tablet
  commits stay narrowly scoped so they can be cherry-picked onto their own
  branch.

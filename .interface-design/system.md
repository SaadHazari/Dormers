# Dormers Dashboard — Design System

> Extracted from the **finished desktop dashboard** (`src/app/dashboard/**`,
> `src/app/globals.css`, `_shared/tokens.ts`). This is the guardrail for the
> mobile optimization pass: the mobile build conforms to *this*, it does not
> reopen it.
>
> **Theme:** light interface (intentional — see Locked Constraints). Marketing
> site is dark; do not unify.

---

## 1. Color

### Brand
| Token | Value | Use |
|---|---|---|
| `OG` | `#f57f20` | Brand orange — **the ceiling** for any gradient/progress. Fade lighter only; never darker into amber/burnt/red. |
| `OG3` | `#ffaa00` | Lighter orange (gradient top end) |
| `NV` | `#091825` | Navy — primary foreground |
| `NV2` | `#1e3a4f` | Navy 2 (gradient/secondary) |
| `CR` | `#ede8da` | Cream — content background |

### Surface & text tokens (CSS vars, light interface)
- Page bg `--ds-page-bg #ffffff`; content bg `--ds-content-bg #ede8da`;
  content gradient `--ds-bg-gradient` (160deg cream sweep).
- Foreground ramp: `--ds-fg #091825` → `-muted .65` → `-sub .62` → `-soft .55`
  → `-faint .45` → `-tint .35` (all navy at decreasing alpha).
- Borders ramp: `--ds-border .09` → `-border2 .15` → `-border-strong .18`,
  plus per-tier soft borders.
- Semantic: success `#1d8a30`, danger `#c0392b`, each with `-wash` + `-border`.
- Orange washes: `--ds-og-wash .06`, `-wash-strong .10`, `-border .22`,
  `-border-strong .45`.

> All color lives in CSS variables in `globals.css`, mirrored as JS constants in
> `_shared/tokens.ts`. **Never hardcode hex in components** — reference the token.

---

## 2. Typography

- Body/Display: `--font-montserrat` (Montserrat). Mono: `--font-jetbrains`.
- **Type scale (8 fixed steps — snap to nearest, never invent in-between):**

| Token | px | Role |
|---|---|---|
| `--text-xs` | 11 | micro labels, tnum, eyebrows |
| `--text-sm` | 12 | small captions, info chips |
| `--text-base` | 13 | body, button labels |
| `--text-md` | 14 | card body, modal text |
| `--text-lg` | 16 | prominent body |
| `--text-xl` | 20 | section titles |
| `--text-2xl` | 28 | big metrics |
| `--text-display` | 40 | hero / page anchor |

- **Tracking (5):** tight −.02 / snug −.01 / normal 0 / wide .04 / wider .10 / widest .18.
- **Leading (4):** display 1 / tight 1.2 / normal 1.5 / relaxed 1.65.
- Eyebrows: uppercase, `--text-xs`, `--tracking-widest`.
- Button labels: uppercase, `--text-base`, `--tracking-wide`, weight 700.

---

## 3. Spacing

**Documented intent:** 4px base, scale `4, 8, 12, 16, 24, 32`.

**Actual usage (extracted frequency):** effectively a **2px base** — heavy real
use of `6, 10, 11, 14, 18, 22, 28` alongside the 4-grid. Top values by count:
`10, 12, 14, 8, 4, 6, 18, 24`.

> ⚠️ **Finding for the mobile pass:** spacing has drifted off the documented
> 4-grid. Don't "fix" desktop, but for new mobile rules prefer the canonical
> scale (4/8/12/16/24/32) so the phone layout doesn't add a third dialect.

---

## 4. Radius

| Token | px | Use |
|---|---|---|
| `--radius-sm` | 12 | chips, small controls |
| `--radius-md` | 20 | cards, panels, mobile-menu button |
| `--radius-pill` | 999 | buttons (CTAs are pills) |
| `--radius-card` (legacy) | 16 | back-compat only |
| `--radius-button` (legacy) | 12 | back-compat only |
| `--radius-small` (legacy) | 8 | back-compat only |

Prefer the `sm / md / pill` scale; legacy values exist for back-compat.

---

## 5. Depth (shadow + border tiers)

Depth is a **layered elevation system**, not borders-only. Surfaces map to tiers:

| Tier | Surface | Border | Shadow |
|---|---|---|---|
| `TIER1` | `#fcf8ee` | navy .10 | `--ds-shadow-tier1` (6/18 + 1/3) |
| `TIER2` | `#f8f3e6` | navy .07 | `--ds-shadow-tier2` (1/3) |
| `TIER3` | `#f3eedf` | navy .05 | none |
| `TIER_POP` | navy gradient `#1a3e4f→#091825` | `rgba(26,62,79,.6)` | `--ds-shadow-pop` (8/32 + 2/8) |

- Named shadows: `--shadow-sm / -md / -lg / -glow` and
  `--ds-shadow-elev / -modal`. Glow = orange `0 0 28px rgba(245,127,32,.45)`.
- **TIER_POP stays dark navy in light mode** — its text tokens
  (`TIER_POP_TEXT`: cream `#f5f0e8` / .65 / .40) do **not** flip.

---

## 6. Component patterns

### Buttons (`_shared/buttons.tsx`)
- Pill shape (`--radius-pill`), inline-flex, gap 8, uppercase, weight 700,
  tracking .04em, `--text-base`.
- `primary`: bg `OG`, white text, pad `12px 18px`, shadow `0 4px 16px rgba(245,127,32,.40)`.
- `primary-tight`: same, pad `10px 14px`, `--text-sm`, lighter shadow.
- Transition: opacity/transform/box-shadow/background/border-color @ 150ms.
- `BtnSpinner`: 12×12 rotating border-top, global `@keyframes spin`.
- ⚠️ **Do not use `CtaButton` on always-dark pages** — its `useIsLight()` goes
  dark-on-dark for light-theme OS users. Inline a page-local dark button instead.

### Cards / panels
Use the TIER surfaces above. Gradient-border + translucent interior must use a
**masked `::before`**, not the padding-box/border-box dual-background trick
(that yields an opaque interior).

### Tooltips
Pure-CSS `[data-tooltip]` with `data-tooltip-placement` (top/bottom/right/left).
Navy bg `.95`, cream text, 350ms delayed fade-in. **Hover/focus only — no touch
equivalent today** (see mobile findings).

### Focus rings
`outline: 2px solid #f57f20; outline-offset: 3px` on focus-visible across
`.dash-root / .dash-content / .dash-sidebar / .utility-cluster`.

### Motion
Global keyframes: `spin`, `urgentPulse`, `fadeUp` (14px rise), `fadeIn`,
`tooltipIn`. Respect `prefers-reduced-motion` (already checked in CheckoutPanel).

---

## 7. Responsive

### 7a. Breakpoint policy (DECIDED — via refactoring-ui)

Canonical scale, aligned to standard web breakpoints (NOT a bespoke set):

| Name | Width | Boundary |
|---|---|---|
| `xs` | `420px` | small phone — **dense media grids only** (e.g. menu food-card grids that would be unreadably cramped at 3-up). Do not use for general layout. |
| `sm` | `640px` | phone → large/landscape phone |
| `md` | `768px` | tablet |
| `lg` | `1024px` | desktop (already the dominant line in the code) |

- **Mobile-first.** Author base styles for the phone, layer complexity upward
  with `min-width`. (Current code is desktop-first `max-width` — migrate as touched.)
- **Stack on mobile, side-by-side on desktop.** Inputs full-width on mobile,
  constrained (300–500px) on desktop.
- **44px minimum touch target** on mobile for every interactive element.
- **Secondary nav → hamburger/drawer** on mobile (already partially in place).
- **No new breakpoint values.** Snap every existing query (900/920/720/640/560/
  420/1100…) to `640 / 768 / 1024` as each component is touched.
- **"Token" = convention, not CSS var** — `@media` can't read custom properties.
  Pick one documented constant set (above) and reference it everywhere; enforce
  in review. (If a JS breakpoint is needed, a single shared `BREAKPOINTS` const.)

### 7b. Baseline (CURRENT STATE — the mobile pass starts here)

**Strategy today:** desktop-first, with responsive rules written as **inline
`<style jsx>` media queries scattered per-component**. There is **no tokenized
breakpoint scale**.

**Breakpoints in the wild (by frequency):**
`1024 (×14) · 900 (×5) · 720 (×4) · 920 (×3) · 640 (×3) · 560 (×2) · 420 (×2) · 768 · 600 · 1100/901`.

- **`1024px` is the primary desktop→mobile line.** At `≤1024px`:
  - The fixed hamburger `.dash-mobile-menu` (44×44, top-left, glassmorphic) appears.
  - The sidebar collapses to a drawer (`Sidebar.tsx` hover-expand on desktop:
    icon rail → 160px label reveal on hover).
- JS-measured responsiveness is rare — only `DormWarsTour` reads
  `window.innerWidth` for tooltip placement.
- `next/image` `sizes` are set per-image (menu/review images) — decent, but
  inconsistent.

> ⚠️ **Top mobile-pass findings (carry into the audit + refactoring-ui step):**
> 1. **Breakpoints are inconsistent and untokenized.** 8+ distinct values, each
>    component picks its own. → Establish a small canonical breakpoint scale
>    (e.g. `420 / 720 / 1024`) and migrate toward it.
> 2. **Media queries are inline per component**, so there's no single place to
>    reason about mobile. → Decide a convention before editing 70 files.
> 3. **Tooltips are hover/focus-only** — no touch fallback. Any info currently
>    living only in a tooltip is invisible on mobile.
> 4. **Hover-expand sidebar** has no hover on touch — the drawer is the mobile
>    nav; verify it's complete and reachable one-handed.
> 5. **Tap targets:** hamburger is a correct 44×44; audit smaller controls
>    (chips, icon buttons, accordion headers) against a 44px minimum.
> 6. **Spacing dialect drift** (see §3) — keep mobile on the canonical scale.

---

## 8. Locked constraints (do not reopen)

- **Light dashboard theme is intentional** (interface vs. brochure). Don't unify
  with the dark marketing site.
- **Brand orange `#f57f20` is the ceiling** for gradients/progress — lighter ok,
  never darker.
- **Onboarding dark-mode page is locked** — copy its visual language, never redesign.
- **Skip-meal is irreversible** once confirmed — no undo affordances post-modal.
- **Delivery countdown is deliberately imprecise** (rounded `~Nh`, "Arriving
  soon" under 30 min; no minutes).
- **"Dorm Wars (Soon)" teaser is intentional.**
- Never mix `background` shorthand with `backgroundImage` in React inline styles.
- Only WhatsApp link is `wa.me/971504619384` (use `lib/contacts.ts`).

---

## 9. Where things live

- Tokens (CSS): `src/app/globals.css` `:root`
- Tokens (JS): `src/app/dashboard/_shared/tokens.ts`
- Buttons: `src/app/dashboard/_shared/buttons.tsx`
- Shared primitives: `src/app/dashboard/_shared/` (MealTag, HeatBar, Eyebrow,
  StatusDot, Skeleton, Tooltip, modals, etc.)
- Shell + nav: `DashboardShell.tsx`, `layout.tsx`, `Sidebar.tsx`, `SidebarDropdowns.tsx`
- Pages: `dashboard/{plan,menu,history,profile,support,explore-plans,dorm-wars}/`

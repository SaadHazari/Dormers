# MOBILE PATTERNS — the build-against-it contract

> Authoritative pattern contract for the mobile dashboard redesign. Distilled from the four SHIPPED surfaces (Home, Menu, Plan/Explore/Checkout) + the shared primitives in `_mobile/kit.tsx`. **Build a new surface against this and it will be indistinguishable from the shipped ones.**
>
> Single source of truth in code: `src/app/dashboard/_mobile/kit.tsx` (re-exports everything). A new page does **one import**. Don't re-derive values that already live here — copy them.
>
> Locked constraints (do not revisit): light theme; brand orange `#f57f20` is the gradient/progress **ceiling** (lighter fine, never darker into amber/burnt/red); breakpoints `420 / 640 / 768 / 1024`, compact pivot `(max-width: 768px)`; skip is irreversible once confirmed; countdown deliberately imprecise (`~Nh`, "Arriving soon" under 30 min, never minutes); only WhatsApp link is `wa.me/971504619384` (via `whatsAppHref()`); onboarding dark-mode page is locked.

---

## 0. The one import

```tsx
import {
  OG, OG3, NV, NV2, CR, BODY, S, cleanPlanName,        // tokens
  MOBILE_PAGE_BG, ORANGE_GRAD,                          // page gradients
  CARD, SUNSET_CARD, HERO, RECESSED, HATCH,             // surfaces
  eyebrow, eyebrowSm, heroEyebrow, dateVal, statLine,
  statNum, swatch, actionCaption,                       // type atoms
  MobileColumn, StatusPill, HeroCard, HeroTitle,
  SectionTitle, RecessedTile, InlineCaption,            // components
  heroBtn, primaryRaisedBtn, solidNavyBtn,              // button factories
  useIsCompact,                                          // hook
  MobileSheet,                                           // _shared/MobileSheet
  CompactMetricStrip, type CompactMetric,               // _shared
  computeArrivalLabel, type DeliveryWeekType,           // _shared/delivery-phase
  PlanGlyph, MealTag, HeatBar,                          // _shared atoms
} from '../_mobile/kit'
```
`MobileDatePicker` is a **separate** import — `from '../_mobile/MobileDatePicker'` (NOT in kit, NOT in `_shared`). `StatusTone` type also separate.
WhatsApp/email: `import { whatsAppHref, SUPPORT_EMAIL } from '@/shared/contacts'` — never inline the number or address. `whatsAppHref()` → `https://wa.me/971504619384`; `SUPPORT_EMAIL` → `care@dormers.ae`.

---

## 1. INTEGRATION TEMPLATE — the contract every `Mobile<Surface>` copies

### 1a. The split (desktop Client = brain, Mobile component = dumb presenter)
The desktop Client (e.g. `ActiveDashboard.tsx`, `PlanClient.tsx`) **computes every gate/label/state machine** and packs them into one flat, fully-resolved typed prop object. The `Mobile<Surface>` component:
- **never re-implements business logic / gating** — the backend enforces independently; mobile only *displays state + calls handlers*.
- receives handlers as optional `on…` callbacks.
- receives banners as **rendered `ReactNode`s** (not data) when they carry desktop-owned state.
- re-renders on a **60s tick** only for clock-driven fields:
```tsx
const [, setMinute] = useState(0)
useEffect(() => { const t = setInterval(() => setMinute(n => n + 1), 60_000); return () => clearInterval(t) }, [])
```
Shared form state (e.g. `selected`, `vegDayCount`) lives in `useState` in the Client and is passed to BOTH trees; setters use the **fn-updater shape** (`setSelected(() => null)`).

### 1b. The `<768` CSS swap — quote it EXACTLY (copy-pasteable)
Both trees render always; a pure-CSS `display` toggle picks one. **No JS viewport check, no flash, desktop DOM untouched.**

```tsx
return (<>
  <div className="surface-desktop"> {/* …existing desktop tree, untouched… */} </div>
  <div className="surface-mobile"><MobileSurface … /></div>

  <style jsx global>{`
    .surface-mobile { display: none; }
    @media (max-width: 768px) {
      .surface-desktop { display: none; }
      .surface-mobile  { display: block; }
      .dash-root { padding: 0 !important; }   /* surface owns its own padding on mobile */
    }
  `}</style>
</>)
```
- On mobile the surface owns its own padding (`.dash-root` forced to `0`). The `MobileColumn` carries `padding:'16px'` + safe-area bottom, and any heading that sits under the fixed drawer hamburger gets `paddingLeft: 56` (Plan/Menu) or `64` (Home greeting) to clear it.
- Breakpoint is `max-width: 768px` **everywhere** — also encoded in `MobileSheet` as `const COMPACT_QUERY = '(max-width: 768px)'`, read synchronously via `window.matchMedia(COMPACT_QUERY).matches`.

### 1c. The desktop↔mobile gate for SHARED open-state (critical)
If a sheet's open-state is shared with the desktop tree (e.g. Checkout's `selected`), gate it to compact or picking on desktop opens the hidden sheet and traps focus:
```tsx
const compact = useIsCompact()                 // from kit
<MobileCheckout selected={compact ? selected : null} … />
```

---

## 2. COLOR TOKENS + the brand-orange ceiling rule

```ts
OG  = '#f57f20'   // brand orange — the CEILING. lighter OK, NEVER darker into amber/burnt/red
OG3 = '#ffaa00'   // lighter orange — only the TOP of a gradient (fades lighter)
NV  = '#091825'   // navy — data + text + structure
NV2 = '#1e3a4f'   // lighter navy (hero gradient mid-stops / settled/queued)
CR  = '#ede8da'   // cream (button ink on dark)

S = {
  surface2: '#ffffff',
  border:   'rgba(9,24,37,0.09)',   // hairline divider
  border2:  'rgba(9,24,37,0.15)',   // grab-handle / stronger hairline
  fg:       '#091825',              // = NV, primary ink
  fgMuted:  'rgba(9,24,37,0.65)',   // body muted
  fgSub:    'rgba(9,24,37,0.62)',   // sub
  fgFaint:  'rgba(9,24,37,0.45)',   // eyebrows, label small-caps
}
```
Cream-on-dark ramp (declare locally on any new dark surface — strings drift slightly per surface, both valid):
```ts
const CREAM       = 'rgba(245,240,232,0.92)'   // (Menu uses 0.88)
const CREAM_MUTED = 'rgba(245,240,232,0.65)'   // (Menu uses 0.72)
const CREAM_FAINT = 'rgba(245,240,232,0.42)'   // (Menu uses 0.45)
```

### Single-meaning color rule (enforce — never violate on a new surface)
- **orange** (`OG`, or `ORANGE_GRAD = linear-gradient(180deg,#f57f20 0%,#ffaa00 100%)`): progress / delivered / CTAs / selection / "today" accent. Orange border is reserved for **today / selected** only.
- **navy** (`NV`): data + text + structure. (Home value-line numbers are NAVY, not orange.)
- **green** (`#1d8a30`, success-wash `--ds-success-wash`): live status / delivered / trust ONLY. `StatusPill` is green ONLY when `tone==='active'`.
- **slate-blue** (`#3a6f8c` on `rgba(58,111,140,0.08–0.20)`): subordinate / tentative / week-type / religious surfaces.
- **gold** (text `#7a5a00`, icon `#a37800`, fill `rgba(212,160,23,0.08)`, border `rgba(212,160,23,0.22)`): caution.
- **gray + diagonal `HATCH`**: skipped / de-emphasised.
- **Never color-alone** — pair color with icon + text on every badge/state. At most ONE orange (or one accent) value per metric strip.

### The dark `TIER_POP` spotlight — ONE per surface
The lone dark navy card is intentional contrast, not a theme violation. Two flavors:
```ts
// kit HERO — the richer 3-stop spotlight (use this for new heroes)
HERO = {
  position:'relative',
  background:'linear-gradient(150deg, #1f4456 0%, #0c1f2e 62%, #091825 100%)',
  borderRadius:24, padding:22,
  boxShadow:'0 10px 34px -12px rgba(9,24,37,0.55), 0 2px 6px rgba(9,24,37,0.18)',
  overflow:'hidden',
}
// TIER_POP — the 2-stop variant (Support account card, toast pill). Text tokens do NOT flip in dark mode:
TIER_POP      = { background:'linear-gradient(135deg, #1a3e4f 0%, #091825 100%)', border:'1px solid rgba(26,62,79,0.60)', boxShadow:'0 8px 32px rgba(9,24,37,0.22), 0 2px 8px rgba(9,24,37,0.14)' }
TIER_POP_TEXT = { primary:'#f5f0e8', muted:'rgba(245,240,232,0.65)', faint:'rgba(245,240,232,0.40)' }
```
**Rule: exactly one dark spotlight per surface.** Everything else is light cream.

### CSS-variable tokens (referenced by primitives — resolve via `var(--…)`)
```
--radius-sm:12px  --radius-md:20px  --radius-pill:999px
--ds-surface2:#ffffff  --ds-surface-tier1:#fcf8ee  --ds-surface-tier2:#f8f3e6
--ds-border-tier2:rgba(9,24,37,0.07)  --ds-shadow-tier2:0 1px 3px rgba(9,24,37,0.035)
--ds-border-strong:rgba(9,24,37,0.18)  --ds-fg-soft:rgba(9,24,37,0.55)  --ds-fg-tint:rgba(9,24,37,0.35)
--ds-danger-wash:rgba(229,62,62,0.06)  --ds-danger-border:rgba(229,62,62,0.20)  --ds-danger-fg:#c0392b
--ds-success-wash:rgba(29,138,48,0.08)  --ds-success-fg:#1d8a30
--ds-og-wash:rgba(245,127,32,0.06)  --ds-og-wash-strong:rgba(245,127,32,0.10)
--ds-og-border:rgba(245,127,32,0.22)  --ds-og-border-strong:rgba(245,127,32,0.45)
--ds-skeleton-base:rgba(9,24,37,0.04)  --ds-overlay-strong:rgba(9,24,37,0.65)
```

---

## 3. PAGE BACKGROUNDS / GRADIENTS

```ts
MOBILE_PAGE_BG =                                   // the PAGE canopy, not a card
  'radial-gradient(135% 55% at 50% 0%, rgba(245,127,32,0.06) 0%, rgba(245,127,32,0) 58%), linear-gradient(180deg, #efe8dc 0%, #e9e2d5 60%, #e7e0d2 100%)'
ORANGE_GRAD = 'linear-gradient(180deg, #f57f20 0%, #ffaa00 100%)'   // progress fill, delivered chips, resume CTA
```

---

## 4. SURFACES (spread these `CSSProperties` objects — never re-roll)

```ts
CARD = {                                            // primary light content card
  background:'#fdfbf6', borderRadius:22,
  boxShadow:'0 1px 2px rgba(9,24,37,0.04), 0 8px 24px -12px rgba(9,24,37,0.16)',
  border:'1px solid rgba(9,24,37,0.05)',
}
SUNSET_CARD = { ...CARD, background:'linear-gradient(180deg, #fdfbf6 0%, #fdfbf6 58%, #fdf1e3 100%)' }  // progress/summary
HERO       = { …see §2 }                            // dark spotlight, ONE per surface
RECESSED = {                                        // optional/rewarded items sit a tier DOWN (inset, no outer lift)
  backgroundColor:'rgba(9,24,37,0.045)', border:'1px solid rgba(9,24,37,0.08)',
  boxShadow:'inset 0 1px 2px rgba(9,24,37,0.05)', borderRadius:16,
}
HATCH = {                                           // skipped fill. LONGHAND ONLY (never `background` shorthand)
  backgroundColor:'rgba(9,24,37,0.20)',
  backgroundImage:'repeating-linear-gradient(135deg, rgba(253,251,246,0.55) 0px, rgba(253,251,246,0.55) 1.5px, transparent 1.5px, transparent 4px)',
}
// Recessed REFERENCE surface (PlanSetup, trust band — quieter than action cards, no lift):
{ background:'#f7f4ec', border:'1px solid rgba(9,24,37,0.07)', borderRadius:18, padding:18 }
// Light tiers: TIER1 #fcf8ee (sheet surface) · TIER2 #f8f3e6 (metric strip band) · TIER3 #f3eedf
```

---

## 5. TYPE SCALE — every size/weight/tracking actually in use

### Drop-in type atoms (`style={...}`)
```ts
eyebrow      = { fontSize:11, fontWeight:800, letterSpacing:'0.14em', textTransform:'uppercase', color:S.fgFaint }
eyebrowSm    = { fontSize:10, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase', color:S.fgSub }
heroEyebrow  = { fontSize:11, fontWeight:800, letterSpacing:'0.18em', textTransform:'uppercase', color:OG }   // on dark
dateVal      = { fontSize:14, fontWeight:800, color:S.fg, marginTop:4, fontFeatureSettings:'"tnum"' }
statLine     = { display:'inline-flex', alignItems:'center', gap:6, fontSize:13, color:S.fgMuted }
statNum      = { color:S.fg, fontWeight:800, fontFeatureSettings:'"tnum"' }
swatch       = { width:9, height:9, borderRadius:2, flexShrink:0 }
actionCaption= { marginTop:7, fontSize:11, fontWeight:600, lineHeight:1.3, color:S.fgMuted, textAlign:'center' }
```

### Full scale (role → size / weight / tracking / extra)
| Role | size | weight | extra |
|------|------|--------|-------|
| Big metric (meals-left / days-left) | 44 | 900 | `lineHeight:0.9`, `letterSpacing:-0.03em`, tnum |
| Price number (plan card) | 32 | 800 | `letterSpacing:-0.03em`, `lineHeight:1`, tnum |
| Page title `SectionTitle` (Home/Plan/Menu) | 24 / 22 | 800 | `lineHeight:1.2`, `letterSpacing:-0.02em`, trailing orange `.` |
| Hero H1 `HeroTitle` | 26 | 700 | `lineHeight:1.18`, `letterSpacing:-0.02em`, cream gradient text, trailing orange `.` |
| Skip-confirm H2 | 24 | 800 | `letterSpacing:-0.015em` |
| Dish-sheet / detail H2 (`SectionTitle size={21/22}`) | 21–22 | 800 | `letterSpacing:-0.02em` |
| Sheet heading (`SectionTitle size={20}`) / modal title | 20 | 700–800 | |
| Step heading (checkout) | 19 | 800 | `letterSpacing:-0.01em` |
| Macro value (detail tile) | 24 | 800 | tnum, `lineHeight:1` |
| CompactMetricStrip value | 18 | 900 | `letterSpacing:-0.02em`, tnum, nowrap |
| MacroShelf / metric value (dark) | 18 | 800 | tnum |
| Plan-card name / receipt name | 16 | 700–800 | `letterSpacing:-0.01em`, truncate |
| Sheet body | 14 | 400 | `lineHeight:1.6–1.65` |
| Hero button | 14 | 700 | `letterSpacing:0.02em` |
| Hero subtitle | 13.5 | 400 | `lineHeight:1.5`, `maxWidth:52ch` |
| Quick-action / pill button | 13.5 | 800 | nowrap |
| Greeting | 13.5 | 700 | `lineHeight:1.2`, ellipsis nowrap |
| Body / FAQ question | 13.5 | 700 | `lineHeight:1.35` |
| Value-line / wrap copy | 12.5 | 600–700 | tnum on numbers |
| FAQ answer / sub | 12.5 | 400 | `lineHeight:1.6` |
| Heat label / meta / chip | 12 | 600 | |
| Captions (inline "why") `InlineCaption` | 11.5 | 600 (700 accent) | `lineHeight:1.3` |
| Eyebrow | 11 | 800 | `letterSpacing:0.14em`, uppercase |
| CompactMetricStrip label | 10.5 | 700 | `letterSpacing:0.08em`, uppercase, `wordBreak:keep-all` |
| Eyebrow small / sheet-data eyebrow | 10–10.5 | 800 | `letterSpacing:0.16em`, uppercase |
| Footer "Made with ♥" | 10.5 | 600 | `letterSpacing:0.16em`, uppercase |

**Numerals:** every number that updates carries `fontFeatureSettings:'"tnum"'`. Single typeface everywhere (`BODY = var(--font-montserrat), Arial, Helvetica, sans-serif`; `DISPLAY === BODY` — no serif). `MONO = var(--font-jetbrains), ui-monospace, monospace` for IDs only.

---

## 6. COPY / VOICE GUIDE (real phrasings — match these)

Plain English, warm, second-person, lowercase-leaning for actions, em-dash explanations, no jargon. **Reassure first, state the one fact, em-dash the consequence.** Times always imprecise (`~`, "Arriving soon", "Delivered today" — never minutes). Currency always `AED {n}`. Delivery window always written **"7–8 PM"** (en-dash). Every heading carries a trailing orange period (`.`).

- **Greeting:** `Good morning, {name}` / `Good afternoon, {name}` / `Good evening, {name}` (defaults to `there`)
- **Value line:** `{n} dinners sorted · AED {amount} saved` (singular `dinner` at 1)
- **Status pills:** `Active`, `Paused`, `Scheduled`, `Skipped`, `Delivered`, `No delivery today`, `Back soon`
- **Hero eyebrows:** `Tonight's dish`, `Plan paused`, `Starting soon`, `Tonight`
- **Countdown:** `Arriving now` / `Arriving soon` / `Arriving in ~{n} hour(s)` / `Delivered today` / `No delivery today`
- **Button labels:** `Skip` / `Skipped tonight` / `View dish` / `Plan a skip` / `Pause` / `Resume plan` / `Plan a pause` / `Pause set · {date}` / `Manage` / `Got it` / `Renew now →` / `Change start date` / `Browse plans →` / `Choose plan` / `Selected` / `Review & pay →` / `Pay {n} AED →`
- **Confirm CTAs:** `Skip tonight`, `Yes, pause`, `Pause anyway`, `Cancel pause`, `Keep it planned`, `Cancel`
- **Disabled "why" captions (inline, never hover):** `Plan paused` · `Tonight's meal is skipped` · `No delivery today — nothing to skip` · `Past the 2 PM cutoff — skip tomorrow instead` · `No skips left this cycle` · `{n} of {m} skips left this cycle` · `You can only change the start date once.` · `Available on monthly plans` · `Your dorm is outside our delivery radius — message us on WhatsApp.`
- **Reassurance lines:** `You won't lose this meal — we'll add a make-up day at the end of your plan…` · `meals will be waiting.` · `No charge for days before.` · `nothing is lost.` · `Rest up. Next delivery Monday at 7 PM.`
- **Irreversibility note (skip):** `This can't be undone after confirm` (uppercase, danger-fg, centered)
- **Trust line (checkout):** `Powered by Stripe · Card details never touch our servers.`
- **Footer:** `Made with ♥ in Dubai` (heart filled `OG`)
- **House animation easing EVERYWHERE:** `cubic-bezier(0.16, 1, 0.3, 1)`. Durations: sheet 260ms, step crossfade 220ms, FAQ reveal 260ms, error slide-in 240ms, color transitions 150–200ms.

---

## 7. SPACING / DENSITY SCALE

- **Column rhythm: 14px** — `MobileColumn` = `display:flex; flexDirection:column; gap:14; fontFamily:BODY`. Every page is a single vertical flow with 14px gaps.
- **Page padding:** `MobileColumn style={{ padding:'16px', paddingBottom:'max(env(safe-area-inset-bottom), 24px)' }}`. Heading clears hamburger via `paddingLeft: 56` (Plan/Menu) / `64` (Home greeting).
- **Desktop margins 32–48px → 16–20px on mobile.** Hierarchy from size/weight, not air.
- **Radii:** hero/active card 24 · CARD 22 · plan card / `--radius-md` 20 · recessed/wrap tile 16 · trust band 14 · `--radius-sm` 12 · chips/pills/CTAs 999 · day-cells 5–8.
- **Padding:** hero 22 · plan/progress card 20 · quick-action btn `15px 14px` · hero btn `13px 16px` · full-width pill `14px 18px` · wrap/recessed tile `14px 16px` · banners `14px 16px` (or `12px 14px` for error) · sheet body compact `20` L/R, `4` top.
- **Grids:** auto-fit `minmax` grids become **fixed 2-across** (`1fr 1fr`) — never collapse to 1-col on narrow. This-week menu = `1fr 1fr gap:10`. CompactMetricStrip default 3 cols (degrade to 2), never 1.

---

## 8. REUSABLE KIT INVENTORY — reuse these, NEVER re-invent

| Atom | Signature | Notes |
|---|---|---|
| `MobileColumn` | `{ children, style? }` | page column, gap 14, fontFamily BODY |
| `SectionTitle` | `{ children, size=21, style? }` | h2, navy 800, ls -0.02em, trailing orange `.` |
| `HeroCard` | `{ eyebrow?, status?:{label,tone}, children, style? }` | `HERO` section; header row (orange eyebrow + StatusPill) when set |
| `HeroTitle` | `{ children, dot=true, style? }` | h1, 26/700, cream gradient text, trailing orange `.` |
| `StatusPill` | `{ label, tone }` `tone: 'active'\|'paused'\|'scheduled'\|'off'` | green ONLY when `active`; else quiet cream chip |
| `RecessedTile` | `{ children, onClick?, ariaLabel?, style? }` | `RECESSED` + flex; `<button>` (≥44px) if `onClick`, else `<div>` |
| `InlineCaption` | `{ children, tone='muted', icon?, style? }` `tone:'muted'\|'accent'\|'onDark'\|'onDarkFaint'` | the no-hover affordance substitute; 11.5/600 (700 accent) |
| `CompactMetricStrip` | `{ metrics:CompactMetric[], columns?=3, ariaLabel?, style?, className? }` | dense KPI band; see §10.3 |
| `MobileSheet` | see §10.1 | the keystone — bottom sheet <768, dialog ≥768 |
| `MobileDatePicker` | `{ value, onChange, minDate, maxDate, weekType?, cutoffActive? }` | inline calendar for sheets; inline blocked-day reason |
| `StatusPill`/`MealTag`/`HeatBar`/`PlanGlyph` | (badges/atoms) | `MealTag{kind,compact?,onDark?,oneLine?}`; `HeatBar{level:0..3}`; `PlanGlyph{planName,size=14,color=OG,strokeWidth=1.9}` |
| `heroBtn(kind, disabled=false)` | `'ghost'\|'outline'` | PAIR of secondary pills on dark hero; cream ink both; disabled = dashed |
| `primaryRaisedBtn(disabled=false)` | — | raised CARD primary on light page; orange icon; disabled = dashed |
| `solidNavyBtn` | const | sheet primary confirm; `bg NV, color #fff, radius 999, 14/800` |
| `btnStyle('primary'\|'primary-tight')` + `BtnSpinner` | from `_shared/buttons` | orange pill CTA; don't re-roll |
| `useIsCompact()` | `: boolean` | gate shared open-state to compact |
| `computeArrivalLabel(now, weekType)` / `cleanPlanName(s)` | helpers | imprecise arrival; strip emoji from legacy plan names |

Sheet footer button styles (page-local, copy verbatim — see `MobilePlan` lines 438–439):
```ts
sheetGhostBtn  = { flex:1, padding:'13px 0', borderRadius:999, border:'1px solid var(--ds-border-strong)', background:'var(--ds-surface2)', color:S.fg, fontFamily:BODY, fontSize:13.5, fontWeight:700, cursor:'pointer' }
sheetOrangeBtn = { ...solidNavyBtn, flex:1, width:'auto', background:OG, boxShadow:'0 0 16px rgba(245,127,32,0.4)' }
```

---

## 9. CONVENTIONS — 44px targets, safe-area, inline-style rule

- **44px tap targets:** close X is literally `44×44`; `RecessedTile`/`CompactMetricStrip onClick` cells become buttons ≥44px; date cells use `aspectRatio:1/1 + minHeight:40`; hero/raised/navy buttons all clear 44px via vertical padding. Back links, Change/Cancel/Manage links, eye-toggles, FAQ rows all get real hit areas (use negative-margin padding trick to keep visuals tight: `padding:'6px 4px'; margin:'-6px -4px'; touchAction:'manipulation'`).
- **Bottom safe-area:** sheet footer band uses `paddingBottom:'max(env(safe-area-inset-bottom), 14px)'`; page columns use `paddingBottom:'max(env(safe-area-inset-bottom), 24px)'`; toasts use `bottom:'max(env(safe-area-inset-bottom), 18px)'`.
- **Inline-style rule:** never `background` shorthand beside `backgroundImage` (the shorthand clears the image) — `HATCH` + date-cell hatch use longhand `backgroundColor` + `backgroundImage`.
- **Disabled = dashed faint outline** (the anti-affordance) + an `InlineCaption` reason. Never a grayed solid, never hover-only.

---

## 10. CANONICAL PATTERNS (code)

### 10.1 `MobileSheet` — the keystone
ONE container: **bottom sheet <768px**, **centered dialog ≥768px** (adopting it for an existing desktop modal is a no-op on desktop).

```tsx
interface MobileSheetProps {
  open: boolean
  onClose: () => void
  footer?: ReactNode          // action cluster — bottom-pinned band on mobile, inline-end on desktop
  dismissible?: boolean       // default true. FALSE = forcing overlay: no scrim-tap/ESC, no X, no drag
  maxWidth?: number           // desktop dialog max width, default 460
  hideClose?: boolean         // default false
  zIndex?: number             // default 300
  ariaLabel?: string
  ariaLabelledby?: string
  children: ReactNode
}
```
Contract:
- **Scrim:** `position:fixed inset:0; zIndex 300; background:rgba(9,24,37,0.65); backdropFilter:blur(6px)`; `alignItems: compact?'flex-end':'center'`; overlay fade `opacity 0→1, 0.18s`; scrim-tap → `onClose` only when `dismissible`.
- **Surface (mobile):** `...TIER1 (#fcf8ee), width:100%, borderRadius:'20px 20px 0 0', boxShadow:'0 -12px 40px rgba(9,24,37,0.25)', position:relative, display:flex; flexDirection:column; overflow:hidden`. `maxHeight 92svh` lives in `.mobile-sheet-surface-compact` CSS (NOT inline). Desktop: `...TIER1, maxWidth (460), maxHeight:88vh, borderRadius:var(--radius-md)`.
- **Entrance:** mobile `{y:'100%'}→{y:0}→exit {y:'100%'}`; desktop `{opacity:0,scale:0.94,y:14}→{1,1,0}`. Both `transition={{ duration:0.26, ease:[0.16,1,0.3,1] }}`.
- **Grab handle + drag-dismiss** (only `compact && dismissible`): visible pill `36×4, radius:999, background:S.border2`; invisible 84px drag zone (`touchAction:'none'`, `dragControls.start(e)` on its `onPointerDown` so the body scroll never fights it). Dismiss when `info.offset.y > 110 || info.velocity.y > 550`.
- **Close X:** unless `hideClose || !dismissible`. `position:absolute; top: compact?12:14; right:14; zIndex:2; 44×44; borderRadius:8; color:S.fgMuted; <X size={18} strokeWidth={2.2}/>`.
- **Body:** `flex:1 1 auto; overflowY:auto; WebkitOverflowScrolling:touch; overscrollBehavior:contain`. Padding mobile top `4` / sides `20` / bottom `footer?12:20`.
- **Footer band (mobile):** `flex:none; display:flex; gap:10; flexWrap:wrap; padding:'14px 20px'; paddingBottom:'max(env(safe-area-inset-bottom),14px)'; borderTop:1px solid S.border; background:var(--ds-surface-tier1)`. Structure as **secondary (left/Cancel) + primary (right/confirm)**; both `flex:1` to fill. Children that must own their own row use `flexBasis:'100%'`.
- Uses `useFocusTrap(open, ref)` + `useBodyScrollLock(open)` (iOS-airtight `position:fixed`); ESC closes only when `open && dismissible`. **Forcing overlay:** `dismissible={false}`.

Call site:
```tsx
<MobileSheet open={open} onClose={onClose} ariaLabel="Change start date"
  footer={<>
    <button onClick={onClose} disabled={pending} style={{ ...sheetGhostBtn, opacity: pending?0.6:1 }}>Cancel</button>
    <button onClick={handleSave} disabled={pending||!picked} style={{ ...sheetOrangeBtn, opacity: pending?0.7:1 }}>
      {pending ? 'Saving…' : 'Save new date'}
    </button>
  </>}>
  <SectionTitle size={20}>Change start date</SectionTitle>
  …
</MobileSheet>
```

### 10.2 Confirmation-dialog shape (incl. irreversibility note + CTA cluster)
A confirm sheet = `MobileSheet` with: **H2 question** (20–24/800, trailing context) → **reassuring body** (14/`S.fgMuted`/1.6 — reassure first) → optional **data row** (orange-wash card `background:var(--ds-og-wash); border:var(--ds-og-border); borderRadius:var(--radius-sm)`, eyebrow `10.5/800/0.16em/uppercase/S.fgSub` over value `16/800/tnum`) → optional **irreversibility note** → **footer pair** `[Cancel] [Confirm-orange]`.

Skip-confirm (the irreversible canonical case), exact copy:
```
H2:   "Skip tonight's meal?"
body: "You won't lose this meal — we'll add a make-up day at the end of your plan, so your end date just moves out by one delivery day."
data: End date → "+1 day" (OG)  ·  Skips left → "{left-1} / {total}"
NOTE: "This can't be undone after confirm"   // marginTop:14, fontSize:11.5, fontWeight:700, color:var(--ds-danger-fg), letterSpacing:0.04em, uppercase, textAlign:center
footer: [Cancel]  [Skip tonight]   // primary orange
```
Keep the irreversibility note + skip-irreversible rule: **no undo toasts after confirm.**

### 10.3 `CompactMetricStrip`
N KPIs as one bordered band with hairline dividers (replaces stacked tiles each eating ~⅓ viewport).
```ts
interface CompactMetric { label:string; value:ReactNode; sub?:ReactNode; glyph?:ReactNode;
  accent?:boolean; danger?:boolean; onClick?:()=>void; ariaLabel?:string }
```
- **Band:** `display:grid; gridTemplateColumns:repeat(columns,minmax(0,1fr)); background:var(--ds-surface-tier2); border:1px solid var(--ds-border-tier2); boxShadow:var(--ds-shadow-tier2); borderRadius:var(--radius-md); overflow:hidden`. `columns?: 2|3` default 3 — **does NOT collapse to 1-col**.
- **Cell:** `padding:'11px 12px'; display:flex; flexDirection:column; gap:4`. Hairline `borderLeft:1px solid var(--ds-border-tier2)` on all but first-of-row (`i % columns === 0 → none`). Tappable → full-cell `<button>`.
- **Label:** `10.5/700/0.08em/uppercase/S.fgFaint`, `overflowWrap:normal; wordBreak:keep-all`. **Value:** `18/900/-0.02em/tnum/nowrap`, color `danger?#c0392b : accent?OG : S.fg`. **Sub:** `11/S.fgMuted`. **At most ONE accent (or danger) per strip.**
```tsx
<CompactMetricStrip columns={3} metrics={[
  { label:'Delivered', value:'12/24', glyph:<Utensils size={13}/> },
  { label:'Skips left', value:'2 of 3', glyph:<SkipForward size={13}/> },
  { label:'Days left',  value:3, accent:true },
]} />
```

### 10.4 `BannerStack` one-liner
Conditional/transient banners are injected by the Client as `ReactNode`s into fixed slots; they **overlay rather than permanently shove content**. One-line layout, 44px dismiss/CTA. Variants:
- **Error:** `padding:'12px 14px'; borderRadius:12; background:var(--ds-danger-wash); border:1px solid var(--ds-danger-border); color:var(--ds-danger-fg); fontSize:13`, space-between message + `<X size=14>` dismiss.
- **Order/renew (orange):** `padding:'14px 16px'; borderRadius:18; background:linear-gradient(135deg, var(--ds-og-wash-strong) 0%, var(--ds-og-wash) 100%); border:1px solid var(--ds-og-border-strong)`. 34×34 round medallion (`<PartyPopper>`/`!` glyph, color OG). CTA pill `padding:'9px 13px'; radius:999; 11.5/700/uppercase`: enabled `bg OG, color #fff, boxShadow:'0 4px 12px rgba(245,127,32,0.40)'`; blocked `bg var(--ds-fg-tint), color rgba(255,255,255,0.85), cursor:not-allowed`.
- **Pending/promoted (Profile):** Pending → orange gradient `linear-gradient(135deg, rgba(255,170,0,0.12) 0%, rgba(245,127,32,0.10) 100%)`, border `1.5px solid rgba(245,127,32,0.40)`, pill `From next plan` (bg `#FFAA00`, text `#3a2200`), per-diff row `LABEL from(strikethrough) → to(bold)`. Promoted → green gradient `linear-gradient(135deg, rgba(29,138,48,0.10) 0%, rgba(29,138,48,0.06) 100%)`, border `1.5px solid rgba(29,138,48,0.32)`, 26px green Check circle.

### 10.5 `DisclosureCard` / FAQ accordion — CANONICAL (History/Support/Plan reuse)
No container card — hairline-separated rows, so it nests in any hierarchy. 26px orange circle toggle fills + rotates `+`→`×` on open; question turns orange when open; `0fr→1fr` grid-rows reveal (no JS measuring). Copy `MobilePlan FaqRow` verbatim:
```tsx
function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom:'1px solid rgba(9,24,37,0.08)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          gap:12, padding:'14px 2px', background:'transparent', border:'none', cursor:'pointer',
          textAlign:'left', fontFamily:BODY }}>
        <span style={{ fontSize:13.5, fontWeight:700, color: open?OG:S.fg, lineHeight:1.35, transition:'color 180ms' }}>{q}</span>
        <span style={{ flexShrink:0, width:26, height:26, borderRadius:999, display:'inline-flex',
          alignItems:'center', justifyContent:'center',
          background: open?OG:'var(--ds-og-wash-strong)', border:`1px solid ${open?OG:'var(--ds-og-border)'}`,
          color: open?'#fff':OG, transform: open?'rotate(135deg)':'rotate(0deg)',
          transition:'transform 240ms cubic-bezier(0.16,1,0.3,1), background 200ms, color 200ms' }}>
          <Plus size={15} strokeWidth={2.6} />
        </span>
      </button>
      <div style={{ display:'grid', gridTemplateRows: open?'1fr':'0fr', transition:'grid-template-rows 260ms cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ overflow:'hidden' }}>
          <p style={{ margin:'0 2px 14px', fontSize:12.5, color:S.fgMuted, lineHeight:1.6 }}>{a}</p>
        </div>
      </div>
    </div>
  )
}
```
Section wrapper: `marginTop:10; paddingTop:18; borderTop:1px solid rgba(9,24,37,0.08)` + `eyebrow` label (optionally `<HelpCircle size={13} color={OG}/>` lead).

### 10.6 `ContactActionRow` (prioritized channel row)
Collapses "3 equal `minHeight:260` cards" into a **prioritized vertical stack** — one primary, rest compact. WhatsApp green primary + ghost-orange email secondary is the locked channel vocabulary.
- **Primary (WhatsApp):** full-width `<a href={whatsAppHref()} target="_blank" rel="noreferrer">`, `padding:'13px'/CTA, borderRadius:999, background:'#25D366', color:#fff, fontSize:13/700/uppercase/letterSpacing:0.06em, boxShadow:'0 6px 18px rgba(37,211,102,0.30)'`, label `Open WhatsApp →`. Eyebrow `Fastest · ~15 min` (color `#1ea34d`).
- **Secondary (Email):** compact ghost-orange `<a href={`mailto:${SUPPORT_EMAIL}`}>`, `padding:'11px 18px', borderRadius:999, background:'rgba(245,127,32,0.14)', border:'1px solid rgba(245,127,32,0.25)', color:OG, 12/700/uppercase`, label = `care@dormers.ae`.
- Never inline the number/email — `whatsAppHref()` / `SUPPORT_EMAIL` from `@/shared/contacts`.

### 10.7 List-row (recognition item — History)
Stacked block `name+glyph → dates → CompactMetricStrip`, ~6/screen. Row = `{ ...CARD, padding:'12px 14px', borderRadius:14, gap:6 }`. Title line `display:flex; gap:8; fontSize:13.5–16; fontWeight:700; color:S.fg` with `<PlanGlyph planName size={16} color="currentColor"/>` + `cleanPlanName(plan_name)`. Date line `marginTop:6; fontSize:12; color:S.fgMuted; tnum` → `{fmt(start)} → {fmt(end)}`. Stats → left-aligned `CompactMetricStrip` (Delivered / Skipped / Completion%, completion `accent`).

### 10.8 Section eyebrow (with hairline rule)
```tsx
<div style={{ display:'flex', alignItems:'center', gap:12, marginTop:4 }}>
  <span style={eyebrow}>{label}</span>
  <span style={{ flex:1, height:1, background:S.border }} />
</div>
```

### 10.9 Full-width CTA + inline disabled-reason caption (THE core touch pattern)
Every disabled/locked control is a full-width pill with an **inline 11.5px caption underneath stating WHY** — the touch substitute for a hover tooltip.
```tsx
<button onClick={disabled ? undefined : onAction} disabled={disabled}
        style={disabled ? darkDisabledPill : orangePill}>Renew now →</button>
<div style={{ marginTop:8, fontSize:11.5, fontWeight:600, color:disabled?CREAM_MUTED:CREAM_FAINT, lineHeight:1.4 }}>
  {disabled ? 'Your dorm is outside our delivery radius — message us on WhatsApp.' : 'Choose a plan + start date.'}
</div>
```
Button atoms (`width:100%; padding:'14px 18px'; borderRadius:999; fontSize:13.5`):
```ts
orangePill       = { …, gap:8, background:OG, color:'#fff', border:'none', fontWeight:800, letterSpacing:'0.04em', boxShadow:'0 6px 18px -6px rgba(245,127,32,0.6)' }
darkDisabledPill = { …, background:'rgba(237,232,218,0.05)', color:'rgba(245,240,232,0.45)', border:'1px dashed rgba(237,232,218,0.26)', fontWeight:800, cursor:'default' }  // DASHED anti-affordance
darkOutlinePill  = { …, background:'rgba(237,232,218,0.10)', color:CREAM, border:'1px solid rgba(237,232,218,0.34)', fontWeight:700 }
```
Light-page equivalents use `primaryRaisedBtn`/`heroBtn` from kit (disabled → `#f6f3ec` + `1px dashed rgba(9,24,37,0.18)`).

### 10.10 44px target + safe-area (quick reference)
- Close X `44×44`; tappable strip/tile cells become `<button>` ≥44px; date cells `aspectRatio:1/1; minHeight:40`.
- Tight-looking but real hit area: `padding:'6px 4px'; margin:'-6px -4px'; touchAction:'manipulation'`.
- Bottom inset on every scroll container that can reach the screen bottom: `paddingBottom:'max(env(safe-area-inset-bottom), {14|18|24}px)'`.

---

## Reusable atom checklist (reuse, never re-invent)
Surfaces: `CARD`, `SUNSET_CARD`, `HERO`/`HeroCard`, `RECESSED`/`RecessedTile`, `HATCH`, `TIER_POP`/`TIER1`/`TIER2`/`TIER3`. • Type: `eyebrow`, `eyebrowSm`, `heroEyebrow`, `dateVal`, `statLine`, `statNum`, `swatch`, `actionCaption`, `HeroTitle`, `SectionTitle`. • Layout: `MobileColumn`, `MobileSheet`, `CompactMetricStrip`, `MobileDatePicker`. • States/badges: `StatusPill`, `MealTag`, `HeatBar`, `PlanGlyph`, `InlineCaption`. • Buttons: `heroBtn`, `primaryRaisedBtn`, `solidNavyBtn`, `btnStyle('primary'|'primary-tight')`, `BtnSpinner`, `sheetGhostBtn`/`sheetOrangeBtn`. • Helpers: `useIsCompact`, `computeArrivalLabel`, `cleanPlanName`. • Gradients/tokens: `MOBILE_PAGE_BG`, `ORANGE_GRAD`, `OG/OG3/NV/NV2/CR/BODY/S`. • Contacts: `whatsAppHref()`, `SUPPORT_EMAIL`.

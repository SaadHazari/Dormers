# Dormers Dashboard — Mobile Redesign Canonical Spec

> Governing principle: **mobile is a separate, height-optimized UI, not a desktop reflow.** We have height, not width. We optimize vertical scan order and density, decide every element's fold depth, and make each element earn its vertical cost. Desktop stays as-is behind 1024px.
>
> Locked constraints (do not revisit): light theme; brand orange `#f57f20` is the gradient/progress ceiling (lighter fine, never darker into amber/burnt/red); breakpoints 640 / 768 / 1024 (+420 dense); skip is irreversible once confirmed; countdown is deliberately imprecise (`~Nh`, "Arriving soon" under 30 min, no minutes); only WhatsApp link is `wa.me/971504619384`; onboarding dark-mode page is locked.

---

## 1. Mobile North Star

A Dormers phone session answers one question per screen and puts the one action that matters in the thumb zone — status leads, reflection sinks, and all depth lives one tap down in a bottom sheet — so the surface itself stays light, glanceable, and never a shrunk-down desktop.

---

## 2. Global Principles (govern every surface)

1. **Lead with the job, defer the analytics.** Each surface has one first-glance answer (Home: tonight's hero; /plan: status hero; /explore: price→checkout; Menu: tonight's dish+ETA; History: the row list; Profile: verification badges; Dorm Wars: wallet+earn action; Shell: the content + Now badge). It owns the first ~700px; reflective/historical/setup content moves below the fold.
2. **No information or affordance may live solely in `:hover` / `title` / `data-tooltip` on touch.** Every lock reason, EDIT hint, "Tentative" note, disabled-CTA explanation, reward-window detail, and bug-report label becomes always-visible inline text or a tap-to-open sheet. This is the single biggest cross-cutting hazard.
3. **Modals and rail-anchored popovers become bottom sheets.** One shared `MobileSheet` primitive (grab handle, safe-area padding, scrim-dismiss, bottom-pinned primary CTA, internal scroll) replaces every centered dialog and every left-anchored dropdown. Forcing overlays keep no-backdrop-dismiss + ESC.
4. **Compress stacked/auto-fit metrics into a compact N-across strip.** A single metric must never own ~1/3 of a phone viewport. Three KPIs = one tight row; reuse one `CompactMetricStrip`. Never de-duplicate the same number twice on one screen.
5. **44px minimum tap target + bottom safe-area everywhere.** Back links, dismiss X's, "Change/Cancel/Manage" links, eye-toggles, FAQ rows, list rows — all get real hit areas. Primary CTAs sit in the thumb zone (bottom-pinned in sheets/takeovers).
6. **Never color-alone.** Status badges, urgency states, streak-ready glows, "Expiring"/"Locked"/"Tap to claim" chips all pair color with an icon + text label. (Most already do — preserve, never regress.)
7. **Chrome vacates the screen.** Nav lives at the bottom on demand, not as a persistent rail or a top-left hamburger. Every content page reserves bottom safe-area inset so the nav never occludes content or toasts.
8. **Density via the constrained scale, not whitespace.** Cut desktop's breathing margins (32–48px) to ~16–20px; hierarchy comes from size/weight, not air. The lone dark `TIER_POP` spotlight per surface is intentional contrast, not a theme violation — keep it.

---

## 3. Shared Component Patterns (build once, reuse everywhere)

These are the reusable primitives. Building them first is what makes the per-surface work cheap.

### 3.1 `MobileSheet` (the keystone)
Bottom-anchored sheet: rounded top corners, grab handle, safe-area bottom padding, scrim tap-to-dismiss (except forcing overlay), swipe-down-to-dismiss, internal scroll to ~92vh, **primary CTA pinned to the bottom safe area**, secondary as outline/text in the same bottom cluster. Reuses the existing `useFocusTrap`.
**Replaces:** Home skip/pause/queued-pause/cancel-pause/future-skip/plan-pause/savings-benchmark modals; Plan ChangeStartDate + cancel-pause modals + CheckoutPanel; Menu DishDetailModal; Profile meal-prefs + 3 security ModalShell flows + account-edit form; Dorm Wars 9 detail modals; Shell Refer/Now/Profile popovers.

### 3.2 `MobileDatePicker` (sheet-wrapped calendar)
Wraps the existing DateField calendar as a sheet instead of an absolutely-positioned popover (which clips at screen edges / under keyboard). 7-col grid → ~44px cells at 360px, persistent legend pinned below, **tapping a non-delivery day surfaces an inline reason** (never hover/title, never hatch-color alone).
**Used on:** Plan CheckoutPanel, ChangeStartDateModal; Home future-skip/plan-pause sheets.

### 3.3 `CompactMetricStrip`
3-across (degrade to 2-across) label/value band, `tnum` figures, one orange accent value max, optional small glyph, ~11px caps label / ~15–22px value. A `dense` variant of the existing `Stat`. Override per-surface any existing `≤640 → 1-column` rule.
**Used on:** Home StatRow; Plan ActivePlanCallout metric grid; History row stats; Profile meal-prefs + account-details grids; Dorm Wars Wallet|Streak pair; Takeover RevealScreen StatBlocks.

### 3.4 `BottomNav` + `MoreSheet` (nav chassis)
Persistent ~56px + safe-area bottom tab bar holding the 3–4 top jobs (icon + tiny label, never icon-alone) with the Now count badge; lower-frequency destinations + identity header + Refer + Sign out + Report-a-bug live in a `MoreSheet`. Kills hover-to-expand and the top-left hamburger.
**Used on:** every dashboard page (inherited via the layout shell).

### 3.5 `ContactActionRow` (prioritized channel row)
Collapses "3 equal `minHeight:260` cards that reflow to 1fr" into a prioritized vertical stack where one item is clearly primary (full-width green WhatsApp CTA) and the rest shrink to compact rows (ghost-orange email). WhatsApp green primary + ghost-orange secondary is the locked channel vocabulary.
**Used on:** Support contact block; Shell Refer sheet share action; any "reach us" cluster.

### 3.6 `DisclosureCard` / native list-row
Whole-card or whole-row tap target that opens a `MobileSheet` for detail; collapsed by default; visible chevron signifier. Generalizes the FAQItem accordion, the Dorm Wars `Column` shell, the Side Quests list, SecurityRow, Support account-info strip.
**Used on:** Support + Plan FAQ; Profile SecurityRows; Dorm Wars cycle/lifetime/side-quest columns; Support reference strip.

### 3.7 `BannerStack` (compact one-line banner)
Single compact mobile banner component (one-line layout, 44px dismiss/CTA) for the order/out-of-zone/profile-gate/renew/wrap/cancel banners. Conditional, transient ones overlay rather than permanently shove content.
**Used on:** Home + Plan top banners; Profile pending/promoted banners.

### 3.8 `StickyBottomCTA` (takeover/forcing action bar)
~50px full-width orange primary pinned to bottom safe area + secondary as outline/text in the same cluster; disabled state is a visible dashed/greyed affordance. "Save & continue later" folds into this cluster, not a separate footer.
**Used on:** Weekly/Monthly takeovers per-step; MonthlyWrapForceOverlay; (candidate) sticky "Send a Free Meal" on Dorm Wars.

---

## 4. Global Fold & Density Strategy

**First glance (~first 700px, no scroll):** the surface's single job-answer + its primary action, plus any *blocking* gate (out-of-zone, profile gate, verification status) and any *failure/confirmation* status. Exactly one element per surface earns large height; everything else at first glance is compressed to a line or a strip.

**Second fold:** supporting numbers (metric strip), the secondary action, the next-most-relevant card.

**Third / deep fold:** reflective and reference content — progress timelines, savings detail, account reference data, history records, social-proof feeds, footers.

**Sheet-or-hidden:** all dense detail, all edit/picker forms, all per-item drill-downs, all confirmations. This is *why* the visible surface can be so compressed — depth has a home one tap down.

**Density rules:** desktop section margins 32–48px → 16–20px; display H1s drop from their clamp floor (~22–28px on mobile); auto-fit `minmax` grids become fixed 2-across; equal `minHeight:260` card rows become prioritized stacks; redundant numbers shown once; transient banners overlay rather than permanently consume height.

**Chrome cost = 0 on content pages:** nav and trays occupy no permanent vertical space; they are summoned. Pages reserve bottom inset only so the persistent tab bar never overlaps.

---

## 5. Phased Roadmap (dependency-aware: foundation → shared → surfaces by daily-use value)

### Phase 0 — Foundation primitives
`MobileSheet`, `MobileDatePicker`, `CompactMetricStrip`, the 44px-target + safe-area utility conventions, and the global "kill hover-only affordance" audit/rule.
*Rationale:* every later phase depends on these. The codebase has **no** shared Sheet primitive today (FutureSkip/PlanPause/SavingsBenchmark modals are each bespoke), so this is genuine net-new foundation that unblocks all modal-bearing surfaces.

### Phase 1 — Shell & nav chassis
`BottomNav` + `MoreSheet`, convert Refer/Now/Profile rail popovers to bottom sheets, move primary nav off the top-left drawer, reserve content bottom-inset, retire the hamburger.
*Rationale:* every surface renders inside the shell; nav reachability and the Now tray gate the whole experience. Ships the chassis all content pages inherit.

### Phase 2 — Dashboard Home (highest daily-use)
Reorder to hero-first: HeroToday → QuickActions stack → CompactMetricStrip → PlanProgress below fold; convert all confirm/picker modals to sheets; surface skip lock-reasons inline; collapse banners into BannerStack.
*Rationale:* the most-opened surface and the canonical proving ground for hero-first + metric-strip + sheet patterns.

### Phase 3 — Menu
Hero spotlight reordered (photo → name → countdown → macros → truncated description); this-week grid 2-across with today promoted; next-week peek strip; DishDetailModal → bottom sheet.
*Rationale:* second-most-opened daily surface; reuses Phase 0 sheet + the today-status/countdown pattern shared with Home.

### Phase 4 — Plan & Checkout (two modes, two layouts)
Treat /plan (status-first) and /explore (buy-first) as independent mobile layouts; ActivePlanCallout metric strip + full-width actions; CheckoutPanel → rising bottom sheet with bottom-pinned CTA; PlanCards single-column with recommended-first and feature disclosure; PostCutoff/ChangeStartDate/cancel-pause → sheets.
*Rationale:* the revenue surface; heaviest modal + date-picker + disabled-reason load, so it must come after the sheet/date primitives are proven.

### Phase 5 — Profile & Security
Verification-first order; SecurityRows as tappable list rows; meal-prefs + 3 security flows + account-edit → sheets; read-only grids 2-across; pending/promoted banners compacted.
*Rationale:* four modals collapse onto the shared sheet; lower frequency than Home/Menu/Plan but high-trust.

### Phase 6 — Dorm Wars Hub
Compress chrome to identity line + Wallet|Streak pair; Send-a-Free-Meal earns first/second-fold (optional sticky bottom bar); Side Quests as native list (candidate promotion above progress bars); Column cards compressed, detail in sheets; 9 detail modals → sheets; re-verify tour spotlight on moved targets.
*Rationale:* Premium-gated subset of users; richest sheet payload; depends on the proven sheet + metric-pair + list-row patterns.

### Phase 7 — History & Support (low-frequency reference)
History rows as compact recognition list-items with CompactMetricStrip; Support as channels-first ContactActionRow + reference strip + urgent-first FAQ.
*Rationale:* lowest daily-use, mostly reuse of already-built patterns (metric strip, contact row, disclosure); cheap to finish last.

### Phase 8 — Time-bound takeovers polish
Weekly/Monthly review takeovers + MonthlyWrapForceOverlay: top-aligned step content, slim sticky header (reward chip de-hovered), StickyBottomCTA per step, MealGrid 2-across, RevealScreen StatBlocks 2-across.
*Rationale:* distinct from nav/content; the Now-tray architecture already routes time-bound surfaces here, so it's a self-contained finishing pass.

---

## 6. Cross-Cutting Decisions for the Product Owner

See the structured `topDecisionsForUser` for the full fork list with recommendations. The headline forks: bottom tab bar vs. keep the ≤1024 left drawer (the decision that dictates the whole shell); whether mobile scan order may diverge from desktop (Side Quests above progress bars; recommended Premium card to top); global vs Dorm-Wars-only sheet conversion; and whether disabled-reason inline captions also change desktop or stay mobile-only.

---

## 7. Per-Surface Spec

For each surface: primary mobile job, scan order, and the element fold/priority table. (Compiled from the eight per-surface analyses; element rows abbreviated to fold + priority + the mobile move.)

### 7.1 Shell, Nav & Modals
**Job:** get to the page or act on a time-bound prompt with one thumb. Takeovers: complete a multi-step review comfortably.
**Scan order:** Content area → BottomNav (Dashboard / Menu / Plan / Now+badge) → Now bottom sheet → MoreSheet (identity, Refer, Explore, Dorm Wars+Soon, Support, Profile, billing, Report-a-bug, Sign out) → Refer sheet → triggered overlays (ForceOverlay, then takeover).

| Element | Fold | Pri | Mobile move |
|---|---|---|---|
| Nav rail | sheet | 1 | → persistent bottom tab bar; kill hover-expand |
| Hamburger | first-glance | 3 | eliminate (or become a More tab) |
| Logo | sheet | 5 | no permanent chrome; MoreSheet header only |
| Nav links | first-glance | 1 | top 3–4 = tabs, rest → MoreSheet list |
| Soon/disabled item | sheet | 5 | persistent Soon pill, no tooltip |
| Refer rail row | sheet | 3 | featured MoreSheet row → Refer sheet |
| Refer panel | sheet | 3 | → bottom sheet, share in thumb reach |
| Now trigger | first-glance | 1 | → bottom tab with always-visible count badge |
| Now panel + cards | sheet/first | 1–2 | → bottom sheet; WrapCard/PendingReview full CTAs 48px |
| Profile chip + dropdown | sheet | 2 | → Account tab / MoreSheet identity + sheet |
| Bug-report icon | sheet | 4 | → labeled list row (no hover tooltip) |
| Content-border card | first-glance | 2 | tighten padding; reserve bottom inset |
| ForceOverlay | first-glance | 1 | phone-height card, bottom-pinned CTAs, keep no-dismiss+ESC |
| Takeover header/progress/steps/CTA/footer/reveal | first–deep | 1–3 | slim sticky header (de-hover reward chip), top-aligned steps, 2-across grids, StickyBottomCTA, footer folds in |

### 7.2 Dashboard Home (ActiveDashboard)
**Job:** "Is dinner coming tonight, and do I need to do anything?"
**Scan order:** Error toast (on failure) → gates/order banner (when active) → renew banner (above hero only on last-day) → 1-line greeting → HeroToday → QuickActions stack → CompactMetricStrip (Deliveries · Days · Saved) → MonthlyWrapStrip / softer renew → PlanProgress headline+bar → timeline+renew (de-duped) → Up-next coda.

| Element | Fold | Pri | Mobile move |
|---|---|---|---|
| Greeting ribbon | first-glance | 4 | one compressed line, equity → single stat |
| Order/OutOfZone/Profile banners | first-glance | 1–3 | BannerStack one-line, 44px X/CTA |
| Renew banner | second/above-hero | 3 | single row; above hero only daysToEnd===0 |
| MonthlyWrapStrip | second | 4 | below hero; or Now tray |
| StatRow ×3 | first-glance | 2 | → one CompactMetricStrip (override ≤640 1-col) |
| Saved tile | second | 3 | populated → strip cell; detail/EDIT → savings sheet; empty → slim setup row |
| HeroToday (all states) | first-glance | 1 | promote above StatRow; tighten padding; cap name ~28–30px |
| QuickActions | first-glance | 1 | chromeless full-width stack under hero; "Plan a skip" → More sheet |
| Skip-quota chip + locks | first-glance | 2 | lock reason inline, not hover |
| PlanProgress bar + pills | second | 3 | below fold; pill tap → per-day sheet (no hover/3px target) |
| Planned-pause / timeline / renew | deep | 4 | compact; Cancel 44px; drop duplicate Days-left |
| Up-next coda | deep | 4 | left-aligned wrapping; Manage 44px |
| Skip / pause / picker / savings modals | sheet | 1–3 | → MobileSheet; keep irreversibility note; no undo |
| Resume/checkout celebration overlays | sheet | 2 | keep; verify safe-area fit |

### 7.3 Plan & Checkout (/plan + /explore, one file, two jobs)
**Job:** /plan = "where does my plan stand?"; /explore = "pick a plan and pay."
**Scan order (route-dependent):** /explore → cancelBanner → header → OutOfZone → trust strip → pref pills → VegDayPicker → plans grid (recommended first) → CheckoutPanel (receipt → credit → veg picker → date+CTA → trust). /plan → ActivePlanCallout → planned-pause → action → QueuedSub → change-plan → PlanSetup → FAQ → Past plans → footer.

| Element | Fold | Pri | Mobile move |
|---|---|---|---|
| cancelBanner | first-glance | 2 | one line, 44px X |
| Header | first-glance | 3 | H1 ~28px, cut 48px margin, trim/drop paragraph on /plan |
| ActivePlanCallout | first-glance | 1 | keep dark hero; metrics → 3-across strip; action full-width below number |
| Planned-pause banner | first-glance | 2 | inline; Cancel 44px |
| Right-side action | first-glance | 2 | full-width below number; disabled reason inline caption |
| QueuedSubCallout | second | 2 | de-hero days number; full-width action; Tentative inline |
| Change-plan strip | second | 3 | stacked + full-width CTA |
| PlanSetupCard | third | 4 | fixed 2-up dial grid (no auto-fit sprawl) |
| FAQ accordion | deep | 4 | keep; padding 18; 44px rows |
| Past plans | deep | 5 | compact rows; cap with Show-all |
| trust strip | first-glance | 3 | 3-up icon band, not 3 stacked cards |
| pref+week pills | first-glance | 2 | one wrapping line; Change 44px; drop AED note |
| VegDayPicker | first-glance | 2 | required gate; 44px pills; keep pulse hint |
| OutOfZone | first-glance | 1 | full-bleed; WhatsApp 44px |
| plans-grid + card internals | second | 1–2 | single column, recommended first, feature disclosure, selection color+label |
| CheckoutPanel (receipt/credit/veg/action/helper) | second | 1–3 | → rising MobileSheet; bottom-pinned CTA; date above CTA; inline disabled reasons |
| DateField popover | sheet | 1 | → MobileDatePicker sheet; inline disabled-day reason |
| PostCutoffOverlay | sheet | 2 | keep full-screen dark interrupt; verify fit |
| ChangeStartDate / cancel-pause modals | sheet | 2–3 | → MobileSheet, bottom CTAs |
| Footer | deep | 5 | unchanged |

### 7.4 Menu
**Job:** "What am I getting tonight, and when does it arrive?"
**Scan order:** title → preference row → "Today" eyebrow → TodaySpotlight (photo→name→countdown→macros→trunc. description) → "This week" → 2-across grid (today promoted) → "Next week" peek → DishDetail sheet on tap.

| Element | Fold | Pri | Mobile move |
|---|---|---|---|
| Page title | first-glance | 3 | ~26–28px, margin 32→16 |
| Preference row | first-glance | 4 | one meta line; Change 44px |
| Section eyebrows | second | 4 | keep, tighten gaps (eyebrow 10 / section 20) |
| TodaySpotlight (active) | first-glance | 1 | reorder: countdown above description; photo ~180–200px |
| Spotlight Sunday/resumed states | first-glance | 1 | keep copy, cut padding |
| This-week grid | second | 2 | 2-across (override ≤420 1-col); today wider |
| No-delivery / plan-ends cards | second–third | 2–3 | keep 4 signals; whole card 44px CTA; optional explicit Renew pill |
| Next-week strip | deep | 4 | densest; 2–3 across or horizontal scroll |
| DishDetailModal | sheet | 3 | → bottom sheet; home of full description |

### 7.5 Profile & Security
**Job:** check/correct the facts the kitchen relies on; fix verification.
**Scan order:** header → identity card → Security card → Email/Password/WhatsApp rows → pending/promoted banner → meal-prefs (full-width Edit) → 2-across prefs grid → account details (compressed) → footer.

| Element | Fold | Pri | Mobile move |
|---|---|---|---|
| Header | first-glance | 3 | H1 ~26px, margin 32→16 |
| Identity card | first-glance | 2 | padding 28→18, avatar 48px, keep horizontal |
| Security card | first-glance | 1 | promote above account details; padding 24→16 |
| SecurityRow | first-glance | 1 | 2-tier row, whole-row trigger, 44px, no hover-only |
| StatusBadge | first-glance | 1 | right-aligned column of badges; keep icon+label |
| Account details | second | 3 | demote; 2-up read-only grid |
| Account edit form | sheet | 3 | → MobileSheet, bottom-pinned Save |
| Pending banner | second | 2 | tighten; Discard 44px |
| Promoted banner | second | 3 | keep, reduce padding |
| Meal-prefs header | third | 2 | full-width Edit CTA |
| Meal-prefs read-only grid | third | 2 | fixed 2-across |
| Save toasts | second | 4 | keep inline, no jank |
| Edit-prefs modal | sheet | 1 | → MobileSheet, sticky footer, week toggle full-width <360 |
| Security ModalShell ×3 | sheet | 1 | → MobileSheets; password scrolls, button pinned; numeric inputMode |
| Footer | deep | 5 | unchanged |

### 7.6 Dorm Wars Hub
**Job:** "Did I earn anything, and how do I earn more right now?"
**Scan order:** Celebration → Doubler → identity line → Wallet|Streak pair → HeroCTA (Send a Free Meal) → Side Quests → Cycle → Lifetime → Squad → ActivityFeed → detail sheets.

| Element | Fold | Pri | Mobile move |
|---|---|---|---|
| PremiumGateOverlay | first-glance | 1 | full sheet; perks 2-up→1-up <360; sticky upgrade CTA |
| Celebration/Doubler banners | first-glance | 2–3 | one line; 44px X; drop explanatory clause |
| Progression block | first-glance | 2 | one identity row, avatar 38px |
| Wallet chip | first-glance | 1 | left of 2-across pair; AED prominent |
| Streak chest strip | first-glance | 2 | right of pair; keep ready-glow (not color-alone) |
| HeroCTA | first-glance | 1 | full-width pill; trim helper; optional sticky bottom bar; milestone shown once |
| Side quests | third→promote | 2 | native list; top claim row lifted; candidate above progress bars |
| Cycle column | second | 2 | one bar + 1 line + meta; dots → sheet |
| Lifetime column | third | 3 | slim bar + next-tier line; dots → sheet |
| Scouts strip | deep | 3 | keep horizontal scroller as-is |
| ActivityFeed | deep | 4 | 1 pulse + ≤2 recent |
| Tour | sheet | 4 | re-verify spotlight on moved targets; 44px controls |
| 9 detail modals | sheet | 2 | → MobileSheets, bottom CTAs |

### 7.7 History
**Job:** find a past plan I liked to re-order it.
**Scan order:** back link → compressed header → recognition rows (name+glyph → dates → CompactMetricStrip) → or empty state.

| Element | Fold | Pri | Mobile move |
|---|---|---|---|
| Back link | first-glance | 3 | 44px hit area, keep label |
| Header | first-glance | 2 | H1 22–24px, trim caption |
| Empty state | first-glance | 4 | reduce padding; optional menu link |
| Row container | first-glance | 1 | stacked block (name→dates→strip), ~6 rows/screen |
| Stat blocks | first-glance | 1 | → left-aligned CompactMetricStrip, one orange accent |
| PlanGlyph | first-glance | 2 | keep inline |

### 7.8 Support
**Job:** reach a human now with least friction.
**Scan order:** header → "Get in touch" → WhatsApp row (primary) → Email row (secondary) → Account reference strip (collapsed) → "Common questions" → FAQ (urgent-first) → footer.

| Element | Fold | Pri | Mobile move |
|---|---|---|---|
| Header | first-glance | 2 | H1 ~22–24px, margin 36→20, keep 15-min line |
| Section eyebrows | first/second | 3–4 | keep cheap dividers |
| WhatsApp card | first-glance | 1 | → ContactActionRow primary; kill minHeight 260; full-width green CTA |
| Email card | first-glance | 2 | secondary compact row; relabel "Email us" |
| Account info card | second | 3 | → collapsible reference strip; optional copy-ID |
| FAQ accordion | third | 2 | keep; reduce padding; urgent-first order |
| Footer | deep | 5 | keep; clear safe-area |
| data-tooltips | — | — | drop / convert to visible sub-labels |

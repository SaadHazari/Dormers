# Dormers Dashboard — Mobile Redesign Canonical Spec

> Governing principle: **mobile is a separate, height-optimized UI, not a desktop reflow.** We have height, not width. We optimize vertical scan order and density, decide every element's fold depth, and make each element earn its vertical cost. Desktop stays as-is behind 1024px.
>
> Locked constraints (do not revisit): light theme; brand orange `#f57f20` is the gradient/progress ceiling (lighter fine, never darker); breakpoints 640 / 768 / 1024 (+420 dense); skip is irreversible once confirmed; countdown is deliberately imprecise (`~Nh`, "Arriving soon" under 30 min); only WhatsApp link is `wa.me/971504619384`; onboarding dark page is locked.

## 1. Mobile North Star
A Dormers phone session answers one question per screen and puts the single action that matters in the thumb zone — status leads, reflection sinks, and every bit of depth lives one tap down in a bottom sheet — so the surface itself stays light, glanceable, and never a shrunk-down desktop.

## 1b. Locked Decisions (2026-06-02)
The 7 cross-cutting forks, resolved by the product owner:
1. **Navigation: KEEP the existing left slide-in drawer + hamburger** (NOT a bottom tab bar). → Phase 1 "shell chassis" shrinks: no bottom-nav to build. Keep the drawer (hamburger toggle already fixed). Still: convert the Now/Refer/Profile rail popovers to `MobileSheet`, and reserve a bottom safe-area inset for toasts/BugReportTrigger.
2. **Mobile scan order may diverge from desktop** where the job demands it (JTBD wins). Confirmed by the "separate mobile UI" direction.
3. **Build one shared `MobileSheet` in Phase 0** and route all ~25 modals/popovers through it.
4. **Checkout = rising bottom sheet** on plan selection (commitment total + Pay pinned to bottom safe area), on `/explore` and `/plan`.
5. **Disabled/locked captions = mobile-only for v1** (desktop keeps hover tooltips; a desktop a11y pass is a noted follow-up).
6. **Keep the cream orange-bordered content frame** on mobile with tighter padding + bottom safe-area inset.
7. **Dorm Wars / MonthlyWrapForceOverlay on 360px:** shrink the medallion so the forced CTA needs no scroll; sticky "Send a Free Meal" bar is a later A/B candidate, not a default.

## 2. Global Principles
1. **Lead with the job, defer the analytics.** One first-glance answer per surface owns the first ~700px; reflective/historical/setup content moves below the fold.
2. **No hover-only affordance on touch.** Every lock reason, EDIT hint, "Tentative" note, disabled-CTA explanation, reward-window detail, bug-report label becomes always-visible inline text or a tap-to-open sheet. Biggest cross-cutting hazard, present on all 8 surfaces.
3. **Modals + rail popovers → bottom sheets** via one shared `MobileSheet`. Forcing overlays keep no-backdrop-dismiss + ESC.
4. **Compress metric grids into a compact N-across strip.** A single metric never owns ~1/3 of the viewport; never show the same number twice.
5. **44px tap targets + bottom safe-area everywhere.** Primary CTAs in the thumb zone (bottom-pinned in sheets/takeovers).
6. **Never color-alone.** Color always pairs with icon + text on badges/chips/states.
7. **Chrome vacates the screen.** Nav becomes a bottom-anchored layer summoned on demand; pages reserve bottom inset.
8. **Density via the constrained scale, not whitespace.** Margins 32–48px → 16–20px; H1s drop from clamp floor; the one dark TIER_POP spotlight per surface stays.

## 3. Shared Component Patterns (build once)
- **MobileSheet** (keystone): grab handle, safe-area padding, scrim-dismiss, bottom-pinned primary CTA, internal scroll, reuses `useFocusTrap`. Replaces ~25+ bespoke modals/popovers across Home, Plan, Menu, Profile, Dorm Wars, Shell. No shared sheet exists today — net-new foundation.
- **MobileDatePicker**: sheet-wrapped DateField; ~44px cells; pinned legend; inline disabled-day reason (no hover/hatch-alone). Used on Plan checkout + change-start, Home future-skip/pause.
- **CompactMetricStrip**: 3→2-across label/value band, `tnum`, one orange accent. Used on Home, Plan callout, History, Profile, Dorm Wars Wallet|Streak, Takeover reveal. Overrides the wrong `≤640→1-column` rule.
- **BottomNav + MoreSheet**: ~56px tab bar (top 3–4 jobs + Now badge) + MoreSheet for the rest + identity + Refer + Sign out + Report-a-bug. Inherited by every page.
- **ContactActionRow**: collapses "3 equal minHeight:260 cards" into a prioritized stack (green WhatsApp primary, ghost-orange secondary). Support + Refer share.
- **DisclosureCard / list-row**: whole-row 44px trigger → sheet. Generalizes FAQItem, Dorm Wars Column, Side Quests, SecurityRow.
- **BannerStack**: one-line compact banner with 44px dismiss/CTA; transient ones overlay.
- **StickyBottomCTA**: ~50px bottom-pinned orange primary + secondary; "Save & continue later" folds in. Takeovers + ForceOverlay.

## 4. Fold & Density Strategy
- **First glance (~700px):** job-answer + primary action + blocking gate + failure/confirmation status. One element earns large height; rest = line or strip.
- **Second fold:** supporting numbers (metric strip), secondary action, next card.
- **Deep fold:** timelines, savings detail, reference data, history, feeds, footers.
- **Sheet-or-hidden:** all dense detail, edit/picker forms, per-item drill-downs, confirmations — the reason the visible surface can be so compressed.
- **Chrome = 0 permanent height** on content pages; reserve only the bottom inset.

## 5. Phased Roadmap
0. **Foundation primitives** — MobileSheet, MobileDatePicker, CompactMetricStrip, 44px/safe-area conventions, kill-hover audit. Unblocks everything.
1. **Shell & nav chassis** — BottomNav + MoreSheet; Refer/Now/Profile popovers → sheets; retire hamburger; reserve inset. Gates the whole experience.
2. **Dashboard Home** — hero-first reorder; StatRow → strip; modals → sheets; inline lock reasons. Highest daily use; proves the patterns.
3. **Menu** — spotlight reorder (countdown above description); 2-across week grid; DishDetail → sheet.
4. **Plan & Checkout** — split /plan (status-first) vs /explore (buy-first); CheckoutPanel → rising sheet; recommended-first cards; pickers → sheets.
5. **Profile & Security** — verification-first; SecurityRows as list rows; 4 modals → sheets; 2-across grids.
6. **Dorm Wars Hub** — Wallet|Streak pair; Send-CTA prominence; Side Quests list; 9 modals → sheets; re-verify tour.
7. **History & Support** — recognition rows + metric strip; channels-first contact + urgent-first FAQ. Mostly reuse.
8. **Takeovers polish** — top-aligned steps, StickyBottomCTA, 2-across grids, ForceOverlay fit.

## 6. Cross-Cutting Decisions (full detail in topDecisionsForUser)
Bottom tab bar vs. keep drawer (keystone); allow mobile scan-order divergence; global vs per-surface sheet conversion; inline disabled-reason captions mobile-only vs both; keep content-border card; ForceOverlay/Dorm-Wars sticky CTA on 360px; CheckoutPanel as rising sheet.

## 7. Per-Surface Spec
Full per-surface scan orders and element fold/priority tables are maintained in the on-disk spec at `.planning/mobile/MOBILE-REDESIGN-SPEC.md` (sections 7.1–7.8): Shell, Dashboard Home, Plan & Checkout, Menu, Profile & Security, Dorm Wars Hub, History, Support. Each section lists the primary mobile job, the proposed scan order, and a per-element table of fold depth, priority, and the specific mobile move.
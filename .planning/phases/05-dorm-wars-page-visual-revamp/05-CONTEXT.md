# Phase 5: Dorm Wars Page Visual Revamp — Context

**Gathered:** 2026-05-14
**Status:** Ready for planning
**Source:** In-session design discussion (mock-first iteration) — see DISCUSSION-LOG.md for full transcript reference

<domain>
## Phase Boundary

Replace the existing `/dashboard/dorm-wars` page with a cinematic, game-feel treatment proven in the visual mock at `/dashboard/dorm-wars/mock`. The new page commits to a single dark "war room" identity within the otherwise-light dashboard.

**Visual-only round.** No new backend tables, no schema changes. Cycle clock, Daily Drop, streak meter, and Trophy Room are all driven by existing data (referrals, subscription billing window) plus `localStorage` where ephemeral persistence is sufficient. Leaderboard is unblurred but populated with hardcoded placeholder rows scoped to a constants file — backend wiring is a later phase.

**In scope:**
- Wave 1 — Structure swap, design tokens, leaderboard unblur (with stub data)
- Wave 2 — State mechanics: Daily Drop (localStorage-claim), streak meter (localStorage-tracked visits), cycle clock wired to active subscription billing cycle, Trophy Room rendered from existing referral data
- Wave 3 — Cinematic polish: per-cycle title-screen interstitial, sound effects with on-by-default toggle, motion refinement

**Out of scope (deferred to a future backend phase):**
- `seasons`, `daily_drops`, `streaks`, `events` feed tables
- Real cross-user spotlight, real cross-dorm rivalry calculations, real leaderboard subscriber counts
- Multi-cycle lifetime trophy persistence across resets
- Cross-dorm pulse-ticker data wiring (current page uses `dormStats.recent` as the only live source)

</domain>

<decisions>
## Implementation Decisions

### Visual Foundation

- **D-01:** Migrate the mock at `src/app/dashboard/dorm-wars/mock/` to replace `src/app/dashboard/dorm-wars/DormWarsClient.tsx` and `src/app/dashboard/dorm-wars/page.tsx`. The mock IS the design contract — pixel-fidelity migration, not interpretation.
- **D-02:** The page commits to **all-dark** throughout — edge-to-edge `NV` (#091825) bleeding to the cream dashboard container's rounded corners. No cream blocks intermixed. This is the page's identity statement.
- **D-03:** Use existing tokens from `src/app/dashboard/_shared/tokens.ts` (OG, OG3, NV, NV2, CR, BODY, DISPLAY). No new tokens. Greens use `#22c55e` literals; gold/silver/bronze in leaderboard use `#d4a544 / #c9c2b1 / #a67838` literals (kept inline — not promoted to tokens this round since they're scoped to one component).
- **D-04:** Spacing scale locks to 4 / 8 / 12 / 16 / 18 / 20 / 22 / 24 / 28 / 32 / 48 / 64. Reject ad-hoc values like 6, 7, 9, 11, 14. Existing inline mock spacing is canonical.
- **D-05:** Color discipline: orange ONLY for active focus (cycle clock arc, current chapter, user's dorm row, primary CTAs, "war." headline). Green ONLY for achieved states (claimed, unlocked, earned, converted). Cream for primary text. Cream alphas for secondary/labels.
- **D-06:** Depth discipline: only ONE element lifts with real shadow (Active Mission card). All other blocks lay flat on the navy backplate. Hierarchy comes from contrast and size, not pillow shadows.

### Block Composition (top-to-bottom)

The migrated page contains these blocks in this exact order:

- **D-07:** `PulseTicker` — 36px film-leader strip with marquee animation, edge fades, hover-pauses. Uses `dormStats.recent` when ≥3 items; falls back to `PULSE_ITEMS` constant.
- **D-08:** `Hero` — Edge-to-edge dark hero with cycle clock dial (right) + dramatic typography (left). Setup line "This is your" tiny + light weight; payoff word "war." gigantic + bold orange with text-shadow glow. Live eyebrow pill with pulsing dot. Rank pill (Shield icon, rank label, flavour) + WhatsApp CTA pill.
- **D-09:** `CycleClock` — 320px SVG dial. Remaining-time arc in orange shrinks clockwise as cycle runs out. 12 tick marks at every 1/12 of cycle. Inner concentric ring. Center text: days-left number (92px display) + "DAYS LEFT" label + "CYCLE 0N" cap. Glow filter on the active arc.
- **D-10:** `DailyDrop` — Single claimable card with 5 rotating drop types (credit / multi / skip / spotlight / intel). Deterministic per-date drop. Pre-claim: orange-tinted, "One reward. Tap to open." Post-claim: green-tinted, reward label at 64px display, sparkle reveal animation. Week strip below shows all 5 types with today highlighted. Live "Next drop in HH MM" timer counting to end-of-local-day.
- **D-11:** `ActiveMission` — Current chapter card with massive watermark number (subscribers-needed), segmented progress bar, "Chapter 0X / 04" label, reward title at 72px display, detail copy. This is the ONE element that lifts with shadow `0 24px 80px rgba(245,127,32,0.10)`.
- **D-12:** `MissionLadder` — 4 cards in a row (2×2 on tablet, 1×4 on mobile). Each card has reward number (padded "01"–"10"), state icon (Check / Zap / Lock), reward icon (SkipForward / Calendar / Pause), reward label, detail copy, state label. Current chapter glows orange; unlocked are green; locked are dim.
- **D-13:** `Recruits` — "Your Squad" list with 5 status states (converted / trying / past). Avatar circle (initial), name, amount/status, time-ago. Header tallies green/orange counts. Reads from `invites: InviteRow[]` (existing data). Empty-state copy when no recruits yet.
- **D-14:** `Leaderboard` — "Territory" unblurred dorm rankings. Top 3 differentiated by rank-digit tint only (gold / silver-cream / bronze) — NOT row background, so the user's own row can wear the orange tint without confusion. Crown icon next to rank 1. Trend arrows (ChevronUp / ChevronDown / Minus) + delta per row. "Live · N days left" green pill in header.
- **D-15:** `TrophyRoom` — 4-column grid of lifetime achievement tiles. Earned tiles: green tint, glowing icon, "✓ Earned [date]" meta. Locked tiles: dim, lock icon corner, "N more conversions" meta. Header reads "X / N earned" with green/cream alphas, "Lifetime · never resets" tagline.
- **D-16:** `ActionSurface` — Demoted Arsenal block: copy-link button + WhatsApp link, smaller than the live page's primary action cards. Sits late in the scroll because by here the user knows the drill.
- **D-17:** `FinePrint` — Quiet rules at the bottom. Reuses the live page's existing rule lines but adapted: "Capped at 10 paid conversions per **subscription cycle**" (not calendar month), plus a new line for "Daily Drop refreshes at 00:00 local. One claim per cycle day."

### State Machine Logic

- **D-18:** **Milestones reset per subscription cycle**, NOT per calendar month. Each user's "season" IS their subscription billing window. This drives the cycle clock copy, the MissionLadder "Resets next cycle" label, and the FinePrint cap copy.
- **D-19:** `hasClaimed` (page mode flip — engaged vs zero-state) and `hasConverted` (full mechanics) logic from current `DormWarsClient.tsx` is **preserved**. Zero-state mode is out of scope for the mock review but must be revamped using the same dark identity in this phase. Engaged-state is the primary visual target.
- **D-20:** Daily Drop claim state persists per ISO date in `localStorage` key `dw-drop-${YYYY-MM-DD}`. Resets at midnight local time. Five drop types rotate deterministically by `new Date().getDate() % 5`. NO backend persistence this round — a user clearing browser data loses their claim history.
- **D-21:** Streak meter persists in `localStorage` key `dw-streak`. Schema: `{ lastVisit: ISO-date, count: number }`. On every page mount: if `lastVisit` was yesterday → increment count; if today → no change; if older → reset to 1. Streak visible as a star/flame indicator next to rank pill in hero. Counter never punishes the underlying rank or rewards — only the visual streak meter decays.
- **D-22:** Cycle clock days-left is computed from the active subscription's `current_period_end` (existing field). `cycleNumber` is derived by counting completed cycles since `started_at`. If no active subscription, hide the clock and show a "Subscribe to enter the war" CTA in its place — preserving the live page's zero-state graceful fallback.
- **D-23:** Trophy Room reads from existing referral data: `First Recruit` (first invite claimed), `Soldier/Sergeant/Commander/War Hero` (rank tiers from MOCK_RANK mapping), `Free Skip / Free Week / Pause Unlocked` (milestone rewards). The `3-Day Streak` trophy reads from the localStorage streak meter. `Founder` trophy is earned only if the user's dorm hit 5 active subs during Cycle 1 — for this phase, mark `Founder` as deferred (display dim + "Cycle 1 only" meta) since we don't have the historical query yet.

### Copy & Metaphor Portability

- **D-24:** **The metaphor MUST stay portable.** Every string on the page must read sensibly when "dorm" is swapped for "office," "team," or "house." No student-specific copy. No homesickness language. No references to the 54-problem Avatar PDF (that document is internal calibration only).
- **D-25:** Setup-line + payoff-word headline pattern is canonical: "This is your" → "war." Portable across audiences. Do NOT change this structure.
- **D-26:** Pulse ticker items, leaderboard dorm names, and recruit names in stubs use UAE-dorm-flavoured names (Khalidiyah, Muroor, Mushrif, Zayed City, Nahyan) — these are the current audience. They can be re-themed later via a single constants file swap.
- **D-27:** No "Recruit" rank. First paid sub = `Soldier`. Earlier proposed `RECRUIT_RANK` is dropped from this revamp.

### Cinematic Polish (Wave 3)

- **D-28:** Title-screen interstitial: a once-per-cycle modal that gates the Dorm Wars page on first visit of a new cycle. Three lines + one button. Persisted dismissal in `localStorage` keyed by cycle-start date. Skippable.
- **D-29:** Sound: **on by default with a toggle**. Three short clips total — (a) copy-link tick, (b) milestone unlock fanfare, (c) Daily Drop reveal swoosh. Toggle state in `localStorage` key `dw-sound`. Toggle UI lives next to the rank pill in the hero.
- **D-30:** Motion refinement: tighten the existing entry animations (already done in mock), add subtle hover-glow on cycle clock arc, refine the Daily Drop reveal with a brief particle burst (CSS-only, 3-5 absolute-positioned spans).

### Migration & Cleanup

- **D-31:** **Mock files at `src/app/dashboard/dorm-wars/mock/` are reference scaffolding only and MUST be deleted at the end of Wave 3.** The route directory `mock/` itself must be removed. The mock disclaimer/footer and "Compare to live" link must NOT migrate into the live page.
- **D-32:** Existing imports of `DormWarsClient.tsx` and `page.tsx` should remain the canonical filenames. The migration overwrites these files in place rather than introducing new filenames.
- **D-33:** All existing data props (`customerCid`, `customerDorm`, `referralData`, `dormStats`, `invites`) continue to flow from `page.tsx` to `DormWarsClient.tsx`. No changes to `queries.ts`. No changes to `getDormStats` / `getReferralData` / `getRecentInvites`.
- **D-34:** The sidebar dashboard layout container (`.content-border` with `borderRadius: var(--radius-md)`, orange border, cream background) is the page's frame. The dark Dorm Wars page bleeds to its edges. Layout file (`src/app/dashboard/layout.tsx`) is NOT modified.

### Claude's Discretion

- The exact icon set per trophy / milestone / rank (current mock choices — Shield, Crown, Trophy, Star, Flame, Users, SkipForward, Calendar, Pause — are recommendations; planner may tighten).
- Specific keyframe timing curves and durations (current mock values are good defaults; refinement allowed in Wave 3).
- Mobile breakpoint values beyond 720px — additional breakpoints (e.g. 960px tablet) may be added if needed.
- Whether to extract the SVG cycle clock into its own component file or keep it as a function in DormWarsClient.tsx (planner's call).
- Exact sound file format and library choice (use Web Audio API or a small library — planner picks).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Visual Contract (the mock IS the spec)
- `src/app/dashboard/dorm-wars/mock/page.tsx` — Server-side page wiring (data fetch + auth + render). Migration target structure.
- `src/app/dashboard/dorm-wars/mock/DormWarsMockClient.tsx` — ~1100-line client component. THIS IS THE DESIGN CONTRACT. Every block, animation, keyframe, colour, spacing value, copy line is canonical. The planner must reference this file by section heading when describing tasks.

### Current Live Page (replacement target)
- `src/app/dashboard/dorm-wars/page.tsx` — Current server component. Data props shape must be preserved in migration.
- `src/app/dashboard/dorm-wars/DormWarsClient.tsx` — Current client component being replaced. Reference for `hasClaimed`/`hasConverted` state machine, `AGING_WINDOW_DAYS`, `FOUNDER_CAP`, `MILESTONES`, `RANKS`, `RECRUIT_RANK` (the last of which is dropped per D-27). Note: this is what we are replacing — do NOT preserve its visual treatment, only its state-machine and data-flow patterns.

### Design Tokens & Shared Code
- `src/app/dashboard/_shared/tokens.ts` — OG, OG3, NV, NV2, CR, BODY, DISPLAY, S surface tokens. All colours used in the mock come from here or are inline literals scoped to the mock.
- `src/app/dashboard/_shared/types.ts` — Existing dashboard types if any reused.

### Data Layer (unchanged)
- `src/utils/supabase/queries.ts` — `getReferralData()`, `getDormStats()`, `getRecentInvites()`, `getCustomer()`, `getActiveSubscription()` (the last one is needed for cycle clock — `current_period_end`, `started_at`, `billing_cycle_period`). Inspect the existing `Subscription` type / row shape to know what fields are available for cycle math.

### Layout Frame
- `src/app/dashboard/layout.tsx` — Cream container with orange border that wraps all dashboard pages. NOT modified by this phase. The dark Dorm Wars page bleeds into this container's rounded corners.

### Project Instructions
- `CLAUDE.md` (project root, if exists) — Project-specific guidelines that override defaults.
- User auto-memory:
  - "Dashboard light vs marketing site dark is intentional" — Dorm Wars being dark IS the intentional contrast, not a violation.
  - "Skip-meal action is irreversible once confirmed" — irrelevant here.
  - "Never mix `background` shorthand with `backgroundImage` in React inline styles" — MUST FOLLOW. Use longhand pair always.
  - "Gradient border + translucent interior needs masked ::before" — not currently needed in mock but applies if introduced.
  - "Pre-push must run `npm run lint`, not just tsc" — execute step must pass `npm run lint` before commit.
  - "Only WhatsApp link is wa.me/971504619384" — when generating share links, use the canonical helpers in `src/lib/contacts.ts` if applicable. The mock currently uses bare `wa.me/?text=...` (generic share intent) which is acceptable.
  - "Onboarding dark-mode page is locked — do not redesign" — irrelevant here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Patterns
- `useScrollReveal` and `useCountUp` hooks in the current `DormWarsClient.tsx` (lines 44–78) are useful patterns. The mock chose not to use them (entry animations via CSS keyframes instead). Planner may choose either approach per block.
- The current page's `EXPO_OUT` and `QUART_OUT` easing constants match the mock. Carry these forward.
- The dashboard's `Sidebar.tsx` already links `/dashboard/dorm-wars` with Trophy icon. No nav changes needed.

### Established Patterns
- All dashboard pages use server-side data fetch in `page.tsx` and pass props to a `*Client.tsx` (e.g., `MenuClient`, `PlanClient`, `DashboardShell`). The mock follows this. Migration preserves this.
- Lucide icons are the standard icon library across the dashboard. The mock uses 15 icons — all already used elsewhere in the codebase.

### Integration Points
- The Dorm Wars route is reachable from the dashboard sidebar (`Sidebar.tsx`) and from the dashboard home (`DormWarsCard` referenced in `ActiveDashboard.tsx`). The `DormWarsCard` teaser stays — only the destination page changes.
- The referral link format `dormers.ae/r/{cid}` is consumed by `src/app/r/` route which is untouched by this phase.

### Things to Watch
- The current `DormWarsClient.tsx` has prefers-reduced-motion handling. The mock has it too. The migration must keep this — don't lose accessibility.
- The current page is heavily inline-styled. The mock continues this pattern. No CSS module / Tailwind / styled-components introduction in this phase.
- The current `<style>` injection inside the component for keyframes is the pattern. The mock uses a `<SharedKeyframes>` component for the same purpose. Either works.

</code_context>

<specifics>
## Specific Ideas

- The cycle clock SVG dial is the marquee visual — give it implementation care. The arc-grow animation starts empty and fills to the current state on mount (1600ms expo-out, 400ms delay). The dial is 320px on desktop, scales to 78% on mobile via CSS class.
- The "war." word in the hero uses `text-shadow: 0 0 60px rgba(245,127,32,0.28)` for a soft orange halo. Don't lose this — it's what gives the headline its game-poster feel.
- The Daily Drop disabled state on the button is the post-claim state — `disabled={claimed}` is functional, not visual. The visual change (orange → green tint, Gift icon → Sparkles icon, "Tap to open" → "Claimed Today") is what users see.
- The MissionLadder's reward-icon mapping is: index 0 → no icon (the "AED 20" number is the icon); 1 → SkipForward; 2 → Calendar; 3 → Pause. Match this exactly.
- Leaderboard's user-row injection: append a synthetic row with `isYou: true` after the 5 mock rows. In migration, replace the mock 5 rows with whatever real query produces (stub or live), then preserve the injection pattern.

</specifics>

<deferred>
## Deferred Ideas

Out of scope for this phase. Backlog candidates:

- Backend schema: `seasons`, `daily_drops`, `streaks`, `events` tables for true cross-user persistence.
- Real cross-dorm leaderboard with live subscriber counts.
- Real 24h "Spotlight" feature (your name appears in others' feeds).
- Cross-dorm "Khalidiyah is 2 ahead" rivalry snapshots powered by real data.
- Multi-cycle Trophy Room persistence across resets (lifetime trophy history table).
- Push notifications at cycle start ("New cycle. Enter the war.").
- Zero-state revamp (page-mode = not yet engaged). Defer the equivalent dark treatment of the current zero-state Hero / Action Surface / Founding-or-Activity block to a follow-up phase. For this phase, mock and migration target the engaged state only — zero-state continues to use the existing implementation OR a minimal dark adaptation (planner's call: include or defer).
- "Office Wars" / portable re-skin: deferred. The constraint here is to KEEP the metaphor portable in code, not to ship the re-skin.

</deferred>

---

*Phase: 05-dorm-wars-page-visual-revamp*
*Context gathered: 2026-05-14 via in-session design discussion*

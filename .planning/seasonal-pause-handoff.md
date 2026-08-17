# Seasonal intake pause — handoff (2026-08-17)

Branch `feat/seasonal-intake-pause`. Not pushed. Point a fresh session at this file.

## Working tree state

**Uncommitted, waiting on Saad's single commit.** He said: "keep working on task 3, i will
commit everything at once." Do not commit it for him without asking.

Modified: `DashboardShell.tsx`, `Sidebar.tsx`, `SidebarDropdowns.tsx`, `StatRow.tsx`,
`_shared/IntakePauseTakeover.tsx`, `_shared/IntakePausedGate.tsx`, `_shared/Tooltip.tsx`,
`layout.tsx`. Untracked: `CreditWallet.tsx`, `_shared/credit-wallet.ts`,
`_shared/credit-wallet.test.ts`, `dev-sidebar-preview/`.

`StatRow.tsx` and `Tooltip.tsx` are Saad's own concurrent work, not mine.

Verification at handoff: `tsc` exit 0, lint clean except 2 pre-existing `<img>` warnings,
vitest 469/470 (the failure is `menu-catalog.test.ts`, pre-existing and unrelated).

SDD workspace `.superpowers/sdd/2026-08-16-credit-wallet-and-cycle-credit/` is intentionally
still present because Task 3 lives only in the working tree.

## What shipped in the last run

Plan: `docs/superpowers/plans/2026-08-16-credit-wallet-and-cycle-credit.md`

1. **Per-cycle credit rule** (commits `38afb41`, `97eea48`). Credit is once per pause cycle, not
   once ever. Keyed on `credits.intake_waitlist_id`. New pure module
   `src/contexts/subscriptions/domain/intake-cycle.ts` exports `resolveJoinCycle`.
2. **Join + dismiss on the pause takeover** (commit `47383f1`). Logic in
   `src/app/dashboard/_shared/pause-takeover-actions.ts`.
3. **Credit Wallet in the sidebar** (uncommitted). `CreditWallet.tsx` +
   `_shared/credit-wallet.ts`. Data flows `layout.tsx` -> `DashboardShell` -> `Sidebar`.

Live DDL already applied to Ohio (migration `intake_waitlist_per_cycle`):
`intake_waitlist.cycle_started_at` NOT NULL, unique on `(customer_id, cycle_started_at)`,
`credits.intake_waitlist_id`, unique partial on `intake_waitlist_id`. Both old lifetime indexes
dropped.

## The broadcast / reopen messaging stream — NOT BUILT

This is the open work. Nothing sends anything today.

**Exists as files only:**
- `docs/email-templates/season-plan-ended.html` — sent when a plan ends during a pause.
  Merge keys: `first_name`, `plan_name`, `delivered_meals`, `evenings`, `cta_label`, `cta_url`,
  plus exactly one of `credit_aed` or `offer_aed`.
- `docs/email-templates/season-reopen.html` — serves both audiences via `{{#credit_aed}}`.
  Merge keys: `first_name`, `cta_label`, `footer_reason`, optional `credit_aed`.

Neither is created in ZeptoMail. No code references either.

**WhatsApp copy written, two approved by Saad, none created at Meta:**
`intake_reopened`, `intake_back_open`, `intake_ended_credit` (UTILITY),
`intake_ended_offer` (MARKETING).

**Blocked on Saad supplying six exact names/keys** (4 Meta template names, 2 ZeptoMail keys).
Hard ordering rule: the Meta template must exist BEFORE the dispatcher branch. The dispatcher
`dispatch_customer_notifications_tick` resolves `tpl_<kind>` from Vault and its CASE has no ELSE
branch, so a kind with no template is skipped without setting `sent_at` and retries forever.

**Still not built:**
- `intake_waitlist.notified_at` has no writer anywhere. The reopen notice was never built.
- The broadcast composer (pick audience, press send) was never started. This is what would
  send `season-reopen`; until it exists that template has no code path at all.

## Pause suppression — BUILT 2026-08-17 (uncommitted)

The three suppression bugs are fixed. Needed no Meta templates.

New pure module `src/contexts/notifications/domain/pause-suppression.ts` exports
`resolveEndedNotice`, which decides both channels for an ended sub. 9 tests alongside it.
The credit-vs-offer split keys on the WALLET BALANCE, not on waitlist membership, so the
email can never claim money that is not there (someone who joined an earlier cycle and
already redeemed holds nothing, and gets offered a fresh credit instead).

1. **Renew nudge — dropped entirely while paused.** Two layers.
   `renew-nudge-send/route.ts` early-returns `skipped:intake_paused`, and
   `dispatch_renew_nudges_tick()` no-ops before it touches Vault.
   Deliberately writes NO notification row: a nudge is a moment, not a milestone, so if the
   pause lifts inside the T-3 window the next tick must still be free to nudge for real.
2. **Plan-ended WhatsApp — closed out, not sent.** New `markCustomerNotificationSkipped` in
   `queue.ts` inserts the row already stamped `sent_at` + `wamid='skipped:intake_paused'`.
   The row is the point: it holds the 7-day dedup anchor so the cron stops retrying, and the
   dispatcher (which filters `sent_at IS NULL`) never sees it.
3. **Plan-ended email — swaps to the season variant.** `sendSeasonPlanEndedEmail` in the
   ZeptoMail client. Both season keys are now in `.env.local`
   (`ZEPTOMAIL_TPL_SEASON_PLAN_ENDED`, `ZEPTOMAIL_TPL_SEASON_REOPEN`).
   **Both keys still need adding to Netlify prod env before this ships.**

`dispatch_subscription_ended_tick` was deliberately NOT touched — it must keep firing during
a pause, since it is what delivers the season email. Per-channel behaviour is decided in
application code, never in SQL.

**The SQL is already applied live** (migration `pause_suppress_renew_nudges`, mirrored at
`supabase/migrations/20260817_pause_suppress_renew_nudges.sql`). Safe to apply while
`paused=false`: the guard was inert on arrival. The body was copied from the LIVE definition,
not the stale repo file — live carried an extra `meta_status_code` clause the repo file never
gained, and the live ended-cron job is `dispatch_subscription_ended_0045_ae` at 20:45 UTC, not
the `_0015_ae` / 20:15 the repo claims. No `cron.schedule` was re-run.

Verified: guard proved by flipping `paused=true` inside a self-aborting DO block (rolled back,
prod untouched) — `dispatched=0` with 1 sub genuinely matching the selector that day, and an
empty `net.http_request_queue`. Season email proved end to end through the real
`resolveEndedNotice` -> `sendSeasonPlanEndedEmail` path, both blocks. `tsc` 0, lint clean bar
the 2 pre-existing `<img>` warnings, vitest 492/493 (the failure is `menu-catalog.test.ts`,
pre-existing and unrelated).

Not verified: no end-to-end run of the ended cron itself during a real pause. Nothing in
production has been paused to test it.

## Email subject lines — a gap worth knowing

Neither `season-plan-ended.html` nor `season-reopen.html` defines a subject. That is normal
here (every template email's subject lives in ZeptoMail, not the HTML) but it means nothing in
the repo records what was chosen. Worth writing the chosen subject into each file's comment
block next to the merge keys.

## Three product decisions Saad has not answered

1. **Credits stack with no cap.** Three pauses without a purchase leaves AED 60 in one wallet.
   His "single use" ruling was about one credit, never about an accumulating balance.
2. **The same money shows twice in the sidebar.** Refer & Earn sums ALL approved credits, not
   referral-sourced ones. Pre-existing conflation, newly visible now the wallet sits above it,
   and Refer & Earn does not mention the monthly-plan restriction.
3. **On touch the collapsed rail still hides the balance** behind the hamburger, since there is
   no hover for the tooltip. That is the problem Task 3 set out to solve.

## One copy swap offered, not applied

`IntakePauseTakeover.tsx` currently reads: "Tap below to join the early-access list and get AED
20 credit the day new plans reopen." Accurate but instructional, which Saad pushed back on
twice. Suggested replacement: "AED 20, waiting in your wallet for the day we reopen. Your plan
carries on as normal either way." One string.

## Do not forget

~~**Intake is `paused = true` in production right now.**~~ No longer true as of 2026-08-17:
prod reads `paused=false`, `paused_at=null`, `cycle_ended_at` stamped 2026-08-17 01:26 UTC.
The pause was closed. Re-check this before merging anyway — it is a one-line MCP query and the
consequence of being wrong is a live site that cannot sell.

**Netlify prod env still needs both `ZEPTOMAIL_TPL_SEASON_*` keys** before the suppression
work ships, or the season email throws and plan-ended customers get nothing during a pause.

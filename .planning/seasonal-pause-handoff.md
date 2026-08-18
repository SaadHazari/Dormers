## Scheduled pause + sales taper — BUILT 2026-08-18

Plan: `docs/superpowers/plans/2026-08-18-scheduled-pause-taper.md`. All 8 tasks shipped on this
branch (`feat/wrap-weekly-single-survey`, commits `39d7574`..`a466498`). `npx vitest run`:
538/539, same single pre-existing `menu-catalog.test.ts` failure (46 vs 48 dish ids, unrelated).
`npm run lint`: clean bar the same 2 pre-existing `<img>` warnings. Nothing new either side.

**Column.** `intake_settings.pause_scheduled_for date` — the LAST DELIVERY DAY of the term, not
the pause date itself. Null means nothing is scheduled. Live in Ohio.

**Taper.** New pure module (`season-horizon`, exporting `journeyFits`, `latestViableStart`,
`effectiveTaperStart`, `seasonEndsMessage`, `prettySeasonDate`, plus the `season-taper`
selector layer) is the single source of truth. Checkout, free-checkout, gift claim, and `changeStartDate` all
call it server-side to refuse any journey that would end after the scheduled date. Checkout's
guard is deliberately stricter than "does the raw POST land before the date" — it predicts the
webhook's tail-queue start, since that is what actually decides delivery dates. A skip-tail of
1-3 days poking past the boundary is accepted by design, not a bug (revisit only if the kitchen
actually feels it — see Deferred below). staff-monthly journeys are exempt from the guard
entirely. One known honest window: a Stripe checkout session created BEFORE the schedule was
set and paid after it provisions unguarded (the webhook deliberately has no taper check) — the
sub just joins the overhang count and rides to completion, same as any pre-schedule sale.

**Tick.** `intake_scheduled_pause_00_15_ae` runs daily at 00:15 AE. On the first AE day AFTER
`pause_scheduled_for`, it flips `paused=true` with `paused_by='schedule'` — the same state
transition the admin's manual pause button produces, just attributed differently. If intake is
already paused when the tick fires, it only clears the schedule (the pause itself doesn't
re-fire). Live in Ohio, cron enabled.

**Admin.** Season page can schedule or clear the date, each behind its own confirm modal. Both
actions are audited: `intake_pause_scheduled` / `intake_pause_schedule_cleared`. The scheduling
modal shows an overhang count — journeys that would already end past the chosen date if it were
picked today — so the owner isn't scheduling blind.

**Customer-facing.** Season banner, "done for the term" plan cards, and clamped date pickers on
both desktop and mobile checkout. `INTAKE_ENDING` / `INTAKE_PAUSED` states render as soft facts
in the UI (a plan that already wrapped up), never as error states.

**Reopen scheduling is still forbidden.** Locked decision from the original pause build, carried
forward untouched — only the pause side got a scheduler.

Working-tree note at handoff time: other files were mid-edit from a concurrent session
(`SidebarDropdowns.tsx`, `dev-sidebar-preview/`, `StatRow.tsx`, etc.) unrelated to this feature.
Only this doc was touched to close out Task 8.

---

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

## The broadcast / reopen messaging stream — BUILT 2026-08-18

Plan: `docs/superpowers/plans/2026-08-18-broadcast-composer.md` (the SDD workspace was deleted
after the final review came back clean; git history is the record). Composer live at
`/admin/comms/broadcast` (composer + preview + type-SEND confirm + progress + kill switch +
retry), sidebar entry "Broadcast".

**Two fast-follows parked at the final review, deliberately not blocking:**
- The done-transition has a millisecond race against Retry (count-then-flip in two statements).
  Symptom if ever hit: a `done` broadcast showing sent < total with no Retry button; recover by
  SQL. Proper fix: make the flip a conditional RPC that re-checks pending atomically.
- The two new tables' RLS policies are `for all using (true)` without `TO service_role`
  (matches the intake_waitlist precedent; revokes are the protection). Tighten in the
  Release It hardening pass.
Also deliberate: the `ended_not_renewed` half of the 'reopen' audience is NOT cycle-scoped and
must never be — lapsed customers stay reachable regardless of pause cycles.

**Sending engine, all applied live to Ohio:** `broadcasts` + `broadcast_sends` tables;
`broadcast_audience` / `broadcast_confirm` / `broadcast_claim_batch` RPCs (lease-based claiming,
live-status audiences); `/api/internal/broadcast-send` route (25-row batch, 40s budget, breaker
fail-fast); `dispatch_broadcast_every_minute` pg_cron tick (idle-free).

`intake_waitlist.notified_at` now has its writer: a successful `season-reopen` send stamps
`intake_waitlist`, scoped by `cycle_started_at`. The route uses `getWaitlistStatusStrict`, so a
read error parks the row for retry instead of risking the wrong template variant going out.

`ZEPTOMAIL_TPL_SEASON_REOPEN` is now SET in Netlify production (was deliberately withheld until
this feature existed; code reads it as of this branch).

**Deploy order matters.** Nothing sends in production until this branch deploys: the cron tick
is idle-guarded and the send route 404s until then. `email-mark.png` rides the same deploy.

**Remaining gap, unchanged:** the two reopen WhatsApp templates (`intake_reopened`,
`intake_back_open`) still have no approved copy. Out of scope for this plan; they ride the
`customer_notifications` queue and the strict 4-step dispatcher contract, same as every other
kind.

**Both files were REDESIGNED 2026-08-18 (owner decision).** The navy-banner design from spec
§9.2 is dead: the owner reviewed the five live ZeptoMail templates against it and chose to
evolve the live card style instead (white card, 2px `#f57f20` border, 13px radius, tinted
sub-containers, green WhatsApp box, real dark mode via `#1a1a1a` card). The fat navy header
band is replaced by the `email-mark.png` house at 48px, no wordmark artwork. Refinements over
the live five: navy `#091825` headings instead of grey, Montserrat with Helvetica fallback,
`#8c4214` for small labels on near-white, no emoji. Merge-key contracts are UNCHANGED.
Any future broadcast-composer shell must follow this same card style, not spec §9.2.

**The approved WhatsApp copy is LOST.** It lived only in the previous session's conversation.
Searched the repo for the names and for distinctive phrases; only the names survive, here.
Fresh copy for the two plan-ended templates was drafted on 2026-08-17 and is in the build
section below. The two reopen templates (`intake_reopened`, `intake_back_open`) still have no
copy and no code path.

Note `intake_reopened` is ALSO an admin audit-log action name written by
`src/app/admin/season/actions.ts` on every toggle-off. Different table, no functional clash,
but searching for either turns up both.

The spec (§10) says TWO templates and names one `intake_pausing`. That is superseded: messaging
a happy running customer about a pause gives them nothing to do and can only worry them, which
is the same reasoning that killed `season-pause.html`.

**Both plan-ended templates are now MARKETING** (Saad's call 2026-08-17, chosen over
utility/marketing split to avoid Meta reclassifying and flagging the number).

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
   ZeptoMail client. `ZEPTOMAIL_TPL_SEASON_PLAN_ENDED` is in `.env.local` and in Netlify
   production. `ZEPTOMAIL_TPL_SEASON_REOPEN` was local only until 2026-08-18; it is now set in Netlify
   production and the broadcast dispatcher reads it.

## Season WhatsApp — BUILT and LIVE-CONFIGURED (templates approved 2026-08-17)

Saad's call: WhatsApp deserves the same treatment as email. Templates are approved, Vault and
Netlify are set; it goes live on the next redeploy. Two templates, one per audience, because a WhatsApp template cannot
carry the email's either/or block. WhatsApp follows the block the email already chose, so the
two channels can never tell one person contradictory things (there is a test for exactly that).

### APPROVED at Meta 2026-08-17. Copy recorded here so it cannot be lost again.

Both `en`, MARKETING, static URL button to dormers.ae/dashboard. Read back from Meta, not
transcribed from the submission.

**Meta names are INCONSISTENT and that is fine** — the Vault stores each separately:
| kind | Vault secret | Meta template name |
|---|---|---|
| `intake_ended_credit` | `tpl_intake_ended_credit` | `intake_ended_credit` |
| `intake_ended_offer`  | `tpl_intake_ended_offer`  | `dormers_intake_ended_offer_v1` |

**`intake_ended_credit`**
Header: `See you next semester, {{first_name}}`
Body: `That's your {{plan_name}} done. *{{delivered_meals}}* dinners, sorted.` / `*We'll be
taking a short break between the semesters.*` / `Your *AED {{credit_aed}}* is already in your
wallet, waiting for your first monthly plan when we're back next sem.` / `Enjoy the break.`
Footer: `You are getting this because your plan just finished.`
Button: `See my wallet`

**`dormers_intake_ended_offer_v1`**
Header: `See you next semester, {{first_name}}`
Body: `That's your {{plan_name}} done. *{{delivered_meals}}* dinners, sorted.` / `*We'll be
taking a short break between the semesters.*` / `AED {{offer_aed}} is yours the moment you save
your spot, and it comes off your first monthly plan when we resume next sem.` / `Enjoy the
break.`
Footer: `Team Dormers`
Button: `Save my Spot`

Minor: the two footers differ. The credit one carries a why-am-I-getting-this line, the offer
one does not. Both are triggered by the same event, and the offer one is the MARKETING-heavier
of the two, so it is the one that would benefit more from the reason line. Worth aligning on
the next version bump; not worth a resubmission on its own.

**Parameter names, verified against BOTH Meta's stored definition and the real outgoing
payload:** header `first_name`; body `plan_name`, `delivered_meals`, then `credit_aed` or
`offer_aed`. Named parameters, so order does not matter, but the names must match exactly.

**Vault entries are LIVE** (added 2026-08-17). `WHATSAPP_SEASON_ENDED_ENABLED=true` and
`ZEPTOMAIL_TPL_SEASON_PLAN_ENDED` are set in `.env.local` AND in Netlify's **production
context** (2026-08-18, via `netlify env:set`). Both take effect on the next redeploy.

`ZEPTOMAIL_TPL_SEASON_REOPEN` is ALSO in Netlify production now (2026-08-18) — the broadcast
composer exists and its season-reopen mode reads it. The old reasoning (withheld while no code
read it) is retired. `WHATSAPP_SEASON_ENDED_ENABLED` was re-verified as `true` in the
production context on 2026-08-18 after the deploy; it binds on the NEXT deploy, which is fine
because it only matters while a pause is on.

Do NOT trust `npm run check:whatsapp-template` on these. It hard-codes the `ops_access_link`
contract and will report three false failures: it demands `{{name}}` / `{{link_name}}` and a
dynamic `{{1}}`-suffixed button URL, none of which apply here. Its useful output is the first
line (name, locale, status, category) and the list of named variables it found.

## Two dispatcher traps fixed, 2026-08-17

Both were live bugs affecting every message kind, not just this feature.

1. **Silent loss.** The components CASE has no ELSE (the handoff was right; an earlier note in
   this session wrongly said otherwise). A kind with a Vault entry but no branch produced
   `components = NULL`, which was posted to Meta as `"components": null` and the row was then
   stamped `sent_at`. Message gone, row claims success, and the malformed request risks the
   number's quality rating, which degrades every template. Now it posts nothing and closes the
   row as `skipped:no_component_branch`.
2. **Forever jam.** A kind with no `tpl_<kind>` Vault entry warned and continued without
   setting `sent_at`, so it returned every tick forever at the head of the oldest-first
   LIMIT 100 batch. Now: six-hour grace, then `skipped:no_template`. This also defuses
   `delivery_unconfirmed_8pm`, an allowed kind with neither a Vault entry nor a branch that has
   never fired.

`dispatch_subscription_ended_tick`'s dedup now also matches the two season kinds. Without that,
queueing a season kind instead of `subscription_ended` would leave the customer looking
un-notified and re-dispatch them the next night, duplicating the season email.

It still fires during a pause on purpose — it is what delivers the season messages.
Per-channel behaviour is decided in application code, never in SQL.

Mirror: `supabase/migrations/20260817_season_whatsapp_and_dispatcher_hardening.sql`. Read its
header before running it: it is a transformation, not a replay, and is NOT idempotent.

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

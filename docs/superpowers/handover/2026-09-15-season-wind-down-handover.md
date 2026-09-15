# Season wind-down: handover

Date: 2026-09-15, afternoon (Asia/Dubai). Work was halted by the owner and every automated job was stopped. The state below was verified on the live database and in git after the stop.

---

## 1. Status at a glance

| Piece | State |
|---|---|
| Spec | `docs/superpowers/specs/2026-09-14-season-wind-down-design.md`, committed, approved by the owner |
| Plan A: foundation and admin planner | **Shipped** to production (Production branch at `846452b`, 2026-09-14) |
| Plan B: wind-down rules | **In progress, not deployed.** Branch `feat/season-wind-down` at `e5ae5a9`. Tasks 1 to 7 are done and reviewed. Task 8 and Task 9 need a fix round. Task 10 is built but unreviewed. Tasks 11 to 17 are not started. **Five Plan B migrations are already live.** |
| Plan C: the break | **Drafted, uncommitted** (`docs/superpowers/plans/2026-09-15-season-wind-down-C-break.md`, 16 tasks). Pre-flight scan done, 22 findings ruled on, edits **not yet applied** |
| Plans D to G (refunds, messages, reopen, invariants) | Not planned in detail yet |
| Customers | See nothing new. Production still runs the Plan A app |

**Before anything else:**
1. **Keep the wrap-up day unset.** The live reconcile function (`season_reconcile_skips`) has a Critical money and kitchen bug (section 6.2). It runs only when a wrap-up day is scheduled or moved. None is scheduled today.
2. **Answer the Staff Monthly question** (section 9). The real last kitchen day is Wed 30 Sep, not Mon 28 Sep.
3. **Mind the October risk.** Nothing in production stops the customer-paused plan from resuming in October and cooking its 8 remaining meals. Section 8 lists the spec's one-guard fallback.

---

## 2. The design in brief

Read the spec for the full design. The essentials:

**What the owner wants.**
- The season pause is a kitchen halt, not just a sales stop.
- After the last meal of the last customer, the kitchen stops. Every kitchen day costs about AED 500.
- The code before this project only stopped sales.

**The season timeline.**

| Term | Meaning |
|---|---|
| **Wrap-up day (W)** | The last regular delivery and the sales cutoff. The date customers are shown |
| **Buffer** | 0 to 3 delivery days after W (default 1), used only for make-up meals from skips. Never sold |
| **Close day (K)** | W plus the buffer. The break starts the night after K |
| **Phases** | `open`, then `winding_down` (W is set), then `break`, then reopen |

**What happens to a plan at the season end.**

| Situation | Outcome |
|---|---|
| Customer's own pause is still on at the break | Stays paused; Resume is refused until the new semester (D1) |
| Resume during the wind-down | Delivers up to W. The rest is held "because of us", with automatic waitlist credit and an optional refund. The refund needs the owner's approval, and the owner gets a WhatsApp when a customer asks (D2, D6) |
| Skip whose make-up day lands after the season | Becomes wallet credit worth what the customer paid for that meal, and the plan end does not move (D3, D7) |
| Skip whose make-up day lands on a buffer day | Keeps a buffer grant, so the make-up meal is cooked on that buffer day |

**Money.**
- A credited skip is worth `(card charge + wallet credit used) ÷ meals in the order × meals that day`. If the order has no recorded money, it is worth 90% of list price (D7).
- **Stripe runs in test mode (pilot). Test payments are not money.**
- A credited skip still uses one of the plan's skips (X3).
- Staff and welcome plans earn no credit or refund (X5).
- Credits never turn back (X6).

Owner decisions D1 to D7 and defaults X1 to X7 are in spec section 2.

---

## 3. Where everything is

| What | Where |
|---|---|
| Main checkout | `/Users/SaadHazari/1Projects/Dormers Codebase/Dormers-Production`, `main` at `7e2c7a0` (one menu commit, **not pushed**) |
| Season worktree | `.claude/worktrees/season-wind-down`, branch `feat/season-wind-down` at `e5ae5a9`, 18 commits ahead of `main` |
| Stray worktree (safe to remove) | `.claude/worktrees/agent-ad3eaf957cae537a3`, branch `fix/task8-reconcile` at `746bf36`, no changes. Also stray branches `worktree-agent-ad3eaf957cae537a3` and `worktree-agent-a12e8fd75305d9d11` |
| Plan A | `docs/superpowers/plans/2026-09-14-season-wind-down-A-foundation.md` |
| Plan B | `docs/superpowers/plans/2026-09-15-season-wind-down-B-wind-down-rules.md` (committed) |
| Plan C draft | `docs/superpowers/plans/2026-09-15-season-wind-down-C-break.md` (**untracked, commit it before cleaning the worktree**) |
| Plan B working files | `.superpowers/sdd/2026-09-15-season-wind-down-B-wind-down-rules/`, **git-ignored, so back it up**. It holds: `progress.md` (the full decision log with every ruling), `task-N-brief.md` for all 17 tasks plus 2b, `task-N-report.md` for tasks built so far, `review-*.diff` packages, and the two fix briefs `task-8-fix1-brief.md` and `task-9-fix1-brief.md` |
| Plan C working files | `.superpowers/sdd/2026-09-15-season-wind-down-C-break/` (git-ignored): `preflight-scan.md` (22 findings) and `progress.md` (rulings) |
| Live database | Supabase project `yjjayivwfqjfppawgyaz` (Dormers-Ohio), production |

---

## 4. How this repo works (read before changing anything)

**Deploy and branches.**
- Deploy with `git push origin main:Production`. Pushing `main` alone ships nothing. Netlify builds the Production branch.
- The plan was to merge the season branch into `main` with `git merge --ff-only` in the main checkout, then push `main:Production`.
- The `main` menu commit `7e2c7a0` was already merged into the season branch at `28e14a2`, so it ships with Plan B.
- Other sessions have left uncommitted work in the main checkout before (a `MenuClient.tsx` corner-radius prototype and `scripts/atlas/manifest.mjs`). Check `git status` there before the fast-forward, and never commit someone else's files.

**Live database is the source of truth.** The `supabase/migrations/` folder has drifted from live in the past. So:
- Read the live body with `pg_get_functiondef` before changing a function.
- Apply the change live, then mirror it verbatim into `supabase/migrations/2026MMDD_*.sql`.
- Rehearse every live change inside a `DO` block that raises at the end, so nothing is kept.

**Security model.**
- Every `season_*` SQL function is `SECURITY DEFINER`, with `EXECUTE` revoked from `public, anon, authenticated`.
- App code calls them with the service-role client, only after `withOwnedSubscription` has checked ownership.
- `authenticated` has a column-level UPDATE allowlist on `subscriptions`. New columns are not writable by customers unless granted.

**How end dates and deliveries really work.**
- `trg_subscriptions_recompute_end_date` sets `end_date` from the plan kind, found by name: `monthly` gives 4 × days per week, `weekly` gives days per week, `trial` gives 1. Any other name (for example Welcome Meal) is never recomputed.
- The inputs are `skipped_meals_count + bonus_meals` and `paused_days + closure_days`. **It never reads `skipped_dates`**, so a credited skip never moves the end.
- `subscription_delivery_tick` delivers by meals. It **ignores `end_date`**, and after Plan B it caps at `total_meals − credited_skip_days × meals_per_day`.
- The status tick ends a plan once meals delivered or credited reach the total and the end date has passed.
- The kitchen and rider counts (`get-kitchen-counts.ts`) are still status-based, not cap-aware. Plan C Task 8 (G5) fixes this.

**Test mode.**
- The webhook and free checkout record `amount_paid_fils` and `credit_applied_fils` on every new order, in both Stripe modes.
- The credit rule, in SQL `season_skip_credit_fils` and TypeScript `mealValueOf`, ignores recorded money when `stripe_session_id` starts with `cs_test_`.
- Credit-only orders (no Stripe ids) count as real.
- TypeScript `aedToFils` rounds on the decimal digits so it matches SQL `round(numeric)` exactly.
- Plan D refunds must reuse the same test-mode check.

**Checks.**
- Run `npx vitest run` (1,313 tests at `e5ae5a9`), `npx tsc --noEmit` and `npm run lint`. Lint has one pre-existing `<img>` warning in `src/app/admin/qr-codes/QrCodesClient.tsx`.
- Visual checks use `?preview=1` fixtures with Playwright's Chromium (see `scripts/check-season-planner.mjs`), never test accounts.

---

## 5. Live database state (verified after the halt)

**Season settings.**
- `intake_settings`: `season_phase = winding_down`, `paused = true`, sales stopped, **no wrap-up day, no close day**, buffer 1.

**Migrations, newest first.** The Plan B five are ahead of the production app; the Plan A two are live and deployed.

| Version | Name | From |
|---|---|---|
| `20260915082710` | `season_reconcile_skips` | Plan B Task 8, **has the Critical bug** |
| `20260915080428` | `season_skip_guards` | Plan B Task 6 fix |
| `20260915044446` | `season_skip_credit_tick` | Plan B Task 7, with cron at `40 20 * * *` UTC |
| `20260915043834` | `season_skip_functions` | Plan B Task 6 |
| `20260915043100` | `season_credited_skip_ticks` | Plan B Task 5 |
| `20260914173723` | `season_transitions` | Plan A |
| `20260914173304` | `season_wind_down_foundation` | Plan A |

**Why the live Plan B SQL is harmless today.**
- There are 0 `season_skip` credits, 0 plans with credited skips or grants, and 0 `season_holds` rows.
- Nothing in the production app calls the new functions.
- The reconcile runs only if a wrap-up day is scheduled or moved from the Season page.

**Live plans** (`today` is 2026-09-15):

| Plan | Status | Delivered | End date | Real last dinner |
|---|---|---|---|---|
| Staff Monthly (5DAYS, started 24 Aug) | Active | 8 of 20 | Fri 18 Sep (stale) | **Wed 30 Sep** |
| Monthly Premium (5DAYS, `cs_test_` order, list AED 22) | Active | 10 of 20 | Mon 28 Sep | Mon 28 Sep |
| Monthly Premium (Religious Preference, list AED 18, no Stripe ids) | Paused, `paused_days` 23 | 12 of 20 | Mon 28 Sep | 8 meals whenever it resumes |

**Orders.** Every Stripe order in the database is test mode. `npm run backfill:order-money` wrote 0 rows, so every live plan uses the 90% list-price fallback. That is AED 19.80 per meal for the AED 22 plan.

---

## 6. Plan B

### 6.1 Task status

Each task ran as: implementer, independent review (spec compliance and code quality), then fix rounds until approved. Live SQL tasks were rehearsed on live in rolled-back transactions and read back afterwards.

| Task | What it does | Commits | Live migration | State |
|---|---|---|---|---|
| 1 | Domain: skip outcome (normal, grant, credited), make-up day, credit figure | `6a72cdc` | | Done, approved |
| 2 | A credited skip uses a skip: `skipsUsedFor` on every dashboard control | `e152e7b` | | Done, approved |
| 2b | History, admin customer page and support context use the same count | `84e5e09` | | Done, approved |
| 3 | Every new order records the card charge and the wallet credit used | `ce501ce` | | Done, approved |
| 4 | `npm run backfill:order-money` (dry run by default; live-key guards; `written` counts real rows) | `3482da3`, `7de21ea` | | Done, approved |
| merge | `main` menu work merged into the branch | `28e14a2` | | Done |
| 5 | `credited_skip_dates` column; delivery cap and status-tick end count credited skips | `12bfd3e` | `season_credited_skip_ticks` | Done, approved |
| 6 | `season_skip`, `season_unskip`, `season_skip_credit_fils`, projection helpers; then the review fixes | `eea52ff`, `2a213f2`, `3fa4d60`, `746d42d` | `season_skip_functions`, `season_skip_guards` | Done, approved after 2 fix rounds |
| 7 | Nightly release of pending skip credit | `3959ea3` | `season_skip_credit_tick` | Done, approved |
| 8 | Reconcile skips when W is scheduled or moved | `219aebe` | `season_reconcile_skips` | **Needs fix (Critical)**; fix brief written, not started |
| 9 | Customer skip, undo and pause actions made season-aware | `746bf36` | | **Needs fix (Important)**; fix brief written, not started |
| 10 | Dashboard season view and "Semester wraps up" chip, preview knobs | `e5ae5a9` | | Built, tests and visual check pass, **review not done** |
| 11 to 17 | See 6.3 | | | Not started; briefs ready |

The Task 6 fixes, found in review and all fixed live:
- An undo could leave paid credit on a day the plan no longer has. It is now refused with `SEASON_UNSKIP_CREDITED_AFTER`, and the release tick holds such credit.
- Test-mode money was counted.
- TypeScript and SQL could disagree on half-fils prices.
- A NULL skip cap was accepted.
- There was no date check in SQL. It now raises `SEASON_SKIP_BAD_DATE`.

### 6.2 Open findings to fix before deploying Plan B

**Task 8, Critical. The fix brief is `task-8-fix1-brief.md`.**

*The bug.* Converting n skips lowers `skipped_meals_count` by n, which pulls `end_date` back n plan days. Any skipped or credited date in the removed tail then falls after the new end. The result:
- The credit for that date is held forever (the release tick requires the date to be inside the plan).
- The delivery cap sits one meal below the days actually cooked.
- In one reachable case, a skip make-up meal is cooked after K.

*The fix is a redesign around one rule: meals cooked plus meals credited equals what was paid.* For each plan:
1. Pick the smallest k so the recomputed end is on or before the later of the no-skip end and W plus kept grants.
2. Drop every skipped or credited date after the new end, and reject the pending credits on dropped credited dates.
3. Credit exactly enough of the latest remaining normal skips. The credited count never goes down.
4. Leave untraced-skip, no-value and unknown-kind plans unchanged, and report them.
5. Finish with a self-check that raises and blocks the schedule rather than leak money. The conservation part of the check raises only for plans with no pauses and no closures; for others it is reported.

*Also in the same brief:*
- `receiptsFromTransition` skips null items.
- `announceSeasonSkipCredited` is wrapped in try/catch.
- The reconcile credit upsert clears `applied_at`, `applied_to`, `reserved_token` and `reserved_until`.
- `season_unskip` takes the `intake_settings FOR SHARE` lock before the plan lock, the same order as schedule and move, to avoid a deadlock.

*Rehearsal.* It must plant these cases and assert exact results: A, B, B2, C and F from the review, same-day, second schedule, staff plan, no-value plan, the settled-credit guard and lock order.

**Task 9, Important. The fix brief is `task-9-fix1-brief.md`.**
1. **Fail closed on the season reads.** During a skip, `loadSkipSeasonContext` reads the intake settings and closures fail-open. A read error turns a credited or grant skip into a plain client-side skip: the customer loses a paid meal and is promised a make-up meal on a closed kitchen day. Use strict reads and refuse the skip with the fallback copy when a read fails (spec §5.1).
2. **Compare-and-set in `skipMeal`.** Add `.eq('skipped_meals_count', …)` to the normal branch so a concurrent reconcile is not overwritten. This came from Task 8's review.
3. **Guard four writes against a concurrent credited skip.** Add `.eq('credited_skip_days', …)` to `pauseSubscription`, `planPause`, the old `unskipFutureDate` path and the normal `skipFutureDate` write.
4. **Tests.** Five missing or weak tests, plus a `loadOrderMoney` mapping test that checks `stripe_session_id`.
5. **Copy.** An orders read failure shows the fallback copy, not the "no value" copy.
6. **Staff plan check.** The by-name check becomes case-insensitive, matching SQL `ILIKE`.

**Task 10.** The review was stopped before it gave a verdict. Run a fresh review against `review-746bf36..e5ae5a9.diff`. One known issue: `SeasonWrapUpChip` has a fixed `id="season-wrap-up-chip"`. `ActiveDashboard` mounts the desktop and mobile trees together, so the id appears twice. Use a `data-testid` instead.

### 6.3 Remaining Plan B tasks

The briefs are in the Plan B working folder. The decided rules for each are in `progress.md`.

| Task | What | Rules already decided |
|---|---|---|
| 11 | Skip sheets say when a skip becomes credit, and send `seen` so a credited skip can go through | Until this ships, a credited skip with no `seen` is refused by design. No refund or break wording while `SEASON_BREAK_RELEASE_LIVE` is false |
| 12 | A credited day never claims a make-up day (menu, plan bar, mobile) | `MenuClient.tsx` was reworked by the menu commit, so apply the brief's intent to the real file |
| 13 | The wallet shows skip credit, pending and ready | Pending credit must never be spendable. Check checkout redemption and every balance counts only `approved` |
| 14 | Who can save a spot during the wind-down | No customer can hold two waitlist credits for one cycle |
| 15 | Pause sheets name the wrap-up day | The `seasonBreakLive` override works only under `preview=1` |
| 16 | Season-end notice N1 and N3, shown once when W is set | The localStorage key includes the cycle and W |
| 17 | Final verification: rendered checks, re-run every live rehearsal, backfill dry run | Add boundary assertions to the rehearsals: a credit dated today stays pending; a credit dated on `end_date` is released; `SEASON_UNSKIP_CREDITED_AFTER` allows a credited date on the new projected end; `SEASON_SKIP_BAD_DATE` refuses `end_date + 1` and accepts `end_date`; orphan count 0. Dry run only, no `--write` |

Tasks 10, 11, 12, 15 and 16 share `ActiveDashboard.tsx`, `MobileHome.tsx`, `ClientDashboard.tsx` and `page.tsx`, so build them one after another.

After Task 17:
1. Run a whole-branch review.
2. Fast-forward `main` in the main checkout.
3. `git push origin main:Production`.
4. Check the Netlify build and smoke-test.
5. Tell the owner they can schedule W.

### 6.4 Parked minors (not blocking)

- `mealsPerDay` 0 is coerced to 1 in `skipCreditFilsFor`.
- The effective-close-day expression is duplicated. Plan C adds `effectiveCloseDay`.
- The wiring tests in Tasks 2, 2b and 3 check source strings, not behaviour.
- The webhook only warns when a Checkout Session has no `amount_total`.
- The backfill reads a credit count it does not always use.
- The status tick ends a plan the night after its last credited date. It never cooks it.
- `SEASON_UNSKIP_SETTLED` blocks undoing an admin-rejected credit.
- A reconcile `skipped_no_value` result reaches only the audit log. Plan C's break board surfaces it.

---

## 7. Plan C: the break (drafted, not started)

**Draft:** `docs/superpowers/plans/2026-09-15-season-wind-down-C-break.md`, 16 tasks.
1. One projection rule: walk the meals left.
2. The SQL projection twin, checked in lockstep on live.
3. The nightly ticks stop cooking after W (G1, G4, G6).
4. Nothing restarts during the break, and a sale during it is held (G2, G3).
5. The break begins: begin-break, break tick, two invariant alerts.
6. Reopen, release a hold, and end today with skips reconciled (live SQL).
7. Reopen and release in TypeScript.
8. Kitchen and rider counts read the season (G5).
9. Resume and start dates respect the break, and release a held plan (G9).
10. The held plan on the dashboard.
11. Resume shows the split while winding down, and is refused during the break (N7, N11).
12. The break notice, once, in the app (N8, N9).
13. The menu shows a held day.
14. The break board on the Season page, with Reopen.
15. The break goes live: cron switch and release flag in one change.
16. Final verification.

**Deadline.** Plan C must be live before the first scheduled wrap-up day passes. Otherwise nothing stops the kitchen after K.

**Pre-flight scan.** `preflight-scan.md` has 1 Critical, 11 Important and 10 Minor findings. All are ruled in the Plan C `progress.md`, but **none are applied to the plan or spec yet**.

**Critical.** "End the season today" after W resets W and K to today, so that night the kitchen cooks for every plan. The fix:
- SQL refuses it once W has passed.
- The Season page hides the button then.
- Clearing an overdue break warns that it reopens the kitchen.

**Important.**
- Fix the Task 1 precondition query to `position('cs\_test\_' in prosrc) > 0`.
- Correct a test value.
- Task 14 must keep `stripe_session_id`.
- Replace the refund string scan with a rendered check.
- The failsafe counts tonight's recorded meal.
- Stronger G1 and G6 rehearsals.
- The end-today rehearsal asserts the reconciled result under the **redesigned** reconcile.
- Rehearsals insert fixture plans when no live paid plan exists. The live paid plans end 28 Sep.
- Stop "your plan starts today" emails during the break (`dispatch_start_day_emails_tick`).
- Deploy the app first, then switch the break cron on.
- The live last dinner is Wed 30 Sep.

**Minor.**
- Break tick minutes 20:20, 20:50 and 21:20 UTC, to avoid the closure tick at 20:15.
- A shared `useSaveSpot()` hook, also used by Plan B's notice.
- A shared `plansCookingToday`.
- A shared `effectiveCloseDay`, replacing Plan B's copies.
- Two test fixes.
- Distinct credit amounts in a rehearsal.
- A planned pause is compared with the effective close day.
- Staff wording goes to Plan E; the reopen link goes to Plan F.

**Spec text changes.** Ten are listed in `preflight-scan.md`:
- G4 promotes nothing during the break.
- §6.1 projection walks meals, not dates.
- A queued renewal is released with the held plan on Resume.
- The §8 step 10 outbox moves to Plan E.
- End-today rules.
- Start-day emails.
- The G6 wording.
- Live facts.
- Break tick minutes.
- A begin-break note.

**Start checks** (read-only, before Task 1):
- a. Does a resume after the 2 PM cutoff leave `end_date` one delivery day short?
- b. Session TimeZone for `generate_series(date, date, interval)::date`.
- c. Releasing a held plan on the same Dubai day the break began, against `canResume`'s same-day lock.
- d. Re-check every Plan B interface against Plan B's final commits.

**Owner questions** from the draft, taken on the recommended defaults, to confirm with the owner:
1. Kitchen and rider counts show what is really cooked on every day.
2. A plan sold during the break is held and the owner gets a WhatsApp, with no automatic credit.
3. A renewal queued behind a held plan restarts with it on Resume.

---

## 8. Plans D to G, and the templates

From spec §17.1 (phases P0 to P7):

| Plan | Phase | Contents |
|---|---|---|
| (now) | P0 | **Submit the 8 WhatsApp templates to Meta and draft the 6 emails.** Meta approval is the slowest step and nothing else blocks it |
| A | P1 | Shipped |
| B | P2 | In progress (section 6) |
| C | P3 | Drafted (section 7) |
| D | P4 | Refund request with owner approval: WhatsApp to the owner on request; approve or decline; `refund_requested`, `refund_processing`, `refunded`, `refund_failed`; webhook refund branch; ledger labels; flip `SEASON_REFUNDS_LIVE`; change the `season_holds` delete rule from CASCADE to RESTRICT |
| E | P5 | Messages: `season_notices` outbox and route, WhatsApp and email wiring, 10:00 AE sends, guards G7 and G8, admin notifications and digest. Wire `announceSeasonSkipCredited` to a `season_skip_credited` template (the missing credit-issued message) |
| F | P6 | Reopen: holds to ready, reopening notice on both channels for every audience. The approved templates `intake_reopened` and `intake_back_open` are not yet wired. Include the 5 customers holding AED 95 of earlier waitlist credit. N15 to N18, receipt credit line |
| G | P7 | Invariants tick, break board polish, atlas fixtures, runbook |

**Fallback from spec §17.2** if Plan C cannot be live in time: keep today's behaviour and add one guard. `resumeSubscription` and `adminResumeSub` refuse a resume after the last kitchen day, with the §7.5 copy ("resume once Dormers begins its new semester"). This stops the paused plan from reopening the kitchen in October.

Also deferred: the "1 days" plural in three interim strings, and `staff-season-copy.ts` and `season-horizon.ts` still use `toLocaleDateString`.

---

## 9. Owner decisions and open questions

**Decided:**
- D1 to D7 and X1 to X7 (spec §2).
- Order money is recorded and backfilled in Plan B.
- Make-up meals that land on a buffer day at scheduling become credit unless the plan already holds a grant.
- A pause is refused while a future credited skip exists.
- Save-a-spot eligibility follows the spec §2.2 superset.
- Deploy after each plan passes review.
- The menu work ships with Plan B.

**Open, for the owner:**
1. **Staff Monthly and the last kitchen day.** It shows 8 of 20 delivered with an end date of 18 Sep. The delivery tick keeps cooking until 20, which is Wed 30 Sep. Choose one:
   - correct the counter if more meals were really delivered
   - end the plan
   - set W to Wed 30 Sep (2 extra kitchen days)
   - keep Mon 28 Sep and hold its last 2 meals
2. **Confirm the three Plan C defaults** (section 7).
3. **Choose W** once Plan B is deployed and the Plan C timeline is known. The spec's original plan was W = Mon 28 Sep with buffer 1.

---

## 10. Recommended next steps, in order

1. Commit the Plan C draft. Copy the git-ignored `.superpowers/sdd/` folders somewhere safe.
2. Remove the stray worktree and branches (section 3) once you are sure they hold nothing you need.
3. Plan B Task 8 fix: implement `task-8-fix1-brief.md`, rehearse on live, review, apply.
4. Plan B Task 9 fix: implement `task-9-fix1-brief.md`, review.
5. Review Task 10, and change the chip id.
6. Plan B Tasks 11 to 17.
7. Whole-branch review, merge, deploy (section 6.3).
8. Tell the owner W can be scheduled, after the Staff Monthly decision.
9. Plan C:
   - apply the pre-flight rulings to the plan and spec
   - run the start checks
   - execute
   - deploy before W passes (app first, then the break cron)
10. P0 templates as soon as possible. Then Plans D, E, F and G.

# Season wind-down and break: design

**Date:** 2026-09-14
**Status:** Draft for owner review
**Builds on:** `2026-08-15-seasonal-intake-pause-design.md` (intake switch, waitlist credit),
`plans/2026-08-18-scheduled-pause-taper.md` (last delivery day, sales taper),
`plans/2026-08-18-broadcast-composer.md` (reopening notice).
**Replaces:** the rule "the pause has no effect on any live subscription" (2026-08-15 spec §5.3 and §12.5).
**Still forbidden:** scheduling a reopening. Reopening stays a human action.

---

## 1. Why

The seasonal pause stops sales. It does not stop the kitchen. Deliveries stop only when the last
plan runs out of meals, and anything that moves a plan's last meal keeps the kitchen running after
the pause starts: a skip, a customer pause that is resumed late, a closure day, a plan bought before
the season end was set. Every kitchen day costs about AED 500.

The goal: the kitchen cooks its last meal on a day the owner chose with full information, then
stops. Every meal a customer paid for ends in exactly one of four places:

1. **Delivered**
2. **Kept for next semester** (a held plan)
3. **Turned into wallet credit** (a credited skip)
4. **Refunded**

Customers and the owner hear about each step at the moment it matters, on the channel that fits it.

---

## 2. Decisions

### 2.1 Locked by the owner (2026-09-14)

| # | Decision |
|---|---|
| D1 | A customer whose own pause is still on when the break starts stays paused. During the break, Resume is refused with: the plan can resume once Dormers begins its new semester. They can save a spot and receive the same waitlist credit (AED 20 Non Veg and Religious Preference, AED 15 Veg). |
| D2 | A customer who resumes during the wind-down gets deliveries up to the wrap-up day. Meals left after that are held by Dormers for next semester. Because the hold is our doing, they receive the waitlist credit automatically, and they may choose a refund for the held meals instead of keeping them. |
| D3 | A skip whose make-up day would land after the season is still allowed. The meal's value goes into the customer's wallet as credit, and the plan's end date does not move past the season. |
| D4 | Before scheduling, the admin sees when the last meal on the books is delivered. The schedule adds one delivery day of buffer so a late skip can still be delivered. |
| D5 | Money and kitchen operations are involved, so this is one explicit state machine with customer and admin notifications at every transition, and no kitchen day beyond the last meal plus the buffer. |
| D6 | A refund for held meals waits for the owner's approval. The owner gets a WhatsApp the moment a customer asks, then approves or declines it. |
| D7 | A credited skip is worth what the customer paid for that meal: (card charge + wallet credit used) ÷ meals in the order, × meals that day. Live orders are backfilled from Stripe before credited skips go live; an order that cannot be resolved falls back to 90% of its list price. While Stripe runs in test mode (pilot), test payments are not money and use the fallback. (Owner, 2026-09-15) |

### 2.2 Carried from the 2026-09-14 review (recommended, confirm in review)

- The one-time full-screen notice moves from the night the break starts to the moment the season end is scheduled.
- A customer counts as "on the break" as soon as no Monthly or Weekly plan can follow theirs before the wrap-up day. Their renew reminder is replaced, their plan-ended message uses the season version, and they can save a spot.
- The reopen WhatsApp templates `intake_reopened` and `intake_back_open` (already APPROVED at Meta, not yet wired) join the reopening notice.
- Everyone holding unspent waitlist credit, from any season, receives the reopening notice. Today 5 customers holding AED 95 from earlier pause cycles are missed.
- Saving a spot sends a confirmation on WhatsApp and email.
- Scheduled customer messages go out at 10:00 AE, not 00:45.
- Checkout receipts show the credit used.

### 2.3 Defaults chosen in this doc (change any in review)

| # | Default | Why |
|---|---|---|
| X1 | A held plan restarts when the customer taps Resume after reopening. No automatic restart. | Students come back on different days. An automatic restart cooks for empty rooms. |
| X2 | Superseded by D6: a refund waits for the owner's approval. | Owner decision, 2026-09-14. |
| X3 | A credited skip uses one skip from the plan's allowance. | "3 skips" keeps meaning 3 skips, and a plan's last week cannot all turn into credit. |
| X4 | A customer-paused plan has no refund button. Support can refund by hand. | The refund reasoning in D2 is about meals Dormers withholds. A customer pause is the customer's choice. |
| X5 | Staff plans and welcome meals are held like any plan but earn no credit and no refund. | Neither was paid for in cash. Staff offboarding already has its own refund path. |
| X6 | Once a skip is credited it stays credited, even if the admin later moves the wrap-up day. | The customer has already been told. The cost shows in the admin digest. |
| X7 | A customer who refunds a held plan keeps the waitlist credit that came with the hold. | It is Monthly-only and exists to bring them back; taking it away punishes the refund D2 offers. |

---

## 3. Words used in this doc

| Term | Meaning |
|---|---|
| **Wrap-up day (W)** | The last day of regular deliveries. New plans must finish by it. The date customers see: "The semester wraps up on W." Stored in the existing `pause_scheduled_for` meaning for the sales taper. |
| **Buffer** | Up to N delivery days after W that cook only make-up meals from skips. Default 1. Never sold. |
| **Close day (K)** | W moved forward by the buffer, counted in Mon–Sat delivery days. The break starts the night after K. With buffer 0, K = W. |
| **Wind-down** | From scheduling until K. Sales taper, the kitchen runs, customers are told. |
| **Break** | From the night after K until reopening. No sales, kitchen closed. |
| **Season** | One wind-down plus its break. Keyed by `intake_settings.cycle_started_at`, which is now stamped when the season end is scheduled. |
| **Meals left** | `total_meals − delivered_meals − credited_skip_days × meals_per_day`. |
| **Held plan** | A plan with meals left when the break starts, other than a customer pause. Kept for next semester or refunded. |
| **Customer pause** | A pause the customer started (existing feature: open-ended, one per cycle, Monthly plans only). |
| **Credited skip** | A skip whose meal becomes wallet credit instead of a make-up day. |
| **Buffer grant** | Permission for one plan to deliver a make-up meal on a buffer day. |
| **Meal value** | What the customer paid for one meal of that order: (cash charged + wallet credit used) ÷ meals in the order. |

---

## 4. What the code does today

Verified 2026-09-14 against the live Dormers-Ohio database and the repo.

- `intake_settings.paused` stops checkout, free checkout, gift claims and staff cycles.
  `pause_scheduled_for` is the last delivery day; `intake_scheduled_pause_tick` (00:15 AE) flips
  `paused` the day after, then clears the date.
- `subscription_delivery_tick` (20:00 AE) delivers every Active plan on its delivery days. It checks
  company closures, never the season.
- `subscription_status_tick` (00:30 AE) promotes Scheduled plans on their start date, activates
  planned pauses, and ends a plan when `delivered_meals >= total_meals` and `end_date` has passed.
- A skip increments `skipped_meals_count`, and `_subscriptions_recompute_end_date` adds a make-up
  day. Only `changeStartDate`, checkout, free checkout and gift claim check the season date.
  `skipMeal`, `skipFutureDate`, `pauseSubscription`, `planPause`, `resumeSubscription`,
  `adminPauseSub` and `adminResumeSub` do not.
- The kitchen count (`src/contexts/ops/usecases/get-kitchen-counts.ts`) counts Active, Paused and
  Skipped plans and drops a plan only when today is in its `skipped_dates` or `paused_dates`.
- `orders.price_per_meal` is the pre-discount rate. The amount actually charged and the wallet
  credit used are not stored on the order; credit rows point at the order through `credits.applied_to`.
- Stripe refunds exist only for staff (`src/infra/stripe/refunds.ts`, idempotency-keyed).
  `handleChargeRefunded` restores applied credits on a full refund, alerts the admin that the plan
  is still active, and sends `refund_processed` on WhatsApp and email.
- Plan-ended messages go out at 00:45 AE; renew reminders at 18:00 AE, 2 to 3 days before the end.
- **Live on 2026-09-14:** sales paused since 2 Sep with no last delivery day set. 2 plans are still
  delivering (ending Fri 18 Sep and Mon 28 Sep) and 1 customer-paused plan (end date 25 Sep if resumed).

---

## 5. The season state machine

Three phases: `open`, `winding_down`, `break`. Every transition is one SQL function that locks the
`intake_settings` row, checks its guard, writes the change and its audit entry, and is safe to run twice.

| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| open | Admin schedules the season end (W, buffer) | W is a future date within 370 days | winding_down | Stamp `cycle_started_at`; store W, buffer, K; project plans (§6); reconcile skips (§7.2); queue scheduling notices for 10:00 AE tomorrow; admin summary |
| winding_down | Admin moves W or the buffer | The current W is still ahead, and the new W is tomorrow or later | winding_down | Re-project; reconcile skips; re-queue notices whose facts changed; admin summary with the change in kitchen days, held meals and refund exposure |
| winding_down | Admin clears the season end | None | open | Cancel unsent scheduling notices; keep credits already issued; admin summary |
| winding_down | Admin stops sales now | W is still ahead (once W passes, the nightly tick has already stopped sales) | winding_down | `sales_stopped_at = now()`; every purchase refused; kitchen unchanged |
| winding_down | Break tick, first AE day after K | phase = winding_down and K < today | break | Begin-break procedure (§8) |
| open | Admin ends the season today | Typed confirm that names the plans to be held and the refund exposure | winding_down, K = today | W = K = today, buffer 0, sales stopped; reconcile skips (§7.2); tonight's deliveries run; the break tick starts the break at 00:15. Lands with the break (P3): the action stays hidden until then |
| break | Admin reopens | None | open | Stamp `cycle_ended_at`; holds move to `ready` (§6.3); clear W and K; offer the reopening notice; admin reminder if it is not sent within 2 hours |
| any | Invariant checks (hourly in winding_down and break) | None | unchanged | Admin alert on any breach (§11.7) |

The old "Pause now" button is replaced by "End the season today" (open) and "Stop sales now"
(winding_down). There is no path to a break that skips the begin-break procedure. After W has passed,
the dates can still change by clearing the wrap-up day and scheduling a new one.

### 5.1 Storage

New columns on `intake_settings`:

| Column | Type | Notes |
|---|---|---|
| `season_phase` | `text not null default 'open'`, check in (`open`, `winding_down`, `break`) | Written only by transition functions |
| `wrap_up_day` | `date` | W. Kept through the break, cleared on reopen |
| `buffer_delivery_days` | `smallint not null default 1`, check 0 to 3 | |
| `close_day` | `date` | K, computed by the transition function |
| `sales_stopped_at` | `timestamptz` | Stop sales before W |
| `break_started_at` | `timestamptz` | |
| `kitchen_daily_cost_aed` | `numeric not null default 500` | Used by the planner and digest only |

**Compatibility.** `paused` stays true exactly when phase = break or sales are stopped.
`pause_scheduled_for` stays equal to W while winding down. Both are written only by the transition
functions until every reader in §13.3 moves to `season_phase`. `getIntakeState()` gains `phase`,
`wrapUpDay`, `bufferDays`, `closeDay` and `salesStopped`.

**Fail-open stays for sales, not for the kitchen or money.** `getIntakeState()` still resolves to
open on a read error, so a settings blip never blocks a sale. Resume, delivery, promotion and refund
guards read the phase inside SQL (§9), where a read error fails the operation instead.

### 5.2 Taking over the live row

Today's live row (`paused = true`, `pause_scheduled_for = null`) maps to `winding_down` with
`sales_stopped_at = paused_at` and no W. The Season page shows "Set the wrap-up day" as a blocking
task. Until it is set, the break never starts, which is today's behaviour.

---

## 6. Plan projection and per-plan states

### 6.1 Projection

A pure TypeScript module (`src/contexts/season/domain/season-projection.ts`) and its SQL twin
(`season_project_plans(p_wrap_up date, p_close date)`) classify every live plan (Active, Skipped,
Paused, Scheduled). Tests keep the two in lockstep the same way `end-date.ts` is kept in lockstep
with `compute_subscription_end_date`.

| Disposition | Condition | What happens when the break starts |
|---|---|---|
| `finishes` | Not paused, no planned pause, every remaining delivery falls on or before W (or on a granted buffer day) | Ends normally at 00:30 |
| `customer_paused` | Status Paused by the customer, or `planned_pause_start` on or before W | Stays paused (D1) |
| `runs_past` | Active or Skipped with deliveries still due after W that are not buffer grants | Held (D2) |
| `starts_after` | Scheduled with `start_date` after W (a queued renewal, or a plan paid for through a checkout opened before the schedule) | Held with nothing delivered |
| `staff_pending` | Scheduled staff renewal with `staff_approval = 'pending'` | Stays pending; the staff gate already refuses it |

For each plan the projection also returns: last regular dinner, deliveries after W, meals left after
W, meal value, refund exposure (cash and credit share, §10), and whether a buffer grant exists.

Summed across plans it returns the **kitchen calendar**: meals per date from today to K, plans
ending on each date, and kitchen days × `kitchen_daily_cost_aed`.

Readers: the admin planner and boards (§11), the daily digest, customer notices, and the resume and
skip sheets.

### 6.2 Deliveries between W and K

Regular deliveries stop at W for every plan. A date after W and on or before K cooks only for plans
with a buffer grant (`subscriptions.season_buffer_grants`, one per skip that used the buffer, never
more than `buffer_delivery_days`). If no plan holds a grant, the kitchen does not cook between W and
K, and the break simply starts after K.

### 6.3 Per-plan state machine (`season_holds.state`)

| From | Event | To | Effects |
|---|---|---|---|
| none | Break starts, disposition `runs_past` or `starts_after` | `held` | Active or Skipped plan set to Paused (Scheduled stays Scheduled); `subscriptions.season_hold_id` set; waitlist credit minted for paid plans; notice queued |
| none | Break starts, disposition `customer_paused` | `paused_by_customer` | Notice queued |
| `held` or `ready` | Customer requests a refund | `refund_requested` | Owner WhatsApp with customer, plan, meals and AED; customer sees "Refund requested" |
| `refund_requested` | Customer cancels the request | `held` (break) or `ready` (after reopening) | Owner told |
| `refund_requested` | Owner declines | `held` or `ready` | Customer told, with the owner's reason |
| `refund_requested` | Owner approves | `refund_processing` | Stripe call (§10.3) |
| `refund_processing` | Stripe accepts | `refunded` | Plan Ended; credit share returned; refund messages |
| `refund_processing` | Stripe rejects or times out | `refund_failed` | Owner alert; customer still sees "Refund requested" |
| `refund_failed` | Admin retries and Stripe accepts | `refunded` | As above |
| `held` or `paused_by_customer` | Admin reopens | `ready` | "Your meals are ready" notice |
| `ready` | Customer taps Resume (Paused plan) or picks a start date (Scheduled plan) | `released` | Normal plan again; `season_hold_id` cleared |

A refund is possible from `held` and `ready`, only for holds of reason `season` on plans paid through
Stripe (X4, X5). Once `released`, the plan is an ordinary plan.

---

## 7. Customer actions during the season

### 7.1 Buying

Checkout, free checkout, gift claim and staff cycles judge the journey against **W**, as the taper
does today with `pause_scheduled_for`. A buffer day is never sold. Once sales are stopped, or during
the break, every purchase is refused (existing behaviour).

### 7.2 Skipping (same-day and future), wind-down only

Compute the plan's end date as if the skip were taken.

| New make-up day | Result |
|---|---|
| On or before W | Normal skip, exactly as today |
| After W, on or before K, and the plan has a buffer grant left | Normal skip plus a buffer grant; the kitchen will cook that make-up meal on the buffer day |
| Anywhere else | **Credited skip** |

A credited skip:

- **Sheet before confirming:** "There's no delivery day left before {W} to move this meal to. Skip
  it and AED {value} goes to your wallet." Button: "Skip and add AED {value}".
- **Writes:** date appended to `skipped_dates` (the kitchen count and the status tick already honour
  it); `credited_skip_days + 1`; `skipped_meals_count` unchanged, so the end date does not move;
  same-day skips flip to Skipped as today.
- **Credit row:** `source = 'season_skip'`, `subscription_id`, `meal_date`, amount = meal value ×
  meals per day, `eligible_plan_ids = null` (any plan). Status `approved` for a same-day skip (it
  cannot be undone), `pending` for a future date.
- **Allowance:** allowed only while `skipped_meals_count + credited_skip_days` is below the plan's
  skip allowance (X3).
- **Plans worth nothing in cash** (staff plans, welcome meals): the skip is allowed and not made up,
  no credit is minted, and the sheet says so.
- **Messages:** WhatsApp `season_skip_credited` replaces `meal_skipped_confirm` /
  `meal_skip_scheduled_confirm`. No `meal_resumed_confirm` is queued for a date after W.
- **Undo:** a future credited skip can be undone until the day before. The date is removed,
  `credited_skip_days − 1`, and the pending credit becomes `rejected`.
- **Approval:** `season_skip_credit_tick` (00:40 AE) turns `pending` season-skip credits whose
  `meal_date` has passed into `approved`. The wallet shows a pending one as "AED {x} arrives {date}".

**Reconciliation when the schedule is set or moved.** Future skips whose make-up day now lands
outside W (and outside a grant) become credited skips, and past skips whose make-up meal now lands
there turn that make-up meal into credit. Each affected customer gets `season_skip_credited`. A
buffer reduced to 0 turns existing grants into credit the same way. Credits never turn back (X6).

### 7.3 Pausing during the wind-down

Allowed as today. The pause sheet adds one line: "The semester wraps up on {W}. If you're still
paused then, your plan waits for you until we're back." Nothing is minted at this point. A pause, now
or planned, is refused while a credited skip lies inside it: the customer undoes that skip first,
because the pause would extend the plan for a day the credit already pays back (owner, 2026-09-15).

### 7.4 Resuming during the wind-down

Allowed. Before confirming, the sheet runs the projection for this plan:

- **Nothing left after W:** today's sheet, unchanged.
- **Meals left after W:** "Dinners from {first day} to {W}. Your other {N} meals will be kept for
  next semester, with AED {credit} in your wallet. You can ask for a refund for those {N} meals
  instead (AED {amount})." Buttons: "Resume" / "Stay paused".

Nothing extra is stored. The hold is created when the break starts, from the projection at that moment.

### 7.5 Resuming during the break

Refused, by the customer or by an admin, in the server action **and** in SQL (guard G2, §9).
Customer copy: "The kitchen is closed between semesters. Your plan can resume once we're back." If
they have not saved a spot this season: "Save my spot" with the AED amount, which runs the normal
join and mints the waitlist credit (D1). After reopening, Resume works as today.

### 7.6 Changing a start date

Existing Scheduled plans are judged against W, as today. During the break it is refused, except for
a held Scheduled plan after reopening; the once-per-plan allowance does not count that change.

### 7.7 Saving a spot

Allowed when:

- the phase is `break`; or
- the phase is `winding_down` and the customer's live plan is `customer_paused` or `runs_past`; or
- the phase is `winding_down` and no Monthly or Weekly plan can follow the customer's last live plan
  (or start now, when they have none) and still finish by W (`taperedMaxStart` is null for both);
  stopped sales count as "cannot follow" (§2.2, owner 2026-09-15).

`resolveJoinCycle` changes to this rule. It stays one join and one credit per customer per season.
It sends `season_spot_saved` on WhatsApp and email (§12).

---

## 8. Begin-break procedure

`season_begin_break()` runs from `season_break_tick` at 00:15 AE, replacing
`intake_scheduled_pause_tick`. That is after the final night's 20:00 deliveries and before the 00:30
status tick. It runs in one transaction and can be run again safely.

1. Lock the `intake_settings` row. Stop unless the phase is `winding_down` and K is before today (AE).
2. Run the projection with W and K.
3. `finishes`: nothing. The 00:30 status tick ends them once their meals are delivered.
4. **Held test by meals, not dates.** Any Active or Skipped plan with meals left becomes a hold with
   reason `season`: status Paused, `pause_date = now()`, `season_hold_id` set, `has_paused_before`
   untouched. A plan whose end date says it finished but still has meals left is held too.
5. `starts_after`: hold with reason `season`; status stays Scheduled; `season_hold_id` set.
6. `customer_paused`: hold with reason `customer_pause`.
7. Paid `season` holds: insert the customer's `intake_waitlist` row for this season (on conflict do
   nothing) and mint the waitlist credit through the existing one-credit-per-row unique index. Store
   `waitlist_credit_id` on the hold.
8. Close pending notifications that promise a meal after K (for example `meal_resumed_confirm`),
   using the existing `cancelled:superseded` convention.
9. Set phase `break`, `paused = true`, `break_started_at = now()`.
10. Insert `season_notices` rows (§12.3) with `send_after = 10:00 AE today`, and the admin summary.

If any step fails, the whole transaction rolls back. The tick runs again at 00:45 and 01:15. If the
phase is still `winding_down` at 01:30 AE with K in the past, the admin is alerted.

---

## 9. Kitchen and money guards

Defence in depth: each guard on its own would stop a wrong meal or a wrong charge.

| # | Guard | Where | Rule |
|---|---|---|---|
| G1 | Delivery tick | `subscription_delivery_tick` | Return early when phase = break, the same way it does on a closure. While winding down and after W, deliver only plans holding a buffer grant for today. Never deliver a plan with `season_hold_id`. Cap: `delivered_meals < total_meals − credited_skip_days × meals_per_day`. |
| G2 | Status guard | New `trg_subscriptions_season_guard`, BEFORE UPDATE | During the break, refuse any change of `status` to Active unless the transaction set `dormers.season_release = on`. Only the release and refund functions set it. Raises `SEASON_BREAK`; server actions turn it into the §7.5 copy. |
| G3 | Arrival guard | New AFTER INSERT trigger on `subscriptions` | During the break, a new Active or Scheduled plan is held on arrival: status Scheduled, hold with reason `season`, admin alert. This covers a sale that slipped through a fail-open read and a checkout opened before the break but paid during it. Money is never taken without a plan the customer can see. |
| G4 | Status tick | `subscription_status_tick` | Do not promote a Scheduled plan with `season_hold_id`. Do not activate planned pauses during the break. End a plan when `delivered_meals + credited_skip_days × meals_per_day >= total_meals` and `end_date` has passed. |
| G5 | Kitchen and dorm counts | `get-kitchen-counts.ts`, `get-dorm-counts.ts` | During the break return zero with `closedForBreak: true`; the kitchen screen reads "Kitchen closed for the semester break". Always drop plans with `season_hold_id`. After W, count only today's buffer grants. |
| G6 | 8 PM failsafe | `ops_failsafe_send_tick` | Quiet during the break, and on buffer days with no grants. |
| G7 | Renew reminder | `dispatch_renew_nudges_tick`, `renew-nudge-send` | Skip during the break. While winding down, send `season_last_dinners` instead when no Monthly or Weekly plan can follow this one before W. |
| G8 | Plan-ended notice | `resolveEndedNotice` | Season version when phase = break, or when winding down and no Monthly or Weekly plan can follow. |
| G9 | Resume actions | `resumeSubscription`, `adminResumeSub` | Read the phase fresh (`getIntakeState({ fresh: true })`) and refuse during the break; G2 backs this up. |
| G10 | Invariants | New `season_invariants_tick`, hourly whenever the phase is not `open` | Alert on: an Active plan during the break; a delivery recorded after K; a delivery after W without a grant; a paid `season` hold without its waitlist credit; `refund_processing` older than 30 minutes; a pending season-skip credit two days past its date; phase still `winding_down` at 01:30 AE after K. |

---

## 10. Money

### 10.1 Meal value

New `orders` columns, written by the Stripe webhook and by free checkout:

| Column | Value |
|---|---|
| `amount_paid_fils` | Stripe `amount_total` (0 for a credit-only order) |
| `credit_applied_fils` | Wallet credit applied to this order, including the used part of a split credit |
| `refund_reason` | `season_hold` when a season refund is issued, otherwise null |

`meal_value_fils = floor((amount_paid_fils + credit_applied_fils) / meals_count)`

Wallet credit applied means what the order really consumed: rows redeemed in full plus the used part
of a split row. The unused part is re-deposited as a `_split_remainder` row, so summing
`credits.applied_to` over-counts.

`price_per_meal` is the pre-discount rate. It is never used for refunds, and for credit only as the
fallback below.

**Recording and backfill (P2, before credited skips go live).** The Stripe webhook and free checkout
write both columns on every new order, in test and live mode. A script with a dry-run default fills
both for orders tied to live plans, reading the live-mode PaymentIntent (`amount_received`, never net
of refunds) or Checkout Session (`amount_total`) and the credit actually used. Stripe runs in test
mode for the pilot and test payments are not money, so `cs_test_` orders and card orders without
Stripe ids are left null.

**Fallback.** An order with no recorded money has no exact meal value: its credited skips credit
`floor(round(price_per_meal × 100) × 90 / 100)` per meal (90% of list price; the Dorm Wars tier coupon
takes at most 10%), and its refund button stays hidden.

### 10.2 Credits

| Source | Minted when | Amount | Usable on | Status |
|---|---|---|---|---|
| `intake_waitlist` (exists) | The customer saves a spot, or automatically for a paid `season` hold | By meal preference: AED 20 / 15 / 20 | Monthly plans | `approved` |
| `season_skip` (new) | A credited skip | What the customer paid for that meal × meals that day (D7); 90% of list price per meal when the order's money is unrecorded (§10.1) | Any plan | `pending`, then `approved` once the meal date passes; a same-day skip is `approved` at once |
| `season_refund_return` (new) | A refunded held plan that was partly paid with wallet credit | Held meals × credit share per meal | Any plan | `approved` |

New `credits` columns: `subscription_id uuid`, `meal_date date`, with a unique partial index on
`(subscription_id, meal_date)` where `source = 'season_skip'`. New labels in
`src/shared/credit-ledger.ts`: "Skipped meal credit" and "Credit returned with your refund", both in
category `season` so they never count as game earnings.

### 10.3 Refunding a held plan

**Offered** on holds with reason `season`, on plans paid through Stripe, in state `held` or `ready`,
with a known meal value.

**Amount**
- Cash: `floor(held_meals × amount_paid_fils / meals_count)`, capped at what is still refundable
  on the PaymentIntent, read from Stripe at request time.
- Credit share: `floor(held_meals × credit_applied_fils / meals_count)`, returned as a
  `season_refund_return` credit.
- A queued renewal held behind the plan has its own hold and amount. "Refund both" makes two calls.

**Flow**
1. `requestSeasonRefund(holdId)`, customer: check ownership; compare-and-set `held` or `ready` →
   `refund_requested`; store the computed amounts on the hold; WhatsApp the owner through
   `notifyAdmin` with customer, plan, held meals, cash AED, credit AED and "Approve or decline on the
   Season page". The customer sees "Refund requested. We'll confirm on WhatsApp." and can cancel
   while the request is pending.
2. `approveSeasonRefund(holdId)`, admin: recompute the amounts and re-read what is still refundable
   from Stripe; compare-and-set `refund_requested` → `refund_processing`; set
   `orders.refund_reason = 'season_hold'`; call
   `refundPaymentFils(intent, cashFils, 'refund:season:' + holdId)`. The key makes a retry return the
   same refund instead of paying twice.
3. On success, in one transaction: hold → `refunded` with the refund id and amounts; plan → Ended
   (with `dormers.season_release` set); credit share row inserted.
4. On failure: hold → `refund_failed` with the error; owner alert; Retry on the break board.
5. `declineSeasonRefund(holdId, reason)`, admin: `refund_requested` → `held` or `ready`; the customer
   sees the reason on the hold card and gets the `season-refund-declined` email.
6. A request still waiting after 24 hours sends the owner a reminder.

**Webhook.** `handleChargeRefunded` reads `orders.refund_reason`. For `season_hold` it skips the
credit restore and the "Full REFUND… Subscription is still Active" admin alert, because the season
flow already did both jobs. It still sets the invoice status and sends `refund_processed` on
WhatsApp and email.

**Zoho.** The staff refund path raises no credit note today, and season refunds follow the same
rule for now. Zoho reconciliation is a follow-up (§18).

---

## 11. Admin

### 11.1 Planning the season end (Season page, phase `open`)

1. **The fact first:** "Last meal on the books: Sat 3 Oct. 1 plan (Monthly Premium)."
2. **Kitchen calendar:** one row per date from today to the last meal on the books, showing meals,
   plans ending that day, and running kitchen cost.
3. **Controls:** Wrap-up day (defaults to the last meal on the books) and Buffer (default 1). The
   page shows K and the night the break starts.
4. **Effect of the chosen dates:** plans that run past W (count, meals, refund exposure in AED,
   credit cost in AED); kitchen days saved against the last meal on the books (days × AED 500); the
   sales rule customers will see ("New plans must finish by Sat 3 Oct").
5. **Confirm modal** restates all of it and ends with: "Customer messages go out tomorrow at 10:00.
   Clear the schedule before then and nothing is sent."

The 10:00 next-morning send is the undo window for a mistaken schedule.

### 11.2 Wind-down board (phase `winding_down`)

- Phase chip, W, K, kitchen days left.
- Every live plan with its disposition, last regular dinner, meals after W, buffer grants and
  credited skips, filterable by disposition.
- Changes since yesterday: credited skips (AED), buffer grants, resumes that now run past W,
  closures added, plans bought.
- Actions: Move the wrap-up day, Change the buffer, Stop sales now, Clear the schedule. Each shows
  its effect before confirming.

### 11.3 Break board (phase `break`)

- Held plans: customer, plan, meals, value, state, refund amount, Stripe id. Approve and Decline on
  `refund_requested`; Retry on `refund_failed`.
- Customer-paused plans, and whether each customer has saved a spot.
- Totals: credits minted by source, refunds by state, waitlist count against `reopen_target`.
- Invariant status: green, or the rule that failed.
- Reopen, showing the holds that will become ready, with a link to the reopening notice.

### 11.4 Holidays page

Adding a closure while winding down lists the plans that would now run past W, with the exposure,
before confirming.

### 11.5 Admin actions on a customer

`adminPauseSub`, `adminResumeSub`, `adminAdjustSkips`, `adminGiftMeals` and `adminCompMeal` follow
the same season rules as the customer. An admin resume during the break is refused with the same reason.

### 11.6 Cron registry

`src/app/admin/_components/cron-registry.ts` gains `season_break_tick`, `season_skip_credit_tick`,
`season_invariants_tick`, `dispatch_season_notices_tick` and `season_admin_digest_tick`, and drops
`intake_scheduled_pause_00_15_ae`.

### 11.7 Admin notifications

Sent through `notifyAdmin` (WhatsApp, with email as the fallback). Every message names counts and AED amounts.

| When | Message |
|---|---|
| Season end scheduled, moved or cleared | W, buffer, K; plans by disposition; held meals; refund exposure; kitchen days; "Customer messages go out tomorrow at 10:00" |
| 18:00 AE daily while winding down, only if something changed | New plans running past W; credited skips (AED); buffer grants and the kitchen day each opens; last meal on the books moved earlier ("Move W to save AED {x}"); closures added |
| 2 days before K | Final roster: last dinners by day, plans to be held, credits to mint |
| K, 20:30 AE | Tonight's deliveries; "The break starts at 00:15" |
| Break started | Holds by reason; credits minted (AED); invariants passed |
| 01:30 AE, break not started although K has passed | Escalation |
| Refund requested, immediately | Customer, plan, held meals, cash AED, credit AED; "Approve or decline on the Season page" |
| Refund request still waiting after 24 hours | The same facts, as a reminder |
| Refund processed or failed | Customer, plan, AED, Stripe id or error |
| Invariant breach | The rule and the plan |
| Reopened | Holds now ready; whether the reopening notice went out, and again 2 hours later if it has not |
| 7 days after reopening | Held plans not restarted; waitlist credit still unspent (AED) |

---

## 12. Customer notifications

### 12.1 Rules

- A confirmation of the customer's own action goes immediately. Everything else goes at 10:00 AE.
- One message per fact, per plan, per season. If the fact changed before 10:00 (the hold was
  refunded, the schedule was cleared), the notice is dropped, not sent.
- WhatsApp and email tell the same story. The WhatsApp kind follows the email's choice, the rule
  `pause-suppression.ts` already enforces.
- Customer copy: plain words, no emoji, no dashes, the customer's own dates and amounts.
- An in-app full-screen notice shows once per fact (keyed by season and W) and leaves a quiet chip behind.

### 12.2 Every moment

| # | Moment | Who | In-app | WhatsApp | Email | When |
|---|---|---|---|---|---|---|
| N1 | Season end scheduled | Plans that finish | Full-screen notice once: "Your meals keep coming. Every delivery you've paid for arrives, through {last dinner}. The semester wraps up on {W}." Then a "Semester wraps up {W}" chip on home | None | None | Next visit |
| N2 | Season end scheduled | Plans that run past W | Full-screen notice with the split and both options | `season_plan_runs_past` (new) | `season-plan-runs-past` (new) | 10:00 next day; again only if W moves and their split changes; never to a customer who already saw the split when resuming (N7) |
| N3 | Season end scheduled | Customer-paused plans | Notice once: "Still paused on {W}? Your plan waits for you until we're back." | None | None | Next visit |
| N4 | 2 to 3 days before a plan ends, and no plan can follow | That customer | Plan-ending banner with Save my spot | `season_last_dinners` (new), replaces `subscription_renew_nudge` | `season-last-dinners` (new), replaces `renew-nudge` | 10:00 |
| N5 | Plan ends while winding down, and no plan can follow | That customer | Save-my-spot card | `intake_ended_credit` / `dormers_intake_ended_offer_v1` (exist) | `season-plan-ended` (exists) | 10:00, moved from 00:45 |
| N6 | Credited skip | That customer | Sheet before, confirmation after | `season_skip_credited` (new) | None | Immediate |
| N7 | Resume while winding down, with meals past W | That customer | Split sheet before confirming | `plan_resumed_confirm` (exists) | None | Immediate |
| N8 | Break starts | Held plans | Full-screen notice: Keep for next semester / Refund | `season_plan_held` (new) | `season-plan-held` (new) | 10:00 |
| N9 | Break starts | Customer-paused plans | Notice on next visit | `season_pause_carries` (new) | `season-pause-carries` (new) | 10:00 |
| N10 | Break starts | Plans that finished on W or K | Season plan-ended card | N5 templates (exist) | `season-plan-ended` (exists) | 10:00 |
| N11 | Resume tapped during the break | That customer | Refusal sheet with Save my spot | None | None | Immediate |
| N12 | Spot saved | That customer | Card flips to confirmed | `season_spot_saved` (new) | `season-spot-saved` (new) | Immediate |
| N13 | Refund requested | That customer | "Refund requested. We'll confirm on WhatsApp." | None | None | Immediate |
| N13b | Refund declined by the owner | That customer | Hold card shows the owner's reason | None | `season-refund-declined` (new) | Immediate |
| N14 | Refund processed | That customer | Hold card shows Refunded | `refund_processed` (exists) | `refund-processed` (exists) | On the Stripe webhook |
| N15 | Reopening notice sent | Credit holders, from any season | "Reopened" full-screen notice | `intake_reopened` (approved at Meta, to wire) | `season-reopen` (exists) | When the admin sends it |
| N16 | Reopening notice sent | Past customers without credit | None | `intake_back_open` (approved at Meta, to wire) | `season-reopen` (exists) | Same |
| N17 | Reopening notice sent | Held and customer-paused plans | "Your {N} meals are ready" full-screen notice | `season_plan_ready` (new) | `season-reopen` with a held block (change) | Same |
| N18 | 5 days after reopening | Credit holders who have not bought | None | `season_credit_waiting` (new) | `season-credit-waiting` (new) | Once, 10:00 |
| N19 | Checkout uses credit | The buyer | None | None | Order confirmation shows "AED {x} credit used" (change) | Existing send |

A customer who qualifies for both N15 and N17 gets N17 only, and its copy carries the credit line.

### 12.3 The `season_notices` outbox

| Column | Notes |
|---|---|
| `id`, `customer_id`, `kind`, `subject_id` (plan, hold or credit id), `cycle_started_at` | Unique on `(kind, subject_id, cycle_started_at)` |
| `send_after` | 10:00 AE for scheduled kinds, now for immediate ones |
| `payload jsonb` | The facts at queue time |
| `email_sent_at`, `whatsapp_queued_at`, `dropped_at`, `drop_reason`, `attempts`, `last_error` | Per-channel stamps, so a retry never re-sends a channel that already went |

`dispatch_season_notices_tick` (every 5 minutes, idle when nothing is due) posts batches to
`/api/internal/season-notices-send`. The route re-checks the fact (hold still held, schedule still
set), sends the email through ZeptoMail, queues the WhatsApp through `queueCustomerNotification`,
and stamps each channel. It claims rows with the same lease pattern as `broadcast-send`.

### 12.4 Templates

**WhatsApp: 8 new.** Each follows the existing four steps: Meta approval (`en`, named parameters,
static URL button to `https://dormers.ae/dashboard`) → Vault secret `tpl_<kind>` → kind added to the
`customer_notifications` check constraint plus a dispatcher CASE branch → `CustomerNotificationKind`
and `VALID_KINDS`. Each group sits behind an env flag that fails closed, like
`WHATSAPP_SEASON_ENDED_ENABLED`. Remember `npm run check:whatsapp-template` hard-codes the
`ops_access_link` contract; only its first line and variable list are useful for these.

| Kind | Category to request | Parameters |
|---|---|---|
| `season_plan_runs_past` | UTILITY | first_name, wrap_up_day, held_meals, credit_aed |
| `season_last_dinners` | MARKETING | first_name, last_dinner, wrap_up_day, offer_aed |
| `season_skip_credited` | UTILITY | first_name, wrap_up_day, credit_aed |
| `season_plan_held` | UTILITY | first_name, plan_name, held_meals, credit_aed |
| `season_pause_carries` | UTILITY | first_name, plan_name, offer_aed |
| `season_spot_saved` | UTILITY | first_name, credit_aed |
| `season_plan_ready` | MARKETING | first_name, held_meals, plan_name |
| `season_credit_waiting` | MARKETING | first_name, credit_aed |

Meta decides the final category. If it moves a UTILITY template to MARKETING, accept it.

**Email.** New ZeptoMail templates in the card style of `docs/email-templates/EMAIL-DESIGN.md`:
`season-plan-runs-past`, `season-last-dinners`, `season-plan-held`, `season-pause-carries`,
`season-spot-saved`, `season-credit-waiting`. Changed: `season-reopen` (held block) and the order
confirmation (credit line). Each file records its chosen subject line in its header comment.

**Draft WhatsApp copy**

- `season_plan_held`: "The kitchen is closed between semesters, so your last *{{held_meals}}* meals
  of {{plan_name}} are kept for you. *AED {{credit_aed}}* is in your wallet too. When we're back, tap
  Resume. If you'd rather have your money back, you can ask for a refund in your dashboard."
  Button: "See my options".
- `season_plan_runs_past`: "The semester wraps up on {{wrap_up_day}}. Your dinners run until then.
  Your last *{{held_meals}}* meals will be kept for next semester with AED {{credit_aed}} in your
  wallet, or you can ask for a refund for them." Button: "See my options".
- `season_skip_credited`: "Skipped. There's no delivery day left before {{wrap_up_day}} to move this
  meal to, so *AED {{credit_aed}}* goes to your wallet instead." Button: "See my wallet".
- `season_pause_carries`: "Your {{plan_name}} is still paused, and the kitchen is now closed between
  semesters. Your meals wait for you, so resume when we're back. Save your spot now and AED
  {{offer_aed}} goes to your wallet." Button: "Save my spot".
- `season_spot_saved`: "Your spot is saved. *AED {{credit_aed}}* is in your Credit Wallet for your
  first Monthly plan when we reopen, and it does not expire. We'll message you here the day the
  kitchen is back." Button: "See my wallet".

---

## 13. Data model and code map

### 13.1 Migrations

Applied live through the Supabase connector and mirrored verbatim into `supabase/migrations/`. Every
existing function is copied from `pg_get_functiondef` on live before it is changed; the repo's
migration files are stale for several of them.

1. `intake_settings`: the §5.1 columns, and the live-row takeover (§5.2).
2. `subscriptions`: `credited_skip_days smallint not null default 0` (≥ 0),
   `credited_skip_dates date[] not null default '{}'` (always `credited_skip_days` long: which skipped
   dates were credited; needed because a credited skip on a plan worth nothing in cash mints no credit row),
   `season_buffer_grants smallint not null default 0` (≥ 0), `season_hold_id uuid` referencing `season_holds`.
3. `season_holds`: `id`, `subscription_id`, `customer_id`, `order_id`, `cycle_started_at`,
   `reason` (`season` | `customer_pause`), `state` (§6.3), `held_meals`, `meal_value_fils`,
   `cash_refund_fils`, `credit_share_fils`, `waitlist_credit_id`, `stripe_refund_id`,
   `credit_return_id`, `last_error`, `created_at`, `ready_at`, `released_at`, `refunded_at`.
   Unique on `(subscription_id, cycle_started_at)`. RLS: service role writes, customers read their own rows.
4. `credits`: `subscription_id`, `meal_date`, and the partial unique index (§10.2).
5. `orders`: `amount_paid_fils`, `credit_applied_fils`, `refund_reason`.
6. `season_notices` (§12.3).
7. New functions: `season_schedule_end`, `season_move_end`, `season_clear_end`, `season_stop_sales`,
   `season_end_today`, `season_begin_break`, `season_reopen`, `season_release_hold`,
   `season_project_plans`, `season_skip_credit_tick`, `season_invariants_tick`,
   `dispatch_season_notices_tick`, `season_admin_digest_tick`.
8. Changed functions: `subscription_delivery_tick` (G1), `subscription_status_tick` (G4),
   `dispatch_renew_nudges_tick` (G7), `ops_failsafe_send_tick` (G6), `broadcast_audience` for
   `reopen` (credit holders from any season, plus held plans).
9. Triggers: `trg_subscriptions_season_guard` (G2) and the arrival trigger (G3).
10. `customer_notifications`: kind check and dispatcher CASE branches for the 8 new kinds plus
    `intake_reopened` and `intake_back_open`.
11. Cron: `season_break_tick` replaces `intake_scheduled_pause_00_15_ae` at 20:15 UTC, with retries
    at 20:45 and 21:15 UTC; `season_skip_credit_tick` 20:40 UTC; `season_admin_digest_tick` 14:00
    UTC; `dispatch_season_notices_tick` every 5 minutes; `season_invariants_tick` hourly.

### 13.2 New modules

| Path | Job |
|---|---|
| `src/contexts/season/domain/season-phase.ts` | Transition table and guards (pure) |
| `src/contexts/season/domain/season-projection.ts` | Dispositions and kitchen calendar (pure, lockstep with SQL) |
| `src/contexts/season/domain/skip-outcome.ts` | Normal skip, buffer grant, or credited skip (pure) |
| `src/contexts/season/domain/meal-value.ts` | Meal value, refund cash and credit share (pure) |
| `src/contexts/season/domain/season-notice-plan.ts` | Who gets which notice, on which channel (pure) |
| `src/contexts/season/usecases/` | Schedule, move, clear, stop sales, end today, reopen, request refund, retry refund |
| `src/app/api/internal/season-notices-send/route.ts` | Outbox sender |
| `src/app/admin/season/` | Planner, wind-down board, break board |
| `src/app/dashboard/_shared/SeasonScheduledNotice.tsx`, `HeldPlanCard.tsx`, `SeasonSplitSheet.tsx`, `BreakResumeSheet.tsx` | Customer surfaces, desktop and mobile, each with preview knobs |

### 13.3 Existing files that change

| File | Change |
|---|---|
| `src/infra/config/intake.ts` | Phase and the new dates on `IntakeState` |
| `src/contexts/subscriptions/usecases/subscription-mutations.ts` | Skip outcome (§7.2), pause line (§7.3), resume split and break refusal (§7.4, §7.5), start date (§7.6) |
| `src/contexts/subscriptions/domain/subscription-rules.ts` | Skip allowance counts credited skips |
| `src/app/admin/customers/[id]/actions.ts` | Same rules for admin actions (§11.5) |
| `src/contexts/subscriptions/usecases/join-intake-waitlist.ts`, `domain/intake-cycle.ts` | Save-a-spot eligibility (§7.7) and its confirmation |
| `src/app/api/checkout/route.ts`, `src/contexts/payments/usecases/free-checkout.ts`, `src/app/r/[cid]/actions.ts`, `src/contexts/staff/usecases/provision-plan.ts`, `renewal.ts` | Sales judged against W; stop sales |
| `src/contexts/payments/usecases/handle-stripe-event.ts` | Order money columns; season refund branch |
| `src/contexts/ops/usecases/get-kitchen-counts.ts`, `get-dorm-counts.ts` | G5 |
| `src/app/api/internal/renew-nudge-send/route.ts`, `subscription-ended-send/route.ts`, `src/contexts/notifications/domain/pause-suppression.ts` | G7, G8, 10:00 sends |
| `src/app/api/internal/broadcast-send/route.ts`, `src/infra/zeptomail/broadcast-shell.ts` | Reopen WhatsApp, held block |
| `src/contexts/notifications/usecases/queue.ts`, `subscribers.ts` | New kinds |
| `src/app/admin/season/`, `src/app/admin/holidays/`, `src/app/admin/_components/cron-registry.ts` | §11 |
| `src/app/dashboard/ClientDashboard.tsx`, `ActiveDashboard.tsx`, `_mobile/MobileHome.tsx`, `_mobile/MobilePlan.tsx`, `_shared/FutureSkipModal.tsx`, `_shared/PlanPauseModal.tsx`, `_shared/IntakePauseTakeover.tsx`, `credit/page.tsx` | Customer surfaces; pending credit in the wallet |
| `src/shared/credit-ledger.ts` | New sources |

---

## 14. Worked example

The owner schedules on **Mon 14 Sep**. Ten plans; four of them matter:

- **A:** Monthly Premium, Mon to Sat, last meal Sat 3 Oct.
- **B:** plan ends Wed 30 Sep. No Monthly or Weekly plan could start Thu 1 Oct and finish by Sat 3 Oct.
- **C:** customer pause since 10 Sep, never resumed.
- **D:** customer pause, resumes Thu 1 Oct with 12 meals left. Paid AED 432 for 24 meals, so AED 18 a meal.

The other six finish by Sat 3 Oct with nothing unusual.

| Day and time (AE) | What happens | Who hears |
|---|---|---|
| Mon 14 Sep | Planner: last meal on the books Sat 3 Oct. Owner keeps W = Sat 3 Oct and buffer 1, so K = Mon 5 Oct (Sunday is not a delivery day). 0 plans run past. Confirm: phase `winding_down`. | Owner: schedule summary |
| From Mon 14 Sep | New plans must finish by Sat 3 Oct. | Buyers: season banner, dates limited |
| Next visit | A, B and the six see N1. C and D see N3. | In-app |
| Tue 15 Sep, 10:00 | Nothing sent: nobody runs past W. | Nobody |
| Sun 27 Sep, 10:00 | B's renew reminder is replaced (G7). | B: `season_last_dinners` and email |
| Wed 30 Sep, 20:00 | B's last meal. | Nobody |
| Thu 1 Oct, 00:30 | B's plan ends. Save a spot is open to B. | Nobody |
| Thu 1 Oct, 10:00 | Season plan-ended with the AED 20 offer (N5). | B |
| Thu 1 Oct, 11:00 | D taps Resume. Sheet: dinners Thu 1, Fri 2, Sat 3 Oct; 9 meals kept with AED 20 in the wallet, or AED 162 refunded. D resumes. | D: `plan_resumed_confirm` |
| Thu 1 Oct, 18:00 | Digest: D now runs past W, 9 meals, exposure AED 162. | Owner |
| Fri 2 Oct, 09:00 | A skips today's meal. The make-up day lands Mon 5 Oct, inside the buffer: normal skip plus a buffer grant. | A: `meal_skipped_confirm` |
| Fri 2 Oct, 18:00 | Digest: Mon 5 Oct now cooks 1 meal for A, a AED 500 kitchen day. Setting the buffer to 0 would turn it into AED 18 of credit. | Owner |
| Sat 3 Oct, 18:00 | Two days before K: final roster. | Owner |
| Sat 3 Oct, 20:00 | Last regular dinners, including D's third. | Nobody |
| Mon 5 Oct, 20:00 | Only A's make-up meal is cooked. | Nobody |
| Mon 5 Oct, 20:30 | "Last kitchen night. The break starts at 00:15." | Owner |
| Tue 6 Oct, 00:15 | Break starts. D held with 9 meals, AED 20 minted. C held as a customer pause. | Owner: break summary |
| Tue 6 Oct, 00:30 | A's plan ends. | Nobody |
| Tue 6 Oct, 10:00 | N8 to D, N9 to C, N10 to A. | D, C, A |
| During the break | C taps Resume: refused (N11), saves a spot, AED 20 minted. | C: `season_spot_saved` and email |
| During the break | D asks for a refund. The owner gets a WhatsApp, approves it on the Season page, AED 162 goes back to the card and the plan ends. | Owner: refund request WhatsApp. D: `refund_processed` and email |
| Reopen day | Admin reopens and sends the notice. C's hold becomes ready. | C: N17. Credit holders (D, and B if B saved a spot): N15. Past customers without credit: N16 |
| Reopen + 5 days | Waitlist credit still unspent. | Those holders: N18 |

---

## 15. Edge cases

| Case | Handling |
|---|---|
| The break tick runs twice, or a retry runs after success | The phase check exits; hold and waitlist rows are unique per season |
| Admin moves W earlier after customers resumed | Re-projection; plans now running past W get N2; the digest shows the new exposure |
| Admin moves W later | Plans that no longer run past W get a short correction only if they had N2 ("Good news: all your dinners fit"); credits stay (X6) |
| Admin clears the schedule | Unsent notices dropped; minted credits and credited skips stay; phase back to open; the home chip disappears |
| Customer resumes after 2 PM on W | The existing resume cutoff applies: that day is not delivered, and the meal counts toward the hold |
| Customer plans a pause on a plan that runs past W | Allowed, with the §7.3 line; the plan becomes `customer_paused` |
| Closure day added while winding down | §11.4 warning. A closure before W that pushes a plan past W makes it `runs_past`; closure days after K change nothing |
| Credited skip on a plan with a queued renewal | A credited skip does not move `end_date`, so the queued start does not shift |
| Queued renewal behind a held plan | Its own `starts_after` hold, its own refund amount, "Refund both" |
| Refund and Resume tapped at the same moment | The hold's compare-and-set lets one win; the other gets "Your plan changed. Refresh and try again." |
| Stripe refund succeeds but the database write fails | The idempotency key makes the retry return the same refund; G10 flags `refund_processing` older than 30 minutes |
| PaymentIntent already partly refunded by support | The cash refund is capped at what is still refundable |
| Order paid entirely with wallet credit | Cash refund 0; the full meal value returns as `season_refund_return` credit |
| Staff plan runs past W | Held with no credit and no refund (X5); staff wording from `staff-season-copy.ts`; admin alert |
| Welcome meal due after W | Held; delivered after reopening on the date the customer picks |
| Checkout opened before the schedule, paid after it, starting after W | The webhook provisions it (no taper check there, by design); the projection marks it `starts_after`; the digest flags it; held at the break with a full refund option |
| A sale gets through during the break | G3 holds it on arrival and alerts the admin |
| The settings read fails during the break | Sales paths fail open as today; G2 and G3 run in SQL and still stop cooking and hold any arrival |
| Customer changes meal preference during the break | Credit already minted stays; later mints use the new preference |
| Customer holds credit from an earlier season | Included in N15 and N18; the reopen audience counts unspent credit from any season |
| Two seasons in one academic year | Every row keys on `cycle_started_at`, so notices and full-screen notices show again for the new season |
| A Mon–Fri plan when K falls on a Saturday | A Mon–Fri plan never cooks on a Saturday, so it can only use a buffer day that is a weekday. If its make-up day lands after K, the skip is credited |

---

## 16. Testing

- **Pure domain (vitest):** every transition in §5 and refusal of illegal ones; every disposition in
  §6.1 for Mon–Fri and Mon–Sat plans, with closures, skips and buffer grants; the skip outcome
  (normal, grant, credited, allowance, zero-value plans); meal value and refund amounts (rounding,
  the Stripe cap, credit-only orders); the notice plan (every N row, dedup, dropped on a changed fact).
- **SQL lockstep:** `season_project_plans` matches the TypeScript projection for a fixture set,
  checked against live through the connector inside a self-aborting `DO` block, the repo's existing
  practice for tick changes.
- **Break rehearsal:** `season_begin_break` run on live inside a transaction that rolls back, with a
  fake K, asserting holds, credits and phase before aborting.
- **Guards:** G1 skips delivery, G2 refuses Active during the break, G3 holds an arrival, each in a
  rolled-back live transaction.
- **Stripe:** the refund flow end to end in test mode, including the webhook branch on
  `refund_reason`, and a retry that returns the same refund.
- **Customer surfaces:** preview knobs
  `?preview=1&season=scheduled|runs_past|credited_skip|held|paused_break|refund_pending|refunded|ready&now=YYYY-MM-DD`
  on home, plan and credit pages, desktop and mobile, captured with `scripts/atlas`.
- **Admin surfaces:** `/dev/season-admin` fixtures for the planner, wind-down board and break board.
- **Coverage:** `src/app/api/admin-notification-coverage.test.ts` asserts every §11.7 message.
- **Templates:** every WhatsApp template read back from Meta before its Vault secret is set; every
  email rendered light and dark in Gmail and Outlook.

---

## 17. Rollout

### 17.1 Phases

| Phase | Contents | Depends on |
|---|---|---|
| P0 | Submit the 8 WhatsApp templates to Meta; draft the 6 emails | Nothing. Start first: Meta approval is the slowest step |
| P1 | Data model, projection (TypeScript and SQL), live-row takeover, admin planner and wind-down board (read-only) | Nothing |
| P2 | Wind-down rules: order money recorded on every new order and backfilled for live plans (first), sales against W, credited skips and buffer grants, credit tick, save-a-spot eligibility, N1 and N3 in-app | P1 |
| P3 | Break: `season_break_tick`, holds, guards G1 to G6 and G9, held and paused cards, resume split sheet, break refusal sheet, N8 to N11 in-app, skip reconciliation on End the season today | P1, P2 |
| P4 | Money: refund request with owner approval, webhook refund branch, ledger labels (order money recording and the backfill moved to P2) | P3 |
| P5 | Messages: outbox and route, WhatsApp and email wiring, 10:00 sends, G7 and G8, admin notifications and digest | P0, P3 |
| P6 | Reopen: holds to ready, reopening notice on both channels for every audience, N15 to N18, receipt credit line | P5 |
| P7 | Invariants tick, break board, atlas fixtures, runbook | P3 |

Each phase ships on its own through the Production branch (`git push origin main:Production`).

### 17.2 This season

Live today: sales stopped since 2 Sep with no wrap-up day. 2 plans deliver until Fri 18 Sep and
Mon 28 Sep, and 1 plan is customer-paused. Nothing stops that customer resuming in October and
opening the kitchen for their remaining meals.

- **Before Mon 28 Sep:** P1, P2 and P3. Set W = Mon 28 Sep with buffer 1, so K = Tue 29 Sep. The
  break starts Wed 30 Sep at 00:15, and the paused plan becomes a customer-pause hold.
- **During the break:** P4 to P7. A held plan waits for its refund button and messages; in-app
  notices carry the story until then.
- **If P3 cannot make Mon 28 Sep:** keep today's behaviour and add one guard: `resumeSubscription`
  and `adminResumeSub` refuse resume after Mon 28 Sep with the §7.5 copy.

---

## 18. Follow-ups outside this spec

- Zoho credit notes for season refunds.
- The broadcast composer's two parked fast-follows: the done-transition race and the RLS `TO service_role` tightening.
- Aligning the footer on `dormers_intake_ended_offer_v1` at its next version.
- Credits stacking across seasons with no cap, open since the 2026-08-17 handoff.
- A restart-day picker for held plans, if X1's "tap Resume when you're back" proves too blunt.

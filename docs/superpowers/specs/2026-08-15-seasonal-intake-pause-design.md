# Seasonal Intake Pause — Design

**Date:** 2026-08-15
**Status:** Approved for planning
**Origin:** Dormers operates on university semesters. Between semesters the customer
count drops below the level at which kitchen prep and a delivery run are viable. Today
there is no way to stop new plans being bought, so the business can be left cooking for
one or two stragglers.

---

## 1. What already exists (and what it does not do)

### Company closures (admin "Holidays")

`company_closures` holds individual dates. On a closure date:

- `subscription_delivery_tick` returns early — no delivery is recorded, no meal is
  consumed against anyone's total.
- `subscription_pause_tick` returns early — a paused customer does not burn a pause day.
- `subscription_closure_tick` increments `closure_days` on every live subscription
  (Active, Skipped, Scheduled, Paused) whose `week_type` made that date a delivery day
  and which still has meals remaining.
- `_subscriptions_recompute_end_date` folds `closure_days` into the end-date
  computation alongside `paused_days`, so every affected subscription's `end_date`
  shifts out by one day per closure.

**Closures therefore extend existing subscriptions. They never skip or forfeit a meal.**

### What closures do NOT do

- They have **no effect on checkout, signup, or onboarding.** A customer can buy today
  and pick a start date that falls on a day the kitchen is shut.
- They are **invisible to customers.** No dashboard surface mentions a closure. The
  customer's end date silently moves. (Noted as a gap; explicitly out of scope here —
  see §12.)

---

## 2. Goal

An operator-controlled switch that stops all new plan purchases, presents a graceful and
honest explanation, captures the blocked lead rather than losing them, and lets the
operator tell the customer base what is happening.

**Explicit non-goal: no end date, no schedule, no auto-resume.** Dormers reopens when
demand justifies it, which is a judgement call, not a date. The switch stays on until a
human turns it off.

---

## 3. Scope

Three deliverables, in dependency order:

- **A.** The intake switch and its enforcement.
- **B.** The paused state the customer sees, plus the early-access list and credit.
- **C.** The broadcast composer and two WhatsApp templates.

C is independently useful beyond this feature (menu changes, price changes, closures) and
is the reason the incentive in B can be honest — promising "we'll message you" requires
the ability to message them.

---

## 4. Part A — the intake switch

### 4.1 Storage

New single-row table `intake_settings`:

| Column | Type | Purpose |
|---|---|---|
| `id` | `boolean primary key default true` + `check (id)` | Single-row enforcement |
| `paused` | `boolean not null default false` | The switch |
| `headline` | `text not null` | Customer-facing heading |
| `body` | `text not null` | Customer-facing explanation |
| `credit_nonveg_aed` | `numeric not null default 20` | Waitlist credit, Non Veg |
| `credit_veg_aed` | `numeric not null default 15` | Waitlist credit, Veg |
| `credit_religious_aed` | `numeric not null default 20` | Waitlist credit, Religious Preference |
| `paused_at` | `timestamptz` | When the current pause began |
| `paused_by` | `text` | Admin email |
| `updated_at` | `timestamptz not null default now()` | |

RLS enabled, `revoke all from anon, authenticated`, service-role only — matching
`feature_flags`.

### 4.2 Read path

New module `src/infra/config/intake.ts`, modelled directly on
`src/infra/config/feature-flags.ts`:

- `getIntakeState(): Promise<IntakeState>`
- 30-second in-memory cache, so a toggle propagates within ~30s with no redeploy.
- **FAILS OPEN.** A read error, a missing row, or a DB outage resolves to
  `paused: false`. A settings-table problem must never block a sale. This matches the
  Release It! prime directive already governing this codebase: never degrade the
  customer interaction.
- `__resetIntakeCache()` test seam.

### 4.3 Admin control

New page `/admin/season`, placed in the **Setup** sidebar group directly after Holidays.
"When we're closed" and "when we're not selling" belong in the same mental category.

The page carries:

- The paused toggle, with a confirmation step naming the consequence.
- Editable headline and body copy (live-previewed as the customer will see it).
- The three editable credit amounts.
- A live count of everyone currently on the early-access list.
- After toggling, an **offer** to send the matching broadcast (§7). Never automatic —
  an accidental toggle must not message the entire customer base.

Every change writes to the existing admin audit log via `logAdminAction`.

---

## 5. Part A (cont.) — enforcement

### 5.1 Server-side (authoritative)

| Surface | Behaviour when paused |
|---|---|
| `POST /api/checkout` | `409` with `{ error: 'INTAKE_PAUSED', message }`, checked immediately after the auth guard and before any Stripe or pricing work |
| Referral gift claim (`/r/[cid]` actions) | Rejected — a claimed gift is a real meal the kitchen must cook |
| `contexts/payments/usecases/free-checkout.ts` | Rejected, same reason |
| Staff plan provisioning (`contexts/staff`) | **Not** gated — admin-assigned remuneration, not a customer purchase |
| `POST /api/checkout` for `staff-monthly` | **Not** gated, same reason |

### 5.2 Client-side (presentation only)

The gate is threaded from server components down to the plan surfaces exactly the way
`missingProfileFields` already flows to `ProfileGateOverlay`. Client gating is a courtesy;
the server calls are what actually enforce.

Surfaces receiving the gate:

- `src/app/dashboard/NoPlanView.tsx`
- `src/app/dashboard/plan/PlanClient.tsx`
- `src/app/dashboard/_mobile/MobilePlan.tsx`
- `src/app/dashboard/_mobile/MobileExplore.tsx`
- `src/app/dashboard/explore-plans/page.tsx`

### 5.3 Explicitly untouched

Marketing site, signup, login, onboarding, and **every existing subscription**.
Deliveries, skips, pauses, the dashboard, kitchen and rider flows all behave normally
throughout a pause. The pause stops intake, nothing else.

---

## 6. Part B — the paused state

### 6.1 Treatment

Reuse the established `ProfileGateOverlay` pattern: a frosted overlay pinned over the
plan grid with a card on top. The plans stay visible and blurred underneath — the
customer can see what they are missing, which is the point.

New shared component `src/app/dashboard/_shared/IntakePausedGate.tsx`.

Card contents, driven by `intake_settings`:

> **We're between semesters.**
> Dormers cooks when the dorms are full. We've paused new plans until enough of you
> are back on campus.
> **AED 20 is waiting in your account** for the day we reopen.
> `[ Save my spot ]`

The amount shown is resolved from the customer's `meal_preference_type` (§6.3).

### 6.2 Rules of the paused state

- **No date. No countdown. No "back soon."** The operator does not know the date, and a
  manufactured timer is the single thing that would make this read as dishonest. "We'll
  message you the day we open" is both truthful and a stronger promise.
- **One tap.** The customer is already authenticated and onboarded; the action requires
  no input. Per the Fogg model, ability is the lever that matters here, not motivation.
- **No queue position.** Showing a number backfires in both directions: a low number
  reads as "nobody wants this," a high one as "I'll never get in."
- **Confirmed state keeps them in the product.** After the tap the card flips to a
  confirmation and links to the menu, so the customer leaves with an appetite rather
  than a rejection.
- **The date picker is never reached.** The gate sits above plan selection, so nobody
  encounters a calendar of dead dates.

### 6.3 Motivational basis

Recorded so future changes do not erode it by accident.

- **Journey phase:** Discovery → Onboarding handover. The customer has invested effort
  (account, phone verification, dorm, preferences) and received nothing. Worst possible
  place for a dead end; best possible place to capture, because the lead is now verified
  and dorm-tagged.
- **Scarcity (Drive 6), honestly applied.** The constraint is real — Dormers genuinely
  only cooks at volume. Framed correctly the pause reads as deliberate rather than
  broken. This is the rare case where scarcity is not manufactured, which is exactly why
  no fake timer may be added later.
- **Ownership (Drive 4) is the load-bearing mechanic.** The credit is granted at opt-in,
  not at reopening. During the wait the customer holds something they own with a visible
  balance, rather than a promise. This converts the reopening message from an
  announcement into a claim.
- **Investment → next trigger.** The opt-in tap is the investment; the reopening
  message is the trigger it loads. The loop closes.
- **Manipulation matrix:** Facilitator. The mechanic genuinely serves the customer, who
  wants to know when they can buy.
- **Removal test:** the pause functions without the incentive. The incentive is
  additive, not load-bearing — so it can be tuned or removed without breaking the
  feature.

---

## 7. Part B (cont.) — the early-access list and credit

### 7.1 List

New table `intake_waitlist`:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid pk` | |
| `customer_id` | `uuid not null unique` | Uniqueness makes opt-in idempotent |
| `joined_at` | `timestamptz not null default now()` | |
| `credit_id` | `uuid` | FK to the granted `credits` row |
| `notified_at` | `timestamptz` | Set when the reopening broadcast reaches them |

RLS: service-role write; customer may read their own row.

### 7.2 Opt-in action

Single server action. In one transaction:

1. Insert `intake_waitlist` row (`on conflict (customer_id) do nothing` — a double tap
   must never grant two credits).
2. Insert a `credits` row: `status = 'approved'`, `source = 'intake_waitlist'`,
   `amount_aed` resolved from the customer's preference, `eligible_plan_ids` set (§8).
3. Return the confirmed state.

Both new customers and returning customers use this same path — one card, one button,
one code path, one amount table. Nobody is auto-enrolled.

### 7.3 Amounts

| `meal_preference_type` | Credit |
|---|---|
| `Non Veg` | AED 20 |
| `Veg` | AED 15 |
| `Religious Preference` | AED 20 |

All three editable in `/admin/season` with no redeploy.

### 7.4 Credit lifetime

- **No expiry.** An expiring credit during an open-ended pause would be unfair — the
  customer cannot spend it. (A "use within N days of reopening" rule can be added later
  if urgency is wanted; it needs a new column and a sweep job, and is not in this build.)
- **Single use.** The existing `credits` lifecycle already flips a row to `applied` on
  consumption, so "the credit does not carry forward to subsequent plans" is satisfied by
  the current mechanism with no extra work.

---

## 8. Part B (cont.) — plan-restricted credits

**This is the payment-critical part of the build and carries the highest risk.**

### 8.1 The requirement

The waitlist credit is redeemable **only against a monthly plan**. On a weekly checkout
the credit is *displayed but not applied*, with a plain explanation that it unlocks on a
monthly plan. This is a deliberate, honest upsell: the customer can see the thing they
own sitting just out of reach, with a clear action to unlock it.

"Monthly" means `monthly-max` and `monthly-premium` only. `staff-monthly` is excluded
(intern remuneration, not a customer purchase). `trial` and `weekly-flex` are excluded.

### 8.2 Schema change

Add to `credits`:

```
eligible_plan_ids text[] NULL   -- NULL = usable on any plan (existing behaviour)
```

**Backwards compatibility is mandatory.** Every credit issued today (referral, Dorm Wars,
weekly review) has `NULL` here and continues to behave exactly as it does now. Only the
new `intake_waitlist` source sets a value.

### 8.3 Read path

`getRedeemableCredit` becomes plan-aware. It gains an optional target plan and returns
both:

- `redeemableFils` — what actually applies to this plan.
- `lockedFils` + the reason — what exists but cannot be used here.

The plan page therefore shows a different number depending on which plan card is
selected, and the weekly card can render the locked-credit explanation.

### 8.4 Server enforcement

The POST amount is gross. `/api/checkout` fetches the customer's `credits` rows, passes
them to `synthesizePerSessionCoupon`, reserves the rows the coupon actually consumed
(`status = 'reserved'`, guarding against two browser tabs spending the same credit), and
the webhook later flips them to `applied`.

**The eligibility filter belongs at the credit-row fetch, before synthesis.** The synth
helper must only ever see rows that are valid for the plan being bought. Filtering later
would leave the coupon and the reservation set disagreeing.

Consequences to respect:

- A tampered POST naming `weekly-flex` must not receive the monthly-only credit.
- The staff-plan discount exemption already short-circuits credit fetching entirely and
  must stay that way.
- The synth helper's partial-consumption path (`splitCredit`) and the
  100%-covered free-checkout branch must both continue to work when the row set has been
  filtered. A AED 20 credit cannot cover a monthly plan, so free-checkout is not reachable
  from this source, but the branch must not regress.

### 8.5 Testing

Non-negotiable coverage before this ships:

- Existing unrestricted credits still apply to every plan (regression guard).
- Waitlist credit applies to `monthly-max` and `monthly-premium`.
- Waitlist credit is rejected server-side for `weekly-flex`, `trial`, `welcome-gift`,
  `staff-monthly`.
- Mixed balance: an unrestricted referral credit plus a restricted waitlist credit
  resolves correctly on both a weekly and a monthly purchase.
- Double opt-in grants exactly one credit.

---

## 9. Part C — broadcast composer

New admin page. Free-form, email only.

### 9.1 Capability

- Subject and body, wrapped in the on-brand email shell.
- Audience selector: everyone / active plans only / early-access list /
  ended-and-not-renewed / a single dorm.
- Live recipient count.
- Preview of the rendered email before sending.
- **Explicit confirmation step naming the recipient count.** This is an irreversible
  outward-facing action against the whole customer base and must not be one click away.
- Batched sending through the existing ZeptoMail client, with its circuit breaker and
  timeouts respected.
- Every recipient logged to a new `broadcast_sends` table with per-recipient status, so
  the operator can prove who received what and retry failures.

### 9.2 Email design

The requirement is that this looks **better than the existing transactional emails**.

Constraints that must be honoured:

- The email brand language differs from the dashboard tokens. Orange is `#FF8C00`, not
  the dashboard `#f57f20`; body grey is `#757575`, not navy; the typeface is Helvetica
  Neue, not the system stack.
- `docs/email-templates/_brand-reference-start-day.html` is the reference and must be
  read before any markup is written.
- ZeptoMail renders Mustache and **treats an empty string as truthy.** To hide a section,
  omit the merge key entirely — never send `''` or `'0'`.
- Copy carries no emoji and no em/en dashes.

### 9.3 Why email only

Meta permits free-form WhatsApp messages only inside a 24-hour window opened by the
customer messaging first. Any proactive message requires a pre-approved template. A
free-form WhatsApp broadcast is therefore not buildable, which is why the existing
one-to-one admin composer is email-only too.

---

## 10. Part C (cont.) — WhatsApp templates

Two templates, submitted to Meta once:

| Template | Audience | Fired from |
|---|---|---|
| `intake_pausing` | Customers with a live subscription | Turning the pause **on** |
| `intake_reopened` | The early-access list | Turning the pause **off** |

Both are offered as a post-toggle action and require explicit confirmation. Neither fires
automatically.

Meta contract requirements that have bitten this codebase before and must be re-verified
at submission time:

- Locale is `en`, not `en_US`.
- Named parameters require `parameter_name` in the payload.
- Any URL button must be **static** — no button parameters, or Meta rejects with error
  132018.
- Header and named-parameter shape must be confirmed in Business Manager before the
  dispatcher `CASE` is changed.

Sends go through the existing `customer_notifications` queue and dispatcher, adding two
new `CustomerNotificationKind` values. `notified_at` on `intake_waitlist` is set when the
reopening notification is queued.

---

## 11. Decisions locked

| Decision | Choice |
|---|---|
| Who is blocked | Everyone. New customers and existing customers renewing alike |
| Where they are stopped | At the plan page. Signup and onboarding stay open |
| Incentive | Early access plus a welcome credit |
| Existing customers | Same card, same button, same amount. Opt-in, not auto-enrolled |
| Credit amounts | Non Veg 20, Veg 15, Religious Preference 20 (AED) |
| Credit scope | Monthly plans only. Shown but locked on weekly |
| Credit expiry | None |
| Credit reuse | Single use — does not carry to subsequent plans |
| End date on the switch | None, ever. Manual off only |
| Messaging build | Free-form email composer plus two fixed WhatsApp templates |
| Broadcast trigger | Offered on toggle, never automatic |

---

## 12. Assumptions

Stated explicitly so they can be overridden rather than discovered later.

1. **Trial does not unlock the credit.** `trial` is neither monthly nor weekly. A
   waitlisted lead who buys the AED 25 trial keeps their credit for a later monthly
   purchase. This is consistent with "monthly plans only" but means the credit does not
   assist the cheapest first purchase.
2. **Referral gift claims are blocked during a pause**, because a claimed gift is a real
   delivery.
3. **Staff and intern provisioning is not blocked**, because it is admin-assigned rather
   than customer-purchased.
4. **The marketing site is untouched.** A visitor can still browse and sign up; they meet
   the pause at the plan page.
5. **The pause has no effect on any live subscription.**

---

## 13. Out of scope

- **Customer-facing visibility of company closures.** Customers are currently never told
  the kitchen is shut on a given date; their end date silently shifts. A real gap, parked
  deliberately for a later cycle.
- Expiring credits.
- Waitlist position or queue display.
- Any automatic reopening.
- Region or dorm-scoped pausing (the switch is global).

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Plan-restricted credits touch the payment path | Backwards-compatible `NULL` default; explicit regression tests on every existing credit source before merge |
| A settings-read failure blocks all sales | Fail open — a read error resolves to "not paused" |
| Accidental toggle messages the whole base | Broadcast is a separate confirmed action, never a side effect of the toggle |
| Meta template rejection delays the reopening message | Templates submitted and approved early, before the switch is first used in anger |
| Stale client tab bypasses the UI gate | Server-side rejection in `/api/checkout` is authoritative |

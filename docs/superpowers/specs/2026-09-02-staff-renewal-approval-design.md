# Staff renewal approval — the start date is created by the approval

**Date:** 2026-09-02
**Status:** approved (in chat)

## The problem

An intern's Staff Monthly plan ends. They pick a renewal — free 5-day or
prepaid 6-day — and it queues as `Scheduled` with `staff_approval='pending'`.
`subscription_status_tick` refuses to promote it while pending, so the row
waits at the gate. That part works, and is verified live.

Two things around it did not.

**The dashboard announced the plan anyway.** Every desktop surface decided
"has this begun?" from `new Date(sub.start_date) > Date.now()`. That is
correct for every ordinary plan, because the tick promotes on the start
date — so "date is future" and "still Scheduled" normally mean the same
thing. The approval gate is the only thing that breaks the tie. Fixed in
`687e038`; this document is about what remains.

**Nobody told the admin.** There is no notification on a staff renewal at
all — no WhatsApp, no email. The only signal is a badge on `/admin/staff`,
visible only if you open the page. A real renewal has sat pending since
2026-08-24; it was found by reading the database, not by being told.

Those two compound into the third problem: because approval could be
arbitrarily late, `approveStaffRenewal` would activate a cycle whose
`start_date` was weeks in the past, with an `end_date` computed from it.

## The rule

**A pending renewal has no real start date. The approval creates it.**

    first delivery = LATER OF
        next working day after the approval
        next working day after the current cycle's end date

Approve early (the normal case — the renew button opens 7 days before the
cycle ends) and it queues behind the running plan with no gap. Approve
three weeks late and it starts the next working day. Never in the past,
never overlapping.

Week type comes from the subscription row, so a 6-day renewal counts
Saturday as a working day and a 5-day one does not.

## Changes

### 1. `approvedRenewalStartDate` — pure, in the staff domain

`nextWorkingDayAfter` moves from `usecases/renewal.ts` (which is
`server-only`, so untestable from a domain test) into `domain/staff-plan.ts`,
and `renewal.ts` re-exports it so existing importers are untouched.

### 2. `approveStaffRenewal` stamps the date

It currently flips `staff_approval` and nothing else. It will also write
`start_date` and `original_start_date` in the same update, and report the
real first delivery day back to the admin.

Both columns, not just `start_date`: `_subscriptions_shift_queued_scheduled`
floors a queued sub at `GREATEST(live.end_date + 1, original_start_date)`.
Leaving the old floor behind would let a later end-date change drag the
renewal back to a date the admin never approved.

`trg_subscriptions_recompute_end_date` fires on `UPDATE OF start_date`, so
the end date follows automatically — nothing to compute here.

### 3. The admin is told

`notify_pending_staff_renewals_tick()` runs every 15 minutes and calls
`send_admin_whatsapp_alert` directly from SQL — the same shape as
`detect_orphan_subscriptions_tick` and `notify_stale_fraud_queue_tick`.
Admin alerts need no `/api/internal/*` route; those exist for customer
messages with templates and locales.

It alerts once when a renewal appears, then daily while it waits.

**Changed from the discussed design:** the alert lives in the database
rather than firing from `provisionStaffFreeRenewal` and the Stripe webhook.
Both entry paths reach `'pending'` through the same BEFORE INSERT trigger,
so one implementation covers both and cannot be bypassed by a code path
nobody remembered. The cost is that "instantly" becomes "within 15
minutes", which against a renewal that sat 11 days is not a cost.

The same query carries a second check at no extra cost: **a Staff Monthly
sub that is live (`Active`/`Paused`/`Skipped`) while `staff_approval` is
still `'pending'`**. That state should be unreachable. If it appears, the
database gate has failed and the kitchen is already cooking — the label
list is `status = 'Active'` ([admin/labels/data.ts](../../../src/app/admin/labels/data.ts)).
It alerts with different, louder wording, hourly rather than daily, and on
its own stamp (`staff_leak_alerted_at`). A shared stamp would have let a
renewal pinged as *pending* less than 24h before it leaked stay silent for
the rest of that window — a day of unapproved cooking, unreported.

### 4. `/staff/plan` and `/admin/staff` stop quoting a date

`/staff/plan` says "your next cycle (starting 24 August) is waiting for
approval". Once the date only exists after approval, that date is a guess.
The `awaiting-approval` state drops `startDate` and the copy loses the
parenthetical.

The admin's own approval card quoted the same guess ("· starts 24 Aug"),
which would have contradicted the "first delivery 3 September" toast the
approver sees seconds later. It shows how long the intern has been waiting
instead — the fact that actually prompts a decision.

### 5. The gate goes into source control

`supabase/migrations/20260612_staff_renewal_approval.sql` ends with a
comment saying the tick guard "lives in the live DB". The repo's canonical
tick has no guard, so re-applying it would silently reopen the gate, and no
test could see the difference.

The live bodies are now readable, so three things get mirrored into a
migration verbatim, each with a test:

- `subscription_status_tick`, for the guard itself.
- `_subscriptions_shift_queued_scheduled`, because this change's
  correctness rests on its `GREATEST(live.end_date + 1,
  original_start_date)` floor and the repo's older definition never read
  that column.
- `original_start_date` itself, a column that exists live but which no
  migration in the folder creates. Approval writes it, so without this a
  database rebuilt from the repo could not approve a renewal at all.

Scope stops there — the wider repo/live drift is real (the tick is
scheduled at 00:30 AE live, 20:05 UTC in the repo) but reconciling it
wholesale is a separate job.

## Testing

- Pure unit tests on `approvedRenewalStartDate` written first: approve
  early, approve on the last day, approve weeks late, 5-day vs 6-day
  weekends, no current cycle at all.
- `admin-notification-coverage.test.ts` gains entries for both alert paths
  so they cannot be quietly deleted.
- A migration test asserting the tick SQL still carries the guard.
- The live cron and function are applied through the Supabase connector and
  verified by reading them back.

## Explicitly not doing

Reconciling `supabase/migrations` with the live database wholesale. The
repo SQL is demonstrably stale and rewriting it from repo state could undo
live fixes. Separate job, tracked in `.planning/release-it/AUDIT.md`.

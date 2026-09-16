# Season wind-down: the owner's runbook

How to end a semester, sit out the break, and reopen, with what the system
does on its own at each step and what to do when it messages you. Design:
`docs/superpowers/specs/2026-09-14-season-wind-down-design.md`.

Everything below is live on Production (Plans A to G, 2026-09-15) and on the
database. WhatsApp templates are the one piece waiting on you: see
`docs/whatsapp-templates/season-templates.md`. Until they are approved and
switched on, every message goes by email and in the app.

---

## 1. The shape of a season

| Term | Meaning |
|---|---|
| Wrap-up day (W) | The last regular delivery day and the sales cutoff. The date customers see. |
| Buffer | 0 to 3 delivery days after W, only for make-up meals from skips. Never sold. |
| Close day (K) | W plus the buffer. The last night the kitchen can cook. |
| Break | From the night after K until you reopen. No sales, no cooking. |
| Phases | `open`, `winding_down` (W is set), `break`, then `open` again. |

The kitchen cooks by meals, never by a plan's end date. A plan with meals
left after W is held for next semester; a plan that pauses itself stays
paused; a skip whose make-up meal would land after the season becomes wallet
credit worth what the customer paid for it.

## 2. Ending a season

**Where:** `/admin/season`.

1. Read "Last meal on the books" and the kitchen calendar. Every plan's real
   last dinner comes from its meals left, not its end date.
2. Pick the wrap-up day and the buffer, read the summary (plans that finish,
   run past, start after, customer pauses, meals to hold, kitchen days) and
   confirm. "Stop sales now" can come earlier, or "End the season today" when
   W is today or later.
3. What happens next, on its own:
   - Sales are judged against W: a new plan must finish by it.
   - Skips whose make-up meal would land after W turn into credit; skips that
     land on a buffer day earn a buffer grant (the buffer cooks only for those).
   - You get a WhatsApp summary of the dates. Customers whose plans run past W
     get the split notice at 10:00 the next day (again only if you move W and
     their split changes). Plans that finish before W see a quiet notice on
     their next visit.
   - Every day at 18:00, only if something changed: a digest (plans running
     past W, credited skips, buffer grants, last dinner on the books,
     closures). Two days before K: the final roster. On K at 20:30: tonight's
     meals.
   - Renewal reminders become "your last dinners" when no plan can follow.
4. Moving W: "Save new dates". Clearing W: "Clear the wrap-up day" (the
   kitchen then keeps cooking until the last plan ends). Once W has passed,
   only Clear is offered; ending today would reopen the kitchen.

## 3. The break

Starts at 00:20 Dubai the night after K (retries at 00:50 and 01:20). It:

- Holds every plan with meals left (Paused, `season_holds` state `held`) and
  a queued renewal behind it (`starts_after`); mints the waitlist credit for
  each paid hold; carries a customer's own pause as `paused_by_customer`.
- Closes the kitchen: the delivery tick, status tick and 8 PM failsafe all
  refuse; no plan can become Active; a plan sold during the break is held on
  arrival.
- Messages you (holds, credits) and, at 10:00, the customers (meals kept,
  pause carried). Plans that finished on W or K get the season plan-ended
  message at 10:00.

**The break board** replaces the planner: the kitchen-halt check, held plans,
customer pauses, the refund queue, refunded plans, and Reopen.

If the break has not started by 01:30 after K you get an URGENT WhatsApp:
open Scheduled Jobs, look at "Semester break starter", and run it from there
or tell the developer. Never call `season_break_tick` by hand from SQL.

## 4. Refunds (need your approval)

A customer whose paid plan is held can ask for a refund from their home page
(only plans paid through a live Stripe payment; test-mode payments and staff
or welcome plans never see the button). Cash back is the held share of what
they paid, capped at what Stripe still allows; wallet credit used on the
order comes back as credit; the waitlist credit stays theirs.

1. You get a WhatsApp with customer, plan, meals and amounts, and a reminder
   after 24 hours.
2. On the Season page, **Approve** (Stripe refund, plan ends, credit share
   back, customer told by the refund message) or **Decline** with a reason
   the customer reads on their card and by email.
3. If Stripe refuses, the row shows the error and **Retry**; a retry never
   pays twice (the refund is keyed to the hold). A refund stuck "processing"
   for 30 minutes pings you.

## 5. Reopening

1. **Reopen** on the break board. Sales open, W and K clear, every hold
   becomes `ready`. Nothing restarts on its own.
2. **Send the reopening notice** (the link on the Season page opens the
   composer with the reopen preset). It reaches everyone holding waitlist
   credit from any season, everyone who saved a spot, and past customers
   without a plan; every held plan hears "your meals are ready" instead. If
   it has not gone out two hours after reopening, you get a reminder.
3. Customers tap Resume (or pick a start date for a plan that had not
   started). Five days after reopening, credit holders without a plan get one
   nudge; seven days after, you get a note on plans not restarted and credit
   still unspent.

## 6. Messages you may get, and what to do

| Message | Meaning | Do |
|---|---|---|
| Season end scheduled / moved / cleared | The dates and counts | Nothing, unless the counts surprise you |
| Season update (18:00) | Something changed since yesterday | Read; move W if the last dinner moved earlier |
| Final roster / tonight's meals | Two days before K, and on K | Tell the kitchen |
| The semester break has started | Holds and credits | Check the break board once |
| URGENT: break has not started | 01:30 after K, phase still winding down | Scheduled Jobs, run the starter, or call the developer |
| URGENT: plans Active during the break | Something restarted a plan | Pause it from its customer page; tell the developer |
| Delivery after the close day / after W without a grant | The kitchen cooked when it should not have | Tell the developer; check the delivery tick |
| Paid held plan without credit | The break did not mint a credit | Add it from the customer page; tell the developer |
| Skipped-meal credit still pending | The credit tick did not release it | Scheduled Jobs, "season credit" job |
| Season messages could not be sent yet | An email template is missing in ZeptoMail | Create it, see docs/email-templates/SEASON-EMAILS.md. Messages retry every six hours, so creating it releases them |
| Refund requested / reminder | A customer is waiting | Season page: Approve or Decline |
| Refund FAILED at Stripe / recording failed | Stripe or the database refused | Retry from the Season page; check Stripe |
| Refund processing over 30 minutes | A refund is stuck | Check Stripe, then Retry |
| Reopened / reminder | Holds ready; notice not yet sent | Send the reopening notice |
| A week since reopening | What is still waiting | Nudge by hand if you like |

Standing breaches repeat every six hours, not every hour.

## 7. Scheduled jobs (Dubai time)

| Job | When | Does |
|---|---|---|
| `subscription_delivery_tick` | 20:00 | Cooks by meals; refuses after K and during the break |
| `subscription_status_tick` | 00:30 | Ends plans; never touches a held plan |
| `season_break_tick` (+ last retry) | 00:20, 00:50, 01:20 | Starts the break the night after K |
| `season_skip_credit_tick` | 00:40 | Releases credited skips once their day passes |
| `season_invariants_tick` | hourly at :30 | The checks in section 6 |
| `dispatch_season_notices_tick` | every 5 min | Sends queued season messages once due |
| `season_admin_digest_tick` (+ close-day run) | 18:00, 20:30 | Your digest, the roster, tonight's meals |
| `season_reopen_followups_tick` | 10:00 | Day-five nudge, day-seven note |
| `dispatch_subscription_ended_0045_ae` | 10:00 | Plan-ended message (season version while ending or on the break) |
| `dispatch_renew_nudges_18_ae` | 18:00 | Renewal reminder, or last dinners when no plan can follow |

## 8. Switches

| Name | Where | Default | Turn on when |
|---|---|---|---|
| `SEASON_BREAK_RELEASE_LIVE` | code | on | Always |
| `SEASON_REFUNDS_LIVE` | code | on | Always |
| `WHATSAPP_SEASON_TEMPLATES_ENABLED` | Netlify env | off | The eight season templates are approved and in Vault |
| `WHATSAPP_SEASON_REOPEN_ENABLED` | Netlify env | off | `intake_reopened` and `intake_back_open` are in Vault |
| `WHATSAPP_SEASON_ENDED_ENABLED` | Netlify env | off | `intake_ended_credit` and `intake_ended_offer` are in Vault |
| The eight `ZEPTOMAIL_TPL_SEASON_*` keys | ZeptoMail, then Netlify env | not set | One per season email template you create (docs/email-templates/SEASON-EMAILS.md) |
| `kitchen_daily_cost_aed` | intake_settings | 500 | Kitchen-facing only; never shown on the admin panel |

## 9. Money rules to remember

- Test-mode Stripe payments are not money. A credited skip on such an order
  is worth 90% of list price; a refund is never offered on it.
- Credits never turn back into meals.
- Staff and welcome plans are held like any plan but earn no credit and no
  refund.
- A refund keeps the waitlist credit the hold minted.

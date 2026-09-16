# Plan refunds (the Allow a refund switch)

For the owner. How to let one customer refund the rest of their plan, and
what to do when something goes wrong. Season refunds (a plan kept for next
semester) are a separate flow: see `season-wind-down.md` §4.

## 1. Letting a customer refund

1. Admin, **Customers**, open the customer. On **Overview**, the **Refund**
   card has an **Allow a refund** switch.
2. Turn it on. The dialog says what happens; press **Allow a refund**.
3. The card now shows what the button would refund right now, or why the
   customer sees no button.

The customer now sees **Refund my remaining meals** at the bottom of their
current plan card on **My Plan** (desktop and phone). Pressing it opens a
confirm step with the amounts; **Yes, refund and end my plan** does it.

There is no second approval: the switch is your approval. It turns itself
off after one refund. Turning it off before they press hides the button
again.

## 2. What the refund does

- **Meals refunded**: meals bought, minus meals delivered, minus skipped
  days already paid back as wallet credit. Gifted or bonus meals are never
  refunded (the refund stops at what the order bought).
- **Card**: meals refunded x (amount paid / meals bought), never more than
  Stripe still allows on the payment.
- **Wallet**: the share of the order paid with wallet credit comes back as
  a new wallet credit (`plan_refund_return`).
- **The plan ends now.** After the 2 PM cutoff, tonight's dinner is already
  cooking: it is delivered, left out of the refund, and the plan ends that
  night.
- **Messages**: the customer gets the refund WhatsApp and email (from the
  Stripe webhook), and Zoho emails the **credit note PDF**. You get a
  WhatsApp: "Plan refunded: ...".

Who qualifies: a paid plan (not Welcome Meal, Intern Program or Staff
Monthly), bought through a **live** Stripe payment, with meals left, and not
kept for next semester. Test-mode payments never show the button. An order
you already refunded (fully or partly) in Stripe never shows it either: the
wallet share would be paid twice, so settle that one by hand. If Stripe's
amount changes between the page and the press, the press is refused, nothing
changes, and you get a "Plan refund REFUSED" WhatsApp.

A refunded plan is locked: the customer can no longer skip, pause or change
it, and nobody (admin included) can restart it.

## 3. Credit notes

Every card refund, plan or season, gets a Zoho Books credit note
`CN-{CID}-{YYYYMMDD}` against the order's invoice. The refund is recorded
against the account the Stripe payment went into (Undeposited Funds), which
closes the note, and Zoho emails it with the PDF. A credit-only refund has no
credit note (no money left the business).

## 4. When something fails

| WhatsApp you get | What it means | What to do |
|---|---|---|
| Plan refund FAILED at Stripe | Stripe refused. The plan has already ended. | Customer page, Refund card: **Try the refund again** |
| (no message) Refund in progress, "Stuck for over 10 minutes" | The request died half way | Check Stripe, then **Try the refund again** |
| Plan refund REFUSED | Part of the payment was already refunded in Stripe | Settle by hand in Stripe; message the customer |
| ...went through at Stripe but recording it failed | The money moved; our records did not | **Try the refund again**. Stripe never pays twice |
| Credit note FAILED | The refund worked; Zoho did not | Refund card, Credit notes: **Send the credit note again** |

Retries pick up where the last attempt stopped and never change the amount.
Every Stripe refund carries `metadata.plan_refund_id` and is looked up before
one is made; every credit note carries the Stripe refund id as its reference
and is looked up the same way. So a second refund or a second credit note is
never made, even when a response was lost.

## 5. For the developer

- Migration `plan_refunds` (applied live 2026-09-16, mirror
  `supabase/migrations/20260916_plan_refunds.sql`): `customers.refund_allowed_at`
  and `refund_allowed_by`, tables `plan_refunds` and `refund_credit_notes`,
  functions `plan_refund_offer / start / retry / fail / finish` (service role
  only), `_plan_refund_facts`, `_plan_cooks_tonight` (lockstep with the WHERE
  of `subscription_delivery_tick`), and `orders.refund_reason` allows
  `plan_refund`.
- App: `src/contexts/subscriptions/usecases/plan-refund.ts`,
  `src/contexts/payments/usecases/refund-credit-note.ts`,
  `src/infra/zoho/credit-notes.ts`, `src/app/admin/customers/[id]/RefundPanel.tsx`,
  `src/app/dashboard/_shared/PlanRefundBlock.tsx`.
- Previews: `/dashboard/plan?preview=1&refund=1|tonight|credit|last` and
  `/dev/refund-panel?state=off|on|blocked|failed|done`;
  `npm run check:plan-refund` against a dev server.

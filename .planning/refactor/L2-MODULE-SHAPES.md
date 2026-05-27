# Layer 2 — Module Shapes

**Status:** proposal
**Date:** 2026-05-27
**Skill used:** software-design-philosophy (Ousterhout)
**Predecessor:** [L1-BOUNDARIES.md](./L1-BOUNDARIES.md)

---

## What this doc decides

L1 said WHERE the boxes go (nine contexts + shared kernel + infra + UI). L2 says what SHAPE each box should have inside: how deep its modules go, what gets exposed, what stays hidden, and which pass-through layers should die. The Ousterhout rule: deep modules with simple interfaces hiding rich complexity. Shallow wrappers and one-method-per-file sprawl are anti-patterns.

---

## The three big restructurings (where L2 has the highest payoff)

### A. The `actions.ts` god-file (1091 lines, 12 exports)

Today this one file holds twelve server actions spanning identity, subscriptions, and preferences. Each action repeats the same shape: `requireUser → load owned subscription → validate → mutate → queue notifications → revalidatePath`. That repetition is the "change amplification" symptom of complexity.

**Shape decision:** TWO deep modules, not twelve files.

1. **`contexts/subscriptions/usecases/SubscriptionMutations.ts`** — one module exposing nine methods: `pause`, `resume`, `changeStartDate`, `skip`, `skipFutureDate`, `unskipFutureDate`, `planPause`, `cancelPlannedPause`. All share the load/validate/mutate/notify/revalidate skeleton. The shared work happens once, internally. The interface is nine methods that each take a `subscriptionId` and return a result discriminated-union — caller learns nothing about pending markers, midnight reverts, or notification queues.
2. **`contexts/subscriptions/usecases/Preferences.ts`** — three methods: `savePending`, `discardPending`, `promotePendingIfStale`. Separate module because pending preferences apply to the NEXT subscription, not the live one — different invariants, different lifecycle, deserves its own boundary.
3. **`contexts/identity/usecases/Profile.ts`** — `updateProfile` (and future profile actions). Doesn't belong in subscriptions at all — it's identity.

**Score for actions.ts today:** 3/10 — twelve exports, no shared abstraction, repeated boilerplate, mixed context.
**Score after split:** 9/10 — three deep modules, each owning a single coherent responsibility.

### B. The `utils/supabase/queries.ts` god-file (697 lines, ~20 exports)

Same problem in a different costume: a single file holding queries for four different contexts because they all happen to read from Supabase. This is the classic *temporal decomposition* mistake Ousterhout warns about — organizing by "when does this run" instead of "what knowledge does this own."

**Shape decision:** delete this file. Each context gets its own repository, with the interface in `contexts/<X>/domain/repository.ts` and the implementation in `infra/supabase/<X>-repo.ts`.

| Today (in queries.ts) | Tomorrow |
|---|---|
| `getCustomer`, `getActiveSubscription`, `getQueuedSubscription`, `getAllSubscriptions`, `getMostRecentOrder` | `contexts/subscriptions/domain/repo.ts` |
| `getReferralData`, `getReferralCount`, `getRecentInvites`, `getCrossDormRecent`, `getRedeemableCredit` | `contexts/referrals/domain/repo.ts` |
| `getCycleRecruits`, `getCycleChainStart`, `getCycleChainSubIds`, `getStreakChestState`, `getStreak`, `getRecentRewardEvents`, `getActiveLifetimeTierPercent` | `contexts/dorm-wars/domain/repo.ts` |

Next.js's `cache()` wrapper for server components stays — it lives in the `infra/supabase` implementation, not in the domain interface.

**Score for queries.ts today:** 2/10 — temporally organized, four contexts mixed, 697 lines.
**Score after split:** 9/10 — knowledge owned by the context that uses it.

### C. The `webhook/route.ts` god-file (663 lines)

The post-payment fanout was already extracted — that's the good news. What's left is still 600+ lines doing four jobs: Stripe signature verification, idempotent order/subscription insert, credit flip, referral award. Each is a separate responsibility currently glued together.

**Shape decision:** thin controller (~60 lines) calling one deep payments use-case.

- **Controller** (`app/api/webhook/route.ts`): verify Stripe signature, parse event, hand to use-case. Nothing else.
- **Use-case** (`contexts/payments/usecases/handle-stripe-event.ts`): the idempotent core. One public function: `handleStripeEvent(event) → Promise<void>`. Hides everything: which event types matter, how the order/subscription is created, when the credit flips, when the referral gets credited, when fanout fires.
- **Adapter** (`infra/stripe/`): the Stripe SDK wrapper. The only place `import Stripe` appears outside the controller.

**Score for webhook today:** 4/10 (better than the others because fanout was already extracted).
**Score after split:** 9/10.

---

## Module shape per context

For each of the nine contexts, here's the public interface other code sees, and what stays hidden inside. The "score" rates depth on the Ousterhout 0-10 rubric (functionality provided ÷ interface complexity imposed).

### 1. Identity

**Exposes:**
- `requireUser()` — discriminated union, narrows to `{ supabase, user }` on success. Already deep, already correct, just relocate.
- `startOtp(phone)`, `verifyOtp(phone, code)` — one function each for the WhatsApp OTP flow. Today these are split across two API routes plus client code; consolidate the domain logic.
- `updateProfile(data)` — server action moved out of dashboard's `actions.ts`.
- Pure validators (`isAlphaName`, password rules) — already pure, move to `shared/validation/`.

**Hidden:** Supabase session details, OTP storage table, signed-token verification, WhatsApp Cloud API call. The caller never sees any of that.

**Score:** 8/10 once relocated. Loses 2 because `requireUser` returns a raw `SupabaseClient` (a framework leak through the result type) — acceptable today but flagged for a follow-up.

### 2. Subscriptions (CORE)

**Exposes:** Three deep modules.
- `SubscriptionMutations` — eight methods on the live subscription (see section A above).
- `Preferences` — three methods on pending preferences.
- `Reviews` — `getWeeklyReviewState(userId)`, `getMonthlyReviewState(userId)`, plus the badge/state types. Today already correctly split into client-safe types + server queries — preserve that split.

**Hidden:** Asia/Dubai day math, kitchen-cutoff (14:00 AE) rules, the seven `LIVE_SUBSCRIPTION_STATUSES`, the midnight revert cron, the pending-vs-effective preferences resolver, the end-date computation that mirrors a Postgres function. The caller asks `skip(subId)`; it doesn't learn about end-date recomputation, the kitchen-ops cron, or the notification queue.

**Score:** 9/10. The remaining 1 point is the eventual repository interface — today's reads live in `queries.ts` mixed with referrals and dorm-wars; once split per section B, the score is 10.

### 3. Payments

**Exposes:**
- `createCheckout(input) → { sessionUrl }` — the API route's domain logic.
- `handleStripeEvent(event) → void` — the webhook's idempotent core.
- `retryPostPaymentFanout(orderId)` — for the cron.

**Hidden:** Stripe SDK, Zoho invoice creation, ZeptoMail send, the three-channel idempotency markers on the orders table, the 2-minute Zoho defer, the credit-flip rule, the referral-credit hook. `runPostPaymentFanout` stays exactly as it is — it's already a 9/10 deep module (one public function, three hidden channels, idempotent retry built in). It moves under `contexts/payments/usecases/` but its shape doesn't change.

**Score:** 9/10 after split. Stripe-as-detail is locked behind `infra/stripe/`.

### 4. Notifications

**Exposes:**
- `queueCustomerNotification(customerId, kind, scheduledFor, params)` — the only write entry point.
- `dispatchTick()` — the cron's call.

**Hidden:** The `customer_notifications` table schema, the RLS that requires service-role writes, the en-vs-en_AE language code dispatch (per the recent fix), the WhatsApp template registry, the 5-minute cadence.

**Pass-throughs killed:** The two time helpers currently in `customer-notifications.ts` (`ae9amUtcOnDate`, `nextEligibleDeliveryDay`) don't belong here. They're shared time math used by subscriptions, referrals, and the dispatcher itself. They move to `shared/time/`. This is the Ousterhout *information-hiding violation* — time math doesn't have notification semantics, so co-locating them leaks notifications knowledge into every caller that just needed a date.

**Score:** 9/10 after the time helpers leave.

### 5. Dorm Wars (CORE)

Already in good shape. Each file inside `lib/dorm-wars/` is a focused module with 1-5 exports. `awarder.ts` exposes one function (`awardCycleAndTierRewards`) doing real work. `layer4.ts` exposes five functions for the layer4 queue but they share a clear lifecycle. `meal-pricing.ts`, `coupon-synth.ts`, `doubler.ts` each own one piece of the gamification economy.

**Exposes:**
- `awardCycleAndTierRewards(...)` — the main cycle-end orchestrator.
- `claimGoogleReview`, `autoApprove`, `autoReject`, `maybeFireAnniversary`, `getLayer4Rewards` — the layer4 queue.
- `getStreak`, `getStreakChestState`, `getRecentRewardEvents` — the read side (move from `queries.ts`).
- Coupon synth, doubler, meal pricing, RNG, constants — internal.

**Hidden:** RNG seeds, doubler caps, layer4 review verification logic, coupon naming conventions, the Friday-night cycle boundary.

**Pass-throughs killed:** None — this context is already deep. `rng.ts` is 30 lines but it's a deliberate testability boundary (deterministic mocking in tests). Keep it.

**Score:** 9/10 already. Goes to 10 once its queries leave `queries.ts`.

### 6. Referrals

**Exposes:**
- `claimTrial(cid)` — the `/r/[cid]` flow.
- `creditInviterOnConversion(orderId)` — called from the webhook (today it lives at `app/r/[cid]/actions.ts`; webhook imports it cross-context, which is the integration leak I'll fix in Layer 3).
- `getReferralData(userId)`, `getReferralCount`, `getRecentInvites` — read side.

**Hidden:** CID format (lives in `shared/cid.ts`), trial-delivery scheduling rules (Asia/Dubai, 14:00 cutoff, Sunday skip), the credit ladder, the inviter-credit flip on the orders row.

**Pass-throughs killed:** The cross-context import from webhook → referrals/actions becomes a domain event in Layer 3, not a direct call.

**Score:** 8/10.

### 7. Menu

**Exposes:**
- `MenuRepository` interface — `getWeek(weekNumber)`, `getDish(slug)`, `listWeeks()`.
- The dish/week types.

**Hidden:** Today it's a 1277-line static array; after the menu-CMS milestone it's a Supabase implementation. Callers don't care which.

**Pass-throughs killed:** The repository pattern from day one means the eventual CMS swap is a one-file change in `infra/`.

**Score:** 9/10. This is the cleanest tracer bullet in the refactor — the interface is small (3 methods), the implementation is hidden, and the upgrade path is well-defined.

### 8. Chatbot

**Exposes:**
- `openChat()`, `closeChat()` — the bus (already deep, already 9/10).
- `DORMERS_KNOWLEDGE` — the system prompt constant.
- The API route's domain logic (one use-case).

**Hidden:** The window-event bus implementation, the escalation rules, the Anthropic SDK call.

**Score:** 8/10.

### 9. Admin

**Exposes:**
- `requireAdmin()` — auth gate.
- One use-case per queue (`approveLayer4`, `rejectLayer4`, `approveReferral`, `rejectReferral`).

**Hidden:** Admin auth table, queue ordering rules.

The admin context is the only one allowed to import other contexts' READ interfaces — it views and mutates queues that live in dorm-wars and referrals. That's an explicit DDD *Conformist* relationship; flag it in the dependency rule.

**Score:** 7/10 today, room to grow as the admin surface expands.

---

## Shared kernel — also deep, also governed

The shared kernel from L1 stays small. Each file is a deep module hiding one piece of cross-context knowledge:

| Module | Hides | Score |
|---|---|---|
| `shared/contacts.ts` | The WhatsApp number, the wa.me URL format | 10/10 |
| `shared/phone.ts` | E.164 conversion, UAE local-format handling | 10/10 |
| `shared/cid.ts` | The customer-CID format (3-letter dorm + mmss) | 10/10 |
| `shared/validation/*` | Alpha-name + password rule details | 9/10 |
| `shared/time/*` (new) | Asia/Dubai day boundaries, 9am UTC anchors, next-delivery-day math | 10/10 once created |

These are tiny but DEEP — their interface is one function each, their implementation hides a rule that would otherwise drift across the codebase. Ousterhout's gold standard.

---

## Infra adapters — intentionally thin, but with anti-corruption

Infra modules wrap external SDKs. They look like shallow modules at first glance because each method maps to a third-party call. But they're not shallow — they translate the SDK's vocabulary into our domain language.

| Adapter | Public interface (sample) | Hidden |
|---|---|---|
| `infra/stripe` | `createCheckoutSession(input)`, `constructWebhookEvent(body, sig)`, `getPaymentIntent(id)` | The Stripe SDK, API version, retry config |
| `infra/meta-whatsapp` | `sendTemplate(phone, template, params, languageCode)` | The Cloud API URL, token, JSON shape |
| `infra/zeptomail` | `sendOrderConfirmation(to, params)` | The ZeptoMail HTTP API, sender identity |
| `infra/zoho` | `findOrCreateContact(...)`, `createInvoice(...)`, `recordPayment(...)` | OAuth refresh, request signing |
| `infra/supabase` | Client factories + per-context repository implementations | Cookies, SSR shape, RLS context |

Anti-corruption layer principle: a Stripe `PaymentIntent` never appears in a domain file. The adapter converts it to a `PaymentCompleted` event or a `CheckoutSession` value object.

---

## Pass-through layers killed

Specific places where shallow wrappers / pass-through methods get removed:

1. **`customer-notifications.ts` time helpers** — move to `shared/time/`. They were temporally co-located, not semantically related.
2. **`utils/supabase/queries.ts`** — gone entirely. Queries owned by the context they belong to.
3. **`dashboard/actions.ts`** — gone entirely. Twelve loose actions collapse into three deep modules.
4. **The Stripe SDK appearing in `api/webhook/route.ts` directly** — gone. Goes behind `infra/stripe`.
5. **Cross-context import: `webhook → @/app/r/[cid]/actions`** — gone. Becomes a domain event.

---

## What I am NOT changing (deliberately)

- **`rng.ts` (30 lines)** — kept. Testability boundary for deterministic test seeds.
- **`dorm-wars/constants.ts` (62 lines)** — kept. SSOT for game economy values.
- **`post-payment/fanout.ts`** — moved (to `contexts/payments/usecases/`) but not reshaped. Already 9/10.
- **`monthly-review.ts` / `weekly-review.ts` client-safe split** — preserved. The split exists to keep `next/headers` out of client bundles; that's correct.
- **Dashboard `_shared/` co-located UI** — kept where it is. Local UI primitives, not cross-context.

---

## Overall scores

| Layer | Before | After L2 |
|---|---|---|
| `actions.ts` | 3/10 | 9/10 |
| `queries.ts` | 2/10 | 9/10 |
| `webhook/route.ts` | 4/10 | 9/10 |
| `customer-notifications.ts` | 7/10 | 9/10 |
| `post-payment/fanout.ts` | 9/10 | 9/10 (unchanged) |
| `dorm-wars/*` | 8/10 | 10/10 (once queries move in) |
| Codebase average | ~4/10 | ~9/10 |

---

## What this enables for Layer 3

Two things become possible after L2:
1. **A clear before/after diff per file** — we can map every line of every god-file to its destination context + module.
2. **A reversibility question** — can we do this as one big move, or as a series of tracer bullets (one context at a time)? That's Layer 3's call, using the pragmatic-programmer skill.

# Refactor Follow-ups

**Status:** living document — captures known limits left after Phase 11
**Date:** 2026-05-27
**Predecessors:** L1-BOUNDARIES, L2-MODULE-SHAPES, L3-STRATEGY

---

## Done

| Phase | Commit | What it did |
|---|---|---|
| 0 | `150b3a7` | Folder skeleton, ESLint dependency rule (warn), vitest setup |
| 1 | `175ba8a` | Menu tracer bullet → MenuRepository + StaticMenuRepository |
| 2 | `39cee57` | Dubai time helpers → shared/time |
| 3 | `7ef65dd` | Dorm Wars context + queries extracted from `queries.ts` |
| 4 | `4959e6d` | Chatbot relocate |
| 5 | `647e026` | Notifications context + infra/meta-whatsapp + infra/zeptomail |
| 6 | `8e86622` | Referrals context + queries extracted |
| 7 | `e940c78` | Payments — post-payment-fanout + infra/zoho |
| 8 | `50b298c` | Subscriptions context (9 files) + customer/sub queries extracted |
| 9 | `13a8ad8` | Identity (requireUser) + shared (validation, phone, contacts) |
| 10 | `39aa5ba` | Admin auth gate relocate |
| 11 | TBD | UI tokens + hooks → ui-system/, Supabase admin consolidated |

`utils/supabase/queries.ts` is down from 697 lines to ~95 lines. `src/lib/` is now mostly compatibility shims.

---

## Known follow-ups (NOT done — captured for later)

### A. Shim removal (mechanical, 74 consumer files)

Every `src/lib/<name>.ts` is still a one-line `export * from '@/contexts/<X>/...'` shim. Reasons to keep them through the refactor: blast-radius safety, gradual migration. Reasons to delete them: extra import indirection, broken-windows debt.

Plan when ready:
1. Search-replace each `@/lib/<name>` import path with its new home.
2. Delete the shim files in `src/lib/`.
3. After all shims are gone, the `src/lib/` directory itself can be deleted.
4. Tighten ESLint dependency rule from `warn` → `error` in `eslint.config.mjs`.

Estimate: 1-2 focused hours. Mechanical work.

### B. Concrete repositories sit in `domain/`, should be in `infra/supabase/`

Two warnings the ESLint dependency rule surfaces today:

- `src/contexts/dorm-wars/domain/repo.ts` imports `@/infra/supabase/admin-client` — domain reaching into infra.
- The same is true for `contexts/referrals/domain/repo.ts` and `contexts/subscriptions/domain/repo.ts` and `contexts/notifications/usecases/queue.ts` (which is in usecases, allowed to import infra, but the repo files in `domain/` aren't).

The proper clean-architecture shape:
- `contexts/<X>/domain/repository.ts` — just the INTERFACE (function signatures + types). Zero infra imports.
- `infra/supabase/<X>-repo.ts` — the implementation. Imports from `infra/supabase/admin-client`.

Plan when ready: split each `repo.ts` into interface + implementation. The interface stays in domain; the implementation moves to infra. Callers continue to import from `@/contexts/<X>/domain/repository`. The DI happens at the use-case layer.

Estimate: 2-3 hours per context. Lower priority than (A) because behavior is unchanged.

### C. `meal-pricing.ts` reaches into `@/app/dashboard/plan/pricing`

`src/contexts/dorm-wars/domain/meal-pricing.ts` imports `pricePerMeal`, `mealsForPlan`, types `Pref` and `PlanId` from `src/app/dashboard/plan/pricing.ts`. That's a dorm-wars → subscriptions cross-context import the dependency rule flags.

Fix: move `pricePerMeal` + `mealsForPlan` + types to `contexts/subscriptions/domain/pricing.ts`. Update both the dashboard pricing UI and `meal-pricing.ts` to import from the new location.

Estimate: 30 minutes. The blocker on doing this in Phase 8 was that the pricing logic lives next to the dashboard plan UI and the move needs touch the UI side.

### D. `dashboard/actions.ts` (1091 lines) split into deep modules

L2 recommended splitting into 3 deep modules:
- `contexts/subscriptions/usecases/SubscriptionMutations` (8 methods: pause, resume, skip, etc.)
- `contexts/subscriptions/usecases/Preferences` (3 methods: savePending, etc.)
- `contexts/identity/usecases/Profile` (updateProfile)

NOT done in the refactor because: (1) Next.js server actions have specific 'use server' semantics that interact with the file location; (2) the file is 1091 lines and a split mid-refactor compounds risk; (3) every dashboard modal calls these so testing surface is wide.

Plan when ready: extract one method at a time from the bottom of `actions.ts`. Each extraction is a focused commit. Keep the original file as the entry point ('use server') and have it delegate to the new modules.

Estimate: 6-8 hours, ideally over multiple sessions.

### E. Stripe SDK behind `infra/stripe/`

The webhook and checkout routes still `import Stripe from 'stripe'` directly. Per L1 the SDK belongs in `infra/stripe/client.ts`.

Plan when ready: create `infra/stripe/client.ts` with `stripeClient()` factory + `constructWebhookEvent(body, sig)` helper. Update both route handlers to import from there. Smoke-test the webhook with Stripe CLI event replay.

Estimate: 1 hour + manual webhook test.

### F. `getRedeemableCredit` owner not yet decided

Lives in `utils/supabase/queries.ts` because credits are populated by BOTH referrals (conversion rewards) AND dorm-wars (gameplay rewards), but spent on subscription checkouts. None of the three is a clear owner.

Options: (1) keep in queries.ts as a shared cross-context query, (2) put in `contexts/subscriptions/domain/` (because that's where the read fires from), (3) put in `contexts/referrals/domain/` (because that's where most credits originate).

Estimate: 15-minute decision + 30-minute move once decided.

### G. Marketing pages (`app/(main)/`) and UI components

The chatbot UI (`AIChatbot`, `ChatButton`, `ChatButtonWrapper`) lives in `src/app/components/` and is consumed by the marketing layout. The dashboard's `_shared/` UI primitives stay locally co-located.

When the marketing site gets its next visual pass, these can move to `contexts/chatbot/ui/` and `(main)/_components/` respectively. Not urgent.

---

## What's NOT a follow-up

Things that are now production-ready and should NOT be revisited as "tech debt":

- The 9 bounded contexts. They're correctly drawn.
- The shared kernel. Small, governed, used as intended.
- The infra ring with WhatsApp + ZeptoMail + Zoho + Supabase admin client.
- The repository pattern for menu (StaticMenuRepository → future SupabaseMenuRepository swap).
- The compatibility shim pattern itself. It works as designed.
- The 61 characterization tests. They lock in current behavior.

---

## How to use this doc

- Pick the smallest follow-up that unblocks the next feature you're building.
- Each item is independently shippable.
- Add new follow-ups here as the codebase evolves — this file is the running ledger of "things the refactor didn't quite finish."

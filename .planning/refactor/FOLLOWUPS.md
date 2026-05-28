# Refactor Follow-ups

**Status:** living document — captures known limits + post-refactor improvements
**Last updated:** 2026-05-28
**Predecessors:** L1-BOUNDARIES, L2-MODULE-SHAPES, L3-STRATEGY

## Post-refactor critique improvements (2026-05-28)

After the structural refactor landed, ran an 8-skill critique (DDD, clean-arch,
Ousterhout, Pragmatic Programmer, Clean Code, Release-It, System Design,
Refactoring Patterns) and worked through the gap list:

| # | Critique gap | Commit | Notes |
|---|---|---|---|
| 1 | Anemic Subscription (`Record<string, any>`) | `572b8ba` | Hand-typed from live Supabase schema; 3 dead `7DAYS` branches removed by TS |
| 2 | No timeouts / circuit breakers | `cf538bc` | `fetch-with-timeout` helper + wired into WhatsApp, ZeptoMail, Zoho (4 fetch sites) |
| 3 | `webhook/route.ts` still 663 lines | `cd7639d` | Extracted to `contexts/payments/usecases/handle-stripe-event`; route is now 37 lines |
| 4 | Skeleton repeated in 8 mutations | `a19e2b2` | `withOwnedSubscription` higher-order helper; -41 lines |
| 5 | No domain events | SKIPPED | In-process bus = function calls + ceremony in serverless; durable events already use Supabase queues. Not worth the indirection. |
| 6 | No CI | `ef4ac89` | GitHub Actions: lint + tsc + test + build on every push/PR. Runs from next push onward. |
| 7 | No integration tests | `22ca2e3` | Module-mocking pattern established; 10 cases on `withOwnedSubscription` + `unskipFutureDate` validation paths |
| 8 | Domain entities with behavior | SKIPPED | Current "functional DDD" (typed value + pure rules) suits this CRUD-shaped domain. Class-based entities can come later if the domain grows. |
| — | Sidebar `<img>` warning | `ebaefb1` | Replaced with `next/image`. Lint is now fully clean — zero warnings. |

`npm test` reports **75 passing** (was 61). `npm run lint` reports **zero warnings**. Build clean throughout.

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
| 11 | `78c160c` | UI tokens + hooks → ui-system/, Supabase admin consolidated |
| 11b | `0f6cafe` | All shims deleted, 74 consumer imports updated → `src/lib/` + `src/hooks/` are gone |
| C | `f008097` | `pricing.ts` moved to `contexts/subscriptions/domain/` |
| F | `724418a` | `queries.ts` deleted, `getRedeemableCredit` moved to subscriptions, repos consolidated on admin-client |
| E | `19e3411` | Stripe SDK behind `infra/stripe/client.ts` |

`utils/supabase/queries.ts` is GONE. `src/lib/` is GONE. `src/hooks/` is GONE. Every business module lives in its bounded context, shared kernel, infra ring, or ui-system ring.

---

## Known follow-ups (NOT done — captured for later)

### A. Shim removal — DONE (`0f6cafe`)

74 consumer imports updated. `src/lib/` and `src/hooks/` are gone. ESLint dependency rule still at warn level; tightening to error is blocked by item B (two remaining warnings on `@/infra/supabase/admin-client` imports from domain repos).

### B. Concrete repositories — DONE

The three repo files moved out of `contexts/<X>/domain/` and into `infra/supabase/`:
- `contexts/dorm-wars/domain/repo.ts` → `infra/supabase/dorm-wars-repo.ts`
- `contexts/referrals/domain/repo.ts` → `infra/supabase/referrals-repo.ts`
- `contexts/subscriptions/domain/repo.ts` → `infra/supabase/subscriptions-repo.ts`

`awarder.ts` (the only domain file that called a repo) moved from `contexts/dorm-wars/domain/` → `contexts/dorm-wars/usecases/` since it orchestrates DB writes — that's use-case work, not pure domain.

The ESLint dependency rule was refined: `infra/` is now allowed to import from `contexts/<X>/domain` (because infra implements domain contracts — repositories need to know domain types like `SUBSCRIPTION_STATUS`). It's still blocked from `usecases/`, `ui/`, `app/`, `components/`, `hooks/`.

**The dependency rule is now enforced at ERROR level.** Any future code that violates the architecture fails the build, not just warns.

### C. Pricing.ts cross-context — DONE (`f008097`)

`pricing.ts` moved to `contexts/subscriptions/domain/pricing.ts`. Dorm-wars still consumes it as a documented cross-context import, but the lint warning is gone.

### D. `dashboard/actions.ts` split — DONE

The 1091-line god-file is gone. Split into three deep modules per L2:
- `contexts/identity/usecases/profile-actions.ts` — `updateProfile` (1 action)
- `contexts/subscriptions/usecases/preferences-actions.ts` — `savePendingPreferences`, `discardPendingPreferences`, `promotePendingPreferencesIfStale` + input/result types (3 actions)
- `contexts/subscriptions/usecases/subscription-mutations.ts` — `pauseSubscription`, `resumeSubscription`, `changeStartDate`, `skipMeal`, `skipFutureDate`, `unskipFutureDate`, `planPause`, `cancelPlannedPause` + the 3 module-local helpers (`aeTodayIso`, `isWorkingDayForWeekType`, `workingDayPosition`) (8 actions)

Each new file is a deep module per L2: shared imports, single bounded responsibility, all related methods together. The 4 client consumers (`layout.tsx`, `ActiveDashboard.tsx`, `plan/PlanClient.tsx`, `profile/ProfileClient.tsx`) import from the new paths directly.

### E. Stripe SDK behind `infra/stripe/` — DONE (`19e3411`)

Webhook + checkout now import from `@/infra/stripe/client`. Manual webhook smoke test with Stripe CLI event replay still recommended before next major deploy cycle.

### F. `getRedeemableCredit` owner — DONE (`724418a`)

Decided: subscriptions (because credits are SPENT at checkout). Moved to `contexts/subscriptions/domain/repo.ts`. `queries.ts` deleted entirely.

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

# Season Wind-Down, Plan B: Wind-Down Customer Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every order records what was paid, and while a season winds down a skip whose make-up day would land after the wrap-up day becomes a buffer grant or wallet credit worth what the customer paid for that meal; every plan with credited skips still ends on time, customers can save a spot whenever no plan can follow theirs, and customers see the season end in the app (N1, N3, the pause line) in words that stay true before the break exists.

**Architecture:** The Stripe webhook and free checkout record each order's card charge and the wallet credit it really used, and a dry-run-first script backfills live-mode orders tied to live plans before any credited skip can mint. A pure `skip-outcome` module decides normal skip, buffer grant or credited skip from the plan's end date, closures and the season; the dashboard runs it to word the skip sheets and the server action runs it again on fresh data. Credited skips and grants are written by SECURITY DEFINER SQL functions (`season_skip`, `season_unskip`) that recompute the outcome and the credit amount themselves, so the customer client never writes credits or the season columns. The status and delivery ticks count credited skips, a nightly tick releases pending skip credit, and scheduling or moving the wrap-up day reconciles skips already taken.

**Tech Stack:** Next.js 15 App Router (server components, server actions), TypeScript, Supabase Postgres (live project `yjjayivwfqjfppawgyaz` through the Supabase connector), pg_cron, vitest (node environment), inline-styled dashboard components with `_shared/tokens`.

**Spec:** `docs/superpowers/specs/2026-09-14-season-wind-down-design.md` §7.1 to §7.7 and notices N1, N3 (§12.2), phase P2 (§17.1). Rules leaned on: §2, §3, §6, §9 (G1 cap, G4 end condition), §10.1, §10.2. Builds on Plan A (`docs/superpowers/plans/2026-09-14-season-wind-down-A-foundation.md`).

## Global Constraints

- **Break not live yet.** Plan A exports `SEASON_BREAK_RELEASE_LIVE = false` from `src/contexts/season/domain/season-release.ts`. Until Plan C ships the break, the kitchen keeps delivering every Active plan after the wrap-up day and nothing is held or refunded. No Plan B copy may promise a hold, "kept for next semester", a refund, or "your plan waits until we're back" unless it is gated on `SEASON_BREAK_RELEASE_LIVE` with an honest interim wording. Per-item choices are in the table below.
- **Plan A preconditions (checked in Task 1 Step 1):** `SEASON_BREAK_RELEASE_LIVE` in `season-release.ts`; `formatShortDay(iso: string): string` in `season-dates.ts` returning `'Sat 3 Oct'`; `formatAed(fils: number): string` in `meal-value.ts` grouping thousands (`formatAed(1980) === 'AED 19.80'`, `formatAed(150000) === 'AED 1,500'`). If any is missing, stop and report; do not recreate them here.
- Customer dates use `formatShortDay`, customer amounts use `formatAed`. Customer copy: plain words, no emoji, no em or en dashes, the customer's own dates and amounts.
- All dates are `YYYY-MM-DD` on the Asia/Dubai calendar. Pure date maths uses `addDaysIso`, `isDeliveryDayIso`, `todayAeIso` from `season-dates.ts`. `subscriptions.week_type` is only `5DAYS` or `6DAYS`.
- Anchor calendar for every test: Mon 2026-09-14 is today; Sat 3 Oct, Sun 4 Oct, Mon 5 Oct, Tue 6 Oct; Wed 30 Sep; Fri 2 Oct.
- **Meal value for a credited skip (decided 2026-09-15, spec D7):** what the customer paid for that meal: `floor((amount_paid_fils + credit_applied_fils) / meals_count) × meals_per_day` (card charge plus wallet credit used, over the meals in the order; a Monthly Max day is 2 meals). Only an order with no recorded money falls back to `floor(round(price_per_meal × 100) × 90 / 100) × meals_per_day` (90% of list price, since the Dorm Wars tier coupon takes at most 10%). Staff Monthly, Welcome Meal and plans with no order mint 0 (spec X5). An order with neither recorded money nor a price refuses the credited skip. TypeScript `skipCreditFilsFor` and SQL `season_skip_credit_fils` must agree; Task 6's rehearsal checks both paths.
- **Stripe test mode (decided 2026-09-15, spec D7):** production runs Stripe in test mode for the pilot, and test payments are not money. The backfill (Task 4) leaves `cs_test_` orders and card orders without Stripe ids null, so their plans use the fallback. The webhook and free checkout (Task 3) still record both columns on every new order in either mode, so live payments carry exact amounts from the first one. On 2026-09-15 no live plan resolves: the Active Monthly Premium (list AED 22) credits 1980 fils a day, the Paused one (list AED 18) 1620.
- **Order money first:** Tasks 3 and 4 run before credited skips can mint. Task 4's `--write` run happens before Task 8 is applied live and before Task 9's actions deploy.
- **Deploy order:** Tasks 5 to 8 go live before Plan B's TypeScript deploys. From the moment Task 8 is applied until Plan B is deployed, no wrap-up day may be scheduled or moved (the owner has been told). Plan B deploys immediately after its final review.
- **Stripe keys** come only from the process environment at run time (`STRIPE_LIVE_SECRET_KEY` for the backfill): never from `.env.local`, never printed, never written to a file. The backfill refuses to run while `.env.local` defines `STRIPE_LIVE_SECRET_KEY`, and reports a Stripe failure by `err.type` and `err.code` only, never `err.message`.
- **Messages:** a credited skip sends no skip confirmation: `meal_skipped_confirm`, `meal_skip_scheduled_confirm` and `meal_skip_cancelled_confirm` are never sent for it. Every same-day skip, credited or not, queues `meal_resumed_confirm` for the next eligible delivery day only when that day is on or before W, or is on or before K while the plan holds a buffer grant (`mayPromiseMealOn`). Every credited skip, and every reconciliation, calls `announceSeasonSkipCredited(receipts)` in `src/contexts/season/usecases/season-skip-notices.ts`; Plan E wires `season_skip_credited` there.
- **Live database first.** Before changing any existing SQL function, read its live body with `select pg_get_functiondef('public.<name>'::regproc);` through the Supabase connector and compare it to the body quoted in the task; if they differ in logic, stop and report. Formatting that `pg_get_functiondef` normalises (whitespace, `SET search_path TO 'public'` against `SET search_path = public`, `$function$` against `$$`) is not a difference. Mirror every live migration verbatim into `supabase/migrations/20260915_<name>.sql`. Apply with `apply_migration` using the file content without `BEGIN;` / `COMMIT;`. Never re-apply an older file from `supabase/migrations/`.
- Every new SQL function is `SECURITY DEFINER`, `SET search_path = public`, with `REVOKE EXECUTE ... FROM public, anon, authenticated`. Customer server actions call them with `createAdminSupabaseClient()` and pass `auth.user.id` from `withOwnedSubscription`, never a client-supplied id. Every SQL refusal raises a message starting with a `SEASON_SKIP_` or `SEASON_UNSKIP_` code; the customer never sees raw text.
- Why SQL for skip writes: `authenticated` has column-level UPDATE only on older `subscriptions` columns (not `credited_skip_days`, `credited_skip_dates`, `season_buffer_grants`) and RLS gives customers SELECT only on `credits`. One function per operation also makes the subscription update and the credit row atomic and lets SQL recheck the season and the amount under a row lock.
- Every new customer surface has a preview fixture (`?preview=1&...`) on desktop and mobile, and every new or changed button carries a stable `id`.
- Another session works on `main`: any new "no delivery" reason on the menu goes through `classifyMenuDay` in `src/app/dashboard/_shared/menu-day-status.ts` (this plan adds none, only wording), and any new subscription insert writes `meal_preference_type` (this plan adds none).
- Work in the worktree `.claude/worktrees/season-wind-down` on branch `feat/season-wind-down`. Stage only the paths listed in each task (`git add <paths>`); never `git add -A`, `git commit -a` or bare `git stash`.
- Commit messages end with: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Test: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit -p .`. Lint: `npm run lint`.

## Scope decisions

### What depends on the break (controller ruling, 2026-09-14)

| Spec item | Choice | Why |
|---|---|---|
| §10.1 order money, moved from Plan D | Ship first (Tasks 3, 4) | D7 values a credited skip at what was paid. Plan D keeps the refund flow. |
| §7.2 credited skips, buffer grants, credit tick, reconciliation | Ship ungated (Tasks 1 to 13) | A credited skip moves the meal's value to the wallet and never promises a hold. A grant is only a counter until Plan C's G1 reads it. |
| §7.3 pause line | Gated (Task 15). Live: "The semester wraps up on {W}. If you're still paused then, your plan waits for you until we're back." Interim: "The semester wraps up on {W}." | The second sentence promises a hold. |
| §7.4 resume split sheet (N7) | Moved to Plan C | Every line of the sheet describes the hold, its credit and its refund. |
| §7.5 resume refused during the break, and N11 | Moved to Plan C | Phase `break` only exists after Plan C's `season_begin_break`; it belongs with G2 and G9. |
| §7.6 start-date change during the break | Moved to Plan C. The wind-down half already works (see §7.1 below) | Same reason as §7.5. |
| §7.7 save-a-spot eligibility | Ship ungated (Task 14) | The waitlist credit is real money for the next Monthly plan whether or not a break follows. |
| N1 "Your meals keep coming" | Ship ungated (Task 16) | Only states deliveries that arrive before W. |
| N3 paused notice | Gated (Task 16). Live: "Still paused then? Your plan waits for you until we're back." Interim: "Your plan stays paused until you resume it." | The live wording promises a hold. |

### §7.1 buying: no new code

Confirmed by reading: Plan A's `season_schedule_end`, `season_move_end` and `season_end_today` write `pause_scheduled_for = W`, and every sales path already judges journeys against it: `src/app/api/checkout/route.ts` (the `INTAKE_ENDING` guard reading `intake.pauseScheduledFor`), `src/contexts/payments/usecases/free-checkout.ts` (`IntakeEndingError`), `src/app/r/[cid]/actions.ts` (`claimGift`), `src/contexts/staff/domain/staff-intake-gate.ts` (provision and renewal), and `changeStartDate` in `subscription-mutations.ts`. Stop-sales sets `paused = true`, which checkout refuses with `INTAKE_PAUSED`. A buffer day is never sold because journeys are judged against W, not K. Task 17 re-greps these five guards.

### §7.7 eligibility: spec §2.2 superset (decided 2026-09-15)

§7.7 lists three eligible cases, but §2.2 also says a customer "counts as on the break as soon as no Monthly or Weekly plan can follow theirs before the wrap-up day ... and they can save a spot". Task 14 implements the superset: eligible during the wind-down when a live plan is `customer_paused` or `runs_past`, or when no Monthly or Weekly plan could start after the customer's last live plan (or today, with no plan) and still finish by W. Stopped sales count as "no plan can follow". With no wrap-up day set (today's live row) the rule stays exactly as now: paused means eligible.

## File Map

| File | Responsibility |
|---|---|
| Create `src/contexts/payments/domain/order-money.ts` (+ test) | Credit an order really used (split rows by their used part); backfill decision per order; `.env.local` live-key check; Stripe error summary |
| Create `src/infra/supabase/credit-usage-repo.ts` (+ test) | `loadCreditUsedFils`: the one reader of the wallet credit an order really used, for the webhook, free checkout and the backfill; null when the rows cannot be read |
| Modify `src/contexts/payments/usecases/handle-stripe-event.ts`, `src/contexts/payments/usecases/free-checkout.ts` | Record `amount_paid_fils` and `credit_applied_fils` on every new order; neither column, and an ops alert, when the credit rows cannot be read |
| Create `src/contexts/payments/order-money-wiring.test.ts`; modify `src/app/api/admin-notification-coverage.test.ts` | Both paths and the backfill count credit through `loadCreditUsedFils`; unreadable credit rows and a failed write alert ops |
| Create `scripts/backfill-order-money.ts`; modify `package.json` | Backfill live-plan orders: dry run by default, live-mode payments only; refuses a live key in `.env.local`; Stripe failures reported by type and code |
| Create `src/contexts/season/domain/skip-outcome.ts` (+ test) | Projected end, make-up day, normal / grant / credited decision, skip credit amount, "may we promise a meal on this date", seen-outcome check |
| Modify `src/contexts/subscriptions/domain/subscription-rules.ts` (+ test) | `skipsUsedFor`; `canSkip` counts credited skips (X3) |
| Create `src/app/dashboard/skip-allowance-wiring.test.ts` | Every skip button and count (plan bar pills, home quota, mobile calendar, skip sheet, plan page) counts credited skips |
| Modify `src/contexts/subscriptions/domain/subscriptions.ts` | `credited_skip_days`, `credited_skip_dates`, `season_buffer_grants` on `Subscription` |
| Modify `src/app/dashboard/_shared/types.ts` | The same fields (optional) plus `meals_per_day` on the dashboard `Subscription` |
| Create `supabase/migrations/20260915_season_credited_skip_ticks.sql` | `credited_skip_dates` column; status and delivery ticks count credited skips |
| Create `supabase/migrations/20260915_season_skip_functions.sql` | `season_projected_end`, `season_make_up_day`, `season_skip_credit_fils`, `season_skip`, `season_unskip` |
| Create `supabase/migrations/20260915_season_skip_credit_tick.sql` | `season_skip_credit_tick` and its cron job |
| Create `supabase/migrations/20260915_season_reconcile_skips.sql` | `season_reconcile_skips`; `season_schedule_end` and `season_move_end` call it |
| Modify `src/app/admin/_components/cron-registry.ts` | Registry entry for the credit tick |
| Create `src/contexts/season/domain/season-skip-receipt.ts` (+ test) | Receipt type and the parser for reconciliation results |
| Create `src/contexts/season/usecases/season-skip-notices.ts` | `announceSeasonSkipCredited`, the Plan E hook |
| Modify `src/contexts/season/usecases/season-transitions.ts` (+ test) | Pass reconciliation receipts to the hook |
| Create `src/contexts/season/domain/season-skip-errors.ts` (+ test) | Customer copy for refused season skips |
| Create `src/contexts/season/usecases/skip-season.ts` | Fresh season context, order money, `season_skip` / `season_unskip` calls |
| Modify `src/contexts/subscriptions/usecases/subscription-mutations.ts` (+ test) | Season-aware skip, future skip, un-skip through one module-local `seasonSkipStep`; pause guards for credited skips |
| Create `src/contexts/season/domain/customer-season.ts` (+ test) | The dashboard's season view for one customer |
| Modify `src/app/dashboard/page.tsx`, `ClientDashboard.tsx`, `ActiveDashboard.tsx` | Thread the season view; preview knobs `season=` and `release=1` |
| Create `src/app/dashboard/_shared/season-skip-copy.ts` (+ test) | Credited skip sheet, toast and un-skip copy |
| Modify `src/app/dashboard/_shared/FutureSkipModal.tsx` | Credited copy, stable ids |
| Modify `src/app/dashboard/PlanProgress.tsx`, `_mobile/MobileHome.tsx`, `plan/PlanClient.tsx`, `_mobile/MobilePlan.tsx` | Skips used count credited skips; credited pill and cell wording |
| Modify `src/app/dashboard/_shared/menu-day-status.ts` (+ test), `menu/MenuClient.tsx`, `menu/page.tsx` | Credited skip notes on the menu; preview `state=credited` |
| Modify `src/shared/credit-ledger.ts` (+ test) | "Skipped meal credit" label |
| Create `src/app/dashboard/credit/credit-rows.ts` (+ test) | Ledger row amount and date line, pending arrival |
| Modify `src/app/dashboard/credit/page.tsx`, `CreditClient.tsx`, `_mobile/MobileCredit.tsx` | Pending skip credit "arrives {date}"; preview `season=credited` |
| Modify `src/contexts/subscriptions/domain/intake-cycle.ts` (+ test), `usecases/join-intake-waitlist.ts` (+ test) | Save-a-spot eligibility |
| Create `src/app/dashboard/_shared/season-notice-copy.ts` (+ test) | Pause line, N1 and N3 copy, chip label, seen key |
| Modify `src/app/dashboard/_shared/PlanPauseModal.tsx` | Pause line |
| Create `src/app/dashboard/_shared/SeasonScheduledNotice.tsx`, `SeasonWrapUpChip.tsx` | N1 / N3 full-screen notice and the home chip |
| Create `scripts/check-season-customer.mjs`; modify `package.json` | Rendered check of every Plan B preview state |
| Create `scripts/lib/chromium.mjs`; modify `scripts/check-season-planner.mjs` (Plan A) | One `launchChromium()` shared by both rendered checks |

---

### Task 1: Skip outcome

**Files:**
- Create: `src/contexts/season/domain/skip-outcome.ts`
- Test: `src/contexts/season/domain/skip-outcome.test.ts`

**Interfaces:**
- Consumes (Plan A): `addDaysIso(iso: string, days: number): string`, `isDeliveryDayIso(iso: string, weekType: SeasonWeekType): boolean`, `type SeasonWeekType`, `type SeasonPhase`, `mealValueOf(order: OrderMoney): MealValue`, `interface OrderMoney`; `resolvePlan(planString): PlanDefinition | null` from `@/contexts/subscriptions/domain/plans`.
- Produces:
  - `SEASON_ESTIMATE_SHARE_PCT = 90`
  - `interface SkipSeason { phase: SeasonPhase; wrapUpDay: string | null; closeDay: string | null; bufferDays: number }`
  - `interface SkipPlanFacts { endDate: string; weekType: SeasonWeekType; skippedDates: readonly string[]; bufferGrants: number }`
  - `type SkipOutcomeKind = 'normal' | 'grant' | 'credited'`
  - `type SkipOutcome = { kind: 'normal' } | { kind: 'grant'; makeUpDay: string } | { kind: 'credited'; makeUpDay: string; creditFils: number | null }`
  - `interface SkipSeen { outcome: SkipOutcomeKind; creditFils: number | null }`
  - `interface SeasonSkipNotice { outcome: 'credited'; creditFils: number; creditStatus: 'approved' | 'pending' | 'none'; mealDate: string }`
  - `projectedEndDate(input: { endDate: string; weekType: SeasonWeekType; todayAe: string; closureDates: ReadonlySet<string>; skippedDates: readonly string[] }): string`
  - `makeUpDayFor(input: <same as projectedEndDate>): string`
  - `decideSkipOutcome(input: { season: SkipSeason; plan: SkipPlanFacts; todayAe: string; closureDates: ReadonlySet<string>; creditFils: number | null }): SkipOutcome`
  - `skipCreditFilsFor(input: { planName: string; mealsPerDay: number | null; order: OrderMoney | null }): number | null`
  - `mayPromiseMealOn(dateIso: string, season: SkipSeason, bufferGrants: number): boolean`
  - `skipSeenMismatch(outcome: SkipOutcome, seen: SkipSeen | undefined): boolean`

- [ ] **Step 1: Confirm the Plan A preconditions**

Run: `grep -n "SEASON_BREAK_RELEASE_LIVE" src/contexts/season/domain/season-release.ts; grep -n "export function formatShortDay" src/contexts/season/domain/season-dates.ts; grep -n "export function formatAed" src/contexts/season/domain/meal-value.ts`
Expected: three matches. Then run `npx vitest run src/contexts/season/domain/meal-value.test.ts src/contexts/season/domain/season-dates.test.ts` and confirm both pass. If `SEASON_BREAK_RELEASE_LIVE` or `formatShortDay` is missing, stop and report that Plan A's final review changes have not landed.

- [ ] **Step 2: Write the failing test**

`src/contexts/season/domain/skip-outcome.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  projectedEndDate, makeUpDayFor, decideSkipOutcome, skipCreditFilsFor, mayPromiseMealOn, skipSeenMismatch,
  type SkipSeason, type SkipPlanFacts,
} from './skip-outcome'

// Anchors: Mon 2026-09-14 is today. Wed 30 Sep, Fri 2 Oct, Sat 3 Oct,
// Sun 4 Oct, Mon 5 Oct, Tue 6 Oct. Sun 20 Sep is not a delivery day.
const TODAY = '2026-09-14'
const NO_CLOSURES: ReadonlySet<string> = new Set()
const season = (s: Partial<SkipSeason> = {}): SkipSeason => ({
  phase: 'winding_down', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', bufferDays: 1, ...s,
})
const plan = (p: Partial<SkipPlanFacts> = {}): SkipPlanFacts => ({
  endDate: '2026-10-03', weekType: '6DAYS', skippedDates: [], bufferGrants: 0, ...p,
})
const walk = (p: SkipPlanFacts, closures: ReadonlySet<string> = NO_CLOSURES) => ({
  endDate: p.endDate, weekType: p.weekType, todayAe: TODAY, closureDates: closures, skippedDates: p.skippedDates,
})

describe('projectedEndDate', () => {
  it('is the end date when no closure lies ahead', () => {
    expect(projectedEndDate(walk(plan()))).toBe('2026-10-03')
  })

  it('moves one delivery day per closure still to come inside the plan', () => {
    expect(projectedEndDate(walk(plan(), new Set(['2026-09-30'])))).toBe('2026-10-05')
  })

  it('ignores closures on a skipped day, in the past, or on a day off', () => {
    expect(projectedEndDate(walk(plan({ skippedDates: ['2026-09-30'] }), new Set(['2026-09-30'])))).toBe('2026-10-03')
    expect(projectedEndDate(walk(plan(), new Set(['2026-09-10'])))).toBe('2026-10-03')
    expect(projectedEndDate(walk(plan(), new Set(['2026-09-20'])))).toBe('2026-10-03')
  })
})

describe('makeUpDayFor', () => {
  it('is the next delivery day after the projected end', () => {
    expect(makeUpDayFor(walk(plan()))).toBe('2026-10-05')
    expect(makeUpDayFor(walk(plan({ endDate: '2026-10-02' })))).toBe('2026-10-03')
    expect(makeUpDayFor(walk(plan({ endDate: '2026-10-02', weekType: '5DAYS' })))).toBe('2026-10-05')
  })

  it('never lands on a closure', () => {
    expect(makeUpDayFor(walk(plan(), new Set(['2026-10-05'])))).toBe('2026-10-06')
  })
})

describe('decideSkipOutcome', () => {
  const decide = (s: SkipSeason, p: SkipPlanFacts, creditFils: number | null = 1980) =>
    decideSkipOutcome({ season: s, plan: p, todayAe: TODAY, closureDates: NO_CLOSURES, creditFils })

  it('is a normal skip outside a wind-down with a wrap-up day', () => {
    expect(decide(season({ phase: 'open', wrapUpDay: null, closeDay: null }), plan())).toEqual({ kind: 'normal' })
    expect(decide(season({ wrapUpDay: null, closeDay: null }), plan())).toEqual({ kind: 'normal' })
  })

  it('is a normal skip when the make-up day is on or before the wrap-up day', () => {
    expect(decide(season(), plan({ endDate: '2026-10-02' }))).toEqual({ kind: 'normal' })
  })

  it('takes a buffer grant when the make-up day falls on a buffer day with a grant left', () => {
    expect(decide(season(), plan())).toEqual({ kind: 'grant', makeUpDay: '2026-10-05' })
  })

  it('credits the meal when the buffer grant is used up', () => {
    expect(decide(season(), plan({ bufferGrants: 1 }))).toEqual({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 })
  })

  it('credits the meal when there is no buffer', () => {
    expect(decide(season({ closeDay: '2026-10-03', bufferDays: 0 }), plan())).toEqual({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 })
  })

  it('a Monday to Friday plan cannot use a Saturday buffer day', () => {
    // W = Fri 2 Oct, buffer 1, so K = Sat 3 Oct. The plan's make-up day is Mon 5 Oct.
    expect(decide(season({ wrapUpDay: '2026-10-02', closeDay: '2026-10-03' }), plan({ endDate: '2026-10-02', weekType: '5DAYS' })))
      .toEqual({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 })
  })

  it('passes an unknown meal value through for the caller to refuse', () => {
    expect(decide(season(), plan({ bufferGrants: 1 }), null)).toEqual({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: null })
  })
})

describe('skipCreditFilsFor', () => {
  const order = (o: Partial<{ amountPaidFils: number | null; creditAppliedFils: number | null; mealsCount: number | null; pricePerMealAed: number | null }> = {}) => ({
    amountPaidFils: null, creditAppliedFils: null, mealsCount: 24, pricePerMealAed: 22, ...o,
  })

  it('credits what the customer paid for the meal: card plus wallet credit, over the meals, times the day', () => {
    expect(skipCreditFilsFor({ planName: 'Monthly Premium', mealsPerDay: 1, order: order({ amountPaidFils: 43200, creditAppliedFils: 0, pricePerMealAed: 19 }) })).toBe(1800)
    // Monthly Max: AED 800 card + AED 40 wallet over 48 meals is AED 17.50 a meal, 2 meals a day.
    expect(skipCreditFilsFor({ planName: 'Monthly Max', mealsPerDay: 2, order: order({ amountPaidFils: 80000, creditAppliedFils: 4000, mealsCount: 48, pricePerMealAed: 19 }) })).toBe(3500)
  })

  it('falls back to 90% of the list price only when the order recorded no money', () => {
    expect(skipCreditFilsFor({ planName: 'Monthly Premium', mealsPerDay: 1, order: order() })).toBe(1980)
  })

  it('counts every meal of a delivery day', () => {
    expect(skipCreditFilsFor({ planName: 'Monthly Max', mealsPerDay: 2, order: order({ mealsCount: 48, pricePerMealAed: 17.5 }) })).toBe(3150)
  })

  it('mints nothing for plans not paid in cash', () => {
    expect(skipCreditFilsFor({ planName: 'Staff Monthly', mealsPerDay: 1, order: order() })).toBe(0)
    expect(skipCreditFilsFor({ planName: 'Welcome Meal', mealsPerDay: 1, order: order() })).toBe(0)
    expect(skipCreditFilsFor({ planName: 'Monthly Premium', mealsPerDay: 1, order: null })).toBe(0)
  })

  it('does not know the value of an order with no meals', () => {
    expect(skipCreditFilsFor({ planName: 'Monthly Premium', mealsPerDay: 1, order: order({ mealsCount: 0 }) })).toBeNull()
  })
})

describe('mayPromiseMealOn', () => {
  it('promises anything outside a wind-down', () => {
    expect(mayPromiseMealOn('2026-10-06', season({ phase: 'open', wrapUpDay: null, closeDay: null }), 0)).toBe(true)
  })

  it('promises days up to the wrap-up day, and buffer days only to a plan with a grant', () => {
    expect(mayPromiseMealOn('2026-10-03', season(), 0)).toBe(true)
    expect(mayPromiseMealOn('2026-10-05', season(), 1)).toBe(true)
    expect(mayPromiseMealOn('2026-10-05', season(), 0)).toBe(false)
    expect(mayPromiseMealOn('2026-10-06', season(), 1)).toBe(false)
  })
})

describe('skipSeenMismatch', () => {
  it('refuses a credited skip the customer was never shown', () => {
    expect(skipSeenMismatch({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 }, undefined)).toBe(true)
    expect(skipSeenMismatch({ kind: 'normal' }, undefined)).toBe(false)
  })

  it('refuses when the outcome or the amount changed since the sheet', () => {
    expect(skipSeenMismatch({ kind: 'grant', makeUpDay: '2026-10-05' }, { outcome: 'grant', creditFils: null })).toBe(false)
    expect(skipSeenMismatch({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 }, { outcome: 'credited', creditFils: 1800 })).toBe(true)
    expect(skipSeenMismatch({ kind: 'normal' }, { outcome: 'credited', creditFils: 1980 })).toBe(true)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/contexts/season/domain/skip-outcome.test.ts`
Expected: FAIL with "Failed to resolve import './skip-outcome'".

- [ ] **Step 4: Write the implementation**

`src/contexts/season/domain/skip-outcome.ts`:

```ts
/**
 * Skip outcome during the season wind-down (spec §7.2).
 *
 * A skip normally adds a make-up day at the end of the plan. While the season
 * winds down that day may land after the wrap-up day W:
 *   on or before W                          normal skip
 *   after W, on or before K, grant left     normal skip plus a buffer grant
 *   anywhere else                           credited skip (meal value to the wallet)
 *
 * Pure and client-importable. The skip sheets word the outcome before the tap,
 * the server action decides again on fresh data, and SQL season_skip recomputes
 * it under a row lock. projectedEndDate / makeUpDayFor mirror
 * season_projected_end / season_make_up_day in
 * supabase/migrations/20260915_season_skip_functions.sql.
 */

import { addDaysIso, isDeliveryDayIso, type SeasonWeekType } from './season-dates'
import type { SeasonPhase } from './season-phase'
import { mealValueOf, type OrderMoney } from './meal-value'
import { resolvePlan } from '@/contexts/subscriptions/domain/plans'

/** Share of the list price credited only when an order recorded no money (spec D7 fallback). */
export const SEASON_ESTIMATE_SHARE_PCT = 90

export interface SkipSeason {
  phase: SeasonPhase
  wrapUpDay: string | null
  closeDay: string | null
  bufferDays: number
}

export interface SkipPlanFacts {
  endDate: string
  weekType: SeasonWeekType
  skippedDates: readonly string[]
  bufferGrants: number
}

export type SkipOutcomeKind = 'normal' | 'grant' | 'credited'

export type SkipOutcome =
  | { kind: 'normal' }
  | { kind: 'grant'; makeUpDay: string }
  | { kind: 'credited'; makeUpDay: string; creditFils: number | null }

/** What the customer's sheet showed when they confirmed. */
export interface SkipSeen {
  outcome: SkipOutcomeKind
  creditFils: number | null
}

/** Returned by the skip actions so the dashboard can say what happened. */
export interface SeasonSkipNotice {
  outcome: 'credited'
  creditFils: number
  creditStatus: 'approved' | 'pending' | 'none'
  mealDate: string
}

interface WalkInput {
  endDate: string
  weekType: SeasonWeekType
  todayAe: string
  closureDates: ReadonlySet<string>
  skippedDates: readonly string[]
}

// Bounds the walk; a plan never needs more than a few extra delivery days.
const MAX_WALK_DAYS = 60

/**
 * The end date the plan will really have: subscription_closure_tick pushes it
 * one delivery day for every closure it meets from today to the end, except on
 * a day the customer already skipped.
 */
export function projectedEndDate(input: WalkInput): string {
  const skipped = new Set(input.skippedDates)
  let owed = 0
  for (const d of input.closureDates) {
    if (d >= input.todayAe && d <= input.endDate && isDeliveryDayIso(d, input.weekType) && !skipped.has(d)) owed++
  }
  let day = input.endDate
  for (let i = 0; owed > 0 && i < MAX_WALK_DAYS; i++) {
    day = addDaysIso(day, 1)
    if (!isDeliveryDayIso(day, input.weekType) || input.closureDates.has(day)) continue
    owed--
  }
  return day
}

/** The delivery day one more skip would add to the plan. */
export function makeUpDayFor(input: WalkInput): string {
  let day = projectedEndDate(input)
  for (let i = 0; i < MAX_WALK_DAYS; i++) {
    day = addDaysIso(day, 1)
    if (isDeliveryDayIso(day, input.weekType) && !input.closureDates.has(day)) return day
  }
  return day
}

export function decideSkipOutcome(input: {
  season: SkipSeason
  plan: SkipPlanFacts
  todayAe: string
  closureDates: ReadonlySet<string>
  creditFils: number | null
}): SkipOutcome {
  const { season, plan } = input
  if (season.phase !== 'winding_down' || !season.wrapUpDay) return { kind: 'normal' }
  const wrapUp = season.wrapUpDay
  const close = season.closeDay && season.closeDay > wrapUp ? season.closeDay : wrapUp
  const makeUpDay = makeUpDayFor({
    endDate: plan.endDate,
    weekType: plan.weekType,
    todayAe: input.todayAe,
    closureDates: input.closureDates,
    skippedDates: plan.skippedDates,
  })
  if (makeUpDay <= wrapUp) return { kind: 'normal' }
  if (makeUpDay <= close && plan.bufferGrants < season.bufferDays) return { kind: 'grant', makeUpDay }
  return { kind: 'credited', makeUpDay, creditFils: input.creditFils }
}

/**
 * Wallet credit for one skipped delivery day, in fils: what the customer paid
 * for that meal, (card charge + wallet credit used) ÷ meals in the order, × the
 * day's meals (spec D7). An order with no recorded money (Stripe test mode
 * during the pilot, or unresolvable) falls back to 90% of its list price.
 * 0 for plans not paid in cash (spec X5); null when there is nothing to go on.
 */
export function skipCreditFilsFor(input: { planName: string; mealsPerDay: number | null; order: OrderMoney | null }): number | null {
  const id = resolvePlan(input.planName)?.id
  if (id === 'staff-monthly' || id === 'welcome-gift') return 0
  if (!input.order) return 0
  const value = mealValueOf(input.order)
  if (!value) return null
  const perMeal = value.exact ? value.fils : Math.floor((value.fils * SEASON_ESTIMATE_SHARE_PCT) / 100)
  return perMeal * Math.max(1, input.mealsPerDay ?? 1)
}

/** May a message promise the customer a meal on this date? */
export function mayPromiseMealOn(dateIso: string, season: SkipSeason, bufferGrants: number): boolean {
  if (season.phase !== 'winding_down' || !season.wrapUpDay) return true
  if (dateIso <= season.wrapUpDay) return true
  return bufferGrants > 0 && season.closeDay != null && dateIso <= season.closeDay
}

/**
 * True when the server's outcome is not the one the customer confirmed. A
 * credited skip always needs a matching confirmation, because it moves money.
 */
export function skipSeenMismatch(outcome: SkipOutcome, seen: SkipSeen | undefined): boolean {
  if (!seen) return outcome.kind === 'credited'
  if (seen.outcome !== outcome.kind) return true
  return outcome.kind === 'credited' && seen.creditFils !== outcome.creditFils
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/contexts/season/domain/skip-outcome.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/season/domain/skip-outcome.ts src/contexts/season/domain/skip-outcome.test.ts
git commit -m "feat(season): decide whether a wind-down skip is made up, uses the buffer, or becomes credit

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: A credited skip uses a skip

**Files:**
- Modify: `src/contexts/subscriptions/domain/subscription-rules.ts`
- Test: `src/contexts/subscriptions/domain/subscription-rules.test.ts`
- Modify: `src/contexts/subscriptions/domain/subscriptions.ts`
- Modify: `src/app/dashboard/_shared/types.ts`
- Modify: `src/contexts/subscriptions/usecases/subscription-mutations.ts` (the cap line in `skipMeal` only)
- Modify: `src/contexts/subscriptions/usecases/subscription-mutations.test.ts`, `src/contexts/subscriptions/usecases/with-owned-subscription.test.ts` (fixtures only)
- Modify: `src/app/dashboard/ActiveDashboard.tsx`, `src/app/dashboard/PlanProgress.tsx`, `src/app/dashboard/_shared/FutureSkipModal.tsx`, `src/app/dashboard/plan/PlanClient.tsx`, `src/app/dashboard/_mobile/MobilePlan.tsx`
- Test: `src/app/dashboard/skip-allowance-wiring.test.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `skipsUsedFor(sub: { skipped_meals_count: number; credited_skip_days?: number | null }): number`
  - `Subscription` (domain) gains `credited_skip_days: number`, `credited_skip_dates: string[]`, `season_buffer_grants: number`
  - Dashboard `Subscription` gains optional `credited_skip_days?: number | null`, `credited_skip_dates?: string[] | null`, `season_buffer_grants?: number | null`, `meals_per_day?: number | null`

- [ ] **Step 1: Write the failing test**

In `src/contexts/subscriptions/domain/subscription-rules.test.ts`, add `skipsUsedFor` to the import from `./subscription-rules`, add these three lines to `fakeSub` right after `closure_days: 0,`:

```ts
    credited_skip_days: 0,
    credited_skip_dates: [],
    season_buffer_grants: 0,
```

and append:

```ts
describe('skipsUsedFor (spec X3: a credited skip uses a skip)', () => {
  it('adds credited skips to skipped meals', () => {
    expect(skipsUsedFor({ skipped_meals_count: 1, credited_skip_days: 2 })).toBe(3)
    expect(skipsUsedFor({ skipped_meals_count: 2 })).toBe(2)
    expect(skipsUsedFor({ skipped_meals_count: 0, credited_skip_days: null })).toBe(0)
  })

  it('canSkip refuses once skipped plus credited reaches the allowance', () => {
    expect(canSkip(fakeSub({ skipped_meals_count: 1, credited_skip_days: 2, credited_skip_dates: ['2026-09-16', '2026-09-17'] })))
      .toEqual({ ok: false, error: 'You\'ve used all 3 of your skips for this cycle.' })
    expect(canSkip(fakeSub({ skipped_meals_count: 1, credited_skip_days: 1, credited_skip_dates: ['2026-09-16'] })))
      .toEqual({ ok: true })
  })
})
```

Create `src/app/dashboard/skip-allowance-wiring.test.ts`. The plan bar's pill skip is offered only while `hasCredits` is true, and the other surfaces show a skips-left count; all of them must count credited skips:

```ts
/**
 * Every surface that offers a skip, or counts the skips left, counts credited
 * season skips against the allowance (spec X3). Source-level, like
 * src/app/api/admin-notification-coverage.test.ts: these are client components
 * and vitest runs in the node environment with no render harness.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')

describe('skip buttons count credited skips (spec X3)', () => {
  it('the plan bar only offers a pill skip while skips are left, credited ones included', () => {
    const src = read('src/app/dashboard/PlanProgress.tsx')
    expect(src).toContain('const skippedDeliveries = skipsUsedFor(sub)')
    expect(src).toContain('const hasCredits = (maxSkips - skippedDeliveries) > 0')
    expect(src).not.toContain('sub.skipped_meals_count')
  })

  it('the home skip quota, the mobile calendar and the future skip sheet count credited skips', () => {
    const active = read('src/app/dashboard/ActiveDashboard.tsx')
    expect(active).toContain('left:  Math.max(0, skipTotal - skipsUsedFor(effectiveSub)),')
    expect(active).toContain('skipped: skipsUsedFor(effectiveSub),')
    // MobileHome offers a cell skip from data.skipped, which ActiveDashboard now fills with skipsUsedFor.
    expect(read('src/app/dashboard/_mobile/MobileHome.tsx')).toContain('const hasCredits = data.maxSkips - data.skipped > 0')
    expect(read('src/app/dashboard/_shared/FutureSkipModal.tsx')).toContain('const skipsLeft = Math.max(0, maxSkips - skipsUsedFor(sub))')
  })

  it('the plan page counts credited skips on desktop and mobile', () => {
    for (const rel of ['src/app/dashboard/plan/PlanClient.tsx', 'src/app/dashboard/_mobile/MobilePlan.tsx']) {
      expect(read(rel)).toContain('const skipsLeft = Math.max(0, skipAllowance - skipsUsedFor(sub))')
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/subscriptions/domain/subscription-rules.test.ts src/app/dashboard/skip-allowance-wiring.test.ts`
Expected: FAIL with "skipsUsedFor is not a function" (and the new `canSkip` case returns `{ ok: true }`); all three wiring cases fail.

- [ ] **Step 3: Write the implementation**

`src/contexts/subscriptions/domain/subscriptions.ts`: add after `closure_days: number` in `interface Subscription`:

```ts
  credited_skip_days: number                  // default 0 — skips turned into wallet credit (season §7.2)
  credited_skip_dates: string[]               // YYYY-MM-DD[], default [] — which skipped_dates were credited
  season_buffer_grants: number                // default 0 — make-up meals allowed on a buffer day (season §6.2)
```

`src/contexts/subscriptions/domain/subscription-rules.ts`: add above `canSkip`:

```ts
/**
 * Skips this plan has used: meals skipped and made up, plus meals skipped and
 * turned into wallet credit during a season wind-down (spec X3). "3 skips"
 * keeps meaning 3 skips whichever way each one was paid back.
 */
export function skipsUsedFor(sub: { skipped_meals_count: number; credited_skip_days?: number | null }): number {
  return Math.max(0, sub.skipped_meals_count) + Math.max(0, sub.credited_skip_days ?? 0)
}
```

and in `canSkip` replace `if (sub.skipped_meals_count >= maxSkips) {` with `if (skipsUsedFor(sub) >= maxSkips) {`.

`src/contexts/subscriptions/usecases/subscription-mutations.ts`:
- Change the import line to `import { canPause, canPlanPause, canResume, canSkip, skipCapFor, skipsUsedFor } from '@/contexts/subscriptions/domain/subscription-rules';`
- In `skipMeal` replace `if (subscription.skipped_meals_count >= maxSkips) {` with `if (skipsUsedFor(subscription) >= maxSkips) {`.

`src/contexts/subscriptions/usecases/subscription-mutations.test.ts` and `src/contexts/subscriptions/usecases/with-owned-subscription.test.ts`: in each Subscription fixture, add after `closure_days: 0,`:

```ts
    credited_skip_days: 0,
    credited_skip_dates: [],
    season_buffer_grants: 0,
```

`src/app/dashboard/_shared/types.ts`: add at the end of `interface Subscription` (after `planned_pause_start`):

```ts
  // Season wind-down (spec §7.2). A credited skip uses a skip from the
  // allowance but adds no make-up day; its date is in skipped_dates AND in
  // credited_skip_dates. Optional because preview fixtures build subs by hand.
  credited_skip_days?: number | null
  credited_skip_dates?: string[] | null
  season_buffer_grants?: number | null
  meals_per_day?: number | null
```

`src/app/dashboard/ActiveDashboard.tsx`:
- Change `import { skipCapFor, hasNotStartedYet } from '@/contexts/subscriptions/domain/subscription-rules'` to `import { skipCapFor, skipsUsedFor, hasNotStartedYet } from '@/contexts/subscriptions/domain/subscription-rules'`.
- In `skipQuota` replace `left:  Math.max(0, skipTotal - effectiveSub.skipped_meals_count),` with `left:  Math.max(0, skipTotal - skipsUsedFor(effectiveSub)),`.
- In `mobileData` replace `skipped: effectiveSub.skipped_meals_count,` with `skipped: skipsUsedFor(effectiveSub),`.

`src/app/dashboard/PlanProgress.tsx`:
- Change `import { hasNotStartedYet, isHeldPastStartDate } from '@/contexts/subscriptions/domain/subscription-rules'` to `import { hasNotStartedYet, isHeldPastStartDate, skipsUsedFor } from '@/contexts/subscriptions/domain/subscription-rules'`.
- Replace `const skippedDeliveries = Math.max(0, sub.skipped_meals_count)` with `const skippedDeliveries = skipsUsedFor(sub)`. Both of its readers then count credited skips with no further edit: `const untracedSkips = Math.max(0, skippedDeliveries - knownSkips)` (credited dates are in `skipped_dates` too, so only normal skips without a date stay untraced) and `const hasCredits = (maxSkips - skippedDeliveries) > 0`, which decides whether a future pill offers a skip.
- In the legend replace `{sub.skipped_meals_count > 0 && (` with `{skippedDeliveries > 0 && (` and `<strong style={{ color: S.fg, fontFeatureSettings: '"tnum"' }}>{sub.skipped_meals_count}</strong> skipped` with `<strong style={{ color: S.fg, fontFeatureSettings: '"tnum"' }}>{skippedDeliveries}</strong> skipped`.

`src/app/dashboard/_shared/FutureSkipModal.tsx`: add `import { skipsUsedFor } from '@/contexts/subscriptions/domain/subscription-rules'` and replace `const skipsLeft = Math.max(0, maxSkips - sub.skipped_meals_count)` with `const skipsLeft = Math.max(0, maxSkips - skipsUsedFor(sub))`.

`src/app/dashboard/plan/PlanClient.tsx` and `src/app/dashboard/_mobile/MobilePlan.tsx`: add `skipsUsedFor` to the existing import of `skipCapFor` from `@/contexts/subscriptions/domain/subscription-rules` and replace `const skipsLeft = Math.max(0, skipAllowance - sub.skipped_meals_count)` with `const skipsLeft = Math.max(0, skipAllowance - skipsUsedFor(sub))`.

- [ ] **Step 4: Run the tests, typecheck and lint**

Run: `npx vitest run src/contexts/subscriptions src/app/dashboard/skip-allowance-wiring.test.ts`
Expected: PASS, including the 3 wiring cases.
Run: `npx tsc --noEmit -p .`
Expected: no errors. If another file builds a domain `Subscription` literal, add the same three fixture lines there.
Run: `npm run lint`
Expected: no new warnings or errors.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/subscriptions/domain/subscription-rules.ts src/contexts/subscriptions/domain/subscription-rules.test.ts src/contexts/subscriptions/domain/subscriptions.ts src/app/dashboard/_shared/types.ts src/contexts/subscriptions/usecases/subscription-mutations.ts src/contexts/subscriptions/usecases/subscription-mutations.test.ts src/contexts/subscriptions/usecases/with-owned-subscription.test.ts src/app/dashboard/ActiveDashboard.tsx src/app/dashboard/PlanProgress.tsx src/app/dashboard/_shared/FutureSkipModal.tsx src/app/dashboard/plan/PlanClient.tsx src/app/dashboard/_mobile/MobilePlan.tsx src/app/dashboard/skip-allowance-wiring.test.ts
git commit -m "feat(season): a skip turned into credit still counts against the plan's skips

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: Every new order records what was paid

**Files:**
- Create: `src/contexts/payments/domain/order-money.ts`
- Test: `src/contexts/payments/domain/order-money.test.ts`
- Create: `src/infra/supabase/credit-usage-repo.ts`
- Test: `src/infra/supabase/credit-usage-repo.test.ts`
- Modify: `src/contexts/payments/usecases/handle-stripe-event.ts`
- Modify: `src/contexts/payments/usecases/free-checkout.ts`
- Create: `src/contexts/payments/order-money-wiring.test.ts`
- Modify: `src/app/api/admin-notification-coverage.test.ts`

**Interfaces:**
- Consumes: live `orders.amount_paid_fils`, `orders.credit_applied_fils` (Plan A); the webhook's `fullRowIds` / `splitToProcess` and free checkout's `appliedCreditIdsFull` / `splitCredit`.
- Produces:
  - `interface CreditRedemption { fullRowAmountsAed: ReadonlyArray<number | string>; splitUseFils: number | null }` (in `order-money.ts`)
  - `creditUsedFils(r: CreditRedemption): number`
  - `interface OrderMoneyColumns { amount_paid_fils: number; credit_applied_fils: number }`
  - `orderMoneyColumns(input: { cardChargeFils: number | null | undefined; creditUsedFils: number }): OrderMoneyColumns | null`
  - `interface CreditRowIds { fullRowIds: readonly string[]; splitUseFils: number | null }` and `loadCreditUsedFils(sb: SupabaseClient, rows: CreditRowIds): Promise<number | null>` in `src/infra/supabase/credit-usage-repo.ts`: the one reader of the wallet credit an order really used (full rows whole, the split row by its used part). It takes the Supabase client as an argument and imports nothing server-only, so the webhook, free checkout and the Task 4 backfill script (run with `tsx`, which resolves the `@/` alias from `tsconfig.json`) all import this module. Null when a credit row cannot be read.
  - Every order created after this deploys, Stripe (test or live mode) and credit-only, carries both columns. When its credit rows cannot be read it carries neither, and ops is alerted: never a partial credit figure.

How credit is consumed today (read before writing): the checkout route reserves rows from `synthesizePerSessionCoupon`, which walks approved credit FIFO into rows redeemed in full (`appliedCreditIdsFull`) and at most one boundary row used in part (`splitCredit.useFils`). The webhook (from session metadata, or the legacy fallback walk) and free checkout flip every full row and the boundary row to `applied` with `applied_to = order`, then insert the unused part of the boundary row as a new approved `<source>_split_remainder` row. So `sum(credits.applied_to = order)` over-counts a split: the credit actually used is the full rows' amounts plus `useFils`. It is also the credit part of the discount Stripe gave, so it counts even if a flip fails (ops is already alerted then).

The other session added `meal_preference_type` to both subscription inserts; this task touches only the order and credit code below them.

- [ ] **Step 1: Write the failing test**

`src/contexts/payments/domain/order-money.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { creditUsedFils, orderMoneyColumns } from './order-money'

describe('creditUsedFils', () => {
  it('adds up the rows redeemed in full, reading PostgREST numeric strings', () => {
    expect(creditUsedFils({ fullRowAmountsAed: [20, '15.50'], splitUseFils: null })).toBe(3550)
  })

  it('counts only the used part of a split row, never the whole row', () => {
    // A AED 5,500 row paid AED 10.24 of the plan; the other AED 5,489.76
    // went back to the wallet as a _split_remainder row.
    expect(creditUsedFils({ fullRowAmountsAed: [], splitUseFils: 1024 })).toBe(1024)
    expect(creditUsedFils({ fullRowAmountsAed: [20, 15], splitUseFils: 1024 })).toBe(4524)
  })

  it('is 0 when no credit was used', () => {
    expect(creditUsedFils({ fullRowAmountsAed: [], splitUseFils: null })).toBe(0)
  })
})

describe('orderMoneyColumns', () => {
  it('records the card charge and the credit used', () => {
    expect(orderMoneyColumns({ cardChargeFils: 41200, creditUsedFils: 2000 })).toEqual({ amount_paid_fils: 41200, credit_applied_fils: 2000 })
  })

  it('records a credit-only order as no card charge', () => {
    expect(orderMoneyColumns({ cardChargeFils: 0, creditUsedFils: 43200 })).toEqual({ amount_paid_fils: 0, credit_applied_fils: 43200 })
  })

  it('records nothing when the card charge is not known', () => {
    expect(orderMoneyColumns({ cardChargeFils: null, creditUsedFils: 2000 })).toBeNull()
    expect(orderMoneyColumns({ cardChargeFils: undefined, creditUsedFils: 0 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/contexts/payments/domain/order-money.test.ts`
Expected: FAIL with "Failed to resolve import './order-money'".

- [ ] **Step 3: Write the helper**

`src/contexts/payments/domain/order-money.ts`:

```ts
/**
 * What an order was actually paid with (season spec §10.1, D7): the card
 * charge and the wallet credit it really consumed. A season skip credit is
 * worth exactly (card charge + credit used) ÷ meals in the order, so the
 * webhook, free checkout and the backfill script must count credit the same
 * way; all three read the rows through loadCreditUsedFils
 * (src/infra/supabase/credit-usage-repo.ts), which sums them here. Pure.
 *
 * Credit consumed = every row redeemed in full + the used part of the one
 * boundary row that was split. The split row is flipped to 'applied' with its
 * ORIGINAL amount and the unused part is re-deposited as a new
 * `<source>_split_remainder` row, so summing credits by applied_to over-counts.
 */

export interface CreditRedemption {
  /** amount_aed of each row redeemed in full (PostgREST numerics may be strings). */
  fullRowAmountsAed: ReadonlyArray<number | string>
  /** Fils used from the split boundary row, or null when nothing was split. */
  splitUseFils: number | null
}

export function creditUsedFils(r: CreditRedemption): number {
  const full = r.fullRowAmountsAed.reduce<number>((sum, amount) => sum + Math.round(Number(amount) * 100), 0)
  return full + Math.max(0, r.splitUseFils ?? 0)
}

export interface OrderMoneyColumns {
  amount_paid_fils: number
  credit_applied_fils: number
}

/** The two orders columns, or null when the card charge is unknown (write nothing). */
export function orderMoneyColumns(input: { cardChargeFils: number | null | undefined; creditUsedFils: number }): OrderMoneyColumns | null {
  if (input.cardChargeFils == null) return null
  return {
    amount_paid_fils: Math.max(0, Math.round(input.cardChargeFils)),
    credit_applied_fils: Math.max(0, Math.round(input.creditUsedFils)),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/contexts/payments/domain/order-money.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing credit reader test**

`src/infra/supabase/credit-usage-repo.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCreditUsedFils } from './credit-usage-repo'

/** A client whose credits.select('id, amount_aed').in('id', ids) resolves to `result`. */
function fakeSb(result: { data: unknown; error: unknown }) {
  const inMock = vi.fn(async () => result)
  const selectMock = vi.fn(() => ({ in: inMock }))
  const fromMock = vi.fn(() => ({ select: selectMock }))
  return { sb: { from: fromMock } as unknown as SupabaseClient, fromMock, inMock }
}

describe('loadCreditUsedFils', () => {
  it('adds the rows redeemed in full to the used part of the split row', async () => {
    const { sb, fromMock, inMock } = fakeSb({ data: [{ id: 'c1', amount_aed: 20 }, { id: 'c2', amount_aed: '15.50' }], error: null })
    expect(await loadCreditUsedFils(sb, { fullRowIds: ['c1', 'c2'], splitUseFils: 1024 })).toBe(4574)
    expect(fromMock).toHaveBeenCalledWith('credits')
    expect(inMock).toHaveBeenCalledWith('id', ['c1', 'c2'])
  })

  it('reads nothing when no row was redeemed in full', async () => {
    const { sb, fromMock } = fakeSb({ data: [], error: null })
    expect(await loadCreditUsedFils(sb, { fullRowIds: [], splitUseFils: 1024 })).toBe(1024)
    expect(await loadCreditUsedFils(sb, { fullRowIds: [], splitUseFils: null })).toBe(0)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns null when the credit rows cannot be read, so the caller records neither money column', async () => {
    const { sb } = fakeSb({ data: null, error: { message: 'connection terminated' } })
    expect(await loadCreditUsedFils(sb, { fullRowIds: ['c1'], splitUseFils: 1024 })).toBeNull()
  })

  it('returns null when a row is missing, rather than counting part of the credit', async () => {
    const { sb } = fakeSb({ data: [{ id: 'c1', amount_aed: 20 }], error: null })
    expect(await loadCreditUsedFils(sb, { fullRowIds: ['c1', 'c2'], splitUseFils: null })).toBeNull()
  })

  it('reads a repeated id once', async () => {
    const { sb, inMock } = fakeSb({ data: [{ id: 'c1', amount_aed: 20 }], error: null })
    expect(await loadCreditUsedFils(sb, { fullRowIds: ['c1', 'c1'], splitUseFils: null })).toBe(2000)
    expect(inMock).toHaveBeenCalledWith('id', ['c1'])
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/infra/supabase/credit-usage-repo.test.ts`
Expected: FAIL with "Failed to resolve import './credit-usage-repo'".

- [ ] **Step 7: Write the credit reader**

`src/infra/supabase/credit-usage-repo.ts`:

```ts
/**
 * The wallet credit an order really used, read from the credits table
 * (season spec §10.1, D7). The one reader for the Stripe webhook, free
 * checkout and scripts/backfill-order-money.ts, so all three count credit the
 * same way: rows redeemed in full count whole, the split row only by its used
 * part (creditUsedFils).
 *
 * Takes the Supabase client as an argument and imports nothing server-only,
 * so the tsx backfill script can import it too.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { creditUsedFils } from '@/contexts/payments/domain/order-money'

export interface CreditRowIds {
  /** Credit rows the order redeemed in full. */
  fullRowIds: readonly string[]
  /** Fils used from the one split boundary row, or null when nothing was split. */
  splitUseFils: number | null
}

/**
 * Fils of wallet credit the order consumed, or null when any full row cannot
 * be read (a read error, or fewer rows than ids). Null means the caller records
 * no money at all: a partial figure would under-credit every later season skip.
 */
export async function loadCreditUsedFils(sb: SupabaseClient, rows: CreditRowIds): Promise<number | null> {
  const ids = [...new Set(rows.fullRowIds)]
  let fullRowAmountsAed: Array<number | string> = []
  if (ids.length > 0) {
    const { data, error } = await sb.from('credits').select('id, amount_aed').in('id', ids)
    if (error || !data || data.length !== ids.length) return null
    fullRowAmountsAed = (data as Array<{ amount_aed: number | string }>).map((r) => r.amount_aed)
  }
  return creditUsedFils({ fullRowAmountsAed, splitUseFils: rows.splitUseFils })
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/infra/supabase/credit-usage-repo.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 9: Write the failing wiring tests**

`src/contexts/payments/order-money-wiring.test.ts`:

```ts
/**
 * Both order-creating paths record what was paid (season spec §10.1, D7),
 * count credit through the one reader, and record neither money column when
 * the credit rows cannot be read. Source-level, like
 * src/app/api/admin-notification-coverage.test.ts: the handlers need Stripe,
 * Supabase and Zoho to run end to end. The reader's own read-error behaviour
 * is tested in src/infra/supabase/credit-usage-repo.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')

describe('the Stripe webhook records order money', () => {
  it('records the card charge and the credit used, split rows by their used part, once', () => {
    const src = read('src/contexts/payments/usecases/handle-stripe-event.ts')
    expect(src).toContain("import { loadCreditUsedFils } from '@/infra/supabase/credit-usage-repo'")
    expect(src).toContain('loadCreditUsedFils(supabaseAdmin, {')
    expect(src).toContain('splitUseFils: splitToProcess?.useFils ?? null')
    expect(src).toContain('orderMoneyColumns({ cardChargeFils: session.amount_total, creditUsedFils: creditUsed })')
    expect(src).toContain(".is('amount_paid_fils', null)")
  })

  it('writes neither column when the credit rows cannot be read, and tells ops', () => {
    const src = read('src/contexts/payments/usecases/handle-stripe-event.ts')
    expect(src).toContain('const orderMoney = creditUsed === null')
    expect(src).toMatch(/if \(creditUsed === null\) \{[\s\S]*?Order money NOT recorded[\s\S]*?\} else if \(orderMoney\) \{/)
  })
})

describe('free checkout records order money', () => {
  it('records no card charge and the credit used, split rows by their used part', () => {
    const src = read('src/contexts/payments/usecases/free-checkout.ts')
    expect(src).toContain("import { loadCreditUsedFils } from '@/infra/supabase/credit-usage-repo'")
    expect(src).toContain('fullRowIds: appliedCreditIdsFull,')
    expect(src).toContain('splitUseFils: splitCredit?.useFils ?? null')
    expect(src).toContain('orderMoneyColumns({ cardChargeFils: 0, creditUsedFils: creditUsed })')
    expect(src).toContain('...(orderMoney ?? {})')
  })

  it('writes neither column when the credit rows cannot be read, and tells ops', () => {
    const src = read('src/contexts/payments/usecases/free-checkout.ts')
    expect(src).toContain('const orderMoney = creditUsed === null ? null')
    expect(src).toMatch(/if \(creditUsed === null\) \{[\s\S]*?Order money NOT recorded/)
  })
})
```

In `src/app/api/admin-notification-coverage.test.ts`, inside `describe('handle-stripe-event.ts — all failure paths alert ops', ...)`, add after the `split remainder insert failure alerts ops` case:

```ts
  it('order money write failure alerts ops', () => {
    expect(src).toContain('Order money write FAILED')
  })

  it('unreadable order credit rows alert ops', () => {
    expect(src).toContain('Order money NOT recorded')
  })
```

and append at the end of the file:

```ts
describe('free-checkout.ts: order money failure alerts ops', () => {
  const src = read('src/contexts/payments/usecases/free-checkout.ts')

  it('unreadable order credit rows alert ops', () => {
    expect(src).toContain('Order money NOT recorded')
  })
})
```

Run: `npx vitest run src/contexts/payments/order-money-wiring.test.ts src/app/api/admin-notification-coverage.test.ts`
Expected: FAIL on the new cases only.

- [ ] **Step 10: Record the money in the webhook and in free checkout**

`src/contexts/payments/usecases/handle-stripe-event.ts`:

(a) Add with the other imports:

```ts
import { orderMoneyColumns } from '@/contexts/payments/domain/order-money'
import { loadCreditUsedFils } from '@/infra/supabase/credit-usage-repo'
```

(b) Directly above the comment `// 3. Update Customer Profile with the latest data + drain any pending` (after the split-row block closes), add:

```ts
  // ── Order money (season spec §10.1, D7) ───────────────────────────────
  // What the customer paid for this order: the card charge plus the wallet
  // credit it really consumed (full rows whole, the split row by its used
  // part). A season skip credit is worth exactly this share of one meal.
  // Recorded in test and live mode alike, once: a Stripe retry keeps the
  // first value. When the credit rows cannot be read, neither column is
  // written: a partial figure would under-credit every later skip.
  const creditUsed = await loadCreditUsedFils(supabaseAdmin, {
    fullRowIds,
    splitUseFils: splitToProcess?.useFils ?? null,
  })
  const orderMoney = creditUsed === null
    ? null
    : orderMoneyColumns({ cardChargeFils: session.amount_total, creditUsedFils: creditUsed })
  if (creditUsed === null) {
    console.error(`order ${orderId}: credit rows unreadable, order money left unrecorded`)
    void notifyAdmin(
      `Order money NOT recorded for order ${orderId} (session ${session.id}): the credit rows it used could not be read, ` +
      `so both money columns stay empty. Season skip credit for this plan falls back to 90% of list price until they are filled.`,
      orderId,
    )
  } else if (orderMoney) {
    const { error: moneyErr } = await supabaseAdmin
      .from('orders')
      .update(orderMoney)
      .eq('id', orderId)
      .is('amount_paid_fils', null)
    if (moneyErr) {
      console.error('order money write failed (non-fatal):', moneyErr)
      void notifyAdmin(
        `Order money write FAILED for order ${orderId} (session ${session.id}): ${moneyErr.message}. ` +
        `Season skip credit for this plan falls back to 90% of list price until npm run backfill:order-money fixes it.`,
        orderId,
      )
    }
  } else {
    console.warn(`session ${session.id} has no amount_total; order ${orderId} money left unrecorded`)
  }
```

`src/contexts/payments/usecases/free-checkout.ts`:

(a) Add with the other imports:

```ts
import { orderMoneyColumns } from '@/contexts/payments/domain/order-money'
import { loadCreditUsedFils } from '@/infra/supabase/credit-usage-repo'
```

(b) Directly above the comment `// ── Order insert (no Stripe IDs, payment_method=credit) ────────────────`, add:

```ts
  // ── Order money (season spec §10.1, D7) ────────────────────────────────
  // No card charge; the wallet credit really consumed: full rows whole, the
  // split row only by its used part. When the credit rows cannot be read,
  // neither column is written (ops is told once the order exists).
  const creditUsed = await loadCreditUsedFils(supabaseAdmin, {
    fullRowIds: appliedCreditIdsFull,
    splitUseFils: splitCredit?.useFils ?? null,
  })
  const orderMoney = creditUsed === null ? null : orderMoneyColumns({ cardChargeFils: 0, creditUsedFils: creditUsed })
```

(c) In the `orders` insert payload, add directly after `price_per_meal: pricePerMeal,`:

```ts
      ...(orderMoney ?? {}),
```

(d) Directly after `const orderId = orderData.id as string`, add:

```ts
  if (creditUsed === null) {
    console.error(`free-checkout order ${orderId}: credit rows unreadable, order money left unrecorded`)
    void notifyAdmin(
      `Order money NOT recorded for free-checkout order ${orderId} (user ${userId}): the credit rows it used could not be read, ` +
      `so both money columns stay empty. Season skip credit for this plan falls back to 90% of list price until they are filled.`,
      orderId,
    )
  }
```

- [ ] **Step 11: Run the payment tests, typecheck and lint**

Run: `npx vitest run src/contexts/payments src/infra/supabase/credit-usage-repo.test.ts src/app/api`
Expected: PASS, including the three existing tier audit files and the notification coverage file.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

- [ ] **Step 12: Commit**

```bash
git add src/contexts/payments/domain/order-money.ts src/contexts/payments/domain/order-money.test.ts src/infra/supabase/credit-usage-repo.ts src/infra/supabase/credit-usage-repo.test.ts src/contexts/payments/usecases/handle-stripe-event.ts src/contexts/payments/usecases/free-checkout.ts src/contexts/payments/order-money-wiring.test.ts src/app/api/admin-notification-coverage.test.ts
git commit -m "feat(payments): every new order records the card charge and the wallet credit it really used

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Backfill order money for live plans

**Files:**
- Modify: `src/contexts/payments/domain/order-money.ts`
- Test: `src/contexts/payments/domain/order-money.test.ts`
- Create: `scripts/backfill-order-money.ts`
- Modify: `src/contexts/payments/order-money-wiring.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 3 `orderMoneyColumns`, `OrderMoneyColumns`, and `loadCreditUsedFils` from `src/infra/supabase/credit-usage-repo.ts`; `stripeClient()` and `type Stripe` from `src/infra/stripe/client.ts`.
- Produces:
  - `redemptionFromMetadata(metadata: Record<string, string> | null | undefined): { fullRowIds: string[]; splitUseFils: number | null; hasCreditMetadata: boolean }`
  - `type OrderBackfillPlan = { kind: 'skip'; reason: string } | { kind: 'unresolvable'; reason: string } | { kind: 'credit_only' } | { kind: 'stripe_live'; sessionId: string | null; paymentIntentId: string | null }`
  - `planOrderBackfill(order: { paymentMethod: string | null; stripeSessionId: string | null; stripePaymentId: string | null; amountPaidFils: number | null; creditAppliedFils: number | null }): OrderBackfillPlan`
  - `creditOnlyMoney(input: { creditUsedFils: number | null; splitRemainderNearby: boolean }): OrderMoneyColumns | null`
  - `stripeOrderMoney(input: { amountReceivedFils: number | null; sessionAmountTotalFils: number | null; hasCreditMetadata: boolean; creditUsedFils: number | null; creditsAppliedToOrder: number }): OrderMoneyColumns | { unresolvable: string }`
  - `isLiveStripeKey(key: string | undefined): boolean`
  - `envFileDefinesLiveKey(envFileText: string | null): boolean`
  - `stripeErrorSummary(err: unknown): string`
  - `npm run backfill:order-money` (dry run) and `npm run backfill:order-money -- --write`

Rules (decided 2026-09-15):
- Orders tied to Active, Paused, Skipped or Scheduled plans whose two money columns are not both set.
- Stripe runs in test mode for the pilot, and test payments are not money: a `cs_test_` session, or a `payment_method = 'stripe'` order with no Stripe ids, is listed as unresolvable and left null, so its plan uses the 90% fallback. No test-mode key is used.
- A `cs_live_` session, or an order with only a PaymentIntent id, is read from Stripe with a live key: card charge = PaymentIntent `amount_received`, or the session's `amount_total` when there is no intent. Refunds are never subtracted. Credit used = `loadCreditUsedFils` (Task 3) over the session metadata's full rows and `split_credit_use_fils`. A session with no credit metadata counts 0 credit only if no credit row points at the order; otherwise unresolvable. Credit rows that cannot be read leave the order unresolvable. A PaymentIntent that live mode cannot find, or any other Stripe failure, is unresolvable and reported as `Stripe read failed (type …, code …)`: never the error's message, because Stripe's invalid-key message repeats part of the key.
- A credit-only order (`payment_method = 'credit'` or a `free:` session id) records 0 card charge and `loadCreditUsedFils` over the credit rows applied to it, unless a `_split_remainder` row for the same customer was created within an hour of the order, in which case the used part cannot be read back and it is unresolvable.
- Read-only against Stripe. Writes only the two columns, only where `amount_paid_fils` is still null, only with `--write`.
- The live key comes from `STRIPE_LIVE_SECRET_KEY` in the process environment at run time: never from `.env.local` (whose `STRIPE_SECRET_KEY` is a rejected test key), never printed, never written to a file. `npm run` loads `.env.local` for the Supabase credentials, so before anything else the script refuses to run, changing nothing, when `.env.local` defines `STRIPE_LIVE_SECRET_KEY` (it matches the variable name only). The `sk_live_` / `rk_live_` check on the key stays. The key is only required when at least one order needs a live Stripe read.

Live data on 2026-09-15 (controller's read-only checks): the Active Monthly Premium's order is `cs_test_`; the Paused Monthly Premium's order has no Stripe ids; Staff Monthly has no order. `.env.local` does not define `STRIPE_LIVE_SECRET_KEY`. The backfill resolves nothing today and every live plan uses the fallback.

**Run it before credited skips can mint:** the `--write` run in Step 6 happens before Task 8 is applied live and before Task 9's actions deploy.

- [ ] **Step 1: Write the failing tests**

Replace the import line of `src/contexts/payments/domain/order-money.test.ts` with:

```ts
import {
  creditUsedFils, orderMoneyColumns, redemptionFromMetadata, planOrderBackfill, creditOnlyMoney, stripeOrderMoney, isLiveStripeKey,
  envFileDefinesLiveKey, stripeErrorSummary,
} from './order-money'
```

and append:

```ts
describe('redemptionFromMetadata', () => {
  it('reads the rows and split the checkout route stamped on the session', () => {
    expect(redemptionFromMetadata({ applied_credit_ids: 'c1,c2', split_credit_id: 'c3', split_credit_use_fils: '1024', credit_applied_fils: '4524' }))
      .toEqual({ fullRowIds: ['c1', 'c2'], splitUseFils: 1024, hasCreditMetadata: true })
    expect(redemptionFromMetadata({ applied_credit_ids: '', split_credit_id: '', split_credit_use_fils: '0', credit_applied_fils: '0' }))
      .toEqual({ fullRowIds: [], splitUseFils: null, hasCreditMetadata: true })
  })

  it('knows when a session carries no credit metadata at all', () => {
    expect(redemptionFromMetadata({ user_id: 'u1' })).toEqual({ fullRowIds: [], splitUseFils: null, hasCreditMetadata: false })
    expect(redemptionFromMetadata(null)).toEqual({ fullRowIds: [], splitUseFils: null, hasCreditMetadata: false })
  })
})

describe('planOrderBackfill', () => {
  const order = (o: Partial<Parameters<typeof planOrderBackfill>[0]> = {}) => ({
    paymentMethod: 'stripe', stripeSessionId: null, stripePaymentId: null, amountPaidFils: null, creditAppliedFils: null, ...o,
  })

  it('leaves an order that already records its money', () => {
    expect(planOrderBackfill(order({ amountPaidFils: 44000, creditAppliedFils: 0 }))).toEqual({ kind: 'skip', reason: 'already recorded' })
  })

  it('treats test-mode payments as not money (pilot)', () => {
    expect(planOrderBackfill(order({ stripeSessionId: 'cs_test_a1', stripePaymentId: 'pi_3U9k' })))
      .toEqual({ kind: 'unresolvable', reason: 'Stripe test mode: test payments are not money' })
  })

  it('cannot resolve a card order with no Stripe ids', () => {
    expect(planOrderBackfill(order())).toEqual({ kind: 'unresolvable', reason: 'no Stripe session or payment id' })
  })

  it('reads live-mode orders from Stripe', () => {
    expect(planOrderBackfill(order({ stripeSessionId: 'cs_live_a1', stripePaymentId: 'pi_1' })))
      .toEqual({ kind: 'stripe_live', sessionId: 'cs_live_a1', paymentIntentId: 'pi_1' })
    expect(planOrderBackfill(order({ stripePaymentId: 'pi_1' })))
      .toEqual({ kind: 'stripe_live', sessionId: null, paymentIntentId: 'pi_1' })
  })

  it('reads credit-only orders from the ledger', () => {
    expect(planOrderBackfill(order({ paymentMethod: 'credit' }))).toEqual({ kind: 'credit_only' })
    expect(planOrderBackfill(order({ paymentMethod: null, stripeSessionId: 'free:9f2c' }))).toEqual({ kind: 'credit_only' })
  })
})

describe('creditOnlyMoney', () => {
  it('records no card charge and the credit applied to the order', () => {
    expect(creditOnlyMoney({ creditUsedFils: 43200, splitRemainderNearby: false })).toEqual({ amount_paid_fils: 0, credit_applied_fils: 43200 })
  })

  it('gives up when a split remainder hides how much of a row was used, or the rows could not be read', () => {
    expect(creditOnlyMoney({ creditUsedFils: 550000, splitRemainderNearby: true })).toBeNull()
    expect(creditOnlyMoney({ creditUsedFils: null, splitRemainderNearby: false })).toBeNull()
  })
})

describe('stripeOrderMoney', () => {
  const input = (i: Partial<Parameters<typeof stripeOrderMoney>[0]> = {}) => ({
    amountReceivedFils: 41200, sessionAmountTotalFils: 41200, hasCreditMetadata: true, creditUsedFils: 0, creditsAppliedToOrder: 0, ...i,
  })

  it('takes the amount the PaymentIntent received plus the credit used', () => {
    expect(stripeOrderMoney(input({ creditUsedFils: 2000, creditsAppliedToOrder: 1 })))
      .toEqual({ amount_paid_fils: 41200, credit_applied_fils: 2000 })
  })

  it('falls back to the session total when there is no intent', () => {
    expect(stripeOrderMoney(input({ amountReceivedFils: null, sessionAmountTotalFils: 43200, hasCreditMetadata: false, creditUsedFils: null })))
      .toEqual({ amount_paid_fils: 43200, credit_applied_fils: 0 })
  })

  it('gives up without an amount', () => {
    expect(stripeOrderMoney(input({ amountReceivedFils: null, sessionAmountTotalFils: null })))
      .toEqual({ unresolvable: 'Stripe has no amount for this order' })
  })

  it('gives up when credit was used but the session never said how', () => {
    expect(stripeOrderMoney(input({ hasCreditMetadata: false, creditUsedFils: null, creditsAppliedToOrder: 2 })))
      .toEqual({ unresolvable: 'credit was used but the session has no credit metadata' })
  })

  it('gives up when the credit rows could not be read', () => {
    expect(stripeOrderMoney(input({ creditUsedFils: null, creditsAppliedToOrder: 1 })))
      .toEqual({ unresolvable: 'the credit rows this order used could not be read' })
  })
})

describe('isLiveStripeKey', () => {
  it('only accepts live secret or restricted keys', () => {
    expect(isLiveStripeKey('sk_live_abc')).toBe(true)
    expect(isLiveStripeKey('rk_live_abc')).toBe(true)
    expect(isLiveStripeKey('sk_test_abc')).toBe(false)
    expect(isLiveStripeKey(undefined)).toBe(false)
  })
})

describe('envFileDefinesLiveKey', () => {
  it('finds the live key name in an env file, however the line is written', () => {
    expect(envFileDefinesLiveKey('NEXT_PUBLIC_SUPABASE_URL=x\nSTRIPE_LIVE_SECRET_KEY=abc\n')).toBe(true)
    expect(envFileDefinesLiveKey('export STRIPE_LIVE_SECRET_KEY = "abc"')).toBe(true)
  })

  it('ignores other keys, comments and a missing file', () => {
    expect(envFileDefinesLiveKey('STRIPE_SECRET_KEY=abc\n# STRIPE_LIVE_SECRET_KEY=abc\nMY_STRIPE_LIVE_SECRET_KEY=abc')).toBe(false)
    expect(envFileDefinesLiveKey(null)).toBe(false)
  })
})

describe('stripeErrorSummary', () => {
  it('reports only the type and code, never the message', () => {
    const authErr = Object.assign(new Error('Invalid API Key provided: sk_live_****wxyz'), { type: 'StripeAuthenticationError' })
    expect(stripeErrorSummary(authErr)).toBe('Stripe read failed (type StripeAuthenticationError, code none)')
    expect(stripeErrorSummary(authErr)).not.toContain('sk_live_')
    expect(stripeErrorSummary({ type: 'StripeInvalidRequestError', code: 'resource_missing', message: 'No such payment_intent' }))
      .toBe('Stripe read failed (type StripeInvalidRequestError, code resource_missing)')
  })

  it('copes with a failure that is not a Stripe error', () => {
    expect(stripeErrorSummary(null)).toBe('Stripe read failed (type unknown, code none)')
  })
})
```

Append to `src/contexts/payments/order-money-wiring.test.ts` (each case reads the script inside the test, so Task 3's cases keep running while the script does not exist yet):

```ts
describe('the backfill counts credit and reports Stripe failures safely', () => {
  it('counts credit through the same reader as the webhook and free checkout', () => {
    const src = read('scripts/backfill-order-money.ts')
    expect(src).toContain("import { loadCreditUsedFils } from '../src/infra/supabase/credit-usage-repo'")
    expect(src.match(/loadCreditUsedFils\(sb, \{/g)).toHaveLength(2)
  })

  it('refuses a live key in .env.local before anything else, and never prints a Stripe error message', () => {
    const src = read('scripts/backfill-order-money.ts')
    const guard = src.indexOf('envFileDefinesLiveKey(existsSync(ENV_FILE)')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(src.indexOf('createClient(url, serviceKey'))
    expect(src).toContain('return { unresolvable: stripeErrorSummary(err) }')
    expect(src).not.toContain('(err as Error).message')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/payments/domain/order-money.test.ts src/contexts/payments/order-money-wiring.test.ts`
Expected: FAIL. `redemptionFromMetadata` and the other new names are not exported, and the two backfill wiring cases cannot read `scripts/backfill-order-money.ts` yet. Task 3's four wiring cases still pass.

- [ ] **Step 3: Write the decisions**

Append to `src/contexts/payments/domain/order-money.ts`:

```ts
// ── Backfill decisions (scripts/backfill-order-money.ts) ────────────────

/** The redemption /api/checkout stamped on a Checkout Session. */
export function redemptionFromMetadata(metadata: Record<string, string> | null | undefined): {
  fullRowIds: string[]
  splitUseFils: number | null
  hasCreditMetadata: boolean
} {
  const m = metadata ?? {}
  const fullRowIds = (m.applied_credit_ids ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const split = Number(m.split_credit_use_fils ?? '0') || 0
  return {
    fullRowIds,
    splitUseFils: m.split_credit_id && split > 0 ? split : null,
    hasCreditMetadata: m.credit_applied_fils != null,
  }
}

export type OrderBackfillPlan =
  | { kind: 'skip'; reason: string }
  | { kind: 'unresolvable'; reason: string }
  | { kind: 'credit_only' }
  | { kind: 'stripe_live'; sessionId: string | null; paymentIntentId: string | null }

/**
 * Where an order's money can come from. Stripe runs in test mode for the
 * pilot and test payments are not money (decided 2026-09-15), so test-mode
 * and id-less card orders stay unresolved and use the 90% fallback.
 */
export function planOrderBackfill(order: {
  paymentMethod: string | null
  stripeSessionId: string | null
  stripePaymentId: string | null
  amountPaidFils: number | null
  creditAppliedFils: number | null
}): OrderBackfillPlan {
  if (order.amountPaidFils != null && order.creditAppliedFils != null) return { kind: 'skip', reason: 'already recorded' }
  const session = order.stripeSessionId ?? ''
  if (order.paymentMethod === 'credit' || session.startsWith('free:')) return { kind: 'credit_only' }
  if (session.startsWith('cs_test_')) return { kind: 'unresolvable', reason: 'Stripe test mode: test payments are not money' }
  if (session.startsWith('cs_live_')) return { kind: 'stripe_live', sessionId: session, paymentIntentId: order.stripePaymentId }
  if (order.stripePaymentId) return { kind: 'stripe_live', sessionId: null, paymentIntentId: order.stripePaymentId }
  return { kind: 'unresolvable', reason: 'no Stripe session or payment id' }
}

/**
 * A credit-only order: no card charge, and the credit its applied rows add up
 * to (loadCreditUsedFils). Null when a split remainder hides how much of a row
 * was used, or when the rows could not be read.
 */
export function creditOnlyMoney(input: {
  creditUsedFils: number | null
  splitRemainderNearby: boolean
}): OrderMoneyColumns | null {
  if (input.splitRemainderNearby || input.creditUsedFils == null) return null
  return orderMoneyColumns({ cardChargeFils: 0, creditUsedFils: input.creditUsedFils })
}

export function stripeOrderMoney(input: {
  amountReceivedFils: number | null
  sessionAmountTotalFils: number | null
  hasCreditMetadata: boolean
  /** From loadCreditUsedFils over the metadata's rows; only read when hasCreditMetadata. */
  creditUsedFils: number | null
  creditsAppliedToOrder: number
}): OrderMoneyColumns | { unresolvable: string } {
  // Refunds are never subtracted: they are handled by the refund flow.
  const card = input.amountReceivedFils ?? input.sessionAmountTotalFils
  if (card == null) return { unresolvable: 'Stripe has no amount for this order' }
  let credit = 0
  if (input.hasCreditMetadata) {
    if (input.creditUsedFils == null) return { unresolvable: 'the credit rows this order used could not be read' }
    credit = input.creditUsedFils
  } else if (input.creditsAppliedToOrder > 0) {
    return { unresolvable: 'credit was used but the session has no credit metadata' }
  }
  return orderMoneyColumns({ cardChargeFils: card, creditUsedFils: credit }) ?? { unresolvable: 'Stripe has no amount for this order' }
}

export function isLiveStripeKey(key: string | undefined): boolean {
  return !!key && /^(sk|rk)_live_/.test(key)
}

/**
 * True when an env file assigns STRIPE_LIVE_SECRET_KEY. npm run loads
 * .env.local into the process, so a live key written there would reach the
 * backfill without anyone passing it; the script refuses instead. Matches the
 * variable name only.
 */
export function envFileDefinesLiveKey(envFileText: string | null): boolean {
  if (!envFileText) return false
  return envFileText.split(/\r?\n/).some((line) => /^\s*(export\s+)?STRIPE_LIVE_SECRET_KEY\s*=/.test(line))
}

/**
 * A Stripe failure reduced to its type and code. The message is never used:
 * Stripe's invalid-key message repeats part of the key.
 */
export function stripeErrorSummary(err: unknown): string {
  const e = (err ?? {}) as { type?: unknown; code?: unknown }
  const type = typeof e.type === 'string' ? e.type : 'unknown'
  const code = typeof e.code === 'string' ? e.code : 'none'
  return `Stripe read failed (type ${type}, code ${code})`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/contexts/payments/domain/order-money.test.ts`
Expected: PASS, 25 tests. (The two backfill wiring cases pass after Step 5.)

- [ ] **Step 5: Write the script**

`scripts/backfill-order-money.ts`:

```ts
/**
 * Backfills orders.amount_paid_fils and orders.credit_applied_fils for orders
 * tied to live plans (season spec §10.1, D7), so a season skip credit is worth
 * what the customer paid for the meal.
 *
 *   npm run backfill:order-money              dry run: prints what it would write
 *   npm run backfill:order-money -- --write   writes the two columns where still null
 *
 * Stripe runs in test mode for the pilot and test payments are not money
 * (decided 2026-09-15): cs_test_ orders and card orders without Stripe ids are
 * listed as unresolvable and left null, so their plans use the 90% fallback.
 *
 * Live-mode orders need a live key, read ONLY from STRIPE_LIVE_SECRET_KEY in
 * the process environment, never from .env.local, never printed, never
 * written. For example:
 *   STRIPE_LIVE_SECRET_KEY="$(netlify env:get STRIPE_SECRET_KEY --context production)" npm run backfill:order-money
 * npm run loads .env.local for the Supabase credentials (--env-file), so the
 * script refuses to run while .env.local defines STRIPE_LIVE_SECRET_KEY. A
 * Stripe failure is reported by its type and code only.
 *
 * Read-only against Stripe. Credit used is counted by loadCreditUsedFils, the
 * same reader the webhook and free checkout use.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { stripeClient, type Stripe } from '../src/infra/stripe/client'
import { loadCreditUsedFils } from '../src/infra/supabase/credit-usage-repo'
import {
  planOrderBackfill, creditOnlyMoney, stripeOrderMoney, redemptionFromMetadata, isLiveStripeKey,
  envFileDefinesLiveKey, stripeErrorSummary, type OrderMoneyColumns,
} from '../src/contexts/payments/domain/order-money'

// Refuse before anything else: a live key in .env.local would arrive through
// --env-file without anyone passing it. Only the variable name is checked.
const ENV_FILE = resolve(process.cwd(), '.env.local')
if (envFileDefinesLiveKey(existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf-8') : null)) {
  console.error('.env.local defines STRIPE_LIVE_SECRET_KEY. Delete that line and pass the key in the process environment only. Nothing was changed.')
  process.exit(1)
}

const WRITE = process.argv.includes('--write')
const LIVE_STATUSES = ['Active', 'Paused', 'Skipped', 'Scheduled']
const NO_ID = '00000000-0000-0000-0000-000000000000'
const HOUR_MS = 60 * 60 * 1000

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Nothing was changed.')
  process.exit(1)
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

type OrderRow = {
  id: string
  subscription_id: string | null
  customer_id: string
  payment_method: string | null
  stripe_session_id: string | null
  stripe_payment_id: string | null
  amount_paid_fils: number | null
  credit_applied_fils: number | null
  created_at: string
}

type ReportRow = { order: string | null; plan: string; status: string; result: string; detail: string }

async function liveStripeMoney(stripe: Stripe, order: OrderRow, sessionId: string | null, paymentIntentId: string | null): Promise<OrderMoneyColumns | { unresolvable: string }> {
  let session: Stripe.Checkout.Session | null = null
  let intent: Stripe.PaymentIntent | null = null
  try {
    session = sessionId
      ? await stripe.checkout.sessions.retrieve(sessionId)
      : paymentIntentId
        ? (await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 })).data[0] ?? null
        : null
    const sessionIntent = session?.payment_intent
    const intentId = paymentIntentId ?? (typeof sessionIntent === 'string' ? sessionIntent : sessionIntent?.id ?? null)
    intent = intentId ? await stripe.paymentIntents.retrieve(intentId) : null
  } catch (err) {
    // Type and code only: Stripe's invalid-key message repeats part of the key.
    return { unresolvable: stripeErrorSummary(err) }
  }

  const redemption = redemptionFromMetadata(session?.metadata ?? null)
  const creditUsed = redemption.hasCreditMetadata
    ? await loadCreditUsedFils(sb, { fullRowIds: redemption.fullRowIds, splitUseFils: redemption.splitUseFils })
    : null
  const { count, error: countErr } = await sb.from('credits').select('id', { count: 'exact', head: true }).eq('applied_to', order.id)
  if (countErr) return { unresolvable: `credit read failed: ${countErr.message}` }

  return stripeOrderMoney({
    amountReceivedFils: intent?.amount_received ?? null,
    sessionAmountTotalFils: session?.amount_total ?? null,
    hasCreditMetadata: redemption.hasCreditMetadata,
    creditUsedFils: creditUsed,
    creditsAppliedToOrder: count ?? 0,
  })
}

async function creditOnly(order: OrderRow): Promise<OrderMoneyColumns | { unresolvable: string }> {
  const applied = await sb.from('credits').select('id').eq('applied_to', order.id)
  if (applied.error) return { unresolvable: `credit read failed: ${applied.error.message}` }
  const at = Date.parse(order.created_at)
  const remainders = await sb.from('credits').select('id')
    .eq('customer_id', order.customer_id)
    .like('source', '%_split_remainder')
    .gte('created_at', new Date(at - HOUR_MS).toISOString())
    .lte('created_at', new Date(at + HOUR_MS).toISOString())
  if (remainders.error) return { unresolvable: `credit read failed: ${remainders.error.message}` }
  const splitRemainderNearby = (remainders.data ?? []).length > 0
  const creditUsed = splitRemainderNearby
    ? null
    : await loadCreditUsedFils(sb, { fullRowIds: (applied.data ?? []).map((r) => r.id as string), splitUseFils: null })
  const money = creditOnlyMoney({ creditUsedFils: creditUsed, splitRemainderNearby })
  if (money) return money
  return {
    unresolvable: splitRemainderNearby
      ? 'a split credit hides how much of it this order used'
      : 'the credit rows this order used could not be read',
  }
}

async function main() {
  const subs = await sb.from('subscriptions').select('id, plan_name, status').in('status', LIVE_STATUSES)
  if (subs.error) throw new Error(`plans read failed: ${subs.error.message}`)
  const plans = subs.data ?? []
  const orders = await sb.from('orders')
    .select('id, subscription_id, customer_id, payment_method, stripe_session_id, stripe_payment_id, amount_paid_fils, credit_applied_fils, created_at')
    .in('subscription_id', plans.length ? plans.map((p) => p.id) : [NO_ID])
  if (orders.error) throw new Error(`orders read failed: ${orders.error.message}`)
  const rows = (orders.data ?? []) as OrderRow[]

  const planned = rows.map((order) => ({
    order,
    plan: planOrderBackfill({
      paymentMethod: order.payment_method,
      stripeSessionId: order.stripe_session_id,
      stripePaymentId: order.stripe_payment_id,
      amountPaidFils: order.amount_paid_fils,
      creditAppliedFils: order.credit_applied_fils,
    }),
  }))

  let stripe: Stripe | null = null
  if (planned.some((p) => p.plan.kind === 'stripe_live')) {
    const liveKey = process.env.STRIPE_LIVE_SECRET_KEY
    if (!isLiveStripeKey(liveKey)) {
      console.error('Live-mode orders need a live Stripe key in STRIPE_LIVE_SECRET_KEY (process environment only). Nothing was changed.')
      process.exit(1)
    }
    process.env.STRIPE_SECRET_KEY = liveKey
    stripe = stripeClient()
  }

  const report: ReportRow[] = []
  let written = 0
  for (const { order, plan } of planned) {
    const owner = plans.find((p) => p.id === order.subscription_id)
    const base = { order: order.id.slice(0, 8), plan: owner?.plan_name ?? '?', status: owner?.status ?? '?' }
    if (plan.kind === 'skip' || plan.kind === 'unresolvable') {
      report.push({ ...base, result: plan.kind, detail: plan.reason })
      continue
    }
    const money = plan.kind === 'credit_only'
      ? await creditOnly(order)
      : await liveStripeMoney(stripe as Stripe, order, plan.sessionId, plan.paymentIntentId)
    if ('unresolvable' in money) {
      report.push({ ...base, result: 'unresolvable', detail: money.unresolvable })
      continue
    }
    if (WRITE) {
      const { error } = await sb.from('orders').update(money).eq('id', order.id).is('amount_paid_fils', null)
      if (error) {
        report.push({ ...base, result: 'write failed', detail: error.message })
        continue
      }
      written++
    }
    report.push({ ...base, result: WRITE ? 'written' : 'would write', detail: `card ${money.amount_paid_fils} fils, credit ${money.credit_applied_fils} fils` })
  }
  for (const p of plans) {
    if (!rows.some((o) => o.subscription_id === p.id)) {
      report.push({ order: null, plan: p.plan_name, status: p.status, result: 'no order', detail: 'not paid in cash: skip credit is 0' })
    }
  }

  console.log(JSON.stringify({ mode: WRITE ? 'write' : 'dry-run', stripeLookups: stripe ? 'live' : 'none', written, rows: report }, null, 2))
}

main().catch((err) => {
  // A Stripe failure is reduced to its type and code: its message can repeat part of the key.
  const fromStripe = typeof (err as { type?: unknown } | null)?.type === 'string'
  console.error(fromStripe ? stripeErrorSummary(err) : err instanceof Error ? err.message : String(err))
  process.exit(1)
})
```

Add to `package.json` `scripts`, after `check:delivered-drift`:

```json
    "backfill:order-money": "tsx --env-file=.env.local scripts/backfill-order-money.ts",
```

Run: `npx vitest run src/contexts/payments/order-money-wiring.test.ts`
Expected: PASS, 6 tests.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

- [ ] **Step 6: Dry run, then write**

Run: `npm run backfill:order-money`
Expected on the 2026-09-15 data: the run gets past the `.env.local` check (that file does not define `STRIPE_LIVE_SECRET_KEY`, so the guard does not trip on it), then `"mode": "dry-run"`, `"stripeLookups": "none"`, `"written": 0`, and three rows: the Active Monthly Premium's order `unresolvable` / `Stripe test mode: test payments are not money`; the Paused Monthly Premium's order `unresolvable` / `no Stripe session or payment id`; Staff Monthly `no order` / `not paid in cash: skip credit is 0`. No Stripe key is needed. If a row reads `would write` or needs a live key, show the dry-run output to the owner before writing, and run it with `STRIPE_LIVE_SECRET_KEY="$(netlify env:get STRIPE_SECRET_KEY --context production)"` in front. A Stripe failure then shows only as `Stripe read failed (type …, code …)`.

Run: `npm run backfill:order-money -- --write` (with the same key prefix if the dry run needed one).
Expected: the same rows, `"mode": "write"`, `written` equal to the dry run's `would write` count (0 today).

Then confirm with `execute_sql` (read-only):

```sql
select s.status, s.plan_name, o.amount_paid_fils, o.credit_applied_fils, o.price_per_meal, o.meals_count
from public.subscriptions s left join public.orders o on o.subscription_id = s.id
where s.status in ('Active','Paused','Skipped','Scheduled')
order by s.status;
```

Expected: every written order shows both columns; the two test-mode or id-less orders stay null (their skip credit is the 90% fallback: `floor(round(22 × 100) × 90 / 100)` = 1980 fils for the Active plan, 1620 for the Paused one).

- [ ] **Step 7: Commit**

```bash
git add src/contexts/payments/domain/order-money.ts src/contexts/payments/domain/order-money.test.ts scripts/backfill-order-money.ts src/contexts/payments/order-money-wiring.test.ts package.json
git commit -m "feat(payments): backfill what live plans' orders were paid, live-mode payments only

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Credited skip dates, and the ticks count credited skips (live SQL)

**Files:**
- Create: `supabase/migrations/20260915_season_credited_skip_ticks.sql`

**Interfaces:**
- Consumes: live `subscriptions.credited_skip_days` (Plan A), `public.ae_today()`, `public.is_delivery_day(date, text)`, `public.is_company_closure(date)`.
- Produces (live):
  - `subscriptions.credited_skip_dates date[] NOT NULL DEFAULT '{}'`, check `subscriptions_credited_skip_dates_match`: `cardinality(credited_skip_dates) = credited_skip_days`. Customers get no UPDATE on it (column grants).
  - `subscription_status_tick()` ends a plan when `delivered_meals + credited_skip_days × meals_per_day >= total_meals` and the end date has passed (spec G4, end condition only).
  - `subscription_delivery_tick()` caps at `total_meals − credited_skip_days × meals_per_day` (spec G1, cap only). No break or buffer guard: those are Plan C.

Why a dates column the spec does not list: a credited skip on a plan worth nothing in cash mints no credit row, so without it `season_unskip` cannot tell a credited date from a normal skip, and the menu, plan bar and mobile cells could not word a credited day without reading the ledger.

- [ ] **Step 1: Read the live ticks**

Run with `execute_sql` (project `yjjayivwfqjfppawgyaz`):

```sql
select pg_get_functiondef('public.subscription_status_tick'::regproc);
select pg_get_functiondef('public.subscription_delivery_tick'::regproc);
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'credited_skip_dates';
```

Expected: the status tick has five steps and step 5 reads `AND delivered_meals >= total_meals AND end_date < public.ae_today()`; the delivery tick returns early on `is_company_closure(CURRENT_DATE)`, sets `delivered_meals = LEAST(s.total_meals, COALESCE(s.delivered_meals, 0) + COALESCE(s.meals_per_day, 1))` and inserts into `comped_meal_ledger`; the column query returns zero rows. If either body differs from the file below apart from the lines marked `-- Plan B`, stop and report.

- [ ] **Step 2: Write the migration file**

`supabase/migrations/20260915_season_credited_skip_ticks.sql`:

```sql
-- ============================================================================
-- Season wind-down, plan B: credited skip dates, and the nightly ticks count
-- credited skips (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md
-- §7.2, §9 G1 cap and G4 end condition). Break and buffer guards are plan C.
--
-- Both tick bodies were copied from pg_get_functiondef on live before the
-- change; only the lines marked "Plan B" differ.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_credited_skip_ticks`. This file is the mirror.
-- ============================================================================

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS credited_skip_dates date[] NOT NULL DEFAULT '{}';

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_credited_skip_dates_match,
  ADD CONSTRAINT subscriptions_credited_skip_dates_match
    CHECK (cardinality(credited_skip_dates) = credited_skip_days);

COMMENT ON COLUMN public.subscriptions.credited_skip_dates IS
  'The skipped_dates whose meal became wallet credit instead of a make-up day (spec §7.2). Always credited_skip_days long.';

CREATE OR REPLACE FUNCTION public.subscription_status_tick()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- 1. Revert yesterday's Skipped → Active.
  UPDATE public.subscriptions
  SET status = 'Active'
  WHERE status = 'Skipped';

  -- 2. Promote subs whose start_date has arrived: Scheduled → Active.
  --    Staff renewals hold at the gate until the admin approves them.
  UPDATE public.subscriptions
  SET status = 'Active'
  WHERE status = 'Scheduled' AND start_date <= public.ae_today()
    AND (staff_approval IS DISTINCT FROM 'pending');

  -- 3. Promote pre-registered future skips: Active → Skipped when today
  --    is in skipped_dates.
  UPDATE public.subscriptions
  SET status = 'Skipped'
  WHERE status = 'Active'
    AND public.ae_today() = ANY(skipped_dates);

  -- 4. Activate planned pauses. When today AE matches planned_pause_start
  --    and the sub is Active or Skipped, flip to Paused. Skipped→Paused is
  --    allowed because Paused takes precedence operationally. pause_date
  --    is stamped so paused_days starts incrementing via pause_tick;
  --    resume_cutoff_date is set so a same-day resume gets the cutoff-aware
  --    messaging rather than the bare same-day lock; planned_pause_start
  --    is cleared since it's served its purpose.
  UPDATE public.subscriptions
  SET status = 'Paused',
      pause_date = NOW(),
      resume_cutoff_date = public.ae_today(),
      planned_pause_start = NULL
  WHERE status IN ('Active', 'Skipped')
    AND planned_pause_start = public.ae_today();

  -- 5. End completed cycles.
  --    Plan B: a credited skip paid its meal back as wallet credit, so it
  --    counts as done (spec G4).
  UPDATE public.subscriptions
  SET status = 'Ended'
  WHERE status IN ('Active', 'Paused')
    AND COALESCE(delivered_meals, 0) + COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1) >= total_meals  -- Plan B
    AND end_date < public.ae_today();
END;
$function$;

CREATE OR REPLACE FUNCTION public.subscription_delivery_tick()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  cogs_today numeric;
BEGIN
  IF public.is_company_closure(CURRENT_DATE) THEN
    RETURN;
  END IF;

  cogs_today := public.current_cogs_aed_per_meal();

  WITH delivered_today AS (
    UPDATE public.subscriptions s
       SET delivered_meals = LEAST(
             s.total_meals - COALESCE(s.credited_skip_days, 0) * COALESCE(s.meals_per_day, 1),  -- Plan B
             COALESCE(s.delivered_meals, 0) + COALESCE(s.meals_per_day, 1)
           ),
           last_delivery_tick_date = CURRENT_DATE
     WHERE s.status = 'Active'
       AND COALESCE(s.delivered_meals, 0) < s.total_meals - COALESCE(s.credited_skip_days, 0) * COALESCE(s.meals_per_day, 1)  -- Plan B
       AND public.is_delivery_day(CURRENT_DATE, s.week_type)
       AND (s.resume_cutoff_date IS NULL OR s.resume_cutoff_date::date < CURRENT_DATE)
       AND (s.last_delivery_tick_date IS NULL OR s.last_delivery_tick_date < CURRENT_DATE)
    RETURNING s.id AS subscription_id, s.customer_id, s.plan_name
  )
  INSERT INTO public.comped_meal_ledger (
    subscription_id, customer_id, plan_name, cogs_aed, expense_category, delivered_at
  )
  SELECT d.subscription_id,
         d.customer_id,
         d.plan_name,
         cogs_today,
         public.expense_category_for_plan(d.plan_name),
         now()
    FROM delivered_today d
   WHERE public.expense_category_for_plan(d.plan_name) IS NOT NULL;
END;
$function$;

COMMIT;
```

- [ ] **Step 3: Apply it live**

Use `apply_migration` with project `yjjayivwfqjfppawgyaz`, name `season_credited_skip_ticks`, and the file content without `BEGIN;` / `COMMIT;`.
Expected: success.

- [ ] **Step 4: Rehearse inside a transaction that rolls itself back**

Run with `execute_sql`. The block raises at the end on purpose; nothing it writes is kept.

```sql
DO $$
DECLARE
  v_today date := public.ae_today();
  s public.subscriptions;
  v_log text := '';
BEGIN
  SELECT * INTO s FROM public.subscriptions WHERE status = 'Active' ORDER BY end_date DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'REHEARSAL_SKIPPED: no Active plan to rehearse on'; END IF;

  BEGIN
    UPDATE public.subscriptions SET credited_skip_days = 1 WHERE id = s.id;
    RAISE EXCEPTION 'FAIL a credited count without its date was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_log := v_log || 'dates check ok; ';

  -- Every meal delivered or credited, end date passed: the plan ends.
  UPDATE public.subscriptions SET
    status = 'Active',
    delivered_meals = total_meals - COALESCE(meals_per_day, 1),
    credited_skip_days = 1,
    credited_skip_dates = ARRAY[v_today - 3],
    end_date = v_today - 1
  WHERE id = s.id;
  PERFORM public.subscription_status_tick();
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF s.status <> 'Ended' THEN RAISE EXCEPTION 'FAIL a plan with its last meal credited did not end: %', s.status; END IF;
  v_log := v_log || 'credited plan ends ok; ';

  -- One meal still owed: the plan stays live.
  UPDATE public.subscriptions SET status = 'Active', delivered_meals = total_meals - 2 * COALESCE(meals_per_day, 1) WHERE id = s.id;
  PERFORM public.subscription_status_tick();
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF s.status = 'Ended' THEN RAISE EXCEPTION 'FAIL a plan with a meal owed ended'; END IF;
  v_log := v_log || 'meal owed stays live ok; ';

  -- The delivery tick never delivers the credited meal.
  UPDATE public.subscriptions SET
    status = 'Active', end_date = v_today + 5,
    delivered_meals = total_meals - COALESCE(meals_per_day, 1),
    last_delivery_tick_date = NULL, resume_cutoff_date = NULL
  WHERE id = s.id;
  PERFORM public.subscription_delivery_tick();
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF s.delivered_meals <> s.total_meals - COALESCE(s.meals_per_day, 1) THEN
    RAISE EXCEPTION 'FAIL the delivery tick passed the credited cap: %', s.delivered_meals;
  END IF;
  v_log := v_log || 'cap holds ok; ';

  IF public.is_delivery_day(CURRENT_DATE, s.week_type) AND NOT public.is_company_closure(CURRENT_DATE) THEN
    UPDATE public.subscriptions SET delivered_meals = total_meals - 3 * COALESCE(meals_per_day, 1), last_delivery_tick_date = NULL WHERE id = s.id;
    PERFORM public.subscription_delivery_tick();
    SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
    IF s.delivered_meals <> s.total_meals - 2 * COALESCE(s.meals_per_day, 1) THEN
      RAISE EXCEPTION 'FAIL the delivery tick did not deliver below the cap: %', s.delivered_meals;
    END IF;
    v_log := v_log || 'delivers below cap ok; ';
  ELSE
    v_log := v_log || 'below-cap case needs a delivery day, not run; ';
  END IF;

  RAISE EXCEPTION 'CREDITED_TICKS_OK: %', v_log;
END;
$$;
```

Expected: an error whose message starts `CREDITED_TICKS_OK: dates check ok; credited plan ends ok; meal owed stays live ok; cap holds ok;` followed by either `delivers below cap ok;` or the not-run note. Any message starting `FAIL` is a real failure: fix, re-apply, re-run.

Then confirm the column and that customers cannot write it:

```sql
select data_type, is_nullable, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'credited_skip_dates';
select has_column_privilege('authenticated', 'public.subscriptions', 'credited_skip_dates', 'UPDATE') as customer_can_write;
select count(*) filter (where status in ('Active','Paused','Skipped','Scheduled')) as live_plans from public.subscriptions;
```

Expected: `ARRAY | NO | '{}'::date[]`; `customer_can_write = false`; `live_plans` unchanged (3 on 2026-09-14).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260915_season_credited_skip_ticks.sql
git commit -m "feat(season): plans with credited skips end on time and never cook a credited meal

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Season skip functions (live SQL)

**Files:**
- Create: `supabase/migrations/20260915_season_skip_functions.sql`

**Interfaces:**
- Consumes: Task 5 column; Tasks 3 and 4 order money (`orders.amount_paid_fils`, `credit_applied_fils`, backfilled before this runs); Plan A `public.season_close_day(date, integer)`, `intake_settings.season_phase / wrap_up_day / close_day / buffer_delivery_days`; the unique index `credits_one_season_skip_per_meal`.
- Produces (live, all `SECURITY DEFINER`, execute revoked from `public, anon, authenticated`):
  - `public.season_projected_end(p_end date, p_week_type text, p_today date, p_skipped date[]) returns date` (twin of `projectedEndDate`)
  - `public.season_make_up_day(p_end date, p_week_type text, p_today date, p_skipped date[]) returns date` (twin of `makeUpDayFor`)
  - `public.season_skip_credit_fils(p_subscription_id uuid) returns integer` (twin of `skipCreditFilsFor`; null = unknown)
  - `public.season_skip(p_customer_id uuid, p_subscription_id uuid, p_meal_date date, p_same_day boolean, p_outcome text, p_wrap_up date, p_close date, p_skip_cap integer, p_expected_credit_fils integer) returns jsonb` with keys `outcome` (`grant` | `credited`), `make_up_day`, and for credited `credit_fils`, `credit_status` (`approved` | `pending` | `none`), `credit_id`
  - `public.season_unskip(p_customer_id uuid, p_subscription_id uuid, p_meal_date date) returns jsonb` with key `kind` (`credited` | `normal`)
  - Refusal codes: `SEASON_SKIP_BAD_OUTCOME`, `SEASON_SKIP_CHANGED`, `SEASON_SKIP_NOT_FOUND`, `SEASON_SKIP_BAD_STATUS`, `SEASON_SKIP_ALREADY`, `SEASON_SKIP_NO_SKIPS_LEFT`, `SEASON_SKIP_NO_VALUE`, `SEASON_UNSKIP_TOO_LATE`, `SEASON_UNSKIP_NOT_SKIPPED`, `SEASON_UNSKIP_SETTLED`

- [ ] **Step 1: Confirm the starting point**

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in ('season_projected_end','season_make_up_day','season_skip_credit_fils','season_skip','season_unskip');
select indexdef from pg_indexes where schemaname = 'public' and indexname = 'credits_one_season_skip_per_meal';
select pg_get_constraintdef(oid) from pg_constraint where conname = 'credits_status_check';
```

Expected: no functions; the index is `UNIQUE ... (subscription_id, meal_date) WHERE (source = 'season_skip'::text)`; the status check allows `pending, approved, reserved, applied, rejected`. Stop and report on any difference.

- [ ] **Step 2: Write the migration file**

`supabase/migrations/20260915_season_skip_functions.sql`:

```sql
-- ============================================================================
-- Season wind-down, plan B: credited skips and buffer grants
-- (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md §7.2, §10.1).
--
-- The customer server actions decide the outcome in TypeScript
-- (src/contexts/season/domain/skip-outcome.ts) to word the sheet, then call
-- season_skip with the service role. season_skip recomputes the outcome and the
-- credit amount under a row lock and refuses when either differs, so a moved
-- wrap-up day or a stale tab can never mint credit the customer was not shown.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_skip_functions`. This file is the mirror.
-- ============================================================================

BEGIN;

-- The end date the plan will really have: subscription_closure_tick pushes it
-- one delivery day per closure from today to the end, except on a skipped day.
CREATE OR REPLACE FUNCTION public.season_projected_end(p_end date, p_week_type text, p_today date, p_skipped date[])
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owed integer;
  v_day  date := p_end;
  v_i    integer := 0;
BEGIN
  SELECT count(DISTINCT c.closure_date) INTO v_owed
  FROM public.company_closures c
  WHERE c.closure_date >= p_today
    AND c.closure_date <= p_end
    AND public.is_delivery_day(c.closure_date, p_week_type)
    AND NOT (c.closure_date = ANY(COALESCE(p_skipped, '{}'::date[])));
  WHILE v_owed > 0 AND v_i < 60 LOOP
    v_i := v_i + 1;
    v_day := v_day + 1;
    IF public.is_delivery_day(v_day, p_week_type) AND NOT public.is_company_closure(v_day) THEN
      v_owed := v_owed - 1;
    END IF;
  END LOOP;
  RETURN v_day;
END;
$$;

-- The delivery day one more skip would add.
CREATE OR REPLACE FUNCTION public.season_make_up_day(p_end date, p_week_type text, p_today date, p_skipped date[])
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := public.season_projected_end(p_end, p_week_type, p_today, p_skipped);
  v_i   integer := 0;
BEGIN
  LOOP
    v_day := v_day + 1;
    v_i := v_i + 1;
    EXIT WHEN (public.is_delivery_day(v_day, p_week_type) AND NOT public.is_company_closure(v_day)) OR v_i >= 60;
  END LOOP;
  RETURN v_day;
END;
$$;

-- Wallet credit for one skipped delivery day, in fils: what the customer paid
-- for that meal, (card charge + wallet credit used) ÷ meals in the order, × the
-- day's meals (spec D7). An order with no recorded money (Stripe test mode
-- during the pilot, or unresolvable) falls back to 90% of its list price.
-- 0 for plans not paid in cash (X5). NULL = nothing to go on.
CREATE OR REPLACE FUNCTION public.season_skip_credit_fils(p_subscription_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  o record;
  v_per_meal integer;
BEGIN
  SELECT plan_name, meals_per_day INTO s FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF s.plan_name ILIKE '%staff monthly%' OR s.plan_name ILIKE '%welcome meal%' THEN RETURN 0; END IF;

  SELECT amount_paid_fils, credit_applied_fils, meals_count, price_per_meal INTO o
  FROM public.orders WHERE subscription_id = p_subscription_id
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF COALESCE(o.meals_count, 0) <= 0 THEN RETURN NULL; END IF;

  IF o.amount_paid_fils IS NOT NULL AND o.credit_applied_fils IS NOT NULL THEN
    v_per_meal := floor((o.amount_paid_fils + o.credit_applied_fils)::numeric / o.meals_count);
  ELSIF o.price_per_meal IS NOT NULL AND o.price_per_meal > 0 THEN
    v_per_meal := floor(round(o.price_per_meal * 100) * 90 / 100.0);
  ELSE
    RETURN NULL;
  END IF;
  RETURN v_per_meal * GREATEST(1, COALESCE(s.meals_per_day, 1));
END;
$$;

CREATE OR REPLACE FUNCTION public.season_skip(
  p_customer_id uuid,
  p_subscription_id uuid,
  p_meal_date date,
  p_same_day boolean,
  p_outcome text,
  p_wrap_up date,
  p_close date,
  p_skip_cap integer,
  p_expected_credit_fils integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r           public.intake_settings;
  s           public.subscriptions;
  v_today     date := public.ae_today();
  v_close     date;
  v_make_up   date;
  v_outcome   text;
  v_credit    integer;
  v_status    text;
  v_credit_id uuid;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('grant', 'credited') THEN
    RAISE EXCEPTION 'SEASON_SKIP_BAD_OUTCOME: %', p_outcome;
  END IF;

  SELECT * INTO r FROM public.intake_settings FOR SHARE;
  IF NOT FOUND OR r.season_phase <> 'winding_down' OR r.wrap_up_day IS NULL
     OR r.wrap_up_day IS DISTINCT FROM p_wrap_up OR r.close_day IS DISTINCT FROM p_close THEN
    RAISE EXCEPTION 'SEASON_SKIP_CHANGED: the season moved';
  END IF;

  SELECT * INTO s FROM public.subscriptions
  WHERE id = p_subscription_id AND customer_id = p_customer_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_SKIP_NOT_FOUND'; END IF;

  IF p_same_day THEN
    IF p_meal_date <> v_today OR s.status <> 'Active' THEN
      RAISE EXCEPTION 'SEASON_SKIP_BAD_STATUS: % on %', s.status, p_meal_date;
    END IF;
  ELSIF p_meal_date <= v_today OR s.status NOT IN ('Active', 'Skipped') THEN
    RAISE EXCEPTION 'SEASON_SKIP_BAD_STATUS: % on %', s.status, p_meal_date;
  END IF;
  IF p_meal_date = ANY(COALESCE(s.skipped_dates, '{}'::date[])) THEN
    RAISE EXCEPTION 'SEASON_SKIP_ALREADY';
  END IF;
  IF s.skipped_meals_count + s.credited_skip_days >= p_skip_cap THEN
    RAISE EXCEPTION 'SEASON_SKIP_NO_SKIPS_LEFT';
  END IF;

  v_close := GREATEST(r.close_day, r.wrap_up_day);
  v_make_up := public.season_make_up_day(s.end_date, s.week_type, v_today, s.skipped_dates);
  v_outcome := CASE
    WHEN v_make_up <= r.wrap_up_day THEN 'normal'
    WHEN v_make_up <= v_close AND s.season_buffer_grants < r.buffer_delivery_days THEN 'grant'
    ELSE 'credited'
  END;
  IF v_outcome <> p_outcome THEN
    RAISE EXCEPTION 'SEASON_SKIP_CHANGED: expected %, found %', p_outcome, v_outcome;
  END IF;

  IF v_outcome = 'grant' THEN
    UPDATE public.subscriptions SET
      skipped_meals_count  = s.skipped_meals_count + 1,
      skipped_dates        = ARRAY(SELECT DISTINCT t.d FROM unnest(COALESCE(s.skipped_dates, '{}'::date[]) || p_meal_date) AS t(d) ORDER BY t.d),
      season_buffer_grants = s.season_buffer_grants + 1,
      status               = CASE WHEN p_same_day THEN 'Skipped' ELSE s.status END,
      last_skipped_date    = CASE WHEN p_same_day THEN now() ELSE s.last_skipped_date END
    WHERE id = s.id;
    RETURN jsonb_build_object('outcome', 'grant', 'make_up_day', v_make_up);
  END IF;

  v_credit := public.season_skip_credit_fils(s.id);
  IF v_credit IS NULL THEN RAISE EXCEPTION 'SEASON_SKIP_NO_VALUE'; END IF;
  IF v_credit IS DISTINCT FROM p_expected_credit_fils THEN
    RAISE EXCEPTION 'SEASON_SKIP_CHANGED: credit % expected %', v_credit, p_expected_credit_fils;
  END IF;

  UPDATE public.subscriptions SET
    skipped_dates       = ARRAY(SELECT DISTINCT t.d FROM unnest(COALESCE(s.skipped_dates, '{}'::date[]) || p_meal_date) AS t(d) ORDER BY t.d),
    credited_skip_days  = s.credited_skip_days + 1,
    credited_skip_dates = ARRAY(SELECT DISTINCT t.d FROM unnest(s.credited_skip_dates || p_meal_date) AS t(d) ORDER BY t.d),
    status              = CASE WHEN p_same_day THEN 'Skipped' ELSE s.status END,
    last_skipped_date   = CASE WHEN p_same_day THEN now() ELSE s.last_skipped_date END
  WHERE id = s.id;

  -- Same-day skips cannot be undone, so their credit is usable at once.
  v_status := CASE WHEN p_same_day THEN 'approved' ELSE 'pending' END;
  IF v_credit > 0 THEN
    INSERT INTO public.credits (customer_id, amount_aed, source, status, eligible_plan_ids, subscription_id, meal_date)
    VALUES (s.customer_id, v_credit / 100.0, 'season_skip', v_status, NULL, s.id, p_meal_date)
    ON CONFLICT (subscription_id, meal_date) WHERE source = 'season_skip'
    DO UPDATE SET status = EXCLUDED.status, amount_aed = EXCLUDED.amount_aed, created_at = now()
      WHERE public.credits.status = 'rejected'
    RETURNING id INTO v_credit_id;
    IF v_credit_id IS NULL THEN RAISE EXCEPTION 'SEASON_SKIP_ALREADY: credit exists'; END IF;
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'credited',
    'make_up_day', v_make_up,
    'credit_fils', v_credit,
    'credit_status', CASE WHEN v_credit > 0 THEN v_status ELSE 'none' END,
    'credit_id', v_credit_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.season_unskip(p_customer_id uuid, p_subscription_id uuid, p_meal_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s            public.subscriptions;
  r            public.intake_settings;
  c            public.credits;
  v_has_credit boolean;
  v_today      date := public.ae_today();
  v_dates      date[];
  v_new_end    date;
  v_needed     integer;
BEGIN
  SELECT * INTO s FROM public.subscriptions
  WHERE id = p_subscription_id AND customer_id = p_customer_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_SKIP_NOT_FOUND'; END IF;
  IF s.status NOT IN ('Active', 'Skipped') THEN RAISE EXCEPTION 'SEASON_SKIP_BAD_STATUS: %', s.status; END IF;
  IF p_meal_date <= v_today THEN RAISE EXCEPTION 'SEASON_UNSKIP_TOO_LATE'; END IF;
  IF NOT (p_meal_date = ANY(COALESCE(s.skipped_dates, '{}'::date[]))) THEN RAISE EXCEPTION 'SEASON_UNSKIP_NOT_SKIPPED'; END IF;
  v_dates := array_remove(s.skipped_dates, p_meal_date);

  IF p_meal_date = ANY(s.credited_skip_dates) THEN
    SELECT * INTO c FROM public.credits
    WHERE subscription_id = s.id AND meal_date = p_meal_date AND source = 'season_skip'
    FOR UPDATE;
    v_has_credit := FOUND;
    IF v_has_credit AND c.status <> 'pending' THEN
      RAISE EXCEPTION 'SEASON_UNSKIP_SETTLED: credit is %', c.status;
    END IF;
    UPDATE public.subscriptions SET
      skipped_dates       = v_dates,
      credited_skip_days  = s.credited_skip_days - 1,
      credited_skip_dates = array_remove(s.credited_skip_dates, p_meal_date)
    WHERE id = s.id;
    IF v_has_credit THEN
      UPDATE public.credits SET status = 'rejected' WHERE id = c.id;
    END IF;
    RETURN jsonb_build_object('kind', 'credited');
  END IF;

  UPDATE public.subscriptions SET
    skipped_dates       = v_dates,
    skipped_meals_count = GREATEST(0, s.skipped_meals_count - 1)
  WHERE id = s.id
  RETURNING end_date INTO v_new_end;

  -- A grant only stays while a make-up meal still lands on a buffer day.
  SELECT * INTO r FROM public.intake_settings;
  IF s.season_buffer_grants > 0 AND r.wrap_up_day IS NOT NULL THEN
    SELECT count(*) INTO v_needed
    FROM generate_series(
      r.wrap_up_day + 1,
      LEAST(public.season_projected_end(v_new_end, s.week_type, v_today, v_dates), GREATEST(r.close_day, r.wrap_up_day)),
      interval '1 day'
    ) AS g(d)
    WHERE public.is_delivery_day(g.d::date, s.week_type)
      AND NOT public.is_company_closure(g.d::date)
      AND NOT (g.d::date = ANY(v_dates));
    UPDATE public.subscriptions SET season_buffer_grants = LEAST(s.season_buffer_grants, v_needed) WHERE id = s.id;
  END IF;

  RETURN jsonb_build_object('kind', 'normal', 'end_date', v_new_end);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_projected_end(date, text, date, date[]) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_make_up_day(date, text, date, date[]) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_skip_credit_fils(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_skip(uuid, uuid, date, boolean, text, date, date, integer, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_unskip(uuid, uuid, date) FROM public, anon, authenticated;

COMMIT;
```

- [ ] **Step 3: Apply it live**

Use `apply_migration`, name `season_skip_functions`, file content without `BEGIN;` / `COMMIT;`.
Expected: success.

- [ ] **Step 4: Rehearse every path inside a transaction that rolls itself back**

```sql
DO $$
DECLARE
  v_today date := public.ae_today();
  s public.subscriptions;
  v_w date; v_k date; v_d1 date; v_d2 date; v_d3 date;
  v_end date;
  v_fils integer;
  v_res jsonb;
  v_credit_id uuid;
  v_order record;
  v_expect integer;
  v_log text := '';
BEGIN
  SELECT sub.* INTO s FROM public.subscriptions sub
  WHERE sub.status = 'Active' AND sub.plan_name ILIKE '%monthly%' AND sub.plan_name NOT ILIKE '%staff%'
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.subscription_id = sub.id)
  ORDER BY sub.end_date DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'REHEARSAL_SKIPPED: no paid Active monthly plan'; END IF;

  SELECT min(g::date) INTO v_d1 FROM generate_series(v_today + 1, s.end_date - 1, interval '1 day') g
  WHERE public.is_delivery_day(g::date, s.week_type) AND NOT public.is_company_closure(g::date);
  SELECT min(g::date) INTO v_d2 FROM generate_series(v_d1 + 1, s.end_date - 1, interval '1 day') g
  WHERE public.is_delivery_day(g::date, s.week_type) AND NOT public.is_company_closure(g::date);
  SELECT min(g::date) INTO v_d3 FROM generate_series(v_d2 + 1, s.end_date - 1, interval '1 day') g
  WHERE public.is_delivery_day(g::date, s.week_type) AND NOT public.is_company_closure(g::date);
  IF v_d3 IS NULL THEN RAISE EXCEPTION 'REHEARSAL_SKIPPED: fewer than three delivery days before %', s.end_date; END IF;

  UPDATE public.subscriptions SET skipped_meals_count = 0, skipped_dates = '{}', credited_skip_days = 0,
    credited_skip_dates = '{}', season_buffer_grants = 0
  WHERE id = s.id RETURNING * INTO s;

  v_w := s.end_date;
  v_k := public.season_close_day(v_w, 1);
  IF public.season_make_up_day(s.end_date, s.week_type, v_today, s.skipped_dates) > v_k THEN
    RAISE EXCEPTION 'REHEARSAL_SKIPPED: this plan cannot use a buffer day ending %', s.end_date;
  END IF;
  UPDATE public.intake_settings SET season_phase = 'winding_down', wrap_up_day = v_w, close_day = v_k,
    buffer_delivery_days = 1, pause_scheduled_for = v_w;

  -- The credit is what the order paid for one meal (spec D7), or 90% of list
  -- price when the order recorded no money. Checked against the order row.
  SELECT id, amount_paid_fils, credit_applied_fils, meals_count, price_per_meal INTO v_order
  FROM public.orders WHERE subscription_id = s.id ORDER BY created_at DESC LIMIT 1;
  v_expect := CASE
    WHEN v_order.amount_paid_fils IS NOT NULL AND v_order.credit_applied_fils IS NOT NULL
      THEN floor((v_order.amount_paid_fils + v_order.credit_applied_fils)::numeric / v_order.meals_count)
    ELSE floor(round(v_order.price_per_meal * 100) * 90 / 100.0)
  END * GREATEST(1, COALESCE(s.meals_per_day, 1));
  v_fils := public.season_skip_credit_fils(s.id);
  IF v_fils IS NULL OR v_fils = 0 THEN RAISE EXCEPTION 'REHEARSAL_SKIPPED: no meal value for this plan'; END IF;
  IF v_fils <> v_expect THEN RAISE EXCEPTION 'FAIL credit fils % but the order says %', v_fils, v_expect; END IF;
  v_log := v_log || 'credit fils ' || v_fils
    || CASE WHEN v_order.amount_paid_fils IS NOT NULL AND v_order.credit_applied_fils IS NOT NULL THEN ' (paid)' ELSE ' (fallback)' END || '; ';

  -- The paid path on the same order: AED 400 card + AED 40 wallet over 20 meals is AED 22 a meal.
  UPDATE public.orders SET amount_paid_fils = 40000, credit_applied_fils = 4000, meals_count = 20 WHERE id = v_order.id;
  IF public.season_skip_credit_fils(s.id) <> 2200 * GREATEST(1, COALESCE(s.meals_per_day, 1)) THEN
    RAISE EXCEPTION 'FAIL the paid path gave %', public.season_skip_credit_fils(s.id);
  END IF;
  UPDATE public.orders SET amount_paid_fils = v_order.amount_paid_fils, credit_applied_fils = v_order.credit_applied_fils,
    meals_count = v_order.meals_count WHERE id = v_order.id;
  v_log := v_log || 'paid path ok; ';

  -- Grant: the make-up day lands on the buffer day.
  v_res := public.season_skip(s.customer_id, s.id, v_d1, false, 'grant', v_w, v_k, 3, NULL);
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF v_res->>'outcome' <> 'grant' OR s.skipped_meals_count <> 1 OR s.season_buffer_grants <> 1
     OR NOT (v_d1 = ANY(s.skipped_dates)) OR s.end_date <= v_w THEN
    RAISE EXCEPTION 'FAIL grant % %', v_res, row_to_json(s);
  END IF;
  v_end := s.end_date;
  v_log := v_log || 'grant ok; ';

  -- Credited: no buffer grant left.
  v_res := public.season_skip(s.customer_id, s.id, v_d2, false, 'credited', v_w, v_k, 3, v_fils);
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF v_res->>'credit_status' <> 'pending' OR s.credited_skip_days <> 1 OR s.skipped_meals_count <> 1
     OR s.end_date <> v_end OR NOT (v_d2 = ANY(s.credited_skip_dates)) OR NOT (v_d2 = ANY(s.skipped_dates)) THEN
    RAISE EXCEPTION 'FAIL credited % %', v_res, row_to_json(s);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credits WHERE subscription_id = s.id AND meal_date = v_d2 AND source = 'season_skip'
                 AND status = 'pending' AND round(amount_aed * 100) = v_fils AND eligible_plan_ids IS NULL) THEN
    RAISE EXCEPTION 'FAIL credit row missing or wrong';
  END IF;
  v_credit_id := (v_res->>'credit_id')::uuid;
  v_log := v_log || 'credited ok; ';

  BEGIN
    PERFORM public.season_skip(s.customer_id, s.id, v_d3, false, 'grant', v_w, v_k, 3, NULL);
    RAISE EXCEPTION 'FAIL a stale grant was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SEASON_SKIP_CHANGED%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'stale outcome refused ok; ';

  BEGIN
    PERFORM public.season_skip(s.customer_id, s.id, v_d3, false, 'credited', v_w - 1, v_k, 3, v_fils);
    RAISE EXCEPTION 'FAIL a moved season was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SEASON_SKIP_CHANGED%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'moved season refused ok; ';

  BEGIN
    PERFORM public.season_skip(s.customer_id, s.id, v_d3, false, 'credited', v_w, v_k, 3, v_fils + 1);
    RAISE EXCEPTION 'FAIL a different amount was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SEASON_SKIP_CHANGED%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'amount refused ok; ';

  BEGIN
    PERFORM public.season_skip(s.customer_id, s.id, v_d3, false, 'credited', v_w, v_k, 2, v_fils);
    RAISE EXCEPTION 'FAIL a skip past the allowance was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SEASON_SKIP_NO_SKIPS_LEFT%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'allowance refused ok; ';

  BEGIN
    PERFORM public.season_skip(s.customer_id, s.id, v_d2, false, 'credited', v_w, v_k, 3, v_fils);
    RAISE EXCEPTION 'FAIL a second skip of the same day was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SEASON_SKIP_ALREADY%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'same day refused ok; ';

  BEGIN
    PERFORM public.season_skip(gen_random_uuid(), s.id, v_d3, false, 'credited', v_w, v_k, 3, v_fils);
    RAISE EXCEPTION 'FAIL a stranger skipped this plan';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SEASON_SKIP_NOT_FOUND%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'stranger refused ok; ';

  -- Undo the credited skip: the day is delivered again and the credit is rejected.
  v_res := public.season_unskip(s.customer_id, s.id, v_d2);
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF v_res->>'kind' <> 'credited' OR s.credited_skip_days <> 0 OR v_d2 = ANY(s.skipped_dates)
     OR (SELECT status FROM public.credits WHERE id = v_credit_id) <> 'rejected' THEN
    RAISE EXCEPTION 'FAIL credited undo % %', v_res, row_to_json(s);
  END IF;
  v_log := v_log || 'credited undo ok; ';

  -- Skip the same day again: the rejected credit comes back as pending.
  v_res := public.season_skip(s.customer_id, s.id, v_d2, false, 'credited', v_w, v_k, 3, v_fils);
  IF (v_res->>'credit_id')::uuid <> v_credit_id
     OR (SELECT status FROM public.credits WHERE id = v_credit_id) <> 'pending' THEN
    RAISE EXCEPTION 'FAIL re-skip %', v_res;
  END IF;
  v_log := v_log || 're-skip ok; ';

  -- Undo the granted skip: the end date comes back and the grant goes with it.
  v_res := public.season_unskip(s.customer_id, s.id, v_d1);
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF v_res->>'kind' <> 'normal' OR s.skipped_meals_count <> 0 OR s.season_buffer_grants <> 0 OR s.end_date <> v_w THEN
    RAISE EXCEPTION 'FAIL grant undo % %', v_res, row_to_json(s);
  END IF;
  v_log := v_log || 'grant undo ok; ';

  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE plan_name ILIKE '%staff monthly%') THEN
    IF (SELECT public.season_skip_credit_fils(id) FROM public.subscriptions WHERE plan_name ILIKE '%staff monthly%' LIMIT 1) <> 0 THEN
      RAISE EXCEPTION 'FAIL a staff plan has a meal value';
    END IF;
    v_log := v_log || 'staff plan worth 0 ok; ';
  END IF;

  -- A closure still to come pushes the projected end one delivery day.
  INSERT INTO public.company_closures (id, closure_date, reason, created_by)
  VALUES (gen_random_uuid(), v_d3, 'plan B rehearsal', 'plan-b-rehearsal');
  IF public.season_projected_end(s.end_date, s.week_type, v_today, s.skipped_dates) <> (
    SELECT min(g::date) FROM generate_series(s.end_date + 1, s.end_date + 10, interval '1 day') g
    WHERE public.is_delivery_day(g::date, s.week_type) AND NOT public.is_company_closure(g::date)
  ) THEN
    RAISE EXCEPTION 'FAIL closure walk';
  END IF;
  v_log := v_log || 'closure walk ok; ';

  RAISE EXCEPTION 'SEASON_SKIP_OK: %', v_log;
END;
$$;
```

Expected: an error whose message starts `SEASON_SKIP_OK: credit fils 1980 (fallback); paid path ok; grant ok; credited ok; stale outcome refused ok; moved season refused ok; amount refused ok; allowance refused ok; same day refused ok; stranger refused ok; credited undo ok; re-skip ok; grant undo ok; staff plan worth 0 ok; closure walk ok;`. The first figure is read from the live order after Task 4's backfill and checked against that row inside the block: on 2026-09-15 the Active Monthly Premium's order is Stripe test mode, stays unresolved, and credits the fallback `floor(round(22 × 100) × 90 / 100)` = 1980, which must equal `skipCreditFilsFor` in Task 1 for the same order. Once a live-mode order is backfilled the message reads `(paid)` with its own figure. `paid path ok` proves the paid formula on the same row whatever the live data holds.

Then confirm customers cannot call the functions:

```sql
select has_function_privilege('authenticated', 'public.season_skip(uuid,uuid,date,boolean,text,date,date,integer,integer)', 'EXECUTE') as customer_skip,
       has_function_privilege('anon', 'public.season_unskip(uuid,uuid,date)', 'EXECUTE') as anon_unskip,
       has_function_privilege('service_role', 'public.season_skip(uuid,uuid,date,boolean,text,date,date,integer,integer)', 'EXECUTE') as service_skip;
```

Expected: `false | false | true`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260915_season_skip_functions.sql
git commit -m "feat(season): SQL writes credited skips and buffer grants, and checks the season and amount first

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Release pending skip credit nightly (live SQL, cron, registry)

**Files:**
- Create: `supabase/migrations/20260915_season_skip_credit_tick.sql`
- Modify: `src/app/admin/_components/cron-registry.ts`

**Interfaces:**
- Consumes: Task 5 `credited_skip_dates`; Task 6 credit rows.
- Produces (live): `public.season_skip_credit_tick() returns integer` (credits released); cron job `season_skip_credit_tick` at `40 20 * * *` (00:40 AE); `JOB_INFO.season_skip_credit_tick`.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/20260915_season_skip_credit_tick.sql`:

```sql
-- ============================================================================
-- Season wind-down, plan B: pending season-skip credit becomes usable once its
-- meal date has passed (spec §7.2 "Approval"). 00:40 AE, after the 00:30 status
-- tick. Only a date still listed in the plan's credited_skip_dates is released,
-- so an undone or orphaned credit can never slip into a wallet.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_skip_credit_tick`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.season_skip_credit_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.credits c
  SET status = 'approved'
  FROM public.subscriptions s
  WHERE c.source = 'season_skip'
    AND c.status = 'pending'
    AND c.meal_date < public.ae_today()
    AND s.id = c.subscription_id
    AND c.meal_date = ANY(s.credited_skip_dates);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_skip_credit_tick() FROM public, anon, authenticated;

SELECT cron.schedule('season_skip_credit_tick', '40 20 * * *', 'SELECT public.season_skip_credit_tick();');

COMMIT;
```

- [ ] **Step 2: Apply it live**

Use `apply_migration`, name `season_skip_credit_tick`, file content without `BEGIN;` / `COMMIT;`.
Expected: success.

- [ ] **Step 3: Rehearse inside a transaction that rolls itself back**

```sql
DO $$
DECLARE
  v_today date := public.ae_today();
  s public.subscriptions;
  v_due uuid; v_early uuid; v_orphan uuid;
  v_n integer;
BEGIN
  SELECT * INTO s FROM public.subscriptions WHERE status = 'Active' ORDER BY end_date DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'REHEARSAL_SKIPPED: no Active plan'; END IF;

  UPDATE public.subscriptions SET
    credited_skip_days = 2,
    credited_skip_dates = ARRAY[v_today - 1, v_today + 2],
    skipped_dates = ARRAY(SELECT DISTINCT t.d FROM unnest(COALESCE(skipped_dates, '{}'::date[]) || ARRAY[v_today - 1, v_today + 2]) AS t(d) ORDER BY t.d)
  WHERE id = s.id;
  INSERT INTO public.credits (customer_id, amount_aed, source, status, subscription_id, meal_date)
  VALUES (s.customer_id, 19.80, 'season_skip', 'pending', s.id, v_today - 1) RETURNING id INTO v_due;
  INSERT INTO public.credits (customer_id, amount_aed, source, status, subscription_id, meal_date)
  VALUES (s.customer_id, 19.80, 'season_skip', 'pending', s.id, v_today + 2) RETURNING id INTO v_early;
  INSERT INTO public.credits (customer_id, amount_aed, source, status, subscription_id, meal_date)
  VALUES (s.customer_id, 19.80, 'season_skip', 'pending', s.id, v_today - 2) RETURNING id INTO v_orphan;

  v_n := public.season_skip_credit_tick();

  IF (SELECT status FROM public.credits WHERE id = v_due) <> 'approved' THEN RAISE EXCEPTION 'FAIL a passed meal date stayed pending'; END IF;
  IF (SELECT status FROM public.credits WHERE id = v_early) <> 'pending' THEN RAISE EXCEPTION 'FAIL a future meal date was released'; END IF;
  IF (SELECT status FROM public.credits WHERE id = v_orphan) <> 'pending' THEN RAISE EXCEPTION 'FAIL a date not credited on the plan was released'; END IF;
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL the tick reported % released', v_n; END IF;

  RAISE EXCEPTION 'SKIP_CREDIT_TICK_OK: released %', v_n;
END;
$$;
```

Expected: an error `SKIP_CREDIT_TICK_OK: released 1` (a larger number only if live already holds due season-skip credit, which it does not on 2026-09-14).

Then:

```sql
select jobname, schedule, command, active from cron.job where jobname = 'season_skip_credit_tick';
select count(*) from public.credits where source = 'season_skip';
```

Expected: one active row `40 20 * * *`, `SELECT public.season_skip_credit_tick();`; count 0 (the rehearsal rolled back).

- [ ] **Step 4: Register the job**

In `src/app/admin/_components/cron-registry.ts`, add inside `JOB_INFO` directly after the `dispatch_customer_notifications_tick` entry (the customer messages and money group):

```ts
    season_skip_credit_tick: {
        label: 'Skipped meal credit release (nightly)',
        does: 'Moves credit from a skip near the season end into the wallet once the skipped day has passed.',
        impact: 'Customers who skipped a meal near the season end are not getting their credit',
        group: 'customer',
    },
```

Run: `npx tsc --noEmit -p .` and `npx vitest run src/app/admin`
Expected: no type errors; tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260915_season_skip_credit_tick.sql src/app/admin/_components/cron-registry.ts
git commit -m "feat(season): credit from a future season skip lands in the wallet the night after the meal

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Reconcile skips when the wrap-up day is set or moved

**Files:**
- Create: `supabase/migrations/20260915_season_reconcile_skips.sql`
- Create: `src/contexts/season/domain/season-skip-receipt.ts`
- Test: `src/contexts/season/domain/season-skip-receipt.test.ts`
- Create: `src/contexts/season/usecases/season-skip-notices.ts`
- Modify: `src/contexts/season/usecases/season-transitions.ts`
- Test: `src/contexts/season/usecases/season-transitions.test.ts`

**Interfaces:**
- Consumes: Task 6 `season_projected_end`, `season_skip_credit_fils`; Plan A `season_schedule_end`, `season_move_end`, `_season_state`, `runSeasonTransition`.
- Produces:
  - Live `public.season_reconcile_skips(p_wrap_up date, p_close date, p_buffer integer) returns jsonb` (array of `{ subscription_id, customer_id, meal_dates, credit_fils, skipped_no_value }`)
  - `season_schedule_end` and `season_move_end` return `_season_state(r) || { reconciled: <array> }`
  - `interface SeasonSkipReceipt { subscriptionId: string; customerId: string; mealDates: string[]; creditFils: number; source: 'customer_skip' | 'reconciled' }`
  - `receiptsFromTransition(state: unknown): SeasonSkipReceipt[]`
  - `announceSeasonSkipCredited(receipts: readonly SeasonSkipReceipt[]): Promise<void>` (the Plan E hook)

Rule (spec §7.2 reconciliation, X6): for every Active or Skipped plan with no planned pause on or before W, count the plan's delivery days after W up to its projected end. Grants stay only while a delivery day on a buffer day needs them (never more than the buffer). Every other delivery day after W that a skip created is converted, latest skip dates first: `skipped_meals_count − n`, `credited_skip_days + n`, the dates join `credited_skip_dates`, and each date mints season-skip credit (approved for a past or same-day date, pending for a future one). Credits never turn back. A plan whose meal value is unknown keeps its skips and is reported with `skipped_no_value`. "End the season today" is not reconciled in this plan: spec §5 and §17.1 P3 reconcile skips on it too, and that lands in Plan C together with the action itself, which Plan A keeps hidden until the break is live (After Plan B, item 3).

- [ ] **Step 1: Read the live transitions**

```sql
select pg_get_functiondef('public.season_schedule_end'::regproc);
select pg_get_functiondef('public.season_move_end'::regproc);
```

Compare each body with the Plan A mirror `supabase/migrations/20260914_season_transitions.sql` after normalising the formatting `pg_get_functiondef` changes: collapse every run of whitespace (line breaks included) to one space, and read `SET search_path TO 'public'` as `SET search_path = public` and `$function$` as `$$`. Expected: identical after normalising (checked 2026-09-15). Only a difference in logic (a guard, a column, a value or a statement) stops the task; report it. The Step 6 bodies below are the live text with the `-- Plan B` lines added.

- [ ] **Step 2: Write the failing TypeScript tests**

`src/contexts/season/domain/season-skip-receipt.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { receiptsFromTransition } from './season-skip-receipt'

describe('receiptsFromTransition', () => {
  it('reads the reconciled skips from a transition result', () => {
    const state = {
      phase: 'winding_down',
      reconciled: [
        { subscription_id: 's1', customer_id: 'c1', meal_dates: ['2026-09-11', '2026-09-16'], credit_fils: 1980, skipped_no_value: 0 },
      ],
    }
    expect(receiptsFromTransition(state)).toEqual([
      { subscriptionId: 's1', customerId: 'c1', mealDates: ['2026-09-11', '2026-09-16'], creditFils: 1980, source: 'reconciled' },
    ])
  })

  it('drops plans whose skips could not be valued', () => {
    const state = { reconciled: [{ subscription_id: 's2', customer_id: 'c2', meal_dates: [], credit_fils: null, skipped_no_value: 2 }] }
    expect(receiptsFromTransition(state)).toEqual([])
  })

  it('returns nothing for a transition without reconciliation', () => {
    expect(receiptsFromTransition({ phase: 'open' })).toEqual([])
    expect(receiptsFromTransition(null)).toEqual([])
  })
})
```

In `src/contexts/season/usecases/season-transitions.test.ts`:
- Add `announceMock: vi.fn(),` inside the `vi.hoisted(() => ({ ... }))` object and `announceMock` to its destructuring.
- Add `vi.mock('./season-skip-notices', () => ({ announceSeasonSkipCredited: announceMock }))` below the other `vi.mock` lines.
- Add `announceMock.mockReset()` in `beforeEach`.
- Append inside `describe('season transitions', ...)`:

```ts
  it('hands skips turned into credit to the notice hook', async () => {
    rpcMock.mockResolvedValue({
      data: { phase: 'winding_down', reconciled: [{ subscription_id: 's1', customer_id: 'c1', meal_dates: ['2026-09-16'], credit_fils: 1980, skipped_no_value: 0 }] },
      error: null,
    })
    expect(await scheduleSeasonEnd(ADMIN, '2026-10-03', 1)).toEqual({ ok: true })
    expect(announceMock).toHaveBeenCalledWith([
      { subscriptionId: 's1', customerId: 'c1', mealDates: ['2026-09-16'], creditFils: 1980, source: 'reconciled' },
    ])
  })

  it('does not call the hook when nothing was reconciled', async () => {
    rpcMock.mockResolvedValue({ data: { phase: 'winding_down', reconciled: [] }, error: null })
    await moveSeasonEnd(ADMIN, '2026-10-05', 0)
    expect(announceMock).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/season/domain/season-skip-receipt.test.ts src/contexts/season/usecases/season-transitions.test.ts`
Expected: FAIL. `./season-skip-receipt` and `./season-skip-notices` cannot be resolved.

- [ ] **Step 4: Write the TypeScript implementation**

`src/contexts/season/domain/season-skip-receipt.ts`:

```ts
/**
 * What a credited skip leaves behind for messaging (spec §7.2, N6).
 * Pure: shared by the customer skip actions and the admin transitions.
 */

export interface SeasonSkipReceipt {
  subscriptionId: string
  customerId: string
  mealDates: string[]
  /** Credit per skipped day in fils; 0 for plans not paid in cash. */
  creditFils: number
  source: 'customer_skip' | 'reconciled'
}

/** Receipts from a season_schedule_end / season_move_end result. */
export function receiptsFromTransition(state: unknown): SeasonSkipReceipt[] {
  const list = (state as { reconciled?: unknown } | null)?.reconciled
  if (!Array.isArray(list)) return []
  const out: SeasonSkipReceipt[] = []
  for (const item of list) {
    const row = item as { subscription_id?: unknown; customer_id?: unknown; meal_dates?: unknown; credit_fils?: unknown }
    if (typeof row.subscription_id !== 'string' || typeof row.customer_id !== 'string') continue
    if (!Array.isArray(row.meal_dates) || row.meal_dates.length === 0 || typeof row.credit_fils !== 'number') continue
    out.push({
      subscriptionId: row.subscription_id,
      customerId: row.customer_id,
      mealDates: row.meal_dates.map(String),
      creditFils: row.credit_fils,
      source: 'reconciled',
    })
  }
  return out
}
```

`src/contexts/season/usecases/season-skip-notices.ts`:

```ts
import 'server-only'

/**
 * The one place a credited skip is announced (spec §7.2 "Messages", N6).
 *
 * Plan E wires the WhatsApp template `season_skip_credited` (first_name,
 * wrap_up_day, credit_aed) here, behind its fail-closed env flag. Until that
 * template is approved at Meta, the customer hears about the credit in the app
 * only: the skip sheet before, the toast after, the wallet row. Never queue
 * meal_skipped_confirm / meal_skip_scheduled_confirm for these: both promise a
 * make-up meal that is not coming.
 */

import type { SeasonSkipReceipt } from '../domain/season-skip-receipt'

export async function announceSeasonSkipCredited(receipts: readonly SeasonSkipReceipt[]): Promise<void> {
  for (const receipt of receipts) {
    console.info('season_skip_credited (in-app only until the WhatsApp template ships)', {
      subscriptionId: receipt.subscriptionId,
      mealDates: receipt.mealDates,
      creditFils: receipt.creditFils,
      source: receipt.source,
    })
  }
}
```

`src/contexts/season/usecases/season-transitions.ts`:
- Add imports under the existing ones:

```ts
import { receiptsFromTransition } from '../domain/season-skip-receipt'
import { announceSeasonSkipCredited } from './season-skip-notices'
```

- In `runSeasonTransition`, replace

```ts
  await logAdminAction(adminEmail, auditAction, 'intake_settings', 'singleton', { ...args, state: data })
  return { ok: true }
```

with

```ts
  await logAdminAction(adminEmail, auditAction, 'intake_settings', 'singleton', { ...args, state: data })
  // Scheduling or moving the wrap-up day turns skips whose make-up meal now
  // lands after it into wallet credit (spec §7.2 reconciliation).
  const receipts = receiptsFromTransition(data)
  if (receipts.length > 0) await announceSeasonSkipCredited(receipts)
  return { ok: true }
```

- [ ] **Step 5: Run the TypeScript tests**

Run: `npx vitest run src/contexts/season`
Expected: PASS.

- [ ] **Step 6: Write the migration file**

`supabase/migrations/20260915_season_reconcile_skips.sql`:

```sql
-- ============================================================================
-- Season wind-down, plan B: when the wrap-up day is scheduled or moved, skips
-- whose make-up meal now lands after it become wallet credit, and buffer grants
-- no longer needed (or beyond a reduced buffer) are released the same way
-- (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md §7.2, X6).
--
-- season_schedule_end and season_move_end were copied from pg_get_functiondef
-- on live; only the lines marked "Plan B" differ.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_reconcile_skips`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.season_reconcile_skips(p_wrap_up date, p_close date, p_buffer integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s            public.subscriptions;
  v_today      date := public.ae_today();
  v_close      date := GREATEST(p_close, p_wrap_up);
  v_end        date;
  v_after      integer;
  v_in_buffer  integer;
  v_grants     integer;
  v_candidates date[];
  v_n          integer;
  v_pick       date[];
  v_credit     integer;
  v_day        date;
  v_receipts   jsonb := '[]'::jsonb;
BEGIN
  FOR s IN
    SELECT * FROM public.subscriptions
    WHERE status IN ('Active', 'Skipped')
      AND (planned_pause_start IS NULL OR planned_pause_start > p_wrap_up)
      AND (skipped_meals_count > 0 OR season_buffer_grants > 0)
    ORDER BY id
    FOR UPDATE
  LOOP
    v_end := public.season_projected_end(s.end_date, s.week_type, v_today, s.skipped_dates);

    SELECT count(*), count(*) FILTER (WHERE g.d::date <= v_close)
      INTO v_after, v_in_buffer
    FROM generate_series(GREATEST(p_wrap_up + 1, v_today), v_end, interval '1 day') AS g(d)
    WHERE public.is_delivery_day(g.d::date, s.week_type)
      AND NOT public.is_company_closure(g.d::date)
      AND NOT (g.d::date = ANY(COALESCE(s.skipped_dates, '{}'::date[])));

    v_grants := LEAST(s.season_buffer_grants, GREATEST(p_buffer, 0), v_in_buffer);
    -- DISTINCT: a date listed twice in skipped_dates is still one skipped meal,
    -- and credited_skip_dates must stay exactly credited_skip_days long.
    v_candidates := ARRAY(
      SELECT DISTINCT t.x FROM unnest(COALESCE(s.skipped_dates, '{}'::date[])) AS t(x)
      WHERE NOT (t.x = ANY(s.credited_skip_dates))
      ORDER BY t.x DESC
    );
    v_n := LEAST(s.skipped_meals_count, GREATEST(v_after - v_grants, 0), cardinality(v_candidates));

    IF v_n = 0 AND v_grants = s.season_buffer_grants THEN CONTINUE; END IF;

    IF v_n > 0 THEN
      v_credit := public.season_skip_credit_fils(s.id);
      IF v_credit IS NULL THEN
        v_receipts := v_receipts || jsonb_build_object(
          'subscription_id', s.id, 'customer_id', s.customer_id,
          'meal_dates', '[]'::jsonb, 'credit_fils', NULL, 'skipped_no_value', v_n);
        v_n := 0;
        IF v_grants = s.season_buffer_grants THEN CONTINUE; END IF;
      END IF;
    END IF;

    v_pick := v_candidates[1:v_n];

    UPDATE public.subscriptions SET
      skipped_meals_count  = s.skipped_meals_count - v_n,
      credited_skip_days   = s.credited_skip_days + v_n,
      credited_skip_dates  = ARRAY(SELECT DISTINCT t.x FROM unnest(s.credited_skip_dates || v_pick) AS t(x) ORDER BY t.x),
      season_buffer_grants = v_grants
    WHERE id = s.id;

    IF v_n > 0 THEN
      IF v_credit > 0 THEN
        FOREACH v_day IN ARRAY v_pick LOOP
          INSERT INTO public.credits (customer_id, amount_aed, source, status, eligible_plan_ids, subscription_id, meal_date)
          VALUES (s.customer_id, v_credit / 100.0, 'season_skip',
                  CASE WHEN v_day > v_today THEN 'pending' ELSE 'approved' END, NULL, s.id, v_day)
          ON CONFLICT (subscription_id, meal_date) WHERE source = 'season_skip'
          DO UPDATE SET status = EXCLUDED.status, amount_aed = EXCLUDED.amount_aed, created_at = now()
            WHERE public.credits.status = 'rejected';
        END LOOP;
      END IF;
      v_receipts := v_receipts || jsonb_build_object(
        'subscription_id', s.id, 'customer_id', s.customer_id,
        'meal_dates', to_jsonb(v_pick), 'credit_fils', v_credit, 'skipped_no_value', 0);
    END IF;
  END LOOP;

  RETURN v_receipts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_reconcile_skips(date, date, integer) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.season_schedule_end(p_wrap_up date, p_buffer integer, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.intake_settings;
  v_reconciled jsonb;  -- Plan B
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF NOT (r.season_phase = 'open' OR (r.season_phase = 'winding_down' AND r.wrap_up_day IS NULL)) THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: cannot schedule from % (wrap-up day %)', r.season_phase, r.wrap_up_day;
  END IF;
  PERFORM public._season_check_end_dates(p_wrap_up, p_buffer, public.ae_today());

  UPDATE public.intake_settings SET
    season_phase = 'winding_down',
    wrap_up_day = p_wrap_up,
    buffer_delivery_days = p_buffer,
    close_day = public.season_close_day(p_wrap_up, p_buffer),
    pause_scheduled_for = p_wrap_up,
    cycle_started_at = CASE WHEN r.season_phase = 'open' THEN now() ELSE r.cycle_started_at END,
    updated_at = now()
  WHERE id = r.id
  RETURNING * INTO r;

  v_reconciled := public.season_reconcile_skips(r.wrap_up_day, r.close_day, r.buffer_delivery_days);  -- Plan B
  RETURN public._season_state(r) || jsonb_build_object('reconciled', v_reconciled);  -- Plan B
END;
$function$;

CREATE OR REPLACE FUNCTION public.season_move_end(p_wrap_up date, p_buffer integer, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.intake_settings;
  v_reconciled jsonb;  -- Plan B
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF NOT (r.season_phase = 'winding_down' AND r.wrap_up_day IS NOT NULL AND r.wrap_up_day > public.ae_today()) THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: cannot move from % (wrap-up day %)', r.season_phase, r.wrap_up_day;
  END IF;
  PERFORM public._season_check_end_dates(p_wrap_up, p_buffer, public.ae_today());

  UPDATE public.intake_settings SET
    wrap_up_day = p_wrap_up,
    buffer_delivery_days = p_buffer,
    close_day = public.season_close_day(p_wrap_up, p_buffer),
    pause_scheduled_for = p_wrap_up,
    updated_at = now()
  WHERE id = r.id
  RETURNING * INTO r;

  v_reconciled := public.season_reconcile_skips(r.wrap_up_day, r.close_day, r.buffer_delivery_days);  -- Plan B
  RETURN public._season_state(r) || jsonb_build_object('reconciled', v_reconciled);  -- Plan B
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.season_schedule_end(date, integer, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_move_end(date, integer, text) FROM public, anon, authenticated;

COMMIT;
```

- [ ] **Step 7: Apply it live**

Use `apply_migration`, name `season_reconcile_skips`, file content without `BEGIN;` / `COMMIT;`.
Expected: success.

- [ ] **Step 8: Rehearse inside a transaction that rolls itself back**

```sql
DO $$
DECLARE
  v_today date := public.ae_today();
  s public.subscriptions;
  v_w date; v_w2 date; v_p1 date; v_f1 date;
  v_state jsonb;
  v_log text := '';
BEGIN
  SELECT sub.* INTO s FROM public.subscriptions sub
  WHERE sub.status = 'Active' AND sub.plan_name ILIKE '%monthly%' AND sub.plan_name NOT ILIKE '%staff%'
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.subscription_id = sub.id)
  ORDER BY sub.end_date DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'REHEARSAL_SKIPPED: no paid Active monthly plan'; END IF;

  SELECT max(g::date) INTO v_p1 FROM generate_series(s.start_date, v_today - 1, interval '1 day') g
  WHERE public.is_delivery_day(g::date, s.week_type) AND NOT public.is_company_closure(g::date);
  SELECT min(g::date) INTO v_f1 FROM generate_series(v_today + 1, s.end_date - 1, interval '1 day') g
  WHERE public.is_delivery_day(g::date, s.week_type) AND NOT public.is_company_closure(g::date);
  v_w := s.end_date;
  IF v_p1 IS NULL OR v_f1 IS NULL OR v_w <= v_today THEN
    RAISE EXCEPTION 'REHEARSAL_SKIPPED: plan % to % has no past and future delivery day around today', s.start_date, s.end_date;
  END IF;

  -- The takeover state: winding down with no wrap-up day.
  UPDATE public.intake_settings SET season_phase = 'winding_down', wrap_up_day = NULL, close_day = NULL, pause_scheduled_for = NULL;

  -- Two skips taken before the schedule, one past and one future: the trigger
  -- pushes the end date two delivery days past today's end. The future date is
  -- listed twice on purpose: reconciliation must count it once (SELECT DISTINCT
  -- in v_candidates), or the credited_skip_dates check refuses the schedule.
  UPDATE public.subscriptions SET skipped_meals_count = 2, skipped_dates = ARRAY[v_p1, v_f1, v_f1],
    credited_skip_days = 0, credited_skip_dates = '{}', season_buffer_grants = 0
  WHERE id = s.id RETURNING * INTO s;
  IF s.end_date <= v_w THEN RAISE EXCEPTION 'FAIL setup: end date did not move past %', v_w; END IF;

  v_state := public.season_schedule_end(v_w, 1, 'plan-b-rehearsal');
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF s.skipped_meals_count <> 0 OR s.credited_skip_days <> 2 OR cardinality(s.credited_skip_dates) <> 2
     OR s.end_date <> v_w OR jsonb_array_length(v_state->'reconciled') <> 1 THEN
    RAISE EXCEPTION 'FAIL schedule reconcile % %', v_state, row_to_json(s);
  END IF;
  IF (SELECT status FROM public.credits WHERE subscription_id = s.id AND meal_date = v_p1 AND source = 'season_skip') <> 'approved'
     OR (SELECT status FROM public.credits WHERE subscription_id = s.id AND meal_date = v_f1 AND source = 'season_skip') <> 'pending' THEN
    RAISE EXCEPTION 'FAIL reconcile credit statuses';
  END IF;
  v_log := v_log || 'schedule reconciled ok, repeated date counted once; ';

  -- Moving the wrap-up day later finds nothing to convert, and credit stays (X6).
  v_w2 := v_w + 1;
  IF EXTRACT(isodow FROM v_w2)::int = 7 THEN v_w2 := v_w2 + 1; END IF;
  v_state := public.season_move_end(v_w2, 1, 'plan-b-rehearsal');
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF jsonb_array_length(v_state->'reconciled') <> 0 OR s.credited_skip_days <> 2 THEN
    RAISE EXCEPTION 'FAIL move reconcile % %', v_state, row_to_json(s);
  END IF;
  v_log := v_log || 'move found nothing ok; ';

  RAISE EXCEPTION 'RECONCILE_OK: %', v_log;
END;
$$;
```

Expected: an error `RECONCILE_OK: schedule reconciled ok, repeated date counted once; move found nothing ok;`. A `check_violation` on `subscriptions_credited_skip_dates_match` means `v_candidates` lost its `DISTINCT`. Then confirm live is untouched:

```sql
select season_phase, wrap_up_day, close_day from public.intake_settings;
select count(*) from public.credits where source = 'season_skip';
```

Expected: `winding_down | null | null` (unless the owner has scheduled a wrap-up day since, in which case report the live values) and 0.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260915_season_reconcile_skips.sql src/contexts/season/domain/season-skip-receipt.ts src/contexts/season/domain/season-skip-receipt.test.ts src/contexts/season/usecases/season-skip-notices.ts src/contexts/season/usecases/season-transitions.ts src/contexts/season/usecases/season-transitions.test.ts
git commit -m "feat(season): setting or moving the wrap-up day turns stranded make-up meals into credit

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 9: Season-aware skip actions

**Files:**
- Create: `src/contexts/season/domain/season-skip-errors.ts`
- Test: `src/contexts/season/domain/season-skip-errors.test.ts`
- Create: `src/contexts/season/usecases/skip-season.ts`
- Modify: `src/contexts/subscriptions/usecases/subscription-mutations.ts`
- Test: `src/contexts/subscriptions/usecases/subscription-mutations.test.ts`

**Interfaces:**
- Consumes: Task 1 (`decideSkipOutcome`, `mayPromiseMealOn`, `skipSeenMismatch`, `skipCreditFilsFor`, `SkipSeason`, `SkipSeen`, `SeasonSkipNotice`); Task 2 (`skipsUsedFor`); Task 6 SQL (`season_skip`, `season_unskip`); Task 8 (`announceSeasonSkipCredited`, `SeasonSkipReceipt`); Plan A `formatShortDay`, `getIntakeState({ fresh: true })`, `OrderMoney`.
- Produces:
  - `SKIP_CHANGED_COPY`, `SKIP_NO_VALUE_COPY`, `SKIP_ERROR_FALLBACK` (strings)
  - `friendlySkipError(message: string | null | undefined): string`
  - `creditedSkipBlocksPause(dateIso: string, planned: boolean): string`
  - `type OrderMoneyRead = { ok: true; order: OrderMoney | null } | { ok: false }`
  - `loadOrderMoney(subscriptionId: string): Promise<OrderMoneyRead>`
  - `interface SkipSeasonContext { season: SkipSeason; closureDates: ReadonlySet<string>; creditFils: number | null }`
  - `loadSkipSeasonContext(sub: { id: string; plan_name: string; meals_per_day: number | null }): Promise<SkipSeasonContext>`
  - `type SeasonSkipApplied = { ok: true; outcome: 'grant'; makeUpDay: string } | { ok: true; outcome: 'credited'; creditFils: number; creditStatus: 'approved' | 'pending' | 'none' } | { ok: false; error: string }`
  - `applySeasonSkip(input: { customerId: string; subscriptionId: string; mealDate: string; sameDay: boolean; outcome: 'grant' | 'credited'; season: SkipSeason; skipCap: number; expectedCreditFils: number | null }): Promise<SeasonSkipApplied>`
  - `applySeasonUnskip(input: { customerId: string; subscriptionId: string; mealDate: string }): Promise<{ ok: true; kind: 'credited' | 'normal' } | { ok: false; error: string }>`
  - Module-local in `subscription-mutations.ts`, not exported (a `'use server'` module exports only server actions): `type SeasonSkipStep = { ok: false; error: string } | { ok: true; kind: 'normal' | 'grant'; season: SkipSeason } | { ok: true; kind: 'credited'; season: SkipSeason; notice: SeasonSkipNotice }` and `seasonSkipStep(input: { customerId: string; subscription: Subscription; mealDate: string; sameDay: boolean; todayAe: string; seen: SkipSeen | undefined; skipCap: number }): Promise<SeasonSkipStep>`, the one season block both skip actions call.
  - Server actions: `skipMeal(subscriptionId: string, seen?: SkipSeen)` and `skipFutureDate(subscriptionId: string, dateIso: string, seen?: SkipSeen)` now resolve to `{ success: true; seasonSkip?: SeasonSkipNotice } | { error: string }`. `unskipFutureDate`, `planPause`, `pauseSubscription` keep their signatures.

Behaviour:
- Outside a wind-down with a wrap-up day, every action behaves exactly as today.
- `seasonSkipStep` is the season half of both skip actions: fresh season context, the outcome, the seen check, the no-value refusal, the SQL write of a grant or a credited skip, and the announcement of a credited skip. Each action keeps its own validation, its normal-skip write and its messages.
- `normal` outcome: today's write through `auth.supabase`, today's messages, except `meal_resumed_confirm` is not queued for a date `mayPromiseMealOn` refuses.
- `grant` outcome: `season_skip` writes it; the customer gets the same messages as a normal skip.
- `credited` outcome: refused unless the customer's sheet showed a credited skip with the same amount (`seen`), refused when the value is unknown, written by `season_skip`, `announceSeasonSkipCredited` called, and the result carries `seasonSkip` for the toast. It sends no `meal_skipped_confirm` or `meal_skip_scheduled_confirm` (both promise a make-up day). A same-day credited skip still queues `meal_resumed_confirm` for the next eligible delivery day when `mayPromiseMealOn` allows it: on or before W, or a buffer day on or before K while the plan holds a grant (Global Constraints, Messages).
- Un-skip of a credited date, or on a plan holding a buffer grant, goes through `season_unskip`; a credited un-skip sends no WhatsApp.
- `planPause` and `pauseSubscription` refuse while a credited skip lies inside the pause, because the pause tick would extend the plan for that day and the credit would pay it back a second time.
- The customer-facing refusals these steps rewrite in `skipMeal` and `skipFutureDate` lose their dashes (customer copy has none). No test asserts the old wording; `unskipFutureDate` and `QuickActions.tsx` strings are not rewritten and stay as they are.

- [ ] **Step 1: Write the failing tests**

`src/contexts/season/domain/season-skip-errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  friendlySkipError, creditedSkipBlocksPause, SKIP_CHANGED_COPY, SKIP_NO_VALUE_COPY, SKIP_ERROR_FALLBACK,
} from './season-skip-errors'

describe('friendlySkipError', () => {
  it('turns every SQL refusal into customer copy', () => {
    expect(friendlySkipError('SEASON_SKIP_CHANGED: expected grant, found credited')).toBe(SKIP_CHANGED_COPY)
    expect(friendlySkipError('SEASON_SKIP_ALREADY')).toBe("You've already scheduled a skip for that day.")
    expect(friendlySkipError('SEASON_SKIP_NO_SKIPS_LEFT')).toBe("You've used all your skips for this cycle.")
    expect(friendlySkipError('SEASON_SKIP_BAD_STATUS: Paused on 2026-09-16')).toBe('Skips can only be scheduled on an active plan.')
    expect(friendlySkipError('SEASON_SKIP_NOT_FOUND')).toBe('Subscription not found')
    expect(friendlySkipError('SEASON_SKIP_NO_VALUE')).toBe(SKIP_NO_VALUE_COPY)
    expect(friendlySkipError('SEASON_UNSKIP_SETTLED: credit is approved')).toBe('That credit is already in your wallet, so this skip can no longer be undone.')
    expect(friendlySkipError('SEASON_UNSKIP_TOO_LATE')).toBe("Past skips and today's skip can't be undone.")
    expect(friendlySkipError('SEASON_UNSKIP_NOT_SKIPPED')).toBe("That day isn't scheduled as a skip.")
  })

  it('never shows a raw database message', () => {
    expect(friendlySkipError('connection terminated')).toBe(SKIP_ERROR_FALLBACK)
    expect(friendlySkipError(undefined)).toBe(SKIP_ERROR_FALLBACK)
  })

  it('has no dashes in customer copy', () => {
    for (const copy of [SKIP_CHANGED_COPY, SKIP_NO_VALUE_COPY, SKIP_ERROR_FALLBACK, creditedSkipBlocksPause('2026-09-22', true)]) {
      expect(copy).not.toMatch(/[–—]/)
    }
  })
})

describe('creditedSkipBlocksPause', () => {
  it('names the credited day and what to do', () => {
    // Tue 22 Sep 2026.
    expect(creditedSkipBlocksPause('2026-09-22', true)).toBe('Your skip on Tue 22 Sep is turning into wallet credit. Undo that skip first, then plan your pause.')
    expect(creditedSkipBlocksPause('2026-09-22', false)).toBe('Your skip on Tue 22 Sep is turning into wallet credit. Undo that skip first, then pause.')
  })
})
```

In `src/contexts/subscriptions/usecases/subscription-mutations.test.ts`:

1. Below the existing `vi.mock('@/infra/config/intake', ...)` add:

```ts
vi.mock('@sentry/nextjs', () => ({ metrics: { count: vi.fn() } }))
vi.mock('@/shared/events/event-bus', () => ({ eventBus: { emit: vi.fn(), on: vi.fn() } }))
vi.mock('@/contexts/season/usecases/skip-season', () => ({
  loadSkipSeasonContext: vi.fn(),
  applySeasonSkip: vi.fn(),
  applySeasonUnskip: vi.fn(),
}))
vi.mock('@/contexts/season/usecases/season-skip-notices', () => ({
  announceSeasonSkipCredited: vi.fn(),
}))
```

2. Replace the import line `import { changeStartDate, unskipFutureDate } from './subscription-mutations'` with:

```ts
import { changeStartDate, unskipFutureDate, skipMeal, skipFutureDate, planPause, pauseSubscription } from './subscription-mutations'
import { eventBus } from '@/shared/events/event-bus'
import { loadSkipSeasonContext, applySeasonSkip, applySeasonUnskip } from '@/contexts/season/usecases/skip-season'
import { announceSeasonSkipCredited } from '@/contexts/season/usecases/season-skip-notices'
import { SKIP_CHANGED_COPY } from '@/contexts/season/domain/season-skip-errors'
```

   and add `afterEach` to the existing `import { describe, it, expect, vi, beforeEach } from 'vitest'` line.

3. Append at the end of the file:

```ts
// ── Season wind-down skips (spec §7.2) ────────────────────────────────────
// Anchors: 12:00 Dubai on Mon 14 Sep 2026. The plan runs Mon 7 Sep to Sat
// 3 Oct (Monday to Saturday). Wrap-up day Sat 3 Oct, buffer 1, close day
// Mon 5 Oct, so one more skip's make-up day is Mon 5 Oct.

describe('season wind-down skips', () => {
  const emitMock = vi.mocked(eventBus.emit)
  const loadSeasonMock = vi.mocked(loadSkipSeasonContext)
  const applySkipMock = vi.mocked(applySeasonSkip)
  const applyUnskipMock = vi.mocked(applySeasonUnskip)
  const announceMock = vi.mocked(announceSeasonSkipCredited)

  const WIND_DOWN = { phase: 'winding_down' as const, wrapUpDay: '2026-10-03', closeDay: '2026-10-05', bufferDays: 1 }
  const seasonSub = (overrides: Partial<Subscription> = {}) => fakeSub({
    status: 'Active', plan_name: 'Monthly Premium', start_date: '2026-09-07', end_date: '2026-10-03',
    week_type: '6DAYS', total_meals: 24, delivered_meals: 6, skipped_meals_count: 0, skipped_dates: [],
    credited_skip_days: 0, credited_skip_dates: [], season_buffer_grants: 0, ...overrides,
  })
  const kinds = () => emitMock.mock.calls.map((c) => (c[1] as { kind?: string }).kind)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T08:00:00Z'))
    loadSeasonMock.mockResolvedValue({ season: WIND_DOWN, closureDates: new Set(), creditFils: 1980 })
  })
  afterEach(() => vi.useRealTimers())

  it('a same-day skip with no make-up day left becomes credit: no skip confirmation, but meals still resume tomorrow', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ season_buffer_grants: 1 }) })
    applySkipMock.mockResolvedValue({ ok: true, outcome: 'credited', creditFils: 1980, creditStatus: 'approved' })

    const result = await skipMeal('sub-1', { outcome: 'credited', creditFils: 1980 })

    expect(result).toEqual({ success: true, seasonSkip: { outcome: 'credited', creditFils: 1980, creditStatus: 'approved', mealDate: '2026-09-14' } })
    expect(applySkipMock).toHaveBeenCalledWith({
      customerId: 'user-1', subscriptionId: 'sub-1', mealDate: '2026-09-14', sameDay: true,
      outcome: 'credited', season: WIND_DOWN, skipCap: 3, expectedCreditFils: 1980,
    })
    // Tue 15 Sep is on or before the wrap-up day, so the kitchen really cooks it.
    expect(kinds()).toEqual(['meal_resumed_confirm'])
    expect(emitMock).toHaveBeenCalledWith('subscription.notification-due', expect.objectContaining({
      kind: 'meal_resumed_confirm', payload: { resume_date: '2026-09-15' },
    }))
    expect(announceMock).toHaveBeenCalledWith([
      { subscriptionId: 'sub-1', customerId: 'user-1', mealDates: ['2026-09-14'], creditFils: 1980, source: 'customer_skip' },
    ])
  })

  it('a credited same-day skip queues no resume message for a day after the wrap-up day', async () => {
    // 12:00 Dubai on Sat 3 Oct, the wrap-up day. This plan runs to Sat 10 Oct,
    // so its next delivery day, Mon 5 Oct, is after the wrap-up day, and it
    // holds no buffer grant.
    vi.setSystemTime(new Date('2026-10-03T08:00:00Z'))
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ end_date: '2026-10-10' }) })
    applySkipMock.mockResolvedValue({ ok: true, outcome: 'credited', creditFils: 1980, creditStatus: 'approved' })

    expect(await skipMeal('sub-1', { outcome: 'credited', creditFils: 1980 })).toMatchObject({ success: true })
    expect(kinds()).toEqual([])
  })

  it('a credited same-day skip queues the resume message for a buffer day the plan holds a grant for', async () => {
    // 12:00 Dubai on Sat 3 Oct. An earlier skip took the grant for Mon 5 Oct,
    // the close day, so the plan now ends then and that dinner is cooked.
    vi.setSystemTime(new Date('2026-10-03T08:00:00Z'))
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: seasonSub({ end_date: '2026-10-05', skipped_meals_count: 1, skipped_dates: ['2026-09-30'], season_buffer_grants: 1 }),
    })
    applySkipMock.mockResolvedValue({ ok: true, outcome: 'credited', creditFils: 1980, creditStatus: 'approved' })

    expect(await skipMeal('sub-1', { outcome: 'credited', creditFils: 1980 })).toMatchObject({ success: true })
    expect(kinds()).toEqual(['meal_resumed_confirm'])
    expect(emitMock).toHaveBeenCalledWith('subscription.notification-due', expect.objectContaining({
      kind: 'meal_resumed_confirm', payload: { resume_date: '2026-10-05' },
    }))
  })

  it('refuses a credited skip the customer was not shown', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ season_buffer_grants: 1 }) })

    expect(await skipMeal('sub-1')).toEqual({ error: SKIP_CHANGED_COPY })
    expect(await skipMeal('sub-1', { outcome: 'credited', creditFils: 1800 })).toEqual({ error: SKIP_CHANGED_COPY })
    expect(applySkipMock).not.toHaveBeenCalled()
  })

  it('a skip that lands on the buffer day takes a grant and keeps the usual messages', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub() })
    applySkipMock.mockResolvedValue({ ok: true, outcome: 'grant', makeUpDay: '2026-10-05' })

    const result = await skipMeal('sub-1', { outcome: 'grant', creditFils: null })

    expect(result).toEqual({ success: true })
    expect(applySkipMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'grant', expectedCreditFils: null }))
    expect(kinds()).toEqual(['meal_skipped_confirm', 'meal_resumed_confirm'])
    expect(announceMock).not.toHaveBeenCalled()
  })

  it('outside a wind-down the skip is written exactly as before', async () => {
    requireUserMock.mockResolvedValue(authedUser(supabaseChain({ data: [{ id: 'sub-1' }], error: null })))
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub() })
    loadSeasonMock.mockResolvedValue({ season: { phase: 'open', wrapUpDay: null, closeDay: null, bufferDays: 1 }, closureDates: new Set(), creditFils: null })

    expect(await skipMeal('sub-1')).toEqual({ success: true })
    expect(applySkipMock).not.toHaveBeenCalled()
    expect(kinds()).toEqual(['meal_skipped_confirm', 'meal_resumed_confirm'])
  })

  it('a future credited skip leaves its credit pending', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ season_buffer_grants: 1 }) })
    applySkipMock.mockResolvedValue({ ok: true, outcome: 'credited', creditFils: 1980, creditStatus: 'pending' })

    // Wed 16 Sep.
    const result = await skipFutureDate('sub-1', '2026-09-16', { outcome: 'credited', creditFils: 1980 })

    expect(result).toEqual({ success: true, seasonSkip: { outcome: 'credited', creditFils: 1980, creditStatus: 'pending', mealDate: '2026-09-16' } })
    expect(applySkipMock).toHaveBeenCalledWith(expect.objectContaining({ mealDate: '2026-09-16', sameDay: false }))
    expect(kinds()).toEqual([])
  })

  it('undoing a credited skip goes through SQL and sends nothing', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: seasonSub({ skipped_dates: ['2026-09-16'], credited_skip_days: 1, credited_skip_dates: ['2026-09-16'] }),
    })
    applyUnskipMock.mockResolvedValue({ ok: true, kind: 'credited' })

    expect(await unskipFutureDate('sub-1', '2026-09-16')).toEqual({ success: true })
    expect(applyUnskipMock).toHaveBeenCalledWith({ customerId: 'user-1', subscriptionId: 'sub-1', mealDate: '2026-09-16' })
    expect(kinds()).toEqual([])
  })

  it('a pause cannot swallow a credited skip', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    const credited = seasonSub({ skipped_dates: ['2026-09-22'], credited_skip_days: 1, credited_skip_dates: ['2026-09-22'] })
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: credited })

    // Planned pause from Mon 21 Sep would cover Tue 22 Sep.
    expect(await planPause('sub-1', '2026-09-21')).toEqual({
      error: 'Your skip on Tue 22 Sep is turning into wallet credit. Undo that skip first, then plan your pause.',
    })
    expect(await pauseSubscription('sub-1')).toEqual({
      error: 'Your skip on Tue 22 Sep is turning into wallet credit. Undo that skip first, then pause.',
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/season/domain/season-skip-errors.test.ts src/contexts/subscriptions/usecases/subscription-mutations.test.ts`
Expected: FAIL. `./season-skip-errors` and `@/contexts/season/usecases/skip-season` cannot be resolved.

- [ ] **Step 3: Write the copy and the season usecase**

`src/contexts/season/domain/season-skip-errors.ts`:

```ts
/**
 * Customer copy for a refused season skip. season_skip / season_unskip raise
 * messages that start with a code; the customer never sees the raw text.
 */

import { formatShortDay } from './season-dates'

export const SKIP_CHANGED_COPY = 'Your plan changed. Refresh and try again.'
export const SKIP_NO_VALUE_COPY = "We can't work out what this meal is worth yet, so it can't go to your wallet. Message us on WhatsApp and we'll sort it out."
export const SKIP_ERROR_FALLBACK = "Skip didn't take. Refresh and try again, or message us on WhatsApp."

const SKIP_ERROR_COPY: ReadonlyArray<readonly [string, string]> = [
  ['SEASON_SKIP_CHANGED', SKIP_CHANGED_COPY],
  ['SEASON_SKIP_ALREADY', "You've already scheduled a skip for that day."],
  ['SEASON_SKIP_NO_SKIPS_LEFT', "You've used all your skips for this cycle."],
  ['SEASON_SKIP_BAD_STATUS', 'Skips can only be scheduled on an active plan.'],
  ['SEASON_SKIP_NOT_FOUND', 'Subscription not found'],
  ['SEASON_SKIP_NO_VALUE', SKIP_NO_VALUE_COPY],
  ['SEASON_UNSKIP_SETTLED', 'That credit is already in your wallet, so this skip can no longer be undone.'],
  ['SEASON_UNSKIP_TOO_LATE', "Past skips and today's skip can't be undone."],
  ['SEASON_UNSKIP_NOT_SKIPPED', "That day isn't scheduled as a skip."],
]

export function friendlySkipError(message: string | null | undefined): string {
  if (!message) return SKIP_ERROR_FALLBACK
  for (const [code, copy] of SKIP_ERROR_COPY) {
    if (message.includes(code)) return copy
  }
  return SKIP_ERROR_FALLBACK
}

/** Why a pause cannot start while a credited skip lies inside it. */
export function creditedSkipBlocksPause(dateIso: string, planned: boolean): string {
  return `Your skip on ${formatShortDay(dateIso)} is turning into wallet credit. Undo that skip first, then ${planned ? 'plan your pause' : 'pause'}.`
}
```

`src/contexts/season/usecases/skip-season.ts`:

```ts
import 'server-only'

/**
 * The season side of the customer skip actions (spec §7.2).
 *
 * Reads the season fresh (a skip moves money, so a 30-second-old cache is not
 * good enough), the company closures and the order's money, and calls the SQL
 * functions that own every credited-skip and buffer-grant write. The customer's
 * id always comes from withOwnedSubscription, never from the client.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { getIntakeState } from '@/infra/config/intake'
import { getCompanyClosureDates } from '@/infra/supabase/subscriptions-repo'
import type { OrderMoney } from '../domain/meal-value'
import { skipCreditFilsFor, type SkipSeason } from '../domain/skip-outcome'
import { friendlySkipError } from '../domain/season-skip-errors'

export type OrderMoneyRead = { ok: true; order: OrderMoney | null } | { ok: false }

/** The order that bought this plan, newest first (the same pick as the Season page). */
export async function loadOrderMoney(subscriptionId: string): Promise<OrderMoneyRead> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb
    .from('orders')
    .select('amount_paid_fils, credit_applied_fils, meals_count, price_per_meal')
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false }
  if (!data) return { ok: true, order: null }
  const row = data as { amount_paid_fils: number | null; credit_applied_fils: number | null; meals_count: number | null; price_per_meal: number | string | null }
  return {
    ok: true,
    order: {
      amountPaidFils: row.amount_paid_fils,
      creditAppliedFils: row.credit_applied_fils,
      mealsCount: row.meals_count,
      pricePerMealAed: row.price_per_meal == null ? null : Number(row.price_per_meal),
    },
  }
}

export interface SkipSeasonContext {
  season: SkipSeason
  closureDates: ReadonlySet<string>
  /** Credit for one skipped delivery day; null when unknown or not winding down. */
  creditFils: number | null
}

export async function loadSkipSeasonContext(sub: { id: string; plan_name: string; meals_per_day: number | null }): Promise<SkipSeasonContext> {
  const intake = await getIntakeState({ fresh: true })
  const season: SkipSeason = {
    phase: intake.phase,
    wrapUpDay: intake.wrapUpDay,
    closeDay: intake.closeDay,
    bufferDays: intake.bufferDays,
  }
  if (season.phase !== 'winding_down' || !season.wrapUpDay) {
    return { season, closureDates: new Set(), creditFils: null }
  }
  const [closures, money] = await Promise.all([getCompanyClosureDates(), loadOrderMoney(sub.id)])
  return {
    season,
    closureDates: new Set(closures),
    creditFils: money.ok ? skipCreditFilsFor({ planName: sub.plan_name, mealsPerDay: sub.meals_per_day, order: money.order }) : null,
  }
}

export type SeasonSkipApplied =
  | { ok: true; outcome: 'grant'; makeUpDay: string }
  | { ok: true; outcome: 'credited'; creditFils: number; creditStatus: 'approved' | 'pending' | 'none' }
  | { ok: false; error: string }

export async function applySeasonSkip(input: {
  customerId: string
  subscriptionId: string
  mealDate: string
  sameDay: boolean
  outcome: 'grant' | 'credited'
  season: SkipSeason
  skipCap: number
  expectedCreditFils: number | null
}): Promise<SeasonSkipApplied> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb.rpc('season_skip', {
    p_customer_id: input.customerId,
    p_subscription_id: input.subscriptionId,
    p_meal_date: input.mealDate,
    p_same_day: input.sameDay,
    p_outcome: input.outcome,
    p_wrap_up: input.season.wrapUpDay,
    p_close: input.season.closeDay,
    p_skip_cap: input.skipCap,
    p_expected_credit_fils: input.expectedCreditFils,
  })
  if (error) return { ok: false, error: friendlySkipError(error.message) }
  const row = (data ?? {}) as { outcome?: string; make_up_day?: string; credit_fils?: number; credit_status?: string }
  if (row.outcome === 'grant') return { ok: true, outcome: 'grant', makeUpDay: String(row.make_up_day) }
  const status = row.credit_status === 'approved' || row.credit_status === 'pending' ? row.credit_status : 'none'
  return { ok: true, outcome: 'credited', creditFils: Number(row.credit_fils ?? 0), creditStatus: status }
}

export async function applySeasonUnskip(input: {
  customerId: string
  subscriptionId: string
  mealDate: string
}): Promise<{ ok: true; kind: 'credited' | 'normal' } | { ok: false; error: string }> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb.rpc('season_unskip', {
    p_customer_id: input.customerId,
    p_subscription_id: input.subscriptionId,
    p_meal_date: input.mealDate,
  })
  if (error) return { ok: false, error: friendlySkipError(error.message) }
  return { ok: true, kind: (data as { kind?: string } | null)?.kind === 'credited' ? 'credited' : 'normal' }
}
```

- [ ] **Step 4: Wire the season into the skip actions**

`src/contexts/subscriptions/usecases/subscription-mutations.ts`:

(a) Add under the existing imports:

```ts
import type { Subscription } from '@/contexts/subscriptions/domain/subscriptions';
import { decideSkipOutcome, mayPromiseMealOn, skipSeenMismatch, type SeasonSkipNotice, type SkipSeason, type SkipSeen } from '@/contexts/season/domain/skip-outcome';
import { SKIP_CHANGED_COPY, SKIP_NO_VALUE_COPY, creditedSkipBlocksPause } from '@/contexts/season/domain/season-skip-errors';
import { applySeasonSkip, applySeasonUnskip, loadSkipSeasonContext } from '@/contexts/season/usecases/skip-season';
import { announceSeasonSkipCredited } from '@/contexts/season/usecases/season-skip-notices';
```

(b) In `pauseSubscription`, directly after `if (!check.ok) return { error: check.error };` add:

```ts
  // A credited skip still ahead would be paid back twice: by its credit and
  // by the pause extending the plan for that day (season §7.2).
  const creditedAhead = (subscription.credited_skip_dates ?? []).filter((d) => d > aeTodayIso()).sort();
  if (creditedAhead.length > 0) return { error: creditedSkipBlocksPause(creditedAhead[0], false) };
```

(c) In `planPause`, directly before the comment `// Auto-cancel any scheduled future skips that fall inside the new pause` add:

```ts
  // Credited skips are not refundable like normal ones: the credit is already
  // promised. Ask the customer to undo the skip rather than paying it twice.
  const creditedInPause = (subscription.credited_skip_dates ?? []).filter((d) => d >= startDateIso).sort();
  if (creditedInPause.length > 0) return { error: creditedSkipBlocksPause(creditedInPause[0], true) };
```

(d) Directly above the `// ── skipMeal (same-day)` section comment, add the one season block both skip actions share:

```ts
// ── Season wind-down skip step (spec §7.2) ────────────────────────────────

type SeasonSkipStep =
  | { ok: false; error: string }
  | { ok: true; kind: 'normal' | 'grant'; season: SkipSeason }
  | { ok: true; kind: 'credited'; season: SkipSeason; notice: SeasonSkipNotice };

/**
 * The season half of skipMeal and skipFutureDate. Decides normal skip, buffer
 * grant or credited skip on fresh data and refuses an outcome the customer's
 * sheet did not show. Grants and credited skips are written here through SQL:
 * they touch columns and rows the customer's client cannot write, and SQL
 * rechecks the season and the amount under a row lock. A credited skip is
 * announced here. A normal skip is left to the caller's own write, and every
 * message stays with the caller. Not exported: a 'use server' module may only
 * export server actions.
 */
async function seasonSkipStep(input: {
  customerId: string
  subscription: Subscription
  mealDate: string
  sameDay: boolean
  todayAe: string
  seen: SkipSeen | undefined
  skipCap: number
}): Promise<SeasonSkipStep> {
  const { subscription } = input;
  const ctx = await loadSkipSeasonContext(subscription);
  const outcome = decideSkipOutcome({
    season: ctx.season,
    plan: {
      endDate: subscription.end_date,
      weekType: subscription.week_type === '5DAYS' ? '5DAYS' : '6DAYS',
      skippedDates: subscription.skipped_dates ?? [],
      bufferGrants: subscription.season_buffer_grants ?? 0,
    },
    todayAe: input.todayAe,
    closureDates: ctx.closureDates,
    creditFils: ctx.creditFils,
  });
  // The customer's sheet showed an outcome; if the fresh answer differs, they
  // refresh rather than get a different result than they confirmed.
  if (skipSeenMismatch(outcome, input.seen)) return { ok: false, error: SKIP_CHANGED_COPY };
  if (outcome.kind === 'normal') return { ok: true, kind: 'normal', season: ctx.season };
  if (outcome.kind === 'credited' && outcome.creditFils == null) return { ok: false, error: SKIP_NO_VALUE_COPY };

  const applied = await applySeasonSkip({
    customerId: input.customerId,
    subscriptionId: subscription.id,
    mealDate: input.mealDate,
    sameDay: input.sameDay,
    outcome: outcome.kind,
    season: ctx.season,
    skipCap: input.skipCap,
    expectedCreditFils: outcome.kind === 'credited' ? outcome.creditFils : null,
  });
  if (!applied.ok) return { ok: false, error: applied.error };
  if (applied.outcome === 'grant') return { ok: true, kind: 'grant', season: ctx.season };

  await announceSeasonSkipCredited([
    { subscriptionId: subscription.id, customerId: input.customerId, mealDates: [input.mealDate], creditFils: applied.creditFils, source: 'customer_skip' },
  ]);
  return {
    ok: true,
    kind: 'credited',
    season: ctx.season,
    notice: { outcome: 'credited', creditFils: applied.creditFils, creditStatus: applied.creditStatus, mealDate: input.mealDate },
  };
}
```

(e) Replace the whole `skipMeal` function (from `export async function skipMeal(subscriptionId: string) {` to its closing `}` before `// ── skipFutureDate`) with the following. The make-up day refusal is rewritten, so it loses its dash:

```ts
export async function skipMeal(subscriptionId: string, seen?: SkipSeen) {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
  // Skip is only meaningful from Active. Skipped subs can't be skipped again
  // today (already counted); Paused/Scheduled/Ended subs aren't delivering.
  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    return { error: 'Cannot skip a meal on an inactive or paused subscription.' };
  }

  // Operations cutoff: a same-day skip is only honoured before 14:00 Asia/Dubai.
  const SKIP_CUTOFF_HOUR_AE = 14;
  const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000); // shift UTC to AE wall time
  const aeHour = aeNow.getUTCHours();
  if (aeHour >= SKIP_CUTOFF_HOUR_AE) {
    return { error: `Skip cutoff for today is 2 PM. Try again tomorrow morning.` };
  }

  // Today must be a delivery day for this sub's week_type.
  const aeIsoDow = ((aeNow.getUTCDay() + 6) % 7) + 1;
  const wt = subscription.week_type ?? '6DAYS';
  // Subscriptions table CHECK enforces wt ∈ {5DAYS, 6DAYS}.
  const isDeliveryToday =
    wt === '6DAYS' ? aeIsoDow !== 7
                   : aeIsoDow !== 6 && aeIsoDow !== 7;
  if (!isDeliveryToday) {
    return { error: 'Today isn\'t a delivery day for your plan, so there\'s nothing to skip.' };
  }

  // skipCapFor is the single definition of the allowance; skipsUsedFor counts
  // credited season skips against it too (spec X3).
  const maxSkips = skipCapFor(subscription);
  if (skipsUsedFor(subscription) >= maxSkips) {
    return { error: `You have reached the maximum allowed skips (${maxSkips}) for this subscription plan.` };
  }

  // Make-up day guard: skipping a make-up day would loop the extension.
  const todayAEIso = `${aeNow.getUTCFullYear()}-${String(aeNow.getUTCMonth() + 1).padStart(2, '0')}-${String(aeNow.getUTCDate()).padStart(2, '0')}`
  const mealsPerDelivery = subscription.meals_per_day ?? 1;
  const totalDeliveries = Math.max(1, Math.ceil(subscription.total_meals / mealsPerDelivery));
  const todayPosition = workingDayPosition(subscription.start_date, todayAEIso, wt);
  if (todayPosition > totalDeliveries) {
    return { error: "Make-up days can't be skipped. They're extra days earned by earlier skips." };
  }

  // ── Season wind-down (spec §7.2): normal skip, buffer grant or credited skip ──
  const step = await seasonSkipStep({
    customerId: auth.user.id,
    subscription,
    mealDate: todayAEIso,
    sameDay: true,
    todayAe: todayAEIso,
    seen,
    skipCap: maxSkips,
  });
  if (!step.ok) return { error: step.error };

  const nextSkippedDates = [...(subscription.skipped_dates ?? []), todayAEIso]

  if (step.kind === 'normal') {
    // Flip Active → Skipped. The CAS on status stops a double tap counting twice.
    const { data: skipRows, error: updateError } = await auth.supabase
      .from('subscriptions')
      .update({
        status: SUBSCRIPTION_STATUS.SKIPPED,
        skipped_meals_count: subscription.skipped_meals_count + 1,
        last_skipped_date: new Date().toISOString(),
        skipped_dates: nextSkippedDates,
      })
      .eq('id', subscriptionId)
      .eq('status', SUBSCRIPTION_STATUS.ACTIVE)
      .select('id');

    if (updateError) return { error: 'Failed to skip meal.' };
    if (!skipRows || skipRows.length === 0) {
      return { error: 'Skip didn\'t take. Refresh and try again, or message us on WhatsApp.' };
    }
  }

  // ── WhatsApp confirmations ──────────────────────────────────────────────
  // meal_skipped_confirm promises a make-up day, so a credited skip never
  // sends it. Every same-day skip still says when meals resume, but only for
  // a day the kitchen really cooks: on or before the wrap-up day, or a buffer
  // day this plan holds a grant for (mayPromiseMealOn).
  if (step.kind !== 'credited') {
    await eventBus.emit('subscription.notification-due', {
      customerId: auth.user.id,
      kind: 'meal_skipped_confirm',
      scheduledFor: new Date(), // immediate
      payload: { meal_date: todayAEIso },
    });
  }
  const resumeOnIso = nextEligibleDeliveryDay({
    fromAeDateIso: todayAEIso,
    weekType:      (wt as '5DAYS' | '6DAYS' | '7DAYS'),
    skippedDates:  nextSkippedDates,
    pausedDates:   subscription.paused_dates ?? [],
    subEndDateIso: subscription.end_date,
  });
  const grantsAfter = (subscription.season_buffer_grants ?? 0) + (step.kind === 'grant' ? 1 : 0);
  if (resumeOnIso && mayPromiseMealOn(resumeOnIso, step.season, grantsAfter)) {
    await eventBus.emit('subscription.notification-due', {
      customerId: auth.user.id,
      kind: 'meal_resumed_confirm',
      scheduledFor: ae9amUtcOnDate(resumeOnIso),
      payload: { resume_date: resumeOnIso },
    });
  }

  revalidatePath('/dashboard', 'layout');
  return step.kind === 'credited'
    ? { success: true as const, seasonSkip: step.notice }
    : { success: true as const };
  }, 'subscription.skipped');
}
```

(f) Replace the whole `skipFutureDate` function (keep its doc comment above it) with the following. Its four rewritten refusals that carried a dash lose it:

```ts
export async function skipFutureDate(subscriptionId: string, dateIso: string, seen?: SkipSeen) {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
  // Shared skip-eligibility (status + allowance, credited skips included).
  const eligible = canSkip(subscription);
  if (!eligible.ok) return { error: eligible.error };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { error: 'Invalid date format.' };
  }

  const todayIso = aeTodayIso();
  if (dateIso <= todayIso) {
    return { error: 'Pick a date in the future. Use the same-day skip button to skip today\'s meal.' };
  }

  if (dateIso > subscription.end_date) {
    return { error: 'Pick a date inside your current cycle.' };
  }

  const wt = subscription.week_type ?? '6DAYS';
  const targetD = new Date(dateIso + 'T00:00:00');
  if (!isWorkingDayForWeekType(targetD, wt)) {
    return { error: 'That isn\'t a delivery day for your plan, so there\'s nothing to skip.' };
  }

  // A closed kitchen is already paid back by closure_tick.
  if ((await getCompanyClosureDates()).includes(dateIso)) {
    return { error: 'The kitchen is closed that day. It\'s already added to the end of your plan, so there\'s nothing to skip.' };
  }

  const existing: string[] = subscription.skipped_dates ?? [];
  if (existing.includes(dateIso)) {
    return { error: 'You\'ve already scheduled a skip for that day.' };
  }

  const mealsPerDelivery = subscription.meals_per_day ?? 1;
  const totalDeliveries = Math.max(1, Math.ceil(subscription.total_meals / mealsPerDelivery));
  const targetPosition = workingDayPosition(subscription.start_date, dateIso, wt);
  if (targetPosition > totalDeliveries) {
    return { error: 'Make-up days can\'t be skipped. They\'re already extra days earned by earlier skips.' };
  }

  if (subscription.planned_pause_start && dateIso >= subscription.planned_pause_start) {
    return { error: 'That day is inside your planned pause, so there\'s no need to skip. Cancel the planned pause first if you want to skip this day specifically.' };
  }

  // ── Season wind-down (spec §7.2): normal skip, buffer grant or credited skip ──
  const step = await seasonSkipStep({
    customerId: auth.user.id,
    subscription,
    mealDate: dateIso,
    sameDay: false,
    todayAe: todayIso,
    seen,
    skipCap: skipCapFor(subscription),
  });
  if (!step.ok) return { error: step.error };
  if (step.kind === 'credited') {
    // No meal_skip_scheduled_confirm: it promises a make-up day that is not coming.
    revalidatePath('/dashboard', 'layout');
    return { success: true as const, seasonSkip: step.notice };
  }

  if (step.kind === 'normal') {
    // Append + increment. CAS on skipped_meals_count guards concurrent skips.
    const nextSkippedDates = [...existing, dateIso].sort();
    const { data: rows, error: updateError } = await auth.supabase
      .from('subscriptions')
      .update({
        skipped_meals_count: subscription.skipped_meals_count + 1,
        skipped_dates: nextSkippedDates,
      })
      .eq('id', subscriptionId)
      .eq('skipped_meals_count', subscription.skipped_meals_count)
      .select('id');

    if (updateError) return { error: 'Failed to schedule skip.' };
    if (!rows || rows.length === 0) {
      return { error: 'Couldn\'t schedule the skip. Please refresh and try again.' };
    }
  }

  // ── WhatsApp confirmation (normal skip and buffer grant) ─────────────────
  await eventBus.emit('subscription.notification-due', {
    customerId: auth.user.id,
    kind: 'meal_skip_scheduled_confirm',
    scheduledFor: new Date(),
    payload: { meal_date: dateIso },
  });

  revalidatePath('/dashboard', 'layout');
  return { success: true as const };
  }, 'subscription.future_skip_scheduled');
}
```

(g) In `unskipFutureDate`, directly after

```ts
  if (!existing.includes(dateIso)) {
    return { error: 'That day isn\'t scheduled as a skip.' };
  }
```

add:

```ts
  // A credited date, or any plan holding a buffer grant, is undone in SQL:
  // the credit must be rejected and the grant released in the same write.
  const creditedDay = (subscription.credited_skip_dates ?? []).includes(dateIso);
  if (creditedDay || (subscription.season_buffer_grants ?? 0) > 0) {
    const undone = await applySeasonUnskip({ customerId: auth.user.id, subscriptionId, mealDate: dateIso });
    if (!undone.ok) return { error: undone.error };
    if (undone.kind === 'normal') {
      await eventBus.emit('subscription.notification-due', {
        customerId: auth.user.id,
        kind: 'meal_skip_cancelled_confirm',
        scheduledFor: new Date(),
        payload: { meal_date: dateIso },
      });
    }
    revalidatePath('/dashboard', 'layout');
    return { success: true as const };
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/contexts/season src/contexts/subscriptions`
Expected: PASS, including the 9 new season wind-down skip tests and the untouched `unskipFutureDate` and `changeStartDate` cases.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: no errors. `seasonSkipStep` is used by both actions, so lint reports nothing unused.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/season/domain/season-skip-errors.ts src/contexts/season/domain/season-skip-errors.test.ts src/contexts/season/usecases/skip-season.ts src/contexts/subscriptions/usecases/subscription-mutations.ts src/contexts/subscriptions/usecases/subscription-mutations.test.ts
git commit -m "feat(season): skips near the season end become credit or use the buffer, only as the customer confirmed

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The dashboard's season view and the home chip

**Files:**
- Create: `src/contexts/season/domain/customer-season.ts`
- Test: `src/contexts/season/domain/customer-season.test.ts`
- Create: `src/app/dashboard/_shared/season-notice-copy.ts`
- Test: `src/app/dashboard/_shared/season-notice-copy.test.ts`
- Create: `src/app/dashboard/_shared/SeasonWrapUpChip.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/ClientDashboard.tsx`
- Modify: `src/app/dashboard/ActiveDashboard.tsx`
- Modify: `src/app/dashboard/_mobile/MobileHome.tsx`

**Interfaces:**
- Consumes: Plan A `projectPlan`, `ProjectionPlan`, `Disposition`, `SeasonPhase`, `closeDayFor`, `todayAeIso`, `formatShortDay`; Task 1 `skipCreditFilsFor`; Task 9 `loadOrderMoney`.
- Produces:
  - `type SeasonNoticeKind = 'finishes' | 'paused'`
  - `interface CustomerSeason { phase: 'winding_down'; wrapUpDay: string; closeDay: string; bufferDays: number; cycleStartedAt: string | null; notice: SeasonNoticeKind | null; lastDinner: string | null; skipCreditFils: number | null; closureDates: string[] }`
  - `projectionPlanFromRow(row: Record<string, unknown> | null | undefined): ProjectionPlan | null`
  - `noticeFor(dispositions: readonly Disposition[]): SeasonNoticeKind | null`
  - `buildCustomerSeason(input: { intake: { phase: SeasonPhase; wrapUpDay: string | null; closeDay: string | null; bufferDays: number; cycleStartedAt: string | null }; plans: readonly ProjectionPlan[]; skipCreditFils: number | null; todayAe: string; closureDates: readonly string[] }): CustomerSeason | null`
  - `seasonChipLabel(wrapUpDay: string): string` in `season-notice-copy.ts`
  - `SeasonWrapUpChip({ wrapUpDay }: { wrapUpDay: string })`
  - `ClientDashboard` and `ActiveDashboard` accept `season?: CustomerSeason | null`; `MobileHome` accepts `seasonChip?: ReactNode`
  - Preview knobs on `/dashboard?preview=1`: `season=scheduled|paused|grant|credited`

- [ ] **Step 1: Write the failing tests**

`src/contexts/season/domain/customer-season.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildCustomerSeason, noticeFor, projectionPlanFromRow } from './customer-season'
import type { ProjectionPlan } from './season-projection'

// Anchors: Mon 2026-09-14 is today; Sat 3 Oct is the wrap-up day, Mon 5 Oct the close day.
const WIND_DOWN = { phase: 'winding_down' as const, wrapUpDay: '2026-10-03', closeDay: '2026-10-05', bufferDays: 1, cycleStartedAt: '2026-09-14T08:00:00Z' }
const plan = (p: Partial<ProjectionPlan> = {}): ProjectionPlan => ({
  id: 'p1', customerId: 'c1', planName: 'Monthly Premium', status: 'Active',
  startDate: '2026-09-07', endDate: '2026-10-03', weekType: '6DAYS',
  mealsPerDay: 1, totalMeals: 24, deliveredMeals: 6, creditedSkipDays: 0, bufferGrants: 0,
  skippedDates: [], plannedPauseStart: null, staffApproval: null, lastDeliveryTickDate: '2026-09-12',
  ...p,
})
const build = (plans: ProjectionPlan[], intake = WIND_DOWN) =>
  buildCustomerSeason({ intake, plans, skipCreditFils: 1980, todayAe: '2026-09-14', closureDates: ['2026-09-16'] })

describe('buildCustomerSeason', () => {
  it('is nothing unless the season is winding down to a wrap-up day', () => {
    expect(build([plan()], { ...WIND_DOWN, phase: 'open' as never })).toBeNull()
    expect(build([plan()], { ...WIND_DOWN, wrapUpDay: null as never, closeDay: null as never })).toBeNull()
  })

  it('tells a customer whose plan finishes in time (N1) and names the last dinner', () => {
    const season = build([plan({ endDate: '2026-10-02' })])
    expect(season).toMatchObject({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05', notice: 'finishes', lastDinner: '2026-10-02', skipCreditFils: 1980, closureDates: ['2026-09-16'] })
  })

  it('reads the last dinner across a queued renewal', () => {
    const season = build([
      plan({ endDate: '2026-09-19', totalMeals: 24, deliveredMeals: 18 }),
      plan({ id: 'p2', planName: 'Weekly Flex', status: 'Scheduled', startDate: '2026-09-21', endDate: '2026-09-26', totalMeals: 6, deliveredMeals: 0, lastDeliveryTickDate: null }),
    ])
    expect(season?.notice).toBe('finishes')
    expect(season?.lastDinner).toBe('2026-09-26')
  })

  it('tells a paused customer (N3)', () => {
    expect(build([plan({ status: 'Paused' })])?.notice).toBe('paused')
  })

  it('shows no notice to a plan that runs past the wrap-up day', () => {
    expect(build([plan()], { ...WIND_DOWN, wrapUpDay: '2026-09-30', closeDay: '2026-10-01' })?.notice).toBeNull()
  })
})

describe('noticeFor', () => {
  it('prefers the paused notice, and needs every plan to finish for N1', () => {
    expect(noticeFor([])).toBeNull()
    expect(noticeFor(['finishes', 'customer_paused'])).toBe('paused')
    expect(noticeFor(['finishes', 'starts_after'])).toBeNull()
    expect(noticeFor(['finishes', 'finishes'])).toBe('finishes')
  })
})

describe('projectionPlanFromRow', () => {
  it('maps a subscriptions row', () => {
    expect(projectionPlanFromRow({
      id: 'p1', customer_id: 'c1', plan_name: 'Monthly Max', status: 'Skipped',
      start_date: '2026-09-07', end_date: '2026-10-03T00:00:00Z', week_type: '5DAYS',
      meals_per_day: 2, total_meals: 40, delivered_meals: 10, credited_skip_days: 1, season_buffer_grants: 1,
      skipped_dates: ['2026-09-14'], planned_pause_start: null, staff_approval: null, last_delivery_tick_date: '2026-09-11',
    })).toEqual({
      id: 'p1', customerId: 'c1', planName: 'Monthly Max', status: 'Skipped',
      startDate: '2026-09-07', endDate: '2026-10-03', weekType: '5DAYS',
      mealsPerDay: 2, totalMeals: 40, deliveredMeals: 10, creditedSkipDays: 1, bufferGrants: 1,
      skippedDates: ['2026-09-14'], plannedPauseStart: null, staffApproval: null, lastDeliveryTickDate: '2026-09-11',
    })
  })

  it('ignores plans that are not live', () => {
    expect(projectionPlanFromRow({ id: 'p1', status: 'Ended', start_date: '2026-08-01', end_date: '2026-08-28' })).toBeNull()
    expect(projectionPlanFromRow(null)).toBeNull()
  })
})
```

`src/app/dashboard/_shared/season-notice-copy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { seasonChipLabel } from './season-notice-copy'

describe('seasonChipLabel', () => {
  it('names the wrap-up day', () => {
    // Sat 3 Oct 2026.
    expect(seasonChipLabel('2026-10-03')).toBe('Semester wraps up Sat 3 Oct')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/season/domain/customer-season.test.ts src/app/dashboard/_shared/season-notice-copy.test.ts`
Expected: FAIL. `./customer-season` and `./season-notice-copy` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`src/contexts/season/domain/customer-season.ts`:

```ts
/**
 * One customer's view of the season end, for the dashboard (spec §7.2, N1, N3).
 *
 * Pure: the dashboard page feeds it the customer's live plan rows and the
 * season; the skip sheets, the home chip and the full-screen notice read the
 * result. Null whenever the season is not winding down to a wrap-up day, so
 * every surface stays exactly as it is today.
 */

import { projectPlan, type Disposition, type ProjectionPlan, type ProjectionStatus } from './season-projection'
import type { SeasonPhase } from './season-phase'

export type SeasonNoticeKind = 'finishes' | 'paused'

export interface CustomerSeason {
  phase: 'winding_down'
  wrapUpDay: string
  closeDay: string
  bufferDays: number
  cycleStartedAt: string | null
  /** N1 for plans that finish, N3 for a customer pause, null for no notice. */
  notice: SeasonNoticeKind | null
  /** Last dinner on the books across the customer's live plans. */
  lastDinner: string | null
  /** Credit one skipped delivery day of the primary plan would mint; 0 = not paid in cash, null = unknown. */
  skipCreditFils: number | null
  closureDates: string[]
}

const LIVE: readonly ProjectionStatus[] = ['Active', 'Skipped', 'Paused', 'Scheduled']

export function projectionPlanFromRow(row: Record<string, unknown> | null | undefined): ProjectionPlan | null {
  if (!row) return null
  const status = row.status as ProjectionStatus
  if (!LIVE.includes(status)) return null
  const day = (v: unknown): string | null => (v == null ? null : String(v).slice(0, 10))
  const startDate = day(row.start_date)
  const endDate = day(row.end_date)
  if (!startDate || !endDate) return null
  return {
    id: String(row.id),
    customerId: String(row.customer_id ?? ''),
    planName: String(row.plan_name ?? ''),
    status,
    startDate,
    endDate,
    weekType: row.week_type === '5DAYS' ? '5DAYS' : '6DAYS',
    mealsPerDay: Number(row.meals_per_day ?? 1),
    totalMeals: Number(row.total_meals ?? 0),
    deliveredMeals: Number(row.delivered_meals ?? 0),
    creditedSkipDays: Number(row.credited_skip_days ?? 0),
    bufferGrants: Number(row.season_buffer_grants ?? 0),
    skippedDates: Array.isArray(row.skipped_dates) ? row.skipped_dates.map(String) : [],
    plannedPauseStart: day(row.planned_pause_start),
    staffApproval: row.staff_approval == null ? null : String(row.staff_approval),
    lastDeliveryTickDate: day(row.last_delivery_tick_date),
  }
}

export function noticeFor(dispositions: readonly Disposition[]): SeasonNoticeKind | null {
  if (dispositions.length === 0) return null
  if (dispositions.includes('customer_paused')) return 'paused'
  if (dispositions.every((d) => d === 'finishes')) return 'finishes'
  return null
}

export function buildCustomerSeason(input: {
  intake: { phase: SeasonPhase; wrapUpDay: string | null; closeDay: string | null; bufferDays: number; cycleStartedAt: string | null }
  plans: readonly ProjectionPlan[]
  skipCreditFils: number | null
  todayAe: string
  closureDates: readonly string[]
}): CustomerSeason | null {
  const { intake } = input
  if (intake.phase !== 'winding_down' || !intake.wrapUpDay || !intake.closeDay) return null
  const ctx = {
    todayAe: input.todayAe,
    closureDates: new Set(input.closureDates),
    wrapUpDay: intake.wrapUpDay,
    closeDay: intake.closeDay,
  }
  const projections = input.plans.map((p) => projectPlan(p, ctx))
  let lastDinner: string | null = null
  for (const p of projections) {
    if (p.lastDinner && (lastDinner === null || p.lastDinner > lastDinner)) lastDinner = p.lastDinner
  }
  return {
    phase: 'winding_down',
    wrapUpDay: intake.wrapUpDay,
    closeDay: intake.closeDay,
    bufferDays: intake.bufferDays,
    cycleStartedAt: intake.cycleStartedAt,
    notice: noticeFor(projections.map((p) => p.disposition)),
    lastDinner,
    skipCreditFils: input.skipCreditFils,
    closureDates: [...input.closureDates],
  }
}
```

`src/app/dashboard/_shared/season-notice-copy.ts`:

```ts
/**
 * Customer words for the season end on the dashboard (spec N1, N3, §7.3).
 * Pure so the copy is testable in vitest's node environment, and so no hold
 * or refund is ever promised before the break exists (SEASON_BREAK_RELEASE_LIVE).
 */

import { formatShortDay } from '@/contexts/season/domain/season-dates'

/** The quiet chip left on home once the notice is dismissed. */
export function seasonChipLabel(wrapUpDay: string): string {
  return `Semester wraps up ${formatShortDay(wrapUpDay)}`
}
```

`src/app/dashboard/_shared/SeasonWrapUpChip.tsx`:

```tsx
'use client'

import { CalendarClock } from 'lucide-react'
import { BODY, S } from './tokens'
import { seasonChipLabel } from './season-notice-copy'

/** "Semester wraps up Sat 3 Oct": home, desktop and mobile (spec N1). */
export function SeasonWrapUpChip({ wrapUpDay }: { wrapUpDay: string }) {
  return (
    <div
      id="season-wrap-up-chip"
      role="note"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
        padding: '8px 14px', borderRadius: 999,
        background: 'var(--ds-og-wash)', border: '1px solid var(--ds-og-border)',
        fontFamily: BODY, fontSize: 12.5, fontWeight: 700, color: S.fg,
        fontFeatureSettings: '"tnum"', marginBottom: 16,
      }}
    >
      <CalendarClock size={14} strokeWidth={2.2} aria-hidden />
      {seasonChipLabel(wrapUpDay)}
    </div>
  )
}
```

`src/app/dashboard/page.tsx`:

(a) Add imports:

```ts
import { buildCustomerSeason, projectionPlanFromRow, type CustomerSeason } from '@/contexts/season/domain/customer-season'
import type { ProjectionPlan } from '@/contexts/season/domain/season-projection'
import { closeDayFor, todayAeIso, addDaysIso } from '@/contexts/season/domain/season-dates'
import { skipCreditFilsFor } from '@/contexts/season/domain/skip-outcome'
import { loadOrderMoney } from '@/contexts/season/usecases/skip-season'
```

(b) In the `searchParams` type add `season?: string` before `loading?: string`.

(c) In the dev harness comment block, add under `//   ?week=5       — 5-day cadence`:

```ts
        //   ?season=scheduled — wrap-up day 12 days out, the plan finishes before it (N1 notice, home chip)
        //   ?season=paused    — pair with sub=paused: wrap-up day set, plan paused (N3 notice)
        //   ?season=grant     — wrap-up day on the plan's end: a skip now uses the buffer day
        //   ?season=credited  — as grant, buffer used: a skip now turns into credit; one future credited skip on the plan
```

(d) Directly after the `queuedSub` constant in the preview branch, add:

```ts
        const seasonKnob = params.season ?? ''
        const inFuture = seasonKnob === 'credited' ? dateOnly(nowMs + 2 * day) : null
        const seasonSub = seasonKnob === 'credited' && inFuture ? {
            ...previewSub,
            skipped_dates: [...(previewSub.skipped_dates ?? []), inFuture].sort(),
            credited_skip_days: 1,
            credited_skip_dates: [inFuture],
            season_buffer_grants: 1,
        } : seasonKnob === 'grant' ? { ...previewSub, season_buffer_grants: 0 } : previewSub
        const notSunday = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay() === 0 ? addDaysIso(iso, 1) : iso
        const previewWrapUp = seasonKnob === 'scheduled' || seasonKnob === 'paused' ? notSunday(dateOnly(nowMs + 12 * day))
            : seasonKnob === 'grant' || seasonKnob === 'credited' ? String(seasonSub.end_date).slice(0, 10)
            : null
        const previewSeason: CustomerSeason | null = previewWrapUp ? (() => {
            const built = buildCustomerSeason({
                intake: { phase: 'winding_down', wrapUpDay: previewWrapUp, closeDay: closeDayFor(previewWrapUp, 1), bufferDays: 1, cycleStartedAt: dateOnly(nowMs - day) },
                plans: [projectionPlanFromRow({ ...seasonSub, customer_id: 'preview', meals_per_day: mealsPerDelivery })].filter((p): p is ProjectionPlan => p !== null),
                skipCreditFils: 1980,
                todayAe: todayAE,
                closureDates: [],
            })
            // The skip fixtures are for the sheets, not the notice.
            return built && (seasonKnob === 'grant' || seasonKnob === 'credited') ? { ...built, notice: null } : built
        })() : null
```

(e) In the preview `<ClientDashboard ...>`, replace `activeSubscription={params.nosub === '1' ? null : previewSub}` with `activeSubscription={params.nosub === '1' ? null : seasonSub}` and add the prop `season={params.nosub === '1' ? null : previewSeason}`.

(f) In the live path, directly before `const intakePause: IntakeGateState = {`, add:

```ts
    // The season end, seen from this customer's plans (spec §7.2, N1, N3).
    // Null unless the season is winding down to a wrap-up day.
    let season: CustomerSeason | null = null
    if (intakeState.phase === 'winding_down' && intakeState.wrapUpDay && activeSubscription) {
        const money = await loadOrderMoney(activeSubscription.id)
        season = buildCustomerSeason({
            intake: intakeState,
            plans: [activeSubscription, queuedSubscription]
                .map((row) => projectionPlanFromRow(row as Record<string, unknown> | null))
                .filter((p): p is ProjectionPlan => p !== null),
            skipCreditFils: money.ok
                ? skipCreditFilsFor({ planName: activeSubscription.plan_name, mealsPerDay: activeSubscription.meals_per_day ?? null, order: money.order })
                : null,
            todayAe: todayAeIso(),
            closureDates,
        })
    }
```

and add `season={season}` to the live `<ClientDashboard ...>`.

`src/app/dashboard/ClientDashboard.tsx`:
- Add `import type { CustomerSeason } from '@/contexts/season/domain/customer-season'`.
- Add to `interface Props` after `creditRows?: CreditRow[]`:

```ts
  /** Season end seen from this customer's plans (spec §7.2, N1, N3); null outside a wind-down. */
  season?: CustomerSeason | null
```

- Add `season = null` to the destructured props (after `creditRows = []`).
- Add `season={season}` to the `<ActiveDashboard ...>` element.

`src/app/dashboard/ActiveDashboard.tsx`:
- Add imports:

```ts
import { SeasonWrapUpChip } from './_shared/SeasonWrapUpChip'
import type { CustomerSeason } from '@/contexts/season/domain/customer-season'
```

- In the props destructuring replace `intakePause = INTAKE_NOT_PAUSED, creditRows = [] }: {` with `intakePause = INTAKE_NOT_PAUSED, creditRows = [], season = null }: {`, and in the props type add after `creditRows?: CreditRow[]`:

```ts
  season?: CustomerSeason | null
```

- Directly after the `{showPlanEndingPausedBanner && ( <PlanEndingPausedBanner ... /> )}` block on the desktop tree (around line 1543), add:

```tsx
        {season && <SeasonWrapUpChip wrapUpDay={season.wrapUpDay} />}
```

- On `<MobileHome ...>` add the prop `seasonChip={season ? <SeasonWrapUpChip wrapUpDay={season.wrapUpDay} /> : undefined}`.

`src/app/dashboard/_mobile/MobileHome.tsx`:
- In `interface Props` add after `orderBanner?: ReactNode`:

```ts
  /** "Semester wraps up {W}" chip while the season winds down (spec N1). */
  seasonChip?: ReactNode
```

- Add `seasonChip` to the destructured props of `MobileHome`.
- Replace `{orderBanner}` in the render (just above the planEndingBanner wrapper) with:

```tsx
      {orderBanner}
      {seasonChip}
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run src/contexts/season src/app/dashboard/_shared`
Expected: PASS.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

- [ ] **Step 5: Look at the chip**

Start the dev server from the worktree: `npm run dev -- -p 3100`. Open `http://localhost:3100/dashboard?preview=1&season=grant&verified=1` at 1280 wide and at 390 wide.
Expected: the chip "Semester wraps up {the fixture's end date}" sits under the greeting on both, with no sideways scroll. `?preview=1&verified=1` without `season` shows no chip. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/season/domain/customer-season.ts src/contexts/season/domain/customer-season.test.ts src/app/dashboard/_shared/season-notice-copy.ts src/app/dashboard/_shared/season-notice-copy.test.ts src/app/dashboard/_shared/SeasonWrapUpChip.tsx src/app/dashboard/page.tsx src/app/dashboard/ClientDashboard.tsx src/app/dashboard/ActiveDashboard.tsx src/app/dashboard/_mobile/MobileHome.tsx
git commit -m "feat(season): the dashboard knows the wrap-up day, and home says when the semester wraps up

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 11: Skip sheets say when a skip becomes credit

**Files:**
- Create: `src/app/dashboard/_shared/season-skip-copy.ts`
- Test: `src/app/dashboard/_shared/season-skip-copy.test.ts`
- Modify: `src/app/dashboard/ActiveDashboard.tsx`
- Modify: `src/app/dashboard/_shared/FutureSkipModal.tsx`

**Interfaces:**
- Consumes: Task 1 (`decideSkipOutcome`, `SkipOutcome`, `SkipSeen`, `SeasonSkipNotice`); Task 9 (`skipMeal(id, seen)`, `skipFutureDate(id, date, seen)`); Task 10 (`CustomerSeason`, `season` prop); Plan A `formatAed`, `formatShortDay`, `addDaysIso`.
- Produces:
  - `interface CreditedSkipCopy { body: string; cta: string; tileLabel: string; tileValue: string; blocked: boolean }`
  - `creditedSkipCopy(input: { wrapUpDay: string; creditFils: number | null; sameDay: boolean }): CreditedSkipCopy`
  - `seasonSkipSheet(outcome: SkipOutcome, wrapUpDay: string | null, sameDay: boolean): CreditedSkipCopy | null`
  - `creditedSkipToast(notice: SeasonSkipNotice): string`
  - `seasonToastFor(result: unknown): string | undefined`
  - `creditedUnskipBody(creditFils: number | null): string`
  - `FutureSkipModal` gains props `seasonSkip?: CreditedSkipCopy | null` and `seasonCreditFils?: number | null`
  - Stable ids: `skip-tonight-cancel`, `skip-tonight-confirm`, `future-skip-cancel`, `future-skip-confirm`

The sheets are `MobileSheet`s shared by desktop and mobile, so one change covers both. A normal skip and a buffer grant keep today's make-up day wording: a grant's make-up meal really is cooked.

- [ ] **Step 1: Write the failing test**

`src/app/dashboard/_shared/season-skip-copy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  creditedSkipCopy, seasonSkipSheet, creditedSkipToast, seasonToastFor, creditedUnskipBody,
} from './season-skip-copy'

// Anchors: Sat 3 Oct 2026 is the wrap-up day; Wed 16 Sep a future skip, Thu 17 Sep the day after.
describe('creditedSkipCopy', () => {
  it('names the wrap-up day and the amount', () => {
    expect(creditedSkipCopy({ wrapUpDay: '2026-10-03', creditFils: 1980, sameDay: true })).toEqual({
      body: "There's no delivery day left before Sat 3 Oct to move this meal to. Skip it and AED 19.80 goes to your wallet.",
      cta: 'Skip and add AED 19.80',
      tileLabel: 'Wallet',
      tileValue: '+AED 19.80',
      blocked: false,
    })
  })

  it('says a plan worth nothing in cash gets no credit', () => {
    expect(creditedSkipCopy({ wrapUpDay: '2026-10-03', creditFils: 0, sameDay: false })).toEqual({
      body: "There's no delivery day left before Sat 3 Oct to move this meal to. You can still skip it, but this meal is not moved to another day.",
      cta: 'Skip this day',
      tileLabel: 'End date',
      tileValue: 'No change',
      blocked: false,
    })
  })

  it('blocks the skip when the meal value is unknown', () => {
    const copy = creditedSkipCopy({ wrapUpDay: '2026-10-03', creditFils: null, sameDay: true })
    expect(copy.blocked).toBe(true)
    expect(copy.cta).toBe('Skip tonight')
    expect(copy.body).toContain('message us on WhatsApp')
  })

  it('never uses a dash', () => {
    for (const fils of [1980, 0, null]) {
      const copy = creditedSkipCopy({ wrapUpDay: '2026-10-03', creditFils: fils, sameDay: true })
      expect(`${copy.body} ${copy.cta} ${copy.tileValue}`).not.toMatch(/[–—]/)
    }
  })
})

describe('seasonSkipSheet', () => {
  it('only rewords a credited skip', () => {
    expect(seasonSkipSheet({ kind: 'normal' }, '2026-10-03', true)).toBeNull()
    expect(seasonSkipSheet({ kind: 'grant', makeUpDay: '2026-10-05' }, '2026-10-03', true)).toBeNull()
    expect(seasonSkipSheet({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 }, '2026-10-03', false)?.cta).toBe('Skip and add AED 19.80')
  })
})

describe('toasts', () => {
  it('says where the money is', () => {
    expect(creditedSkipToast({ outcome: 'credited', creditFils: 1980, creditStatus: 'approved', mealDate: '2026-09-14' })).toBe('Skipped. AED 19.80 is in your wallet.')
    expect(creditedSkipToast({ outcome: 'credited', creditFils: 1980, creditStatus: 'pending', mealDate: '2026-09-16' })).toBe('Skip scheduled. AED 19.80 arrives Thu 17 Sep.')
    expect(creditedSkipToast({ outcome: 'credited', creditFils: 0, creditStatus: 'none', mealDate: '2026-09-16' })).toBe('Skipped. This meal is not moved to another day.')
  })

  it('reads the notice off an action result', () => {
    expect(seasonToastFor({ success: true, seasonSkip: { outcome: 'credited', creditFils: 1980, creditStatus: 'approved', mealDate: '2026-09-14' } })).toBe('Skipped. AED 19.80 is in your wallet.')
    expect(seasonToastFor({ success: true })).toBeUndefined()
    expect(seasonToastFor(null)).toBeUndefined()
  })
})

describe('creditedUnskipBody', () => {
  it('says the credit waiting for the day is cancelled', () => {
    expect(creditedUnskipBody(1980)).toBe('Your meal for that day will be delivered, and the AED 19.80 waiting for it is cancelled.')
    expect(creditedUnskipBody(0)).toBe('Your meal for that day will be delivered.')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/dashboard/_shared/season-skip-copy.test.ts`
Expected: FAIL with "Failed to resolve import './season-skip-copy'".

- [ ] **Step 3: Write the copy module**

`src/app/dashboard/_shared/season-skip-copy.ts`:

```ts
/**
 * Words for a skip that becomes wallet credit near the season end (spec §7.2, N6).
 * Pure so vitest can pin every sentence. A normal skip and a buffer grant keep
 * the existing make-up day copy: their make-up meal is really cooked.
 */

import { formatAed } from '@/contexts/season/domain/meal-value'
import { addDaysIso, formatShortDay } from '@/contexts/season/domain/season-dates'
import type { SeasonSkipNotice, SkipOutcome } from '@/contexts/season/domain/skip-outcome'

export interface CreditedSkipCopy {
  body: string
  cta: string
  tileLabel: string
  tileValue: string
  /** True when the skip cannot be confirmed (meal value unknown). */
  blocked: boolean
}

export function creditedSkipCopy(input: { wrapUpDay: string; creditFils: number | null; sameDay: boolean }): CreditedSkipCopy {
  const lead = `There's no delivery day left before ${formatShortDay(input.wrapUpDay)} to move this meal to.`
  const plainCta = input.sameDay ? 'Skip tonight' : 'Skip this day'
  if (input.creditFils == null) {
    return {
      body: `${lead} We can't work out this meal's value yet, so message us on WhatsApp before you skip it.`,
      cta: plainCta, tileLabel: 'Wallet', tileValue: 'Not known yet', blocked: true,
    }
  }
  if (input.creditFils <= 0) {
    return {
      body: `${lead} You can still skip it, but this meal is not moved to another day.`,
      cta: plainCta, tileLabel: 'End date', tileValue: 'No change', blocked: false,
    }
  }
  const amount = formatAed(input.creditFils)
  return {
    body: `${lead} Skip it and ${amount} goes to your wallet.`,
    cta: `Skip and add ${amount}`, tileLabel: 'Wallet', tileValue: `+${amount}`, blocked: false,
  }
}

export function seasonSkipSheet(outcome: SkipOutcome, wrapUpDay: string | null, sameDay: boolean): CreditedSkipCopy | null {
  if (outcome.kind !== 'credited' || !wrapUpDay) return null
  return creditedSkipCopy({ wrapUpDay, creditFils: outcome.creditFils, sameDay })
}

export function creditedSkipToast(notice: SeasonSkipNotice): string {
  if (notice.creditStatus === 'none' || notice.creditFils <= 0) return 'Skipped. This meal is not moved to another day.'
  const amount = formatAed(notice.creditFils)
  if (notice.creditStatus === 'approved') return `Skipped. ${amount} is in your wallet.`
  return `Skip scheduled. ${amount} arrives ${formatShortDay(addDaysIso(notice.mealDate, 1))}.`
}

export function seasonToastFor(result: unknown): string | undefined {
  const notice = (result as { seasonSkip?: SeasonSkipNotice } | null)?.seasonSkip
  return notice?.outcome === 'credited' ? creditedSkipToast(notice) : undefined
}

export function creditedUnskipBody(creditFils: number | null): string {
  return creditFils != null && creditFils > 0
    ? `Your meal for that day will be delivered, and the ${formatAed(creditFils)} waiting for it is cancelled.`
    : 'Your meal for that day will be delivered.'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/dashboard/_shared/season-skip-copy.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Wire the sheets**

`src/app/dashboard/_shared/FutureSkipModal.tsx`:

(a) Add imports:

```ts
import { creditedUnskipBody, type CreditedSkipCopy } from './season-skip-copy'
```

(b) In `interface Props` add after `closureDates?: string[]`:

```ts
    /** Season wind-down: credited-skip wording for a new skip; null keeps the make-up day wording. */
    seasonSkip?: CreditedSkipCopy | null
    /** Season wind-down: the credit a credited day's un-skip cancels, in fils. */
    seasonCreditFils?: number | null
```

(c) Add `seasonSkip = null, seasonCreditFils = null` to the destructured props after `closureDates = []`.

(d) Replace the `subline` constant with:

```ts
    const creditedUnskip = isUnskip && !!selectedDate && (sub.credited_skip_dates ?? []).includes(selectedDate)
    const subline = isUnskip
        ? (creditedUnskip
            ? creditedUnskipBody(seasonCreditFils)
            : 'Your meal for that day will be delivered. The make-up day at the end of your cycle will be removed.')
        : (seasonSkip
            ? seasonSkip.body
            : 'You won’t get a meal that day. We’ll add a make-up day at the end of your cycle so you still get every meal you paid for.')
```

(e) Replace the `ctaText` constant with:

```ts
    const ctaText = isUnskip
        ? 'Un-skip this day'
        : (selectedDate ? (seasonSkip ? seasonSkip.cta : 'Skip this day') : 'Pick a date')
    const skipBlocked = !isUnskip && !!seasonSkip?.blocked
```

(f) In `onConfirm`, replace `if (!selectedDate || isPending) return` with `if (!selectedDate || isPending || skipBlocked) return`.

(g) In `footer`, add `id="future-skip-cancel"` to the Cancel button and `id="future-skip-confirm"` to the confirm button; on the confirm button replace `disabled={!selectedDate || isPending}` with `disabled={!selectedDate || isPending || skipBlocked}`, `cursor: selectedDate && !isPending ? 'pointer' : 'not-allowed',` with `cursor: selectedDate && !isPending && !skipBlocked ? 'pointer' : 'not-allowed',` and `opacity: selectedDate && !isPending ? 1 : 0.55,` with `opacity: selectedDate && !isPending && !skipBlocked ? 1 : 0.55,`.

`src/app/dashboard/ActiveDashboard.tsx`:

(a) Add imports:

```ts
import { decideSkipOutcome, type SkipOutcome, type SkipSeen } from '@/contexts/season/domain/skip-outcome'
import { seasonSkipSheet, seasonToastFor } from './_shared/season-skip-copy'
```

(b) Replace `notifyDone`:

```ts
  const notifyDone = (key: ActionKey, message?: string) => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmMsg(message ?? CONFIRM_MESSAGES[key])
    confirmTimer.current = setTimeout(() => setConfirmMsg(null), 4800)
  }
```

(c) In `act`, replace `notifyDone(actionKey)` with `notifyDone(actionKey, seasonToastFor(result))`. In `runFutureAction`, replace `notifyDone(actionKey)` with `notifyDone(actionKey, seasonToastFor(result))`.

(d) Replace `const handleSkipConfirm  = () => { setShowSkipConfirm(false); act(() => skipMeal(sub.id), 'skipped', 'skip') }` with:

```ts
  const handleSkipConfirm  = () => { setShowSkipConfirm(false); act(() => skipMeal(sub.id, seasonSeen), 'skipped', 'skip') }
```

and in `handleConfirmFutureSkip` replace `skipFutureDate(sub.id, date)` with `skipFutureDate(sub.id, date, seasonSeen)`.

(e) Directly after the `effectiveSub` object (the line `  }` that closes `const effectiveSub: Subscription = {`), add:

```ts
  // Season wind-down (spec §7.2): what one more skip does to this plan. The
  // answer is the same for any date, because it depends on the plan's end.
  const seasonSkipOutcome: SkipOutcome = season
    ? decideSkipOutcome({
        season: { phase: season.phase, wrapUpDay: season.wrapUpDay, closeDay: season.closeDay, bufferDays: season.bufferDays },
        plan: {
          endDate: effectiveSub.end_date,
          weekType: effectiveSub.week_type === '5DAYS' ? '5DAYS' : '6DAYS',
          skippedDates: effectiveSub.skipped_dates ?? [],
          bufferGrants: effectiveSub.season_buffer_grants ?? 0,
        },
        todayAe: todayAEIso,
        closureDates: new Set(season.closureDates),
        creditFils: season.skipCreditFils,
      })
    : { kind: 'normal' }
  // Sent with the skip so the server refuses rather than doing something else.
  const seasonSeen: SkipSeen = {
    outcome: seasonSkipOutcome.kind,
    creditFils: seasonSkipOutcome.kind === 'credited' ? seasonSkipOutcome.creditFils : null,
  }
  const sameDaySeasonSheet = seasonSkipSheet(seasonSkipOutcome, season?.wrapUpDay ?? null, true)
  const futureSeasonSheet = seasonSkipSheet(seasonSkipOutcome, season?.wrapUpDay ?? null, false)
```

(f) In the "Skip tonight's meal" `MobileSheet`:
- Cancel button: add `id="skip-tonight-cancel"`.
- Confirm button: add `id="skip-tonight-confirm"` and `disabled={!!sameDaySeasonSheet?.blocked}`; replace its text `Skip tonight` with `{sameDaySeasonSheet ? sameDaySeasonSheet.cta : 'Skip tonight'}`.
- Replace the body paragraph's text `You won&rsquo;t lose this meal — we&rsquo;ll add a make-up day at the end of your plan, so your end date just moves out by one delivery day.` with the following. The rewritten fallback sentence loses its dash (customer copy has none):

```tsx
            {sameDaySeasonSheet
              ? sameDaySeasonSheet.body
              : <>You won&rsquo;t lose this meal. We&rsquo;ll add a make-up day at the end of your plan, so your end date just moves out by one delivery day.</>}
```

- In the data row, replace the label text `End date` with `{sameDaySeasonSheet ? sameDaySeasonSheet.tileLabel : 'End date'}` and `<span style={{ color: OG }}>+1 day</span>` with `<span style={{ color: OG }}>{sameDaySeasonSheet ? sameDaySeasonSheet.tileValue : '+1 day'}</span>`.

(g) On `<FutureSkipModal ...>` add `seasonSkip={futureSeasonSheet}` and `seasonCreditFils={season?.skipCreditFils ?? null}`.

- [ ] **Step 6: Typecheck, lint, and look at both sheets**

Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

Start `npm run dev -- -p 3100`. Open `http://localhost:3100/dashboard?preview=1&verified=1&season=credited` before 14:00 Dubai time (pass `&now=` with a Monday to Saturday date if needed, and fake the browser clock to 10:00 Dubai time on that date, as the atlas harness does). At 1280 wide tap the Skip action; at 390 wide tap the hero Skip button. Expected on both: the sheet reads "There's no delivery day left before {the fixture's end date} to move this meal to. Skip it and AED 19.80 goes to your wallet.", the tile reads "Wallet +AED 19.80", the button reads "Skip and add AED 19.80". Close it, open "Plan a skip", pick any day: the same sentence and button. Repeat with `season=grant`: today's make-up day wording is unchanged. Take screenshots of the four sheets into your scratch directory. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/_shared/season-skip-copy.ts src/app/dashboard/_shared/season-skip-copy.test.ts src/app/dashboard/ActiveDashboard.tsx src/app/dashboard/_shared/FutureSkipModal.tsx
git commit -m "feat(season): the skip sheet says when a skip turns into wallet credit, and how much

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: A credited day never claims a make-up day

**Files:**
- Modify: `src/app/dashboard/_shared/menu-day-status.ts`
- Test: `src/app/dashboard/_shared/menu-day-status.test.ts`
- Modify: `src/app/dashboard/menu/MenuClient.tsx`
- Modify: `src/app/dashboard/menu/page.tsx`
- Modify: `src/app/dashboard/PlanProgress.tsx`
- Modify: `src/app/dashboard/_mobile/MobileHome.tsx`
- Modify: `src/app/dashboard/ActiveDashboard.tsx`

**Interfaces:**
- Consumes: Task 2 dashboard `Subscription.credited_skip_dates`; Task 5 live column (read through `select('*')`).
- Produces:
  - `MenuPlan.credited_skip_dates?: string[] | null`
  - `MobileHomeData.creditedSkipDates: string[]`
  - Menu preview `?preview=1&state=credited`

A credited skip is still a skipped day, so `classifyMenuDay` already returns `today-skipped`, `past-skipped` or `future-skipped` for it and needs no new reason. Only the wording changes: every one of those notes, the plan bar footnote and the mobile cell detail says the day "is added to the end of your plan", which is false for a credited day.

- [ ] **Step 1: Write the failing test**

Append to `src/app/dashboard/_shared/menu-day-status.test.ts`:

```ts
describe('a skip that became wallet credit (season wind-down)', () => {
  // TODAY is Thu 17 Sep; TUE is past, NEXT_MON is ahead.
  const credited = plan({ skipped_dates: [TUE, THU, NEXT_MON], credited_skip_dates: [TUE, THU, NEXT_MON] })

  it('is classified exactly like any skipped day', () => {
    expect(classifyMenuDay(TUE, ctx(credited))).toBe('past-skipped')
    expect(classifyMenuDay(THU, ctx(credited))).toBe('today-skipped')
    expect(classifyMenuDay(NEXT_MON, ctx(credited))).toBe('future-skipped')
  })

  it('says the value went to the wallet instead of a make-up day', () => {
    expect(noDeliveryNote('past-skipped', TUE, ctx(credited))).toBe('You skipped this day, and its value went to your wallet.')
    expect(noDeliveryNote('today-skipped', THU, ctx(credited))).toBe("You skipped tonight. There was no delivery day left before the semester wraps up, so this meal's value went to your wallet.")
    expect(noDeliveryNote('future-skipped', NEXT_MON, ctx(credited))).toBe("You've scheduled a skip for this day. There's no delivery day left before the semester wraps up to move it to, so its value goes to your wallet.")
    for (const [reason, day] of [['past-skipped', TUE], ['today-skipped', THU], ['future-skipped', NEXT_MON]] as const) {
      expect(noDeliveryNote(reason, day, ctx(credited))).not.toMatch(/end of your plan|[–—]/)
    }
  })

  it('leaves a normal skip saying the day is added to the end of the plan', () => {
    expect(noDeliveryNote('future-skipped', NEXT_MON, ctx(plan({ skipped_dates: [NEXT_MON] })))).toMatch(/end of your plan/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/dashboard/_shared/menu-day-status.test.ts`
Expected: FAIL. `credited_skip_dates` is not a `MenuPlan` field (type error ignored by vitest) and the notes still say "end of your plan".

- [ ] **Step 3: Write the implementation**

`src/app/dashboard/_shared/menu-day-status.ts`:

(a) In `interface MenuPlan` add after `resume_cutoff_date?: string | null`:

```ts
  /** Skipped days whose meal became wallet credit near the season end (spec §7.2). */
  credited_skip_dates?: string[] | null
```

(b) Add above `noDeliveryNote`:

```ts
/** A skipped day paid back as wallet credit, not with a make-up day. */
function creditedOn(plan: MenuPlan | null, iso: string): boolean {
  return (plan?.credited_skip_dates ?? []).includes(iso)
}
```

(c) Replace the `today-skipped`, `past-skipped` and `future-skipped` cases of `noDeliveryNote` with:

```ts
    case 'today-skipped':
      if (p?.resume_cutoff_date === ctx.todayIso) {
        return "You resumed after the 2 PM kitchen cutoff, so this dinner isn't coming tonight. The day moves to the end of your plan."
      }
      return creditedOn(p, iso)
        ? "You skipped tonight. There was no delivery day left before the semester wraps up, so this meal's value went to your wallet."
        : "You skipped tonight, so this dinner won't come to you. The day is added to the end of your plan."
    case 'past-skipped':
      return creditedOn(p, iso) ? 'You skipped this day, and its value went to your wallet.' : 'You skipped this day.'
    case 'future-skipped':
      return creditedOn(p, iso)
        ? "You've scheduled a skip for this day. There's no delivery day left before the semester wraps up to move it to, so its value goes to your wallet."
        : "You've scheduled a skip for this day, so this dinner won't come to you. The day is added to the end of your plan."
```

`src/app/dashboard/menu/MenuClient.tsx`: in `interface ActiveSubLike` add after `plan_name?: string | null`:

```ts
  // Skipped days paid back as wallet credit (season wind-down). Carried into
  // MenuPlan so the day notes stop promising a make-up day.
  credited_skip_dates?: string[] | null
```

`src/app/dashboard/menu/page.tsx`:
- In the harness comment replace `//          | plan-ends | last-day | scheduled | held | resumed | midweek | ended` with `//          | plan-ends | last-day | scheduled | held | resumed | midweek | ended | credited`.
- In the `sub` ternary, add before `: st === 'paused'`:

```ts
      // Season wind-down: yesterday's skip and one two days out became wallet credit.
      : st === 'credited' ? planRow({ skipped_dates: [d(-1), d(2)], credited_skip_dates: [d(-1), d(2)] })
```

`src/app/dashboard/PlanProgress.tsx`:
- After the `skipDateSet` `useMemo`, add:

```ts
    const creditedDateSet = useMemo(
        () => new Set(sub.credited_skip_dates ?? []),
        [sub.credited_skip_dates],
    )
```

- In the pill `switch (state)` (where `pillIso` and `isPast` are in scope), replace the `footnote = 'Added 1 day to your cycle'` line of `case 'skipped':` with:

```ts
                            footnote = creditedDateSet.has(pillIso)
                                ? (isPast ? 'Value added to your wallet' : 'Value goes to your wallet')
                                : 'Added 1 day to your cycle'
```

and the same line of `case 'today-skipped':` with:

```ts
                            footnote = creditedDateSet.has(pillIso) ? 'Value added to your wallet' : 'Added 1 day to your cycle'
```

`src/app/dashboard/_mobile/MobileHome.tsx`:
- In `MobileHomeData` add after `skippedDates: string[]`:

```ts
  /** Skipped days whose meal became wallet credit (season wind-down); a subset of skippedDates. */
  creditedSkipDates: string[]
```

- After `const skipSet = new Set(data.skippedDates)` add `const creditedSet = new Set(data.creditedSkipDates)`.
- In the cell detail `stateDetail`, replace

```ts
          isToday && cellInfo.state === 'skipped' ? 'Tonight’s dinner is skipped — 1 day added to your cycle.'
```

with

```ts
          isToday && cellInfo.state === 'skipped' ? (creditedSet.has(cellInfo.iso) ? 'Tonight’s dinner is skipped. Its value went to your wallet.' : 'Tonight’s dinner is skipped, and 1 day is added to your cycle.')
```

and

```ts
          : cellInfo.state === 'skipped' ? 'This meal was skipped — your end date extended by 1 day.'
```

with

```ts
          : cellInfo.state === 'skipped' ? (creditedSet.has(cellInfo.iso)
              ? (cellInfo.iso > data.todayIso ? 'This meal is skipped. Its value goes to your wallet the day after.' : 'This meal was skipped, and its value went to your wallet.')
              : 'This meal was skipped, and your end date moved out by 1 day.')
```

Both rewritten non-credited strings lose their dash (customer copy has none). The other `stateDetail` strings are not touched.

`src/app/dashboard/ActiveDashboard.tsx`: in `mobileData` add after `skippedDates: effectiveSub.skipped_dates ?? [],`:

```ts
    creditedSkipDates: effectiveSub.credited_skip_dates ?? [],
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run src/app/dashboard/_shared/menu-day-status.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

- [ ] **Step 5: Look at the three surfaces**

Start `npm run dev -- -p 3100`.
- `http://localhost:3100/dashboard/menu?preview=1&state=credited` at 1280 and 390: open yesterday's and the day-after-tomorrow's dish sheet. Expected: "You skipped this day, and its value went to your wallet." and "You've scheduled a skip for this day. There's no delivery day left before the semester wraps up to move it to, so its value goes to your wallet."
- `http://localhost:3100/dashboard?preview=1&verified=1&season=credited` at 1280: hover the hatched pill two days ahead. Expected footnote "Value goes to your wallet". At 390: tap the same cell. Expected "This meal is skipped. Its value goes to your wallet the day after."
Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/_shared/menu-day-status.ts src/app/dashboard/_shared/menu-day-status.test.ts src/app/dashboard/menu/MenuClient.tsx src/app/dashboard/menu/page.tsx src/app/dashboard/PlanProgress.tsx src/app/dashboard/_mobile/MobileHome.tsx src/app/dashboard/ActiveDashboard.tsx
git commit -m "fix(season): a skipped day that became credit stops promising a make-up day

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The wallet shows skip credit, pending and ready

**Files:**
- Modify: `src/shared/credit-ledger.ts`
- Test: `src/shared/credit-ledger.test.ts`
- Create: `src/app/dashboard/credit/credit-rows.ts`
- Test: `src/app/dashboard/credit/credit-rows.test.ts`
- Modify: `src/app/dashboard/credit/page.tsx`
- Modify: `src/app/dashboard/credit/CreditClient.tsx`
- Modify: `src/app/dashboard/_mobile/MobileCredit.tsx`

**Interfaces:**
- Consumes: Task 6 credit rows (`source = 'season_skip'`, `meal_date`, `pending` / `approved`); Plan A `formatAed`, `formatShortDay`, `addDaysIso`.
- Produces:
  - `classifyCreditSource('season_skip')` → `{ label: 'Skipped meal credit', category: 'season' }`
  - `interface CreditRowFacts { amount_aed: number | string; status: 'pending' | 'approved' | 'applied'; created_at: string; meal_date?: string | null }`
  - `creditRowAmount(item: CreditRowFacts): string`
  - `creditRowDateLine(item: CreditRowFacts, dateLabel: (iso: string) => string): string`
  - `CreditItem.status` gains `'pending'`; `CreditItem` gains `meal_date?: string | null`
  - Credit preview `?preview=1&season=credited`

Pending season-skip credit is listed under "On the way" as "AED 19.80 · Arrives Thu 17 Sep" and never counts in the hero or at checkout (both read approved rows only). Ledger amounts switch to `formatAed`, so AED 19.80 no longer rounds to AED 20.

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/credit-ledger.test.ts` inside `describe('classifyCreditSource', ...)`:

```ts
  it('names skip credit from the season end as season money, not winnings', () => {
    expect(classifyCreditSource('season_skip')).toEqual({ label: 'Skipped meal credit', category: 'season' })
    expect(countsAsGameEarnings('season_skip')).toBe(false)
  })
```

`src/app/dashboard/credit/credit-rows.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { creditRowAmount, creditRowDateLine } from './credit-rows'

const label = (iso: string) => `added ${iso.slice(0, 10)}`

describe('creditRowAmount', () => {
  it('shows fils when there are any, and marks spent credit', () => {
    expect(creditRowAmount({ amount_aed: '19.80', status: 'pending', created_at: '2026-09-14T08:00:00Z' })).toBe('AED 19.80')
    expect(creditRowAmount({ amount_aed: 20, status: 'approved', created_at: '2026-09-14T08:00:00Z' })).toBe('AED 20')
    expect(creditRowAmount({ amount_aed: 25, status: 'applied', created_at: '2026-09-14T08:00:00Z' })).toBe('AED 25 used')
  })
})

describe('creditRowDateLine', () => {
  it('says when pending skip credit arrives: the day after the skipped meal', () => {
    // Wed 16 Sep skipped, so the credit arrives Thu 17 Sep.
    expect(creditRowDateLine({ amount_aed: 19.8, status: 'pending', created_at: '2026-09-14T08:00:00Z', meal_date: '2026-09-16' }, label)).toBe('Arrives Thu 17 Sep')
  })

  it('shows when other credit was added', () => {
    expect(creditRowDateLine({ amount_aed: 19.8, status: 'approved', created_at: '2026-09-14T08:00:00Z', meal_date: '2026-09-14' }, label)).toBe('added 2026-09-14')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shared/credit-ledger.test.ts src/app/dashboard/credit/credit-rows.test.ts`
Expected: FAIL. `season_skip` classifies as the "Credit" fallback; `./credit-rows` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`src/shared/credit-ledger.ts`: add to `EXACT` after the `intake_waitlist` line:

```ts
  season_skip:           { label: 'Skipped meal credit',  category: 'season' },
```

`src/app/dashboard/credit/credit-rows.ts`:

```ts
/**
 * How one credit row reads in the wallet ledger. Pure, shared by the desktop
 * and mobile ledgers, so a pending skip credit (spec §7.2 "Approval") says when
 * it arrives in the same words on both.
 */

import { formatAed } from '@/contexts/season/domain/meal-value'
import { addDaysIso, formatShortDay } from '@/contexts/season/domain/season-dates'

export interface CreditRowFacts {
  amount_aed: number | string
  status: 'pending' | 'approved' | 'applied'
  created_at: string
  meal_date?: string | null
}

export function creditRowAmount(item: CreditRowFacts): string {
  const amount = formatAed(Math.round(Number(item.amount_aed) * 100))
  return item.status === 'applied' ? `${amount} used` : amount
}

/** season_skip_credit_tick releases pending credit at 00:40 the night after the meal. */
export function creditRowDateLine(item: CreditRowFacts, dateLabel: (iso: string) => string): string {
  if (item.status === 'pending' && item.meal_date) return `Arrives ${formatShortDay(addDaysIso(item.meal_date, 1))}`
  return dateLabel(item.created_at)
}
```

`src/app/dashboard/credit/CreditClient.tsx`:
- Add `import { creditRowAmount, creditRowDateLine } from './credit-rows'`.
- In `type CreditItem` replace `status: 'approved' | 'applied'` with `status: 'pending' | 'approved' | 'applied'` and add `meal_date?: string | null` after `created_at: string`.
- In `CreditClient`, add `const pending = items.filter(i => i.status === 'pending')` after `const used = ...`, and render `{pending.length > 0 && <LedgerGroup title="On the way" items={pending} />}` directly above `{approved.length > 0 && (`.
- In `LedgerGroup`, replace `{creditDateLabel(item.created_at)}` with `{creditRowDateLine(item, creditDateLabel)}` and `AED {Math.round(Number(item.amount_aed))}{muted ? ' used' : ''}` with `{creditRowAmount(item)}`.

`src/app/dashboard/_mobile/MobileCredit.tsx`:
- Add `import { creditRowAmount, creditRowDateLine } from '../credit/credit-rows'`.
- Add `const pending = items.filter(i => i.status === 'pending')` after `const used = ...`, and render `{pending.length > 0 && <MobileLedger title="On the way" items={pending} />}` directly above `{approved.length > 0 && <MobileLedger title="Available" items={approved} />}`.
- In `MobileLedger`, replace `{creditDateLabel(item.created_at)}` with `{creditRowDateLine(item, creditDateLabel)}` and `AED {Math.round(Number(item.amount_aed))}{muted ? ' used' : ''}` with `{creditRowAmount(item)}`.

`src/app/dashboard/credit/page.tsx`:
- In the `searchParams` type add `season?: string`.
- Replace the preview return with:

```tsx
    const empty = params.empty === '1'
    // ?season=credited — a skip near the season end: one credit on the way, one ready.
    const seasonItems: CreditItem[] = params.season === 'credited' ? [
      { amount_aed: 19.8, eligible_plan_ids: null, source: 'season_skip', status: 'pending', created_at: '2026-09-14T08:00:00Z', meal_date: '2026-09-16' },
      { amount_aed: 19.8, eligible_plan_ids: null, source: 'season_skip', status: 'approved', created_at: '2026-09-12T08:00:00Z', meal_date: '2026-09-12' },
    ] : []
    return <CreditClient items={empty ? [] : [...seasonItems, ...PREVIEW_ITEMS]} creditByPlan={empty ? {} : PREVIEW_SPLIT} />
```

(the existing `const empty = params.empty === '1'` line is replaced by the first line above).
- In the live query replace `.select('amount_aed, eligible_plan_ids, source, status, created_at')` with `.select('amount_aed, eligible_plan_ids, source, status, created_at, meal_date')` and `.in('status', ['approved', 'applied'])` with `.or('status.in.(approved,applied),and(status.eq.pending,source.eq.season_skip)')`.

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run src/shared/credit-ledger.test.ts src/app/dashboard/credit src/app/dashboard/_shared/credit-outlook.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

- [ ] **Step 5: Look at the wallet**

Start `npm run dev -- -p 3100`. Open `http://localhost:3100/dashboard/credit?preview=1&season=credited` at 1280 and 390.
Expected on both: an "On the way" group with "Skipped meal credit", "Any plan", "Arrives Thu 17 Sep", "AED 19.80"; the "Available" group lists the second "Skipped meal credit" at "AED 19.80"; the hero amount is unchanged by the pending row. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/shared/credit-ledger.ts src/shared/credit-ledger.test.ts src/app/dashboard/credit/credit-rows.ts src/app/dashboard/credit/credit-rows.test.ts src/app/dashboard/credit/page.tsx src/app/dashboard/credit/CreditClient.tsx src/app/dashboard/_mobile/MobileCredit.tsx
git commit -m "feat(season): the wallet shows skipped meal credit, and when a pending one arrives

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 14: Who can save a spot while the season winds down

**Files:**
- Modify: `src/contexts/subscriptions/domain/intake-cycle.ts`
- Test: `src/contexts/subscriptions/domain/intake-cycle.test.ts`
- Modify: `src/contexts/subscriptions/usecases/join-intake-waitlist.ts`
- Test: `src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts`

**Interfaces:**
- Consumes: Plan A `SeasonPhase`, `Disposition`, `projectPlan`, `todayAeIso`, `IntakeState` (`phase`, `wrapUpDay`, `closeDay`, `salesStopped`); Task 10 `projectionPlanFromRow`; `taperWindow`, `taperedMaxStart` from `season-taper.ts`.
- Produces:
  - `PLAN_CAN_FOLLOW_MESSAGE: string`
  - `type JoinCycle = { ok: true; cycleStartedAt: string } | { ok: false; reason: 'not_paused' | 'no_cycle' | 'plan_can_follow' }`
  - `interface JoinCycleInput { paused: boolean; cycleStartedAt: string | null; phase?: SeasonPhase; wrapUpDay?: string | null; dispositions?: readonly Disposition[]; noPlanCanFollow?: boolean }`
  - `resolveJoinCycle(input: JoinCycleInput): JoinCycle`
  - `noPlanCanFollow(input: { salesStopped: boolean; paused: boolean; wrapUpDay: string; lastLiveEndDate: string | null; weekType: WeekType }): boolean`

Rule (see "§7.7 eligibility" in Scope decisions): during the break, anyone; winding down with a wrap-up day, a customer with a `customer_paused` or `runs_past` plan, or anyone for whom no Monthly or Weekly plan could follow their last live plan (or start now) and finish by W, stopped sales counting as "cannot follow"; with no wrap-up day, today's rule. It stays one join and one credit per customer per season (the unique index on `intake_waitlist`). The confirmation message and email are Plan E (N12).

- [ ] **Step 1: Write the failing tests**

Replace the import line of `src/contexts/subscriptions/domain/intake-cycle.test.ts` with:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveJoinCycle, noPlanCanFollow } from './intake-cycle'
```

and append:

```ts
// Anchors: 12:00 Dubai on Mon 14 Sep 2026; wrap-up day Sat 3 Oct.
const CYCLE = '2026-09-14T08:00:00.000Z'
const W = '2026-10-03'

describe('resolveJoinCycle while the season winds down', () => {
  const windDown = { paused: false, cycleStartedAt: CYCLE, phase: 'winding_down' as const, wrapUpDay: W }
  const ok = { ok: true, cycleStartedAt: CYCLE }

  it('lets a paused customer, or a plan running past the wrap-up day, save a spot', () => {
    expect(resolveJoinCycle({ ...windDown, dispositions: ['customer_paused'], noPlanCanFollow: false })).toEqual(ok)
    expect(resolveJoinCycle({ ...windDown, dispositions: ['runs_past'], noPlanCanFollow: false })).toEqual(ok)
  })

  it('refuses while a new plan can still follow', () => {
    expect(resolveJoinCycle({ ...windDown, dispositions: ['finishes'], noPlanCanFollow: false })).toEqual({ ok: false, reason: 'plan_can_follow' })
    expect(resolveJoinCycle({ ...windDown, dispositions: [], noPlanCanFollow: false })).toEqual({ ok: false, reason: 'plan_can_follow' })
  })

  it('lets anyone save a spot once no plan can follow theirs (spec §2.2)', () => {
    expect(resolveJoinCycle({ ...windDown, dispositions: ['finishes'], noPlanCanFollow: true })).toEqual(ok)
    expect(resolveJoinCycle({ ...windDown, dispositions: [], noPlanCanFollow: true })).toEqual(ok)
  })

  it('opens to everyone during the break', () => {
    expect(resolveJoinCycle({ ...windDown, phase: 'break', dispositions: ['finishes'], noPlanCanFollow: false })).toEqual(ok)
  })

  it('keeps the old rule when no wrap-up day is set', () => {
    expect(resolveJoinCycle({ paused: true, cycleStartedAt: CYCLE, phase: 'winding_down', wrapUpDay: null })).toEqual(ok)
    expect(resolveJoinCycle({ paused: false, cycleStartedAt: CYCLE, phase: 'open', wrapUpDay: null })).toEqual({ ok: false, reason: 'not_paused' })
  })

  it('still needs a stamped cycle', () => {
    expect(resolveJoinCycle({ ...windDown, cycleStartedAt: null, dispositions: ['customer_paused'] })).toEqual({ ok: false, reason: 'no_cycle' })
  })
})

describe('noPlanCanFollow', () => {
  afterEach(() => vi.useRealTimers())

  it('is true while sales are stopped', () => {
    expect(noPlanCanFollow({ salesStopped: true, paused: true, wrapUpDay: W, lastLiveEndDate: null, weekType: '6DAYS' })).toBe(true)
  })

  it('is false when a Weekly plan bought today still finishes by the wrap-up day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T08:00:00Z'))
    // A Weekly Flex from Mon 14 Sep ends Sat 19 Sep.
    expect(noPlanCanFollow({ salesStopped: false, paused: false, wrapUpDay: W, lastLiveEndDate: null, weekType: '6DAYS' })).toBe(false)
  })

  it('is true when nothing that follows a plan ending Mon 28 Sep can finish by Sat 3 Oct', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T08:00:00Z'))
    // The earliest Weekly Flex after it starts Tue 29 Sep and ends Mon 5 Oct.
    expect(noPlanCanFollow({ salesStopped: false, paused: false, wrapUpDay: W, lastLiveEndDate: '2026-09-28', weekType: '6DAYS' })).toBe(true)
  })
})
```

In `src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts`:
- Add `afterEach` to the `vitest` import.
- Add `subsMock: vi.fn(),` to the `vi.hoisted(() => ({ ... }))` object and `subsMock` to its destructuring.
- Add below the other `vi.mock` calls: `vi.mock('@/infra/supabase/subscriptions-repo', () => ({ getCompanyClosureDates: async () => [] }))`.
- In the admin client mock's `from(table)`, add as the first branch: `if (table === 'subscriptions') return { select: () => ({ eq: () => ({ in: subsMock }) }) }`.
- Add `import { PLAN_CAN_FOLLOW_MESSAGE } from '../domain/intake-cycle'` next to the other imports from `../domain`.
- Append:

```ts
describe('saving a spot while the season winds down (spec §7.7, §2.2)', () => {
  // 12:00 Dubai on Mon 14 Sep 2026; wrap-up day Sat 3 Oct, sales still open.
  const WIND_DOWN = { ...STATE, paused: false, phase: 'winding_down', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', bufferDays: 1, salesStopped: false }
  const planRow = (over: Record<string, unknown> = {}) => ({
    id: 'p1', customer_id: 'u1', plan_name: 'Monthly Premium', status: 'Active',
    start_date: '2026-08-24', end_date: '2026-09-19', week_type: '6DAYS', meals_per_day: 1,
    total_meals: 24, delivered_meals: 18, credited_skip_days: 0, season_buffer_grants: 0, skipped_dates: [],
    planned_pause_start: null, staff_approval: null, last_delivery_tick_date: '2026-09-12', ...over,
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T08:00:00Z'))
    getIntakeStateMock.mockResolvedValue(WIND_DOWN)
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Non Veg', week_type: '6DAYS' }, error: null })
  })
  afterEach(() => vi.useRealTimers())

  it('refuses a customer whose plan finishes and can still be followed', async () => {
    // The plan ends Sat 19 Sep; a Weekly Flex from Mon 21 Sep still ends by Sat 3 Oct.
    subsMock.mockResolvedValue({ data: [planRow()], error: null })
    expect(await joinIntakeWaitlist()).toEqual({ ok: false, alreadyJoined: false, creditAed: 0, message: PLAN_CAN_FOLLOW_MESSAGE })
    expect(insertWaitlistMock).not.toHaveBeenCalled()
  })

  it('lets a paused customer save a spot', async () => {
    subsMock.mockResolvedValue({ data: [planRow({ status: 'Paused' })], error: null })
    const result = await joinIntakeWaitlist()
    expect(result.ok).toBe(true)
    expect(insertWaitlistArgsMock).toHaveBeenCalledWith({ customer_id: 'u1', cycle_started_at: STATE.cycleStartedAt })
  })

  it('never saves a spot on a guess when the plans cannot be read', async () => {
    subsMock.mockResolvedValue({ data: null, error: { message: 'db down' } })
    expect(await joinIntakeWaitlist()).toEqual({ ok: false, alreadyJoined: false, creditAed: 0, message: 'We could not save your spot right now. Please try again shortly.' })
    expect(insertWaitlistMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/subscriptions/domain/intake-cycle.test.ts src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts`
Expected: FAIL. `noPlanCanFollow` and `PLAN_CAN_FOLLOW_MESSAGE` do not exist; the wind-down join still requires `paused`.

- [ ] **Step 3: Write the implementation**

Replace `src/contexts/subscriptions/domain/intake-cycle.ts` with:

```ts
/**
 * Which pause cycle does a waitlist join belong to, and may this customer
 * save a spot now?
 *
 * Pulled out of join-intake-waitlist.ts into its own pure module because
 * that file carries the `'use server'` directive, and Next.js only permits
 * async function exports from a `'use server'` module — `resolveJoinCycle`
 * is synchronous. See the header comment on
 * src/app/dashboard/_shared/intake-join-outcome.ts for the same constraint
 * applied to another pure helper.
 *
 * Season wind-down (spec §7.7 and §2.2): once a wrap-up day is set, a spot is
 * for customers whose dinners will not simply carry on. That is a customer
 * pause, a plan running past the wrap-up day, or no Monthly or Weekly plan
 * able to follow theirs (or start now) and still finish by it. During the
 * break anyone may save a spot. With no wrap-up day the old rule stands.
 */

import type { SeasonPhase } from '@/contexts/season/domain/season-phase'
import type { Disposition } from '@/contexts/season/domain/season-projection'
import type { WeekType } from './end-date'
import { taperWindow, taperedMaxStart } from './season-taper'

export const PLAN_CAN_FOLLOW_MESSAGE =
  'Your plan finishes before the semester wraps up and a new plan can still follow it, so there is no spot to save yet.'

export type JoinCycle =
  | { ok: true; cycleStartedAt: string }
  | { ok: false; reason: 'not_paused' | 'no_cycle' | 'plan_can_follow' }

export interface JoinCycleInput {
  paused: boolean
  cycleStartedAt: string | null
  /** Absent for callers that predate the season model; they get the old rule. */
  phase?: SeasonPhase
  wrapUpDay?: string | null
  /** Dispositions of the customer's live plans against the wrap-up day. */
  dispositions?: readonly Disposition[]
  /** No Monthly or Weekly plan could follow the customer's plans and finish by the wrap-up day. */
  noPlanCanFollow?: boolean
}

/**
 * A join is only valid while a spot can be saved AND the pause stamped a
 * cycle. `intake_waitlist.cycle_started_at` is NOT NULL, so an unstamped
 * cycle is refused rather than inserted with a null that would throw.
 */
export function resolveJoinCycle(input: JoinCycleInput): JoinCycle {
  const seasonRule = input.phase === 'break' || (input.phase === 'winding_down' && !!input.wrapUpDay)
  if (!seasonRule && !input.paused) return { ok: false, reason: 'not_paused' }
  if (!input.cycleStartedAt) return { ok: false, reason: 'no_cycle' }
  const ok: JoinCycle = { ok: true, cycleStartedAt: input.cycleStartedAt }
  if (!seasonRule || input.phase === 'break') return ok

  const dispositions = input.dispositions ?? []
  if (dispositions.includes('customer_paused') || dispositions.includes('runs_past') || input.noPlanCanFollow) return ok
  return { ok: false, reason: 'plan_can_follow' }
}

/**
 * True when no Monthly or Weekly plan bought now could start after the
 * customer's last live plan (or now, with none) and finish by the wrap-up day.
 * Uses the same taper the plan cards use, so the two never disagree.
 */
export function noPlanCanFollow(input: {
  salesStopped: boolean
  paused: boolean
  wrapUpDay: string
  lastLiveEndDate: string | null
  weekType: WeekType
}): boolean {
  if (input.salesStopped || input.paused) return true
  const window = taperWindow(input.lastLiveEndDate)
  const fits = (planId: 'monthly-premium' | 'weekly-flex') => taperedMaxStart({
    planId,
    weekType: input.weekType,
    minStart: window.minStart,
    maxStart: window.maxStart,
    lastDeliveryDay: input.wrapUpDay,
  }) !== null
  return !fits('monthly-premium') && !fits('weekly-flex')
}
```

`src/contexts/subscriptions/usecases/join-intake-waitlist.ts`:

(a) Replace `import { resolveJoinCycle } from '../domain/intake-cycle'` with:

```ts
import { resolveJoinCycle, noPlanCanFollow, PLAN_CAN_FOLLOW_MESSAGE } from '../domain/intake-cycle'
import { getCompanyClosureDates } from '@/infra/supabase/subscriptions-repo'
import { projectPlan, type Disposition, type ProjectionPlan } from '@/contexts/season/domain/season-projection'
import { projectionPlanFromRow } from '@/contexts/season/domain/customer-season'
import { todayAeIso } from '@/contexts/season/domain/season-dates'
import type { IntakeState } from '@/infra/config/intake'
```

(b) Add above `export async function joinIntakeWaitlist()`:

```ts
type SeasonJoinFacts = { dispositions?: Disposition[]; noPlanCanFollow?: boolean }

/**
 * The customer's plans read against the wrap-up day (spec §7.7, §2.2). Empty
 * outside a wind-down with a wrap-up day, where the old rule stands. Null when
 * the plans cannot be read: a spot, and its credit, is never saved on a guess.
 */
async function seasonJoinFacts(sb: AdminSupabaseClient, userId: string, intake: IntakeState): Promise<SeasonJoinFacts | null> {
  if (intake.phase !== 'winding_down' || !intake.wrapUpDay || !intake.closeDay) return {}
  const [subsRes, customerRes, closures] = await Promise.all([
    sb.from('subscriptions')
      .select('id, customer_id, plan_name, status, start_date, end_date, week_type, meals_per_day, total_meals, delivered_meals, credited_skip_days, season_buffer_grants, skipped_dates, planned_pause_start, staff_approval, last_delivery_tick_date')
      .eq('customer_id', userId)
      .in('status', ['Active', 'Skipped', 'Paused', 'Scheduled']),
    sb.from('customers').select('week_type').eq('id', userId).maybeSingle(),
    getCompanyClosureDates(),
  ])
  if (subsRes.error) return null

  const plans = ((subsRes.data ?? []) as Record<string, unknown>[])
    .map((row) => projectionPlanFromRow(row))
    .filter((p): p is ProjectionPlan => p !== null)
  const ctx = { todayAe: todayAeIso(), closureDates: new Set(closures), wrapUpDay: intake.wrapUpDay, closeDay: intake.closeDay }
  let lastLiveEndDate: string | null = null
  for (const p of plans) if (lastLiveEndDate === null || p.endDate > lastLiveEndDate) lastLiveEndDate = p.endDate
  const weekType = (customerRes.data as { week_type?: string } | null)?.week_type === '5DAYS' ? '5DAYS' : '6DAYS'

  return {
    dispositions: plans.map((p) => projectPlan(p, ctx).disposition),
    noPlanCanFollow: noPlanCanFollow({
      salesStopped: intake.salesStopped,
      paused: intake.paused,
      wrapUpDay: intake.wrapUpDay,
      lastLiveEndDate,
      weekType,
    }),
  }
}
```

(c) In `joinIntakeWaitlist`, replace

```ts
  const intake = await getIntakeState()
  const cycle = resolveJoinCycle(intake)
  if (!cycle.ok) {
    return {
      ...none,
      message: cycle.reason === 'not_paused'
        ? 'Plans are open. No need to save a spot.'
        : 'We could not save your spot right now. Please try again shortly.',
    }
  }

  const sb = createAdminSupabaseClient()
```

with

```ts
  const intake = await getIntakeState()
  const sb = createAdminSupabaseClient()
  const facts = await seasonJoinFacts(sb, user.id, intake)
  if (facts === null) {
    return { ...none, message: 'We could not save your spot right now. Please try again shortly.' }
  }
  const cycle = resolveJoinCycle({
    paused: intake.paused,
    cycleStartedAt: intake.cycleStartedAt,
    phase: intake.phase,
    wrapUpDay: intake.wrapUpDay,
    ...facts,
  })
  if (!cycle.ok) {
    return {
      ...none,
      message: cycle.reason === 'not_paused'
        ? 'Plans are open. No need to save a spot.'
        : cycle.reason === 'plan_can_follow'
          ? PLAN_CAN_FOLLOW_MESSAGE
          : 'We could not save your spot right now. Please try again shortly.',
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/contexts/subscriptions src/app/dashboard/_shared/intake-join-outcome.test.ts`
Expected: PASS, including every existing join test (their intake state has no `phase`, so the old rule applies).
Run: `npx tsc --noEmit -p .`
Expected: no errors. `src/app/admin/season/page.tsx` mentions `resolveJoinCycle` only in a comment and needs no change.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/subscriptions/domain/intake-cycle.ts src/contexts/subscriptions/domain/intake-cycle.test.ts src/contexts/subscriptions/usecases/join-intake-waitlist.ts src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts
git commit -m "feat(season): a customer can save a spot once no plan can follow theirs before the wrap-up day

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: The pause sheets name the wrap-up day

**Files:**
- Modify: `src/app/dashboard/_shared/season-notice-copy.ts`
- Test: `src/app/dashboard/_shared/season-notice-copy.test.ts`
- Modify: `src/app/dashboard/_shared/PlanPauseModal.tsx`
- Modify: `src/app/dashboard/ActiveDashboard.tsx`
- Modify: `src/app/dashboard/ClientDashboard.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: Plan A `SEASON_BREAK_RELEASE_LIVE`, `formatShortDay`; Task 10 `season` prop.
- Produces:
  - `seasonPauseLine(wrapUpDay: string, breakLive: boolean): string`
  - `ClientDashboard` and `ActiveDashboard` accept `seasonBreakLive?: boolean` (default `SEASON_BREAK_RELEASE_LIVE`)
  - `PlanPauseModal` accepts `seasonLine?: string | null`
  - Preview knob `&release=1` on `/dashboard?preview=1`
  - Stable id `season-pause-line` on the line in the pause confirm sheet, `season-pause-line-queued` in the queued warning, `season-pause-line-planned` in the planner

Gated (spec §7.3): with the break live the line adds "If you're still paused then, your plan waits for you until we're back."; before Plan C it only names the wrap-up day, because a pause past W simply carries on today.

- [ ] **Step 1: Write the failing test**

Replace the import in `src/app/dashboard/_shared/season-notice-copy.test.ts` with `import { seasonChipLabel, seasonPauseLine } from './season-notice-copy'` and append:

```ts
describe('seasonPauseLine (spec §7.3)', () => {
  it('only names the wrap-up day until the break exists', () => {
    expect(seasonPauseLine('2026-10-03', false)).toBe('The semester wraps up on Sat 3 Oct.')
  })

  it('says the plan waits once the break is live', () => {
    expect(seasonPauseLine('2026-10-03', true)).toBe("The semester wraps up on Sat 3 Oct. If you're still paused then, your plan waits for you until we're back.")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/dashboard/_shared/season-notice-copy.test.ts`
Expected: FAIL with "seasonPauseLine is not a function".

- [ ] **Step 3: Write the implementation**

Append to `src/app/dashboard/_shared/season-notice-copy.ts`:

```ts
/**
 * The line every pause sheet adds while the season winds down (spec §7.3).
 * The promise that the plan waits only appears once the break is live; before
 * that a pause past the wrap-up day simply carries on, so it is not said.
 */
export function seasonPauseLine(wrapUpDay: string, breakLive: boolean): string {
  const wraps = `The semester wraps up on ${formatShortDay(wrapUpDay)}.`
  return breakLive ? `${wraps} If you're still paused then, your plan waits for you until we're back.` : wraps
}
```

`src/app/dashboard/_shared/PlanPauseModal.tsx`:
- Add to `interface Props` after `onConfirm: (startDateIso: string) => void`:

```ts
    /** Season wind-down line (spec §7.3), or null outside a wind-down. */
    seasonLine?: string | null
```

- Add `seasonLine = null` to the destructured props.
- Directly after the intro `<div>` that begins "Pick when your pause begins." (the one ending `each paused day extends your cycle by one.`), add:

```tsx
            {seasonLine && (
                <div id="season-pause-line-planned" style={{ marginTop: 10, fontFamily: BODY, fontSize: 13, fontWeight: 600, color: S.fg, lineHeight: 1.55 }}>
                    {seasonLine}
                </div>
            )}
```

`src/app/dashboard/ActiveDashboard.tsx`:
- Add imports:

```ts
import { SEASON_BREAK_RELEASE_LIVE } from '@/contexts/season/domain/season-release'
import { seasonPauseLine } from './_shared/season-notice-copy'
```

- In the props destructuring replace `creditRows = [], season = null }: {` with `creditRows = [], season = null, seasonBreakLive = SEASON_BREAK_RELEASE_LIVE }: {` and add `seasonBreakLive?: boolean` to the props type after `season?: CustomerSeason | null`.
- After `const futureSeasonSheet = ...` (Task 11), add:

```ts
  const seasonPauseText = season ? seasonPauseLine(season.wrapUpDay, seasonBreakLive) : null
```

- In the "Pause your plan" `MobileSheet`, directly after the `Pauses available: <strong>1 of 1</strong>` `</div>`, add:

```tsx
          {seasonPauseText && (
            <div id="season-pause-line" style={{ marginTop: 12, fontFamily: BODY, fontSize: 13, fontWeight: 600, color: S.fg, lineHeight: 1.55 }}>
              {seasonPauseText}
            </div>
          )}
```

- In the queued-plan pause warning `MobileSheet`, directly above `{/* Two-column impact summary */}`, add:

```tsx
              {seasonPauseText && (
                <div id="season-pause-line-queued" style={{ marginTop: 12, fontFamily: BODY, fontSize: 13, fontWeight: 600, color: S.fg, lineHeight: 1.55 }}>
                  {seasonPauseText}
                </div>
              )}
```

- On `<PlanPauseModal ...>` add `seasonLine={seasonPauseText}`.

`src/app/dashboard/ClientDashboard.tsx`:
- Add to `interface Props` after `season?: CustomerSeason | null`:

```ts
  /** Preview only: word the season copy as if the break were live. Defaults to SEASON_BREAK_RELEASE_LIVE downstream. */
  seasonBreakLive?: boolean
```

- Add `seasonBreakLive` to the destructured props and `seasonBreakLive={seasonBreakLive}` to `<ActiveDashboard ...>`.

`src/app/dashboard/page.tsx`:
- Add `release?: string` to the `searchParams` type.
- Under the `?season=credited` harness comment line add `        //   &release=1        — word the pause line and notices as if the break were live`.
- On the preview `<ClientDashboard ...>` add `seasonBreakLive={params.release === '1' ? true : undefined}`.

- [ ] **Step 4: Run tests, typecheck, lint, and look**

Run: `npx vitest run src/app/dashboard/_shared/season-notice-copy.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

Start `npm run dev -- -p 3100`. At 1280 and 390, open `http://localhost:3100/dashboard?preview=1&verified=1&season=scheduled`, dismiss the notice if Task 16 is already in, tap Pause. Expected: "The semester wraps up on {W}." under "Pauses available". Tap "Pause from a future date instead": the same line under the intro. Repeat with `&release=1`: the second sentence appears. Repeat with `&sub=queued`: the line appears in the queued warning. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/_shared/season-notice-copy.ts src/app/dashboard/_shared/season-notice-copy.test.ts src/app/dashboard/_shared/PlanPauseModal.tsx src/app/dashboard/ActiveDashboard.tsx src/app/dashboard/ClientDashboard.tsx src/app/dashboard/page.tsx
git commit -m "feat(season): pausing near the season end names the wrap-up day, and promises nothing the break has not built

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: The season-end notice (N1, N3)

**Files:**
- Modify: `src/app/dashboard/_shared/season-notice-copy.ts`
- Test: `src/app/dashboard/_shared/season-notice-copy.test.ts`
- Create: `src/app/dashboard/_shared/SeasonScheduledNotice.tsx`
- Modify: `src/app/dashboard/ClientDashboard.tsx`

**Interfaces:**
- Consumes: Task 10 `CustomerSeason`, `SeasonNoticeKind`; Task 14 eligibility (the join refuses anyone not eligible); Task 15 `seasonBreakLive`; `joinIntakeWaitlist`, `deriveJoinOutcome`, `creditMechanicsLine`; Plan A `formatShortDay`, `formatAed`, `SEASON_BREAK_RELEASE_LIVE`.
- Produces:
  - `interface SeasonNoticeCopy { headline: string; body: string }`
  - `seasonNoticeCopy(input: { kind: SeasonNoticeKind; wrapUpDay: string; lastDinner: string | null; breakLive: boolean }): SeasonNoticeCopy`
  - `seasonNoticeSeenKey(cycleStartedAt: string | null, wrapUpDay: string): string`
  - `seasonJoinLine(creditAed: number): string | null`
  - `SeasonScheduledNotice(props: { kind: SeasonNoticeKind; wrapUpDay: string; lastDinner: string | null; breakLive: boolean; creditAed: number; alreadyJoined: boolean; onDismiss: () => void })`
  - Stable ids: `season-notice-join`, `season-notice-dismiss`

Shown once per season and wrap-up day (localStorage, like the intake takeovers), on the first visit after scheduling, to a customer with a live plan whose notice kind is set. It replaces the old "pausing" takeover whenever a wrap-up day is set (spec §2.2: the one-time notice moves to the moment the season end is scheduled). N1 is ungated. N3 is gated: interim "Your plan stays paused until you resume it." N3 offers Save my spot because Task 14 makes a paused customer eligible.

- [ ] **Step 1: Write the failing test**

Replace the import in `src/app/dashboard/_shared/season-notice-copy.test.ts` with `import { seasonChipLabel, seasonPauseLine, seasonNoticeCopy, seasonNoticeSeenKey, seasonJoinLine } from './season-notice-copy'` and append:

```ts
describe('seasonNoticeCopy', () => {
  it('N1: the meals keep coming, through the last dinner', () => {
    // Fri 2 Oct last dinner, Sat 3 Oct wrap-up day.
    expect(seasonNoticeCopy({ kind: 'finishes', wrapUpDay: '2026-10-03', lastDinner: '2026-10-02', breakLive: false })).toEqual({
      headline: 'Your meals keep coming.',
      body: "Every delivery you've paid for arrives, through Fri 2 Oct. The semester wraps up on Sat 3 Oct.",
    })
    expect(seasonNoticeCopy({ kind: 'finishes', wrapUpDay: '2026-10-03', lastDinner: null, breakLive: false }).body)
      .toBe("Every delivery you've paid for arrives. The semester wraps up on Sat 3 Oct.")
  })

  it('N3: promises nothing about a hold until the break is live', () => {
    const interim = seasonNoticeCopy({ kind: 'paused', wrapUpDay: '2026-10-03', lastDinner: null, breakLive: false })
    expect(interim).toEqual({ headline: 'The semester wraps up on Sat 3 Oct.', body: 'Your plan stays paused until you resume it.' })
    expect(interim.body).not.toMatch(/back|kept|refund|waits/i)
    expect(seasonNoticeCopy({ kind: 'paused', wrapUpDay: '2026-10-03', lastDinner: null, breakLive: true }).body)
      .toBe("Still paused then? Your plan waits for you until we're back.")
  })

  it('never uses a dash', () => {
    for (const kind of ['finishes', 'paused'] as const) {
      for (const breakLive of [false, true]) {
        const c = seasonNoticeCopy({ kind, wrapUpDay: '2026-10-03', lastDinner: '2026-10-02', breakLive })
        expect(`${c.headline} ${c.body}`).not.toMatch(/[–—]/)
      }
    }
  })
})

describe('seasonNoticeSeenKey', () => {
  it('shows again for a new season or a moved wrap-up day', () => {
    expect(seasonNoticeSeenKey('2026-09-14T08:00:00Z', '2026-10-03')).toBe('dormers:season-notice-ack:2026-09-14T08:00:00Z:2026-10-03')
    expect(seasonNoticeSeenKey(null, '2026-10-03')).toBe('dormers:season-notice-ack:none:2026-10-03')
  })
})

describe('seasonJoinLine', () => {
  it('offers the waitlist credit in the customer amount', () => {
    expect(seasonJoinLine(20)).toBe('Save your spot for next semester and AED 20 goes to your wallet.')
    expect(seasonJoinLine(0)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/dashboard/_shared/season-notice-copy.test.ts`
Expected: FAIL with "seasonNoticeCopy is not a function".

- [ ] **Step 3: Write the copy and the notice**

Append to `src/app/dashboard/_shared/season-notice-copy.ts` (and add `import { formatAed } from '@/contexts/season/domain/meal-value'` and `import type { SeasonNoticeKind } from '@/contexts/season/domain/customer-season'` to its imports):

```ts
export interface SeasonNoticeCopy {
  headline: string
  body: string
}

/** N1 (plans that finish) and N3 (customer pause), spec §12.2. */
export function seasonNoticeCopy(input: { kind: SeasonNoticeKind; wrapUpDay: string; lastDinner: string | null; breakLive: boolean }): SeasonNoticeCopy {
  const wrapUp = formatShortDay(input.wrapUpDay)
  if (input.kind === 'finishes') {
    const through = input.lastDinner ? `, through ${formatShortDay(input.lastDinner)}` : ''
    return {
      headline: 'Your meals keep coming.',
      body: `Every delivery you've paid for arrives${through}. The semester wraps up on ${wrapUp}.`,
    }
  }
  return {
    headline: `The semester wraps up on ${wrapUp}.`,
    body: input.breakLive ? "Still paused then? Your plan waits for you until we're back." : 'Your plan stays paused until you resume it.',
  }
}

/** Once per season and wrap-up day: moving W shows the notice again. */
export function seasonNoticeSeenKey(cycleStartedAt: string | null, wrapUpDay: string): string {
  return `dormers:season-notice-ack:${cycleStartedAt ?? 'none'}:${wrapUpDay}`
}

export function seasonJoinLine(creditAed: number): string | null {
  return creditAed > 0 ? `Save your spot for next semester and ${formatAed(Math.round(creditAed * 100))} goes to your wallet.` : null
}
```

`src/app/dashboard/_shared/SeasonScheduledNotice.tsx`:

```tsx
'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { CalendarClock } from 'lucide-react'
import { OG, BODY, TIER_POP_TEXT } from './tokens'
import { joinIntakeWaitlist } from '@/contexts/subscriptions/usecases/join-intake-waitlist'
import { deriveJoinOutcome, creditMechanicsLine, type JoinOutcome } from './intake-join-outcome'
import { seasonNoticeCopy, seasonJoinLine } from './season-notice-copy'
import type { SeasonNoticeKind } from '@/contexts/season/domain/customer-season'

interface Props {
  kind: SeasonNoticeKind
  wrapUpDay: string
  lastDinner: string | null
  breakLive: boolean
  /** Prospective waitlist credit for this customer's meal preference. */
  creditAed: number
  alreadyJoined: boolean
  onDismiss: () => void
}

/**
 * The one-time full-screen notice when the season end is scheduled (spec N1, N3).
 * Same family as IntakePauseTakeover: navy gradient, cream copy, pill buttons,
 * and a decline beside every offer. ClientDashboard owns the once-only rule.
 * Every amount shown after a join comes from the action's own result.
 */
export function SeasonScheduledNotice({ kind, wrapUpDay, lastDinner, breakLive, creditAed, alreadyJoined, onDismiss }: Props) {
  const reduceMotion = useReducedMotion()
  const router = useRouter()
  const [outcome, setOutcome] = useState<JoinOutcome | null>(null)
  const [joining, startJoin] = useTransition()
  const copy = seasonNoticeCopy({ kind, wrapUpDay, lastDinner, breakLive })
  const joinLine = kind === 'paused' && !alreadyJoined && !outcome?.joined ? seasonJoinLine(creditAed) : null

  const handleJoin = () => {
    startJoin(async () => {
      const next = deriveJoinOutcome(await joinIntakeWaitlist())
      setOutcome(next)
      if (next.joined) router.refresh()
    })
  }

  const pill = (primary: boolean): CSSProperties => primary ? {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minHeight: 48, padding: '14px 32px', borderRadius: 'var(--radius-pill)', border: 0,
    background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase', cursor: joining ? 'default' : 'pointer',
    boxShadow: '0 8px 28px rgba(245,127,32,0.50)',
  } : {
    minHeight: 44, padding: '10px 24px', borderRadius: 'var(--radius-pill)',
    border: '1px solid rgba(245,240,232,0.28)', background: 'transparent', color: TIER_POP_TEXT.primary,
    fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    cursor: 'pointer',
  }
  const line: CSSProperties = { margin: '0 0 18px 0', fontSize: 14, lineHeight: '22px', color: TIER_POP_TEXT.primary, textAlign: 'center' }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="season-notice-headline"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: `
          radial-gradient(ellipse 90% 60% at 92% -8%, rgba(245,127,32,0.13) 0%, transparent 55%),
          radial-gradient(ellipse 70% 50% at 8% 108%, rgba(255,170,0,0.07) 0%, transparent 55%),
          linear-gradient(135deg, #1c4255 0%, #0a1c2a 55%, #061421 100%)
        `,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px clamp(20px, 4vw, 48px)', fontFamily: BODY, color: TIER_POP_TEXT.primary, overflow: 'auto',
      }}
    >
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0.15 : 0.32 }}
        style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}
      >
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 72, height: 72, borderRadius: '50%', marginBottom: 28,
          background: `linear-gradient(135deg, ${OG} 0%, #ffaa00 100%)`, boxShadow: '0 12px 40px rgba(245,127,32,0.55)',
        }}>
          <CalendarClock size={34} strokeWidth={2.2} color="#fff" aria-hidden />
        </div>

        <h1 id="season-notice-headline" style={{ margin: '0 0 14px', fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#fdf8ef' }}>
          {copy.headline}
        </h1>
        <p style={{ margin: '0 auto 28px', maxWidth: 420, fontSize: 'clamp(14px, 1.5vw, 17px)', lineHeight: 1.55, color: 'rgba(245,238,222,0.78)' }}>
          {copy.body}
        </p>

        {joinLine && <p style={line}>{joinLine}</p>}
        {outcome?.message && <p style={line}>{outcome.message}</p>}
        {outcome?.joined && creditMechanicsLine(outcome.creditAed ?? 0) && (
          <p style={{ ...line, color: TIER_POP_TEXT.muted }}>{creditMechanicsLine(outcome.creditAed ?? 0)}</p>
        )}
        {outcome?.error && <p style={{ ...line, color: '#ffb4a2' }}>{outcome.error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {joinLine && (
            <button id="season-notice-join" type="button" onClick={handleJoin} disabled={joining} style={pill(true)}>
              {joining ? 'Saving your spot' : 'Save my spot'}
            </button>
          )}
          <button id="season-notice-dismiss" type="button" onClick={onDismiss} disabled={joining} style={pill(!joinLine)}>
            {joinLine ? 'Not now' : 'Got it'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
```

`src/app/dashboard/ClientDashboard.tsx`:

(a) Add imports:

```ts
import { SeasonScheduledNotice } from './_shared/SeasonScheduledNotice'
import { seasonNoticeSeenKey } from './_shared/season-notice-copy'
import { SEASON_BREAK_RELEASE_LIVE } from '@/contexts/season/domain/season-release'
```

(b) Directly after the `dismissReopenedTakeover` function, add:

```tsx
  // Season end scheduled (spec N1, N3): once per season and wrap-up day.
  // Pessimistic init, same reasoning as the intake takeovers above.
  const seasonNoticeKey = season ? seasonNoticeSeenKey(season.cycleStartedAt, season.wrapUpDay) : null
  const [seasonNoticeChecked, setSeasonNoticeChecked] = useState(false)
  const [seasonNoticeSeen, setSeasonNoticeSeen] = useState(true)
  useEffect(() => {
    try {
      setSeasonNoticeSeen(seasonNoticeKey == null ? true : !!window.localStorage.getItem(seasonNoticeKey))
    } catch {
      setSeasonNoticeSeen(true)
    }
    setSeasonNoticeChecked(true)
  }, [seasonNoticeKey])
  const dismissSeasonNotice = () => {
    try {
      if (seasonNoticeKey) window.localStorage.setItem(seasonNoticeKey, '1')
    } catch { /* storage disabled: treat as seen */ }
    setSeasonNoticeSeen(true)
  }
  const showSeasonNotice = seasonNoticeChecked && !seasonNoticeSeen && !!season?.notice && !!activeSubscription
```

(c) Replace

```ts
  const showPausingTakeover =
    intakeTakeoverChecked && !pausingSeen && intakePause.paused && !!activeSubscription
```

with

```ts
  // Once a wrap-up day is set, the season notice replaces this one (spec §2.2).
  const showPausingTakeover =
    intakeTakeoverChecked && !pausingSeen && intakePause.paused && !!activeSubscription && !season
```

(d) Directly above `if (showPausingTakeover) {`, add:

```tsx
  if (showSeasonNotice && season?.notice) {
    return (
      <SeasonScheduledNotice
        kind={season.notice}
        wrapUpDay={season.wrapUpDay}
        lastDinner={season.lastDinner}
        breakLive={seasonBreakLive ?? SEASON_BREAK_RELEASE_LIVE}
        creditAed={intakePause.creditAed}
        alreadyJoined={intakePause.alreadyJoined}
        onDismiss={dismissSeasonNotice}
      />
    )
  }
```

- [ ] **Step 4: Run tests, typecheck, lint, and look**

Run: `npx vitest run src/app/dashboard/_shared`
Expected: PASS.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

Start `npm run dev -- -p 3100`. In a fresh browser profile, at 1280 and 390:
- `/dashboard?preview=1&verified=1&season=scheduled`: "Your meals keep coming." with "through {the fixture's end date}" and the wrap-up day; one "Got it". Dismiss: home shows the chip. Reload: no notice.
- `/dashboard?preview=1&verified=1&sub=paused&season=paused&paused=1&joined=0`: "The semester wraps up on {W}.", "Your plan stays paused until you resume it.", "Save your spot for next semester and AED 15 goes to your wallet.", buttons "Save my spot" and "Not now".
- The same with `&release=1` (clear localStorage first): "Still paused then? Your plan waits for you until we're back."
- `/dashboard?preview=1&verified=1&paused=1`: the old pausing takeover still shows (no wrap-up day).
Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/_shared/season-notice-copy.ts src/app/dashboard/_shared/season-notice-copy.test.ts src/app/dashboard/_shared/SeasonScheduledNotice.tsx src/app/dashboard/ClientDashboard.tsx
git commit -m "feat(season): customers hear once, in the app, that the semester wraps up and what that means for them

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Final verification

**Files:**
- Create: `scripts/lib/chromium.mjs`
- Modify: `scripts/check-season-planner.mjs` (Plan A, already in the repo)
- Create: `scripts/check-season-customer.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: every preview knob from Tasks 10 to 16; Task 12's credited menu note `You skipped this day, and its value went to your wallet.` and its `state=credited` menu fixture; every rehearsal block from Tasks 5 to 8.
- Produces:
  - `launchChromium()` exported from `scripts/lib/chromium.mjs`: resolves an installed Chrome, puppeteer's cache or Playwright's, and returns Playwright's Chromium browser; exits the process when no Chrome is found. `scripts/check-season-planner.mjs` and `scripts/check-season-customer.mjs` both import it.
  - `npm run check:season-customer`.

- [ ] **Step 1: Move the Chromium discovery into one module**

`scripts/lib/chromium.mjs` (the three functions move unchanged from `scripts/check-season-planner.mjs`; only `launchChromium` is exported):

```js
/**
 * Chromium for the rendered checks (scripts/check-season-planner.mjs and
 * scripts/check-season-customer.mjs), so both agree on where a browser lives.
 * Any real Chrome will do: installed, puppeteer's cache, or Playwright's. It is
 * driven by the playwright bundled with the global @playwright/cli unless
 * PLAYWRIGHT_MODULE points at another copy.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'

const require = createRequire(import.meta.url)

function findUnder(root, names) {
  if (!existsSync(root)) return null
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    let entries = []
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (names.includes(e.name)) return p
    }
  }
  return null
}

/** Any real Chrome will do: installed, puppeteer's cache, or Playwright's. */
function resolveChrome() {
  const direct = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean)
  for (const c of direct) if (existsSync(c)) return c
  return findUnder(join(homedir(), '.cache', 'puppeteer'),
      ['Google Chrome for Testing', 'chrome', 'chrome-headless-shell', 'Chromium', 'chromium'])
    ?? findUnder(join(homedir(), 'Library', 'Caches', 'ms-playwright'),
      ['chrome-headless-shell', 'Chromium'])
}

/** Launches Playwright's Chromium driver against whatever Chrome resolveChrome() finds; exits when there is none. */
export async function launchChromium() {
  const executablePath = resolveChrome()
  if (!executablePath) {
    console.error('✗ No Chrome/Chromium found for playwright.\n' +
      '  Install once with:  npx @puppeteer/browsers install chrome@stable\n' +
      '  (or set PUPPETEER_EXECUTABLE_PATH/CHROME_PATH to a Chrome binary).')
    process.exit(1)
  }
  const { chromium } = require(
    process.env.PLAYWRIGHT_MODULE ?? execSync('npm root -g').toString().trim() + '/@playwright/cli/node_modules/playwright',
  )
  return chromium.launch({ headless: true, executablePath })
}
```

In `scripts/check-season-planner.mjs`, replace everything from `import { existsSync, readdirSync } from 'node:fs'` down to the closing `}` of `async function launchChromium()` with one line. That span is the five `node:` imports, `const require = createRequire(import.meta.url)`, the comment `// Chromium discovery, copied from scripts/check-waitlist-gate-fit.mjs's …`, and the functions `findUnder`, `resolveChrome` and `launchChromium`. The replacement line:

```js
import { launchChromium } from './lib/chromium.mjs'
```

Nothing else in that file uses the removed imports or `require`, and `const browser = await launchChromium()` stays as it is.

Run: `node --check scripts/lib/chromium.mjs && node --check scripts/check-season-planner.mjs`
Expected: no output (both parse).

- [ ] **Step 2: Write the rendered check**

`scripts/check-season-customer.mjs`:

```js
#!/usr/bin/env node
/**
 * Renders every Plan B customer preview state at desktop and phone width and
 * fails when the season copy is missing, promises a hold before the break is
 * live, the page scrolls sideways, or the console logs an error.
 * Needs the dev server: BASE_URL defaults to http://localhost:3000.
 * Screenshots go to SHOT_DIR when it is set.
 */
import { launchChromium } from './lib/chromium.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SHOT_DIR = process.env.SHOT_DIR ?? null

// expect / absent: text on the page after it loads. tap: a control pressed
// next (its first visible match); after: text that must then be on the page.
// clock: the browser's time, for a fixture pinned with &now= so the client
// reads the same day as the server.
const STATES = [
  { id: 'n1', url: '/dashboard?preview=1&verified=1&season=scheduled', expect: ['Your meals keep coming.', 'The semester wraps up on'], tap: '#season-notice-dismiss', after: ['Semester wraps up'] },
  { id: 'n3-interim', url: '/dashboard?preview=1&verified=1&sub=paused&season=paused&paused=1&joined=0', expect: ['Your plan stays paused until you resume it.', 'Save my spot'], absent: ["until we're back"] },
  { id: 'n3-live', url: '/dashboard?preview=1&verified=1&sub=paused&season=paused&paused=1&joined=0&release=1', expect: ["Still paused then? Your plan waits for you until we're back."] },
  { id: 'chip', url: '/dashboard?preview=1&verified=1&season=credited', expect: ['Semester wraps up'] },
  { id: 'wallet', url: '/dashboard/credit?preview=1&season=credited', expect: ['On the way', 'Skipped meal credit', 'Arrives Thu 17 Sep', 'AED 19.80'] },
  // Pinned to Thu 17 Sep 2026: the credited fixture's past skip is Wed 16 Sep.
  // Its card (desktop data-state, mobile data-reason) opens the dish with the
  // note Task 12 wrote for a past credited day.
  {
    id: 'menu',
    url: '/dashboard/menu?preview=1&state=credited&now=2026-09-17',
    clock: '2026-09-17T08:00:00Z',
    expect: [],
    tap: '[data-state="past-skipped"], [data-reason="past-skipped"]',
    after: ['You skipped this day, and its value went to your wallet.'],
  },
]

const failures = []
const browser = await launchChromium()
try {
  for (const state of STATES) {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors = []
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
      const label = `${state.id} @${width}`
      try {
        if (state.clock) await page.clock.install({ time: new Date(state.clock) })
        await page.goto(`${BASE}${state.url}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(600)
        const body = await page.locator('body').innerText()
        for (const text of state.expect) if (!body.includes(text)) failures.push(`${label}: missing "${text}"`)
        for (const text of state.absent ?? []) if (body.includes(text)) failures.push(`${label}: must not say "${text}"`)
        if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/season-customer-${state.id}-${width}.png`, fullPage: true })
        if (state.tap) {
          await page.locator(`${state.tap} >> visible=true`).first().click()
          await page.waitForTimeout(400)
          const after = await page.locator('body').innerText()
          for (const text of state.after ?? []) if (!after.includes(text)) failures.push(`${label}: after tapping ${state.tap}, missing "${text}"`)
          if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/season-customer-${state.id}-after-${width}.png`, fullPage: true })
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (overflow > 1) failures.push(`${label}: page scrolls sideways by ${overflow}px`)
        if (errors.length) failures.push(`${label}: console errors: ${errors.join(' | ')}`)
      } catch (err) {
        failures.push(`${label}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
      } finally {
        await page.close()
      }
    }
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`check-season-customer: ${failures.length} failure(s)\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`check-season-customer: ${STATES.length * 2} renders OK`)
```

Add to `package.json` `scripts`, after `check:season-planner`:

```json
    "check:season-customer": "node scripts/check-season-customer.mjs",
```

- [ ] **Step 3: Run the whole suite, the typecheck and lint**

Run: `npx vitest run`
Expected: every test passes.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

- [ ] **Step 4: Confirm §7.1 still holds**

Run: `grep -n "pauseScheduledFor" src/app/api/checkout/route.ts src/contexts/payments/usecases/free-checkout.ts "src/app/r/[cid]/actions.ts" src/contexts/staff/domain/staff-intake-gate.ts src/contexts/subscriptions/usecases/subscription-mutations.ts`
Expected: at least one match in each of the five files.

- [ ] **Step 5: Re-run every live rehearsal**

Run, in order, the rehearsal `DO` blocks from Task 5 Step 4, Task 6 Step 4, Task 7 Step 3 and Task 8 Step 8.
Expected: `CREDITED_TICKS_OK: ...`, `SEASON_SKIP_OK: ...`, `SKIP_CREDIT_TICK_OK: ...`, `RECONCILE_OK: schedule reconciled ok, repeated date counted once; move found nothing ok;`. A `REHEARSAL_SKIPPED` message must be reported with the live plan dates, not ignored.

Then, read-only:

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in ('season_projected_end','season_make_up_day','season_skip_credit_fils','season_skip','season_unskip','season_skip_credit_tick','season_reconcile_skips')
order by 1;
select jobname, schedule, active from cron.job where jobname = 'season_skip_credit_tick';
select count(*) filter (where credited_skip_days > 0) as credited_plans,
       count(*) filter (where season_buffer_grants > 0) as granted_plans,
       count(*) filter (where cardinality(credited_skip_dates) <> credited_skip_days) as mismatched
from public.subscriptions;
select season_phase, wrap_up_day, close_day, paused from public.intake_settings;
```

Expected: seven function names; one active `40 20 * * *` job; `mismatched = 0` (and `credited_plans`, `granted_plans` 0 unless a real customer has skipped since the deploy); the intake row as the owner left it (no wrap-up day scheduled or moved since Task 8, per Global Constraints, Deploy order).

Run: `npm run backfill:order-money` (dry run).
Expected: the same rows as Task 4 Step 6 and `"written": 0`, unless live-mode orders have appeared since.

- [ ] **Step 6: Render every preview state, and the planner after the move**

Start `npm run dev -- -p 3100` from the worktree root and wait until `http://localhost:3100/dashboard?preview=1` answers 200.

Run: `BASE_URL=http://localhost:3100 SHOT_DIR=<an existing scratch directory> npm run check:season-customer`
Expected: `check-season-customer: 12 renders OK`. Open the screenshots and confirm the notice, chip and wallet read as described in Tasks 10, 13 and 16 at both widths, and that the two `season-customer-menu-after-*` shots show the credited note in the dish sheet.

Run: `BASE_URL=http://localhost:3100 npm run check:season-planner`
Expected: `check-season-planner: 12 renders OK`, the same result as before the Chromium discovery moved into `scripts/lib/chromium.mjs`.

Then repeat the manual sheet checks from Task 11 Step 6 and Task 15 Step 4 once more on the final build. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/chromium.mjs scripts/check-season-planner.mjs scripts/check-season-customer.mjs package.json
git commit -m "test(season): a rendered check for every wind-down customer surface, sharing one Chromium launcher

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## After Plan B

1. Final whole-branch review (subagent-driven-development).
2. Merge into `main` alongside the other session's work, then deploy with `git push origin main:Production`.
3. Plan C picks up: §7.4 resume split sheet, §7.5 break refusal with N11, §7.6 break start-date refusal, G1 to G6 and G9, skip reconciliation on "End the season today" (spec §5 and §17.1 P3: `season_end_today` calls `season_reconcile_skips`, shipped with that action), and `season_project_plans` in SQL (lockstep with `projectPlan`; note that `projectPlan` walks to `end_date` without pushing it for closures still to come, while `projectedEndDate` in this plan does).
4. Plan E wires `announceSeasonSkipCredited` to the `season_skip_credited` template and adds N2 and N12.
5. Plan D keeps the refund flow; recording order money and the backfill moved into this plan (Tasks 3 and 4).
6. After the deploy, the next checkout's order row, test or live mode, shows `amount_paid_fils` and `credit_applied_fils`. Re-run `npm run backfill:order-money` once live payments start.

## Owner decisions (all decided 2026-09-15)

1. **What a credited skip is worth (spec D7):** what the customer paid for that meal, (card charge + wallet credit used) ÷ meals in the order × meals that day. New orders record it (Task 3) and live-plan orders are backfilled first (Task 4); only an order with no recorded money falls back to 90% of its list price.
2. **Stripe test mode:** production stays on Stripe test mode for the pilot, and test payments are not money. The backfill leaves `cs_test_` orders and card orders without Stripe ids null, so their plans use the fallback. The webhook and free checkout still record every new order.
3. **Skips already taken when the wrap-up day is set:** the spec's rule. A make-up meal that lands on a buffer day becomes credit unless the plan already holds a grant (Task 8).
4. **Pausing with a credited skip still ahead:** refused; the customer undoes that skip first, because otherwise the day is paid back twice (Task 9).
5. **Saving a spot when a plan finishes but nothing can follow it:** allowed, the spec §2.2 superset (Task 14).

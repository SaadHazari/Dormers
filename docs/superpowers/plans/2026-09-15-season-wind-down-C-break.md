# Season Wind-Down, Plan C: The Break Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the close day K the kitchen actually stops: the break tick holds every plan that still has meals, the delivery, status and failsafe ticks and the kitchen and rider counts stay quiet, nothing restarts during the break, customers see what happened to their plan in the app, and the owner can reopen so held plans restart when their customers tap Resume or pick a start date.

**Architecture:** One projection rule ("walk the meals left", Task 1) is written once in TypeScript and once in SQL (`_season_project_plan`, Task 2) and kept in lockstep by shared fixtures checked against live. SECURITY DEFINER SQL owns every break write: the guards inside the nightly ticks (G1, G4, G6), two triggers on `subscriptions` (G2 refuses a restart, G3 holds an arrival), `season_begin_break` behind `season_break_tick`, `season_reopen`, `season_release_hold` and a narrow `season_invariants_tick`. The app reads the phase fresh before a resume or start-date change (G9), filters the kitchen and rider counts through a pure gate (G5), and shows the hold on the dashboard, the menu and a break board on the Season page. `SEASON_BREAK_RELEASE_LIVE` flips in Task 15, together with the cron switch that makes the break real.

**Tech Stack:** Next.js 15 App Router (server components, server actions), TypeScript, Supabase Postgres (live project `yjjayivwfqjfppawgyaz` through the Supabase connector), pg_cron, pg_net, vitest (node environment), inline-styled dashboard components with `_shared/tokens`, Tailwind admin UI with `useAdminTheme`.

**Spec:** `docs/superpowers/specs/2026-09-14-season-wind-down-design.md` phase P3 (§17.1): §5 (break and reopen transitions, end today), §6.1 to §6.3, §7.4 to §7.6, §8, §9 (G1 to G6, G9, two G10 rules), §11.3, §12.2 (N7, N8, N9, N11), §13, §15. Builds on Plan A (`docs/superpowers/plans/2026-09-14-season-wind-down-A-foundation.md`, shipped) and Plan B (`docs/superpowers/plans/2026-09-15-season-wind-down-B-wind-down-rules.md`, committed at 20dbc38). Plan B's plan text is the source of its interfaces.

## Global Constraints

- **Preconditions (checked in Task 1 Step 1):** Plan B is merged into this branch and its live SQL is applied: migrations `season_credited_skip_ticks` (`subscriptions.credited_skip_dates` with CHECK `cardinality(credited_skip_dates) = credited_skip_days`, the credited cap in `subscription_delivery_tick`, the credited end condition in `subscription_status_tick`), `season_skip_functions` (`season_projected_end`, `season_make_up_day`, `season_skip_credit_fils`, `season_skip`, `season_unskip`), `season_skip_credit_tick` (cron `40 20 * * *`), `season_skip_guards` (`SEASON_UNSKIP_CREDITED_AFTER`, `SEASON_SKIP_BAD_DATE`, the `cs_test_` money rule) and `season_reconcile_skips`.
- **Money rule (Plan B `season_skip_guards`, spec D7):** recorded order money counts only on an order whose `stripe_session_id` is not a `cs_test_` session; otherwise the 90% list-price fallback applies for credit, and no exact meal value exists. Plan C stores `season_holds.meal_value_fils` only when it is exact under that rule (Task 5), so Plan D never refunds from an estimate. Plan C mints no money-valued credit of its own: the hold's waitlist credit is the fixed per-preference amount.
- **No credited date after the projected end** (Plan B invariant): nothing in Plan C changes `skipped_meals_count`, `bonus_meals`, `paused_days`, `closure_days` or `credited_skip_dates`, except `season_end_today` through Plan B's own `season_reconcile_skips`. Holds only change status; release moves a Scheduled plan's start date, and a Scheduled plan has no credited skips. Task 16 checks the invariant on live after the whole-break rehearsal.
- **Plan B's files exist (checked in Task 1 Step 1):** `src/contexts/season/domain/customer-season.ts`, `src/app/dashboard/_shared/season-notice-copy.ts`, `src/app/dashboard/_shared/SeasonScheduledNotice.tsx`, `src/contexts/season/usecases/season-skip-notices.ts`, `src/contexts/season/domain/season-skip-receipt.ts`, `scripts/check-season-customer.mjs`. If any is missing, stop and report.
- **Refunds are not live (spec D6, Plan D).** `SEASON_REFUNDS_LIVE = false` is added to `src/contexts/season/domain/season-release.ts` in Task 10. No Plan C surface shows a refund button or promises a refund. Every refund sentence (the §7.4 split sheet, the Season page copy that said "keep or refund") is gated on it. Holds are created with `cash_refund_fils`, `credit_share_fils` and every refund state unused.
- **Stripe is not read anywhere in Plan C** (spec D7: test-mode payments are not money).
- **Held test by meals:** meals left = `total_meals − delivered_meals − credited_skip_days × meals_per_day`. A plan is held when meals are left at the break, whatever its end date says.
- **Customer copy:** plain words, no emoji, no em or en dashes, the customer's own dates (`formatShortDay`) and amounts (`formatAed`). Admin copy follows the same rules. Stable `id` on every new or changed button; `data-testid` where a check reads a block.
- **Every new customer surface has desktop and mobile preview fixtures** (`?preview=1&...`), listed in Task 16.
- **Menu:** a held day is classified through `classifyMenuDay` in `src/app/dashboard/_shared/menu-day-status.ts` (Task 13), never a parallel check.
- **No new subscription insert** in app code. The G3 rehearsal inserts a row inside a rolled-back transaction and writes `meal_preference_type`.
- **Live database first.** Before changing any existing SQL function, read its live body with `select pg_get_functiondef('public.<name>'::regproc);` and compare it with the "before" body the task names, after collapsing every run of whitespace to one space and reading `SET search_path TO 'public'` as `SET search_path = public` and `$function$` as `$$`. A difference in a guard, column, value or statement stops the task: report it. Mirror every live migration verbatim into `supabase/migrations/20260916_<name>.sql` and apply with `apply_migration` using the file content without `BEGIN;` / `COMMIT;`. Never re-apply an older file from `supabase/migrations/`.
- **Every new SQL function** is `SET search_path = public` and has `REVOKE EXECUTE ... FROM public, anon, authenticated`. Functions that write are `SECURITY DEFINER`. App code calls them with `createAdminSupabaseClient()` and passes the customer id from `withOwnedSubscription`, never a client-supplied id.
- **Rehearsals:** every SQL change is rehearsed on live inside a `DO` block that raises at the end, so it rolls back; the error message is the report. `send_admin_whatsapp_alert` queues its request through `pg_net`, whose queue row is written in the same transaction, so a rolled-back rehearsal sends nothing. A message starting `FAIL` is a real failure; `REHEARSAL_SKIPPED` is reported with the live facts, never ignored.
- **SQL error codes** customers or admins can meet: `SEASON_BREAK`, `SEASON_BAD_PHASE`, `SEASON_NO_SETTINGS`, `SEASON_RELEASE_NOT_FOUND`, `SEASON_RELEASE_NOT_HELD`, `SEASON_RELEASE_NOT_READY`, `SEASON_RELEASE_BAD_STATUS`, `SEASON_RELEASE_BAD_INPUT`. The app never shows raw text.
- Anchor calendar for every test: Mon 2026-09-14; Mon 28 Sep, Tue 29 Sep, Wed 30 Sep, Thu 1 Oct, Fri 2 Oct, Sat 3 Oct, Sun 4 Oct, Mon 5 Oct, Tue 6 Oct, Wed 7 Oct.
- Work in the worktree `.claude/worktrees/season-wind-down` on branch `feat/season-wind-down`. Another session commits to `main`, and Plan B's implementer may still be editing files here: anchor every edit on the quoted text, never on line numbers. Stage only the paths listed in each task (`git add <paths>`); never `git add -A`, `git commit -a` or bare `git stash`.
- Commit messages end with: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Test: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit -p .`. Lint: `npm run lint`.

## Deploy order (read before Task 2)

1. Tasks 2 to 6 change live SQL. Each is safe while the previous app (Plan B) is deployed: every break branch is inert until `season_phase = 'break'`, and every buffer branch is inert until a wrap-up day has passed. Apply them in task order as each task is reviewed.
2. Task 15 switches the cron job. Apply it on the day Plan C deploys, after the final review, and never later than the day before the close day K the owner has scheduled.
3. All of Plan C (SQL and app) must be live before the first wrap-up day W the owner schedules has passed. Once W passes, Task 3's delivery tick cooks only buffer grants, and the kitchen screen must count the same plans (Task 8). If Plan C's review cannot finish at least two days before W, ask the owner to move W later rather than deploy half of it.
4. On 2026-09-15 the last meal on the books is Mon 28 Sep and no wrap-up day is set.

## Scope decisions

### The closure projection question (resolved)

Plan A's `projectPlan` walks from today to the stored `end_date`, skipping closure dates, so a closure still ahead makes the plan look one dinner short. Plan B's `projectedEndDate` pushes the end one delivery day per closure still ahead, which is what `subscription_closure_tick` later does to `end_date`.

**Rule chosen: walk the meals left.** `remainingDeliveryDates` starts at the first uncooked day (today, the start date, the day after tonight's recorded delivery, or the day after a 2 PM resume cutoff) and collects delivery days that are not closures and not skipped until `ceil(meals left ÷ meals per day)` dinners are found. `end_date` is not read.

Why: the kitchen cooks by meals, not by dates. `subscription_delivery_tick` delivers every Active plan on each delivery day while `delivered_meals` is below the credited cap and never reads `end_date`; `subscription_status_tick` ends a plan only once its meals are done. So the meals walk is what will really be cooked. It pushes the last dinner for closures still ahead (agreeing with `projectedEndDate` and the closure tick), it honours future skips without needing the skip count, and it matches spec §8 step 4 ("a plan whose end date says it finished but still has meals left is held too"). When `end_date` is consistent with the meals, the walk's last date equals Plan B's `projectedEndDate`; Task 1 pins that with a test. Plan B's skip outcome keeps using `projectedEndDate` (dates), which is correct for the question it asks: where does one more make-up day land.

The TypeScript (`season-projection.ts`) and the SQL (`_season_project_plan`) share 19 fixtures (`season-projection.fixtures.ts`). vitest checks the TypeScript against the fixtures' expected values; `npm run season:lockstep-sql` turns the same fixtures into a `DO` block that runs the SQL on live and compares.

**Buffer grants, one more rule both sides share.** A grant lets a plan cook on the first buffer days after W, up to its grant count. A buffer day that has already passed used a slot: `bufferSlotsUsed` counts the plan's delivery days after W and before the first uncooked day that were not closures and not skipped. Without it, a plan holding one grant would cook on every buffer day. The delivery tick uses the same count (`_season_buffer_cooks`).

### "Cooks today" means the delivery tick's own conditions (Plan B Task 5 review)

Plan B Task 5 is live (migration `20260915043100 season_credited_skip_ticks`, commit 12bfd3e). A plan whose last credited skip is today reads Skipped (status step 3) and is not ended until the next night (step 5), so for one day a plan with every meal delivered or credited can still read Active or Skipped. Status alone therefore never decides whether a plan cooks. Everything in Plan C that asks "does this plan cook on day D" uses the delivery tick's own conditions:

- status `Active` and no `season_hold_id`
- D is a delivery day for the plan's `week_type`, not a company closure, not in `skipped_dates`
- `delivered_meals` below the credited cap `total_meals − credited_skip_days × meals_per_day` (for a count taken after tonight's tick has run, the delivery it just recorded is added back, so the kitchen screen reads the same before and after 20:00)
- `resume_cutoff_date` null or before D
- after W: `_season_buffer_cooks` for D

The TypeScript twin is `deliveryTickCooks` and `kitchenCountsPlan` in `season-kitchen.ts` (Task 1), used by the kitchen and rider counts (G5, Task 8). The break board's invariant (Task 14) asks whether a plan would cook on any day of the break, so it applies the day-free part: Active and below the credited cap. The SQL uses the same conditions in the failsafe (G6, Task 3) and `season_invariants_tick` (Task 5). The projection's meals walk applies the same cap through `mealsLeftFor`, and fixture 19 (every meal delivered or credited) covers it in the lockstep. Every tick change starts from the live body read with `pg_get_functiondef` at apply time; the "before" bodies quoted in Task 3 are the Plan B bodies now live, including the `comped_meal_ledger` insert with no `ON CONFLICT`, mirrored as it is.

### What Plan C takes on, and what it leaves

| Item | Choice |
|---|---|
| §8 begin-break, `season_break_tick` at 00:15 AE, retries at 00:45 and 01:15, legacy scheduled pause path kept | Tasks 5, 15 |
| G10: an Active plan during the break; the break not started by 01:30 AE after K | `season_invariants_tick` (Task 5, scheduled hourly in Task 15). The rest of G10 is Plan G, which extends the same function |
| G1, G4, G6 in SQL | Task 3 |
| G2, G3 triggers | Task 4 |
| G5 kitchen and rider counts | Task 8 |
| G9 resume refusal, §7.5, §7.6 break half | Task 9 |
| Reopen (break → open), release on Resume or start date | Tasks 6, 7, 9, 14 |
| "End the season today" reconciles skips (handed over by Plan B) | Task 6 (SQL), Task 7 (test that receipts reach the hook) |
| §7.4 split sheet (N7), §7.5 refusal sheet (N11) | Task 11 |
| Held and customer-paused cards; N8 and N9 in-app notices | Tasks 10, 12 |
| Menu held day | Task 13 |
| Break board without refunds | Task 14 |
| Flip `SEASON_BREAK_RELEASE_LIVE` | Task 15 |
| `season_notices` rows at the break (§8 step 10), N8 and N9 on WhatsApp and email | Plan E. Plan C sends the owner's break summary through `send_admin_whatsapp_alert` and shows N8 and N9 in the app |
| Reopening notices (N15 to N17) | Plan F, through the hook `announceSeasonReopened` (Task 7) |
| Refund request, approval, `refund_requested` from `held` or `ready` | Plan D |

### Rules the spec leaves open, decided here

1. **A queued renewal held behind a Paused held plan is released with it.** Its start date follows the primary's end (the existing shift trigger), and `changeStartDate` refuses a date change while the primary is paused, so waiting for the customer to pick a date would strand it.
2. **A planned pause on a plan held at the break is cleared** (`planned_pause_start = NULL`). The pause credit stays spent (`has_paused_before` untouched, spec §8 step 4). Otherwise a stale past date would sit on the plan after reopening.
3. **G3 arrivals get no automatic waitlist credit.** Spec G3 names only the hold and the admin alert; a sale during the break is an incident the owner handles by hand.
4. **An admin pause counts as a customer pause** at the break (reason `customer_pause`), because `subscriptions` does not record who paused.
5. **During the break the status tick promotes nothing and ends a Skipped plan whose meals are done** instead of flipping it to Active. Promoting any row during the break would hit G2 and roll back the whole nightly tick.

## File Map

| File | Responsibility |
|---|---|
| Create `src/contexts/season/domain/season-kitchen.ts` (+ test) | Kitchen gate for a day (normal, buffer only, closed), buffer slots used, whether a plan cooks on a buffer day, whether the counts include a plan |
| Modify `src/contexts/season/domain/season-projection.ts` (+ test) | Meals walk, resume cutoff, buffer slots |
| Create `src/contexts/season/domain/season-projection.fixtures.ts`, `season-projection.lockstep.test.ts` | Shared fixtures for the TypeScript and SQL projection |
| Modify `src/contexts/season/domain/customer-season.ts` (+ test), `src/app/admin/season/season-data.ts` (+ test) | Map `resume_cutoff_date`; the break board's data (Task 14) |
| Create `scripts/season-projection-lockstep.ts`; modify `package.json` | Print the lockstep `DO` block |
| Create `supabase/migrations/20260916_season_project_plans.sql` | `_season_buffer_slots_used`, `_season_buffer_cooks`, `_season_projection_result`, `_season_project_plan`, `season_project_plans` |
| Create `supabase/migrations/20260916_season_kitchen_guards.sql` | G1 delivery tick, G4 status tick, G6 failsafe |
| Create `supabase/migrations/20260916_season_status_triggers.sql` | G2 `trg_subscriptions_season_guard`, G3 `trg_subscriptions_season_arrival` |
| Create `supabase/migrations/20260916_season_begin_break.sql` | `season_begin_break`, `season_break_tick`, `season_invariants_tick` |
| Create `supabase/migrations/20260916_season_reopen_release.sql` | `season_reopen`, `season_release_hold`, `season_end_today` reconciling skips |
| Create `supabase/migrations/20260916_season_break_cron.sql` | Cron switch |
| Create `src/contexts/season/domain/season-break-errors.ts` (+ test) | Break and release copy, error mapping |
| Create `src/contexts/season/usecases/release-hold.ts` (+ test) | `releaseSeasonHold` |
| Create `src/contexts/season/domain/season-reopen.ts` (+ test), `src/contexts/season/usecases/season-reopen-notices.ts` | Reopen summary; the Plan F hook |
| Modify `src/contexts/season/usecases/season-transitions.ts` (+ test), `src/app/admin/season/actions.ts` | `reopenSeason`, `reopenSeasonAction` |
| Create `src/contexts/ops/usecases/season-kitchen-gate.ts` (+ test) | Read the gate for a day |
| Modify `src/contexts/ops/usecases/get-kitchen-counts.ts` (+ test), `get-dorm-counts.ts` (+ new test), `src/app/kitchen/[token]/page.tsx`, `src/app/ops/[token]/page.tsx` | G5 |
| Modify `src/contexts/subscriptions/usecases/subscription-mutations.ts` (+ test), `src/app/admin/customers/[id]/actions.ts` (+ new test) | G9, §7.5, §7.6, release |
| Modify `src/contexts/subscriptions/domain/subscriptions.ts`, `src/app/dashboard/_shared/types.ts`, `src/app/dashboard/plan/PlanClient.tsx`, `src/app/dashboard/_mobile/MobilePlan.tsx` | `season_hold_id`; the start-date allowance for a ready hold |
| Create `src/contexts/season/domain/customer-hold.ts` (+ test), `src/infra/supabase/season-holds-repo.ts` | The customer's hold |
| Create `src/app/dashboard/_shared/season-break-copy.ts` (+ test), `HeldPlanCard.tsx` | Card copy and card |
| Modify `src/app/dashboard/page.tsx`, `ClientDashboard.tsx`, `ActiveDashboard.tsx`, `_mobile/MobileHome.tsx` | Thread the hold; preview knobs |
| Create `src/contexts/season/domain/resume-split.ts` (+ test), `src/app/dashboard/_shared/SeasonSplitSheet.tsx`, `BreakResumeSheet.tsx` | N7 and N11 |
| Create `src/app/dashboard/_shared/SeasonBreakNotice.tsx` | N8 and N9 |
| Modify `src/app/dashboard/_shared/menu-day-status.ts` (+ test), `menu-reason-chip.ts` (+ test), `src/app/dashboard/menu/MenuClient.tsx`, `menu/page.tsx` | Held menu day |
| Create `src/app/admin/season/season-break-view.ts` (+ test), `BreakBoard.tsx`; modify `SeasonPlanner.tsx`, `src/app/dev/season-admin/page.tsx`, `scripts/check-season-planner.mjs` | Break board |
| Modify `src/contexts/season/domain/season-release.ts`, `src/app/admin/_components/cron-registry.ts`, `scripts/check-season-customer.mjs` | Flip, registry, rendered checks |

---
### Task 1: One projection rule: walk the meals left

**Files:**
- Create: `src/contexts/season/domain/season-kitchen.ts`
- Test: `src/contexts/season/domain/season-kitchen.test.ts`
- Modify: `src/contexts/season/domain/season-projection.ts`
- Modify: `src/contexts/season/domain/season-projection.test.ts`
- Create: `src/contexts/season/domain/season-projection.fixtures.ts`
- Test: `src/contexts/season/domain/season-projection.lockstep.test.ts`
- Modify: `src/contexts/season/domain/customer-season.ts` (Plan B)
- Modify: `src/contexts/season/domain/customer-season.test.ts` (Plan B)
- Modify: `src/app/admin/season/season-data.ts`

**Interfaces:**
- Consumes (Plan A): `addDaysIso`, `isDeliveryDayIso`, `SeasonWeekType`, `SeasonPhase`, `ProjectionPlan`, `ProjectionContext`, `PlanProjection`, `projectPlan`; (Plan B) `projectedEndDate` from `skip-outcome.ts`, `projectionPlanFromRow` from `customer-season.ts`.
- Produces:
  - `type SeasonKitchenGate = 'normal' | 'buffer_only' | 'closed_for_break'`
  - `seasonKitchenGate(input: { phase: SeasonPhase; wrapUpDay: string | null; closeDay: string | null; todayAe: string }): SeasonKitchenGate`
  - `bufferSlotsUsed(input: { wrapUpDay: string; beforeDay: string; weekType: SeasonWeekType; skippedDates: readonly string[]; closureDates: ReadonlySet<string> }): number`
  - `bufferCooksOn(input: { day: string; wrapUpDay: string; closeDay: string | null; weekType: SeasonWeekType; skippedDates: readonly string[]; bufferGrants: number; closureDates: ReadonlySet<string> }): boolean`
  - `interface KitchenPlanFacts { status: string | null; seasonHoldId: string | null; weekType: SeasonWeekType; mealsPerDay: number; totalMeals: number; deliveredMeals: number; creditedSkipDays: number; skippedDates: readonly string[]; bufferGrants: number; resumeCutoffDate: string | null; lastDeliveryTickDate: string | null }`
  - `deliveryTickCooks(plan: KitchenPlanFacts, day: string, closureDates: ReadonlySet<string>): boolean`
  - `kitchenCountsPlan(input: { gate: SeasonKitchenGate; day: string; wrapUpDay: string | null; closeDay: string | null; closureDates: ReadonlySet<string>; plan: KitchenPlanFacts }): boolean`
  - `ProjectionPlan` gains optional `resumeCutoffDate?: string | null`
  - `mealsLeftFor(plan: Pick<ProjectionPlan, 'totalMeals' | 'deliveredMeals' | 'creditedSkipDays' | 'mealsPerDay'>): number`
  - `walkStartFor(plan: ProjectionPlan, todayAe: string): string`
  - `remainingDeliveryDates` and `projectPlan` keep their signatures; `remainingDeliveryDates` now walks the meals left.
  - `type ProjectedFacts = Omit<PlanProjection, 'planId'>`; `interface ProjectionFixture { name: string; plan: ProjectionPlan; todayAe: string; closureDates: string[]; wrapUpDay: string | null; closeDay: string | null; expected: ProjectedFacts }`; `PROJECTION_FIXTURES: ProjectionFixture[]`

- [ ] **Step 1: Confirm the preconditions**

Run: `ls src/contexts/season/domain/customer-season.ts src/app/dashboard/_shared/season-notice-copy.ts src/app/dashboard/_shared/SeasonScheduledNotice.tsx src/contexts/season/usecases/season-skip-notices.ts src/contexts/season/domain/season-skip-receipt.ts scripts/check-season-customer.mjs && grep -n "export function projectedEndDate" src/contexts/season/domain/skip-outcome.ts`
Expected: six paths and one match.

Then with `execute_sql` (project `yjjayivwfqjfppawgyaz`):

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in ('season_skip','season_unskip','season_skip_credit_tick','season_reconcile_skips','season_projected_end')
order by 1;
select count(*) as has_credited_dates from information_schema.columns
where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'credited_skip_dates';
select position('SEASON_UNSKIP_CREDITED_AFTER' in pg_get_functiondef('public.season_unskip'::regproc)) > 0 as guards_live,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname like '%season%' and p.prosrc like '%cs\_test\_%') as test_money_rule_live;
```

Expected: five names, `has_credited_dates = 1`, `guards_live = true`, `test_money_rule_live = true`. Anything missing: stop and report that Plan B is not fully live (migration `season_skip_guards` is the last one).

- [ ] **Step 2: Write the failing tests**

`src/contexts/season/domain/season-kitchen.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  seasonKitchenGate, bufferSlotsUsed, bufferCooksOn, deliveryTickCooks, kitchenCountsPlan,
  type KitchenPlanFacts,
} from './season-kitchen'

// Anchors: Sat 3 Oct 2026 is the wrap-up day. Sun 4 Oct is not a delivery
// day. Mon 5 Oct and Tue 6 Oct are buffer days when the buffer is 2.
const NONE: ReadonlySet<string> = new Set()

describe('seasonKitchenGate', () => {
  const gate = (phase: 'open' | 'winding_down' | 'break', todayAe: string, wrapUpDay: string | null = '2026-10-03', closeDay: string | null = '2026-10-05') =>
    seasonKitchenGate({ phase, wrapUpDay, closeDay, todayAe })

  it('cooks normally while open, or winding down with no wrap-up day, or up to the wrap-up day', () => {
    expect(gate('open', '2026-10-05', null, null)).toBe('normal')
    expect(gate('winding_down', '2026-10-05', null, null)).toBe('normal')
    expect(gate('winding_down', '2026-10-03')).toBe('normal')
  })

  it('cooks only buffer grants after the wrap-up day, and nothing after the close day or during the break', () => {
    expect(gate('winding_down', '2026-10-05')).toBe('buffer_only')
    expect(gate('winding_down', '2026-10-06')).toBe('closed_for_break')
    expect(gate('break', '2026-10-06')).toBe('closed_for_break')
  })
})

describe('bufferSlotsUsed', () => {
  const used = (beforeDay: string, over: { skippedDates?: string[]; closureDates?: ReadonlySet<string>; weekType?: '5DAYS' | '6DAYS' } = {}) =>
    bufferSlotsUsed({ wrapUpDay: '2026-10-03', beforeDay, weekType: over.weekType ?? '6DAYS', skippedDates: over.skippedDates ?? [], closureDates: over.closureDates ?? NONE })

  it('counts the buffer delivery days already behind the plan', () => {
    expect(used('2026-10-05')).toBe(0)
    expect(used('2026-10-06')).toBe(1)
  })

  it('does not count a closure or a skipped buffer day', () => {
    expect(used('2026-10-06', { closureDates: new Set(['2026-10-05']) })).toBe(0)
    expect(used('2026-10-06', { skippedDates: ['2026-10-05'] })).toBe(0)
  })
})

describe('bufferCooksOn', () => {
  const cooks = (day: string, bufferGrants: number, over: { weekType?: '5DAYS' | '6DAYS'; wrapUpDay?: string; closeDay?: string } = {}) =>
    bufferCooksOn({
      day, bufferGrants, wrapUpDay: over.wrapUpDay ?? '2026-10-03', closeDay: over.closeDay ?? '2026-10-06',
      weekType: over.weekType ?? '6DAYS', skippedDates: [], closureDates: NONE,
    })

  it('cooks the first buffer days, one per grant', () => {
    expect(cooks('2026-10-05', 1)).toBe(true)
    expect(cooks('2026-10-06', 1)).toBe(false)
    expect(cooks('2026-10-06', 2)).toBe(true)
  })

  it('never cooks on the wrap-up day, after the close day, or without a grant', () => {
    expect(cooks('2026-10-03', 1)).toBe(false)
    expect(cooks('2026-10-07', 3)).toBe(false)
    expect(cooks('2026-10-05', 0)).toBe(false)
  })

  it('a Monday to Friday plan cannot use a Saturday buffer day', () => {
    expect(cooks('2026-10-03', 1, { weekType: '5DAYS', wrapUpDay: '2026-10-02', closeDay: '2026-10-03' })).toBe(false)
  })
})

describe('deliveryTickCooks (the delivery tick own conditions)', () => {
  const facts = (over: Partial<KitchenPlanFacts> = {}): KitchenPlanFacts => ({
    status: 'Active', seasonHoldId: null, weekType: '6DAYS', mealsPerDay: 1, totalMeals: 24, deliveredMeals: 20,
    creditedSkipDays: 0, skippedDates: [], bufferGrants: 0, resumeCutoffDate: null, lastDeliveryTickDate: '2026-09-26', ...over,
  })
  const MON = '2026-09-28'

  it('cooks an Active plan with meals below the credited cap on its delivery day', () => {
    expect(deliveryTickCooks(facts(), MON, NONE)).toBe(true)
  })

  it('never cooks by status alone', () => {
    expect(deliveryTickCooks(facts({ status: 'Skipped' }), MON, NONE)).toBe(false)
    expect(deliveryTickCooks(facts({ status: 'Paused' }), MON, NONE)).toBe(false)
    expect(deliveryTickCooks(facts({ seasonHoldId: 'h1' }), MON, NONE)).toBe(false)
    // Every meal delivered or credited, still reading Active for a day.
    expect(deliveryTickCooks(facts({ creditedSkipDays: 4 }), MON, NONE)).toBe(false)
  })

  it('honours the day, closures, skips and a resume after the cutoff', () => {
    expect(deliveryTickCooks(facts(), '2026-09-27', NONE)).toBe(false)
    expect(deliveryTickCooks(facts(), MON, new Set([MON]))).toBe(false)
    expect(deliveryTickCooks(facts({ skippedDates: [MON] }), MON, NONE)).toBe(false)
    expect(deliveryTickCooks(facts({ resumeCutoffDate: MON }), MON, NONE)).toBe(false)
    expect(deliveryTickCooks(facts({ resumeCutoffDate: '2026-09-26' }), MON, NONE)).toBe(true)
  })

  it('reads the same after tonight delivery is recorded', () => {
    expect(deliveryTickCooks(facts({ deliveredMeals: 24, lastDeliveryTickDate: MON }), MON, NONE)).toBe(true)
    expect(deliveryTickCooks(facts({ deliveredMeals: 24, lastDeliveryTickDate: '2026-09-26' }), MON, NONE)).toBe(false)
  })
})

describe('kitchenCountsPlan', () => {
  const plan: KitchenPlanFacts = {
    status: 'Active', seasonHoldId: null, weekType: '6DAYS', mealsPerDay: 1, totalMeals: 24, deliveredMeals: 23,
    creditedSkipDays: 0, skippedDates: [], bufferGrants: 1, resumeCutoffDate: null, lastDeliveryTickDate: '2026-10-03',
  }
  const counts = (gate: 'normal' | 'buffer_only' | 'closed_for_break', over: Partial<KitchenPlanFacts> = {}) =>
    kitchenCountsPlan({ gate, day: '2026-10-05', wrapUpDay: '2026-10-03', closeDay: '2026-10-06', closureDates: NONE, plan: { ...plan, ...over } })

  it('counts nothing while the kitchen is closed for the break', () => {
    expect(counts('closed_for_break')).toBe(false)
  })

  it('counts a plan the tick cooks, and after the wrap-up day only with a grant for today', () => {
    expect(counts('normal')).toBe(true)
    expect(counts('buffer_only')).toBe(true)
    expect(counts('buffer_only', { bufferGrants: 0 })).toBe(false)
  })
})
```

`src/contexts/season/domain/season-projection.fixtures.ts`:

```ts
/**
 * Shared fixtures for the season projection. The TypeScript projection
 * (season-projection.ts) must return `expected` for each one, and the SQL
 * twin (_season_project_plan in supabase/migrations/20260916_season_project_plans.sql)
 * must return the same: scripts/season-projection-lockstep.ts checks it on live.
 *
 * Anchors: Mon 28 Sep 2026 is today unless a fixture says otherwise. Sun 4 Oct
 * is not a delivery day. The base plan has 6 meals left, one a day, Monday to
 * Saturday: Mon 28 Sep to Sat 3 Oct.
 */

import type { PlanProjection, ProjectionPlan } from './season-projection'

export type ProjectedFacts = Omit<PlanProjection, 'planId'>

export interface ProjectionFixture {
  name: string
  plan: ProjectionPlan
  todayAe: string
  closureDates: string[]
  wrapUpDay: string | null
  closeDay: string | null
  expected: ProjectedFacts
}

const base = (p: Partial<ProjectionPlan> = {}): ProjectionPlan => ({
  id: 'fixture', customerId: 'customer', planName: 'Monthly Premium', status: 'Active',
  startDate: '2026-09-01', endDate: '2026-10-03', weekType: '6DAYS',
  mealsPerDay: 1, totalMeals: 24, deliveredMeals: 18, creditedSkipDays: 0, bufferGrants: 0,
  skippedDates: [], plannedPauseStart: null, staffApproval: null,
  lastDeliveryTickDate: '2026-09-26', resumeCutoffDate: null,
  ...p,
})

const at = (todayAe: string, wrapUpDay: string | null, closeDay: string | null, closureDates: string[] = []) =>
  ({ todayAe, wrapUpDay, closeDay, closureDates })

const facts = (
  disposition: ProjectedFacts['disposition'], cookDates: string[], deliveriesAfterWrapUp: number, mealsAfterWrapUp: number, mealsLeft: number,
): ProjectedFacts => ({
  disposition, cookDates, lastDinner: cookDates.length > 0 ? cookDates[cookDates.length - 1] : null,
  deliveriesAfterWrapUp, mealsAfterWrapUp, mealsLeft,
})

const SIX = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']

export const PROJECTION_FIXTURES: ProjectionFixture[] = [
  { name: 'no wrap-up day', plan: base(), ...at('2026-09-28', null, null), expected: facts('finishes', SIX, 0, 0, 6) },
  { name: 'finishes on the wrap-up day', plan: base(), ...at('2026-09-28', '2026-10-03', '2026-10-05'), expected: facts('finishes', SIX, 0, 0, 6) },
  { name: 'runs past the wrap-up day', plan: base(), ...at('2026-09-28', '2026-09-30', '2026-10-01'), expected: facts('runs_past', ['2026-09-28', '2026-09-29', '2026-09-30'], 3, 3, 6) },
  {
    name: 'a closure still ahead pushes the last dinner',
    plan: base(), ...at('2026-09-28', null, null, ['2026-09-30']),
    expected: facts('finishes', ['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], 0, 0, 6),
  },
  {
    name: 'a skip still ahead pushes the last dinner',
    plan: base({ skippedDates: ['2026-09-29'] }), ...at('2026-09-28', null, null),
    expected: facts('finishes', ['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], 0, 0, 6),
  },
  {
    name: 'a buffer grant cooks the make-up meal',
    plan: base({ skippedDates: ['2026-09-29'], bufferGrants: 1 }), ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('finishes', ['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], 0, 0, 6),
  },
  {
    name: 'a buffer grant never cooks after the close day',
    plan: base({ skippedDates: ['2026-09-29', '2026-09-30'], bufferGrants: 1 }), ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('runs_past', ['2026-09-28', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], 1, 1, 6),
  },
  {
    name: 'a buffer day already behind the plan used its grant',
    plan: base({ deliveredMeals: 23, bufferGrants: 1, lastDeliveryTickDate: '2026-10-05' }), ...at('2026-10-06', '2026-10-03', '2026-10-06'),
    expected: facts('runs_past', [], 1, 1, 1),
  },
  {
    name: 'two meals a day',
    plan: base({ planName: 'Monthly Max', mealsPerDay: 2, totalMeals: 48, deliveredMeals: 36 }), ...at('2026-09-28', '2026-09-30', '2026-10-01'),
    expected: facts('runs_past', ['2026-09-28', '2026-09-29', '2026-09-30'], 3, 6, 12),
  },
  {
    name: 'tonight is already delivered',
    plan: base({ deliveredMeals: 19, lastDeliveryTickDate: '2026-09-28' }), ...at('2026-09-28', null, null),
    expected: facts('finishes', ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'], 0, 0, 5),
  },
  {
    name: 'resumed after the 2 PM cutoff',
    plan: base({ resumeCutoffDate: '2026-09-28' }), ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('runs_past', ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'], 1, 1, 6),
  },
  { name: 'a paused plan', plan: base({ status: 'Paused' }), ...at('2026-09-28', '2026-10-03', '2026-10-05'), expected: facts('customer_paused', [], 0, 0, 6) },
  {
    name: 'a planned pause before the wrap-up day',
    plan: base({ plannedPauseStart: '2026-10-01' }), ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('customer_paused', ['2026-09-28', '2026-09-29', '2026-09-30'], 0, 0, 6),
  },
  {
    name: 'starts after the wrap-up day',
    plan: base({ status: 'Scheduled', startDate: '2026-10-06', endDate: '2026-10-31', deliveredMeals: 0, lastDeliveryTickDate: null }),
    ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('starts_after', [], 24, 24, 24),
  },
  {
    name: 'a staff renewal waiting for approval',
    plan: base({ planName: 'Staff Monthly', status: 'Scheduled', startDate: '2026-10-05', totalMeals: 20, deliveredMeals: 0, staffApproval: 'pending', lastDeliveryTickDate: null }),
    ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('staff_pending', [], 0, 0, 20),
  },
  {
    name: 'the end date says finished but meals are left',
    plan: base({ endDate: '2026-09-26' }), ...at('2026-09-28', '2026-09-30', '2026-10-01'),
    expected: facts('runs_past', ['2026-09-28', '2026-09-29', '2026-09-30'], 3, 3, 6),
  },
  {
    name: 'a Monday to Friday plan cannot use a Saturday buffer day',
    plan: base({ weekType: '5DAYS', totalMeals: 20, deliveredMeals: 14, skippedDates: ['2026-09-29'], bufferGrants: 1 }),
    ...at('2026-09-28', '2026-10-02', '2026-10-03'),
    expected: facts('runs_past', ['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02'], 2, 2, 6),
  },
  {
    name: 'a closure on a buffer day does not use a grant',
    plan: base({ deliveredMeals: 22, bufferGrants: 1, lastDeliveryTickDate: '2026-10-03' }), ...at('2026-10-06', '2026-10-03', '2026-10-06', ['2026-10-05']),
    expected: facts('runs_past', ['2026-10-06'], 1, 1, 2),
  },
  {
    name: 'every meal delivered or credited',
    plan: base({ deliveredMeals: 23, creditedSkipDays: 1 }), ...at('2026-09-28', null, null),
    expected: facts('finishes', [], 0, 0, 0),
  },
]
```

`src/contexts/season/domain/season-projection.lockstep.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { projectPlan } from './season-projection'
import { PROJECTION_FIXTURES } from './season-projection.fixtures'

describe('season projection fixtures (lockstep with _season_project_plan)', () => {
  it('has unique fixture names the SQL report can point at', () => {
    const names = PROJECTION_FIXTURES.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
    for (const n of names) expect(n).not.toContain("'")
  })

  for (const f of PROJECTION_FIXTURES) {
    it(f.name, () => {
      const { planId, ...projected } = projectPlan(f.plan, {
        todayAe: f.todayAe, closureDates: new Set(f.closureDates), wrapUpDay: f.wrapUpDay, closeDay: f.closeDay,
      })
      expect(planId).toBe(f.plan.id)
      expect(projected).toEqual(f.expected)
    })
  }
})
```

In `src/contexts/season/domain/season-projection.test.ts`, make these five replacements and one addition.

(a) Replace

```ts
  it('drops today once tonight\'s delivery is recorded', () => {
    const dates = remainingDeliveryDates(plan({ lastDeliveryTickDate: '2026-09-14' }), ctx())
```

with

```ts
  it('drops today once tonight\'s delivery is recorded', () => {
    const dates = remainingDeliveryDates(plan({ lastDeliveryTickDate: '2026-09-14', deliveredMeals: 7 }), ctx())
```

(b) Replace

```ts
  it('drops skipped days and company closures', () => {
    const dates = remainingDeliveryDates(plan({ skippedDates: ['2026-09-16'] }), ctx({ closureDates: new Set(['2026-09-17']) }))
    expect(dates).not.toContain('2026-09-16')
    expect(dates).not.toContain('2026-09-17')
    expect(dates).toHaveLength(16)
  })
```

with

```ts
  it('drops skipped days and company closures, and still cooks every meal left', () => {
    // The kitchen cooks by meals: a skip and a closure still ahead push the
    // last dinner two delivery days past the stored end date.
    const dates = remainingDeliveryDates(plan({ skippedDates: ['2026-09-16'] }), ctx({ closureDates: new Set(['2026-09-17']) }))
    expect(dates).not.toContain('2026-09-16')
    expect(dates).not.toContain('2026-09-17')
    expect(dates).toHaveLength(18)
    expect(dates.at(-1)).toBe('2026-10-06')
  })
```

(c) Replace

```ts
    const dates = remainingDeliveryDates(plan({ status: 'Scheduled', startDate: '2026-09-21', endDate: '2026-09-26', lastDeliveryTickDate: null }), ctx())
```

with

```ts
    const dates = remainingDeliveryDates(plan({ status: 'Scheduled', startDate: '2026-09-21', endDate: '2026-09-26', totalMeals: 6, deliveredMeals: 0, lastDeliveryTickDate: null }), ctx())
```

(d) Replace

```ts
    const p = projectPlan(plan({ endDate: '2026-10-05', bufferGrants: 1 }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
```

with

```ts
    const p = projectPlan(plan({ endDate: '2026-10-05', deliveredMeals: 5, bufferGrants: 1 }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
```

(e) Replace

```ts
    const p = projectPlan(plan({ endDate: '2026-10-06', bufferGrants: 1 }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
```

with

```ts
    const p = projectPlan(plan({ endDate: '2026-10-06', deliveredMeals: 4, bufferGrants: 1 }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
```

(f) Add `import { projectedEndDate } from './skip-outcome'` under the existing imports, and append inside `describe('remainingDeliveryDates', ...)`:

```ts
  it('ends where Plan B projectedEndDate says when the end date matches the meals', () => {
    // 18 meals left from Mon 14 Sep, a closure on Wed 30 Sep still ahead.
    const closures = new Set(['2026-09-30'])
    const walked = remainingDeliveryDates(plan(), ctx({ closureDates: closures }))
    expect(walked.at(-1)).toBe('2026-10-05')
    expect(walked.at(-1)).toBe(projectedEndDate({ endDate: '2026-10-03', weekType: '6DAYS', todayAe: '2026-09-14', closureDates: closures, skippedDates: [] }))
  })

  it('waits a day after a resume past the 2 PM cutoff', () => {
    const dates = remainingDeliveryDates(plan({ resumeCutoffDate: '2026-09-14' }), ctx())
    expect(dates[0]).toBe('2026-09-15')
    expect(dates).toHaveLength(18)
  })
```

In `src/contexts/season/domain/customer-season.test.ts` (Plan B) replace

```ts
    const season = build([plan({ endDate: '2026-10-02' })])
```

with

```ts
    const season = build([plan({ endDate: '2026-10-02', deliveredMeals: 7 })])
```

and, in the `projectionPlanFromRow` expected object, replace `lastDeliveryTickDate: '2026-09-11',` with `lastDeliveryTickDate: '2026-09-11', resumeCutoffDate: null,`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/season/domain/season-kitchen.test.ts src/contexts/season/domain/season-projection.test.ts src/contexts/season/domain/season-projection.lockstep.test.ts src/contexts/season/domain/customer-season.test.ts`
Expected: FAIL. `./season-kitchen` cannot be resolved; the projection still walks to `end_date` (the skipped-and-closure case returns 16 dates, the resume cutoff case starts on 14 Sep, fixtures 4, 5, 6, 8, 11, 16 and 18 differ); `projectionPlanFromRow` has no `resumeCutoffDate`.

- [ ] **Step 4: Write the implementation**

`src/contexts/season/domain/season-kitchen.ts`:

```ts
/**
 * The kitchen during the season end (spec §6.2, §9 G1, G5, G6).
 *
 * Pure and client-importable. Mirrors what the nightly SQL runs:
 * _season_buffer_slots_used and _season_buffer_cooks
 * (supabase/migrations/20260916_season_project_plans.sql) and the delivery
 * tick's own conditions (20260916_season_kitchen_guards.sql). "Does this plan
 * cook on day D" is never decided by status alone: a plan whose last meal was
 * credited today still reads Skipped or Active for a night.
 */

import { addDaysIso, isDeliveryDayIso, type SeasonWeekType } from './season-dates'
import type { SeasonPhase } from './season-phase'

export type SeasonKitchenGate = 'normal' | 'buffer_only' | 'closed_for_break'

export function seasonKitchenGate(input: { phase: SeasonPhase; wrapUpDay: string | null; closeDay: string | null; todayAe: string }): SeasonKitchenGate {
  if (input.phase === 'break') return 'closed_for_break'
  if (input.phase !== 'winding_down' || !input.wrapUpDay) return 'normal'
  const close = input.closeDay && input.closeDay > input.wrapUpDay ? input.closeDay : input.wrapUpDay
  if (input.todayAe > close) return 'closed_for_break'
  if (input.todayAe > input.wrapUpDay) return 'buffer_only'
  return 'normal'
}

/** Buffer delivery days after the wrap-up day and before `beforeDay`: each one used a grant slot. */
export function bufferSlotsUsed(input: {
  wrapUpDay: string
  beforeDay: string
  weekType: SeasonWeekType
  skippedDates: readonly string[]
  closureDates: ReadonlySet<string>
}): number {
  const skipped = new Set(input.skippedDates)
  let used = 0
  for (let day = addDaysIso(input.wrapUpDay, 1); day < input.beforeDay; day = addDaysIso(day, 1)) {
    if (!isDeliveryDayIso(day, input.weekType) || input.closureDates.has(day) || skipped.has(day)) continue
    used++
  }
  return used
}

/** A buffer day cooks for a plan only on its first `bufferGrants` buffer delivery days. */
export function bufferCooksOn(input: {
  day: string
  wrapUpDay: string
  closeDay: string | null
  weekType: SeasonWeekType
  skippedDates: readonly string[]
  bufferGrants: number
  closureDates: ReadonlySet<string>
}): boolean {
  const close = input.closeDay && input.closeDay > input.wrapUpDay ? input.closeDay : input.wrapUpDay
  if (input.day <= input.wrapUpDay || input.day > close || input.bufferGrants <= 0) return false
  if (!isDeliveryDayIso(input.day, input.weekType) || input.closureDates.has(input.day) || input.skippedDates.includes(input.day)) return false
  return bufferSlotsUsed({
    wrapUpDay: input.wrapUpDay,
    beforeDay: input.day,
    weekType: input.weekType,
    skippedDates: input.skippedDates,
    closureDates: input.closureDates,
  }) < input.bufferGrants
}

export interface KitchenPlanFacts {
  status: string | null
  seasonHoldId: string | null
  weekType: SeasonWeekType
  mealsPerDay: number
  totalMeals: number
  deliveredMeals: number
  creditedSkipDays: number
  skippedDates: readonly string[]
  bufferGrants: number
  resumeCutoffDate: string | null
  lastDeliveryTickDate: string | null
}

/** The delivery tick's own conditions for day `day`, plus the season hold (spec G1). */
export function deliveryTickCooks(plan: KitchenPlanFacts, day: string, closureDates: ReadonlySet<string>): boolean {
  if (plan.status !== 'Active' || plan.seasonHoldId) return false
  if (!isDeliveryDayIso(day, plan.weekType) || closureDates.has(day) || plan.skippedDates.includes(day)) return false
  if (plan.resumeCutoffDate && plan.resumeCutoffDate >= day) return false
  const cap = plan.totalMeals - plan.creditedSkipDays * plan.mealsPerDay
  // Tonight's delivery already recorded: judge the plan as it stood before it,
  // so the kitchen screen reads the same before and after 20:00.
  const deliveredBefore = plan.lastDeliveryTickDate === day ? plan.deliveredMeals - plan.mealsPerDay : plan.deliveredMeals
  return deliveredBefore < cap
}

/** Whether the kitchen and rider counts include this plan on `day` (spec G5). */
export function kitchenCountsPlan(input: {
  gate: SeasonKitchenGate
  day: string
  wrapUpDay: string | null
  closeDay: string | null
  closureDates: ReadonlySet<string>
  plan: KitchenPlanFacts
}): boolean {
  if (input.gate === 'closed_for_break') return false
  if (!deliveryTickCooks(input.plan, input.day, input.closureDates)) return false
  if (input.gate === 'normal') return true
  if (!input.wrapUpDay) return false
  return bufferCooksOn({
    day: input.day,
    wrapUpDay: input.wrapUpDay,
    closeDay: input.closeDay,
    weekType: input.plan.weekType,
    skippedDates: input.plan.skippedDates,
    bufferGrants: input.plan.bufferGrants,
    closureDates: input.closureDates,
  })
}
```

`src/contexts/season/domain/season-projection.ts`:

(a) Replace the import line `import { addDaysIso, isDeliveryDayIso, type SeasonWeekType } from './season-dates'` with:

```ts
import { addDaysIso, isDeliveryDayIso, type SeasonWeekType } from './season-dates'
import { bufferSlotsUsed } from './season-kitchen'
```

(b) In `interface ProjectionPlan`, replace

```ts
  lastDeliveryTickDate: string | null
}
```

(its first occurrence, the end of `ProjectionPlan`) with

```ts
  lastDeliveryTickDate: string | null
  /** Set when the customer resumed after the 2 PM cutoff: that day is not cooked. */
  resumeCutoffDate?: string | null
}
```

(c) Replace the whole `remainingDeliveryDates` function (from `export function remainingDeliveryDates(` to its closing `}`) with:

```ts
/** total − delivered − credited skip days × meals per day, never below 0 (the delivery tick's cap). */
export function mealsLeftFor(plan: Pick<ProjectionPlan, 'totalMeals' | 'deliveredMeals' | 'creditedSkipDays' | 'mealsPerDay'>): number {
  return Math.max(0, plan.totalMeals - plan.deliveredMeals - plan.creditedSkipDays * plan.mealsPerDay)
}

/** The first day nothing has been cooked for yet. */
export function walkStartFor(plan: ProjectionPlan, todayAe: string): string {
  let from = plan.startDate > todayAe ? plan.startDate : todayAe
  // Tonight's delivery already recorded: today is no longer remaining.
  if (plan.lastDeliveryTickDate && plan.lastDeliveryTickDate >= from) from = addDaysIso(plan.lastDeliveryTickDate, 1)
  // Resumed after the 2 PM cutoff: the delivery tick skips that day.
  if (plan.resumeCutoffDate && plan.resumeCutoffDate === from) from = addDaysIso(from, 1)
  return from
}

/**
 * The dinners still to cook, by meals, not by end date: the delivery tick
 * cooks every Active plan on each delivery day until its meals are done and
 * never reads end_date. So closures and skips still ahead push the last
 * dinner out, and a plan whose end date has passed with meals left keeps
 * cooking (spec §8 step 4 holds it at the break). Lockstep with SQL
 * _season_project_plan.
 */
export function remainingDeliveryDates(
  plan: ProjectionPlan,
  ctx: Pick<ProjectionContext, 'todayAe' | 'closureDates'>,
): string[] {
  const needed = Math.ceil(mealsLeftFor(plan) / Math.max(1, plan.mealsPerDay))
  const skipped = new Set(plan.skippedDates)
  const out: string[] = []
  let day = walkStartFor(plan, ctx.todayAe)
  for (let i = 0; i < MAX_WALK_DAYS && out.length < needed; i++, day = addDaysIso(day, 1)) {
    if (!isDeliveryDayIso(day, plan.weekType)) continue
    if (ctx.closureDates.has(day) || skipped.has(day)) continue
    out.push(day)
  }
  return out
}
```

(d) In `projectPlan`, replace

```ts
  const mealsLeft = Math.max(0, plan.totalMeals - plan.deliveredMeals - plan.creditedSkipDays * plan.mealsPerDay)
```

with

```ts
  const mealsLeft = mealsLeftFor(plan)
```

and replace

```ts
  const granted = afterWrapUp.filter((d) => d <= close).slice(0, Math.max(0, plan.bufferGrants))
```

with

```ts
  // A buffer day already behind the plan used a grant slot, cooked or not.
  const slotsUsed = bufferSlotsUsed({
    wrapUpDay: wrapUp,
    beforeDay: walkStartFor(plan, ctx.todayAe),
    weekType: plan.weekType,
    skippedDates: plan.skippedDates,
    closureDates: ctx.closureDates,
  })
  const granted = afterWrapUp.filter((d) => d <= close).slice(0, Math.max(0, plan.bufferGrants - slotsUsed))
```

`src/contexts/season/domain/customer-season.ts` (Plan B): in `projectionPlanFromRow`, replace `    lastDeliveryTickDate: day(row.last_delivery_tick_date),` with:

```ts
    lastDeliveryTickDate: day(row.last_delivery_tick_date),
    resumeCutoffDate: day(row.resume_cutoff_date),
```

`src/app/admin/season/season-data.ts`:
- In `type SubRow`, replace `  last_delivery_tick_date: string | null` with `  last_delivery_tick_date: string | null\n  resume_cutoff_date?: string | null`.
- In the subscriptions `.select(...)` string, replace `staff_approval, last_delivery_tick_date'` with `staff_approval, last_delivery_tick_date, resume_cutoff_date'`.
- In the `plans` map, replace `      lastDeliveryTickDate: r.last_delivery_tick_date,` with `      lastDeliveryTickDate: r.last_delivery_tick_date,\n      resumeCutoffDate: r.resume_cutoff_date ?? null,`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/contexts/season src/app/admin/season src/contexts/subscriptions`
Expected: PASS: 13 season-kitchen tests, 20 lockstep tests (19 fixtures and the name check), the updated projection tests, and every Plan B test (the join-waitlist fixtures are already consistent with the meals walk).
Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/season/domain/season-kitchen.ts src/contexts/season/domain/season-kitchen.test.ts src/contexts/season/domain/season-projection.ts src/contexts/season/domain/season-projection.test.ts src/contexts/season/domain/season-projection.fixtures.ts src/contexts/season/domain/season-projection.lockstep.test.ts src/contexts/season/domain/customer-season.ts src/contexts/season/domain/customer-season.test.ts src/app/admin/season/season-data.ts
git commit -m "feat(season): the projection walks the meals left, so closures and skips ahead push the last dinner

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 2: The SQL projection twin, checked in lockstep on live

**Files:**
- Create: `supabase/migrations/20260916_season_project_plans.sql`
- Create: `scripts/season-projection-lockstep.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 `PROJECTION_FIXTURES`, `projectPlan`; live `public.is_delivery_day(date, text)`, `public.is_company_closure(date)`, `public.ae_today()`, `public.company_closures`.
- Produces (live, all `SET search_path = public`, execute revoked from `public, anon, authenticated`):
  - `public._season_buffer_slots_used(p_wrap_up date, p_before date, p_week_type text, p_skipped date[], p_closures date[]) returns integer` (STABLE)
  - `public._season_buffer_cooks(p_day date, p_wrap_up date, p_close date, p_week_type text, p_skipped date[], p_grants integer) returns boolean` (STABLE, reads `company_closures`)
  - `public._season_projection_result(p_id text, p_disposition text, p_cook date[], p_after integer, p_meals_after integer, p_left integer) returns jsonb` (IMMUTABLE)
  - `public._season_project_plan(p jsonb, p_today date, p_wrap_up date, p_close date, p_closures date[]) returns jsonb` with keys `plan_id`, `disposition`, `cook_dates`, `last_dinner`, `deliveries_after_wrap_up`, `meals_after_wrap_up`, `meals_left` (STABLE). `p` is a `subscriptions` row as `to_jsonb`.
  - `public.season_project_plans(p_wrap_up date, p_close date) returns table(subscription_id uuid, customer_id uuid, status text, disposition text, cook_dates date[], last_dinner date, deliveries_after_wrap_up integer, meals_after_wrap_up integer, meals_left integer)` (STABLE, SECURITY DEFINER)
  - `npm run season:lockstep-sql`

Additive: no existing function changes and nothing calls these until Task 3. Safe with Plan B's app deployed.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/20260916_season_project_plans.sql`:

```sql
-- ============================================================================
-- Season wind-down, plan C: the SQL twin of the TypeScript projection
-- (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md §6.1,
-- §6.2). Lockstep with src/contexts/season/domain/season-projection.ts and
-- season-kitchen.ts through season-projection.fixtures.ts.
--
-- The rule: walk the meals left, not the end date. The delivery tick cooks by
-- meals, so closures and skips still ahead push the last dinner out, and a
-- plan whose end date has passed with meals left still has dinners owed.
--
-- Additive only. Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through
-- the Supabase connector as migration `season_project_plans`. This file is
-- the mirror.
-- ============================================================================

BEGIN;

-- Buffer delivery days after the wrap-up day and before p_before. Each one
-- used a buffer grant slot, cooked or not. Mirrors bufferSlotsUsed.
CREATE OR REPLACE FUNCTION public._season_buffer_slots_used(
  p_wrap_up date, p_before date, p_week_type text, p_skipped date[], p_closures date[]
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM generate_series(p_wrap_up + 1, p_before - 1, interval '1 day') AS g(d)
  WHERE public.is_delivery_day(g.d::date, CASE WHEN p_week_type = '5DAYS' THEN '5DAYS' ELSE '6DAYS' END)
    AND NOT (g.d::date = ANY(COALESCE(p_closures, '{}'::date[])))
    AND NOT (g.d::date = ANY(COALESCE(p_skipped, '{}'::date[])));
$$;

-- Does a plan cook on buffer day p_day? Mirrors bufferCooksOn, reading the
-- live company_closures table. The delivery tick and the 8 PM failsafe call it.
CREATE OR REPLACE FUNCTION public._season_buffer_cooks(
  p_day date, p_wrap_up date, p_close date, p_week_type text, p_skipped date[], p_grants integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_wrap_up IS NOT NULL
     AND p_day > p_wrap_up
     AND p_day <= GREATEST(COALESCE(p_close, p_wrap_up), p_wrap_up)
     AND COALESCE(p_grants, 0) > 0
     AND public.is_delivery_day(p_day, CASE WHEN p_week_type = '5DAYS' THEN '5DAYS' ELSE '6DAYS' END)
     AND NOT public.is_company_closure(p_day)
     AND NOT (p_day = ANY(COALESCE(p_skipped, '{}'::date[])))
     AND public._season_buffer_slots_used(
           p_wrap_up, p_day, p_week_type, p_skipped,
           ARRAY(SELECT c.closure_date FROM public.company_closures c WHERE c.closure_date > p_wrap_up AND c.closure_date < p_day)
         ) < p_grants;
$$;

CREATE OR REPLACE FUNCTION public._season_projection_result(
  p_id text, p_disposition text, p_cook date[], p_after integer, p_meals_after integer, p_left integer
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'plan_id', p_id,
    'disposition', p_disposition,
    'cook_dates', to_jsonb(COALESCE(p_cook, '{}'::date[])),
    'last_dinner', CASE WHEN cardinality(p_cook) > 0 THEN to_jsonb(p_cook[cardinality(p_cook)]) ELSE 'null'::jsonb END,
    'deliveries_after_wrap_up', p_after,
    'meals_after_wrap_up', p_meals_after,
    'meals_left', p_left
  );
$$;

-- One plan, as projectPlan does it. p is a subscriptions row as to_jsonb.
CREATE OR REPLACE FUNCTION public._season_project_plan(
  p jsonb, p_today date, p_wrap_up date, p_close date, p_closures date[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_id         text := p->>'id';
  v_status     text := p->>'status';
  v_start      date := (p->>'start_date')::date;
  v_week       text := CASE WHEN p->>'week_type' = '5DAYS' THEN '5DAYS' ELSE '6DAYS' END;
  v_mpd        integer := COALESCE((p->>'meals_per_day')::integer, 1);
  v_grants     integer := COALESCE((p->>'season_buffer_grants')::integer, 0);
  v_last_tick  date := (p->>'last_delivery_tick_date')::date;
  v_cutoff     date := (p->>'resume_cutoff_date')::date;
  v_pause      date := (p->>'planned_pause_start')::date;
  v_skipped    date[] := ARRAY(
                  SELECT x::date FROM jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(p->'skipped_dates') = 'array' THEN p->'skipped_dates' ELSE '[]'::jsonb END
                  ) AS t(x));
  v_closures   date[] := COALESCE(p_closures, '{}'::date[]);
  v_left       integer;
  v_needed     integer;
  v_from       date;
  v_day        date;
  v_all        date[] := '{}'::date[];
  v_regular    date[];
  v_after      date[];
  v_granted    date[];
  v_close      date;
  v_slots      integer;
  v_not_cooked integer;
BEGIN
  v_left := GREATEST(0,
    COALESCE((p->>'total_meals')::integer, 0)
    - COALESCE((p->>'delivered_meals')::integer, 0)
    - COALESCE((p->>'credited_skip_days')::integer, 0) * v_mpd);

  IF v_status = 'Scheduled' AND p->>'staff_approval' = 'pending' THEN
    RETURN public._season_projection_result(v_id, 'staff_pending', '{}'::date[], 0, 0, v_left);
  END IF;
  IF v_status = 'Paused' THEN
    RETURN public._season_projection_result(v_id, 'customer_paused', '{}'::date[], 0, 0, v_left);
  END IF;

  -- The first day nothing has been cooked for yet (walkStartFor).
  v_from := GREATEST(v_start, p_today);
  IF v_last_tick IS NOT NULL AND v_last_tick >= v_from THEN v_from := v_last_tick + 1; END IF;
  IF v_cutoff IS NOT NULL AND v_cutoff = v_from THEN v_from := v_from + 1; END IF;

  -- Walk the meals left (remainingDeliveryDates), at most 400 days.
  v_needed := CEIL(v_left::numeric / GREATEST(1, v_mpd))::integer;
  v_day := v_from;
  FOR i IN 1..400 LOOP
    EXIT WHEN cardinality(v_all) >= v_needed;
    IF public.is_delivery_day(v_day, v_week)
       AND NOT (v_day = ANY(v_closures))
       AND NOT (v_day = ANY(v_skipped)) THEN
      v_all := v_all || v_day;
    END IF;
    v_day := v_day + 1;
  END LOOP;

  IF v_pause IS NOT NULL AND (p_wrap_up IS NULL OR v_pause <= p_wrap_up) THEN
    RETURN public._season_projection_result(
      v_id, 'customer_paused',
      ARRAY(SELECT u.d FROM unnest(v_all) AS u(d) WHERE u.d < v_pause AND (p_wrap_up IS NULL OR u.d <= p_wrap_up) ORDER BY u.d),
      0, 0, v_left);
  END IF;

  IF p_wrap_up IS NULL THEN
    RETURN public._season_projection_result(v_id, 'finishes', v_all, 0, 0, v_left);
  END IF;

  v_close   := CASE WHEN p_close IS NOT NULL AND p_close > p_wrap_up THEN p_close ELSE p_wrap_up END;
  v_regular := ARRAY(SELECT u.d FROM unnest(v_all) AS u(d) WHERE u.d <= p_wrap_up ORDER BY u.d);
  v_after   := ARRAY(SELECT u.d FROM unnest(v_all) AS u(d) WHERE u.d > p_wrap_up ORDER BY u.d);
  v_slots   := GREATEST(0, v_grants - public._season_buffer_slots_used(p_wrap_up, v_from, v_week, v_skipped, v_closures));
  v_granted := ARRAY(SELECT u.d FROM unnest(v_after) AS u(d) WHERE u.d <= v_close ORDER BY u.d LIMIT v_slots);
  v_not_cooked := cardinality(v_after) - cardinality(v_granted);

  IF v_status = 'Scheduled' AND v_start > p_wrap_up AND cardinality(v_granted) = 0 THEN
    RETURN public._season_projection_result(v_id, 'starts_after', '{}'::date[], cardinality(v_after), v_left, v_left);
  END IF;
  IF v_not_cooked > 0 THEN
    RETURN public._season_projection_result(v_id, 'runs_past', v_regular || v_granted, v_not_cooked, v_not_cooked * v_mpd, v_left);
  END IF;
  RETURN public._season_projection_result(v_id, 'finishes', v_regular || v_granted, 0, 0, v_left);
END;
$$;

-- Every live plan against a wrap-up day and close day (spec §6.1).
CREATE OR REPLACE FUNCTION public.season_project_plans(p_wrap_up date, p_close date)
RETURNS TABLE(
  subscription_id uuid, customer_id uuid, status text, disposition text, cook_dates date[],
  last_dinner date, deliveries_after_wrap_up integer, meals_after_wrap_up integer, meals_left integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_today    date := public.ae_today();
  v_closures date[];
  s          public.subscriptions;
  v          jsonb;
BEGIN
  v_closures := ARRAY(
    SELECT c.closure_date FROM public.company_closures c
    WHERE c.closure_date >= LEAST(v_today, COALESCE(p_wrap_up, v_today))
    ORDER BY c.closure_date);

  FOR s IN
    SELECT * FROM public.subscriptions
    WHERE public.subscriptions.status IN ('Active', 'Skipped', 'Paused', 'Scheduled')
    ORDER BY public.subscriptions.id
  LOOP
    v := public._season_project_plan(to_jsonb(s), v_today, p_wrap_up, p_close, v_closures);
    subscription_id := s.id;
    customer_id := s.customer_id;
    status := s.status;
    disposition := v->>'disposition';
    cook_dates := ARRAY(SELECT x::date FROM jsonb_array_elements_text(v->'cook_dates') AS t(x));
    last_dinner := (v->>'last_dinner')::date;
    deliveries_after_wrap_up := (v->>'deliveries_after_wrap_up')::integer;
    meals_after_wrap_up := (v->>'meals_after_wrap_up')::integer;
    meals_left := (v->>'meals_left')::integer;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._season_buffer_slots_used(date, date, text, date[], date[]) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._season_buffer_cooks(date, date, date, text, date[], integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._season_projection_result(text, text, date[], integer, integer, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._season_project_plan(jsonb, date, date, date, date[]) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_project_plans(date, date) FROM public, anon, authenticated;

COMMIT;
```

- [ ] **Step 2: Apply it live**

Use `apply_migration` with project `yjjayivwfqjfppawgyaz`, name `season_project_plans`, and the file content without `BEGIN;` / `COMMIT;`.
Expected: success.

- [ ] **Step 3: Write the lockstep script**

`scripts/season-projection-lockstep.ts`:

```ts
/**
 * Prints a DO block that runs every projection fixture through the live SQL
 * twin (public._season_project_plan) and compares it with what the TypeScript
 * projection returns for the same fixture.
 *
 *   npm run --silent season:lockstep-sql > <scratch dir>/lockstep.sql
 *
 * Then run the file's content with the Supabase connector's execute_sql. The
 * block only calls a STABLE function and always raises at the end, so nothing
 * is written. The message is the report: LOCKSTEP_OK or LOCKSTEP_FAIL.
 */

import { PROJECTION_FIXTURES } from '../src/contexts/season/domain/season-projection.fixtures'
import { projectPlan, type ProjectionPlan } from '../src/contexts/season/domain/season-projection'

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`
const sqlDate = (d: string | null) => (d ? `DATE ${quote(d)}` : 'NULL::date')

/** The subscriptions row shape _season_project_plan reads (to_jsonb of a row). */
function toRow(plan: ProjectionPlan): Record<string, unknown> {
  return {
    id: plan.id,
    customer_id: plan.customerId,
    plan_name: plan.planName,
    status: plan.status,
    start_date: plan.startDate,
    end_date: plan.endDate,
    week_type: plan.weekType,
    meals_per_day: plan.mealsPerDay,
    total_meals: plan.totalMeals,
    delivered_meals: plan.deliveredMeals,
    credited_skip_days: plan.creditedSkipDays,
    season_buffer_grants: plan.bufferGrants,
    skipped_dates: plan.skippedDates,
    planned_pause_start: plan.plannedPauseStart,
    staff_approval: plan.staffApproval,
    last_delivery_tick_date: plan.lastDeliveryTickDate,
    resume_cutoff_date: plan.resumeCutoffDate ?? null,
  }
}

const rows = PROJECTION_FIXTURES.map((f) => {
  const ts = projectPlan(f.plan, { todayAe: f.todayAe, closureDates: new Set(f.closureDates), wrapUpDay: f.wrapUpDay, closeDay: f.closeDay })
  const expected = {
    disposition: ts.disposition,
    cook_dates: ts.cookDates,
    last_dinner: ts.lastDinner,
    deliveries_after_wrap_up: ts.deliveriesAfterWrapUp,
    meals_after_wrap_up: ts.mealsAfterWrapUp,
    meals_left: ts.mealsLeft,
  }
  const closures = `ARRAY[${f.closureDates.map(quote).join(', ')}]::date[]`
  return `      (${quote(f.name)}, ${quote(JSON.stringify(toRow(f.plan)))}::jsonb, ${sqlDate(f.todayAe)}, ${sqlDate(f.wrapUpDay)}, ${sqlDate(f.closeDay)}, ${closures}, ${quote(JSON.stringify(expected))}::jsonb)`
})

console.log(`DO $$
DECLARE
  r record;
  v jsonb;
  v_fail text := '';
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
${rows.join(',\n')}
    ) AS t(name, plan, today, wrap_up, close_day, closures, expected)
  LOOP
    v := public._season_project_plan(r.plan, r.today, r.wrap_up, r.close_day, r.closures) - 'plan_id';
    IF v IS DISTINCT FROM r.expected THEN
      v_fail := v_fail || r.name || ' sql=' || v::text || ' ts=' || r.expected::text || '; ';
    END IF;
    v_n := v_n + 1;
  END LOOP;
  IF v_fail <> '' THEN RAISE EXCEPTION 'LOCKSTEP_FAIL: %', v_fail; END IF;
  RAISE EXCEPTION 'LOCKSTEP_OK: % fixtures agree', v_n;
END $$;`)
```

Add to `package.json` `scripts`, after `check:season-data`:

```json
    "season:lockstep-sql": "tsx scripts/season-projection-lockstep.ts",
```

(Put the comma on the line before it as JSON requires.)

- [ ] **Step 4: Run the lockstep against live**

Run: `npm run --silent season:lockstep-sql > "$SCRATCH/lockstep.sql"` where `$SCRATCH` is an existing scratch directory, then open the file and run its whole content with `execute_sql`.
Expected: an error whose message is `LOCKSTEP_OK: 19 fixtures agree`. A `LOCKSTEP_FAIL` names each fixture with the SQL and TypeScript answers; fix the SQL (the TypeScript is covered by vitest), re-apply, re-run.

- [ ] **Step 5: Check the live read and the grants**

```sql
select disposition, count(*) from public.season_project_plans(null, null) group by 1 order by 1;
select p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') as customer_can_run
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('_season_buffer_slots_used','_season_buffer_cooks','_season_projection_result','_season_project_plan','season_project_plans')
order by 1;
```

Expected: one `finishes` row per live Active or Scheduled plan and one `customer_paused` row per Paused plan (on 2026-09-15: 2 and 1); five function rows, all `customer_can_run = false`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260916_season_project_plans.sql scripts/season-projection-lockstep.ts package.json
git commit -m "feat(season): the SQL projection walks the meals left, checked against the TypeScript fixtures on live

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: The nightly ticks stop cooking after the wrap-up day (G1, G4, G6)

**Files:**
- Create: `supabase/migrations/20260916_season_kitchen_guards.sql`

**Interfaces:**
- Consumes: Task 2 `_season_buffer_cooks`; live `intake_settings.season_phase / wrap_up_day / close_day`; `subscriptions.season_hold_id`, `season_buffer_grants`, `credited_skip_days`.
- Produces (live, signatures unchanged):
  - `subscription_delivery_tick()` (G1): returns early during the break and after the close day; after the wrap-up day delivers only plans for which `_season_buffer_cooks(CURRENT_DATE, W, K, week_type, skipped_dates, season_buffer_grants)` is true; never delivers a plan with `season_hold_id`. Plan B's credited cap stays.
  - `subscription_status_tick()` (G4): never promotes a Scheduled plan with `season_hold_id`; during the break promotes nothing, activates no planned pause, and ends a Skipped plan whose meals are all delivered or credited instead of flipping it to Active. Plan B's end condition stays.
  - `ops_failsafe_send_tick()` (G6): returns `(0, 0)` without calling the route during the break, and after the wrap-up day when no Active, unheld plan below its credited cap cooks a buffer grant today.

Safe with Plan B's app deployed: every new branch is inert until a wrap-up day has passed or the phase is `break`, and on 2026-09-15 no wrap-up day is set. Once W passes the kitchen screen must use the same rule, so Task 8 must deploy before then (Deploy order).

- [ ] **Step 1: Read the three live bodies**

```sql
select pg_get_functiondef('public.subscription_delivery_tick'::regproc);
select pg_get_functiondef('public.subscription_status_tick'::regproc);
select pg_get_functiondef('public.ops_failsafe_send_tick'::regproc);
```

Expected, after normalising (Global Constraints):
- `subscription_delivery_tick` and `subscription_status_tick` equal the bodies in `supabase/migrations/20260915_season_credited_skip_ticks.sql` (Plan B Task 5, live as migration `20260915043100 season_credited_skip_ticks`, repo commit 12bfd3e), including the two `-- Plan B` lines in each and the `comped_meal_ledger` insert with no `ON CONFLICT`.
- `ops_failsafe_send_tick` equals the body below without the lines marked `-- Plan C`.

A difference in logic stops the task: report it. The file in Step 2 is those live bodies with only the `-- Plan C` lines added; if live has moved on in a way that is only formatting, keep the live text and add the same `-- Plan C` lines to it.

- [ ] **Step 2: Write the migration file**

`supabase/migrations/20260916_season_kitchen_guards.sql`:

```sql
-- ============================================================================
-- Season wind-down, plan C: the kitchen stops after the season (spec
-- docs/superpowers/specs/2026-09-14-season-wind-down-design.md §9 G1, G4, G6).
--
-- Each body was copied from pg_get_functiondef on live (the Plan B bodies from
-- migration season_credited_skip_ticks for the two subscription ticks); only
-- the lines marked "Plan C" differ. "Cooks today" is the delivery tick's own
-- conditions, never status alone.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_kitchen_guards`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.subscription_delivery_tick()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  cogs_today numeric;
  v_phase    text;             -- Plan C
  v_wrap     date;             -- Plan C
  v_close    date;             -- Plan C
  v_buffer   boolean := false; -- Plan C
BEGIN
  IF public.is_company_closure(CURRENT_DATE) THEN
    RETURN;
  END IF;

  -- Plan C (spec G1): the kitchen is closed during the break and after the
  -- close day; between the wrap-up day and the close day only buffer grants cook.
  SELECT season_phase, wrap_up_day, close_day INTO v_phase, v_wrap, v_close FROM public.intake_settings;  -- Plan C
  IF v_phase = 'break' THEN  -- Plan C
    RETURN;  -- Plan C
  END IF;  -- Plan C
  IF v_phase = 'winding_down' AND v_wrap IS NOT NULL THEN  -- Plan C
    IF CURRENT_DATE > GREATEST(COALESCE(v_close, v_wrap), v_wrap) THEN  -- Plan C
      RETURN;  -- Plan C
    END IF;  -- Plan C
    v_buffer := CURRENT_DATE > v_wrap;  -- Plan C
  END IF;  -- Plan C

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
       AND s.season_hold_id IS NULL  -- Plan C
       AND (NOT v_buffer OR public._season_buffer_cooks(CURRENT_DATE, v_wrap, v_close, s.week_type, s.skipped_dates, s.season_buffer_grants))  -- Plan C
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

CREATE OR REPLACE FUNCTION public.subscription_status_tick()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE  -- Plan C
  v_break boolean := EXISTS (SELECT 1 FROM public.intake_settings WHERE season_phase = 'break');  -- Plan C
BEGIN
  -- 1. Revert yesterday's Skipped → Active.
  --    Plan C: during the break nothing becomes Active (G2 would refuse it and
  --    roll back the whole tick). The break already held every Skipped plan
  --    with meals left, so a Skipped plan with every meal delivered or
  --    credited simply ends.
  IF v_break THEN  -- Plan C
    UPDATE public.subscriptions  -- Plan C
    SET status = 'Ended'  -- Plan C
    WHERE status = 'Skipped'  -- Plan C
      AND season_hold_id IS NULL  -- Plan C
      AND COALESCE(delivered_meals, 0) + COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1) >= total_meals;  -- Plan C
  ELSE  -- Plan C
  UPDATE public.subscriptions
  SET status = 'Active'
  WHERE status = 'Skipped';
  END IF;  -- Plan C

  -- 2. Promote subs whose start_date has arrived: Scheduled → Active.
  --    Staff renewals hold at the gate until the admin approves them.
  --    Plan C: never a plan held for next semester, and nothing during the break.
  IF NOT v_break THEN  -- Plan C
  UPDATE public.subscriptions
  SET status = 'Active'
  WHERE status = 'Scheduled' AND start_date <= public.ae_today()
    AND (staff_approval IS DISTINCT FROM 'pending')
    AND season_hold_id IS NULL;  -- Plan C
  END IF;  -- Plan C

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
  --    Plan C: no planned pause starts during the break.
  IF NOT v_break THEN  -- Plan C
  UPDATE public.subscriptions
  SET status = 'Paused',
      pause_date = NOW(),
      resume_cutoff_date = public.ae_today(),
      planned_pause_start = NULL
  WHERE status IN ('Active', 'Skipped')
    AND planned_pause_start = public.ae_today();
  END IF;  -- Plan C

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

CREATE OR REPLACE FUNCTION public.ops_failsafe_send_tick()
 RETURNS TABLE(fired_count integer, skipped_no_config integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  fired_total      int := 0;
  no_config_total  int := 0;
  base_url         text;
  retry_secret     text;
  http_req_id      bigint;
  v_phase          text;  -- Plan C
  v_wrap           date;  -- Plan C
  v_close          date;  -- Plan C
BEGIN
  -- Plan C (spec G6): nothing is cooking during the break, and after the
  -- wrap-up day only plans the delivery tick would cook for a buffer grant
  -- today. With none, there is nothing to be unconfirmed.
  SELECT season_phase, wrap_up_day, close_day INTO v_phase, v_wrap, v_close FROM public.intake_settings;  -- Plan C
  IF v_phase = 'break'  -- Plan C
     OR (v_phase = 'winding_down' AND v_wrap IS NOT NULL AND CURRENT_DATE > v_wrap  -- Plan C
         AND NOT EXISTS (  -- Plan C
           SELECT 1 FROM public.subscriptions s  -- Plan C
           WHERE s.status = 'Active'  -- Plan C
             AND s.season_hold_id IS NULL  -- Plan C
             AND COALESCE(s.delivered_meals, 0) < s.total_meals - COALESCE(s.credited_skip_days, 0) * COALESCE(s.meals_per_day, 1)  -- Plan C
             AND (s.resume_cutoff_date IS NULL OR s.resume_cutoff_date::date < CURRENT_DATE)  -- Plan C
             AND public._season_buffer_cooks(CURRENT_DATE, v_wrap, v_close, s.week_type, s.skipped_dates, s.season_buffer_grants))) THEN  -- Plan C
    fired_count       := 0;  -- Plan C
    skipped_no_config := 0;  -- Plan C
    RETURN NEXT;  -- Plan C
    RETURN;  -- Plan C
  END IF;  -- Plan C

  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'ops_failsafe_send_tick: required vault secrets missing (admin_base_url, internal_retry_secret)';
    fired_count       := 0;
    skipped_no_config := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT net.http_post(
    url     := base_url || '/api/internal/ops-failsafe-send',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || retry_secret,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO http_req_id;

  fired_total := 1;

  fired_count       := fired_total;
  skipped_no_config := no_config_total;
  RETURN NEXT;
END;
$function$;

COMMIT;
```

Note: the three functions keep their live grants (`CREATE OR REPLACE` does not reset them). The failsafe reads `public.subscriptions` through `public.` because its search path is `public, extensions, vault`.

- [ ] **Step 3: Apply it live**

Use `apply_migration`, name `season_kitchen_guards`, file content without `BEGIN;` / `COMMIT;`.
Expected: success.

- [ ] **Step 4: Rehearse inside a transaction that rolls itself back**

The delivery tick and the failsafe use `CURRENT_DATE` (the UTC date, which equals the Dubai date at their 16:00 UTC run); the status tick uses `ae_today()`. The block builds its season dates from the same clocks.

```sql
DO $$
DECLARE
  d  date := CURRENT_DATE;
  s  public.subscriptions;
  f  record;
  v_hold uuid;
  v_before integer;
  v_log text := '';
BEGIN
  IF EXTRACT(isodow FROM d)::int = 7 OR public.is_company_closure(d) THEN
    RAISE EXCEPTION 'REHEARSAL_SKIPPED: % is a Sunday or a closure, run again on a delivery day', d;
  END IF;
  SELECT * INTO s FROM public.subscriptions WHERE status = 'Active' ORDER BY end_date DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'REHEARSAL_SKIPPED: no Active plan'; END IF;

  -- Every rehearsal plan state starts from here: Active, 5 meals below its cap,
  -- nothing recorded tonight, Monday to Saturday, no skips, no grants, no hold.
  UPDATE public.subscriptions SET
    status = 'Active', week_type = '6DAYS', delivered_meals = total_meals - 5 * COALESCE(meals_per_day, 1),
    credited_skip_days = 0, credited_skip_dates = '{}', skipped_dates = '{}', season_buffer_grants = 0,
    last_delivery_tick_date = NULL, resume_cutoff_date = NULL, season_hold_id = NULL, planned_pause_start = NULL
  WHERE id = s.id RETURNING * INTO s;
  v_before := s.delivered_meals;

  -- G1a: open season, the plan cooks.
  UPDATE public.intake_settings SET season_phase = 'open', wrap_up_day = NULL, close_day = NULL, pause_scheduled_for = NULL;
  PERFORM public.subscription_delivery_tick();
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF s.delivered_meals <> v_before + COALESCE(s.meals_per_day, 1) THEN RAISE EXCEPTION 'FAIL open: % -> %', v_before, s.delivered_meals; END IF;
  v_log := v_log || 'open cooks ok; ';

  -- G1b: during the break nothing cooks.
  UPDATE public.subscriptions SET delivered_meals = v_before, last_delivery_tick_date = NULL WHERE id = s.id;
  UPDATE public.intake_settings SET season_phase = 'break', wrap_up_day = d - 2, close_day = d - 1;
  PERFORM public.subscription_delivery_tick();
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF s.delivered_meals <> v_before THEN RAISE EXCEPTION 'FAIL break cooked'; END IF;
  v_log := v_log || 'break quiet ok; ';

  -- G1c: winding down, the close day has passed (the break tick failed): nothing cooks.
  UPDATE public.intake_settings SET season_phase = 'winding_down', wrap_up_day = d - 2, close_day = d - 1;
  PERFORM public.subscription_delivery_tick();
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF s.delivered_meals <> v_before THEN RAISE EXCEPTION 'FAIL cooked after the close day'; END IF;
  v_log := v_log || 'after close day quiet ok; ';

  -- G1d: today is a buffer day. Without a grant nothing cooks, with one it does.
  UPDATE public.intake_settings SET season_phase = 'winding_down', wrap_up_day = d - 1, close_day = d;
  PERFORM public.subscription_delivery_tick();
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF s.delivered_meals <> v_before THEN RAISE EXCEPTION 'FAIL buffer day cooked without a grant'; END IF;
  UPDATE public.subscriptions SET season_buffer_grants = 1 WHERE id = s.id;
  PERFORM public.subscription_delivery_tick();
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF s.delivered_meals <> v_before + COALESCE(s.meals_per_day, 1) THEN RAISE EXCEPTION 'FAIL buffer grant did not cook'; END IF;
  v_log := v_log || 'buffer grant cooks only with a grant ok; ';

  -- G1e: a held plan never cooks, even with the season open.
  INSERT INTO public.season_holds (subscription_id, customer_id, cycle_started_at, reason, state, held_meals)
  VALUES (s.id, s.customer_id, now(), 'season', 'ready', 5) RETURNING id INTO v_hold;
  UPDATE public.subscriptions SET delivered_meals = v_before, last_delivery_tick_date = NULL, season_buffer_grants = 0, season_hold_id = v_hold WHERE id = s.id;
  UPDATE public.intake_settings SET season_phase = 'open', wrap_up_day = NULL, close_day = NULL;
  PERFORM public.subscription_delivery_tick();
  SELECT * INTO s FROM public.subscriptions WHERE id = s.id;
  IF s.delivered_meals <> v_before THEN RAISE EXCEPTION 'FAIL held plan cooked'; END IF;
  v_log := v_log || 'held plan quiet ok; ';

  -- G4a: open season, a held Scheduled plan past its start date is not promoted; an unheld one is.
  UPDATE public.subscriptions SET status = 'Scheduled', staff_approval = NULL, start_date = public.ae_today() - 1 WHERE id = s.id;
  PERFORM public.subscription_status_tick();
  IF (SELECT status FROM public.subscriptions WHERE id = s.id) <> 'Scheduled' THEN RAISE EXCEPTION 'FAIL held Scheduled promoted'; END IF;
  UPDATE public.subscriptions SET season_hold_id = NULL WHERE id = s.id;
  PERFORM public.subscription_status_tick();
  IF (SELECT status FROM public.subscriptions WHERE id = s.id) <> 'Active' THEN RAISE EXCEPTION 'FAIL unheld Scheduled not promoted in the open season'; END IF;
  v_log := v_log || 'promotion skips holds ok; ';

  -- G4b: during the break nothing is promoted and no planned pause starts.
  UPDATE public.intake_settings SET season_phase = 'break', wrap_up_day = d - 2, close_day = d - 1;
  UPDATE public.subscriptions SET status = 'Scheduled' WHERE id = s.id;
  PERFORM public.subscription_status_tick();
  IF (SELECT status FROM public.subscriptions WHERE id = s.id) <> 'Scheduled' THEN RAISE EXCEPTION 'FAIL promoted during the break'; END IF;
  -- Task 4's trigger refuses a restart during the break; the release setting
  -- lets this set-up write through, so the block also passes when re-run later.
  PERFORM set_config('dormers.season_release', 'on', true);
  UPDATE public.subscriptions SET status = 'Active', planned_pause_start = public.ae_today() WHERE id = s.id;
  PERFORM set_config('dormers.season_release', '', true);
  PERFORM public.subscription_status_tick();
  IF (SELECT status FROM public.subscriptions WHERE id = s.id) <> 'Active' THEN RAISE EXCEPTION 'FAIL planned pause started during the break'; END IF;
  v_log := v_log || 'break promotes nothing ok; ';

  -- G4c: during the break a Skipped plan with every meal done ends; one with meals left stays Skipped.
  UPDATE public.subscriptions SET status = 'Skipped', planned_pause_start = NULL, delivered_meals = total_meals WHERE id = s.id;
  PERFORM public.subscription_status_tick();
  IF (SELECT status FROM public.subscriptions WHERE id = s.id) <> 'Ended' THEN RAISE EXCEPTION 'FAIL finished Skipped plan did not end during the break'; END IF;
  UPDATE public.subscriptions SET status = 'Skipped', delivered_meals = v_before WHERE id = s.id;
  PERFORM public.subscription_status_tick();
  IF (SELECT status FROM public.subscriptions WHERE id = s.id) <> 'Skipped' THEN RAISE EXCEPTION 'FAIL Skipped plan with meals left changed during the break'; END IF;
  v_log := v_log || 'break ends finished Skipped plans ok; ';

  -- G6: quiet during the break, and on a buffer day with no grant anywhere.
  SELECT * INTO f FROM public.ops_failsafe_send_tick();
  IF f.fired_count <> 0 OR f.skipped_no_config <> 0 THEN RAISE EXCEPTION 'FAIL failsafe fired during the break: %', row_to_json(f); END IF;
  UPDATE public.intake_settings SET season_phase = 'winding_down', wrap_up_day = d - 1, close_day = d;
  UPDATE public.subscriptions SET season_buffer_grants = 0 WHERE season_buffer_grants <> 0;
  SELECT * INTO f FROM public.ops_failsafe_send_tick();
  IF f.fired_count <> 0 OR f.skipped_no_config <> 0 THEN RAISE EXCEPTION 'FAIL failsafe fired on a buffer day with no grant: %', row_to_json(f); END IF;
  UPDATE public.intake_settings SET season_phase = 'open', wrap_up_day = NULL, close_day = NULL;
  SELECT * INTO f FROM public.ops_failsafe_send_tick();
  IF f.fired_count + f.skipped_no_config <> 1 THEN RAISE EXCEPTION 'FAIL failsafe silent in the open season: %', row_to_json(f); END IF;
  v_log := v_log || 'failsafe quiet ok; ';

  RAISE EXCEPTION 'KITCHEN_GUARDS_OK: %', v_log;
END;
$$;
```

Expected: an error whose message is `KITCHEN_GUARDS_OK: open cooks ok; break quiet ok; after close day quiet ok; buffer grant cooks only with a grant ok; held plan quiet ok; promotion skips holds ok; break promotes nothing ok; break ends finished Skipped plans ok; failsafe quiet ok;`. The open-season failsafe call queues an HTTP request that rolls back with the block, so no alert goes out.

Then confirm live is untouched:

```sql
select season_phase, wrap_up_day, close_day from public.intake_settings;
select count(*) from public.season_holds;
select id, status, delivered_meals, last_delivery_tick_date from public.subscriptions where status in ('Active','Paused','Skipped','Scheduled') order by end_date;
```

Expected: the intake row as the owner left it; 0 holds; the plans as before the rehearsal.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260916_season_kitchen_guards.sql
git commit -m "feat(season): the nightly ticks cook nothing after the season and never restart a held plan

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Nothing restarts during the break, and a sale during it is held (G2, G3)

**Files:**
- Create: `supabase/migrations/20260916_season_status_triggers.sql`

**Interfaces:**
- Consumes: live `season_holds` (unique `season_holds_one_per_plan_per_season`), `intake_settings`, `send_admin_whatsapp_alert(p_message text, p_button_text text)`.
- Produces (live):
  - `public._subscriptions_season_guard() returns trigger` and `trg_subscriptions_season_guard BEFORE UPDATE OF status ON subscriptions`: during the break a change of `status` to `Active` raises `SEASON_BREAK: plan <id> cannot restart during the semester break` unless the transaction ran `set_config('dormers.season_release', 'on', true)`.
  - `public._subscriptions_season_arrival() returns trigger` and `trg_subscriptions_season_arrival AFTER INSERT ON subscriptions`: during the break a new Active or Scheduled plan gets a `season_holds` row (reason `season`, state `held`, `held_meals` = meals left), is set to Scheduled with `season_hold_id`, and the owner gets a WhatsApp alert. No waitlist credit (Scope decisions, rule 3).

Both functions are SECURITY DEFINER so a customer's own update can read `intake_settings`. Inert until the phase is `break`, which only Task 5's function can set: safe with Plan B's app deployed.

- [ ] **Step 1: Confirm the triggers on `subscriptions`**

```sql
select tgname from pg_trigger where tgrelid = 'public.subscriptions'::regclass and not tgisinternal order by 1;
```

Expected: `trg_subscriptions_recompute_end_date`, `trg_subscriptions_set_original_start_date`, `trg_subscriptions_shift_queued_scheduled`, `trg_subscriptions_staff_approval` (checked 2026-09-15). Neither season trigger exists yet. AFTER INSERT triggers fire in name order, so `trg_subscriptions_season_arrival` runs before `trg_subscriptions_shift_queued_scheduled`.

- [ ] **Step 2: Write the migration file**

`supabase/migrations/20260916_season_status_triggers.sql`:

```sql
-- ============================================================================
-- Season wind-down, plan C: guards on subscriptions for the break (spec
-- docs/superpowers/specs/2026-09-14-season-wind-down-design.md §9 G2, G3).
--
-- G2: during the break no plan becomes Active unless the transaction set
--     dormers.season_release = on (season_release_hold and, later, the refund
--     function). Server actions turn SEASON_BREAK into the §7.5 copy.
-- G3: during the break a new Active or Scheduled plan is held on arrival.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_status_triggers`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._subscriptions_season_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'Active'
     AND OLD.status IS DISTINCT FROM 'Active'
     AND COALESCE(current_setting('dormers.season_release', true), '') <> 'on'
     AND EXISTS (SELECT 1 FROM public.intake_settings WHERE season_phase = 'break') THEN
    RAISE EXCEPTION 'SEASON_BREAK: plan % cannot restart during the semester break', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_season_guard ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_season_guard
  BEFORE UPDATE OF status ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._subscriptions_season_guard();

CREATE OR REPLACE FUNCTION public._subscriptions_season_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       public.intake_settings;
  v_cycle timestamptz;
  v_hold  uuid;
  v_left  integer;
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN ('Active', 'Scheduled') THEN
    RETURN NULL;
  END IF;
  SELECT * INTO r FROM public.intake_settings;
  IF NOT FOUND OR r.season_phase <> 'break' THEN
    RETURN NULL;
  END IF;

  v_cycle := COALESCE(r.cycle_started_at, r.break_started_at, now());
  v_left := GREATEST(0, NEW.total_meals - COALESCE(NEW.delivered_meals, 0)
                        - COALESCE(NEW.credited_skip_days, 0) * COALESCE(NEW.meals_per_day, 1));

  INSERT INTO public.season_holds (subscription_id, customer_id, cycle_started_at, reason, state, held_meals)
  VALUES (NEW.id, NEW.customer_id, v_cycle, 'season', 'held', v_left)
  ON CONFLICT ON CONSTRAINT season_holds_one_per_plan_per_season DO NOTHING
  RETURNING id INTO v_hold;
  IF v_hold IS NULL THEN
    SELECT id INTO v_hold FROM public.season_holds WHERE subscription_id = NEW.id AND cycle_started_at = v_cycle;
  END IF;

  UPDATE public.subscriptions SET status = 'Scheduled', season_hold_id = v_hold WHERE id = NEW.id;

  -- The alert must never block the plan row a customer paid for.
  BEGIN
    PERFORM public.send_admin_whatsapp_alert(
      format('A plan was created during the semester break, so it is held and will not cook: %s, %s meals, customer %s, plan %s. Check how it was sold and contact the customer.',
             NEW.plan_name, v_left, NEW.customer_id, NEW.id),
      NEW.id::text);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'season arrival alert failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_season_arrival ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_season_arrival
  AFTER INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._subscriptions_season_arrival();

REVOKE EXECUTE ON FUNCTION public._subscriptions_season_guard() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._subscriptions_season_arrival() FROM public, anon, authenticated;

COMMIT;
```

PostgreSQL checks EXECUTE on a trigger function when the trigger is created, not when it fires, so revoking it does not stop a customer's update from firing G2.

- [ ] **Step 3: Apply it live**

Use `apply_migration`, name `season_status_triggers`, file content without `BEGIN;` / `COMMIT;`.
Expected: success.

- [ ] **Step 4: Rehearse inside a transaction that rolls itself back**

```sql
DO $$
DECLARE
  s public.subscriptions;
  n public.subscriptions;
  h public.season_holds;
  v_new uuid;
  v_log text := '';
BEGIN
  SELECT * INTO s FROM public.subscriptions WHERE status IN ('Active', 'Paused') ORDER BY end_date DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'REHEARSAL_SKIPPED: no live plan'; END IF;

  UPDATE public.intake_settings SET season_phase = 'break', wrap_up_day = public.ae_today() - 2, close_day = public.ae_today() - 1,
    cycle_started_at = COALESCE(cycle_started_at, now());
  UPDATE public.subscriptions SET status = 'Paused' WHERE id = s.id;

  -- G2: a restart during the break is refused.
  BEGIN
    UPDATE public.subscriptions SET status = 'Active' WHERE id = s.id;
    RAISE EXCEPTION 'FAIL restart allowed during the break';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SEASON_BREAK:%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'restart refused ok; ';

  -- G2: the release setting lets the release function through, for this transaction only.
  PERFORM set_config('dormers.season_release', 'on', true);
  UPDATE public.subscriptions SET status = 'Active' WHERE id = s.id;
  PERFORM set_config('dormers.season_release', '', true);
  UPDATE public.subscriptions SET status = 'Paused' WHERE id = s.id;
  v_log := v_log || 'release setting allowed ok; ';

  -- G2: other status changes during the break still work, and the open season is untouched.
  UPDATE public.subscriptions SET status = 'Ended' WHERE id = s.id;
  UPDATE public.subscriptions SET status = 'Paused' WHERE id = s.id;
  UPDATE public.intake_settings SET season_phase = 'open', wrap_up_day = NULL, close_day = NULL;
  UPDATE public.subscriptions SET status = 'Active' WHERE id = s.id;
  v_log := v_log || 'open season unaffected ok; ';

  -- G3: a plan created during the break is held on arrival.
  UPDATE public.intake_settings SET season_phase = 'break', wrap_up_day = public.ae_today() - 2, close_day = public.ae_today() - 1;
  INSERT INTO public.subscriptions (customer_id, plan_name, status, start_date, end_date, total_meals, delivered_meals, meals_per_day, week_type, meal_preference_type)
  VALUES (s.customer_id, 'Monthly Premium', 'Active', public.ae_today() + 1, public.ae_today() + 30, 24, 0, 1, '6DAYS', 'Non Veg')
  RETURNING id INTO v_new;
  SELECT * INTO n FROM public.subscriptions WHERE id = v_new;
  SELECT * INTO h FROM public.season_holds WHERE subscription_id = v_new;
  IF n.status <> 'Scheduled' OR n.season_hold_id IS NULL OR h.id IS NULL OR h.id <> n.season_hold_id
     OR h.reason <> 'season' OR h.state <> 'held' OR h.held_meals <> 24 THEN
    RAISE EXCEPTION 'FAIL arrival not held: % %', row_to_json(n), row_to_json(h);
  END IF;
  v_log := v_log || 'arrival held ok; ';

  -- G3: an Ended row during the break, and any row in the open season, are left alone.
  INSERT INTO public.subscriptions (customer_id, plan_name, status, start_date, end_date, total_meals, delivered_meals, meals_per_day, week_type, meal_preference_type)
  VALUES (s.customer_id, 'Monthly Premium', 'Ended', public.ae_today() - 40, public.ae_today() - 10, 24, 24, 1, '6DAYS', 'Non Veg')
  RETURNING id INTO v_new;
  IF (SELECT season_hold_id FROM public.subscriptions WHERE id = v_new) IS NOT NULL THEN RAISE EXCEPTION 'FAIL Ended arrival held'; END IF;
  UPDATE public.intake_settings SET season_phase = 'open', wrap_up_day = NULL, close_day = NULL;
  INSERT INTO public.subscriptions (customer_id, plan_name, status, start_date, end_date, total_meals, delivered_meals, meals_per_day, week_type, meal_preference_type)
  VALUES (s.customer_id, 'Monthly Premium', 'Active', public.ae_today() + 1, public.ae_today() + 30, 24, 0, 1, '6DAYS', 'Non Veg')
  RETURNING id INTO v_new;
  SELECT * INTO n FROM public.subscriptions WHERE id = v_new;
  IF n.status <> 'Active' OR n.season_hold_id IS NOT NULL THEN RAISE EXCEPTION 'FAIL open-season arrival changed: %', row_to_json(n); END IF;
  v_log := v_log || 'other arrivals untouched ok; ';

  RAISE EXCEPTION 'STATUS_TRIGGERS_OK: %', v_log;
END;
$$;
```

Expected: an error whose message is `STATUS_TRIGGERS_OK: restart refused ok; release setting allowed ok; open season unaffected ok; arrival held ok; other arrivals untouched ok;`.

Then confirm live is untouched:

```sql
select season_phase from public.intake_settings;
select count(*) from public.season_holds;
select tgname from pg_trigger where tgrelid = 'public.subscriptions'::regclass and tgname like 'trg_subscriptions_season_%' order by 1;
```

Expected: the phase as the owner left it; 0 holds; `trg_subscriptions_season_arrival`, `trg_subscriptions_season_guard`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260916_season_status_triggers.sql
git commit -m "feat(season): no plan restarts during the break, and a plan sold during it is held on arrival

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: The break begins (begin-break, break tick, two invariant alerts)

**Files:**
- Create: `supabase/migrations/20260916_season_begin_break.sql`

**Interfaces:**
- Consumes: Task 4 triggers (the break must not trip G2: begin-break only sets plans to Paused); live `intake_waitlist` (unique `intake_waitlist_customer_cycle_key`), `credits` (unique partial index `credits_one_per_intake_waitlist_row`), `customers.meal_preference_type`, `intake_settings.credit_*_aed`, `expense_category_for_plan(text)`, `send_admin_whatsapp_alert`, `customer_notifications`.
- Produces (live, SECURITY DEFINER, execute revoked from `public, anon, authenticated`; nothing scheduled until Task 15):
  - `public.season_begin_break() returns jsonb`: `{ started: false, reason: 'no_settings' | 'not_due' }` or `{ started: true, season_holds, customer_pause_holds, held_meals, credits_minted, credit_aed, notifications_closed }`
  - `public.season_break_tick() returns jsonb` with `action` one of `begin_break` (merged with the begin-break result), `sales_closed`, `legacy_paused`, `legacy_cleared`, `none` (and `reason`)
  - `public.season_invariants_tick() returns jsonb`: `{ checked: false }` while open, else `{ checked: true, breaches: text[] }` with breaches `active_during_break` and `break_not_started`

Begin-break (spec §8), in one transaction:
1. Lock `intake_settings`; stop unless the phase is `winding_down` and K is before today (Dubai).
2. For every Active, Skipped, Paused or Scheduled plan without a `season_hold_id`, meals left = `total − delivered − credited × meals_per_day`:
   - Active or Skipped with meals left: hold `season`, state `held`; status `Paused`, `pause_date = now()`, `planned_pause_start = NULL`.
   - Paused with meals left: hold `customer_pause`, state `paused_by_customer`; status unchanged.
   - Scheduled, not a pending staff renewal, with meals left: hold `season`, state `held`; status stays Scheduled.
   - Everything else (no meals left, pending staff renewal): nothing. The 00:30 status tick ends finished plans.
   - Each hold records `order_id` (latest order) and `meal_value_fils` only when it is exact under Plan B's money rule (recorded money on an order that is not a `cs_test_` session); otherwise NULL. The hold's waitlist credit does not depend on money.
3. A `season` hold on a plan with an order and `expense_category_for_plan(plan_name) IS NULL` (paid, spec X5) gets the customer's waitlist row for this season (insert on conflict do nothing) and its waitlist credit by meal preference, through the one-credit-per-row index; `waitlist_credit_id` is stored on the hold. A customer who already saved a spot keeps their one credit.
4. Pending `meal_resumed_confirm` rows whose `resume_date` is after K close as `cancelled:superseded`.
5. Phase `break`, `paused = true`, `sales_stopped_at` kept or stamped, `break_started_at = now()`.
6. One WhatsApp summary to the owner (spec §11.7 "Break started"); a failed alert never rolls the break back.

- [ ] **Step 1: Read the live scheduled-pause tick**

```sql
select pg_get_functiondef('public.intake_scheduled_pause_tick'::regproc);
select jobname, schedule, command, active from cron.job where jobname = 'intake_scheduled_pause_00_15_ae';
```

Expected: the body in `supabase/migrations/20260914_season_transitions.sql` (Plan A) and one active job `15 20 * * *`. `season_break_tick` below carries both of its paths unchanged (sales close after W; the legacy `pause_scheduled_for` path) and adds the break. The old function is left in place; Task 15 moves the cron job.

- [ ] **Step 2: Write the migration file**

`supabase/migrations/20260916_season_begin_break.sql`:

```sql
-- ============================================================================
-- Season wind-down, plan C: the break begins (spec
-- docs/superpowers/specs/2026-09-14-season-wind-down-design.md §8, §9 G10
-- rules "an Active plan during the break" and "break not started by 01:30 AE").
--
-- Functions only. Task 15 (migration season_break_cron) schedules them.
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_begin_break`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.season_begin_break()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r              public.intake_settings;
  s              public.subscriptions;
  v_today        date := public.ae_today();
  v_cycle        timestamptz;
  v_left         integer;
  v_reason       text;
  v_hold         uuid;
  v_order_id     uuid;
  v_paid_fils    integer;
  v_credit_fils  integer;
  v_meals        integer;
  v_session      text;
  v_paid         boolean;
  v_pref         text;
  v_amount       numeric;
  v_waitlist     uuid;
  v_credit       uuid;
  v_season_holds integer := 0;
  v_pause_holds  integer := 0;
  v_held_meals   integer := 0;
  v_credits      integer := 0;
  v_credit_aed   numeric := 0;
  v_closed       integer := 0;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('started', false, 'reason', 'no_settings');
  END IF;
  IF r.season_phase <> 'winding_down' OR r.close_day IS NULL OR r.close_day >= v_today THEN
    RETURN jsonb_build_object('started', false, 'reason', 'not_due');
  END IF;
  v_cycle := COALESCE(r.cycle_started_at, now());

  FOR s IN
    SELECT * FROM public.subscriptions
    WHERE status IN ('Active', 'Skipped', 'Paused', 'Scheduled')
      AND season_hold_id IS NULL
    ORDER BY id
    FOR UPDATE
  LOOP
    -- Held by meals, not dates (spec §8 step 4).
    v_left := GREATEST(0, s.total_meals - COALESCE(s.delivered_meals, 0)
                          - COALESCE(s.credited_skip_days, 0) * COALESCE(s.meals_per_day, 1));
    IF v_left = 0 THEN CONTINUE; END IF;

    IF s.status IN ('Active', 'Skipped') THEN
      v_reason := 'season';
    ELSIF s.status = 'Paused' THEN
      v_reason := 'customer_pause';
    ELSIF s.staff_approval = 'pending' THEN
      CONTINUE;
    ELSE
      v_reason := 'season';
    END IF;

    SELECT o.id, o.amount_paid_fils, o.credit_applied_fils, o.meals_count, o.stripe_session_id
      INTO v_order_id, v_paid_fils, v_credit_fils, v_meals, v_session
    FROM public.orders o
    WHERE o.subscription_id = s.id
    ORDER BY o.created_at DESC
    LIMIT 1;

    -- meal_value_fils is stored only when it is exact under Plan B's money
    -- rule (season_skip_guards): recorded money on an order that is not a
    -- Stripe test-mode session (spec D7: test payments are not money).
    -- Otherwise NULL, so Plan D never refunds from an estimate.
    INSERT INTO public.season_holds (subscription_id, customer_id, order_id, cycle_started_at, reason, state, held_meals, meal_value_fils)
    VALUES (
      s.id, s.customer_id, v_order_id, v_cycle, v_reason,
      CASE WHEN v_reason = 'season' THEN 'held' ELSE 'paused_by_customer' END,
      v_left,
      CASE WHEN v_paid_fils IS NOT NULL AND v_credit_fils IS NOT NULL AND COALESCE(v_meals, 0) > 0
                AND COALESCE(v_session, '') NOT LIKE 'cs\_test\_%'
           THEN floor((v_paid_fils + v_credit_fils)::numeric / v_meals)::integer END
    )
    ON CONFLICT ON CONSTRAINT season_holds_one_per_plan_per_season DO NOTHING
    RETURNING id INTO v_hold;
    IF v_hold IS NULL THEN
      SELECT id INTO v_hold FROM public.season_holds WHERE subscription_id = s.id AND cycle_started_at = v_cycle;
    END IF;

    IF s.status IN ('Active', 'Skipped') THEN
      UPDATE public.subscriptions
      SET status = 'Paused', pause_date = now(), planned_pause_start = NULL, season_hold_id = v_hold
      WHERE id = s.id;
    ELSE
      UPDATE public.subscriptions SET season_hold_id = v_hold WHERE id = s.id;
    END IF;

    IF v_reason = 'season' THEN
      v_season_holds := v_season_holds + 1;
      v_held_meals := v_held_meals + v_left;
    ELSE
      v_pause_holds := v_pause_holds + 1;
    END IF;

    -- Paid season holds earn the waitlist credit (spec §8 step 7, X5).
    v_paid := v_reason = 'season' AND v_order_id IS NOT NULL AND public.expense_category_for_plan(s.plan_name) IS NULL;
    IF v_paid THEN
      INSERT INTO public.intake_waitlist (customer_id, cycle_started_at)
      VALUES (s.customer_id, v_cycle)
      ON CONFLICT (customer_id, cycle_started_at) DO NOTHING;
      SELECT id INTO v_waitlist FROM public.intake_waitlist WHERE customer_id = s.customer_id AND cycle_started_at = v_cycle;
      SELECT id INTO v_credit FROM public.credits WHERE intake_waitlist_id = v_waitlist;

      IF v_credit IS NULL THEN
        SELECT meal_preference_type INTO v_pref FROM public.customers WHERE id = s.customer_id;
        v_amount := CASE v_pref
          WHEN 'Veg' THEN r.credit_veg_aed
          WHEN 'Religious Preference' THEN r.credit_religious_aed
          ELSE r.credit_nonveg_aed
        END;
        IF v_amount > 0 THEN
          INSERT INTO public.credits (customer_id, amount_aed, source, status, eligible_plan_ids, intake_waitlist_id)
          VALUES (s.customer_id, v_amount, 'intake_waitlist', 'approved', ARRAY['monthly-max', 'monthly-premium']::text[], v_waitlist)
          ON CONFLICT (intake_waitlist_id) WHERE intake_waitlist_id IS NOT NULL DO NOTHING
          RETURNING id INTO v_credit;
          IF v_credit IS NOT NULL THEN
            v_credits := v_credits + 1;
            v_credit_aed := v_credit_aed + v_amount;
          ELSE
            SELECT id INTO v_credit FROM public.credits WHERE intake_waitlist_id = v_waitlist;
          END IF;
        END IF;
      END IF;

      IF v_credit IS NOT NULL THEN
        UPDATE public.intake_waitlist SET credit_id = v_credit WHERE id = v_waitlist AND credit_id IS NULL;
        UPDATE public.season_holds SET waitlist_credit_id = v_credit, updated_at = now() WHERE id = v_hold;
      END IF;
    END IF;
  END LOOP;

  -- No promise of a meal after the close day survives the break (spec §8 step 8).
  UPDATE public.customer_notifications
  SET sent_at = now(), wamid = 'cancelled:superseded'
  WHERE sent_at IS NULL
    AND kind = 'meal_resumed_confirm'
    AND CASE WHEN (payload->>'resume_date') ~ '^\d{4}-\d{2}-\d{2}$'
             THEN (payload->>'resume_date')::date > r.close_day
             ELSE false END;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  UPDATE public.intake_settings SET
    season_phase = 'break',
    paused = true,
    paused_at = COALESCE(r.paused_at, now()),
    paused_by = CASE WHEN r.paused THEN r.paused_by ELSE 'schedule' END,
    sales_stopped_at = COALESCE(r.sales_stopped_at, now()),
    break_started_at = now(),
    cycle_started_at = v_cycle,
    updated_at = now()
  WHERE id = r.id;

  BEGIN
    PERFORM public.send_admin_whatsapp_alert(
      format('The semester break has started and the kitchen is closed until you reopen. Held for next semester: %s plans, %s meals. Customer pauses carried: %s. Waitlist credit added: %s customers, AED %s. Reopen on the Season page when you are back.',
             v_season_holds, v_held_meals, v_pause_holds, v_credits, trim(to_char(v_credit_aed, 'FM999990.99'), '.')),
      'season_break');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'season break summary alert failed: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'started', true,
    'season_holds', v_season_holds,
    'customer_pause_holds', v_pause_holds,
    'held_meals', v_held_meals,
    'credits_minted', v_credits,
    'credit_aed', v_credit_aed,
    'notifications_closed', v_closed
  );
END;
$$;

-- 00:15 AE, retried at 00:45 and 01:15 (Task 15). Replaces
-- intake_scheduled_pause_tick, keeping both of its paths.
CREATE OR REPLACE FUNCTION public.season_break_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.ae_today();
  r public.intake_settings;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('action', 'none', 'reason', 'no_settings');
  END IF;

  -- The first Dubai day after the close day: the break begins (spec §8).
  IF r.season_phase = 'winding_down' AND r.close_day IS NOT NULL AND r.close_day < v_today THEN
    RETURN jsonb_build_object('action', 'begin_break') || public.season_begin_break();
  END IF;

  -- Past the wrap-up day: sales close; the season carries on to the close day.
  IF r.season_phase = 'winding_down' AND r.wrap_up_day IS NOT NULL AND r.wrap_up_day < v_today THEN
    IF NOT r.paused THEN
      UPDATE public.intake_settings SET
        paused = true,
        paused_at = now(),
        paused_by = 'schedule',
        sales_stopped_at = COALESCE(r.sales_stopped_at, now()),
        updated_at = now()
      WHERE id = r.id;
      RETURN jsonb_build_object('action', 'sales_closed');
    END IF;
    RETURN jsonb_build_object('action', 'none', 'reason', 'waiting_for_close_day');
  END IF;

  -- Legacy: a pause_scheduled_for written while open (the season functions never do).
  IF r.season_phase = 'open' AND r.pause_scheduled_for IS NOT NULL AND r.pause_scheduled_for < v_today THEN
    IF r.paused THEN
      UPDATE public.intake_settings SET pause_scheduled_for = NULL, updated_at = now() WHERE id = r.id;
      RETURN jsonb_build_object('action', 'legacy_cleared');
    END IF;
    UPDATE public.intake_settings SET
      paused = true,
      paused_at = now(),
      paused_by = 'schedule',
      cycle_started_at = now(),
      pause_scheduled_for = NULL,
      updated_at = now()
    WHERE id = r.id AND paused = false;
    RETURN jsonb_build_object('action', 'legacy_paused');
  END IF;

  RETURN jsonb_build_object('action', 'none');
END;
$$;

-- Hourly (Task 15). Plan G adds the other G10 rules to this function.
CREATE OR REPLACE FUNCTION public.season_invariants_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          public.intake_settings;
  v_today    date := public.ae_today();
  v_now_ae   timestamp := now() AT TIME ZONE 'Asia/Dubai';
  v_active   integer;
  v_list     text;
  v_breaches text[] := '{}';
BEGIN
  SELECT * INTO r FROM public.intake_settings;
  IF NOT FOUND OR r.season_phase = 'open' THEN
    RETURN jsonb_build_object('checked', false);
  END IF;

  -- An Active plan the delivery tick would cook, during the break.
  IF r.season_phase = 'break' THEN
    SELECT count(*) INTO v_active
    FROM public.subscriptions
    WHERE status = 'Active'
      AND COALESCE(delivered_meals, 0) < total_meals - COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1);
    IF v_active > 0 THEN
      SELECT string_agg(x.plan_name || ' ' || x.id::text, ', ') INTO v_list
      FROM (
        SELECT id, plan_name FROM public.subscriptions
        WHERE status = 'Active'
          AND COALESCE(delivered_meals, 0) < total_meals - COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1)
        ORDER BY created_at
        LIMIT 5
      ) x;
      v_breaches := v_breaches || 'active_during_break'::text;
      BEGIN
        PERFORM public.send_admin_whatsapp_alert(
          format('URGENT: %s plans are Active during the semester break, so they could be counted for cooking: %s. Pause each one from its customer page and check the Season page.', v_active, v_list),
          'season_invariant');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'season invariant alert failed: %', SQLERRM;
      END;
    END IF;
  END IF;

  -- The break has not started although the close day has passed (01:30 AE).
  IF r.season_phase = 'winding_down' AND r.close_day IS NOT NULL AND r.close_day < v_today
     AND (v_now_ae::time >= time '01:30' OR r.close_day < v_today - 1) THEN
    v_breaches := v_breaches || 'break_not_started'::text;
    BEGIN
      PERFORM public.send_admin_whatsapp_alert(
        format('URGENT: the semester break has not started. The close day was %s and it is past 01:30 in Dubai, so plans with meals left are not held and nothing stops a restart. Check the semester break starter on the Scheduled Jobs page.', to_char(r.close_day, 'Dy DD Mon')),
        'season_invariant');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'season invariant alert failed: %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('checked', true, 'breaches', to_jsonb(v_breaches));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_begin_break() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_break_tick() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_invariants_tick() FROM public, anon, authenticated;

COMMIT;
```

- [ ] **Step 3: Apply it live**

Use `apply_migration`, name `season_begin_break`, file content without `BEGIN;` / `COMMIT;`.
Expected: success. Nothing calls these functions yet.

- [ ] **Step 4: Rehearse inside a transaction that rolls itself back**

```sql
DO $$
DECLARE
  v_today date := public.ae_today();
  v_cycle timestamptz := now();
  a  public.subscriptions;
  p  public.subscriptions;
  f  public.subscriptions;
  ha public.season_holds;
  hp public.season_holds;
  st public.intake_settings;
  v  jsonb;
  v_left integer;
  v_amount numeric;
  v_late uuid;
  v_early uuid;
  v_holds integer;
  v_log text := '';
BEGIN
  -- A: a paid Active monthly plan with meals left.
  SELECT sub.* INTO a FROM public.subscriptions sub
  WHERE sub.status = 'Active' AND sub.plan_name ILIKE '%monthly%' AND public.expense_category_for_plan(sub.plan_name) IS NULL
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.subscription_id = sub.id)
    AND COALESCE(sub.delivered_meals, 0) < sub.total_meals - COALESCE(sub.credited_skip_days, 0) * COALESCE(sub.meals_per_day, 1)
  ORDER BY sub.end_date DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'REHEARSAL_SKIPPED: no paid Active monthly plan with meals left'; END IF;
  v_left := a.total_meals - COALESCE(a.delivered_meals, 0) - COALESCE(a.credited_skip_days, 0) * COALESCE(a.meals_per_day, 1);

  -- P: a customer pause with meals left, if there is one.
  SELECT * INTO p FROM public.subscriptions
  WHERE status = 'Paused' AND id <> a.id
    AND COALESCE(delivered_meals, 0) < total_meals - COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1)
  LIMIT 1;

  -- F: another Active plan made to finish tonight: nothing left, so no hold.
  SELECT * INTO f FROM public.subscriptions WHERE status = 'Active' AND id <> a.id LIMIT 1;
  IF f.id IS NOT NULL THEN
    UPDATE public.subscriptions SET delivered_meals = total_meals - COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1) WHERE id = f.id;
  END IF;

  -- The season: close day yesterday, a fresh season epoch so no waitlist row exists yet.
  UPDATE public.intake_settings SET season_phase = 'winding_down', wrap_up_day = v_today - 2, close_day = v_today - 1,
    buffer_delivery_days = 1, cycle_started_at = v_cycle, paused = true, sales_stopped_at = now(), break_started_at = NULL;

  -- Two pending resume confirmations for A: one after the close day (closed), one before it (kept).
  INSERT INTO public.customer_notifications (customer_id, kind, scheduled_for, payload)
  VALUES (a.customer_id, 'meal_resumed_confirm', now() + interval '1 day', jsonb_build_object('resume_date', to_char(v_today + 3, 'YYYY-MM-DD'))) RETURNING id INTO v_late;
  INSERT INTO public.customer_notifications (customer_id, kind, scheduled_for, payload)
  VALUES (a.customer_id, 'meal_resumed_confirm', now() + interval '1 day', jsonb_build_object('resume_date', to_char(v_today - 2, 'YYYY-MM-DD'))) RETURNING id INTO v_early;

  v := public.season_break_tick();
  IF v->>'action' <> 'begin_break' OR (v->>'started')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL tick did not begin the break: %', v; END IF;
  v_log := v_log || 'tick began the break ok; ';

  SELECT * INTO a FROM public.subscriptions WHERE id = a.id;
  SELECT * INTO ha FROM public.season_holds WHERE subscription_id = a.id AND cycle_started_at = v_cycle;
  IF a.status <> 'Paused' OR a.season_hold_id IS DISTINCT FROM ha.id OR ha.reason <> 'season' OR ha.state <> 'held'
     OR ha.held_meals <> v_left OR ha.waitlist_credit_id IS NULL OR ha.order_id IS NULL THEN
    RAISE EXCEPTION 'FAIL paid Active plan not held: % %', row_to_json(a), row_to_json(ha);
  END IF;
  SELECT CASE c.meal_preference_type WHEN 'Veg' THEN s.credit_veg_aed WHEN 'Religious Preference' THEN s.credit_religious_aed ELSE s.credit_nonveg_aed END
    INTO v_amount FROM public.customers c, public.intake_settings s WHERE c.id = a.customer_id;
  IF (SELECT amount_aed FROM public.credits WHERE id = ha.waitlist_credit_id) <> v_amount
     OR (SELECT status FROM public.credits WHERE id = ha.waitlist_credit_id) <> 'approved'
     OR NOT EXISTS (SELECT 1 FROM public.intake_waitlist w WHERE w.customer_id = a.customer_id AND w.cycle_started_at = v_cycle AND w.credit_id = ha.waitlist_credit_id) THEN
    RAISE EXCEPTION 'FAIL waitlist credit wrong for the held plan';
  END IF;
  v_log := v_log || 'paid plan held with its credit ok; ';

  IF p.id IS NOT NULL THEN
    SELECT * INTO hp FROM public.season_holds WHERE subscription_id = p.id AND cycle_started_at = v_cycle;
    IF hp.reason <> 'customer_pause' OR hp.state <> 'paused_by_customer' OR hp.waitlist_credit_id IS NOT NULL
       OR (SELECT status FROM public.subscriptions WHERE id = p.id) <> 'Paused' THEN
      RAISE EXCEPTION 'FAIL customer pause not carried: %', row_to_json(hp);
    END IF;
    v_log := v_log || 'customer pause carried ok; ';
  ELSE
    v_log := v_log || 'no Paused plan live, customer pause case not run; ';
  END IF;

  IF f.id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.season_holds WHERE subscription_id = f.id) OR (SELECT status FROM public.subscriptions WHERE id = f.id) <> 'Active' THEN
      RAISE EXCEPTION 'FAIL a finished plan was held';
    END IF;
    v_log := v_log || 'finished plan left to end ok; ';
  END IF;

  IF (SELECT wamid FROM public.customer_notifications WHERE id = v_late) IS DISTINCT FROM 'cancelled:superseded'
     OR (SELECT sent_at FROM public.customer_notifications WHERE id = v_early) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL notifications after the close day not closed exactly';
  END IF;
  v_log := v_log || 'late promises closed ok; ';

  SELECT * INTO st FROM public.intake_settings;
  IF st.season_phase <> 'break' OR NOT st.paused OR st.break_started_at IS NULL OR st.sales_stopped_at IS NULL THEN
    RAISE EXCEPTION 'FAIL phase not break: %', row_to_json(st);
  END IF;
  v_log := v_log || 'phase break ok; ';

  -- Safe to run twice.
  SELECT count(*) INTO v_holds FROM public.season_holds WHERE cycle_started_at = v_cycle;
  v := public.season_break_tick();
  IF v->>'action' <> 'none' OR (SELECT count(*) FROM public.season_holds WHERE cycle_started_at = v_cycle) <> v_holds THEN
    RAISE EXCEPTION 'FAIL second tick changed something: %', v;
  END IF;
  v_log := v_log || 'second run does nothing ok; ';

  -- Invariants: clean during the break, then an Active plan is a breach.
  v := public.season_invariants_tick();
  IF (v->'breaches') <> '[]'::jsonb THEN RAISE EXCEPTION 'FAIL breach on a clean break: %', v; END IF;
  PERFORM set_config('dormers.season_release', 'on', true);
  UPDATE public.subscriptions SET status = 'Active' WHERE id = a.id;
  PERFORM set_config('dormers.season_release', '', true);
  v := public.season_invariants_tick();
  IF NOT (v->'breaches') ? 'active_during_break' THEN RAISE EXCEPTION 'FAIL Active plan during the break not caught: %', v; END IF;
  v_log := v_log || 'active during break caught ok; ';

  -- Invariants: the break not started two days after the close day.
  UPDATE public.intake_settings SET season_phase = 'winding_down', wrap_up_day = v_today - 3, close_day = v_today - 2;
  v := public.season_invariants_tick();
  IF NOT (v->'breaches') ? 'break_not_started' THEN RAISE EXCEPTION 'FAIL late break not caught: %', v; END IF;
  v_log := v_log || 'late break caught ok; ';

  -- The tick's other paths: sales close after W, and the legacy scheduled pause.
  UPDATE public.intake_settings SET season_phase = 'winding_down', wrap_up_day = v_today - 1, close_day = v_today + 1, paused = false, sales_stopped_at = NULL;
  v := public.season_break_tick();
  IF v->>'action' <> 'sales_closed' OR NOT (SELECT paused FROM public.intake_settings) OR (SELECT season_phase FROM public.intake_settings) <> 'winding_down' THEN
    RAISE EXCEPTION 'FAIL sales did not close after the wrap-up day: %', v;
  END IF;
  UPDATE public.intake_settings SET season_phase = 'open', wrap_up_day = NULL, close_day = NULL, paused = false, sales_stopped_at = NULL, pause_scheduled_for = v_today - 1;
  v := public.season_break_tick();
  IF v->>'action' <> 'legacy_paused' OR NOT (SELECT paused FROM public.intake_settings) THEN RAISE EXCEPTION 'FAIL legacy path: %', v; END IF;
  v_log := v_log || 'sales close and legacy paths ok; ';

  RAISE EXCEPTION 'BEGIN_BREAK_OK: %', v_log;
END;
$$;
```

Expected: an error starting `BEGIN_BREAK_OK: tick began the break ok; paid plan held with its credit ok; customer pause carried ok; finished plan left to end ok; late promises closed ok; phase break ok; second run does nothing ok; active during break caught ok; late break caught ok; sales close and legacy paths ok;` (on 2026-09-15 all three plan cases have live plans). The owner's summary and the invariant alerts are queued inside the rolled-back transaction, so none is sent.

Then confirm live is untouched:

```sql
select season_phase, paused, wrap_up_day, close_day, break_started_at from public.intake_settings;
select count(*) as holds from public.season_holds;
select count(*) as new_waitlist_rows from public.intake_waitlist where joined_at > now() - interval '1 hour';
```

Expected: the row as the owner left it with `break_started_at` null; 0 holds; 0 new waitlist rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260916_season_begin_break.sql
git commit -m "feat(season): the break holds every plan with meals left, credits paid holds and closes the kitchen

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: Reopen, release a hold, and end today with skips reconciled (live SQL)

**Files:**
- Create: `supabase/migrations/20260916_season_reopen_release.sql`

**Interfaces:**
- Consumes: Task 4 G2 (release sets `dormers.season_release`); Task 5 holds; Plan A `_season_state(intake_settings)`; Plan B `season_reconcile_skips(date, date, integer)`.
- Produces (live, SECURITY DEFINER, execute revoked from `public, anon, authenticated`):
  - `public.season_reopen(p_actor text) returns jsonb`: break → open. Every hold in `held` or `paused_by_customer` becomes `ready` (`ready_at`); `cycle_ended_at = now()`; W, K and `pause_scheduled_for` cleared; `sales_stopped_at` cleared and `paused = false` (sales open). Returns `_season_state(r) || { ready_holds, ready_customer_pauses }`. Refuses with `SEASON_BAD_PHASE` outside the break.
  - `public.season_release_hold(p_customer_id uuid, p_subscription_id uuid, p_start_date date, p_resume_cutoff boolean) returns jsonb` `{ subscription_id, status: 'Active' | 'Scheduled', followers }`:
    - refuses with `SEASON_BREAK` during the break; `SEASON_RELEASE_NOT_FOUND` for a plan that is not the customer's; `SEASON_RELEASE_NOT_HELD` without `season_hold_id`; `SEASON_RELEASE_NOT_READY` unless the hold is `ready`;
    - a Paused plan (no start date, else `SEASON_RELEASE_BAD_INPUT`) becomes Active with `pause_date` null, and with `p_resume_cutoff` today joins `resume_cutoff_date` and `paused_dates` (as `resumeSubscription` does); every `ready` Scheduled hold of the same customer is released with it (`followers`);
    - a Scheduled plan (start date required, else `SEASON_RELEASE_BAD_INPUT`) gets the new `start_date`, and `start_date_changed_at` is not touched (spec §7.6);
    - anything else raises `SEASON_RELEASE_BAD_STATUS`;
    - the hold becomes `released` with `released_at`; `season_hold_id` is cleared.
  - `public.season_end_today(p_actor text)` also calls `season_reconcile_skips(W, K, 0)` and returns `_season_state(r) || { reconciled }`, like `season_schedule_end` and `season_move_end` after Plan B.

Safe with Plan B's app deployed: `season_reopen` and `season_release_hold` are new and unused; the "End the season today" button stays hidden until Task 15.

- [ ] **Step 1: Read the live end-today function**

```sql
select pg_get_functiondef('public.season_end_today'::regproc);
select pg_get_functiondef('public.season_reconcile_skips'::regproc) is not null as reconcile_live;
```

Expected: the body in `supabase/migrations/20260914_season_transitions.sql` (checked 2026-09-15) and `reconcile_live = true`. A difference in logic stops the task.

- [ ] **Step 2: Write the migration file**

`supabase/migrations/20260916_season_reopen_release.sql`:

```sql
-- ============================================================================
-- Season wind-down, plan C: reopening, releasing a held plan, and skips
-- reconciled when the season ends today (spec
-- docs/superpowers/specs/2026-09-14-season-wind-down-design.md §5, §6.3, §7.5, §7.6).
--
-- season_end_today was copied from pg_get_functiondef on live; only the lines
-- marked "Plan C" differ. Reopening notices are Plan F; refunds are Plan D.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_reopen_release`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.season_reopen(p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r              public.intake_settings;
  v_ready        integer := 0;
  v_ready_pauses integer := 0;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF r.season_phase <> 'break' THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: cannot reopen from %', r.season_phase;
  END IF;

  WITH moved AS (
    UPDATE public.season_holds
    SET state = 'ready', ready_at = now(), updated_at = now()
    WHERE state IN ('held', 'paused_by_customer')
    RETURNING reason
  )
  SELECT count(*) FILTER (WHERE reason = 'season'), count(*) FILTER (WHERE reason = 'customer_pause')
    INTO v_ready, v_ready_pauses
  FROM moved;

  UPDATE public.intake_settings SET
    season_phase = 'open',
    wrap_up_day = NULL,
    close_day = NULL,
    pause_scheduled_for = NULL,
    sales_stopped_at = NULL,
    paused = false,
    paused_at = NULL,
    cycle_ended_at = now(),
    updated_at = now()
  WHERE id = r.id
  RETURNING * INTO r;

  RETURN public._season_state(r) || jsonb_build_object('ready_holds', v_ready, 'ready_customer_pauses', v_ready_pauses);
END;
$$;

CREATE OR REPLACE FUNCTION public.season_release_hold(
  p_customer_id uuid, p_subscription_id uuid, p_start_date date, p_resume_cutoff boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today     date := public.ae_today();
  v_phase     text;
  s           public.subscriptions;
  h           public.season_holds;
  v_followers integer := 0;
BEGIN
  SELECT season_phase INTO v_phase FROM public.intake_settings;
  IF v_phase = 'break' THEN
    RAISE EXCEPTION 'SEASON_BREAK: plan % cannot restart during the semester break', p_subscription_id;
  END IF;

  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id AND customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_RELEASE_NOT_FOUND'; END IF;
  IF s.season_hold_id IS NULL THEN RAISE EXCEPTION 'SEASON_RELEASE_NOT_HELD: plan % has no hold', s.id; END IF;
  SELECT * INTO h FROM public.season_holds WHERE id = s.season_hold_id FOR UPDATE;
  IF NOT FOUND OR h.state <> 'ready' THEN
    RAISE EXCEPTION 'SEASON_RELEASE_NOT_READY: hold is %', COALESCE(h.state, 'missing');
  END IF;

  PERFORM set_config('dormers.season_release', 'on', true);

  IF s.status = 'Paused' THEN
    IF p_start_date IS NOT NULL THEN
      RAISE EXCEPTION 'SEASON_RELEASE_BAD_INPUT: a paused plan resumes, it takes no start date';
    END IF;
    UPDATE public.subscriptions SET
      status = 'Active',
      pause_date = NULL,
      season_hold_id = NULL,
      resume_cutoff_date = CASE WHEN p_resume_cutoff THEN v_today ELSE resume_cutoff_date END,
      paused_dates = CASE
        WHEN p_resume_cutoff AND NOT (v_today::text = ANY(COALESCE(paused_dates, '{}'::text[])))
          THEN array_append(COALESCE(paused_dates, '{}'::text[]), v_today::text)
        ELSE paused_dates END
    WHERE id = s.id;

    -- A queued renewal held behind this plan follows it (Plan C scope rule 1).
    WITH followers AS (
      UPDATE public.season_holds fh
      SET state = 'released', released_at = now(), updated_at = now()
      FROM public.subscriptions q
      WHERE q.customer_id = s.customer_id
        AND q.id <> s.id
        AND q.status = 'Scheduled'
        AND q.season_hold_id = fh.id
        AND fh.state = 'ready'
      RETURNING q.id AS subscription_id
    )
    UPDATE public.subscriptions sub SET season_hold_id = NULL
    FROM followers f
    WHERE sub.id = f.subscription_id;
    GET DIAGNOSTICS v_followers = ROW_COUNT;
  ELSIF s.status = 'Scheduled' THEN
    IF p_start_date IS NULL THEN
      RAISE EXCEPTION 'SEASON_RELEASE_BAD_INPUT: a held Scheduled plan needs a start date';
    END IF;
    -- start_date_changed_at stays as it was: this change does not use the allowance (spec §7.6).
    UPDATE public.subscriptions SET start_date = p_start_date, season_hold_id = NULL WHERE id = s.id;
  ELSE
    RAISE EXCEPTION 'SEASON_RELEASE_BAD_STATUS: %', s.status;
  END IF;

  UPDATE public.season_holds SET state = 'released', released_at = now(), updated_at = now() WHERE id = h.id;
  PERFORM set_config('dormers.season_release', '', true);

  RETURN jsonb_build_object(
    'subscription_id', s.id,
    'status', CASE WHEN s.status = 'Paused' THEN 'Active' ELSE 'Scheduled' END,
    'followers', v_followers
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.season_end_today(p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.intake_settings;
  v_today date := public.ae_today();
  v_reconciled jsonb;  -- Plan C
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF r.season_phase NOT IN ('open', 'winding_down') THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: cannot end the season from %', r.season_phase;
  END IF;

  UPDATE public.intake_settings SET
    season_phase = 'winding_down',
    wrap_up_day = v_today,
    close_day = v_today,
    buffer_delivery_days = 0,
    pause_scheduled_for = v_today,
    sales_stopped_at = COALESCE(r.sales_stopped_at, now()),
    paused = true,
    paused_at = CASE WHEN r.sales_stopped_at IS NULL THEN now() ELSE r.paused_at END,
    paused_by = CASE WHEN r.sales_stopped_at IS NULL THEN p_actor ELSE r.paused_by END,
    cycle_started_at = CASE WHEN r.season_phase = 'open' THEN now() ELSE r.cycle_started_at END,
    updated_at = now()
  WHERE id = r.id
  RETURNING * INTO r;

  -- Plan C (spec §5): skips whose make-up meal now lands after today become credit.
  v_reconciled := public.season_reconcile_skips(r.wrap_up_day, r.close_day, r.buffer_delivery_days);  -- Plan C
  RETURN public._season_state(r) || jsonb_build_object('reconciled', v_reconciled);  -- Plan C
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.season_reopen(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_release_hold(uuid, uuid, date, boolean) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_end_today(text) FROM public, anon, authenticated;

COMMIT;
```

- [ ] **Step 3: Apply it live**

Use `apply_migration`, name `season_reopen_release`, file content without `BEGIN;` / `COMMIT;`.
Expected: success.

- [ ] **Step 4: Rehearse inside a transaction that rolls itself back**

```sql
DO $$
DECLARE
  v_today date := public.ae_today();
  v_cycle timestamptz := now();
  a  public.subscriptions;
  p  public.subscriptions;
  q  uuid;
  hq uuid;
  st public.intake_settings;
  v  jsonb;
  v_log text := '';
BEGIN
  SELECT sub.* INTO a FROM public.subscriptions sub
  WHERE sub.status = 'Active' AND sub.plan_name ILIKE '%monthly%' AND public.expense_category_for_plan(sub.plan_name) IS NULL
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.subscription_id = sub.id)
    AND COALESCE(sub.delivered_meals, 0) < sub.total_meals - COALESCE(sub.credited_skip_days, 0) * COALESCE(sub.meals_per_day, 1)
  ORDER BY sub.end_date DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'REHEARSAL_SKIPPED: no paid Active monthly plan with meals left'; END IF;
  SELECT * INTO p FROM public.subscriptions
  WHERE status = 'Paused' AND id <> a.id
    AND COALESCE(delivered_meals, 0) < total_meals - COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1)
  LIMIT 1;

  UPDATE public.intake_settings SET season_phase = 'winding_down', wrap_up_day = v_today - 2, close_day = v_today - 1,
    buffer_delivery_days = 1, cycle_started_at = v_cycle, paused = true, sales_stopped_at = now();
  PERFORM public.season_begin_break();

  -- A held plan cannot be released during the break.
  BEGIN
    PERFORM public.season_release_hold(a.customer_id, a.id, NULL, false);
    RAISE EXCEPTION 'FAIL release allowed during the break';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SEASON_BREAK:%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'release refused during the break ok; ';

  v := public.season_reopen('plan-c-rehearsal');
  SELECT * INTO st FROM public.intake_settings;
  IF st.season_phase <> 'open' OR st.paused OR st.wrap_up_day IS NOT NULL OR st.close_day IS NOT NULL OR st.sales_stopped_at IS NOT NULL
     OR st.cycle_ended_at IS NULL OR (v->>'ready_holds')::int < 1 THEN
    RAISE EXCEPTION 'FAIL reopen: % %', v, row_to_json(st);
  END IF;
  IF EXISTS (SELECT 1 FROM public.season_holds WHERE cycle_started_at = v_cycle AND state IN ('held', 'paused_by_customer')) THEN
    RAISE EXCEPTION 'FAIL a hold did not become ready';
  END IF;
  v_log := v_log || 'reopen made holds ready ok; ';

  BEGIN
    PERFORM public.season_reopen('plan-c-rehearsal');
    RAISE EXCEPTION 'FAIL reopened twice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SEASON_BAD_PHASE%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'second reopen refused ok; ';

  -- A queued renewal of A's customer, held and ready, follows A's release.
  INSERT INTO public.subscriptions (customer_id, plan_name, status, start_date, end_date, total_meals, delivered_meals, meals_per_day, week_type, meal_preference_type)
  VALUES (a.customer_id, 'Monthly Premium', 'Scheduled', v_today + 40, v_today + 70, 24, 0, 1, '6DAYS', 'Non Veg') RETURNING id INTO q;
  INSERT INTO public.season_holds (subscription_id, customer_id, cycle_started_at, reason, state, held_meals)
  VALUES (q, a.customer_id, v_cycle, 'season', 'ready', 24) RETURNING id INTO hq;
  UPDATE public.subscriptions SET season_hold_id = hq WHERE id = q;

  BEGIN
    PERFORM public.season_release_hold(gen_random_uuid(), a.id, NULL, false);
    RAISE EXCEPTION 'FAIL another customer released the plan';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SEASON_RELEASE_NOT_FOUND%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.season_release_hold(a.customer_id, a.id, v_today + 2, false);
    RAISE EXCEPTION 'FAIL a paused plan took a start date';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SEASON_RELEASE_BAD_INPUT%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'wrong customer and bad input refused ok; ';

  v := public.season_release_hold(a.customer_id, a.id, NULL, true);
  SELECT * INTO a FROM public.subscriptions WHERE id = a.id;
  IF v->>'status' <> 'Active' OR (v->>'followers')::int <> 1 OR a.status <> 'Active' OR a.season_hold_id IS NOT NULL
     OR a.resume_cutoff_date IS DISTINCT FROM v_today OR NOT (v_today::text = ANY(a.paused_dates))
     OR (SELECT state FROM public.season_holds WHERE subscription_id = a.id AND cycle_started_at = v_cycle) <> 'released'
     OR (SELECT season_hold_id FROM public.subscriptions WHERE id = q) IS NOT NULL
     OR (SELECT state FROM public.season_holds WHERE id = hq) <> 'released' THEN
    RAISE EXCEPTION 'FAIL release of the paused plan: % %', v, row_to_json(a);
  END IF;
  v_log := v_log || 'paused plan released with its queued renewal ok; ';

  BEGIN
    PERFORM public.season_release_hold(a.customer_id, a.id, NULL, false);
    RAISE EXCEPTION 'FAIL released twice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SEASON_RELEASE_NOT_HELD%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'second release refused ok; ';

  -- A held Scheduled plan on its own is released by picking a start date.
  INSERT INTO public.season_holds (subscription_id, customer_id, cycle_started_at, reason, state, held_meals)
  VALUES (q, a.customer_id, v_cycle - interval '1 second', 'season', 'ready', 24) RETURNING id INTO hq;
  UPDATE public.subscriptions SET season_hold_id = hq, start_date_changed_at = NULL WHERE id = q;
  v := public.season_release_hold(a.customer_id, q, v_today + 45, false);
  IF v->>'status' <> 'Scheduled'
     OR (SELECT start_date FROM public.subscriptions WHERE id = q) <> v_today + 45
     OR (SELECT start_date_changed_at FROM public.subscriptions WHERE id = q) IS NOT NULL
     OR (SELECT state FROM public.season_holds WHERE id = hq) <> 'released' THEN
    RAISE EXCEPTION 'FAIL release of the Scheduled plan: %', v;
  END IF;
  v_log := v_log || 'scheduled plan released on its start date ok; ';

  IF p.id IS NOT NULL THEN
    v := public.season_release_hold(p.customer_id, p.id, NULL, false);
    IF (SELECT status FROM public.subscriptions WHERE id = p.id) <> 'Active' THEN RAISE EXCEPTION 'FAIL customer pause not released'; END IF;
    v_log := v_log || 'customer pause released ok; ';
  END IF;

  -- End today now reconciles skips.
  v := public.season_end_today('plan-c-rehearsal');
  IF NOT (v ? 'reconciled') OR jsonb_typeof(v->'reconciled') <> 'array' OR v->>'wrap_up_day' <> to_char(v_today, 'YYYY-MM-DD') THEN
    RAISE EXCEPTION 'FAIL end today: %', v;
  END IF;
  v_log := v_log || 'end today reconciles ok; ';

  RAISE EXCEPTION 'REOPEN_RELEASE_OK: %', v_log;
END;
$$;
```

Expected: an error starting `REOPEN_RELEASE_OK: release refused during the break ok; reopen made holds ready ok; second reopen refused ok; wrong customer and bad input refused ok; paused plan released with its queued renewal ok; second release refused ok; scheduled plan released on its start date ok; customer pause released ok; end today reconciles ok;`.

Then confirm live is untouched:

```sql
select season_phase, wrap_up_day, close_day, paused, cycle_ended_at from public.intake_settings;
select count(*) from public.season_holds;
```

Expected: the row as the owner left it (on 2026-09-15 `cycle_ended_at` is `2026-09-01 17:05:29+00`); 0 holds.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260916_season_reopen_release.sql
git commit -m "feat(season): reopen makes held plans ready, Resume or a start date releases them, end today reconciles skips

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 7: Reopen and release in TypeScript

**Files:**
- Create: `src/contexts/season/domain/season-break-errors.ts`
- Test: `src/contexts/season/domain/season-break-errors.test.ts`
- Create: `src/contexts/season/usecases/release-hold.ts`
- Test: `src/contexts/season/usecases/release-hold.test.ts`
- Create: `src/contexts/season/domain/season-reopen.ts`
- Test: `src/contexts/season/domain/season-reopen.test.ts`
- Create: `src/contexts/season/usecases/season-reopen-notices.ts`
- Modify: `src/contexts/season/usecases/season-transitions.ts`
- Modify: `src/contexts/season/usecases/season-transitions.test.ts`
- Modify: `src/app/admin/season/actions.ts`

**Interfaces:**
- Consumes: Task 6 SQL `season_reopen`, `season_release_hold`, `season_end_today`; Plan A `runSeasonTransition` (as changed by Plan B Task 8: it calls `announceSeasonSkipCredited(receiptsFromTransition(data))`), `SeasonTransitionResult`, `friendlySeasonError`, `requireAdmin`.
- Produces:
  - `BREAK_RESUME_COPY`, `BREAK_START_DATE_COPY`, `ADMIN_BREAK_RESUME_COPY`, `RELEASE_CHANGED_COPY`, `RELEASE_ERROR_FALLBACK` (strings)
  - `friendlyReleaseError(message: string | null | undefined): string`
  - `isSeasonBreakError(message: string | null | undefined): boolean`
  - `type ReleaseHoldResult = { ok: true; status: 'Active' | 'Scheduled'; followers: number } | { ok: false; error: string; seasonBreak: boolean }`
  - `releaseSeasonHold(input: { customerId: string; subscriptionId: string; startDate: string | null; resumeCutoff: boolean }): Promise<ReleaseHoldResult>`
  - `interface SeasonReopenSummary { readyHolds: number; readyCustomerPauses: number }`, `reopenSummaryFrom(state: unknown): SeasonReopenSummary`
  - `announceSeasonReopened(summary: SeasonReopenSummary): Promise<void>` (the Plan F hook)
  - `reopenSeason(adminEmail: string): Promise<SeasonTransitionResult>`; audit action `season_reopened`
  - `reopenSeasonAction(): Promise<SeasonTransitionResult>` in `src/app/admin/season/actions.ts`
  - `runSeasonTransition` gains an optional last parameter `onDone?: (state: unknown) => Promise<void>`, called after the audit and the skip-credit hook.

- [ ] **Step 1: Write the failing tests**

`src/contexts/season/domain/season-break-errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  friendlyReleaseError, isSeasonBreakError,
  BREAK_RESUME_COPY, BREAK_START_DATE_COPY, ADMIN_BREAK_RESUME_COPY, RELEASE_CHANGED_COPY, RELEASE_ERROR_FALLBACK,
} from './season-break-errors'

describe('season break copy', () => {
  it('says the kitchen is closed and when the plan can resume (spec §7.5)', () => {
    expect(BREAK_RESUME_COPY).toBe("The kitchen is closed between semesters. Your plan can resume once we're back.")
    expect(BREAK_START_DATE_COPY).toBe("The kitchen is closed between semesters, so your start date can't change yet. You can pick it once we're back.")
    expect(ADMIN_BREAK_RESUME_COPY).toBe('Cannot resume: the kitchen is closed for the semester break. This plan can resume after you reopen on the Season page.')
  })

  it('turns every release refusal into plain copy', () => {
    expect(friendlyReleaseError('SEASON_BREAK: plan x cannot restart during the semester break')).toBe(BREAK_RESUME_COPY)
    expect(friendlyReleaseError('SEASON_RELEASE_NOT_READY: hold is held')).toBe(RELEASE_CHANGED_COPY)
    expect(friendlyReleaseError('SEASON_RELEASE_NOT_HELD: plan x has no hold')).toBe(RELEASE_CHANGED_COPY)
    expect(friendlyReleaseError('SEASON_RELEASE_BAD_STATUS: Ended')).toBe(RELEASE_CHANGED_COPY)
    expect(friendlyReleaseError('SEASON_RELEASE_NOT_FOUND')).toBe('Subscription not found')
    expect(friendlyReleaseError('SEASON_RELEASE_BAD_INPUT: a held Scheduled plan needs a start date')).toBe(RELEASE_ERROR_FALLBACK)
    expect(friendlyReleaseError('connection reset')).toBe(RELEASE_ERROR_FALLBACK)
    expect(friendlyReleaseError(null)).toBe(RELEASE_ERROR_FALLBACK)
  })

  it('recognises the break refusal, and nothing else', () => {
    expect(isSeasonBreakError('SEASON_BREAK: plan x cannot restart during the semester break')).toBe(true)
    expect(isSeasonBreakError('SEASON_BAD_PHASE: cannot reopen from open')).toBe(false)
    expect(isSeasonBreakError(undefined)).toBe(false)
  })

  it('has no dashes', () => {
    for (const copy of [BREAK_RESUME_COPY, BREAK_START_DATE_COPY, ADMIN_BREAK_RESUME_COPY, RELEASE_CHANGED_COPY, RELEASE_ERROR_FALLBACK]) {
      expect(copy).not.toMatch(/[–—]/)
    }
  })
})
```

`src/contexts/season/usecases/release-hold.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ rpc: rpcMock }) }))

import { releaseSeasonHold } from './release-hold'
import { BREAK_RESUME_COPY, RELEASE_CHANGED_COPY } from '../domain/season-break-errors'

beforeEach(() => rpcMock.mockReset())

describe('releaseSeasonHold', () => {
  it('releases through season_release_hold with the owned ids', async () => {
    rpcMock.mockResolvedValue({ data: { subscription_id: 'sub-1', status: 'Active', followers: 1 }, error: null })
    expect(await releaseSeasonHold({ customerId: 'user-1', subscriptionId: 'sub-1', startDate: null, resumeCutoff: true }))
      .toEqual({ ok: true, status: 'Active', followers: 1 })
    expect(rpcMock).toHaveBeenCalledWith('season_release_hold', {
      p_customer_id: 'user-1', p_subscription_id: 'sub-1', p_start_date: null, p_resume_cutoff: true,
    })
  })

  it('reports a Scheduled release', async () => {
    rpcMock.mockResolvedValue({ data: { subscription_id: 'sub-2', status: 'Scheduled', followers: 0 }, error: null })
    expect(await releaseSeasonHold({ customerId: 'user-1', subscriptionId: 'sub-2', startDate: '2026-10-12', resumeCutoff: false }))
      .toEqual({ ok: true, status: 'Scheduled', followers: 0 })
  })

  it('marks a break refusal so the dashboard can open the break sheet', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'SEASON_BREAK: plan sub-1 cannot restart during the semester break' } })
    expect(await releaseSeasonHold({ customerId: 'user-1', subscriptionId: 'sub-1', startDate: null, resumeCutoff: false }))
      .toEqual({ ok: false, error: BREAK_RESUME_COPY, seasonBreak: true })
  })

  it('never shows raw SQL for other refusals', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'SEASON_RELEASE_NOT_READY: hold is held' } })
    expect(await releaseSeasonHold({ customerId: 'user-1', subscriptionId: 'sub-1', startDate: null, resumeCutoff: false }))
      .toEqual({ ok: false, error: RELEASE_CHANGED_COPY, seasonBreak: false })
  })
})
```

`src/contexts/season/domain/season-reopen.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { reopenSummaryFrom } from './season-reopen'

describe('reopenSummaryFrom', () => {
  it('reads the holds that became ready', () => {
    expect(reopenSummaryFrom({ phase: 'open', ready_holds: 3, ready_customer_pauses: 1 })).toEqual({ readyHolds: 3, readyCustomerPauses: 1 })
  })

  it('reads anything else as zero', () => {
    expect(reopenSummaryFrom(null)).toEqual({ readyHolds: 0, readyCustomerPauses: 0 })
    expect(reopenSummaryFrom({ ready_holds: '2', ready_customer_pauses: -1 })).toEqual({ readyHolds: 0, readyCustomerPauses: 0 })
  })
})
```

In `src/contexts/season/usecases/season-transitions.test.ts`:
- Add `reopenNoticeMock: vi.fn(),` inside the `vi.hoisted(() => ({ ... }))` object and `reopenNoticeMock` to its destructuring.
- Add `vi.mock('./season-reopen-notices', () => ({ announceSeasonReopened: reopenNoticeMock }))` below the other `vi.mock` lines.
- Add `reopenNoticeMock.mockReset()` in `beforeEach`.
- Add `reopenSeason` to the import from `./season-transitions`.
- Append inside `describe('season transitions', ...)`:

```ts
  it('reopens through SQL, audits, and hands the ready holds to the reopening hook', async () => {
    rpcMock.mockResolvedValue({ data: { phase: 'open', ready_holds: 3, ready_customer_pauses: 1 }, error: null })
    expect(await reopenSeason(ADMIN)).toEqual({ ok: true })
    expect(rpcMock).toHaveBeenCalledWith('season_reopen', { p_actor: ADMIN })
    expect(invalidateMock).toHaveBeenCalledTimes(1)
    expect(auditMock).toHaveBeenCalledWith(ADMIN, 'season_reopened', 'intake_settings', 'singleton', {
      state: { phase: 'open', ready_holds: 3, ready_customer_pauses: 1 },
    })
    expect(reopenNoticeMock).toHaveBeenCalledWith({ readyHolds: 3, readyCustomerPauses: 1 })
  })

  it('a refused reopen audits nothing and announces nothing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'SEASON_BAD_PHASE: cannot reopen from open' } })
    expect(await reopenSeason(ADMIN)).toEqual({ error: 'The season changed while you were looking. Refresh the page and try again.' })
    expect(auditMock).not.toHaveBeenCalled()
    expect(reopenNoticeMock).not.toHaveBeenCalled()
  })

  it('ending the season today hands its reconciled skips to the credit notice hook', async () => {
    rpcMock.mockResolvedValue({
      data: { phase: 'winding_down', reconciled: [{ subscription_id: 's1', customer_id: 'c1', meal_dates: ['2026-09-16'], credit_fils: 1980, skipped_no_value: 0 }] },
      error: null,
    })
    expect(await endSeasonToday(ADMIN)).toEqual({ ok: true })
    expect(announceMock).toHaveBeenCalledWith([
      { subscriptionId: 's1', customerId: 'c1', mealDates: ['2026-09-16'], creditFils: 1980, source: 'reconciled' },
    ])
    expect(reopenNoticeMock).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/season/domain/season-break-errors.test.ts src/contexts/season/usecases/release-hold.test.ts src/contexts/season/domain/season-reopen.test.ts src/contexts/season/usecases/season-transitions.test.ts`
Expected: FAIL. The three new modules and `./season-reopen-notices` cannot be resolved; `reopenSeason` is not exported.

- [ ] **Step 3: Write the implementation**

`src/contexts/season/domain/season-break-errors.ts`:

```ts
/**
 * What customers and admins read when the break refuses a restart, and when
 * releasing a held plan does not go through (spec §7.5, §7.6, §11.5). SQL
 * raises messages that start with a code; nobody sees the raw text.
 */

export const BREAK_RESUME_COPY = "The kitchen is closed between semesters. Your plan can resume once we're back."
export const BREAK_START_DATE_COPY = "The kitchen is closed between semesters, so your start date can't change yet. You can pick it once we're back."
export const ADMIN_BREAK_RESUME_COPY = 'Cannot resume: the kitchen is closed for the semester break. This plan can resume after you reopen on the Season page.'
export const RELEASE_CHANGED_COPY = 'Your plan changed. Refresh and try again.'
export const RELEASE_ERROR_FALLBACK = "Your plan didn't restart. Refresh and try again, or message us on WhatsApp."

const RELEASE_ERROR_COPY: ReadonlyArray<readonly [string, string]> = [
  ['SEASON_BREAK', BREAK_RESUME_COPY],
  ['SEASON_RELEASE_NOT_READY', RELEASE_CHANGED_COPY],
  ['SEASON_RELEASE_NOT_HELD', RELEASE_CHANGED_COPY],
  ['SEASON_RELEASE_BAD_STATUS', RELEASE_CHANGED_COPY],
  ['SEASON_RELEASE_NOT_FOUND', 'Subscription not found'],
  ['SEASON_RELEASE_BAD_INPUT', RELEASE_ERROR_FALLBACK],
]

export function friendlyReleaseError(message: string | null | undefined): string {
  if (!message) return RELEASE_ERROR_FALLBACK
  for (const [code, copy] of RELEASE_ERROR_COPY) {
    if (message.includes(code)) return copy
  }
  return RELEASE_ERROR_FALLBACK
}

/** The G2 trigger or season_release_hold refused because the break is on. */
export function isSeasonBreakError(message: string | null | undefined): boolean {
  return !!message && message.startsWith('SEASON_BREAK')
}
```

`src/contexts/season/usecases/release-hold.ts`:

```ts
import 'server-only'

/**
 * Release a plan held for next semester (spec §6.3 ready → released, X1).
 * season_release_hold owns the write: it refuses during the break, checks the
 * customer owns the plan and the hold is ready, restarts a Paused plan (and a
 * queued renewal held behind it) or moves a Scheduled plan to its new start
 * date, and marks the hold released, all in one transaction. The customer id
 * comes from withOwnedSubscription or the admin's loaded row, never the client.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { friendlyReleaseError, isSeasonBreakError } from '../domain/season-break-errors'

export type ReleaseHoldResult =
  | { ok: true; status: 'Active' | 'Scheduled'; followers: number }
  | { ok: false; error: string; seasonBreak: boolean }

export async function releaseSeasonHold(input: {
  customerId: string
  subscriptionId: string
  startDate: string | null
  resumeCutoff: boolean
}): Promise<ReleaseHoldResult> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb.rpc('season_release_hold', {
    p_customer_id: input.customerId,
    p_subscription_id: input.subscriptionId,
    p_start_date: input.startDate,
    p_resume_cutoff: input.resumeCutoff,
  })
  if (error) return { ok: false, error: friendlyReleaseError(error.message), seasonBreak: isSeasonBreakError(error.message) }
  const row = (data ?? {}) as { status?: string; followers?: number }
  return { ok: true, status: row.status === 'Scheduled' ? 'Scheduled' : 'Active', followers: Number(row.followers ?? 0) }
}
```

`src/contexts/season/domain/season-reopen.ts`:

```ts
/** What reopening changed, read from season_reopen's result (spec §5). */

export interface SeasonReopenSummary {
  readyHolds: number
  readyCustomerPauses: number
}

export function reopenSummaryFrom(state: unknown): SeasonReopenSummary {
  const row = (state ?? {}) as { ready_holds?: unknown; ready_customer_pauses?: unknown }
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)
  return { readyHolds: count(row.ready_holds), readyCustomerPauses: count(row.ready_customer_pauses) }
}
```

`src/contexts/season/usecases/season-reopen-notices.ts`:

```ts
import 'server-only'

/**
 * The one place reopening is announced (spec §5 "offer the reopening notice",
 * §11.7 "Reopened", N15 to N17).
 *
 * Plan F wires it: the owner's "Reopened" WhatsApp with the holds now ready,
 * the reminder if the reopening notice is not sent within 2 hours, and the
 * customer notices on WhatsApp and email. Until then customers see their
 * ready plan in the app (HeldPlanCard) and the owner sends the reopening
 * broadcast by hand.
 */

import type { SeasonReopenSummary } from '../domain/season-reopen'

export async function announceSeasonReopened(summary: SeasonReopenSummary): Promise<void> {
  console.info('season_reopened (reopening notices arrive with plan F)', summary)
}
```

`src/contexts/season/usecases/season-transitions.ts`:

(a) Add under the existing imports:

```ts
import { reopenSummaryFrom } from '../domain/season-reopen'
import { announceSeasonReopened } from './season-reopen-notices'
```

(b) In `type SeasonFunction`, replace `  | 'season_end_today'` with:

```ts
  | 'season_end_today'
  | 'season_reopen'
```

(c) Replace the signature

```ts
async function runSeasonTransition(
  adminEmail: string,
  fn: SeasonFunction,
  args: Record<string, unknown>,
  auditAction: string,
): Promise<SeasonTransitionResult> {
```

with

```ts
async function runSeasonTransition(
  adminEmail: string,
  fn: SeasonFunction,
  args: Record<string, unknown>,
  auditAction: string,
  onDone?: (state: unknown) => Promise<void>,
): Promise<SeasonTransitionResult> {
```

(d) Replace

```ts
  if (receipts.length > 0) await announceSeasonSkipCredited(receipts)
  return { ok: true }
```

with

```ts
  if (receipts.length > 0) await announceSeasonSkipCredited(receipts)
  if (onDone) await onDone(data)
  return { ok: true }
```

(e) Append:

```ts
/** break → open (spec §5): holds become ready; reopening notices are Plan F. */
export async function reopenSeason(adminEmail: string): Promise<SeasonTransitionResult> {
  return runSeasonTransition(adminEmail, 'season_reopen', {}, 'season_reopened', (state) =>
    announceSeasonReopened(reopenSummaryFrom(state)))
}
```

`src/app/admin/season/actions.ts`:
- In the import from `@/contexts/season/usecases/season-transitions`, replace `    endSeasonToday,` with `    endSeasonToday,\n    reopenSeason,`.
- Add directly after `endSeasonTodayAction`:

```ts
export async function reopenSeasonAction(): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await reopenSeason(user.email)
    revalidatePath('/admin/season')
    return result
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/contexts/season src/infra/config/intake-cache.test.ts`
Expected: PASS, including `intake-cache.test.ts`'s "every season transition drops it" (still one `.rpc(` and one `invalidateIntakeCache()` in `season-transitions.ts`).
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/season/domain/season-break-errors.ts src/contexts/season/domain/season-break-errors.test.ts src/contexts/season/usecases/release-hold.ts src/contexts/season/usecases/release-hold.test.ts src/contexts/season/domain/season-reopen.ts src/contexts/season/domain/season-reopen.test.ts src/contexts/season/usecases/season-reopen-notices.ts src/contexts/season/usecases/season-transitions.ts src/contexts/season/usecases/season-transitions.test.ts src/app/admin/season/actions.ts
git commit -m "feat(season): reopen and release a held plan from the app, with plain words for every refusal

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8: Kitchen and rider counts read the season (G5)

**Files:**
- Create: `src/contexts/ops/usecases/season-kitchen-gate.ts`
- Test: `src/contexts/ops/usecases/season-kitchen-gate.test.ts`
- Modify (replace whole file): `src/contexts/ops/usecases/get-kitchen-counts.ts`
- Modify (replace whole file): `src/contexts/ops/usecases/get-kitchen-counts.test.ts`
- Modify (replace whole file): `src/contexts/ops/usecases/get-dorm-counts.ts`
- Test: `src/contexts/ops/usecases/get-dorm-counts.test.ts` (create)
- Modify: `src/app/kitchen/[token]/page.tsx`
- Modify: `src/app/ops/[token]/page.tsx`

**Interfaces:**
- Consumes: Task 1 `seasonKitchenGate`, `kitchenCountsPlan`, `KitchenPlanFacts`, `SeasonKitchenGate`; `addDaysIso`; `captureError(err, context)`.
- Produces:
  - `KITCHEN_CLOSED_FOR_BREAK = 'Kitchen closed for the semester break'`
  - `type SeasonKitchenRead = { ok: true; gate: SeasonKitchenGate; wrapUpDay: string | null; closeDay: string | null; closureDates: ReadonlySet<string> } | { ok: false }`
  - `loadSeasonKitchenGate(todayIso: string): Promise<SeasonKitchenRead>`
  - `KITCHEN_SUB_COLUMNS: string` (the `subscriptions` columns both counts select)
  - `interface KitchenSubRow { status: string | null; season_hold_id?: string | null; week_type: string | null; meals_per_day?: number | null; total_meals: number; delivered_meals?: number | null; credited_skip_days?: number | null; skipped_dates: string[] | null; season_buffer_grants?: number | null; resume_cutoff_date?: string | null; last_delivery_tick_date?: string | null }`
  - `kitchenFactsFor(row: KitchenSubRow): KitchenPlanFacts`
  - `interface KitchenCounts { vegCount: number; nonVegCount: number; unavailable: boolean; closedForBreak: boolean }`; `getKitchenCounts(todayIso, dayName, isSaturday): Promise<KitchenCounts>`
  - `getDormCounts` keeps its signature and `DormCountsRecord`; it returns `{}` while the kitchen is closed for the break.

Rules (Scope decisions, "Cooks today"): both counts include a plan only when the delivery tick would cook it today (`kitchenCountsPlan`): Active, not held, a delivery day, not a closure, not skipped, below the credited cap (tonight's recorded delivery added back), no resume cutoff for today, and after the wrap-up day only with a buffer grant for today. During the break and after the close day both return nothing. The kitchen count fails loud (`unavailable: true`) when the season cannot be read; the rider count falls back to the normal gate, which is safe because no Active plan with meals left exists during the break.

Behaviour that changes on an ordinary day, on purpose: a Paused or Skipped plan whose `paused_dates` or `skipped_dates` do not yet name today, a plan that resumed after the 2 PM cutoff, a plan whose every meal is delivered or credited but still reads Active, and a closure day are no longer counted. The delivery tick never cooked any of them.

- [ ] **Step 1: Write the failing tests**

`src/contexts/ops/usecases/season-kitchen-gate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, captureErrorMock } = vi.hoisted(() => ({ fromMock: vi.fn(), captureErrorMock: vi.fn() }))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ from: fromMock }) }))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: captureErrorMock }))

import { loadSeasonKitchenGate, kitchenFactsFor } from './season-kitchen-gate'

type Res = { data: unknown; error: unknown }
const gteArgs: string[] = []

function setup(settings: Res, closures: Res = { data: [], error: null }) {
  fromMock.mockImplementation((table: string) => table === 'intake_settings'
    ? { select: () => ({ maybeSingle: () => Promise.resolve(settings) }) }
    : { select: () => ({ gte: (_c: string, from: string) => { gteArgs.push(from); return { lte: () => Promise.resolve(closures) } } }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  gteArgs.length = 0
})

describe('loadSeasonKitchenGate', () => {
  it('cooks normally while open, with today\'s closures', async () => {
    setup({ data: { season_phase: 'open', wrap_up_day: null, close_day: null }, error: null }, { data: [{ closure_date: '2026-09-28' }], error: null })
    const r = await loadSeasonKitchenGate('2026-09-28')
    expect(r).toEqual({ ok: true, gate: 'normal', wrapUpDay: null, closeDay: null, closureDates: new Set(['2026-09-28']) })
    expect(gteArgs).toEqual(['2026-09-28'])
  })

  it('is closed during the break without reading closures', async () => {
    setup({ data: { season_phase: 'break', wrap_up_day: '2026-10-03', close_day: '2026-10-05' }, error: null })
    expect(await loadSeasonKitchenGate('2026-10-07')).toEqual({ ok: true, gate: 'closed_for_break', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', closureDates: new Set() })
    expect(gteArgs).toEqual([])
  })

  it('reads closures from the day after the wrap-up day on a buffer day', async () => {
    setup({ data: { season_phase: 'winding_down', wrap_up_day: '2026-10-03', close_day: '2026-10-06' }, error: null }, { data: [{ closure_date: '2026-10-05' }], error: null })
    const r = await loadSeasonKitchenGate('2026-10-06')
    expect(r).toMatchObject({ ok: true, gate: 'buffer_only' })
    expect(gteArgs).toEqual(['2026-10-04'])
  })

  it('fails loud when the season or the closures cannot be read', async () => {
    setup({ data: null, error: { message: 'pg down' } })
    expect(await loadSeasonKitchenGate('2026-09-28')).toEqual({ ok: false })
    setup({ data: { season_phase: 'open' }, error: null }, { data: null, error: { message: 'pg down' } })
    expect(await loadSeasonKitchenGate('2026-09-28')).toEqual({ ok: false })
    expect(captureErrorMock).toHaveBeenCalledTimes(2)
  })
})

describe('kitchenFactsFor', () => {
  it('maps a subscriptions row with the delivery tick defaults', () => {
    expect(kitchenFactsFor({ status: 'Active', week_type: null, total_meals: 24, skipped_dates: null })).toEqual({
      status: 'Active', seasonHoldId: null, weekType: '6DAYS', mealsPerDay: 1, totalMeals: 24, deliveredMeals: 0,
      creditedSkipDays: 0, skippedDates: [], bufferGrants: 0, resumeCutoffDate: null, lastDeliveryTickDate: null,
    })
  })
})
```

`src/contexts/ops/usecases/get-kitchen-counts.test.ts` (replace the whole file):

```ts
/**
 * Tests for getKitchenCounts. FAIL LOUD: a read error surfaces
 * `unavailable: true`, never a believable 0/0. The count follows the delivery
 * tick's own conditions and the season gate (spec G5). The Supabase client and
 * the season gate read are mocked; the veg-day resolver and the season rules
 * are real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, captureErrorMock, gateMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  captureErrorMock: vi.fn(),
  gateMock: vi.fn(),
}))

vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({ from: fromMock }),
}))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: captureErrorMock }))
vi.mock('./season-kitchen-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./season-kitchen-gate')>()
  return { ...actual, loadSeasonKitchenGate: gateMock }
})

import { getKitchenCounts } from './get-kitchen-counts'

type Res = { data: unknown; error: unknown }

const NORMAL = { ok: true, gate: 'normal', wrapUpDay: null, closeDay: null, closureDates: new Set<string>() }

function setup(subsRes: Res, customersRes: Res) {
  // Both queries are .select(...).in(...): subscriptions by status, customers by id.
  fromMock.mockImplementation(() => ({
    select: () => ({ in: (col: string) => Promise.resolve(col === 'status' ? subsRes : customersRes) }),
  }))
}

const sub = (over: Record<string, unknown> = {}) => ({
  id: 's1', customer_id: 'c1', status: 'Active', week_type: '6DAYS', skipped_dates: [], paused_dates: [],
  total_meals: 24, delivered_meals: 10, meals_per_day: 1, credited_skip_days: 0, season_buffer_grants: 0,
  season_hold_id: null, resume_cutoff_date: null, last_delivery_tick_date: null, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  gateMock.mockResolvedValue(NORMAL)
})

describe('getKitchenCounts, fail loud', () => {
  it('returns unavailable when the subscriptions read errors', async () => {
    setup({ data: null, error: { message: 'pg down' } }, { data: [], error: null })
    const r = await getKitchenCounts('2026-06-22', 'Monday', false)
    expect(r).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: true, closedForBreak: false })
    expect(captureErrorMock).toHaveBeenCalledOnce()
  })

  it('returns unavailable when the customers read errors', async () => {
    setup({ data: [sub()], error: null }, { data: null, error: { message: 'pg down' } })
    const r = await getKitchenCounts('2026-06-22', 'Monday', false)
    expect(r.unavailable).toBe(true)
  })

  it('returns unavailable when the season cannot be read, without reading plans', async () => {
    gateMock.mockResolvedValue({ ok: false })
    expect(await getKitchenCounts('2026-06-22', 'Monday', false)).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: true, closedForBreak: false })
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('getKitchenCounts, counting', () => {
  it('counts veg vs non-veg by preference', async () => {
    setup(
      { data: [sub(), sub({ id: 's2', customer_id: 'c2' })], error: null },
      { data: [{ id: 'c1', meal_preference_type: 'veg', veg_days: null }, { id: 'c2', meal_preference_type: 'nonveg', veg_days: null }], error: null },
    )
    expect(await getKitchenCounts('2026-06-22', 'Monday', false)).toEqual({ vegCount: 1, nonVegCount: 1, unavailable: false, closedForBreak: false })
  })

  it('skips 5DAYS subscriptions on Saturday', async () => {
    setup({ data: [sub({ week_type: '5DAYS' })], error: null }, { data: [{ id: 'c1', meal_preference_type: 'veg', veg_days: null }], error: null })
    expect(await getKitchenCounts('2026-06-27', 'Saturday', true)).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: false, closedForBreak: false })
  })

  it('skips a subscription whose skipped_dates includes today', async () => {
    setup({ data: [sub({ skipped_dates: ['2026-06-22'] })], error: null }, { data: [{ id: 'c1', meal_preference_type: 'nonveg', veg_days: null }], error: null })
    expect(await getKitchenCounts('2026-06-22', 'Monday', false)).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: false, closedForBreak: false })
  })

  it("cooks a religious plan's own veg days, not the next plan's saved picks", async () => {
    const religious = (dayName: string, iso: string) => {
      setup(
        { data: [sub({ veg_days: ['Monday'] })], error: null },
        { data: [{ id: 'c1', meal_preference_type: 'Religious Preference', veg_days: ['Thursday'] }], error: null },
      )
      return getKitchenCounts(iso, dayName, false)
    }
    expect(await religious('Monday', '2026-06-22')).toEqual({ vegCount: 1, nonVegCount: 0, unavailable: false, closedForBreak: false })
    expect(await religious('Thursday', '2026-06-25')).toEqual({ vegCount: 0, nonVegCount: 1, unavailable: false, closedForBreak: false })
  })
})

describe('getKitchenCounts, the season (spec G5)', () => {
  const nonVeg = { data: [{ id: 'c1', meal_preference_type: 'nonveg', veg_days: null }], error: null }

  it('reads zero, closed for the break, without reading plans', async () => {
    gateMock.mockResolvedValue({ ok: true, gate: 'closed_for_break', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', closureDates: new Set() })
    expect(await getKitchenCounts('2026-10-07', 'Wednesday', false)).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: false, closedForBreak: true })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('never counts by status alone: a held plan, a plan at its credited cap, a resume after the cutoff', async () => {
    setup({
      data: [
        sub({ id: 'held', season_hold_id: 'h1' }),
        sub({ id: 'done', delivered_meals: 22, credited_skip_days: 2 }),
        sub({ id: 'late', resume_cutoff_date: '2026-06-22' }),
      ],
      error: null,
    }, nonVeg)
    expect(await getKitchenCounts('2026-06-22', 'Monday', false)).toEqual({ vegCount: 0, nonVegCount: 0, unavailable: false, closedForBreak: false })
  })

  it('still counts a plan whose last meal was recorded tonight', async () => {
    setup({ data: [sub({ delivered_meals: 24, last_delivery_tick_date: '2026-06-22' })], error: null }, nonVeg)
    expect((await getKitchenCounts('2026-06-22', 'Monday', false)).nonVegCount).toBe(1)
  })

  it('on a buffer day counts only a plan with a grant for today', async () => {
    gateMock.mockResolvedValue({ ok: true, gate: 'buffer_only', wrapUpDay: '2026-10-03', closeDay: '2026-10-06', closureDates: new Set() })
    setup({ data: [sub({ id: 'grant', season_buffer_grants: 1 }), sub({ id: 'none' })], error: null }, nonVeg)
    expect(await getKitchenCounts('2026-10-05', 'Monday', false)).toEqual({ vegCount: 0, nonVegCount: 1, unavailable: false, closedForBreak: false })
  })
})
```

`src/contexts/ops/usecases/get-dorm-counts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, gateMock } = vi.hoisted(() => ({ fromMock: vi.fn(), gateMock: vi.fn() }))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ from: fromMock }) }))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: vi.fn() }))
vi.mock('./season-kitchen-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./season-kitchen-gate')>()
  return { ...actual, loadSeasonKitchenGate: gateMock }
})

import { getDormCounts } from './get-dorm-counts'

const sub = (over: Record<string, unknown> = {}) => ({
  id: 's1', customer_id: 'c1', status: 'Active', week_type: '6DAYS', skipped_dates: [], paused_dates: [],
  total_meals: 24, delivered_meals: 10, meals_per_day: 1, credited_skip_days: 0, season_buffer_grants: 0,
  season_hold_id: null, resume_cutoff_date: null, last_delivery_tick_date: null, ...over,
})

function setup(subs: unknown[]) {
  fromMock.mockImplementation(() => ({
    select: () => ({
      in: (col: string) => Promise.resolve(col === 'status'
        ? { data: subs, error: null }
        : { data: [{ id: 'c1', dorm_name: 'Academic City' }, { id: 'c2', dorm_name: 'YUGO' }], error: null }),
    }),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  gateMock.mockResolvedValue({ ok: true, gate: 'normal', wrapUpDay: null, closeDay: null, closureDates: new Set() })
})

describe('getDormCounts (spec G5)', () => {
  it('counts one box per plan the delivery tick cooks, by dorm', async () => {
    setup([sub(), sub({ id: 's2', customer_id: 'c2' }), sub({ id: 's3', customer_id: 'c2', season_hold_id: 'h1' })])
    expect(await getDormCounts('2026-09-28', 'Monday', false)).toEqual({ 'Academic City': 1, YUGO: 1 })
  })

  it('returns nothing while the kitchen is closed for the break', async () => {
    gateMock.mockResolvedValue({ ok: true, gate: 'closed_for_break', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', closureDates: new Set() })
    setup([sub()])
    expect(await getDormCounts('2026-10-07', 'Wednesday', false)).toEqual({})
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('keeps the rider working when the season cannot be read', async () => {
    gateMock.mockResolvedValue({ ok: false })
    setup([sub()])
    expect(await getDormCounts('2026-09-28', 'Monday', false)).toEqual({ 'Academic City': 1 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/ops/usecases`
Expected: FAIL. `./season-kitchen-gate` cannot be resolved; `closedForBreak` is missing from every result; held and capped plans are still counted.

- [ ] **Step 3: Write the implementation**

`src/contexts/ops/usecases/season-kitchen-gate.ts`:

```ts
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { captureError } from '@/infra/logging/capture-error'
import { addDaysIso } from '@/contexts/season/domain/season-dates'
import type { SeasonPhase } from '@/contexts/season/domain/season-phase'
import { seasonKitchenGate, type KitchenPlanFacts, type SeasonKitchenGate } from '@/contexts/season/domain/season-kitchen'

/**
 * The season, as the kitchen and the rider see it today (spec G5).
 *
 * Read on every render, never from the 30-second intake cache: after the close
 * day a stale "open" would put held plans back on the prep screen.
 */

export const KITCHEN_CLOSED_FOR_BREAK = 'Kitchen closed for the semester break'

export type SeasonKitchenRead =
  | { ok: true; gate: SeasonKitchenGate; wrapUpDay: string | null; closeDay: string | null; closureDates: ReadonlySet<string> }
  | { ok: false }

/** The subscriptions columns the delivery tick's conditions need. */
export const KITCHEN_SUB_COLUMNS =
  'status, week_type, skipped_dates, total_meals, delivered_meals, meals_per_day, credited_skip_days, season_buffer_grants, season_hold_id, resume_cutoff_date, last_delivery_tick_date'

export interface KitchenSubRow {
  status: string | null
  season_hold_id?: string | null
  week_type: string | null
  meals_per_day?: number | null
  total_meals: number
  delivered_meals?: number | null
  credited_skip_days?: number | null
  skipped_dates: string[] | null
  season_buffer_grants?: number | null
  resume_cutoff_date?: string | null
  last_delivery_tick_date?: string | null
}

/** Row to facts, with the delivery tick's COALESCE defaults. */
export function kitchenFactsFor(row: KitchenSubRow): KitchenPlanFacts {
  return {
    status: row.status,
    seasonHoldId: row.season_hold_id ?? null,
    weekType: row.week_type === '5DAYS' ? '5DAYS' : '6DAYS',
    mealsPerDay: row.meals_per_day ?? 1,
    totalMeals: row.total_meals,
    deliveredMeals: row.delivered_meals ?? 0,
    creditedSkipDays: row.credited_skip_days ?? 0,
    skippedDates: row.skipped_dates ?? [],
    bufferGrants: row.season_buffer_grants ?? 0,
    resumeCutoffDate: row.resume_cutoff_date ? String(row.resume_cutoff_date).slice(0, 10) : null,
    lastDeliveryTickDate: row.last_delivery_tick_date ? String(row.last_delivery_tick_date).slice(0, 10) : null,
  }
}

export async function loadSeasonKitchenGate(todayIso: string): Promise<SeasonKitchenRead> {
  const sb = createAdminSupabaseClient()
  const settings = await sb.from('intake_settings').select('season_phase, wrap_up_day, close_day').maybeSingle()
  if (settings.error) {
    captureError(settings.error, { area: 'kitchen', op: 'loadSeasonKitchenGate', todayIso })
    return { ok: false }
  }
  const row = (settings.data ?? {}) as { season_phase?: string | null; wrap_up_day?: string | null; close_day?: string | null }
  const phase: SeasonPhase = row.season_phase === 'winding_down' || row.season_phase === 'break' ? row.season_phase : 'open'
  const wrapUpDay = row.wrap_up_day ?? null
  const closeDay = row.close_day ?? null
  const gate = seasonKitchenGate({ phase, wrapUpDay, closeDay, todayAe: todayIso })
  if (gate === 'closed_for_break') return { ok: true, gate, wrapUpDay, closeDay, closureDates: new Set() }

  // Today's closure, and on a buffer day every closure since the wrap-up day
  // (a closed buffer day does not use a grant).
  const from = gate === 'buffer_only' && wrapUpDay ? addDaysIso(wrapUpDay, 1) : todayIso
  const closures = await sb.from('company_closures').select('closure_date').gte('closure_date', from).lte('closure_date', todayIso)
  if (closures.error) {
    captureError(closures.error, { area: 'kitchen', op: 'loadSeasonKitchenGate', todayIso })
    return { ok: false }
  }
  const closureDates = new Set(((closures.data ?? []) as Array<{ closure_date: string }>).map((r) => String(r.closure_date).slice(0, 10)))
  return { ok: true, gate, wrapUpDay, closeDay, closureDates }
}
```

`src/contexts/ops/usecases/get-kitchen-counts.ts` (replace the whole file):

```ts
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { isVegOnDayName } from '@/contexts/subscriptions/domain/veg-day'
import { captureError } from '@/infra/logging/capture-error'
import { kitchenCountsPlan } from '@/contexts/season/domain/season-kitchen'
import { KITCHEN_SUB_COLUMNS, kitchenFactsFor, loadSeasonKitchenGate, type KitchenSubRow } from './season-kitchen-gate'

/**
 * Counts veg and non-veg meals for today's kitchen prep.
 *
 * A plan counts only when the delivery tick will cook it tonight (spec G5):
 * Active, not held for next semester, a delivery day, not a closure, not
 * skipped, below the credited cap, no resume after the cutoff, and after the
 * wrap-up day only with a buffer grant for today. Never by status alone.
 * During the break, and after the close day, the kitchen reads zero with
 * `closedForBreak: true`. The caller (RSC) owns all UAE time computation.
 *
 * @param todayIso  - "YYYY-MM-DD" in UAE wall time
 * @param dayName   - "Monday"…"Saturday" in UAE wall time (used for isVegOnDayName)
 * @param isSaturday - true when UAE wall-clock day is Saturday (5DAYS plans skip Saturday)
 */
export interface KitchenCounts {
  vegCount: number
  nonVegCount: number
  unavailable: boolean
  closedForBreak: boolean
}

type SubRow = KitchenSubRow & {
  id: string
  customer_id: string
  paused_dates: string[] | null
  veg_days: string[] | null
  meal_preference_type: string | null
}

export async function getKitchenCounts(
  todayIso: string,
  dayName: string,
  isSaturday: boolean,
): Promise<KitchenCounts> {
  const none = { vegCount: 0, nonVegCount: 0 }

  // Release It! L5 (Phase 3): fail LOUD, not silent. A season read error must
  // surface as unavailable, never as a believable count.
  const season = await loadSeasonKitchenGate(todayIso)
  if (!season.ok) return { ...none, unavailable: true, closedForBreak: false }
  if (season.gate === 'closed_for_break') return { ...none, unavailable: false, closedForBreak: true }

  const sb = createAdminSupabaseClient()
  const subsRes = await sb
    .from('subscriptions')
    .select(`id, customer_id, paused_dates, veg_days, meal_preference_type, ${KITCHEN_SUB_COLUMNS}`)
    .in('status', ['Active'])
  if (subsRes.error) {
    captureError(subsRes.error, { area: 'kitchen', op: 'getKitchenCounts', todayIso })
    return { ...none, unavailable: true, closedForBreak: false }
  }

  const subs = (subsRes.data ?? []) as SubRow[]

  // Capacity (Phase 7 / L6): fetch only the customers who actually have an
  // active subscription, not the entire (ever-growing) customers table.
  const customerIds = [...new Set(subs.map((s) => s.customer_id))]
  const customersRes = customerIds.length
    ? await sb.from('customers').select('id, meal_preference_type, veg_days').in('id', customerIds)
    : { data: [] as Array<{ id: string; meal_preference_type: string | null; veg_days: string[] | null }>, error: null }
  if (customersRes.error) {
    captureError(customersRes.error, { area: 'kitchen', op: 'getKitchenCounts', todayIso })
    return { ...none, unavailable: true, closedForBreak: false }
  }

  const customerMap = new Map<string, { meal_preference_type: string | null; veg_days: string[] | null }>()
  for (const c of (customersRes.data ?? []) as Array<{ id: string; meal_preference_type: string | null; veg_days: string[] | null }>) {
    customerMap.set(c.id, c)
  }

  let vegCount = 0
  let nonVegCount = 0

  for (const sub of subs) {
    // 5DAYS plans do not deliver on Saturday
    if (sub.week_type === '5DAYS' && isSaturday) continue
    // Skip if today is in skipped_dates or paused_dates
    if ((sub.skipped_dates ?? []).includes(todayIso)) continue
    if ((sub.paused_dates ?? []).includes(todayIso)) continue
    // The delivery tick's own conditions and the season (spec G5).
    if (!kitchenCountsPlan({
      gate: season.gate,
      day: todayIso,
      wrapUpDay: season.wrapUpDay,
      closeDay: season.closeDay,
      closureDates: season.closureDates,
      plan: kitchenFactsFor(sub),
    })) continue

    const cust = customerMap.get(sub.customer_id)
    if (!cust) continue

    if (isVegOnDayName({ customer: cust, subscription: sub }, dayName)) {
      vegCount++
    } else {
      nonVegCount++
    }
  }

  return { vegCount, nonVegCount, unavailable: false, closedForBreak: false }
}
```

`src/contexts/ops/usecases/get-dorm-counts.ts` (replace the whole file):

```ts
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { kitchenCountsPlan } from '@/contexts/season/domain/season-kitchen'
import { KITCHEN_SUB_COLUMNS, kitchenFactsFor, loadSeasonKitchenGate, type KitchenSubRow } from './season-kitchen-gate'

/**
 * Per-dorm meal count for today's rider pickup.
 *
 * Same rule as getKitchenCounts (spec G5): a plan counts only when the
 * delivery tick will cook it tonight, and nothing counts during the break or
 * after the close day. Grouped by customers.dorm_name: the rider carries every
 * box (veg and non-veg) to the same dorm, one box per plan.
 *
 * When the season cannot be read the rider keeps working on the normal rule:
 * during the break no Active plan with meals left exists, so nothing extra is
 * counted.
 *
 * Returns a plain Record (not a Map) so it can be passed across the
 * RSC/client boundary without serialization issues.
 */
export type DormCountsRecord = Record<string, number>

type SubRow = KitchenSubRow & { id: string; customer_id: string; paused_dates: string[] | null }

export async function getDormCounts(
  todayIso: string,
  dayName: string,
  isSaturday: boolean,
): Promise<DormCountsRecord> {
  // dayName is accepted for API symmetry with getKitchenCounts (caller passes it)
  // but the rider count is veg-blind, so no isVegOnDayName call is needed.
  void dayName

  const read = await loadSeasonKitchenGate(todayIso)
  const season = read.ok ? read : { gate: 'normal' as const, wrapUpDay: null, closeDay: null, closureDates: new Set<string>() }
  if (season.gate === 'closed_for_break') return {}

  const sb = createAdminSupabaseClient()
  const subsRes = await sb
    .from('subscriptions')
    .select(`id, customer_id, paused_dates, ${KITCHEN_SUB_COLUMNS}`)
    .in('status', ['Active'])

  const subs = (subsRes.data ?? []) as SubRow[]

  // Capacity (Phase 7 / L6): fetch only the customers who actually have an
  // active subscription, not the entire (ever-growing) customers table.
  const customerIds = [...new Set(subs.map((s) => s.customer_id))]
  const customersRes = customerIds.length
    ? await sb.from('customers').select('id, dorm_name').in('id', customerIds)
    : { data: [] as Array<{ id: string; dorm_name: string | null }> }

  const customerMap = new Map<string, string | null>()
  for (const c of (customersRes.data ?? []) as Array<{ id: string; dorm_name: string | null }>) {
    customerMap.set(c.id, c.dorm_name)
  }

  const counts: DormCountsRecord = {}

  for (const sub of subs) {
    if (sub.week_type === '5DAYS' && isSaturday) continue
    if ((sub.skipped_dates ?? []).includes(todayIso)) continue
    if ((sub.paused_dates ?? []).includes(todayIso)) continue
    if (!kitchenCountsPlan({
      gate: season.gate,
      day: todayIso,
      wrapUpDay: season.wrapUpDay,
      closeDay: season.closeDay,
      closureDates: season.closureDates,
      plan: kitchenFactsFor(sub),
    })) continue

    const dormName = customerMap.get(sub.customer_id)
    // Customers without a known dorm have no delivery stop, so skip them
    if (!dormName) continue

    counts[dormName] = (counts[dormName] ?? 0) + 1
  }

  return counts
}
```

`src/app/kitchen/[token]/page.tsx`:
- Add `import { KITCHEN_CLOSED_FOR_BREAK } from '@/contexts/ops/usecases/season-kitchen-gate'` directly under `import { getKitchenCounts } from '@/contexts/ops/usecases/get-kitchen-counts'`.
- Replace

```tsx
    getKitchenCounts(todayIso, dayName, isSaturday),
  ])
```

with

```tsx
    getKitchenCounts(todayIso, dayName, isSaturday),
  ])

  // Spec G5: during the break (and after the close day) nothing is cooked.
  if (counts.closedForBreak) {
    return (
      <KitchenClient
        dishes={[]}
        vegCount={0}
        nonVegCount={0}
        countsUnavailable={false}
        isPast2pm={false}
        lastUpdated={lastUpdated}
        noDeliveryReason={KITCHEN_CLOSED_FOR_BREAK}
      />
    )
  }
```

`src/app/ops/[token]/page.tsx`:
- Add `import { loadSeasonKitchenGate, KITCHEN_CLOSED_FOR_BREAK } from '@/contexts/ops/usecases/season-kitchen-gate'` directly under `import { getDormCounts } from '@/contexts/ops/usecases/get-dorm-counts'`.
- Replace `  const allDormCounts = await getDormCounts(todayIso, dayName, isSaturday)` with:

```tsx
  // Spec G5: during the break (and after the close day) there is no run.
  const season = await loadSeasonKitchenGate(todayIso)
  if (season.ok && season.gate === 'closed_for_break') {
    return (
      <RiderClient
        dormCounts={{}}
        dormShapeMap={shapeMap}
        opsTokenId={opsToken.id}
        deliveryDateIso={todayIso}
        lastUpdated={lastUpdated}
        noDeliveryReason={KITCHEN_CLOSED_FOR_BREAK}
      />
    )
  }

  const allDormCounts = await getDormCounts(todayIso, dayName, isSaturday)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/contexts/ops src/contexts/season src/contexts/subscriptions/domain/veg-day-coverage.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean. Every other `getDormCounts` caller (`ops-failsafe-send`, `pickup-precheck`, `confirm-packing`, `confirm-pickup`, `pickup-stack`, `whatsapp-inbound`, `queue-delivery-confirmed-notifications`) keeps working unchanged: an empty record already means "no deliveries expected".

- [ ] **Step 5: Commit**

```bash
git add src/contexts/ops/usecases/season-kitchen-gate.ts src/contexts/ops/usecases/season-kitchen-gate.test.ts src/contexts/ops/usecases/get-kitchen-counts.ts src/contexts/ops/usecases/get-kitchen-counts.test.ts src/contexts/ops/usecases/get-dorm-counts.ts src/contexts/ops/usecases/get-dorm-counts.test.ts "src/app/kitchen/[token]/page.tsx" "src/app/ops/[token]/page.tsx"
git commit -m "feat(season): the kitchen and rider screens count only what the delivery tick cooks, and close for the break

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 9: Resume and start dates respect the break, and release a held plan (G9, §7.5, §7.6, §11.5)

**Files:**
- Modify: `src/contexts/subscriptions/domain/subscriptions.ts`
- Modify: `src/app/dashboard/_shared/types.ts`
- Modify: `src/contexts/subscriptions/usecases/subscription-mutations.ts`
- Modify: `src/contexts/subscriptions/usecases/subscription-mutations.test.ts`
- Modify: `src/app/admin/customers/[id]/actions.ts`
- Test: `src/app/admin/customers/[id]/admin-resume-season.test.ts` (create)
- Modify: `src/app/dashboard/plan/PlanClient.tsx`
- Modify: `src/app/dashboard/_mobile/MobilePlan.tsx`

**Interfaces:**
- Consumes: Task 7 `releaseSeasonHold`, `BREAK_RESUME_COPY`, `BREAK_START_DATE_COPY`, `ADMIN_BREAK_RESUME_COPY`, `isSeasonBreakError`; `getIntakeState({ fresh: true })`; Task 4 G2 (the database refuses too); Task 6 `season_release_hold`.
- Produces:
  - Domain `Subscription` and dashboard `Subscription` gain optional `season_hold_id?: string | null`.
  - `resumeSubscription(subscriptionId)` resolves to `{ success: true } | { error: string } | { error: string; seasonBreak: true }`. During the break (fresh read) it refuses with `BREAK_RESUME_COPY` and `seasonBreak: true`; a plan with `season_hold_id` (after reopening) is released through `releaseSeasonHold` (resume cutoff honoured) and confirmed with `plan_resumed_confirm`; a restart the database refuses maps to the same break copy.
  - `changeStartDate(subscriptionId, newStartDate)`: refused during the break with `BREAK_START_DATE_COPY` (fresh read, after the date checks); a plan with `season_hold_id` ignores the once-per-plan allowance and is released through `releaseSeasonHold` with the new date, `start_date_changed_at` untouched.
  - `adminResumeSub(subscriptionId)`: refused during the break with `ADMIN_BREAK_RESUME_COPY`; a held plan is released through `releaseSeasonHold`.
  - Plan page and mobile plan: a held Scheduled plan's "change start date" is offered even if the allowance was used.

- [ ] **Step 1: Write the failing tests**

In `src/contexts/subscriptions/usecases/subscription-mutations.test.ts`:

1. Below Plan B's `vi.mock('@/contexts/season/usecases/season-skip-notices', ...)` add:

```ts
vi.mock('@/contexts/season/usecases/release-hold', () => ({
  releaseSeasonHold: vi.fn(),
}))
```

2. Add `resumeSubscription` to the import list from `./subscription-mutations`, and add:

```ts
import { releaseSeasonHold } from '@/contexts/season/usecases/release-hold'
import { BREAK_RESUME_COPY, BREAK_START_DATE_COPY } from '@/contexts/season/domain/season-break-errors'
```

3. Append at the end of the file:

```ts
// ── The season break (spec §7.5, §7.6, G9) ────────────────────────────────
// Anchors: 10:00 Dubai on Mon 12 Oct 2026. Mon 19 Oct is a delivery day inside
// the change window.

describe('resume and start date around the season break', () => {
  const releaseMock = vi.mocked(releaseSeasonHold)
  const emitMock = vi.mocked(eventBus.emit)
  const phase = (p: 'open' | 'winding_down' | 'break') => ({ ...intakeState(null), phase: p })
  const heldPaused = (over: Partial<Subscription> = {}) => fakeSub({
    status: 'Paused', pause_date: '2026-10-01T10:00:00Z', has_paused_before: true, season_hold_id: 'hold-1', ...over,
  })

  beforeEach(() => {
    releaseMock.mockReset()
    emitMock.mockClear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T06:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('refuses a resume during the break, reading the phase fresh', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: heldPaused() })
    getIntakeStateMock.mockResolvedValue(phase('break'))

    expect(await resumeSubscription('sub-1')).toEqual({ error: BREAK_RESUME_COPY, seasonBreak: true })
    expect(getIntakeStateMock).toHaveBeenCalledWith({ fresh: true })
    expect(releaseMock).not.toHaveBeenCalled()
  })

  it('after reopening, Resume releases the held plan through SQL and confirms it', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: heldPaused() })
    getIntakeStateMock.mockResolvedValue(phase('open'))
    releaseMock.mockResolvedValue({ ok: true, status: 'Active', followers: 0 })

    expect(await resumeSubscription('sub-1')).toEqual({ success: true })
    expect(releaseMock).toHaveBeenCalledWith({ customerId: 'user-1', subscriptionId: 'sub-1', startDate: null, resumeCutoff: false })
    expect(emitMock).toHaveBeenCalledWith('subscription.notification-due', expect.objectContaining({
      kind: 'plan_resumed_confirm', payload: { resume_date: '2026-10-12' },
    }))
  })

  it('a restart the database refuses reads as the break copy', async () => {
    requireUserMock.mockResolvedValue(authedUser(supabaseChain({ data: null, error: { message: 'SEASON_BREAK: plan sub-1 cannot restart during the semester break' } })))
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: heldPaused({ season_hold_id: null }) })
    getIntakeStateMock.mockResolvedValue(phase('open'))

    expect(await resumeSubscription('sub-1')).toEqual({ error: BREAK_RESUME_COPY, seasonBreak: true })
  })

  it('refuses a start date change during the break', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: fakeSub({ status: 'Scheduled', start_date: '2026-10-20', season_hold_id: 'hold-2' }) })
    getIntakeStateMock.mockResolvedValue(phase('break'))

    expect(await changeStartDate('sub-1', '2026-10-19')).toEqual({ error: BREAK_START_DATE_COPY })
    expect(releaseMock).not.toHaveBeenCalled()
  })

  it('after reopening, a held Scheduled plan picks its date without using the allowance', async () => {
    requireUserMock.mockResolvedValue(authedUser(supabaseChain({ data: null, error: null })))
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: fakeSub({ status: 'Scheduled', start_date: '2026-10-05', start_date_changed_at: '2026-09-20T10:00:00Z', season_hold_id: 'hold-2' }),
    })
    getIntakeStateMock.mockResolvedValue(phase('open'))
    releaseMock.mockResolvedValue({ ok: true, status: 'Scheduled', followers: 0 })

    expect(await changeStartDate('sub-1', '2026-10-19')).toEqual({ success: true })
    expect(releaseMock).toHaveBeenCalledWith({ customerId: 'user-1', subscriptionId: 'sub-1', startDate: '2026-10-19', resumeCutoff: false })
    expect(emitMock).toHaveBeenCalledWith('subscription.notification-due', expect.objectContaining({
      kind: 'plan_start_date_changed_confirm', payload: { start_date: '2026-10-19' },
    }))
  })

  it('a plan that is not held still gets one change only', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: fakeSub({ status: 'Scheduled', start_date: '2026-10-05', start_date_changed_at: '2026-09-20T10:00:00Z', season_hold_id: null }),
    })
    getIntakeStateMock.mockResolvedValue(phase('open'))

    expect(await changeStartDate('sub-1', '2026-10-19')).toEqual({ error: 'You can only change the start date once per plan.' })
  })
})
```

`src/app/admin/customers/[id]/admin-resume-season.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { requireAdminMock, fromMock, intakeMock, releaseMock, emitMock, auditMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  fromMock: vi.fn(),
  intakeMock: vi.fn(),
  releaseMock: vi.fn(),
  emitMock: vi.fn(),
  auditMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/contexts/admin/usecases/require-admin', () => ({ requireAdmin: requireAdminMock }))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ from: fromMock }) }))
vi.mock('@/contexts/admin/usecases/audit', () => ({ logAdminAction: auditMock }))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: vi.fn() }))
vi.mock('@/shared/events/event-bus', () => ({ eventBus: { emit: emitMock, on: vi.fn() } }))
vi.mock('@/contexts/notifications/usecases/subscribers', () => ({}))
vi.mock('@/infra/config/intake', () => ({ getIntakeState: intakeMock }))
vi.mock('@/contexts/season/usecases/release-hold', () => ({ releaseSeasonHold: releaseMock }))

import { adminResumeSub } from './actions'
import { ADMIN_BREAK_RESUME_COPY } from '@/contexts/season/domain/season-break-errors'

const updateMock = vi.fn()

function setup(sub: Record<string, unknown>, update: { data: unknown; error: unknown } = { data: [{ id: 'sub-1' }], error: null }) {
  updateMock.mockReset()
  fromMock.mockImplementation(() => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: sub, error: null }) }) }),
    update: (values: unknown) => {
      updateMock(values)
      return { eq: () => ({ eq: () => ({ select: () => Promise.resolve(update) }) }) }
    },
  }))
}

const paused = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1', customer_id: 'cust-1', status: 'Paused', week_type: '6DAYS', paused_dates: [], season_hold_id: null, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue({ email: 'admin@dormers.ae' })
  vi.useFakeTimers()
  // 10:00 Dubai on Mon 12 Oct 2026.
  vi.setSystemTime(new Date('2026-10-12T06:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('adminResumeSub and the season break (spec §11.5, G9)', () => {
  it('refuses during the break, reading the phase fresh', async () => {
    setup(paused({ season_hold_id: 'hold-1' }))
    intakeMock.mockResolvedValue({ phase: 'break' })
    expect(await adminResumeSub('sub-1')).toEqual({ ok: false, message: ADMIN_BREAK_RESUME_COPY })
    expect(intakeMock).toHaveBeenCalledWith({ fresh: true })
    expect(updateMock).not.toHaveBeenCalled()
    expect(releaseMock).not.toHaveBeenCalled()
  })

  it('releases a held plan after reopening, for the plan owner', async () => {
    setup(paused({ season_hold_id: 'hold-1' }))
    intakeMock.mockResolvedValue({ phase: 'open' })
    releaseMock.mockResolvedValue({ ok: true, status: 'Active', followers: 0 })
    expect(await adminResumeSub('sub-1')).toEqual({ ok: true, message: 'Held plan restarted. The customer is notified on WhatsApp.' })
    expect(releaseMock).toHaveBeenCalledWith({ customerId: 'cust-1', subscriptionId: 'sub-1', startDate: null, resumeCutoff: false })
    expect(updateMock).not.toHaveBeenCalled()
    expect(emitMock).toHaveBeenCalledWith('subscription.notification-due', expect.objectContaining({ kind: 'plan_resumed_confirm' }))
  })

  it('resumes a plan that is not held exactly as before', async () => {
    setup(paused())
    intakeMock.mockResolvedValue({ phase: 'open' })
    expect(await adminResumeSub('sub-1')).toEqual({ ok: true, message: 'Subscription resumed — customer notified on WhatsApp' })
    expect(updateMock).toHaveBeenCalledWith({ status: 'Active', pause_date: null })
  })

  it('turns a restart the database refuses into the break message', async () => {
    setup(paused(), { data: null, error: { message: 'SEASON_BREAK: plan sub-1 cannot restart during the semester break' } })
    intakeMock.mockResolvedValue({ phase: 'open' })
    expect(await adminResumeSub('sub-1')).toEqual({ ok: false, message: ADMIN_BREAK_RESUME_COPY })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/subscriptions/usecases/subscription-mutations.test.ts "src/app/admin/customers/[id]/admin-resume-season.test.ts"`
Expected: FAIL. The resume during the break reaches the customer-client update; `releaseSeasonHold` is never called; `season_hold_id` is not a `Subscription` field (type error ignored by vitest); the admin action has no break check.

- [ ] **Step 3: Write the implementation**

`src/contexts/subscriptions/domain/subscriptions.ts`: in `interface Subscription`, replace Plan B's line

```ts
  season_buffer_grants: number                // default 0 — make-up meals allowed on a buffer day (season §6.2)
```

with

```ts
  season_buffer_grants: number                // default 0 — make-up meals allowed on a buffer day (season §6.2)
  season_hold_id?: string | null              // set while the plan is held for next semester (season §6.3)
```

`src/app/dashboard/_shared/types.ts`: in `interface Subscription`, replace `  season_buffer_grants?: number | null` with:

```ts
  season_buffer_grants?: number | null
  // Held for next semester (season §6.3): set by the break, cleared when the
  // customer restarts the plan after reopening.
  season_hold_id?: string | null
```

`src/contexts/subscriptions/usecases/subscription-mutations.ts`:

(a) Under Plan B's `import { announceSeasonSkipCredited } from '@/contexts/season/usecases/season-skip-notices';` add:

```ts
import { BREAK_RESUME_COPY, BREAK_START_DATE_COPY, isSeasonBreakError } from '@/contexts/season/domain/season-break-errors';
import { releaseSeasonHold } from '@/contexts/season/usecases/release-hold';
```

(b) Replace

```ts
export async function resumeSubscription(subscriptionId: string) {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
```

with

```ts
export async function resumeSubscription(subscriptionId: string) {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
  // ── Season break (spec §7.5, G9) ─────────────────────────────────────────
  // Read fresh: a plan must never restart into a closed kitchen because of a
  // 30-second-old cache. trg_subscriptions_season_guard refuses it too.
  const seasonNow = await getIntakeState({ fresh: true });
  if (seasonNow.phase === 'break') {
    return { error: BREAK_RESUME_COPY, seasonBreak: true as const };
  }
```

(c) Replace `  const setResumeCutoff = aeHour >= 14 && isDeliveryToday;` with:

```ts
  const setResumeCutoff = aeHour >= 14 && isDeliveryToday;

  // A plan held for next semester restarts through SQL (spec X1): the hold is
  // released in the same transaction, and a queued renewal held behind it follows.
  if (subscription.season_hold_id) {
    const released = await releaseSeasonHold({ customerId: auth.user.id, subscriptionId, startDate: null, resumeCutoff: setResumeCutoff });
    if (!released.ok) {
      return released.seasonBreak ? { error: released.error, seasonBreak: true as const } : { error: released.error };
    }
    await eventBus.emit('subscription.notification-due', {
      customerId: auth.user.id,
      kind: 'plan_resumed_confirm',
      scheduledFor: new Date(),
      payload: { resume_date: todayAE },
    });
    revalidatePath('/dashboard', 'layout');
    return { success: true };
  }
```

(d) Replace `  if (updateError) return { error: 'Failed to resume subscription.' };` with:

```ts
  if (updateError) {
    return isSeasonBreakError(updateError.message)
      ? { error: BREAK_RESUME_COPY, seasonBreak: true as const }
      : { error: 'Failed to resume subscription.' };
  }
```

(e) In `changeStartDate`, replace

```ts
  if (subscription.start_date_changed_at) {
    return { error: 'You can only change the start date once per plan.' };
  }
```

with

```ts
  // A plan held for next semester picks its start date after reopening, and
  // that change does not use the once-per-plan allowance (spec §7.6).
  const heldForNextSemester = !!subscription.season_hold_id;
  if (subscription.start_date_changed_at && !heldForNextSemester) {
    return { error: 'You can only change the start date once per plan.' };
  }
```

(f) Replace `  const intakeForChange = await getIntakeState();` with:

```ts
  const intakeForChange = await getIntakeState({ fresh: true });
  // ── Season break (spec §7.6) ────────────────────────────────────────────
  if (intakeForChange.phase === 'break') {
    return { error: BREAK_START_DATE_COPY };
  }
```

(g) Replace

```ts
  // Note: end_date is recomputed automatically by the
```

with

```ts
  if (heldForNextSemester) {
    const released = await releaseSeasonHold({ customerId: auth.user.id, subscriptionId, startDate: newStartDate, resumeCutoff: false });
    if (!released.ok) return { error: released.seasonBreak ? BREAK_START_DATE_COPY : released.error };
    await eventBus.emit('subscription.notification-due', {
      customerId: auth.user.id,
      kind: 'plan_start_date_changed_confirm',
      scheduledFor: new Date(),
      payload: { start_date: newStartDate },
    });
    revalidatePath('/dashboard', 'layout');
    return { success: true };
  }

  // Note: end_date is recomputed automatically by the
```

`src/app/admin/customers/[id]/actions.ts`:

(a) Under `import { eventBus } from '@/shared/events/event-bus'` add:

```ts
import { getIntakeState } from '@/infra/config/intake'
import { releaseSeasonHold } from '@/contexts/season/usecases/release-hold'
import { ADMIN_BREAK_RESUME_COPY, isSeasonBreakError } from '@/contexts/season/domain/season-break-errors'
```

(b) In `adminResumeSub`, replace `        .select('id, customer_id, status, week_type, paused_dates')` with `        .select('id, customer_id, status, week_type, paused_dates, season_hold_id')`. (If that select string also appears elsewhere in the file, change only the one inside `adminResumeSub`.)

(c) Replace

```ts
    if (sub.status !== 'Paused') return { ok: false, message: `Cannot resume — status is ${sub.status}` }
```

with

```ts
    if (sub.status !== 'Paused') return { ok: false, message: `Cannot resume — status is ${sub.status}` }

    // Spec §11.5, G9: an admin resume follows the customer's rules. Read the
    // phase fresh; the database refuses a restart during the break too.
    const season = await getIntakeState({ fresh: true })
    if (season.phase === 'break') return { ok: false, message: ADMIN_BREAK_RESUME_COPY }
```

(d) Replace `    const setResumeCutoff = aeHour >= 14 && isDeliveryToday` (in `adminResumeSub`) with:

```ts
    const setResumeCutoff = aeHour >= 14 && isDeliveryToday

    // A plan held for next semester restarts through SQL, for its owner.
    if (sub.season_hold_id) {
        const released = await releaseSeasonHold({
            customerId: sub.customer_id as string,
            subscriptionId,
            startDate: null,
            resumeCutoff: setResumeCutoff,
        })
        if (!released.ok) return { ok: false, message: released.seasonBreak ? ADMIN_BREAK_RESUME_COPY : released.error }
        await eventBus.emit('subscription.notification-due', {
            customerId: sub.customer_id as string,
            kind: 'plan_resumed_confirm',
            scheduledFor: new Date(),
            payload: { resume_date: todayAE },
        })
        await logAdminAction(admin.email, 'resume_subscription', 'subscription', subscriptionId, { season_hold_released: true })
        revalidatePath(`/admin/customers/${sub.customer_id}`)
        revalidatePath('/admin/customers')
        return { ok: true, message: 'Held plan restarted. The customer is notified on WhatsApp.' }
    }
```

(e) Replace

```ts
        console.error('adminResumeSub failed:', error)
        return { ok: false, message: error.message }
```

with

```ts
        console.error('adminResumeSub failed:', error)
        return { ok: false, message: isSeasonBreakError(error.message) ? ADMIN_BREAK_RESUME_COPY : error.message }
```

`src/app/dashboard/plan/PlanClient.tsx` and `src/app/dashboard/_mobile/MobilePlan.tsx`: in each file replace every occurrence (two per file) of

```ts
const dateChangeUsed = !!sub.start_date_changed_at
```

with

```ts
const dateChangeUsed = !!sub.start_date_changed_at && !sub.season_hold_id
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/contexts/subscriptions "src/app/admin/customers/[id]/admin-resume-season.test.ts" src/contexts/season`
Expected: PASS, including every existing `changeStartDate` and Plan B skip test (their intake fixtures carry a phase that is not `break`).
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/subscriptions/domain/subscriptions.ts src/app/dashboard/_shared/types.ts src/contexts/subscriptions/usecases/subscription-mutations.ts src/contexts/subscriptions/usecases/subscription-mutations.test.ts "src/app/admin/customers/[id]/actions.ts" "src/app/admin/customers/[id]/admin-resume-season.test.ts" src/app/dashboard/plan/PlanClient.tsx src/app/dashboard/_mobile/MobilePlan.tsx
git commit -m "feat(season): nobody restarts a plan during the break, and after reopening Resume or a start date releases the hold

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 10: The held plan on the dashboard

**Files:**
- Modify: `src/contexts/season/domain/season-release.ts`
- Create: `src/contexts/season/domain/customer-hold.ts`
- Test: `src/contexts/season/domain/customer-hold.test.ts`
- Create: `src/infra/supabase/season-holds-repo.ts`
- Test: `src/infra/supabase/season-holds-repo.test.ts`
- Create: `src/app/dashboard/_shared/season-break-copy.ts`
- Test: `src/app/dashboard/_shared/season-break-copy.test.ts`
- Create: `src/app/dashboard/_shared/HeldPlanCard.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/ClientDashboard.tsx`
- Modify: `src/app/dashboard/ActiveDashboard.tsx`
- Modify: `src/app/dashboard/_mobile/MobileHome.tsx`

**Interfaces:**
- Consumes: Task 9 `season_hold_id` on `Subscription`; Plan A `formatAed`, `SeasonPhase`; Plan B `seasonJoinLine(creditAed: number): string | null` (`season-notice-copy.ts`), `CustomerSeason`, the `season` prop and `seasonChip` on `MobileHome`, `previewSeason` / `seasonSub` / `seasonKnob` in the dashboard preview harness; `joinIntakeWaitlist`, `deriveJoinOutcome`, `JoinOutcome`.
- Produces:
  - `SEASON_REFUNDS_LIVE = false` in `season-release.ts` (Plan D flips it)
  - `type CustomerHoldState = 'held' | 'paused_by_customer' | 'ready'`
  - `interface CustomerHold { id: string; subscriptionId: string; reason: 'season' | 'customer_pause'; state: CustomerHoldState; heldMeals: number; waitlistCreditFils: number | null; planName: string; planStatus: 'Paused' | 'Scheduled' }`
  - `interface CustomerBreak { phase: SeasonPhase; hold: CustomerHold }`
  - `customerHoldFrom(input: { hold: Record<string, unknown> | null | undefined; sub: { id: string; plan_name: string; status: string | null; season_hold_id?: string | null } | null | undefined; creditAmountAed: number | null }): CustomerHold | null`
  - `buildCustomerBreak(phase: SeasonPhase, hold: CustomerHold | null): CustomerBreak | null`
  - `getCustomerHold(sb: HoldsClient, sub: { id: string; plan_name: string; status: string | null; season_hold_id?: string | null } | null): Promise<CustomerHold | null>` where `type HoldsClient = Pick<SupabaseClient, 'from'>`
  - `mealsPhrase(n: number): string`; `interface HeldCardCopy { headline: string; body: string; creditLine: string | null; joinLine: string | null; pickDate: boolean }`; `heldCardCopy(input: { hold: CustomerHold; alreadyJoined: boolean; creditAed: number }): HeldCardCopy`
  - `HeldPlanCard({ hold, alreadyJoined, creditAed }: { hold: CustomerHold; alreadyJoined: boolean; creditAed: number })`; stable ids `held-plan-card` (also `data-testid`), `held-plan-join`, `held-plan-pick-date`
  - `ClientDashboard` and `ActiveDashboard` accept `seasonBreak?: CustomerBreak | null`; `MobileHome` accepts `heldCard?: ReactNode`
  - Preview knobs on `/dashboard?preview=1`: `season=held|paused_break|ready|ready_scheduled` (with `&joined=1` for a customer who saved a spot)

Rules: the card shows while the break is on (`held`, `paused_by_customer`) and after reopening until the customer restarts (`ready`). It never mentions a refund (spec D6; Plan D adds the refund option behind `SEASON_REFUNDS_LIVE`). The old "pausing" takeover does not show to a customer with a hold.

- [ ] **Step 1: Write the failing tests**

`src/contexts/season/domain/customer-hold.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { customerHoldFrom, buildCustomerBreak, type CustomerHold } from './customer-hold'

const sub = { id: 'sub-1', plan_name: 'Monthly Premium', status: 'Paused', season_hold_id: 'hold-1' }
const row = { id: 'hold-1', reason: 'season', state: 'held', held_meals: 9, waitlist_credit_id: 'credit-1' }

describe('customerHoldFrom', () => {
  it('maps a held plan with its waitlist credit', () => {
    expect(customerHoldFrom({ hold: row, sub, creditAmountAed: 20 })).toEqual({
      id: 'hold-1', subscriptionId: 'sub-1', reason: 'season', state: 'held', heldMeals: 9,
      waitlistCreditFils: 2000, planName: 'Monthly Premium', planStatus: 'Paused',
    })
  })

  it('maps a customer pause with no credit, and a held Scheduled plan', () => {
    expect(customerHoldFrom({ hold: { ...row, reason: 'customer_pause', state: 'paused_by_customer' }, sub, creditAmountAed: null }))
      .toMatchObject({ reason: 'customer_pause', state: 'paused_by_customer', waitlistCreditFils: null })
    expect(customerHoldFrom({ hold: { ...row, state: 'ready' }, sub: { ...sub, status: 'Scheduled' }, creditAmountAed: 20 }))
      .toMatchObject({ state: 'ready', planStatus: 'Scheduled' })
  })

  it('ignores a hold that is not this plan\'s, is finished, or sits on a plan that is not Paused or Scheduled', () => {
    expect(customerHoldFrom({ hold: { ...row, id: 'other' }, sub, creditAmountAed: 20 })).toBeNull()
    expect(customerHoldFrom({ hold: { ...row, state: 'released' }, sub, creditAmountAed: 20 })).toBeNull()
    expect(customerHoldFrom({ hold: { ...row, state: 'refund_requested' }, sub, creditAmountAed: 20 })).toBeNull()
    expect(customerHoldFrom({ hold: row, sub: { ...sub, status: 'Active' }, creditAmountAed: 20 })).toBeNull()
    expect(customerHoldFrom({ hold: null, sub, creditAmountAed: null })).toBeNull()
  })
})

describe('buildCustomerBreak', () => {
  const hold = (state: CustomerHold['state']): CustomerHold => ({
    id: 'hold-1', subscriptionId: 'sub-1', reason: 'season', state, heldMeals: 9, waitlistCreditFils: 2000, planName: 'Monthly Premium', planStatus: 'Paused',
  })

  it('shows a hold during the break, and a ready hold after reopening', () => {
    expect(buildCustomerBreak('break', hold('held'))).toEqual({ phase: 'break', hold: hold('held') })
    expect(buildCustomerBreak('open', hold('ready'))).toEqual({ phase: 'open', hold: hold('ready') })
    expect(buildCustomerBreak('winding_down', hold('ready'))).toEqual({ phase: 'winding_down', hold: hold('ready') })
  })

  it('shows nothing without a hold, or for a hold still "held" outside the break', () => {
    expect(buildCustomerBreak('break', null)).toBeNull()
    expect(buildCustomerBreak('open', hold('held'))).toBeNull()
  })
})
```

`src/infra/supabase/season-holds-repo.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { getCustomerHold, type HoldsClient } from './season-holds-repo'

type Res = { data: unknown; error: unknown }

function fakeClient(holds: Res, credits: Res = { data: null, error: null }) {
  const from = vi.fn((table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(table === 'season_holds' ? holds : credits) }) }),
  }))
  return { client: { from } as unknown as HoldsClient, from }
}

const sub = { id: 'sub-1', plan_name: 'Monthly Premium', status: 'Paused', season_hold_id: 'hold-1' }

describe('getCustomerHold', () => {
  it('reads the hold and its credit amount', async () => {
    const { client } = fakeClient(
      { data: { id: 'hold-1', reason: 'season', state: 'held', held_meals: 9, waitlist_credit_id: 'credit-1' }, error: null },
      { data: { amount_aed: '20' }, error: null },
    )
    expect(await getCustomerHold(client, sub)).toMatchObject({ id: 'hold-1', heldMeals: 9, waitlistCreditFils: 2000 })
  })

  it('reads nothing for a plan without a hold', async () => {
    const { client, from } = fakeClient({ data: null, error: null })
    expect(await getCustomerHold(client, { ...sub, season_hold_id: null })).toBeNull()
    expect(await getCustomerHold(client, null)).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('shows no card when the hold cannot be read', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'permission denied' } })
    expect(await getCustomerHold(client, sub)).toBeNull()
  })
})
```

`src/app/dashboard/_shared/season-break-copy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { heldCardCopy, mealsPhrase } from './season-break-copy'
import type { CustomerHold } from '@/contexts/season/domain/customer-hold'

const hold = (over: Partial<CustomerHold> = {}): CustomerHold => ({
  id: 'hold-1', subscriptionId: 'sub-1', reason: 'season', state: 'held', heldMeals: 9,
  waitlistCreditFils: 2000, planName: 'Monthly Premium', planStatus: 'Paused', ...over,
})

describe('mealsPhrase', () => {
  it('counts meals', () => {
    expect(mealsPhrase(1)).toBe('1 meal')
    expect(mealsPhrase(9)).toBe('9 meals')
  })
})

describe('heldCardCopy', () => {
  it('a plan held for next semester, with its credit', () => {
    expect(heldCardCopy({ hold: hold(), alreadyJoined: true, creditAed: 20 })).toEqual({
      headline: 'Your 9 meals are kept for next semester.',
      body: "The kitchen is closed between semesters. When we're back, tap Resume.",
      creditLine: 'AED 20 is in your wallet for your next Monthly plan.',
      joinLine: null,
      pickDate: false,
    })
  })

  it('a held plan that had not started, with no credit (a staff plan)', () => {
    expect(heldCardCopy({ hold: hold({ planStatus: 'Scheduled', heldMeals: 1, waitlistCreditFils: null }), alreadyJoined: false, creditAed: 20 })).toEqual({
      headline: 'Your 1 meal is kept for next semester.',
      body: "The kitchen is closed between semesters. When we're back, pick your start date.",
      creditLine: null,
      joinLine: null,
      pickDate: false,
    })
  })

  it('a customer pause offers Save my spot until the customer saves one', () => {
    const paused = hold({ reason: 'customer_pause', state: 'paused_by_customer', heldMeals: 8, waitlistCreditFils: null })
    expect(heldCardCopy({ hold: paused, alreadyJoined: false, creditAed: 15 })).toEqual({
      headline: 'Your plan is paused, and the kitchen is closed between semesters.',
      body: "Your 8 meals wait for you. You can resume once we're back.",
      creditLine: null,
      joinLine: 'Save your spot for next semester and AED 15 goes to your wallet.',
      pickDate: false,
    })
    expect(heldCardCopy({ hold: paused, alreadyJoined: true, creditAed: 15 })).toMatchObject({
      creditLine: 'Your spot for next semester is saved.',
      joinLine: null,
    })
  })

  it('after reopening: tap Resume, or pick a start date', () => {
    expect(heldCardCopy({ hold: hold({ state: 'ready' }), alreadyJoined: true, creditAed: 20 })).toMatchObject({
      headline: "We're back. Your 9 meals are ready.",
      body: "Tap Resume when you're ready, and your dinners start again.",
      pickDate: false,
    })
    expect(heldCardCopy({ hold: hold({ state: 'ready', planStatus: 'Scheduled' }), alreadyJoined: true, creditAed: 20 })).toMatchObject({
      body: 'Pick your start date on your plan page to begin.',
      pickDate: true,
    })
  })

  it('never mentions a refund and never uses a dash', () => {
    const states: CustomerHold['state'][] = ['held', 'paused_by_customer', 'ready']
    for (const state of states) {
      for (const planStatus of ['Paused', 'Scheduled'] as const) {
        const c = heldCardCopy({ hold: hold({ state, planStatus }), alreadyJoined: false, creditAed: 20 })
        const text = [c.headline, c.body, c.creditLine, c.joinLine].filter(Boolean).join(' ')
        expect(text).not.toMatch(/refund/i)
        expect(text).not.toMatch(/[–—]/)
      }
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/season/domain/customer-hold.test.ts src/infra/supabase/season-holds-repo.test.ts src/app/dashboard/_shared/season-break-copy.test.ts`
Expected: FAIL. The three modules cannot be resolved.

- [ ] **Step 3: Write the implementation**

`src/contexts/season/domain/season-release.ts`: append:

```ts

/**
 * Whether customers can ask for a refund for held meals (spec D6, §10.3).
 * Plan D flips this when the owner-approved refund flow ships. Until then no
 * surface shows a refund option or promises one.
 */
export const SEASON_REFUNDS_LIVE = false
```

`src/contexts/season/domain/customer-hold.ts`:

```ts
/**
 * One customer's held plan, for the dashboard (spec §6.3, §12.2 N8, N9).
 * Pure: the dashboard page reads season_holds and passes the row in.
 */

import type { SeasonPhase } from './season-phase'

export type CustomerHoldState = 'held' | 'paused_by_customer' | 'ready'

export interface CustomerHold {
  id: string
  subscriptionId: string
  reason: 'season' | 'customer_pause'
  state: CustomerHoldState
  heldMeals: number
  /** The waitlist credit minted with this hold, in fils; null when none was. */
  waitlistCreditFils: number | null
  planName: string
  planStatus: 'Paused' | 'Scheduled'
}

export interface CustomerBreak {
  phase: SeasonPhase
  hold: CustomerHold
}

const SHOWN: readonly string[] = ['held', 'paused_by_customer', 'ready']

export function customerHoldFrom(input: {
  hold: Record<string, unknown> | null | undefined
  sub: { id: string; plan_name: string; status: string | null; season_hold_id?: string | null } | null | undefined
  creditAmountAed: number | null
}): CustomerHold | null {
  const { hold, sub } = input
  if (!hold || !sub || !sub.season_hold_id || hold.id !== sub.season_hold_id) return null
  if (!SHOWN.includes(String(hold.state))) return null
  const status = sub.status
  if (status !== 'Paused' && status !== 'Scheduled') return null
  return {
    id: String(hold.id),
    subscriptionId: sub.id,
    reason: hold.reason === 'customer_pause' ? 'customer_pause' : 'season',
    state: hold.state as CustomerHoldState,
    heldMeals: Math.max(0, Number(hold.held_meals ?? 0)),
    waitlistCreditFils: input.creditAmountAed == null ? null : Math.round(input.creditAmountAed * 100),
    planName: sub.plan_name,
    planStatus: status,
  }
}

/** A hold shows during the break, and once ready until the customer restarts the plan. */
export function buildCustomerBreak(phase: SeasonPhase, hold: CustomerHold | null): CustomerBreak | null {
  if (!hold) return null
  if (phase !== 'break' && hold.state !== 'ready') return null
  return { phase, hold }
}
```

`src/infra/supabase/season-holds-repo.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { customerHoldFrom, type CustomerHold } from '@/contexts/season/domain/customer-hold'

/**
 * The customer's own hold (spec §6.3). season_holds and credits are readable
 * by the customer through RLS, so the dashboard's user client reads them. A
 * read error shows no card rather than a wrong one.
 */

export type HoldsClient = Pick<SupabaseClient, 'from'>

export async function getCustomerHold(
  sb: HoldsClient,
  sub: { id: string; plan_name: string; status: string | null; season_hold_id?: string | null } | null,
): Promise<CustomerHold | null> {
  if (!sub?.season_hold_id) return null
  const holdRes = await sb
    .from('season_holds')
    .select('id, reason, state, held_meals, waitlist_credit_id')
    .eq('id', sub.season_hold_id)
    .maybeSingle()
  if (holdRes.error || !holdRes.data) return null
  const hold = holdRes.data as Record<string, unknown>

  let creditAmountAed: number | null = null
  if (typeof hold.waitlist_credit_id === 'string') {
    const creditRes = await sb.from('credits').select('amount_aed').eq('id', hold.waitlist_credit_id).maybeSingle()
    if (!creditRes.error && creditRes.data) creditAmountAed = Number((creditRes.data as { amount_aed: number | string }).amount_aed)
  }
  return customerHoldFrom({ hold, sub, creditAmountAed })
}
```

`src/app/dashboard/_shared/season-break-copy.ts`:

```ts
/**
 * Customer words for a plan held over the semester break (spec §6.3, §7.4,
 * §7.5, N8, N9, N11). Pure so vitest covers every line. No line mentions a
 * refund unless SEASON_REFUNDS_LIVE is on (spec D6).
 */

import { formatAed } from '@/contexts/season/domain/meal-value'
import type { CustomerHold } from '@/contexts/season/domain/customer-hold'
import { seasonJoinLine } from './season-notice-copy'

export function mealsPhrase(n: number): string {
  return `${n} ${n === 1 ? 'meal' : 'meals'}`
}

export interface HeldCardCopy {
  headline: string
  body: string
  creditLine: string | null
  joinLine: string | null
  /** A ready Scheduled plan restarts by picking a start date on the plan page. */
  pickDate: boolean
}

export function heldCardCopy(input: { hold: CustomerHold; alreadyJoined: boolean; creditAed: number }): HeldCardCopy {
  const { hold } = input
  const meals = mealsPhrase(hold.heldMeals)
  const are = hold.heldMeals === 1 ? 'is' : 'are'
  const scheduled = hold.planStatus === 'Scheduled'
  const creditLine = hold.waitlistCreditFils ? `${formatAed(hold.waitlistCreditFils)} is in your wallet for your next Monthly plan.` : null

  if (hold.state === 'ready') {
    return {
      headline: `We're back. Your ${meals} ${are} ready.`,
      body: scheduled ? 'Pick your start date on your plan page to begin.' : "Tap Resume when you're ready, and your dinners start again.",
      creditLine,
      joinLine: null,
      pickDate: scheduled,
    }
  }
  if (hold.state === 'paused_by_customer') {
    return {
      headline: 'Your plan is paused, and the kitchen is closed between semesters.',
      body: `Your ${meals} ${hold.heldMeals === 1 ? 'waits' : 'wait'} for you. You can resume once we're back.`,
      creditLine: input.alreadyJoined ? 'Your spot for next semester is saved.' : null,
      joinLine: input.alreadyJoined ? null : seasonJoinLine(input.creditAed),
      pickDate: false,
    }
  }
  return {
    headline: `Your ${meals} ${are} kept for next semester.`,
    body: scheduled
      ? "The kitchen is closed between semesters. When we're back, pick your start date."
      : "The kitchen is closed between semesters. When we're back, tap Resume.",
    creditLine,
    joinLine: null,
    pickDate: false,
  }
}
```

`src/app/dashboard/_shared/HeldPlanCard.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock } from 'lucide-react'
import { BODY, OG, OG_DEEP, S } from './tokens'
import { heldCardCopy } from './season-break-copy'
import { deriveJoinOutcome, type JoinOutcome } from './intake-join-outcome'
import { joinIntakeWaitlist } from '@/contexts/subscriptions/usecases/join-intake-waitlist'
import type { CustomerHold } from '@/contexts/season/domain/customer-hold'

interface Props {
  hold: CustomerHold
  alreadyJoined: boolean
  /** Prospective waitlist credit for this customer's meal preference. */
  creditAed: number
}

/**
 * The plan held over the semester break, on home (desktop and mobile). Same
 * inline card shell as SeasonEndingBanner. Every amount after a join comes
 * from the action's own result.
 */
export function HeldPlanCard({ hold, alreadyJoined, creditAed }: Props) {
  const router = useRouter()
  const [outcome, setOutcome] = useState<JoinOutcome | null>(null)
  const [joining, startJoin] = useTransition()
  const copy = heldCardCopy({ hold, alreadyJoined: alreadyJoined || !!outcome?.joined, creditAed })

  const handleJoin = () => {
    startJoin(async () => {
      const next = deriveJoinOutcome(await joinIntakeWaitlist())
      setOutcome(next)
      if (next.joined) router.refresh()
    })
  }

  const line = { marginTop: 4, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 } as const

  return (
    <div
      id="held-plan-card"
      data-testid="held-plan-card"
      data-state={hold.state}
      role="status"
      style={{
        marginBottom: 18, padding: '14px 18px', borderRadius: 'var(--radius-sm)',
        background: 'var(--ds-og-wash-strong)', border: '1px solid var(--ds-og-border-strong)',
        display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
      }}
    >
      <div style={{
        width: 36, height: 36, flexShrink: 0, borderRadius: '50%', background: 'var(--ds-og-wash)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: OG,
      }}>
        <CalendarClock size={18} strokeWidth={2.2} aria-hidden />
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, lineHeight: 1.35 }}>{copy.headline}</div>
        <div style={line}>{copy.body}</div>
        {copy.creditLine && <div style={{ ...line, color: OG_DEEP, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{copy.creditLine}</div>}
        {copy.joinLine && !outcome?.joined && <div style={line}>{copy.joinLine}</div>}
        {outcome?.message && <div style={line}>{outcome.message}</div>}
        {outcome?.error && <div style={{ ...line, color: '#b3261e' }}>{outcome.error}</div>}
        {(copy.joinLine && !outcome?.joined) || copy.pickDate ? (
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {copy.joinLine && !outcome?.joined && (
              <button
                id="held-plan-join"
                type="button"
                onClick={handleJoin}
                disabled={joining}
                style={{
                  minHeight: 40, padding: '9px 18px', borderRadius: 'var(--radius-pill)', border: 0,
                  background: OG, color: '#fff', fontFamily: BODY, fontSize: 12.5, fontWeight: 700,
                  cursor: joining ? 'default' : 'pointer',
                }}
              >
                {joining ? 'Saving your spot' : 'Save my spot'}
              </button>
            )}
            {copy.pickDate && (
              <Link
                id="held-plan-pick-date"
                href="/dashboard/plan"
                style={{
                  minHeight: 40, padding: '9px 18px', borderRadius: 'var(--radius-pill)',
                  background: OG, color: '#fff', fontFamily: BODY, fontSize: 12.5, fontWeight: 700,
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
                }}
              >
                Pick my start date
              </Link>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
```

`src/app/dashboard/page.tsx`:

(a) Add imports:

```ts
import { buildCustomerBreak, type CustomerBreak } from '@/contexts/season/domain/customer-hold'
import { getCustomerHold } from '@/infra/supabase/season-holds-repo'
```

(b) In the dev harness comment block, under Plan B's `&release=1` line, add:

```ts
        //   ?season=held            — the break: plan held for next semester with AED 20 credit (held card, N8)
        //   ?season=paused_break    — the break: a customer pause carried (card with Save my spot; &joined=1 once saved)
        //   ?season=ready           — reopened: the held plan is ready, tap Resume
        //   ?season=ready_scheduled — reopened: a held plan that had not started, pick a start date
```

(c) Directly after Plan B's `previewSeason` constant (the statement that ends `})() : null`), add:

```ts
        // Season break fixtures (Plan C). The card and notices read a hold,
        // never a status: a held plan is Paused (or Scheduled) with season_hold_id.
        const breakKnob = seasonKnob === 'held' || seasonKnob === 'paused_break' || seasonKnob === 'ready' || seasonKnob === 'ready_scheduled'
            ? seasonKnob : null
        const previewHoldSub = breakKnob === 'ready_scheduled'
            ? { ...seasonSub, status: 'Scheduled', start_date: dateOnly(nowMs - 20 * day), end_date: dateOnly(nowMs + 8 * day), delivered_meals: 0, skipped_meals_count: 0, skipped_dates: [], season_hold_id: 'preview-hold' }
            : breakKnob
                ? { ...seasonSub, status: 'Paused', has_paused_before: true, pause_date: dateOnly(nowMs - 6 * day), season_hold_id: 'preview-hold' }
                : seasonSub
        const previewBreak: CustomerBreak | null = breakKnob ? {
            phase: breakKnob === 'held' || breakKnob === 'paused_break' ? 'break' : 'open',
            hold: {
                id: 'preview-hold',
                subscriptionId: String(previewHoldSub.id),
                reason: breakKnob === 'paused_break' ? 'customer_pause' : 'season',
                state: breakKnob === 'paused_break' ? 'paused_by_customer' : breakKnob === 'held' ? 'held' : 'ready',
                heldMeals: breakKnob === 'ready_scheduled' ? 24 : breakKnob === 'paused_break' ? 8 : 9,
                waitlistCreditFils: breakKnob === 'paused_break' ? null : 2000,
                planName: String(previewHoldSub.plan_name),
                planStatus: breakKnob === 'ready_scheduled' ? 'Scheduled' : 'Paused',
            },
        } : null
        const previewBreakPause: IntakeGateState | undefined = previewBreak ? {
            paused: previewBreak.phase === 'break',
            headline: 'We are between semesters.',
            body: 'Dormers cooks when the dorms are full. We have paused new plans until enough of you are back on campus.',
            creditAed: 20,
            firstName: firstNameFrom(PREVIEW_CUSTOMER.name),
            alreadyJoined: params.joined === '1',
            waitlistCreditAed: params.joined === '1' ? 20 : 0,
            cycleStartedAt: dateOnly(nowMs - 30 * day),
            cycleEndedAt: null,
            lastDeliveryDay: null,
        } : undefined
```

(d) In the preview `<ClientDashboard ...>`: replace Plan B's `activeSubscription={params.nosub === '1' ? null : seasonSub}` with `activeSubscription={params.nosub === '1' ? null : previewHoldSub}`, replace `intakePause={previewPause}` with `intakePause={previewBreakPause ?? previewPause}`, and add the prop `seasonBreak={params.nosub === '1' ? null : previewBreak}`.

(e) In the live path, directly before `    const intakePause: IntakeGateState = {`, add:

```ts
    // Held for next semester (spec §6.3): during the break, or ready after
    // reopening until the customer restarts it.
    const heldSource = activeSubscription?.season_hold_id
        ? activeSubscription
        : queuedSubscription?.season_hold_id ? queuedSubscription : null
    const seasonBreak = buildCustomerBreak(intakeState.phase, await getCustomerHold(supabase, heldSource))
```

and add the prop `seasonBreak={seasonBreak}` to the live `<ClientDashboard ...>` (the element that passes `intakePause={intakePause}`).

`src/app/dashboard/ClientDashboard.tsx`:
- Add `import type { CustomerBreak } from '@/contexts/season/domain/customer-hold'`.
- In `interface Props`, after Plan B's `seasonBreakLive?: boolean`, add:

```ts
  /** A plan held over the semester break, or ready after reopening (spec §6.3). */
  seasonBreak?: CustomerBreak | null
```

- Add `seasonBreak = null` to the destructured props of `ClientDashboard`, and `seasonBreak={seasonBreak}` to the `<ActiveDashboard ...>` element.
- Replace Plan B's

```ts
    intakeTakeoverChecked && !pausingSeen && intakePause.paused && !!activeSubscription && !season
```

with

```ts
    intakeTakeoverChecked && !pausingSeen && intakePause.paused && !!activeSubscription && !season && !seasonBreak
```

`src/app/dashboard/ActiveDashboard.tsx`:
- Add imports:

```ts
import { HeldPlanCard } from './_shared/HeldPlanCard'
import type { CustomerBreak } from '@/contexts/season/domain/customer-hold'
```

- In the props destructuring replace Plan B's `season = null, seasonBreakLive = SEASON_BREAK_RELEASE_LIVE }: {` with `season = null, seasonBreakLive = SEASON_BREAK_RELEASE_LIVE, seasonBreak = null }: {`, and in the props type add `seasonBreak?: CustomerBreak | null` after `seasonBreakLive?: boolean`.
- Replace Plan B's desktop line `        {season && <SeasonWrapUpChip wrapUpDay={season.wrapUpDay} />}` with:

```tsx
        {season && <SeasonWrapUpChip wrapUpDay={season.wrapUpDay} />}
        {seasonBreak && (
          <HeldPlanCard hold={seasonBreak.hold} alreadyJoined={intakePause.alreadyJoined} creditAed={intakePause.creditAed} />
        )}
```

- On `<MobileHome ...>`, next to Plan B's `seasonChip={...}` prop, add:

```tsx
            heldCard={seasonBreak ? <HeldPlanCard hold={seasonBreak.hold} alreadyJoined={intakePause.alreadyJoined} creditAed={intakePause.creditAed} /> : undefined}
```

`src/app/dashboard/_mobile/MobileHome.tsx`:
- In `interface Props`, after Plan B's `seasonChip?: ReactNode`, add:

```ts
  /** The plan held over the semester break, or ready after reopening (spec §6.3). */
  heldCard?: ReactNode
```

- Add `heldCard` to the destructured props of `MobileHome`.
- Replace Plan B's

```tsx
      {orderBanner}
      {seasonChip}
```

with

```tsx
      {orderBanner}
      {seasonChip}
      {heldCard}
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run src/contexts/season src/infra/supabase/season-holds-repo.test.ts src/app/dashboard/_shared`
Expected: PASS.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

- [ ] **Step 5: Look at the card**

Start `npm run dev -- -p 3100` from the worktree. At 1280 and 390 wide open:
- `http://localhost:3100/dashboard?preview=1&verified=1&season=held`: "Your 9 meals are kept for next semester." with "AED 20 is in your wallet for your next Monthly plan."
- `...&season=paused_break`: the customer-pause card with "Save your spot for next semester and AED 20 goes to your wallet." and a Save my spot button; with `&joined=1`: "Your spot for next semester is saved." and no button.
- `...&season=ready`: "We're back. Your 9 meals are ready."
- `...&season=ready_scheduled`: "Pick your start date on your plan page to begin." and a "Pick my start date" link.
Expected on each: the card sits under the greeting, no pausing takeover covers it, no sideways scroll, and `?preview=1&verified=1` without `season` shows no card. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/season/domain/season-release.ts src/contexts/season/domain/customer-hold.ts src/contexts/season/domain/customer-hold.test.ts src/infra/supabase/season-holds-repo.ts src/infra/supabase/season-holds-repo.test.ts src/app/dashboard/_shared/season-break-copy.ts src/app/dashboard/_shared/season-break-copy.test.ts src/app/dashboard/_shared/HeldPlanCard.tsx src/app/dashboard/page.tsx src/app/dashboard/ClientDashboard.tsx src/app/dashboard/ActiveDashboard.tsx src/app/dashboard/_mobile/MobileHome.tsx
git commit -m "feat(season): customers see their plan held for next semester, and when it is ready again

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 11: Resume shows the split while winding down, and is refused during the break (N7, N11)

**Files:**
- Create: `src/contexts/season/domain/resume-split.ts`
- Test: `src/contexts/season/domain/resume-split.test.ts`
- Modify: `src/app/dashboard/_shared/season-break-copy.ts`
- Modify: `src/app/dashboard/_shared/season-break-copy.test.ts`
- Create: `src/app/dashboard/_shared/SeasonSplitSheet.tsx`
- Create: `src/app/dashboard/_shared/BreakResumeSheet.tsx`
- Modify: `src/app/dashboard/ActiveDashboard.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: Task 1 `projectPlan`, `ProjectionPlan` (with `resumeCutoffDate`); Task 9 server refusal; Task 10 `seasonBreak` prop, `mealsPhrase`, `SEASON_REFUNDS_LIVE`; Plan A `formatShortDay`, `formatAed`, `isDeliveryDayIso`, `todayAeIso`; Plan B `CustomerSeason` (`wrapUpDay`, `closeDay`, `closureDates`, `skipCreditFils`), `projectionPlanFromRow`, `seasonJoinLine`, `seasonBreakLive` prop, the preview `seasonKnob` / `previewWrapUp` / `previewSeason`.
- Produces:
  - `interface ResumeSplit { firstDinner: string | null; wrapUpDay: string; heldMeals: number; creditAed: number | null }`
  - `resumeSplitFor(input: { plan: ProjectionPlan | null; wrapUpDay: string; closeDay: string; todayAe: string; aeHour: number; closureDates: readonly string[]; creditAed: number; alreadyJoined: boolean; paidInCash: boolean }): ResumeSplit | null`
  - `interface SheetCopy { headline: string; lines: string[] }`
  - `resumeSplitCopy(input: { split: ResumeSplit; refundsLive: boolean; refund: { amountFils: number } | null }): SheetCopy`
  - `breakResumeCopy(input: { alreadyJoined: boolean; creditAed: number }): SheetCopy & { joinLine: string | null }`
  - `SeasonSplitSheet({ open, split, onResume, onStay })`, ids `season-split-sheet` (testid), `season-split-resume`, `season-split-stay`
  - `BreakResumeSheet({ open, alreadyJoined, creditAed, onClose })`, ids `break-resume-sheet` (testid), `break-resume-join`, `break-resume-close`
  - Preview knob `season=runs_past` (pair with `sub=paused`; before Task 15 also `&release=1`)

Rules:
- §7.4 (N7): a paused customer taps Resume while the season winds down to a wrap-up day, and the projection of the resumed plan (resume cutoff honoured) runs past W: the split sheet shows first. "Resume" continues to the normal resume (and the 2 PM cutoff warning); "Stay paused" closes. Nothing is stored. The credit sentence appears only for a plan paid in cash (`skipCreditFils !== 0`) whose customer has not saved a spot. The refund sentence needs `SEASON_REFUNDS_LIVE` and an amount, which Plan D supplies; Plan C passes none. The sheet is shown only while `seasonBreakLive` is on, because it describes the hold.
- §7.5 (N11): during the break Resume opens the refusal sheet with Save my spot (when not saved yet) instead of calling the server. The server refuses too (Task 9).

- [ ] **Step 1: Write the failing tests**

`src/contexts/season/domain/resume-split.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resumeSplitFor } from './resume-split'
import type { ProjectionPlan } from './season-projection'

// Spec §14, customer D: paused, resumes Thu 1 Oct 2026 with 12 meals left.
// Wrap-up day Sat 3 Oct, close day Mon 5 Oct, no buffer grant.
const paused = (p: Partial<ProjectionPlan> = {}): ProjectionPlan => ({
  id: 'd', customerId: 'cd', planName: 'Monthly Premium', status: 'Paused',
  startDate: '2026-09-01', endDate: '2026-10-16', weekType: '6DAYS',
  mealsPerDay: 1, totalMeals: 24, deliveredMeals: 12, creditedSkipDays: 0, bufferGrants: 0,
  skippedDates: [], plannedPauseStart: null, staffApproval: null, lastDeliveryTickDate: '2026-09-09', resumeCutoffDate: null,
  ...p,
})
const split = (over: Partial<Parameters<typeof resumeSplitFor>[0]> = {}) => resumeSplitFor({
  plan: paused(), wrapUpDay: '2026-10-03', closeDay: '2026-10-05', todayAe: '2026-10-01', aeHour: 11,
  closureDates: [], creditAed: 20, alreadyJoined: false, paidInCash: true, ...over,
})

describe('resumeSplitFor (spec §7.4)', () => {
  it('dinners until the wrap-up day, the rest kept with the waitlist credit', () => {
    expect(split()).toEqual({ firstDinner: '2026-10-01', wrapUpDay: '2026-10-03', heldMeals: 9, creditAed: 20 })
  })

  it('after the 2 PM cutoff tonight is not cooked, so one more meal is kept', () => {
    expect(split({ aeHour: 15 })).toEqual({ firstDinner: '2026-10-02', wrapUpDay: '2026-10-03', heldMeals: 10, creditAed: 20 })
  })

  it('resuming after 2 PM on the wrap-up day keeps every meal (spec §15)', () => {
    expect(split({ todayAe: '2026-10-03', aeHour: 15 })).toEqual({ firstDinner: null, wrapUpDay: '2026-10-03', heldMeals: 12, creditAed: 20 })
  })

  it('shows no split when every meal fits before the wrap-up day', () => {
    expect(split({ plan: paused({ deliveredMeals: 21 }) })).toBeNull()
  })

  it('names no credit for a customer who saved a spot, or a plan not paid in cash', () => {
    expect(split({ alreadyJoined: true })?.creditAed).toBeNull()
    expect(split({ paidInCash: false })?.creditAed).toBeNull()
    expect(split({ creditAed: 0 })?.creditAed).toBeNull()
  })

  it('only for a paused plan', () => {
    expect(split({ plan: paused({ status: 'Active' }) })).toBeNull()
    expect(split({ plan: null })).toBeNull()
  })
})
```

Append to `src/app/dashboard/_shared/season-break-copy.test.ts` (and add `resumeSplitCopy, breakResumeCopy` to its import from `./season-break-copy`):

```ts
describe('resumeSplitCopy (spec §7.4, N7)', () => {
  const d = { firstDinner: '2026-10-01', wrapUpDay: '2026-10-03', heldMeals: 9, creditAed: 20 }

  it('names the dinners, the kept meals and the credit', () => {
    expect(resumeSplitCopy({ split: d, refundsLive: false, refund: null })).toEqual({
      headline: 'Resume your plan?',
      lines: ['Dinners from Thu 1 Oct to Sat 3 Oct.', 'Your other 9 meals will be kept for next semester, with AED 20 in your wallet.'],
    })
  })

  it('says so when no dinner is left before the wrap-up day', () => {
    expect(resumeSplitCopy({ split: { ...d, firstDinner: null, heldMeals: 12, creditAed: null }, refundsLive: false, refund: null }).lines).toEqual([
      'There is no delivery day left before the semester wraps up on Sat 3 Oct.',
      'Your 12 meals will be kept for next semester.',
    ])
  })

  it('offers a refund only once refunds are live and an amount is known', () => {
    expect(resumeSplitCopy({ split: d, refundsLive: false, refund: { amountFils: 16200 } }).lines.join(' ')).not.toMatch(/refund/i)
    expect(resumeSplitCopy({ split: d, refundsLive: true, refund: null }).lines.join(' ')).not.toMatch(/refund/i)
    expect(resumeSplitCopy({ split: d, refundsLive: true, refund: { amountFils: 16200 } }).lines.at(-1))
      .toBe('You can ask for a refund for those 9 meals instead (AED 162).')
  })
})

describe('breakResumeCopy (spec §7.5, N11)', () => {
  it('refuses kindly and offers the spot', () => {
    expect(breakResumeCopy({ alreadyJoined: false, creditAed: 15 })).toEqual({
      headline: 'The kitchen is closed between semesters.',
      lines: ["Your plan can resume once we're back."],
      joinLine: 'Save your spot for next semester and AED 15 goes to your wallet.',
    })
    expect(breakResumeCopy({ alreadyJoined: true, creditAed: 15 }).joinLine).toBeNull()
  })

  it('never uses a dash', () => {
    const texts = [
      ...resumeSplitCopy({ split: { firstDinner: '2026-10-01', wrapUpDay: '2026-10-03', heldMeals: 9, creditAed: 20 }, refundsLive: true, refund: { amountFils: 16200 } }).lines,
      ...breakResumeCopy({ alreadyJoined: false, creditAed: 15 }).lines,
    ]
    for (const t of texts) expect(t).not.toMatch(/[–—]/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/season/domain/resume-split.test.ts src/app/dashboard/_shared/season-break-copy.test.ts`
Expected: FAIL. `./resume-split` cannot be resolved; `resumeSplitCopy` and `breakResumeCopy` are not exported.

- [ ] **Step 3: Write the implementation**

`src/contexts/season/domain/resume-split.ts`:

```ts
/**
 * What resuming now means while the season winds down (spec §7.4, N7).
 *
 * Pure. Projects the paused plan as if it resumed now (a resume after 2 PM on
 * a delivery day does not cook tonight) and, when dinners would run past the
 * wrap-up day, returns the split the sheet shows. Nothing is stored: the hold
 * is created when the break starts, from the projection at that moment.
 */

import { isDeliveryDayIso } from './season-dates'
import { projectPlan, type ProjectionPlan } from './season-projection'

export interface ResumeSplit {
  /** First dinner before the wrap-up day, or null when none is left. */
  firstDinner: string | null
  wrapUpDay: string
  /** Meals the break will keep for next semester. */
  heldMeals: number
  /** The waitlist credit the break will add, in AED; null when it will add none. */
  creditAed: number | null
}

export function resumeSplitFor(input: {
  plan: ProjectionPlan | null
  wrapUpDay: string
  closeDay: string
  todayAe: string
  aeHour: number
  closureDates: readonly string[]
  creditAed: number
  alreadyJoined: boolean
  paidInCash: boolean
}): ResumeSplit | null {
  const { plan } = input
  if (!plan || plan.status !== 'Paused') return null

  const afterCutoff = input.aeHour >= 14 && isDeliveryDayIso(input.todayAe, plan.weekType)
  const resumed: ProjectionPlan = {
    ...plan,
    status: 'Active',
    plannedPauseStart: null,
    resumeCutoffDate: afterCutoff ? input.todayAe : plan.resumeCutoffDate ?? null,
  }
  const projection = projectPlan(resumed, {
    todayAe: input.todayAe,
    closureDates: new Set(input.closureDates),
    wrapUpDay: input.wrapUpDay,
    closeDay: input.closeDay,
  })
  if (projection.disposition !== 'runs_past') return null

  return {
    firstDinner: projection.cookDates[0] ?? null,
    wrapUpDay: input.wrapUpDay,
    heldMeals: Math.max(0, projection.mealsLeft - projection.cookDates.length * plan.mealsPerDay),
    creditAed: input.paidInCash && !input.alreadyJoined && input.creditAed > 0 ? input.creditAed : null,
  }
}
```

Append to `src/app/dashboard/_shared/season-break-copy.ts` (and add `import { formatShortDay } from '@/contexts/season/domain/season-dates'` and `import type { ResumeSplit } from '@/contexts/season/domain/resume-split'` to its imports):

```ts
export interface SheetCopy {
  headline: string
  lines: string[]
}

/** N7: the split before a resume while winding down. Plan D passes `refund`. */
export function resumeSplitCopy(input: { split: ResumeSplit; refundsLive: boolean; refund: { amountFils: number } | null }): SheetCopy {
  const { split } = input
  const wrapUp = formatShortDay(split.wrapUpDay)
  const meals = mealsPhrase(split.heldMeals)
  const lines = [
    split.firstDinner
      ? `Dinners from ${formatShortDay(split.firstDinner)} to ${wrapUp}.`
      : `There is no delivery day left before the semester wraps up on ${wrapUp}.`,
    `Your ${split.firstDinner ? 'other ' : ''}${meals} will be kept for next semester${split.creditAed ? `, with ${formatAed(Math.round(split.creditAed * 100))} in your wallet` : ''}.`,
  ]
  if (input.refundsLive && input.refund) {
    lines.push(`You can ask for a refund for those ${meals} instead (${formatAed(input.refund.amountFils)}).`)
  }
  return { headline: 'Resume your plan?', lines }
}

/** N11: Resume tapped during the break. */
export function breakResumeCopy(input: { alreadyJoined: boolean; creditAed: number }): SheetCopy & { joinLine: string | null } {
  return {
    headline: 'The kitchen is closed between semesters.',
    lines: ["Your plan can resume once we're back."],
    joinLine: input.alreadyJoined ? null : seasonJoinLine(input.creditAed),
  }
}
```

`src/app/dashboard/_shared/SeasonSplitSheet.tsx`:

```tsx
'use client'

import { MobileSheet } from './MobileSheet'
import { BODY, OG, S } from './tokens'
import { resumeSplitCopy } from './season-break-copy'
import { SEASON_REFUNDS_LIVE } from '@/contexts/season/domain/season-release'
import type { ResumeSplit } from '@/contexts/season/domain/resume-split'

interface Props {
  open: boolean
  split: ResumeSplit | null
  onResume: () => void
  onStay: () => void
}

/** Spec §7.4 (N7): what resuming now means, before the customer confirms. */
export function SeasonSplitSheet({ open, split, onResume, onStay }: Props) {
  if (!split) return null
  // Plan D passes the refund amount here when it turns SEASON_REFUNDS_LIVE on.
  const copy = resumeSplitCopy({ split, refundsLive: SEASON_REFUNDS_LIVE, refund: null })
  const button = { flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' } as const

  return (
    <MobileSheet
      open={open}
      onClose={onStay}
      maxWidth={420}
      ariaLabel={copy.headline}
      footer={
        <>
          <button id="season-split-stay" type="button" onClick={onStay} style={{ ...button, border: '1px solid var(--ds-border-strong)', background: 'var(--ds-surface2)', color: S.fg }}>
            Stay paused
          </button>
          <button id="season-split-resume" type="button" onClick={onResume} style={{ ...button, border: 'none', background: OG, color: '#fff', boxShadow: '0 0 16px rgba(245,127,32,0.45)' }}>
            Resume
          </button>
        </>
      }
    >
      <div data-testid="season-split-sheet">
        <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: S.fg, lineHeight: 1.2, letterSpacing: '-0.01em', marginRight: 28 }}>
          {copy.headline}
        </div>
        {copy.lines.map((line) => (
          <div key={line} style={{ fontFamily: BODY, fontSize: 14, color: S.fgMuted, marginTop: 12, lineHeight: 1.65 }}>{line}</div>
        ))}
      </div>
    </MobileSheet>
  )
}
```

`src/app/dashboard/_shared/BreakResumeSheet.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MobileSheet } from './MobileSheet'
import { BODY, OG, S } from './tokens'
import { breakResumeCopy } from './season-break-copy'
import { deriveJoinOutcome, type JoinOutcome } from './intake-join-outcome'
import { joinIntakeWaitlist } from '@/contexts/subscriptions/usecases/join-intake-waitlist'

interface Props {
  open: boolean
  alreadyJoined: boolean
  /** Prospective waitlist credit for this customer's meal preference. */
  creditAed: number
  onClose: () => void
}

/** Spec §7.5 (N11): Resume during the break is refused, with Save my spot. */
export function BreakResumeSheet({ open, alreadyJoined, creditAed, onClose }: Props) {
  const router = useRouter()
  const [outcome, setOutcome] = useState<JoinOutcome | null>(null)
  const [joining, startJoin] = useTransition()
  const copy = breakResumeCopy({ alreadyJoined: alreadyJoined || !!outcome?.joined, creditAed })

  const handleJoin = () => {
    startJoin(async () => {
      const next = deriveJoinOutcome(await joinIntakeWaitlist())
      setOutcome(next)
      if (next.joined) router.refresh()
    })
  }

  const button = { flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', fontFamily: BODY, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' } as const
  const text = { fontFamily: BODY, fontSize: 14, color: S.fgMuted, marginTop: 12, lineHeight: 1.65 } as const

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      maxWidth={420}
      ariaLabel={copy.headline}
      footer={
        <>
          <button
            id="break-resume-close"
            type="button"
            onClick={onClose}
            style={{ ...button, cursor: 'pointer', border: '1px solid var(--ds-border-strong)', background: copy.joinLine ? 'var(--ds-surface2)' : OG, color: copy.joinLine ? S.fg : '#fff' }}
          >
            Got it
          </button>
          {copy.joinLine && (
            <button
              id="break-resume-join"
              type="button"
              onClick={handleJoin}
              disabled={joining}
              style={{ ...button, cursor: joining ? 'default' : 'pointer', border: 'none', background: OG, color: '#fff', boxShadow: '0 0 16px rgba(245,127,32,0.45)' }}
            >
              {joining ? 'Saving your spot' : 'Save my spot'}
            </button>
          )}
        </>
      }
    >
      <div data-testid="break-resume-sheet">
        <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: S.fg, lineHeight: 1.2, letterSpacing: '-0.01em', marginRight: 28 }}>
          {copy.headline}
        </div>
        {copy.lines.map((line) => <div key={line} style={text}>{line}</div>)}
        {copy.joinLine && <div style={text}>{copy.joinLine}</div>}
        {outcome?.message && <div style={text}>{outcome.message}</div>}
        {outcome?.error && <div style={{ ...text, color: '#b3261e' }}>{outcome.error}</div>}
      </div>
    </MobileSheet>
  )
}
```

`src/app/dashboard/ActiveDashboard.tsx`:

(a) Add imports:

```ts
import { SeasonSplitSheet } from './_shared/SeasonSplitSheet'
import { BreakResumeSheet } from './_shared/BreakResumeSheet'
import { resumeSplitFor } from '@/contexts/season/domain/resume-split'
import { projectionPlanFromRow } from '@/contexts/season/domain/customer-season'
import { todayAeIso as seasonTodayAeIso } from '@/contexts/season/domain/season-dates'
```

(If `projectionPlanFromRow` is already imported from Plan B, keep one import.)

(b) Replace `  const [showResumeCutoffWarning, setShowResumeCutoffWarning] = useState(false)` with:

```ts
  const [showResumeCutoffWarning, setShowResumeCutoffWarning] = useState(false)
  // Season (spec §7.4, §7.5): the split before a resume while winding down,
  // and the refusal during the break.
  const [showResumeSplit, setShowResumeSplit] = useState(false)
  const [showBreakResume, setShowBreakResume] = useState(false)
```

(c) Replace `  const handlePauseRequest = () => {` with:

```ts
  // Spec §7.4: while winding down, a resume whose dinners run past the wrap-up
  // day shows the split first. Only once the break is live: it describes the hold.
  const resumeSplit = season && seasonBreakLive && localState === 'paused'
    ? resumeSplitFor({
        plan: projectionPlanFromRow(sub as unknown as Record<string, unknown>),
        wrapUpDay: season.wrapUpDay,
        closeDay: season.closeDay,
        todayAe: seasonTodayAeIso(),
        aeHour: new Date(Date.now() + 4 * 60 * 60 * 1000).getUTCHours(),
        closureDates: season.closureDates,
        creditAed: intakePause.creditAed,
        alreadyJoined: intakePause.alreadyJoined,
        paidInCash: season.skipCreditFils !== 0,
      })
    : null

  // The resume itself, after any season sheet: past the 2 PM kitchen cutoff on
  // a delivery day, warn first that tonight's meal is not coming.
  const continueResume = () => {
    if (skipPastCutoff && !skipNoDelivery) { setShowResumeCutoffWarning(true); return }
    act(() => resumeSubscription(sub.id), 'active', 'resume')
  }

  const handlePauseRequest = () => {
```

(d) Replace

```ts
      if (skipPastCutoff && !skipNoDelivery) { setShowResumeCutoffWarning(true); return }
      act(() => resumeSubscription(sub.id), 'active', 'resume')
    }
```

with

```ts
      // Season: during the break Resume is refused with Save my spot (§7.5);
      // while winding down a split that runs past the wrap-up day shows first (§7.4).
      if (seasonBreak?.phase === 'break') { setShowBreakResume(true); return }
      if (resumeSplit) { setShowResumeSplit(true); return }
      continueResume()
    }
```

(e) Replace `        {/* Pause confirmation modal — routed through MobileSheet. */}` with:

```tsx
        <SeasonSplitSheet
          open={showResumeSplit}
          split={resumeSplit}
          onStay={() => setShowResumeSplit(false)}
          onResume={() => { setShowResumeSplit(false); continueResume() }}
        />
        <BreakResumeSheet
          open={showBreakResume}
          alreadyJoined={intakePause.alreadyJoined}
          creditAed={intakePause.creditAed}
          onClose={() => setShowBreakResume(false)}
        />

        {/* Pause confirmation modal — routed through MobileSheet. */}
```

`src/app/dashboard/page.tsx`:
- Under Plan B's `//   ?season=credited ...` harness line add `        //   ?season=runs_past  — pair with sub=paused: wrap-up day in 2 days, so Resume shows the split sheet (before the break is live add &release=1)`.
- Replace Plan B's

```ts
            : seasonKnob === 'grant' || seasonKnob === 'credited' ? String(seasonSub.end_date).slice(0, 10)
            : null
```

with

```ts
            : seasonKnob === 'grant' || seasonKnob === 'credited' ? String(seasonSub.end_date).slice(0, 10)
            : seasonKnob === 'runs_past' ? notSunday(dateOnly(nowMs + 2 * day))
            : null
```

- Replace Plan B's `            return built && (seasonKnob === 'grant' || seasonKnob === 'credited') ? { ...built, notice: null } : built` with:

```ts
            return built && (seasonKnob === 'grant' || seasonKnob === 'credited' || seasonKnob === 'runs_past') ? { ...built, notice: null } : built
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run src/contexts/season src/app/dashboard/_shared`
Expected: PASS.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

- [ ] **Step 5: Look at both sheets**

Start `npm run dev -- -p 3100`. At 1280 and 390, before 14:00 Dubai time (or pin `&now=` to a Monday to Saturday and fake the browser clock to 10:00 Dubai time, as the atlas harness does):
- `http://localhost:3100/dashboard?preview=1&verified=1&sub=paused&paused=1&joined=0&season=runs_past&release=1`, tap Resume (desktop Quick actions, mobile hero). Expected: "Resume your plan?", "Dinners from {today} to {the wrap-up day}.", "Your other {N} meals will be kept for next semester, with AED 15 in your wallet." (`joined=0`: the fixture customer has not saved a spot), buttons "Stay paused" and "Resume", no refund sentence. "Stay paused" closes; "Resume" runs the preview resume. With `&joined=1` instead of `&joined=0` the credit clause is gone.
- The same URL without `&release=1`: Resume goes straight to the resume (no split before the break is live).
- `http://localhost:3100/dashboard?preview=1&verified=1&season=paused_break`, tap Resume. Expected: "The kitchen is closed between semesters.", "Your plan can resume once we're back.", "Save your spot for next semester and AED 20 goes to your wallet.", buttons "Got it" and "Save my spot". With `&joined=1`: only "Got it".
Take screenshots of the four sheets into your scratch directory. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/season/domain/resume-split.ts src/contexts/season/domain/resume-split.test.ts src/app/dashboard/_shared/season-break-copy.ts src/app/dashboard/_shared/season-break-copy.test.ts src/app/dashboard/_shared/SeasonSplitSheet.tsx src/app/dashboard/_shared/BreakResumeSheet.tsx src/app/dashboard/ActiveDashboard.tsx src/app/dashboard/page.tsx
git commit -m "feat(season): Resume shows what runs past the wrap-up day, and during the break offers a spot instead

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 12: The break notice, once, in the app (N8, N9)

**Files:**
- Modify: `src/app/dashboard/_shared/season-break-copy.ts`
- Modify: `src/app/dashboard/_shared/season-break-copy.test.ts`
- Create: `src/app/dashboard/_shared/SeasonBreakNotice.tsx`
- Modify: `src/app/dashboard/ClientDashboard.tsx`

**Interfaces:**
- Consumes: Task 10 `CustomerHold`, `seasonBreak` prop, `mealsPhrase`; Plan B `seasonJoinLine`, `SeasonScheduledNotice` (visual family), `showSeasonNotice`; `joinIntakeWaitlist`, `deriveJoinOutcome`, `creditMechanicsLine`, `JoinOutcome`.
- Produces:
  - `interface BreakNoticeCopy { headline: string; lines: string[]; joinLine: string | null }`
  - `breakNoticeCopy(input: { hold: CustomerHold; alreadyJoined: boolean; creditAed: number }): BreakNoticeCopy | null` (null for a `ready` hold)
  - `breakNoticeSeenKey(holdId: string): string`
  - `SeasonBreakNotice(props: { hold: CustomerHold; alreadyJoined: boolean; creditAed: number; onDismiss: () => void })`; ids `season-break-notice` (testid), `season-break-notice-join`, `season-break-notice-dismiss`

Rules: N8 (a `held` plan) and N9 (a `paused_by_customer` plan) show once per hold, full-screen, on the first visit during the break, keyed in localStorage like the intake takeovers. They sit after the checkout-success branches and before Plan B's season-end notice. N8 has no refund option (spec D6: Plan D adds it behind `SEASON_REFUNDS_LIVE`); N9 offers Save my spot until the customer saves one. WhatsApp and email for N8 and N9 are Plan E.

- [ ] **Step 1: Write the failing test**

Append to `src/app/dashboard/_shared/season-break-copy.test.ts` (and add `breakNoticeCopy, breakNoticeSeenKey` to its import from `./season-break-copy`):

```ts
describe('breakNoticeCopy (N8, N9)', () => {
  it('N8: the meals kept for next semester, the credit, and what to do when we are back', () => {
    expect(breakNoticeCopy({ hold: hold(), alreadyJoined: true, creditAed: 20 })).toEqual({
      headline: 'Your meals are kept for next semester.',
      lines: [
        'The kitchen is closed between semesters, so your last 9 meals of Monthly Premium are kept for you.',
        'AED 20 is in your wallet too.',
        "When we're back, tap Resume.",
      ],
      joinLine: null,
    })
  })

  it('N8 for a plan that had not started, with no credit', () => {
    expect(breakNoticeCopy({ hold: hold({ planStatus: 'Scheduled', planName: 'Weekly Flex', heldMeals: 6, waitlistCreditFils: null }), alreadyJoined: false, creditAed: 20 })).toEqual({
      headline: 'Your meals are kept for next semester.',
      lines: [
        'The kitchen is closed between semesters, so your 6 meals of Weekly Flex are kept for you.',
        "When we're back, pick your start date.",
      ],
      joinLine: null,
    })
  })

  it('N9: the pause carries over, with Save my spot until the customer saves one', () => {
    const paused = hold({ reason: 'customer_pause', state: 'paused_by_customer', waitlistCreditFils: null })
    expect(breakNoticeCopy({ hold: paused, alreadyJoined: false, creditAed: 15 })).toEqual({
      headline: 'The kitchen is closed between semesters.',
      lines: ["Your Monthly Premium is still paused, and your meals wait for you. Resume when we're back."],
      joinLine: 'Save your spot for next semester and AED 15 goes to your wallet.',
    })
    expect(breakNoticeCopy({ hold: paused, alreadyJoined: true, creditAed: 15 })?.joinLine).toBeNull()
  })

  it('shows nothing for a ready hold, and never mentions a refund or uses a dash', () => {
    expect(breakNoticeCopy({ hold: hold({ state: 'ready' }), alreadyJoined: false, creditAed: 20 })).toBeNull()
    for (const h of [hold(), hold({ reason: 'customer_pause', state: 'paused_by_customer' })]) {
      const c = breakNoticeCopy({ hold: h, alreadyJoined: false, creditAed: 20 })
      const text = [c?.headline, ...(c?.lines ?? []), c?.joinLine].filter(Boolean).join(' ')
      expect(text).not.toMatch(/refund/i)
      expect(text).not.toMatch(/[–—]/)
    }
  })

  it('is seen once per hold', () => {
    expect(breakNoticeSeenKey('hold-1')).toBe('dormers:season-break-notice-ack:hold-1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/dashboard/_shared/season-break-copy.test.ts`
Expected: FAIL with "breakNoticeCopy is not a function".

- [ ] **Step 3: Write the implementation**

Append to `src/app/dashboard/_shared/season-break-copy.ts`:

```ts
export interface BreakNoticeCopy {
  headline: string
  lines: string[]
  joinLine: string | null
}

/** N8 (a plan held by the break) and N9 (a customer pause carried over). Null otherwise. */
export function breakNoticeCopy(input: { hold: CustomerHold; alreadyJoined: boolean; creditAed: number }): BreakNoticeCopy | null {
  const { hold } = input
  if (hold.state === 'held') {
    const last = hold.planStatus === 'Scheduled' ? '' : 'last '
    const lines = [
      `The kitchen is closed between semesters, so your ${last}${mealsPhrase(hold.heldMeals)} of ${hold.planName} ${hold.heldMeals === 1 ? 'is' : 'are'} kept for you.`,
    ]
    if (hold.waitlistCreditFils) lines.push(`${formatAed(hold.waitlistCreditFils)} is in your wallet too.`)
    lines.push(hold.planStatus === 'Scheduled' ? "When we're back, pick your start date." : "When we're back, tap Resume.")
    return { headline: 'Your meals are kept for next semester.', lines, joinLine: null }
  }
  if (hold.state === 'paused_by_customer') {
    return {
      headline: 'The kitchen is closed between semesters.',
      lines: [`Your ${hold.planName} is still paused, and your meals wait for you. Resume when we're back.`],
      joinLine: input.alreadyJoined ? null : seasonJoinLine(input.creditAed),
    }
  }
  return null
}

/** Once per hold: a new season creates a new hold, so the notice shows again. */
export function breakNoticeSeenKey(holdId: string): string {
  return `dormers:season-break-notice-ack:${holdId}`
}
```

`src/app/dashboard/_shared/SeasonBreakNotice.tsx`:

```tsx
'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { CalendarClock } from 'lucide-react'
import { OG, BODY, TIER_POP_TEXT } from './tokens'
import { joinIntakeWaitlist } from '@/contexts/subscriptions/usecases/join-intake-waitlist'
import { deriveJoinOutcome, creditMechanicsLine, type JoinOutcome } from './intake-join-outcome'
import { breakNoticeCopy } from './season-break-copy'
import type { CustomerHold } from '@/contexts/season/domain/customer-hold'

interface Props {
  hold: CustomerHold
  alreadyJoined: boolean
  /** Prospective waitlist credit for this customer's meal preference. */
  creditAed: number
  onDismiss: () => void
}

/**
 * The one-time full-screen notice when the break starts (spec N8, N9). Same
 * family as SeasonScheduledNotice. ClientDashboard owns the once-per-hold rule.
 * Every amount shown after a join comes from the action's own result.
 */
export function SeasonBreakNotice({ hold, alreadyJoined, creditAed, onDismiss }: Props) {
  const reduceMotion = useReducedMotion()
  const router = useRouter()
  const [outcome, setOutcome] = useState<JoinOutcome | null>(null)
  const [joining, startJoin] = useTransition()
  const copy = breakNoticeCopy({ hold, alreadyJoined: alreadyJoined || !!outcome?.joined, creditAed })
  if (!copy) return null

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
    fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
  }
  const line: CSSProperties = { margin: '0 0 14px 0', fontSize: 15, lineHeight: '23px', color: 'rgba(245,238,222,0.82)', textAlign: 'center' }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="season-break-notice-headline"
      data-testid="season-break-notice"
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

        <h1 id="season-break-notice-headline" style={{ margin: '0 0 18px', fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#fdf8ef' }}>
          {copy.headline}
        </h1>
        {copy.lines.map((l) => <p key={l} style={line}>{l}</p>)}
        {copy.joinLine && !outcome?.joined && <p style={{ ...line, color: TIER_POP_TEXT.primary }}>{copy.joinLine}</p>}
        {outcome?.message && <p style={line}>{outcome.message}</p>}
        {outcome?.joined && creditMechanicsLine(outcome.creditAed ?? 0) && (
          <p style={{ ...line, color: TIER_POP_TEXT.muted }}>{creditMechanicsLine(outcome.creditAed ?? 0)}</p>
        )}
        {outcome?.error && <p style={{ ...line, color: '#ffb4a2' }}>{outcome.error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 14 }}>
          {copy.joinLine && !outcome?.joined && (
            <button id="season-break-notice-join" type="button" onClick={handleJoin} disabled={joining} style={pill(true)}>
              {joining ? 'Saving your spot' : 'Save my spot'}
            </button>
          )}
          <button id="season-break-notice-dismiss" type="button" onClick={onDismiss} disabled={joining} style={pill(!(copy.joinLine && !outcome?.joined))}>
            {copy.joinLine && !outcome?.joined ? 'Not now' : 'Got it'}
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
import { SeasonBreakNotice } from './_shared/SeasonBreakNotice'
import { breakNoticeSeenKey } from './_shared/season-break-copy'
```

(b) Directly after Plan B's line `  const showSeasonNotice = seasonNoticeChecked && !seasonNoticeSeen && !!season?.notice && !!activeSubscription`, add:

```tsx
  // The break started (spec N8, N9): once per hold, on the first visit.
  const breakNoticeKey = seasonBreak && seasonBreak.phase === 'break' && seasonBreak.hold.state !== 'ready'
    ? breakNoticeSeenKey(seasonBreak.hold.id)
    : null
  const [breakNoticeChecked, setBreakNoticeChecked] = useState(false)
  const [breakNoticeSeen, setBreakNoticeSeen] = useState(true)
  useEffect(() => {
    try {
      setBreakNoticeSeen(breakNoticeKey == null ? true : !!window.localStorage.getItem(breakNoticeKey))
    } catch {
      setBreakNoticeSeen(true)
    }
    setBreakNoticeChecked(true)
  }, [breakNoticeKey])
  const dismissBreakNotice = () => {
    try {
      if (breakNoticeKey) window.localStorage.setItem(breakNoticeKey, '1')
    } catch { /* storage disabled: treat as seen */ }
    setBreakNoticeSeen(true)
  }
  const showBreakNotice = breakNoticeChecked && !breakNoticeSeen && !!breakNoticeKey
```

(c) Replace Plan B's `  if (showSeasonNotice && season?.notice) {` with:

```tsx
  if (showBreakNotice && seasonBreak) {
    return (
      <SeasonBreakNotice
        hold={seasonBreak.hold}
        alreadyJoined={intakePause.alreadyJoined}
        creditAed={intakePause.creditAed}
        onDismiss={dismissBreakNotice}
      />
    )
  }
  if (showSeasonNotice && season?.notice) {
```

- [ ] **Step 4: Run tests, typecheck, lint, and look**

Run: `npx vitest run src/app/dashboard/_shared`
Expected: PASS.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

Start `npm run dev -- -p 3100`. In a fresh browser profile, at 1280 and 390:
- `/dashboard?preview=1&verified=1&season=held`: "Your meals are kept for next semester.", the three lines with AED 20, one "Got it". Dismiss: home shows the held card. Reload: no notice.
- `/dashboard?preview=1&verified=1&season=paused_break`: "The kitchen is closed between semesters.", "Your Monthly Premium is still paused, and your meals wait for you. Resume when we're back.", "Save your spot for next semester and AED 20 goes to your wallet.", buttons "Save my spot" and "Not now".
- `/dashboard?preview=1&verified=1&season=ready`: no notice, the ready card.
Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/_shared/season-break-copy.ts src/app/dashboard/_shared/season-break-copy.test.ts src/app/dashboard/_shared/SeasonBreakNotice.tsx src/app/dashboard/ClientDashboard.tsx
git commit -m "feat(season): customers hear once, in the app, that their meals are kept or their pause carries over

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 13: The menu shows a held day

**Files:**
- Modify: `src/app/dashboard/_shared/menu-day-status.ts`
- Modify: `src/app/dashboard/_shared/menu-day-status.test.ts`
- Modify: `src/app/dashboard/_shared/menu-reason-chip.ts`
- Modify: `src/app/dashboard/_shared/menu-reason-chip.test.ts`
- Modify: `src/app/dashboard/menu/MenuClient.tsx`
- Modify: `src/app/dashboard/menu/page.tsx`

**Interfaces:**
- Consumes: Task 9 `season_hold_id` on plan rows (read through `select('*')`); Plan A `SeasonPhase`; Plan B `MenuPlan.credited_skip_dates`, the menu preview `state=credited`.
- Produces:
  - `NoDeliveryReason` gains `'season-held'`
  - `MenuPlan.season_hold_id?: string | null`; `MenuDayContext.seasonPhase?: SeasonPhase`
  - `classifyMenuDay` returns `'season-held'` for today and every later day of a plan with `season_hold_id` (past days keep what happened)
  - `noDeliveryNote('season-held', ...)`: during the break "The kitchen is closed between semesters. Your meals are kept for you, so nothing is lost."; after reopening "Your meals are ready. Resume your plan and this dinner comes to you." (Paused) or "Your meals are ready. Pick your start date on your plan page and your dinners begin." (Scheduled)
  - `reasonChip('season-held', …)`: `{ Icon: Moon, label: 'Kept for you', color: PAUSE }`
  - `MenuClient` accepts `seasonPhase?: SeasonPhase` (default `'open'`); `ActiveSubLike.season_hold_id?: string | null`
  - Menu preview `state=season-held` (the break) and `state=season-ready` (reopened)

`classifyMenuDay` is the one rule (another session's): both menu trees and the dish sheet already read it, so no other check is added. `menu-spotlight.ts` reads plan status, not reasons, and is unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/dashboard/_shared/menu-day-status.test.ts`:

```ts
describe('a plan held for next semester (spec §6.3)', () => {
  // TODAY is Thu 17 Sep; TUE and WED are past, FRI and NEXT_MON ahead.
  const held = plan({ status: 'Paused', paused_dates: [TUE, WED], season_hold_id: 'hold-1' })

  it('holds today and every later day, and leaves past days as they were', () => {
    expect(classifyMenuDay(THU, ctx(held, { seasonPhase: 'break' }))).toBe('season-held')
    expect(classifyMenuDay(NEXT_MON, ctx(held, { seasonPhase: 'break' }))).toBe('season-held')
    expect(classifyMenuDay(TUE, ctx(held, { seasonPhase: 'break' }))).toBe('in-pause')
  })

  it('holds a plan that had not started, instead of "starts soon"', () => {
    const scheduled = plan({ status: 'Scheduled', start_date: '2026-09-10', season_hold_id: 'hold-2' })
    expect(classifyMenuDay(FRI, ctx(scheduled, { seasonPhase: 'break' }))).toBe('season-held')
  })

  it('says the meals are kept during the break, and ready after reopening', () => {
    expect(noDeliveryNote('season-held', THU, ctx(held, { seasonPhase: 'break' })))
      .toBe('The kitchen is closed between semesters. Your meals are kept for you, so nothing is lost.')
    expect(noDeliveryNote('season-held', THU, ctx(held, { seasonPhase: 'open' })))
      .toBe('Your meals are ready. Resume your plan and this dinner comes to you.')
    expect(noDeliveryNote('season-held', FRI, ctx(plan({ status: 'Scheduled', season_hold_id: 'hold-2' }), { seasonPhase: 'open' })))
      .toBe('Your meals are ready. Pick your start date on your plan page and your dinners begin.')
  })

  it('promises no next delivery while held, and a plan that is not held is unchanged', () => {
    expect(nextDeliveryIso(ctx(held, { seasonPhase: 'break' }))).toBeNull()
    expect(classifyMenuDay(THU, ctx(plan({ status: 'Paused', paused_dates: [TUE, WED] }), { seasonPhase: 'break' }))).toBe('in-pause')
  })
})
```

Append to `src/app/dashboard/_shared/menu-reason-chip.test.ts`:

```ts
describe('a day held for next semester', () => {
  it('reads "Kept for you" whatever the renew gate', () => {
    expect(reasonChip('season-held', 'season').label).toBe('Kept for you')
    expect(reasonChip('season-held', 'open').label).toBe('Kept for you')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/dashboard/_shared/menu-day-status.test.ts src/app/dashboard/_shared/menu-reason-chip.test.ts`
Expected: FAIL. The held plan still classifies as `in-pause` and `pre-start`; `noDeliveryNote` and `reasonChip` return undefined for `'season-held'`.

- [ ] **Step 3: Write the implementation**

`src/app/dashboard/_shared/menu-day-status.ts`:

(a) Under `import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'` add:

```ts
import type { SeasonPhase } from '@/contexts/season/domain/season-phase'
```

(b) In `interface MenuPlan`, replace Plan B's

```ts
  credited_skip_dates?: string[] | null
```

with

```ts
  credited_skip_dates?: string[] | null
  /** Set while the plan is held for next semester (spec §6.3). */
  season_hold_id?: string | null
```

(c) In `interface MenuDayContext`, replace

```ts
  hasQueuedRenewal: boolean
}
```

with

```ts
  hasQueuedRenewal: boolean
  /** The season phase: a held day reads differently during the break and after reopening. */
  seasonPhase?: SeasonPhase
}
```

(d) In `type NoDeliveryReason`, replace

```ts
  | 'plan-ends'       // a future day after the last dinner, nothing queued — renewing unlocks it
```

with

```ts
  | 'plan-ends'       // a future day after the last dinner, nothing queued — renewing unlocks it
  | 'season-held'     // held for next semester: today and every later day, until the customer restarts
```

(e) In `classifyMenuDay`, replace

```ts
  const pos = dayPosition(iso, todayIso)
```

with

```ts
  const pos = dayPosition(iso, todayIso)

  // Held for next semester (spec §6.3): nothing is cooked from today on until
  // the customer restarts the plan. Past days keep what really happened.
  if (plan.season_hold_id && pos !== 'past') return 'season-held'
```

(f) In `noDeliveryNote`, replace

```ts
    case 'plan-ends':
```

with

```ts
    case 'season-held':
      if (ctx.seasonPhase === 'break') return 'The kitchen is closed between semesters. Your meals are kept for you, so nothing is lost.'
      return p?.status === SUBSCRIPTION_STATUS.SCHEDULED
        ? 'Your meals are ready. Pick your start date on your plan page and your dinners begin.'
        : 'Your meals are ready. Resume your plan and this dinner comes to you.'
    case 'plan-ends':
```

`src/app/dashboard/_shared/menu-reason-chip.ts`: in `reasonChip`, replace

```ts
    case 'plan-ends':      return renewKind === 'season'
```

with

```ts
    case 'season-held':    return { Icon: Moon, label: 'Kept for you', color: PAUSE }
    case 'plan-ends':      return renewKind === 'season'
```

`src/app/dashboard/menu/MenuClient.tsx`:
- Add `import type { SeasonPhase } from '@/contexts/season/domain/season-phase'`.
- In `interface ActiveSubLike`, add (next to Plan B's `credited_skip_dates?: string[] | null`):

```ts
  // Held for next semester (spec §6.3): carried into MenuPlan for the held-day note.
  season_hold_id?: string | null
```

- In the `MenuClient` props, replace `  renewGate = RENEW_OPEN_GATE,` with `  renewGate = RENEW_OPEN_GATE,\n  seasonPhase = 'open',`, and replace

```ts
  renewGate?: { intakePaused: boolean; outOfZone: boolean; profileIncomplete: boolean }
}) {
```

with

```ts
  renewGate?: { intakePaused: boolean; outOfZone: boolean; profileIncomplete: boolean }
  /** The season phase, for the held-day note (spec §6.3). */
  seasonPhase?: SeasonPhase
}) {
```

- Replace `  const dayCtx: MenuDayContext = { plan, todayIso: todayAEIso, weekType, closureDates, hasQueuedRenewal }` with:

```ts
  const dayCtx: MenuDayContext = { plan, todayIso: todayAEIso, weekType, closureDates, hasQueuedRenewal, seasonPhase }
```

`src/app/dashboard/menu/page.tsx`:
- In the harness comment, replace Plan B's `//          | plan-ends | last-day | scheduled | held | resumed | midweek | ended | credited` with `//          | plan-ends | last-day | scheduled | held | resumed | midweek | ended | credited | season-held | season-ready`.
- In the `sub` ternary, add before Plan B's `      : st === 'credited' ? ...` line:

```ts
      // Held for next semester: during the break (season-held) and after reopening (season-ready).
      : st === 'season-held' || st === 'season-ready' ? planRow({ status: 'Paused', paused_dates: [d(-2), d(-1)], season_hold_id: 'preview-hold' })
```

- On the preview `<MenuClient ...>`, replace `          closureDates={params.closure === 'today' ? [d(0), d(1)] : params.closure === '1' ? [d(1), d(2)] : []}` with:

```tsx
          closureDates={params.closure === 'today' ? [d(0), d(1)] : params.closure === '1' ? [d(1), d(2)] : []}
          seasonPhase={st === 'season-held' ? 'break' : 'open'}
```

- On the live `<MenuClient ...>`, replace

```tsx
          profileIncomplete: missingProfileFields(customer).length > 0,
        }}
```

with

```tsx
          profileIncomplete: missingProfileFields(customer).length > 0,
        }}
        seasonPhase={intake.phase}
```

- [ ] **Step 4: Run tests, typecheck, lint, and look**

Run: `npx vitest run src/app/dashboard/_shared`
Expected: PASS.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean (`reasonChip` and `noDeliveryNote` cover every reason again).

Start `npm run dev -- -p 3100`. At 1280 and 390:
- `http://localhost:3100/dashboard/menu?preview=1&state=season-held`: today and every later day are grey with "Kept for you"; open today's dish sheet. Expected note: "The kitchen is closed between semesters. Your meals are kept for you, so nothing is lost." Yesterday still reads "Paused".
- `http://localhost:3100/dashboard/menu?preview=1&state=season-ready`: the same days, note "Your meals are ready. Resume your plan and this dinner comes to you."
Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/_shared/menu-day-status.ts src/app/dashboard/_shared/menu-day-status.test.ts src/app/dashboard/_shared/menu-reason-chip.ts src/app/dashboard/_shared/menu-reason-chip.test.ts src/app/dashboard/menu/MenuClient.tsx src/app/dashboard/menu/page.tsx
git commit -m "feat(season): the menu marks days held for next semester, and says when they are ready

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 14: The break board on the Season page, with Reopen

**Files:**
- Modify (replace whole file): `src/app/admin/season/season-data.ts`
- Modify: `src/app/admin/season/season-data.test.ts`
- Create: `src/app/admin/season/season-break-view.ts`
- Test: `src/app/admin/season/season-break-view.test.ts`
- Create: `src/app/admin/season/BreakBoard.tsx`
- Modify: `src/app/admin/season/SeasonPlanner.tsx`
- Modify: `src/app/dev/season-admin/page.tsx`
- Modify: `scripts/check-season-planner.mjs`

**Interfaces:**
- Consumes: Task 1 `resumeCutoffDate` mapping in `season-data.ts`; Task 7 `reopenSeasonAction`; Plan A `SeasonSnapshot`, `SeasonPlanRow`, `mealValueOf`, `formatAed`, `formatShortDay`, `AdminButton` (passes `id` through), `AdminModal`, `useAdminTheme`.
- Produces:
  - `SeasonPlanRow` gains `seasonHoldId: string | null`
  - `interface SeasonHoldRow { id: string; subscriptionId: string; customerId: string; customerName: string; planName: string; reason: 'season' | 'customer_pause'; state: string; heldMeals: number; mealValueFils: number | null; waitlistCreditId: string | null; waitlistCreditFils: number | null }`
  - `SeasonPageData` gains `cycleStartedAt: string | null`, `reopenTarget: number | null`, `holds: SeasonHoldRow[]` (this season's holds, read only during the break), `savedSpotCustomerIds: string[]`
  - `interface BreakBoardView { heldPlans: SeasonHoldRow[]; customerPauses: Array<SeasonHoldRow & { savedSpot: boolean }>; heldMeals: number; creditsMinted: number; creditsMintedFils: number; readyOnReopen: number; waitlistCount: number; reopenTarget: number | null; cookingDuringBreak: SeasonPlanRow[] }`
  - `breakBoardView(data: SeasonPageData): BreakBoardView`, `holdStateLabel(state: string): string`, `reopenConfirmLines(view: BreakBoardView): string[]`
  - `BreakBoard({ data }: { data: SeasonPageData })`; ids and testids `season-status`, `season-invariant`, `season-held-plans`, `season-customer-pauses`, `season-reopen`, `season-reopen-confirm`
  - Dev fixtures `/dev/season-admin?season=break|break_alert`

Rules (spec §11.3 without refunds): no refund amount, Stripe id, Approve, Decline or Retry (Plan D). The invariant uses the delivery tick's own conditions, never status alone: a plan counts as "set to cook" when it is Active and below its credited cap (`delivered < total − credited × meals per day`). Credits minted counts distinct waitlist credits across every hold of this season.

- [ ] **Step 1: Write the failing tests**

`src/app/admin/season/season-break-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { breakBoardView, holdStateLabel, reopenConfirmLines } from './season-break-view'
import type { SeasonHoldRow, SeasonPageData, SeasonPlanRow } from './season-data'

const plan = (p: Partial<SeasonPlanRow> & Pick<SeasonPlanRow, 'id'>): SeasonPlanRow => ({
  customerId: `c-${p.id}`, planName: 'Monthly Premium', status: 'Paused', startDate: '2026-09-07', endDate: '2026-10-10',
  weekType: '6DAYS', mealsPerDay: 1, totalMeals: 24, deliveredMeals: 15, creditedSkipDays: 0, bufferGrants: 0,
  skippedDates: [], plannedPauseStart: null, staffApproval: null, lastDeliveryTickDate: '2026-10-03', resumeCutoffDate: null,
  customerName: 'Someone', dormName: null, mealValue: null, seasonHoldId: null, ...p,
})

const hold = (h: Partial<SeasonHoldRow> & Pick<SeasonHoldRow, 'id' | 'customerId'>): SeasonHoldRow => ({
  subscriptionId: `s-${h.id}`, customerName: 'Someone', planName: 'Monthly Premium', reason: 'season', state: 'held',
  heldMeals: 9, mealValueFils: null, waitlistCreditId: null, waitlistCreditFils: null, ...h,
})

const data = (over: Partial<SeasonPageData> = {}): SeasonPageData => ({
  snapshot: { phase: 'break', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', bufferDays: 1, salesStopped: true },
  paused: true, salesStoppedAt: '2026-09-02T01:50:11Z', kitchenDailyCostAed: 500, todayAe: '2026-10-07', closureDates: [],
  cycleStartedAt: '2026-09-14T08:00:00Z', reopenTarget: 15,
  plans: [
    plan({ id: 'a', seasonHoldId: 'h-a' }),
    plan({ id: 'g', status: 'Active', deliveredMeals: 5 }),
    plan({ id: 'e', status: 'Active', deliveredMeals: 20, creditedSkipDays: 4 }),
    plan({ id: 's', status: 'Skipped', deliveredMeals: 10 }),
  ],
  holds: [
    hold({ id: 'h-a', customerId: 'c-a', waitlistCreditId: 'cr-1', waitlistCreditFils: 2000 }),
    hold({ id: 'h-b', customerId: 'c-a', heldMeals: 6, planName: 'Weekly Flex', waitlistCreditId: 'cr-1', waitlistCreditFils: 2000 }),
    hold({ id: 'h-c', customerId: 'c-c', reason: 'customer_pause', state: 'paused_by_customer', heldMeals: 14 }),
    hold({ id: 'h-r', customerId: 'c-r', state: 'released', waitlistCreditId: 'cr-9', waitlistCreditFils: 1500 }),
  ],
  savedSpotCustomerIds: ['c-a'],
  ...over,
})

describe('breakBoardView', () => {
  it('lists held plans and customer pauses still open, with who saved a spot', () => {
    const v = breakBoardView(data())
    expect(v.heldPlans.map((h) => h.id)).toEqual(['h-a', 'h-b'])
    expect(v.heldMeals).toBe(15)
    expect(v.customerPauses).toEqual([{ ...data().holds[2], savedSpot: false }])
    expect(v.readyOnReopen).toBe(3)
  })

  it('counts each waitlist credit once, across every hold of the season', () => {
    const v = breakBoardView(data())
    expect(v.creditsMinted).toBe(2)
    expect(v.creditsMintedFils).toBe(3500)
  })

  it('reads the waitlist against the reopen target', () => {
    expect(breakBoardView(data())).toMatchObject({ waitlistCount: 1, reopenTarget: 15 })
  })

  it('flags only plans the delivery tick would cook: Active and below the credited cap', () => {
    expect(breakBoardView(data()).cookingDuringBreak.map((p) => p.id)).toEqual(['g'])
  })
})

describe('labels and confirmation', () => {
  it('names every hold state in plain words', () => {
    expect(holdStateLabel('held')).toBe('Held')
    expect(holdStateLabel('paused_by_customer')).toBe('Paused by customer')
    expect(holdStateLabel('ready')).toBe('Ready')
    expect(holdStateLabel('released')).toBe('Restarted')
    expect(holdStateLabel('refund_requested')).toBe('refund requested')
  })

  it('says what reopening does, promises no message and no refund', () => {
    const lines = reopenConfirmLines(breakBoardView(data()))
    expect(lines).toEqual([
      'Sales open straight away.',
      '3 held plans become ready. Each customer restarts by tapping Resume, or by picking a start date for a plan that had not started. Nothing restarts on its own.',
      'Reopening sends no message to customers yet. Send the reopening broadcast yourself afterwards.',
    ])
    expect(lines.join(' ')).not.toMatch(/refund|[–—]/i)
  })
})
```

In `src/app/admin/season/season-data.test.ts`:
- In `fakeClient`, replace `        in: () => builder,` with `        in: () => builder,\n        eq: () => builder,`.
- Append inside `describe('loadSeasonPageData', ...)`:

```ts
  it('during the break reads this season\'s holds, their credits, and who saved a spot', async () => {
    const data = await loadSeasonPageData('2026-10-07', fakeClient({
      intake_settings: { data: { ...SETTINGS, season_phase: 'break', cycle_started_at: '2026-09-14T08:00:00Z', reopen_target: 15 }, error: null },
      subscriptions: { data: [{ ...SUB, status: 'Paused', season_hold_id: 'h1' }], error: null },
      season_holds: { data: [{ id: 'h1', subscription_id: 's1', customer_id: 'c1', reason: 'season', state: 'held', held_meals: 9, meal_value_fils: null, waitlist_credit_id: 'cr1' }], error: null },
      intake_waitlist: { data: [{ customer_id: 'c1' }], error: null },
      credits: { data: [{ id: 'cr1', amount_aed: '20' }], error: null },
      customers: { data: [{ id: 'c1', name: 'Omar Farouk', dorm_name: 'Academic City' }], error: null },
      orders: { data: [], error: null },
      company_closures: { data: [], error: null },
    }))
    expect(data.cycleStartedAt).toBe('2026-09-14T08:00:00Z')
    expect(data.reopenTarget).toBe(15)
    expect(data.plans[0].seasonHoldId).toBe('h1')
    expect(data.holds).toEqual([{
      id: 'h1', subscriptionId: 's1', customerId: 'c1', customerName: 'Omar Farouk', planName: 'Monthly Premium',
      reason: 'season', state: 'held', heldMeals: 9, mealValueFils: null, waitlistCreditId: 'cr1', waitlistCreditFils: 2000,
    }])
    expect(data.savedSpotCustomerIds).toEqual(['c1'])
  })

  it('reads no holds outside the break', async () => {
    const data = await loadSeasonPageData('2026-09-14', fakeClient({
      intake_settings: { data: SETTINGS, error: null },
      subscriptions: { data: [SUB], error: null },
      season_holds: { data: [{ id: 'h1' }], error: null },
    }))
    expect(data.holds).toEqual([])
    expect(data.savedSpotCustomerIds).toEqual([])
    expect(data.plans[0].seasonHoldId).toBeNull()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/admin/season`
Expected: FAIL. `./season-break-view` cannot be resolved; `holds`, `cycleStartedAt`, `reopenTarget`, `savedSpotCustomerIds` and `seasonHoldId` are undefined.

- [ ] **Step 3: Write the implementation**

`src/app/admin/season/season-data.ts` (replace the whole file):

```ts
import 'server-only'

/**
 * Everything the Season page needs, read live: the planner and wind-down
 * board (spec §11.1, §11.2) and, during the break, the break board (§11.3).
 *
 * Only facts are gathered here. The projection runs in the browser
 * (SeasonPlanner) so the owner can try wrap-up days without a round trip.
 * Any read error throws: a planner built from half the plans would show a
 * last meal that is not the last meal.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import type { SeasonPhase, SeasonSnapshot } from '@/contexts/season/domain/season-phase'
import type { ProjectionPlan, ProjectionStatus } from '@/contexts/season/domain/season-projection'
import { mealValueOf, type MealValue } from '@/contexts/season/domain/meal-value'

export type SeasonDataClient = Pick<ReturnType<typeof createAdminSupabaseClient>, 'from'>

export interface SeasonPlanRow extends ProjectionPlan {
  customerName: string
  dormName: string | null
  mealValue: MealValue
  seasonHoldId: string | null
}

/** One plan held this season (spec §6.3), for the break board. */
export interface SeasonHoldRow {
  id: string
  subscriptionId: string
  customerId: string
  customerName: string
  planName: string
  reason: 'season' | 'customer_pause'
  state: string
  heldMeals: number
  mealValueFils: number | null
  waitlistCreditId: string | null
  waitlistCreditFils: number | null
}

export interface SeasonPageData {
  snapshot: SeasonSnapshot
  /** intake_settings.paused, read separately from the phase/salesStopped snapshot
   *  so the planner can warn when the two disagree (season-phase.ts's
   *  seasonDriftMessage) instead of silently trusting one of them. */
  paused: boolean
  salesStoppedAt: string | null
  kitchenDailyCostAed: number
  todayAe: string
  closureDates: string[]
  plans: SeasonPlanRow[]
  cycleStartedAt: string | null
  reopenTarget: number | null
  /** This season's holds; read only during the break. */
  holds: SeasonHoldRow[]
  /** Customers with a waitlist row this season; read only during the break. */
  savedSpotCustomerIds: string[]
}

const LIVE_STATUSES: ProjectionStatus[] = ['Active', 'Skipped', 'Paused', 'Scheduled']
// .in() with an empty list is a PostgREST syntax error; this id matches nothing.
const NO_ID = '00000000-0000-0000-0000-000000000000'

type SubRow = {
  id: string
  customer_id: string
  plan_name: string
  status: string
  start_date: string
  end_date: string
  week_type: string | null
  meals_per_day: number | null
  total_meals: number
  delivered_meals: number | null
  credited_skip_days: number | null
  season_buffer_grants: number | null
  skipped_dates: string[] | null
  planned_pause_start: string | null
  staff_approval: string | null
  last_delivery_tick_date: string | null
  resume_cutoff_date?: string | null
  season_hold_id?: string | null
}

type OrderRow = {
  subscription_id: string | null
  amount_paid_fils: number | null
  credit_applied_fils: number | null
  meals_count: number | null
  price_per_meal: number | string | null
  created_at: string
}

type HoldRow = {
  id: string
  subscription_id: string
  customer_id: string
  reason: string
  state: string
  held_meals: number | null
  meal_value_fils: number | null
  waitlist_credit_id: string | null
}

export async function loadSeasonPageData(todayAe: string, sb: SeasonDataClient = createAdminSupabaseClient()): Promise<SeasonPageData> {
  const [settingsRes, subsRes, closuresRes] = await Promise.all([
    sb.from('intake_settings')
      .select('season_phase, wrap_up_day, buffer_delivery_days, close_day, sales_stopped_at, kitchen_daily_cost_aed, paused, cycle_started_at, reopen_target')
      .maybeSingle(),
    sb.from('subscriptions')
      .select('id, customer_id, plan_name, status, start_date, end_date, week_type, meals_per_day, total_meals, delivered_meals, credited_skip_days, season_buffer_grants, skipped_dates, planned_pause_start, staff_approval, last_delivery_tick_date, resume_cutoff_date, season_hold_id')
      .in('status', LIVE_STATUSES),
    sb.from('company_closures').select('closure_date').gte('closure_date', todayAe),
  ])
  if (settingsRes.error) throw new Error(`Season settings read failed: ${settingsRes.error.message}`)
  if (subsRes.error) throw new Error(`Season plans read failed: ${subsRes.error.message}`)
  if (closuresRes.error) throw new Error(`Closures read failed: ${closuresRes.error.message}`)

  const settings = (settingsRes.data ?? {}) as Record<string, unknown>
  const phase: SeasonPhase =
    settings.season_phase === 'winding_down' || settings.season_phase === 'break' ? settings.season_phase : 'open'
  const snapshot: SeasonSnapshot = {
    phase,
    wrapUpDay: settings.wrap_up_day == null ? null : String(settings.wrap_up_day),
    closeDay: settings.close_day == null ? null : String(settings.close_day),
    bufferDays: settings.buffer_delivery_days == null ? 1 : Number(settings.buffer_delivery_days),
    salesStopped: settings.sales_stopped_at != null,
  }
  const cycleStartedAt = settings.cycle_started_at == null ? null : String(settings.cycle_started_at)

  // The break board's facts: this season's holds and who saved a spot.
  let holdRows: HoldRow[] = []
  let savedSpotCustomerIds: string[] = []
  if (phase === 'break' && cycleStartedAt) {
    const [holdsRes, waitlistRes] = await Promise.all([
      sb.from('season_holds')
        .select('id, subscription_id, customer_id, reason, state, held_meals, meal_value_fils, waitlist_credit_id')
        .eq('cycle_started_at', cycleStartedAt),
      sb.from('intake_waitlist').select('customer_id').eq('cycle_started_at', cycleStartedAt),
    ])
    if (holdsRes.error) throw new Error(`Season holds read failed: ${holdsRes.error.message}`)
    if (waitlistRes.error) throw new Error(`Season waitlist read failed: ${waitlistRes.error.message}`)
    holdRows = (holdsRes.data ?? []) as HoldRow[]
    savedSpotCustomerIds = [...new Set(((waitlistRes.data ?? []) as Array<{ customer_id: string }>).map((r) => r.customer_id))]
  }

  const subs = (subsRes.data ?? []) as SubRow[]
  const customerIds = [...new Set([...subs.map((r) => r.customer_id), ...holdRows.map((h) => h.customer_id)])]
  const subIds = subs.map((r) => r.id)
  const creditIds = [...new Set(holdRows.map((h) => h.waitlist_credit_id).filter((id): id is string => !!id))]

  const [customersRes, ordersRes, creditsRes] = await Promise.all([
    sb.from('customers').select('id, name, dorm_name').in('id', customerIds.length ? customerIds : [NO_ID]),
    sb.from('orders')
      .select('subscription_id, amount_paid_fils, credit_applied_fils, meals_count, price_per_meal, created_at')
      .in('subscription_id', subIds.length ? subIds : [NO_ID])
      .order('created_at', { ascending: false }),
    creditIds.length
      ? sb.from('credits').select('id, amount_aed').in('id', creditIds)
      : Promise.resolve({ data: [] as Array<{ id: string; amount_aed: number | string }>, error: null }),
  ])
  if (customersRes.error) throw new Error(`Season customers read failed: ${customersRes.error.message}`)
  if (ordersRes.error) throw new Error(`Season orders read failed: ${ordersRes.error.message}`)
  if (creditsRes.error) throw new Error(`Season credits read failed: ${creditsRes.error.message}`)

  const customers = new Map(
    ((customersRes.data ?? []) as Array<{ id: string; name: string | null; dorm_name: string | null }>).map((c) => [c.id, c]),
  )
  // Newest first, so the first order seen for a plan is the one that bought it.
  const orderByPlan = new Map<string, OrderRow>()
  for (const order of (ordersRes.data ?? []) as OrderRow[]) {
    if (order.subscription_id && !orderByPlan.has(order.subscription_id)) orderByPlan.set(order.subscription_id, order)
  }
  const creditFils = new Map(
    ((creditsRes.data ?? []) as Array<{ id: string; amount_aed: number | string }>).map((c) => [c.id, Math.round(Number(c.amount_aed) * 100)]),
  )

  const plans: SeasonPlanRow[] = subs.map((r) => {
    const customer = customers.get(r.customer_id)
    const order = orderByPlan.get(r.id)
    return {
      id: r.id,
      customerId: r.customer_id,
      planName: r.plan_name,
      status: r.status as ProjectionStatus,
      startDate: r.start_date,
      endDate: r.end_date,
      weekType: r.week_type === '5DAYS' ? '5DAYS' : '6DAYS',
      mealsPerDay: r.meals_per_day ?? 1,
      totalMeals: r.total_meals,
      deliveredMeals: r.delivered_meals ?? 0,
      creditedSkipDays: r.credited_skip_days ?? 0,
      bufferGrants: r.season_buffer_grants ?? 0,
      skippedDates: r.skipped_dates ?? [],
      plannedPauseStart: r.planned_pause_start,
      staffApproval: r.staff_approval,
      lastDeliveryTickDate: r.last_delivery_tick_date,
      resumeCutoffDate: r.resume_cutoff_date ?? null,
      customerName: customer?.name?.trim() || 'Unnamed',
      dormName: customer?.dorm_name ?? null,
      mealValue: order
        ? mealValueOf({
            amountPaidFils: order.amount_paid_fils,
            creditAppliedFils: order.credit_applied_fils,
            mealsCount: order.meals_count,
            pricePerMealAed: order.price_per_meal == null ? null : Number(order.price_per_meal),
          })
        : null,
      seasonHoldId: r.season_hold_id ?? null,
    }
  })

  const planNames = new Map(subs.map((r) => [r.id, r.plan_name]))
  const holds: SeasonHoldRow[] = holdRows.map((h) => ({
    id: h.id,
    subscriptionId: h.subscription_id,
    customerId: h.customer_id,
    customerName: customers.get(h.customer_id)?.name?.trim() || 'Unnamed',
    planName: planNames.get(h.subscription_id) ?? 'Plan',
    reason: h.reason === 'customer_pause' ? 'customer_pause' : 'season',
    state: h.state,
    heldMeals: h.held_meals ?? 0,
    mealValueFils: h.meal_value_fils,
    waitlistCreditId: h.waitlist_credit_id,
    waitlistCreditFils: h.waitlist_credit_id ? creditFils.get(h.waitlist_credit_id) ?? null : null,
  }))

  return {
    snapshot,
    paused: settings.paused === true,
    salesStoppedAt: settings.sales_stopped_at == null ? null : String(settings.sales_stopped_at),
    kitchenDailyCostAed: settings.kitchen_daily_cost_aed == null ? 500 : Number(settings.kitchen_daily_cost_aed),
    todayAe,
    closureDates: ((closuresRes.data ?? []) as Array<{ closure_date: string }>).map((r) => r.closure_date),
    plans,
    cycleStartedAt,
    reopenTarget: settings.reopen_target == null ? null : Number(settings.reopen_target),
    holds,
    savedSpotCustomerIds,
  }
}
```

Before replacing the file, compare it with the version on disk: if the current file maps `paused` or anything else differently from the lines above, keep the disk version's behaviour for that field and report it.

`src/app/admin/season/season-break-view.ts`:

```ts
/**
 * The break board's numbers (spec §11.3), pure so vitest covers them.
 * No refund figures: the refund flow is Plan D.
 */

import type { SeasonHoldRow, SeasonPageData, SeasonPlanRow } from './season-data'

export interface BreakBoardView {
  heldPlans: SeasonHoldRow[]
  customerPauses: Array<SeasonHoldRow & { savedSpot: boolean }>
  heldMeals: number
  creditsMinted: number
  creditsMintedFils: number
  readyOnReopen: number
  waitlistCount: number
  reopenTarget: number | null
  /** Active and below the credited cap: the delivery tick would cook them (a G10 breach). */
  cookingDuringBreak: SeasonPlanRow[]
}

const FINISHED = new Set(['released', 'refunded'])

export function breakBoardView(data: SeasonPageData): BreakBoardView {
  const open = data.holds.filter((h) => !FINISHED.has(h.state))
  const heldPlans = open.filter((h) => h.reason === 'season')
  const saved = new Set(data.savedSpotCustomerIds)
  const customerPauses = open
    .filter((h) => h.reason === 'customer_pause')
    .map((h) => ({ ...h, savedSpot: saved.has(h.customerId) }))

  const credits = new Map<string, number>()
  for (const h of data.holds) {
    if (h.waitlistCreditId && h.waitlistCreditFils != null) credits.set(h.waitlistCreditId, h.waitlistCreditFils)
  }

  return {
    heldPlans,
    customerPauses,
    heldMeals: heldPlans.reduce((sum, h) => sum + h.heldMeals, 0),
    creditsMinted: credits.size,
    creditsMintedFils: [...credits.values()].reduce((sum, f) => sum + f, 0),
    readyOnReopen: open.filter((h) => h.state === 'held' || h.state === 'paused_by_customer').length,
    waitlistCount: data.savedSpotCustomerIds.length,
    reopenTarget: data.reopenTarget,
    cookingDuringBreak: data.plans.filter(
      (p) => p.status === 'Active' && p.deliveredMeals < p.totalMeals - p.creditedSkipDays * p.mealsPerDay,
    ),
  }
}

const STATE_LABEL: Record<string, string> = {
  held: 'Held',
  paused_by_customer: 'Paused by customer',
  ready: 'Ready',
  released: 'Restarted',
}

export function holdStateLabel(state: string): string {
  return STATE_LABEL[state] ?? state.replace(/_/g, ' ')
}

export function reopenConfirmLines(view: BreakBoardView): string[] {
  const n = view.readyOnReopen
  return [
    'Sales open straight away.',
    `${n} held ${n === 1 ? 'plan becomes' : 'plans become'} ready. Each customer restarts by tapping Resume, or by picking a start date for a plan that had not started. Nothing restarts on its own.`,
    'Reopening sends no message to customers yet. Send the reopening broadcast yourself afterwards.',
  ]
}
```

`src/app/admin/season/BreakBoard.tsx`:

```tsx
'use client'

/**
 * The break board (spec §11.3), without refunds: Plan D adds the refund
 * amounts and Approve, Decline and Retry.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarClock, CheckCircle2, Play } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminButton } from '../_components/AdminButton'
import type { AdminTokens } from '@/ui-system/tokens/admin-theme'
import { formatAed } from '@/contexts/season/domain/meal-value'
import { formatShortDay } from '@/contexts/season/domain/season-dates'
import { reopenSeasonAction } from './actions'
import { breakBoardView, holdStateLabel, reopenConfirmLines } from './season-break-view'
import type { SeasonHoldRow, SeasonPageData } from './season-data'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function BreakBoard({ data }: { data: SeasonPageData }) {
  const { t } = useAdminTheme()
  const router = useRouter()
  const view = useMemo(() => breakBoardView(data), [data])
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reopen() {
    setError(null)
    startTransition(async () => {
      const result = await reopenSeasonAction()
      if ('error' in result) { setError(result.error); return }
      setConfirming(false)
      router.refresh()
    })
  }

  const lastKitchenDay = data.snapshot.closeDay ? formatShortDay(data.snapshot.closeDay) : null
  const cooking = view.cookingDuringBreak

  return (
    <div className={`mt-6 rounded-xl border p-5 ${t.card}`}>
      <div data-testid="season-status" className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${t.dangerBg} ${t.danger}`}>
        <CalendarClock size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" />
        <div>
          <div className="text-[14px] font-black">On the break</div>
          <div className={`text-[12px] font-medium mt-0.5 max-w-[72ch] ${t.body}`}>
            {lastKitchenDay ? `The last kitchen day was ${lastKitchenDay}. ` : ''}No sales and no cooking until you reopen. Held plans restart only when their customers tap Resume or pick a start date.
          </div>
        </div>
      </div>

      <div
        data-testid="season-invariant"
        role={cooking.length > 0 ? 'alert' : 'status'}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl border mt-3 ${cooking.length > 0 ? `${t.dangerBg} ${t.danger}` : `${t.successBg} ${t.success}`}`}
      >
        {cooking.length > 0
          ? <AlertTriangle size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" />
          : <CheckCircle2 size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" />}
        <div className="text-[12px] font-semibold max-w-[72ch]">
          {cooking.length === 0
            ? 'Kitchen halt holding: no plan is set to cook during the break.'
            : `${plural(cooking.length, 'plan is', 'plans are')} Active during the break and would cook: ${cooking.map((p) => `${p.customerName} (${p.planName})`).join(', ')}. Pause each one from its customer page.`}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        <Fact t={t} label="Held for next semester" value={String(view.heldPlans.length)} detail={plural(view.heldMeals, 'meal', 'meals')} />
        <Fact t={t} label="Waitlist credit added" value={String(view.creditsMinted)} detail={formatAed(view.creditsMintedFils)} />
        <Fact
          t={t}
          label="Waitlist"
          value={String(view.waitlistCount)}
          detail={view.reopenTarget != null ? `Reopen target ${view.reopenTarget}` : 'No reopen target set'}
        />
      </div>

      <div className="mt-5">
        <div className={`text-[11px] font-black uppercase tracking-[0.1em] mb-2 ${t.muted}`}>Held plans</div>
        <HoldsTable
          testId="season-held-plans"
          rows={view.heldPlans}
          empty="No plan is held."
          columns={['Customer', 'Plan', 'Meals held', 'Meal value', 'State', 'Waitlist credit']}
          cells={(h) => [
            h.planName,
            plural(h.heldMeals, 'meal', 'meals'),
            h.mealValueFils != null ? formatAed(h.mealValueFils) : 'Not recorded',
            holdStateLabel(h.state),
            h.waitlistCreditFils != null ? formatAed(h.waitlistCreditFils) : 'None',
          ]}
          t={t}
        />
      </div>

      <div className="mt-5">
        <div className={`text-[11px] font-black uppercase tracking-[0.1em] mb-2 ${t.muted}`}>Customer pauses</div>
        <HoldsTable
          testId="season-customer-pauses"
          rows={view.customerPauses}
          empty="No customer pause carried over."
          columns={['Customer', 'Plan', 'Meals', 'State', 'Saved a spot']}
          cells={(h) => [
            h.planName,
            plural(h.heldMeals, 'meal', 'meals'),
            holdStateLabel(h.state),
            (h as SeasonHoldRow & { savedSpot: boolean }).savedSpot ? 'Yes' : 'No',
          ]}
          t={t}
        />
      </div>

      <div className={`mt-5 pt-4 border-t flex items-center gap-3 flex-wrap ${t.border}`}>
        <AdminButton id="season-reopen" icon={<Play size={14} strokeWidth={2.5} />} onClick={() => { setError(null); setConfirming(true) }} disabled={pending}>
          Reopen
        </AdminButton>
        <span className={`text-[12px] font-medium ${t.muted}`}>
          {plural(view.readyOnReopen, 'plan becomes', 'plans become')} ready when you reopen.
        </span>
      </div>
      {error && !confirming && <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{error}</p>}

      {confirming && (
        <AdminModal label="Reopen for the new semester?" maxW="max-w-[500px]" onBackdrop={() => { if (!pending) setConfirming(false) }}>
          <div className={`px-5 py-4 border-b ${t.border}`}>
            <div className={`text-[15px] font-black ${t.heading}`}>Reopen for the new semester?</div>
          </div>
          <div className="px-5 py-4 flex flex-col gap-2">
            {reopenConfirmLines(view).map((line) => (
              <p key={line} className={`text-[13px] font-medium leading-relaxed ${t.body}`}>{line}</p>
            ))}
            {error && <p className={`text-[12px] font-bold ${t.danger}`}>{error}</p>}
          </div>
          <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
            <AdminButton variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>Cancel</AdminButton>
            <AdminButton id="season-reopen-confirm" onClick={reopen} loading={pending}>Yes, reopen</AdminButton>
          </div>
        </AdminModal>
      )}
    </div>
  )
}

function Fact({ label, value, detail, t }: { label: string; value: string; detail: string; t: AdminTokens }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${t.border}`}>
      <div className={`text-[10px] font-black uppercase tracking-[0.1em] ${t.muted}`}>{label}</div>
      <div className={`text-[20px] font-black mt-1 tabular-nums ${t.heading}`}>{value}</div>
      <div className={`text-[12px] font-medium mt-0.5 ${t.muted}`}>{detail}</div>
    </div>
  )
}

function HoldsTable({ testId, rows, empty, columns, cells, t }: {
  testId: string
  rows: SeasonHoldRow[]
  empty: string
  columns: string[]
  cells: (h: SeasonHoldRow) => string[]
  t: AdminTokens
}) {
  if (rows.length === 0) {
    return <p data-testid={testId} className={`text-[13px] font-medium ${t.muted}`}>{empty}</p>
  }
  return (
    <div data-testid={testId} className={`rounded-xl border overflow-x-auto ${t.border}`}>
      <table className="w-full text-[12px]">
        <thead className={t.tableHeader}>
          <tr>
            {columns.map((h) => (
              <th key={h} className="text-left font-black uppercase tracking-[0.06em] text-[10px] px-3 py-2 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id} className={t.tableRow}>
              <td className={`px-3 py-2 font-bold ${t.heading}`}>{h.customerName}</td>
              {cells(h).map((c, i) => (
                <td key={i} className={`px-3 py-2 whitespace-nowrap tabular-nums ${t.body}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

`src/app/admin/season/SeasonPlanner.tsx`:
- Add `import { BreakBoard } from './BreakBoard'` under `import { AdminButton } from '../_components/AdminButton'`.
- Replace

```tsx
    const copy = confirm ? confirmCopy(confirm, { wrap: wrapDraft, buffer: bufferDraft, snapshot, view, endTodayView, books }) : null
```

with

```tsx
    const copy = confirm ? confirmCopy(confirm, { wrap: wrapDraft, buffer: bufferDraft, snapshot, view, endTodayView, books }) : null

    // Spec §11.3: during the break the page is the break board. Every hook
    // above has already run, so this early return keeps the hook order stable.
    if (snapshot.phase === 'break') return <BreakBoard data={data} />
```

`src/app/dev/season-admin/page.tsx`:
- Replace the header line `//   ?season=open|stopped|scheduled|stopped_scheduled|passed|drift   season planner state (default stopped)` with `//   ?season=open|stopped|scheduled|stopped_scheduled|passed|drift|break|break_alert   season planner state (default stopped)`.
- Replace `import type { SeasonPageData, SeasonPlanRow } from '@/app/admin/season/season-data'` with `import type { SeasonHoldRow, SeasonPageData, SeasonPlanRow } from '@/app/admin/season/season-data'`.
- In `fixturePlan`, replace `    lastDeliveryTickDate: '2026-09-12', dormName: 'Academic City', mealValue: { fils: 1800, exact: false },` with `    lastDeliveryTickDate: '2026-09-12', dormName: 'Academic City', mealValue: { fils: 1800, exact: false }, seasonHoldId: null,`.
- In `FIXTURE_SNAPSHOTS`, replace `  passed: { phase: 'winding_down', wrapUpDay: '2026-09-12', closeDay: '2026-09-14', bufferDays: 1, salesStopped: true },` with:

```ts
  passed: { phase: 'winding_down', wrapUpDay: '2026-09-12', closeDay: '2026-09-14', bufferDays: 1, salesStopped: true },
  break: { phase: 'break', wrapUpDay: '2026-09-30', closeDay: '2026-10-01', bufferDays: 1, salesStopped: true },
```

- Directly above `function fixtureSeason`, add:

```ts
// The break (spec §11.3): a paid plan held with its credit, a queued Weekly
// held with it, a customer pause that has not saved a spot, and a staff
// renewal left pending. break_alert adds a plan still Active, the G10 breach.
const BREAK_KEYS = new Set(['break', 'break_alert'])

const FIXTURE_BREAK_PLANS: SeasonPlanRow[] = [
  fixturePlan({ id: 'a', customerName: 'Omar Farouk', planName: 'Monthly Premium', status: 'Paused', startDate: '2026-09-07', endDate: '2026-10-10', deliveredMeals: 15, seasonHoldId: 'h-a', mealValue: { fils: 1800, exact: true } }),
  fixturePlan({ id: 'd', customerName: 'Omar Farouk', planName: 'Weekly Flex', status: 'Scheduled', startDate: '2026-10-12', endDate: '2026-10-17', totalMeals: 6, lastDeliveryTickDate: null, seasonHoldId: 'h-d', mealValue: { fils: 1900, exact: false } }),
  fixturePlan({ id: 'c', customerName: 'Priya Nair', planName: 'Monthly Premium', status: 'Paused', startDate: '2026-08-24', endDate: '2026-10-20', deliveredMeals: 10, lastDeliveryTickDate: '2026-09-05', seasonHoldId: 'h-c' }),
  fixturePlan({ id: 'f', customerName: 'Layla Haddad', planName: 'Staff Monthly', status: 'Scheduled', startDate: '2026-10-05', endDate: '2026-10-30', staffApproval: 'pending', lastDeliveryTickDate: null, mealValue: null }),
]

const FIXTURE_BREAK_ALERT_PLAN = fixturePlan({ id: 'g', customerName: 'Chen Wei', planName: 'Monthly Premium', status: 'Active', startDate: '2026-09-07', endDate: '2026-10-02', deliveredMeals: 18, mealValue: null })

const FIXTURE_HOLDS: SeasonHoldRow[] = [
  { id: 'h-a', subscriptionId: 'a', customerId: 'c-a', customerName: 'Omar Farouk', planName: 'Monthly Premium', reason: 'season', state: 'held', heldMeals: 9, mealValueFils: 1800, waitlistCreditId: 'cr-a', waitlistCreditFils: 2000 },
  { id: 'h-d', subscriptionId: 'd', customerId: 'c-a', customerName: 'Omar Farouk', planName: 'Weekly Flex', reason: 'season', state: 'held', heldMeals: 6, mealValueFils: null, waitlistCreditId: 'cr-a', waitlistCreditFils: 2000 },
  { id: 'h-c', subscriptionId: 'c', customerId: 'c-c', customerName: 'Priya Nair', planName: 'Monthly Premium', reason: 'customer_pause', state: 'paused_by_customer', heldMeals: 14, mealValueFils: null, waitlistCreditId: null, waitlistCreditFils: null },
]
```

- Replace the whole `fixtureSeason` function with:

```ts
function fixtureSeason(key: string | undefined): SeasonPageData {
  const resolvedKey = key ?? 'stopped'
  const onBreak = BREAK_KEYS.has(resolvedKey)
  const snapshotKey = resolvedKey === DRIFT_KEY ? 'stopped' : onBreak ? 'break' : resolvedKey
  const snapshot = FIXTURE_SNAPSHOTS[snapshotKey] ?? FIXTURE_SNAPSHOTS.stopped
  const paused = resolvedKey === DRIFT_KEY ? false : snapshot.salesStopped
  return {
    snapshot,
    paused,
    salesStoppedAt: snapshot.salesStopped ? '2026-09-02T01:50:11Z' : null,
    kitchenDailyCostAed: 500,
    todayAe: onBreak ? '2026-10-07' : FIXTURE_TODAY,
    closureDates: onBreak ? [] : ['2026-09-16'],
    plans: onBreak
      ? (resolvedKey === 'break_alert' ? [...FIXTURE_BREAK_PLANS, FIXTURE_BREAK_ALERT_PLAN] : FIXTURE_BREAK_PLANS)
      : FIXTURE_PLANS,
    cycleStartedAt: '2026-09-14T08:00:00Z',
    reopenTarget: 15,
    holds: onBreak ? FIXTURE_HOLDS : [],
    savedSpotCustomerIds: onBreak ? ['c-a'] : [],
  }
}
```

`scripts/check-season-planner.mjs`:
- In `EXPECT`, after the `drift` entry, add:

```js
  // The break board (plan C): only Reopen, and the kitchen-halt invariant.
  break: { title: 'On the break', controls: ['Reopen'], absent: ['Schedule', 'Save new dates', 'Stop sales now', 'Resume sales', 'Clear the wrap-up day', 'End the season today'], invariant: 'Kitchen halt holding' },
  break_alert: { title: 'On the break', controls: ['Reopen'], absent: ['Schedule', 'Save new dates', 'Stop sales now', 'Resume sales', 'Clear the wrap-up day', 'End the season today'], invariant: 'Active during the break' },
```

- Replace

```js
        if (!bodyLower.includes('last meal on the books')) failures.push(`${label}: missing "Last meal on the books"`)
        if (!bodyLower.includes('kitchen calendar')) failures.push(`${label}: missing the kitchen calendar`)
```

with

```js
        if (expect.invariant) {
          // The break board has no planner: it shows holds and the invariant.
          for (const id of ['season-invariant', 'season-held-plans', 'season-customer-pauses']) {
            if (await page.getByTestId(id).count() === 0) failures.push(`${label}: missing ${id}`)
          }
          const invariantText = await page.getByTestId('season-invariant').innerText().catch(() => '')
          if (!invariantText.includes(expect.invariant)) failures.push(`${label}: invariant reads "${invariantText}", expected "${expect.invariant}"`)
          if (/refund/i.test(body)) failures.push(`${label}: the break board mentions a refund`)
        } else {
          if (!bodyLower.includes('last meal on the books')) failures.push(`${label}: missing "Last meal on the books"`)
          if (!bodyLower.includes('kitchen calendar')) failures.push(`${label}: missing the kitchen calendar`)
        }
```

- [ ] **Step 4: Run tests, typecheck, lint, and the rendered check**

Run: `npx vitest run src/app/admin/season`
Expected: PASS.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean. `scripts/check-season-data.ts` still compiles (it reads only existing fields).

Start `npm run dev -- -p 3100` and wait until `http://localhost:3100/dev/season-admin` answers 200.
Run: `BASE_URL=http://localhost:3100 SHOT_DIR=<an existing scratch directory> npm run check:season-planner`
Expected: `check-season-planner: 16 renders OK`. Open `season-break-1280.png`: Omar Farouk's two held plans (9 meals at AED 18, "Not recorded" for the Weekly), Priya Nair under customer pauses with "No" saved, "1" credit added for AED 20, "Waitlist 1, Reopen target 15", the green invariant. `season-break_alert-1280.png`: the red invariant naming Chen Wei. At `/dev/season-admin?season=break` click Reopen: the modal shows the three lines from `reopenConfirmLines` and "Yes, reopen" (do not confirm; the dev page has no admin session). Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/season/season-data.ts src/app/admin/season/season-data.test.ts src/app/admin/season/season-break-view.ts src/app/admin/season/season-break-view.test.ts src/app/admin/season/BreakBoard.tsx src/app/admin/season/SeasonPlanner.tsx src/app/dev/season-admin/page.tsx scripts/check-season-planner.mjs
git commit -m "feat(season): the Season page becomes a break board: holds, pauses, credit, waitlist, the kitchen halt and Reopen

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 15: The break goes live (cron switch and the release flag, in one change)

**Files:**
- Create: `supabase/migrations/20260916_season_break_cron.sql`
- Modify: `src/app/admin/_components/cron-registry.ts`
- Modify: `src/contexts/season/domain/season-release.ts`
- Test: `src/contexts/season/domain/season-release.test.ts` (create)
- Modify: `src/app/admin/season/SeasonPlanner.tsx`
- Modify: `src/app/dev/season-admin/page.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `scripts/check-season-planner.mjs`
- Modify: `scripts/check-season-customer.mjs` (Plan B)

**Interfaces:**
- Consumes: Task 5 `season_break_tick`, `season_invariants_tick`; every earlier Plan C task; Plan A `visibleSeasonActions`; Plan B `seasonBreakLive` preview knob and `check-season-customer.mjs` states.
- Produces:
  - Live cron: `intake_scheduled_pause_00_15_ae` unscheduled; `season_break_tick` at `15,45 20 * * *` (00:15 and 00:45 AE); `season_break_tick_last_retry` at `15 21 * * *` (01:15 AE); `season_invariants_tick` at `30 * * * *` (hourly; 21:30 UTC is 01:30 AE)
  - `JOB_INFO` entries for the three jobs
  - `SEASON_BREAK_RELEASE_LIVE = true`
  - Planner copy: every "refund" gated on `SEASON_REFUNDS_LIVE`; the end-today confirmation names the plans to be held and says skips after today become credit
  - Preview knob `&release=0` on `/dashboard?preview=1` (word the season copy as if the break were not live)

**Why the flip happens here, and why it is safe.** `SEASON_BREAK_RELEASE_LIVE` gates promises only the break can keep: "End the season today", the planner's "kept for next semester" wording, Plan B's pause line and N3 ("your plan waits for you until we're back"), and the §7.4 split sheet. This task is the change that makes the break real, because the cron switch is what starts `season_begin_break` the night after K. Before it, nothing holds a plan, so the flag must stay off; after it, holds are real, so the wording must be live. Both land together: the migration is applied on the day this branch deploys, immediately before the deploy (Deploy order). It is safe at that point because every guard the promise leans on is already live or in the same deploy: G1, G4, G6 (Task 3), G2, G3 (Task 4), begin-break and the invariants (Task 5), reopen and release (Task 6) in SQL; G5 (Task 8), G9 (Task 9), the held card, sheets, notices, menu and break board (Tasks 10 to 14) in the deploy. In the few minutes between the migration and the deploy no break can start unless K has already passed, and the Deploy order forbids applying it that late.

- [ ] **Step 1: Confirm the live starting point**

```sql
select jobname, schedule, active from cron.job
where jobname in ('intake_scheduled_pause_00_15_ae','season_break_tick','season_break_tick_last_retry','season_invariants_tick')
order by 1;
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in ('season_begin_break','season_break_tick','season_invariants_tick','season_reopen','season_release_hold','_season_project_plan','_subscriptions_season_guard','_subscriptions_season_arrival')
order by 1;
select season_phase, wrap_up_day, close_day, public.ae_today() as today from public.intake_settings;
```

Expected: only `intake_scheduled_pause_00_15_ae` (`15 20 * * *`, active); all eight functions; and, if a wrap-up day is set, `close_day` is today or later. If `close_day` is already before today, stop: the break is overdue, and the owner decides whether to start it (run the migration and then `select public.season_break_tick();`) or to clear and reschedule first.

- [ ] **Step 2: Write the failing tests**

`src/contexts/season/domain/season-release.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SEASON_BREAK_RELEASE_LIVE, SEASON_REFUNDS_LIVE } from './season-release'
import { getJobInfo } from '@/app/admin/_components/cron-registry'

const ROOT = resolve(__dirname, '../../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('season release flags', () => {
  it('the break is live, refunds are not (spec D6, Plan D)', () => {
    expect(SEASON_BREAK_RELEASE_LIVE).toBe(true)
    expect(SEASON_REFUNDS_LIVE).toBe(false)
  })

  it('every season surface that words a refund is gated on SEASON_REFUNDS_LIVE', () => {
    const files = [
      'src/app/admin/season/SeasonPlanner.tsx',
      'src/app/admin/season/BreakBoard.tsx',
      'src/app/admin/season/season-break-view.ts',
      'src/app/dashboard/_shared/season-break-copy.ts',
      'src/app/dashboard/_shared/HeldPlanCard.tsx',
      'src/app/dashboard/_shared/SeasonBreakNotice.tsx',
      'src/app/dashboard/_shared/SeasonSplitSheet.tsx',
      'src/app/dashboard/_shared/BreakResumeSheet.tsx',
    ]
    for (const file of files) {
      const code = withoutComments(read(file))
      if (/refund/i.test(code)) expect(code, file).toMatch(/SEASON_REFUNDS_LIVE|refundsLive/)
    }
  })

  it('the Scheduled Jobs page knows the break jobs', () => {
    expect(getJobInfo('season_break_tick').group).toBe('engine')
    expect(getJobInfo('season_break_tick_last_retry').group).toBe('engine')
    expect(getJobInfo('season_invariants_tick').group).toBe('watchdog')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/contexts/season/domain/season-release.test.ts`
Expected: FAIL. `SEASON_BREAK_RELEASE_LIVE` is `false`; `SeasonPlanner.tsx` says "refund" without `SEASON_REFUNDS_LIVE`; the three jobs fall back to the `other` group.

- [ ] **Step 4: Write the migration file (do not apply yet)**

`supabase/migrations/20260916_season_break_cron.sql`:

```sql
-- ============================================================================
-- Season wind-down, plan C: the break goes live (spec
-- docs/superpowers/specs/2026-09-14-season-wind-down-design.md §8, §11.6,
-- §13.1 item 11). season_break_tick replaces intake_scheduled_pause_tick at
-- 00:15 AE (it keeps both of that tick's paths), retries at 00:45 and 01:15 AE,
-- and season_invariants_tick runs hourly (01:30 AE is 21:30 UTC).
--
-- Applied on the day plan C deploys, immediately before the deploy, and never
-- after the close day. Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz)
-- through the Supabase connector as migration `season_break_cron`. This file
-- is the mirror.
-- ============================================================================

BEGIN;

SELECT cron.unschedule('intake_scheduled_pause_00_15_ae');
SELECT cron.schedule('season_break_tick', '15,45 20 * * *', 'SELECT public.season_break_tick();');
SELECT cron.schedule('season_break_tick_last_retry', '15 21 * * *', 'SELECT public.season_break_tick();');
SELECT cron.schedule('season_invariants_tick', '30 * * * *', 'SELECT public.season_invariants_tick();');

COMMIT;
```

- [ ] **Step 5: Write the implementation**

`src/contexts/season/domain/season-release.ts`: replace `export const SEASON_BREAK_RELEASE_LIVE = false` with `export const SEASON_BREAK_RELEASE_LIVE = true`, and replace its doc comment's last sentence `Plan C flips this to true in the same change that deploys the break.` with `Plan C turned this on together with the cron job that starts the break (migration season_break_cron).`

`src/app/admin/_components/cron-registry.ts`: in `JOB_INFO`, replace

```ts
        actionHref: '/admin/holidays',
        actionLabel: 'Open Holidays',
    },
```

(the end of the `subscription_closure_tick` entry) with

```ts
        actionHref: '/admin/holidays',
        actionLabel: 'Open Holidays',
    },
    season_break_tick: {
        label: 'Semester break starter (00:15 and 00:45)',
        does: 'Starts the semester break the night after the close day: keeps every plan with meals left for next semester and closes the kitchen.',
        impact: 'The break has not started, so plans with meals left could restart and cook',
        group: 'engine',
        actionHref: '/admin/season',
        actionLabel: 'Open Season',
    },
    season_break_tick_last_retry: {
        label: 'Semester break starter, last try (01:15)',
        does: 'Tries once more to start the semester break if the earlier runs did not.',
        impact: 'The break has not started, so plans with meals left could restart and cook',
        group: 'engine',
        actionHref: '/admin/season',
        actionLabel: 'Open Season',
    },
    season_invariants_tick: {
        label: 'Semester break watchdog (hourly)',
        does: 'Pings you when a plan is set to cook during the break, or the break has not started by 01:30 after the close day.',
        impact: 'A plan cooking during the break, or a break that never started, could go unnoticed',
        group: 'watchdog',
        actionHref: '/admin/season',
        actionLabel: 'Open Season',
    },
```

`src/app/admin/season/SeasonPlanner.tsx`:

(a) Replace `import { SEASON_BREAK_RELEASE_LIVE } from '@/contexts/season/domain/season-release'` with `import { SEASON_BREAK_RELEASE_LIVE, SEASON_REFUNDS_LIVE } from '@/contexts/season/domain/season-release'`.

(b) Replace

```ts
                        ? `${plural(summary.mealsAfterWrapUp, 'meal is', 'meals are')} left after the wrap-up day: ${exposureText(c.view)} to keep for next semester or refund.`
```

with

```ts
                        ? `${plural(summary.mealsAfterWrapUp, 'meal is', 'meals are')} left after the wrap-up day: ${exposureText(c.view)} kept for next semester${SEASON_REFUNDS_LIVE ? ' or refunded' : ''}.`
```

(c) In `confirmCopy`'s parameter type replace `c: { wrap: string; buffer: number; snapshot: SeasonSnapshot; view: SeasonView; endTodayView: SeasonView; books: SeasonView },` with `c: { wrap: string; buffer: number; snapshot: SeasonSnapshot; view: SeasonView; endTodayView: SeasonView; books: SeasonView; plans: readonly SeasonPlanRow[] },`.

(d) Replace the end-today `body` array

```ts
        body: [
            'Tonight is the last kitchen night, and sales stop now.',
            e.mealsAfterWrapUp > 0
                ? `${plural(heldPlans, 'plan still has', 'plans still have')} ${plural(e.mealsAfterWrapUp, 'meal', 'meals')} after today: ${exposureText(c.endTodayView)} to keep or refund.`
                : 'No plan has meals after today.',
            `Type ${END_TODAY_PHRASE} to confirm.`,
        ],
```

with

```ts
        body: [
            'Tonight is the last kitchen night, and sales stop now. The break starts at 00:15.',
            e.mealsAfterWrapUp > 0
                ? `${plural(heldPlans, 'plan still has', 'plans still have')} ${plural(e.mealsAfterWrapUp, 'meal', 'meals')} after today: ${exposureText(c.endTodayView)} kept for next semester${SEASON_REFUNDS_LIVE ? ' or refunded' : ''}.`
                : 'No plan has meals after today.',
            ...(heldNames.length > 0 ? [`Kept for next semester: ${heldNames.join(', ')}.`] : []),
            'Skips whose make-up day would fall after today become wallet credit.',
            `Type ${END_TODAY_PHRASE} to confirm.`,
        ],
```

and directly above `    return {` of that end-today branch (after `const heldPlans = e.byDisposition.runs_past + e.byDisposition.starts_after`), add:

```ts
    const heldNames = c.plans
        .filter((p) => {
            const d = c.endTodayView.projections.get(p.id)?.disposition
            return d === 'runs_past' || d === 'starts_after'
        })
        .map((p) => `${p.customerName} (${p.planName})`)
```

(e) Replace `    const copy = confirm ? confirmCopy(confirm, { wrap: wrapDraft, buffer: bufferDraft, snapshot, view, endTodayView, books }) : null` with:

```ts
    const copy = confirm ? confirmCopy(confirm, { wrap: wrapDraft, buffer: bufferDraft, snapshot, view, endTodayView, books, plans: data.plans }) : null
```

(f) Replace

```ts
                            ? `${exposureText(view)}${SEASON_BREAK_RELEASE_LIVE ? ' to keep or refund' : ' still delivering for now'}`
```

with

```ts
                            ? `${exposureText(view)}${SEASON_BREAK_RELEASE_LIVE ? (SEASON_REFUNDS_LIVE ? ' to keep or refund' : ' kept for next semester') : ' still delivering for now'}`
```

`src/app/dev/season-admin/page.tsx`: replace

```ts
  // Wrap-up day already behind today: only Clear should remain (no move, no
  // stop/resume sales, and end_today is hidden by SEASON_BREAK_RELEASE_LIVE).
```

with

```ts
  // Wrap-up day already behind today: Clear and End the season today remain
  // (no move, no stop or resume sales).
```

`src/app/dashboard/page.tsx`:
- Replace Plan B's harness line `        //   &release=1        — word the pause line and notices as if the break were live` with:

```ts
        //   &release=1 / &release=0 — word the season copy as if the break were live / not live
```

- Replace `seasonBreakLive={params.release === '1' ? true : undefined}` with `seasonBreakLive={params.release === '1' ? true : params.release === '0' ? false : undefined}`.

`scripts/check-season-customer.mjs` (Plan B): in the `n3-interim` state replace `url: '/dashboard?preview=1&verified=1&sub=paused&season=paused&paused=1&joined=0'` with `url: '/dashboard?preview=1&verified=1&sub=paused&season=paused&paused=1&joined=0&release=0'`.

`scripts/check-season-planner.mjs`:
- Replace the two comment lines above `const EXPECT = {` (`// end_today never appears: SEASON_BREAK_RELEASE_LIVE is false until Plan C` and `// ships the break tick, so visibleSeasonActions() always hides that button.`) with `// End the season today shows wherever allowedSeasonActions offers it: the break is live (plan C).`
- Replace the six planner entries with:

```js
  open: { title: 'Open', controls: ['Schedule', 'Stop sales now', 'End the season today'], absent: ['Resume sales', 'Clear the wrap-up day'] },
  stopped: { title: 'Sales stopped, no wrap-up day', controls: ['Schedule', 'Resume sales and end the season', 'End the season today'], absent: ['Stop sales now', 'Clear the wrap-up day'] },
  scheduled: { title: 'Winding down to Wed 30 Sep', controls: ['Save new dates', 'Stop sales now', 'Clear the wrap-up day', 'End the season today'], absent: ['Resume sales'] },
  stopped_scheduled: { title: 'Winding down to Wed 30 Sep', controls: ['Save new dates', 'Resume sales', 'Clear the wrap-up day', 'End the season today'], absent: ['Stop sales now'] },
  // Wrap-up day already behind today: Clear and End the season today survive allowedSeasonActions.
  passed: { title: 'Winding down to Sat 12 Sep', controls: ['Clear the wrap-up day', 'End the season today'], absent: ['Schedule', 'Save new dates', 'Stop sales now', 'Resume sales', 'Resume sales and end the season'] },
  // Same snapshot as `stopped`; only intake_settings.paused disagrees, which
  // is what should light up the season-drift banner.
  drift: { title: 'Sales stopped, no wrap-up day', controls: ['Schedule', 'Resume sales and end the season', 'End the season today'], absent: ['Stop sales now', 'Clear the wrap-up day'] },
```

(replacing from the line starting `  open: {` through the line starting `  drift: {`, including the two comments between them; the `break` and `break_alert` entries from Task 14 stay).

- [ ] **Step 6: Run the tests, typecheck, lint and both rendered checks**

Run: `npx vitest run`
Expected: every test passes, including the new release test and Plan B's copy tests (they pass `breakLive` explicitly).
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

Start `npm run dev -- -p 3100` and wait for `http://localhost:3100/dashboard?preview=1` to answer 200.
Run: `BASE_URL=http://localhost:3100 npm run check:season-planner`
Expected: `check-season-planner: 16 renders OK`. At `/dev/season-admin?season=scheduled`, open "End the season today": the confirmation names the plans kept for next semester, says skips after today become credit, and has no "refund".
Run: `BASE_URL=http://localhost:3100 npm run check:season-customer`
Expected: `check-season-customer: 12 renders OK` (Plan B's states, `n3-interim` now with `&release=0`). Stop the server.

- [ ] **Step 7: Commit (the migration is applied in Step 8, on deploy day)**

```bash
git add supabase/migrations/20260916_season_break_cron.sql src/app/admin/_components/cron-registry.ts src/contexts/season/domain/season-release.ts src/contexts/season/domain/season-release.test.ts src/app/admin/season/SeasonPlanner.tsx src/app/dev/season-admin/page.tsx src/app/dashboard/page.tsx scripts/check-season-planner.mjs scripts/check-season-customer.mjs
git commit -m "feat(season): the break goes live: the break tick replaces the scheduled pause, and the copy stops hedging

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: On deploy day, apply the cron switch, then deploy**

After the final review (Task 16) and the merge, and before `git push origin main:Production`: re-run Step 1's queries (the close day must still be today or later), then use `apply_migration`, name `season_break_cron`, with the file content without `BEGIN;` / `COMMIT;`.

```sql
select jobname, schedule, command, active from cron.job
where jobname in ('intake_scheduled_pause_00_15_ae','season_break_tick','season_break_tick_last_retry','season_invariants_tick')
order by 1;
select season_phase, wrap_up_day, close_day, public.ae_today() as today,
       (season_phase = 'winding_down' and close_day is not null and close_day < public.ae_today()) as break_overdue
from public.intake_settings;
```

Expected: three active jobs with the schedules above and no `intake_scheduled_pause_00_15_ae`; `break_overdue = false`. Do not call `season_break_tick()` by hand here: it is not a dry run and would act. If `break_overdue` is true, report it to the owner at once. Then deploy.

---
### Task 16: Final verification

**Files:**
- Modify: `scripts/check-season-customer.mjs` (Plan B)

**Interfaces:**
- Consumes: every preview knob from Tasks 10 to 14 (`season=held|paused_break|ready|ready_scheduled|runs_past`, menu `state=season-held|season-ready`, `/dev/season-admin?season=break|break_alert`); every rehearsal block from Tasks 2 to 6; Plan B's `season_schedule_end`, `season_projected_end`.
- Produces: `check-season-customer.mjs` renders Plan B's and Plan C's customer states (13 states, 26 renders), with a list of taps per state.

- [ ] **Step 1: Add the break states to the customer rendered check**

In `scripts/check-season-customer.mjs`:

(a) Replace the block

```js
        if (state.tap) {
          await page.locator(`${state.tap} >> visible=true`).first().click()
          await page.waitForTimeout(400)
          const after = await page.locator('body').innerText()
          for (const text of state.after ?? []) if (!after.includes(text)) failures.push(`${label}: after tapping ${state.tap}, missing "${text}"`)
          if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/season-customer-${state.id}-after-${width}.png`, fullPage: true })
        }
```

with

```js
        const taps = state.taps ?? (state.tap ? [state.tap] : [])
        if (taps.length > 0) {
          for (const tap of taps) {
            await page.locator(`${tap} >> visible=true`).first().click()
            await page.waitForTimeout(400)
          }
          const after = await page.locator('body').innerText()
          for (const text of state.after ?? []) if (!after.includes(text)) failures.push(`${label}: after tapping ${taps.join(' then ')}, missing "${text}"`)
          for (const text of state.afterAbsent ?? []) if (after.toLowerCase().includes(text.toLowerCase())) failures.push(`${label}: after tapping, must not say "${text}"`)
          if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/season-customer-${state.id}-after-${width}.png`, fullPage: true })
        }
```

(b) Append to the `STATES` array, after Plan B's `menu` state:

```js
  // Plan C: the break. Each state is a fresh browser context, so the
  // once-only notices show first and are dismissed by the first tap.
  {
    id: 'n8-held',
    url: '/dashboard?preview=1&verified=1&season=held',
    expect: ['Your meals are kept for next semester.', 'The kitchen is closed between semesters, so your last 9 meals of', 'is in your wallet too.'],
    absent: ['refund'],
    tap: '#season-break-notice-dismiss',
    after: ['Your 9 meals are kept for next semester.', 'AED 20 is in your wallet for your next Monthly plan.'],
    afterAbsent: ['refund'],
  },
  {
    id: 'n11-break-refusal',
    url: '/dashboard?preview=1&verified=1&season=paused_break',
    expect: ['The kitchen is closed between semesters.', 'Save your spot for next semester and AED 20 goes to your wallet.'],
    taps: ['#season-break-notice-dismiss', 'button:has-text("Resume plan")'],
    after: ["Your plan can resume once we're back."],
    afterAbsent: ['refund'],
  },
  {
    id: 'paused-card-joined',
    url: '/dashboard?preview=1&verified=1&season=paused_break&joined=1',
    expect: [],
    tap: '#season-break-notice-dismiss',
    after: ['Your plan is paused, and the kitchen is closed between semesters.', 'Your spot for next semester is saved.'],
  },
  {
    id: 'ready',
    url: '/dashboard?preview=1&verified=1&season=ready',
    expect: ["We're back. Your 9 meals are ready.", "Tap Resume when you're ready, and your dinners start again."],
    absent: ['refund', 'Your meals are kept for next semester.'],
  },
  {
    id: 'ready-scheduled',
    url: '/dashboard?preview=1&verified=1&season=ready_scheduled',
    expect: ['Pick your start date on your plan page to begin.', 'Pick my start date'],
  },
  {
    id: 'n7-split',
    url: '/dashboard?preview=1&verified=1&sub=paused&paused=1&joined=0&season=runs_past',
    expect: [],
    tap: 'button:has-text("Resume plan")',
    after: ['Resume your plan?', 'will be kept for next semester, with AED 15 in your wallet.'],
    afterAbsent: ['refund'],
  },
  {
    id: 'menu-held',
    url: '/dashboard/menu?preview=1&state=season-held',
    expect: [],
    tap: '[data-state="season-held"], [data-reason="season-held"]',
    after: ['The kitchen is closed between semesters. Your meals are kept for you, so nothing is lost.'],
  },
```

(c) Update the header comment's first sentence to `Renders every Plan B and Plan C customer preview state at desktop and phone width`.

Run: `node --check scripts/check-season-customer.mjs`
Expected: no output.

- [ ] **Step 2: Run the whole suite, the typecheck and lint**

Run: `npx vitest run`
Expected: every test passes.
Run: `npx tsc --noEmit -p .` and `npm run lint`
Expected: clean.

- [ ] **Step 3: Re-run the lockstep and every Plan C rehearsal on live**

Run `npm run --silent season:lockstep-sql > "$SCRATCH/lockstep.sql"` and execute the file's content. Expected: `LOCKSTEP_OK: 19 fixtures agree`.

Run, in order, the rehearsal `DO` blocks from Task 3 Step 4, Task 4 Step 4, Task 5 Step 4 and Task 6 Step 4.
Expected: `KITCHEN_GUARDS_OK: ...`, `STATUS_TRIGGERS_OK: ...`, `BEGIN_BREAK_OK: ...`, `REOPEN_RELEASE_OK: ...`, each with every line from its task. A `REHEARSAL_SKIPPED` is reported with the live plan facts, never ignored.

- [ ] **Step 4: Rehearse the whole break on live, end to end, rolled back**

```sql
DO $$
DECLARE
  v_today  date := public.ae_today();
  v_close  date := LEAST(public.ae_today(), CURRENT_DATE) - 1;
  v_w      date;
  a        public.subscriptions;
  p        public.subscriptions;
  n        public.subscriptions;
  v        jsonb;
  f        record;
  v_before integer;
  v_new    uuid;
  v_bad    integer;
  v_log    text := '';
BEGIN
  SELECT sub.* INTO a FROM public.subscriptions sub
  WHERE sub.status = 'Active' AND sub.plan_name ILIKE '%monthly%' AND public.expense_category_for_plan(sub.plan_name) IS NULL
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.subscription_id = sub.id)
    AND COALESCE(sub.delivered_meals, 0) < sub.total_meals - COALESCE(sub.credited_skip_days, 0) * COALESCE(sub.meals_per_day, 1)
  ORDER BY sub.end_date DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'REHEARSAL_SKIPPED: no paid Active monthly plan with meals left'; END IF;
  SELECT * INTO p FROM public.subscriptions
  WHERE status = 'Paused' AND id <> a.id
    AND COALESCE(delivered_meals, 0) < total_meals - COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1)
  LIMIT 1;

  -- 1. The owner schedules the season end from today's live state.
  UPDATE public.intake_settings SET season_phase = 'winding_down', wrap_up_day = NULL, close_day = NULL,
    pause_scheduled_for = NULL, paused = true, sales_stopped_at = now(), cycle_started_at = now();
  v_w := v_today + 1;
  IF EXTRACT(isodow FROM v_w)::int = 7 THEN v_w := v_w + 1; END IF;
  v := public.season_schedule_end(v_w, 1, 'plan-c-break-rehearsal');
  IF v->>'phase' <> 'winding_down' OR NOT (v ? 'reconciled') THEN RAISE EXCEPTION 'FAIL schedule: %', v; END IF;
  v_log := v_log || 'scheduled ok; ';

  -- 2. Time passes: the wrap-up day and the close day are behind us.
  UPDATE public.intake_settings SET wrap_up_day = v_close - 1, close_day = v_close;
  UPDATE public.subscriptions SET last_delivery_tick_date = NULL, resume_cutoff_date = NULL WHERE id = a.id RETURNING delivered_meals INTO v_before;
  PERFORM public.subscription_delivery_tick();
  IF (SELECT delivered_meals FROM public.subscriptions WHERE id = a.id) <> v_before THEN RAISE EXCEPTION 'FAIL cooked after the close day'; END IF;
  v_log := v_log || 'kitchen quiet after the close day ok; ';

  -- 3. 00:15: the break begins.
  v := public.season_break_tick();
  IF v->>'action' <> 'begin_break' OR (v->>'started')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL break did not begin: %', v; END IF;
  SELECT * INTO a FROM public.subscriptions WHERE id = a.id;
  IF a.status <> 'Paused' OR a.season_hold_id IS NULL
     OR (SELECT waitlist_credit_id FROM public.season_holds WHERE id = a.season_hold_id) IS NULL THEN
    RAISE EXCEPTION 'FAIL the paid plan was not held with its credit: %', row_to_json(a);
  END IF;
  IF p.id IS NOT NULL AND (SELECT state FROM public.season_holds h JOIN public.subscriptions s ON s.season_hold_id = h.id WHERE s.id = p.id) <> 'paused_by_customer' THEN
    RAISE EXCEPTION 'FAIL the customer pause was not carried';
  END IF;
  v_log := v_log || 'break began, plans held ok; ';

  -- 4. During the break every guard holds.
  BEGIN
    UPDATE public.subscriptions SET status = 'Active' WHERE id = a.id;
    RAISE EXCEPTION 'FAIL G2 let a restart through';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SEASON_BREAK:%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.season_release_hold(a.customer_id, a.id, NULL, false);
    RAISE EXCEPTION 'FAIL release allowed during the break';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SEASON_BREAK:%' THEN RAISE; END IF;
  END;
  INSERT INTO public.subscriptions (customer_id, plan_name, status, start_date, end_date, total_meals, delivered_meals, meals_per_day, week_type, meal_preference_type)
  VALUES (a.customer_id, 'Monthly Premium', 'Active', v_today + 1, v_today + 30, 24, 0, 1, '6DAYS', 'Non Veg') RETURNING id INTO v_new;
  SELECT * INTO n FROM public.subscriptions WHERE id = v_new;
  IF n.status <> 'Scheduled' OR n.season_hold_id IS NULL THEN RAISE EXCEPTION 'FAIL G3 arrival not held: %', row_to_json(n); END IF;
  PERFORM public.subscription_status_tick();
  IF (SELECT status FROM public.subscriptions WHERE id = a.id) <> 'Paused' THEN RAISE EXCEPTION 'FAIL G4 status tick changed a held plan'; END IF;
  PERFORM public.subscription_delivery_tick();
  IF (SELECT delivered_meals FROM public.subscriptions WHERE id = a.id) <> v_before THEN RAISE EXCEPTION 'FAIL G1 cooked during the break'; END IF;
  SELECT * INTO f FROM public.ops_failsafe_send_tick();
  IF f.fired_count <> 0 OR f.skipped_no_config <> 0 THEN RAISE EXCEPTION 'FAIL G6 failsafe fired during the break'; END IF;
  v := public.season_invariants_tick();
  IF (v->'breaches') <> '[]'::jsonb THEN RAISE EXCEPTION 'FAIL invariants breached on a clean break: %', v; END IF;
  v_log := v_log || 'G1 G2 G3 G4 G6 and invariants hold ok; ';

  -- 5. The owner reopens.
  v := public.season_reopen('plan-c-break-rehearsal');
  IF v->>'phase' <> 'open' OR (v->>'ready_holds')::int < 2 THEN RAISE EXCEPTION 'FAIL reopen: %', v; END IF;
  v_log := v_log || 'reopened ok; ';

  -- 6. The customer taps Resume: the held plan and the renewal held behind it restart.
  v := public.season_release_hold(a.customer_id, a.id, NULL, false);
  IF v->>'status' <> 'Active' OR (v->>'followers')::int <> 1
     OR (SELECT status FROM public.subscriptions WHERE id = a.id) <> 'Active'
     OR (SELECT season_hold_id FROM public.subscriptions WHERE id = v_new) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL release: %', v;
  END IF;
  IF p.id IS NOT NULL THEN
    PERFORM public.season_release_hold(p.customer_id, p.id, NULL, false);
    IF (SELECT status FROM public.subscriptions WHERE id = p.id) <> 'Active' THEN RAISE EXCEPTION 'FAIL customer pause release'; END IF;
  END IF;
  v_log := v_log || 'released on Resume ok; ';

  -- 7. Plan B's invariant: no credited date after the projected end.
  SELECT count(*) INTO v_bad
  FROM public.subscriptions s
  WHERE s.status IN ('Active', 'Skipped', 'Paused', 'Scheduled')
    AND cardinality(s.credited_skip_dates) > 0
    AND (SELECT max(x) FROM unnest(s.credited_skip_dates) AS t(x)) > public.season_projected_end(s.end_date, s.week_type, v_today, s.skipped_dates);
  IF v_bad > 0 THEN RAISE EXCEPTION 'FAIL % plans hold a credited date after their projected end', v_bad; END IF;
  v_log := v_log || 'no credited date after the projected end ok; ';

  RAISE EXCEPTION 'BREAK_REHEARSAL_OK: %', v_log;
END;
$$;
```

Expected: an error `BREAK_REHEARSAL_OK: scheduled ok; kitchen quiet after the close day ok; break began, plans held ok; G1 G2 G3 G4 G6 and invariants hold ok; reopened ok; released on Resume ok; no credited date after the projected end ok;`.

- [ ] **Step 5: Confirm live is exactly as the owner left it**

```sql
select season_phase, paused, wrap_up_day, close_day, break_started_at, cycle_started_at, cycle_ended_at from public.intake_settings;
select count(*) as holds from public.season_holds;
select count(*) as new_waitlist_rows from public.intake_waitlist where joined_at > now() - interval '1 hour';
select count(*) filter (where season_hold_id is not null) as held_plans from public.subscriptions;
select jobname, schedule, active from cron.job
where jobname in ('intake_scheduled_pause_00_15_ae','season_break_tick','season_break_tick_last_retry','season_invariants_tick') order by 1;
select tgname from pg_trigger where tgrelid = 'public.subscriptions'::regclass and tgname like 'trg_subscriptions_season_%' order by 1;
select p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') as customer_can_run
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('season_begin_break','season_break_tick','season_invariants_tick','season_reopen','season_release_hold','season_project_plans','_season_project_plan','_season_buffer_cooks','_season_buffer_slots_used','_season_projection_result')
order by 1;
```

Expected: the intake row unchanged from before the rehearsals (no `break_started_at`); 0 holds; 0 new waitlist rows; 0 held plans; before deploy day only `intake_scheduled_pause_00_15_ae` is scheduled (Task 15 Step 8 switches it); both season triggers; ten functions, all `customer_can_run = false`.

- [ ] **Step 6: Render every preview**

Start `npm run dev -- -p 3100` from the worktree root and wait until `http://localhost:3100/dashboard?preview=1` answers 200.

Run: `BASE_URL=http://localhost:3100 SHOT_DIR=<an existing scratch directory> npm run check:season-customer`
Expected: `check-season-customer: 26 renders OK`.

Run: `BASE_URL=http://localhost:3100 SHOT_DIR=<the same directory> npm run check:season-planner`
Expected: `check-season-planner: 16 renders OK`.

Open the screenshots and confirm at both widths: the N8 notice and the held card (Task 10, 12); the N9 notice with Save my spot, and the break refusal sheet behind Resume (Task 11); the ready and ready-to-pick-a-date cards; the split sheet with the credit sentence and no refund; the held menu day's note (Task 13); the break board's held plans, customer pauses, credit, waitlist and green invariant, and the red invariant in `break_alert` (Task 14); End the season today on the planner (Task 15). Then repeat Task 13 Step 4's `state=season-ready` menu look and Task 14 Step 4's Reopen modal once on the final build. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-season-customer.mjs
git commit -m "test(season): the customer rendered check covers the break: notices, cards, refusal, split and the held menu day

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## After Plan C

1. Final whole-branch review (subagent-driven-development), then merge into `main` alongside the other session's work.
2. On deploy day, before `git push origin main:Production`: Task 15 Step 8 (apply `season_break_cron`, confirm the break is not overdue). Then deploy.
3. After the deploy: `/admin/season` shows the phase as the owner left it and End the season today; the kitchen screen `/kitchen/[token]` shows tonight's count; the Scheduled Jobs page lists the two break starters and the watchdog.
4. **Plan D (money):** refund request with owner approval from `held` or `ready` on `season` holds; the refund amount follows Plan B's money rule (`season_skip_guards`: recorded money only on an order that is not a `cs_test_` session) and reads `season_holds.meal_value_fils`, which Plan C stores only when exact; the refund function sets `dormers.season_release` when it ends a plan; the webhook refund branch; flips `SEASON_REFUNDS_LIVE`, passes the refund amount to `SeasonSplitSheet` (`resumeSplitCopy`'s `refund`), adds the refund option to `HeldPlanCard`, N8 and the break board (amounts, Stripe id, Approve, Decline, Retry).
5. **Plan E (messages):** the `season_notices` outbox; N8 and N9 on WhatsApp (`season_plan_held`, `season_pause_carries`) and email; the owner's break summary and the "last kitchen night" message at K 20:30 through `notifyAdmin` with the email fallback (Plan C sends the summary from SQL with `send_admin_whatsapp_alert` only); `announceSeasonSkipCredited` (Plan B's hook), which "End the season today" now also feeds.
6. **Plan F (reopen notices):** wire `announceSeasonReopened` (Task 7): the owner's "Reopened" message, the reminder when the reopening notice is not sent within 2 hours, N15 to N17, and held plans in the reopen audience.
7. **Plan G (invariants):** extend `season_invariants_tick` (Task 5) with the rest of G10 (a delivery recorded after K, a delivery after W without a grant, a paid `season` hold without its waitlist credit, `refund_processing` older than 30 minutes, a pending season-skip credit two days past its date), plus: an orphan count (a `season_hold_id` pointing at a released or refunded hold, or a hold in `held`, `paused_by_customer` or `ready` whose plan no longer points at it); a credited date after the projected end (Task 16 Step 4's query); and a `ready` hold still unreleased when the next season's break begins (begin-break skips a plan that still carries `season_hold_id`). Also the 7-days-after-reopening digest.
8. Follow-up outside the plans: the menu's top spotlight still reads a held Paused plan as "paused" (it reads status, not reasons); the day cards and the dish sheet already say "Kept for you".

## Owner decisions needed

1. **Kitchen and rider screens on ordinary days (Task 8).** Counting only what the delivery tick cooks also changes normal days: a closure day reads zero, and a plan that is Paused or Skipped, resumed after 2 PM, or already has every meal delivered or credited is no longer counted. Recommended: yes, it is what the kitchen actually sends out. The alternative is to apply the new rule only after the wrap-up day, which keeps two counting rules.
2. **A plan sold during the break (G3, Task 4).** It is held and you get a WhatsApp, but no waitlist credit is added automatically. Recommended: no automatic credit; decide per case, since it means a sale slipped through.
3. **A renewal queued behind a held plan (Task 6).** It restarts together with the plan when the customer taps Resume, following the plan's new end date. Recommended: yes. The alternative leaves it held until the customer picks a start date, which the app refuses while the plan in front is paused.

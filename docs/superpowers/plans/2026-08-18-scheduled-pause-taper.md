# Scheduled Pause with Sales Taper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner schedule the seasonal pause as a date — the last delivery day of the term — so checkout stops selling any plan whose journey would cross that date (the taper), and the pause flips itself on once the date passes, instead of being toggled by hand on the day.

**Architecture:** One new nullable date column `intake_settings.pause_scheduled_for` (semantics: LAST DELIVERY DAY, AE calendar). A pure domain module answers "does this journey fit by that day?" using the existing `computeEndDate` engine, and is shared verbatim by the checkout route (409 taper refusals), the free-checkout/gift path, and the client date pickers (clamped windows + honest plan-card copy). A daily pg_cron tick performs exactly the same pause-ON transition the admin button performs, the first AE day after the date passes. Reopening stays manual forever — the locked no-scheduled-resume decision is untouched; only the STOP gets a date.

**Tech Stack:** Supabase (Ohio `yjjayivwfqjfppawgyaz`) via MCP for DDL + cron, Next.js App Router, pure TS domain modules with vitest.

**Spec:** This plan IS the spec, decided with the owner on 2026-08-18: critique accepted, taper rule chosen explicitly over "schedule only, sell everything" and over "sell and carry over the break". Context docs: `.planning/seasonal-pause-handoff.md`, `docs/superpowers/specs/2026-08-15-seasonal-intake-pause-design.md` (the original pause), and the locked decisions in the seasonal memory (no end date for the RESUME, ever — this plan schedules only the stop).

## Global Constraints

- **Live Supabase is the Ohio project `yjjayivwfqjfppawgyaz`.** All DDL through the Supabase MCP; repo migration files are mirrors and are known to drift. `ae_today()` exists live but is NOT defined in the repo — do not rely on it; use `(now() at time zone 'Asia/Dubai')::date` inline (Dubai has no DST).
- **Fail open, always.** A settings-read failure resolves to "not scheduled" — the taper must never block a sale by accident. Same direction as the existing pause fail-open.
- **`pause_scheduled_for` means LAST DELIVERY DAY.** A plan is sellable iff its projected `end_date <= pause_scheduled_for`. Deliveries ON the date still happen. The auto-flip runs the first AE day AFTER the date.
- **`staff-monthly` is exempt** from the taper exactly as it is exempt from the pause (admin-assigned remuneration, not a customer purchase). Staff/intern provisioning stays unguarded.
- **Skips can extend a sold journey 1-3 days past the date.** Accepted and deliberate: the taper kills month-long overhangs, not a one-night skip tail. Do not add margin for `maxSkips`.
- **Reopen scheduling is FORBIDDEN.** No resume date, no countdown, no "back on the Nth" anywhere, including admin copy.
- **Customer copy sits in the student's reality:** "The semester wraps up on <date>" / "done for this term", never "we close" or "intake ends". No emoji, no em or en dashes, "to" for ranges. Taper states must be LOUD on the plan surfaces (banner + card state), never discovered at a dead checkout.
- **Existing customers are untouched.** Journeys already sold that cross the date ride to completion; the admin page shows how many, it never cancels them.
- **Test command:** `npx vitest run <path>`. Before any push: `npm run lint`. Never push (commit freely).
- **Indentation:** 2-space in `src/infra`, `src/contexts`, `src/app/api`; 4-space in `src/app/admin` and `src/app/dashboard`.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260818_pause_scheduled_for.sql` | Mirror: the new column |
| `supabase/migrations/20260818_scheduled_pause_tick.sql` | Mirror: the daily auto-flip tick |
| `src/contexts/subscriptions/domain/season-horizon.ts` | Pure: journey-fits logic + latest viable start |
| `src/contexts/subscriptions/domain/season-horizon.test.ts` | Tests for the above |

**Modified:**

| File | Change |
|---|---|
| `src/infra/config/intake.ts` (+ its test) | `pauseScheduledFor` in the state, select, FAIL_OPEN |
| `src/app/api/checkout/route.ts` | `INTAKE_ENDING` 409 taper refusal |
| `src/contexts/payments/usecases/free-checkout.ts` | Taper guard where the end date is computed |
| `src/app/admin/season/actions.ts` | `scheduleIntakePause` / `clearScheduledIntakePause` |
| `src/app/admin/season/page.tsx` | Select the column + overhang count, extend `IntakeSettingsRow` |
| `src/app/admin/season/SeasonClient.tsx` | Schedule card UI |
| `src/app/dashboard/_shared/types.ts` | `lastDeliveryDay` on `IntakeGateState` |
| `src/app/dashboard/plan/page.tsx` | Thread `lastDeliveryDay` |
| `src/app/dashboard/plan/CheckoutPanel.tsx` | Clamped date window + taper banner + unsellable state |
| `src/app/dashboard/plan/PlanClient.tsx` | `ChangeStartDateModal` clamp + taper banner over plan grid |
| `src/app/dashboard/_mobile/MobilePlan.tsx`, `_mobile/MobileExplore.tsx`, `_mobile/MobileDatePicker.tsx` | Same taper, mobile |
| `.planning/seasonal-pause-handoff.md` | Close-out |

---

### Task 1: The column

**Files:**
- Create: `supabase/migrations/20260818_pause_scheduled_for.sql`

**Interfaces:**
- Produces: `intake_settings.pause_scheduled_for date` (nullable). Null = nothing scheduled. Every later task reads this exact name.

- [ ] **Step 1: Write the mirror**

```sql
-- ============================================================================
-- pause_scheduled_for — the LAST DELIVERY DAY of the term (AE calendar date).
-- Null means no pause is scheduled. Semantics decided 2026-08-18:
--   * checkout refuses any plan whose projected end_date lands AFTER this day
--     (the sales taper: monthly naturally stops selling ~4 weeks out, weekly
--     ~1 week out, trial until the day itself),
--   * the daily tick flips paused=true the first AE day after it passes,
--   * deliveries ON the day still happen; existing journeys are never touched.
-- The RESUME side stays manual forever — no scheduled reopen, by locked
-- owner decision. This column schedules only the stop.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-18. This file is the source-control mirror.
-- ============================================================================

alter table public.intake_settings
  add column if not exists pause_scheduled_for date;
```

- [ ] **Step 2: Apply via MCP** (`apply_migration`, name `pause_scheduled_for`).
- [ ] **Step 3: Verify** via `execute_sql`: `select column_name, data_type from information_schema.columns where table_name='intake_settings' and column_name='pause_scheduled_for';` → one row, `date`.
- [ ] **Step 4: Commit** `git add supabase/migrations/20260818_pause_scheduled_for.sql && git commit -m "feat(season): pause_scheduled_for column — the last delivery day of the term"`

---

### Task 2: State plumbing

**Files:**
- Modify: `src/infra/config/intake.ts`
- Test: `src/infra/config/intake.test.ts` (exists — extend it)

**Interfaces:**
- Produces: `IntakeState.pauseScheduledFor: string | null` (ISO `YYYY-MM-DD` or null). `FAIL_OPEN.pauseScheduledFor = null`. Select gains `pause_scheduled_for`.

- [ ] **Step 1: Extend the failing test** — in the existing test file, add cases asserting: a row carrying `pause_scheduled_for: '2026-09-20'` surfaces as `pauseScheduledFor: '2026-09-20'`; a null column surfaces as null; the fail-open path yields null. Follow the file's existing mocking pattern exactly (read it first).
- [ ] **Step 2: Run to verify failure** — `npx vitest run src/infra/config/intake.test.ts` → FAIL.
- [ ] **Step 3: Implement** — add the field to `IntakeState` and `FAIL_OPEN`, add `pause_scheduled_for` to the select string, map `row.pause_scheduled_for == null ? null : String(row.pause_scheduled_for)` (same idiom as `cycleStartedAt` at line 71).
- [ ] **Step 4: Run to verify pass**, then `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(season): pauseScheduledFor rides IntakeState`

---

### Task 3: The horizon domain module

**Files:**
- Create: `src/contexts/subscriptions/domain/season-horizon.ts`
- Test: `src/contexts/subscriptions/domain/season-horizon.test.ts`

**Interfaces:**
- Consumes: `computeEndDate`, `isoDate` from `./end-date`; `planKindOf` from `./plans` (types `PlanId`, `WeekType`).
- Produces (pure, importable client-side — no server imports):
  - `journeyFits(input: { planId: PlanId; weekType: WeekType; startDate: string; lastDeliveryDay: string }): boolean` — true when the projected end lands on or before the last day.
  - `latestViableStart(input: { planId: PlanId; weekType: WeekType; minStart: string; maxStart: string; lastDeliveryDay: string }): string | null` — the latest ISO date in `[minStart, maxStart]` whose journey fits, or null when none does (the plan is done for the term).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { journeyFits, latestViableStart } from './season-horizon'

describe('journeyFits', () => {
  it('a trial starting on the last day fits', () => {
    expect(journeyFits({ planId: 'trial', weekType: '6DAYS', startDate: '2026-09-20', lastDeliveryDay: '2026-09-20' })).toBe(true)
  })
  it('a trial starting after the last day does not fit', () => {
    expect(journeyFits({ planId: 'trial', weekType: '6DAYS', startDate: '2026-09-21', lastDeliveryDay: '2026-09-20' })).toBe(false)
  })
  it('a monthly starting four-plus weeks before the last day fits', () => {
    expect(journeyFits({ planId: 'monthly-max', weekType: '6DAYS', startDate: '2026-08-20', lastDeliveryDay: '2026-09-20' })).toBe(true)
  })
  it('a monthly starting one week before the last day does not fit', () => {
    expect(journeyFits({ planId: 'monthly-max', weekType: '6DAYS', startDate: '2026-09-14', lastDeliveryDay: '2026-09-20' })).toBe(false)
  })
  it('agrees exactly with computeEndDate (no off-by-one)', () => {
    // weekly-flex 6DAYS starting Mon 2026-09-07: D=6, ends Sat 2026-09-12.
    expect(journeyFits({ planId: 'weekly-flex', weekType: '6DAYS', startDate: '2026-09-07', lastDeliveryDay: '2026-09-12' })).toBe(true)
    expect(journeyFits({ planId: 'weekly-flex', weekType: '6DAYS', startDate: '2026-09-07', lastDeliveryDay: '2026-09-11' })).toBe(false)
  })
})

describe('latestViableStart', () => {
  it('returns the latest fitting date in the window', () => {
    const got = latestViableStart({ planId: 'weekly-flex', weekType: '6DAYS', minStart: '2026-09-01', maxStart: '2026-09-30', lastDeliveryDay: '2026-09-20' })
    expect(got).not.toBeNull()
    expect(journeyFits({ planId: 'weekly-flex', weekType: '6DAYS', startDate: got!, lastDeliveryDay: '2026-09-20' })).toBe(true)
    // the next day must NOT fit (it is genuinely the latest)
    const next = new Date(got + 'T00:00:00'); next.setUTCDate(next.getUTCDate() + 1)
    expect(journeyFits({ planId: 'weekly-flex', weekType: '6DAYS', startDate: next.toISOString().slice(0, 10), lastDeliveryDay: '2026-09-20' })).toBe(false)
  })
  it('returns null when nothing in the window fits', () => {
    expect(latestViableStart({ planId: 'monthly-max', weekType: '6DAYS', minStart: '2026-09-10', maxStart: '2026-09-30', lastDeliveryDay: '2026-09-20' })).toBeNull()
  })
  it('never returns a date outside the window', () => {
    const got = latestViableStart({ planId: 'trial', weekType: '6DAYS', minStart: '2026-09-01', maxStart: '2026-09-05', lastDeliveryDay: '2026-09-20' })
    expect(got).toBe('2026-09-05')
  })
})
```

Before finalizing the weekly expectation dates, read `end-date.ts` and hand-compute one example; if the engine's day math differs from the comment above, fix the TEST DATES to the engine's truth, never the module to the test.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — `journeyFits` is one call: `isoDate(computeEndDate({ startDate, planKind: planKindOf(planId), weekType, skipCount: 0, pauseDays: 0 })) <= lastDeliveryDay` (ISO strings compare lexicographically). `latestViableStart` scans from `maxStart` backward to `minStart` (the window is at most ~32 days, so a linear scan is fine) returning the first fit; null if the scan exhausts. Guard degenerate input (`minStart > maxStart`) by returning null.
- [ ] **Step 4: Run tests + `npx tsc --noEmit`.**
- [ ] **Step 5: Commit** `feat(season): season-horizon domain — journeyFits and latestViableStart`

---

### Task 4: Server enforcement

**Files:**
- Modify: `src/app/api/checkout/route.ts`
- Modify: `src/contexts/payments/usecases/free-checkout.ts`

**Interfaces:**
- Consumes: `journeyFits` (Task 3), `getIntakeState` (Task 2 shape).
- Produces: checkout 409 `{ error: 'INTAKE_ENDING', message, last_delivery_day }`; free-checkout throw with the same message. The error code string `INTAKE_ENDING` is load-bearing for any client that wants to branch on it.

- [ ] **Step 1: Checkout route** — inside the existing `if (!isStaffPlan)` block (route.ts ~line 105), extend: after the `intake.paused` 409, add the taper. It needs the validated `startDate` and `weekType`, so it must run AFTER the start-window validation (~line 181) — move nothing; add a second guard there:

```ts
  // The sales taper: with a pause scheduled, refuse any journey that cannot
  // finish by the last delivery day of the term. Deliveries on the day are
  // fine; a plan ending after it would run into the break. Fail open: if the
  // settings read failed upstream, pauseScheduledFor is null and we sell.
  if (!isStaffPlan && intake.pauseScheduledFor) {
    const fits = journeyFits({
      planId: planDef.id,
      weekType,
      startDate: startDateIso,
      lastDeliveryDay: intake.pauseScheduledFor,
    });
    if (!fits) {
      const pretty = new Date(intake.pauseScheduledFor + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
      return NextResponse.json({
        error: 'INTAKE_ENDING',
        message: `The semester wraps up on ${pretty}. This plan would run past it, so it is done for this term. Shorter plans are still available.`,
        last_delivery_day: intake.pauseScheduledFor,
      }, { status: 409 });
    }
  }
```

Read the route first for the real local variable names (`intake` must be hoisted out of the earlier block or re-read — `getIntakeState()` is 30s-cached, a second call is fine; the `startDateIso` / `weekType` names must match what the window validation actually produced).

- [ ] **Step 2: Free checkout** — in `runFreeCheckout`, right after `endDate` is computed (~line 136-142), add the same refusal (throwing, matching `assertIntakeOpen`'s style):

```ts
  const intake = await getIntakeState()
  if (intake.pauseScheduledFor && isoDate(endDate) > intake.pauseScheduledFor) {
    const pretty = new Date(intake.pauseScheduledFor + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    throw new Error(`The semester wraps up on ${pretty}. This plan would run past it, so it is done for this term.`)
  }
```

Gift claims flow through `claimGift` → `assertIntakeOpen` and provision a ONE-day journey; the gift's end date is its start date, so the generic check above (when the gift path reaches `runFreeCheckout`) covers it; if `claimGift` provisions without `runFreeCheckout`, read `r/[cid]/actions.ts` and add the same one-day check where its start date is chosen. Staff/intern provisioning stays untouched.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` + `npm run lint` on the touched files. Then a live dev-server probe: with the column still null in prod (it is), POST a normal checkout payload to the local route and confirm behavior is unchanged (no 409). Do NOT set a schedule in the live DB for this test; instead unit-level confidence comes from Task 3's tests plus reading the guard.
- [ ] **Step 4: Commit** `feat(season): checkout taper — refuse journeys that cross the last delivery day`

---

### Task 5: The auto-flip tick

**Files:**
- Create: `supabase/migrations/20260818_scheduled_pause_tick.sql`

**Interfaces:**
- Consumes: the column (Task 1); the admin toggle's exact transition writes (fact: pause ON writes `paused=true, paused_at=now, paused_by=<email>, cycle_started_at=now`).
- Produces: `public.intake_scheduled_pause_tick()` scheduled daily as `intake_scheduled_pause_00_15_ae` (`'15 20 * * *'` = 00:15 AE, after the 00:05 status tick).

- [ ] **Step 1: Write the mirror**

```sql
-- ============================================================================
-- intake_scheduled_pause_tick — flips the seasonal pause ON the first AE day
-- AFTER pause_scheduled_for (the last delivery day). Runs daily at 00:15 AE,
-- ten minutes after subscription_status_tick so the last day's statuses have
-- already settled. Performs EXACTLY the transition the admin button performs
-- (src/app/admin/season/actions.ts): paused=true, paused_at=now(),
-- paused_by='schedule', cycle_started_at=now() — cycle_ended_at is left
-- alone, exactly like the manual path. The schedule is consumed (set null)
-- in the same statement so the flip can never re-fire.
-- If the owner paused manually before the date arrived, the tick just clears
-- the schedule and touches nothing else.
-- Dubai has no DST; '(now() at time zone ''Asia/Dubai'')::date' is exact.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-18. This file is the source-control mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.intake_scheduled_pause_tick()
RETURNS TABLE(flipped boolean, cleared_only boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_ae date := (now() at time zone 'Asia/Dubai')::date;
  r record;
BEGIN
  flipped := false; cleared_only := false;

  SELECT id, paused, pause_scheduled_for INTO r
  FROM public.intake_settings
  WHERE pause_scheduled_for IS NOT NULL
    AND pause_scheduled_for < today_ae
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEXT; RETURN;
  END IF;

  IF r.paused THEN
    UPDATE public.intake_settings
    SET pause_scheduled_for = NULL, updated_at = now()
    WHERE id = r.id;
    cleared_only := true;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.intake_settings
  SET paused = true,
      paused_at = now(),
      paused_by = 'schedule',
      cycle_started_at = now(),
      pause_scheduled_for = NULL,
      updated_at = now()
  WHERE id = r.id AND paused = false;

  flipped := true;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.intake_scheduled_pause_tick() IS
  'Daily 00:15 AE. Flips the seasonal pause ON the first AE day after pause_scheduled_for, performing the same transition as the admin button with paused_by=schedule. Clears the schedule either way.';

REVOKE EXECUTE ON FUNCTION public.intake_scheduled_pause_tick() FROM public, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('intake_scheduled_pause_00_15_ae');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'intake_scheduled_pause_00_15_ae',
  '15 20 * * *',
  $cron$ SELECT public.intake_scheduled_pause_tick(); $cron$
);

COMMIT;
```

- [ ] **Step 2: Apply via MCP** (`apply_migration`, name `scheduled_pause_tick`).
- [ ] **Step 3: Smoke test inside a rolled-back transaction** — customers must never see even a momentary flip. Via `execute_sql`, FIRST: `select * from intake_scheduled_pause_tick();` with no schedule set → `(false, false)` (safe, touches nothing). THEN one single `execute_sql` call containing the whole exercise:

```sql
begin;
update public.intake_settings set pause_scheduled_for = (now() at time zone 'Asia/Dubai')::date - 1;
select * from public.intake_scheduled_pause_tick();          -- expect (true, false)
select paused, paused_by, pause_scheduled_for, cycle_started_at from public.intake_settings;
rollback;
```

Record the in-transaction outputs in the report, then verify post-rollback that the live row is untouched: `select paused, paused_by, pause_scheduled_for from public.intake_settings;` → `(false, <prior>, null)`. If the MCP tool refuses multi-statement transactions, SKIP the flip exercise entirely, report that, and rely on the idle test plus a careful read of the function — never flip the live flag outside a transaction.
- [ ] **Step 4: Commit** `feat(season): daily tick flips the scheduled pause the day after the last delivery day`

---

### Task 6: Admin scheduling UI

**Files:**
- Modify: `src/app/admin/season/actions.ts`, `src/app/admin/season/page.tsx`, `src/app/admin/season/SeasonClient.tsx`

**Interfaces:**
- Produces: `scheduleIntakePause(dateIso: string)` and `clearScheduledIntakePause()` server actions (`Result`-shaped like the file's others, `requireAdmin`, audit actions `'intake_pause_scheduled'` / `'intake_pause_schedule_cleared'`, `revalidatePath('/admin/season')`). `IntakeSettingsRow` gains `pauseScheduledFor: string | null`; page also computes `overhangCount: number` — live-ish subscriptions (`status in ('Active','Paused','Skipped','Scheduled')`) with `end_date > pause_scheduled_for` — passed to the client.

- [ ] **Step 1: Actions** — validation: the date must parse, be strictly after today (AE), and at most 370 days out; refuse when `settings.paused` is already true ("Intake is already paused. Clear the pause instead."). Writes `{ pause_scheduled_for: dateIso, updated_at }` / `{ pause_scheduled_for: null, updated_at }` on the singleton, mirroring the file's existing update idiom.
- [ ] **Step 2: page.tsx** — add `pause_scheduled_for` to the select; when set, one extra count query for `overhangCount` (0 when no schedule).
- [ ] **Step 3: SeasonClient** — inside the pause/resume card, under the existing controls, a "Schedule the pause" block rendered only when `!settings.paused`:
  - No schedule: a date input (min = tomorrow) + "Schedule" `AdminButton` opening an `AdminModal` confirm: heading "Schedule the last delivery day?", body "New plans stop being sellable as soon as their journey would cross <pretty date>. Monthly plans stop selling about four weeks before it, weekly about a week before, and the pause turns itself on the day after. Existing customers are not affected." Confirm calls `scheduleIntakePause`.
  - Scheduled: a highlighted row "Last delivery day: <pretty date>" + the taper explainer one-liner + `overhangCount` line when > 0: "N current journeys already end after this date. They ride to completion." + a "Clear schedule" button (confirm modal, `clearScheduledIntakePause`).
  - Copy: no emoji, no em/en dashes, never any reopening date language.
- [ ] **Step 4: Verify** — `npx tsc --noEmit`, `npx eslint` on the three files; screenshot the Season page (both admin themes) with the dev server via the `/tmp/pw-runner` recipe if an authenticated path exists in those scripts; otherwise report the auth blocker and verify by reading the rendered JSX carefully.
- [ ] **Step 5: Commit** `feat(season): schedule the pause from the Season page`

---

### Task 7: Customer-facing taper

**Files:**
- Modify: `src/app/dashboard/_shared/types.ts`, `src/app/dashboard/plan/page.tsx`, `src/app/dashboard/plan/CheckoutPanel.tsx`, `src/app/dashboard/plan/PlanClient.tsx`, `src/app/dashboard/_mobile/MobilePlan.tsx`, `src/app/dashboard/_mobile/MobileExplore.tsx`, `src/app/dashboard/_mobile/MobileDatePicker.tsx`

**Interfaces:**
- Consumes: `journeyFits` / `latestViableStart` (pure, client-safe), `IntakeGateState`.
- Produces: `IntakeGateState.lastDeliveryDay: string | null` (and in `INTAKE_NOT_PAUSED`: null), threaded from `plan/page.tsx` (`intakeState.pauseScheduledFor`).

Behavior contract, applied identically on desktop and mobile:

1. **Banner (loud, not ugly):** when `lastDeliveryDay` is set and intake is not paused, the plan surfaces show one line above the plan grid, styled like the existing plan-ending banner idiom: "The semester wraps up on <pretty date>. Plans that fit before then are still open." Shown once per surface, not per card.
2. **Per-plan sellability:** for each selectable plan, compute `latestViableStart` over the surface's existing min/max window. Null → the plan card renders its unavailable state (same visual treatment the surfaces use for gated plans; if none exists, dim + a small line "Done for this term. Back next semester.") and its select/checkout path is disabled.
3. **Date pickers:** `CheckoutPanel` clamps `maxD` to `latestViableStart` for the selected plan (min of the existing +30 clamp and the horizon). Same clamp in `MobileDatePicker`'s copy of the window math and in `ChangeStartDateModal` (a `Scheduled` sub rescheduled later must not cross the horizon either — same helper, plan id and week type come from the sub being rescheduled).
4. **409 fallback:** wherever checkout POST errors are surfaced, `INTAKE_ENDING` renders its `message` inline exactly like `INTAKE_PAUSED` does (find the existing handling and extend the branch). The server is authoritative; the client clamps are courtesy.

- [ ] **Step 1: Types + threading** — add the field, default null, thread from `plan/page.tsx` only (the mobile surfaces receive the same object).
- [ ] **Step 2: CheckoutPanel + PlanClient (desktop)** per the contract. Read the surrounding code first and reuse its banner/disabled idioms; do not invent new visual language.
- [ ] **Step 3: Mobile three files** per the contract.
- [ ] **Step 4: Tests where pure** — if any new pure helper emerges (e.g. a `taperStateFor(plan, window, lastDay)` selector), put it next to `season-horizon.ts` with a test; UI wiring itself is screenshot-verified.
- [ ] **Step 5: Visual verification** — dev server + `/tmp/pw-runner`: desktop 1440 and 375px of the plan page with a schedule set LOCALLY (point the dev DB read at a temporary schedule by inserting `pause_scheduled_for` into the live singleton is FORBIDDEN — instead, temporarily hardcode `lastDeliveryDay` in `plan/page.tsx` to a date ~10 days out for the screenshot run, then revert; say so in the report). Check: banner present, monthly card in its done-for-term state, weekly/trial still selectable, date picker refuses late dates.
- [ ] **Step 6: `npx tsc --noEmit` + `npm run lint`, commit** `feat(season): customer-facing sales taper — banner, plan availability, clamped dates`

---

### Task 8: Close out

**Files:**
- Modify: `.planning/seasonal-pause-handoff.md`

- [ ] **Step 1:** `npx vitest run` (expect the single pre-existing menu-catalog failure and nothing new) + `npm run lint` clean.
- [ ] **Step 2:** Handoff doc: new dated section "Scheduled pause + sales taper — BUILT 2026-08-18" covering: the column semantics (last delivery day), the taper rule and the skip-tail acceptance, the 00:15 AE tick with `paused_by='schedule'`, staff exemption, and that reopen scheduling remains forbidden.
- [ ] **Step 3: Commit** `docs: scheduled pause + taper shipped`

---

## Deferred (explicitly out of scope)

- Any automation of the reopening — forbidden by locked decision, not deferred.
- Auto-announcing the taper by email or WhatsApp — the broadcast composer exists for the owner to do this by hand.
- Margining the horizon for skips (`maxSkips` days) — accepted skip-tail, revisit only if the kitchen actually feels it.
- Kitchen/ops dashboards showing the wind-down curve — nice later, not now.

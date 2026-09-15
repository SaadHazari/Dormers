# Season Wind-Down, Plan A: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the season a real state (open, winding down, break) with a wrap-up day, buffer and close day, a pure plan projection, and an admin planner that shows the last meal on the books before the owner schedules anything.

**Architecture:** Pure domain modules under `src/contexts/season/domain/` carry the date maths, the transition rules and the plan projection, tested with vitest. Additive live migrations add the season columns and tables; SQL transition functions are the authority for every phase change and keep the legacy `paused` / `pause_scheduled_for` columns in step so existing readers keep working. The admin Season page reads live plans, runs the projection in TypeScript, and drives the SQL transitions through server actions.

**Tech Stack:** Next.js 15 App Router (server components + server actions), TypeScript, Supabase Postgres (live project `yjjayivwfqjfppawgyaz`, applied through the Supabase MCP connector), vitest (node environment), Tailwind admin UI with `useAdminTheme` tokens.

**Spec:** `docs/superpowers/specs/2026-09-14-season-wind-down-design.md` (sections 3, 5, 6, 11.1, 11.2, 13, 17). Later plans: B wind-down customer rules, C break, D money, E messages, F reopen, G invariants.

## Global Constraints

- All dates are `YYYY-MM-DD` on the Asia/Dubai calendar (UTC+4, no DST). Date arithmetic parses with a `Z` suffix and uses UTC getters so the host timezone never matters.
- Delivery days: `6DAYS` = Monday to Saturday, `5DAYS` = Monday to Friday. The close day K is counted on the Monday to Saturday calendar.
- Buffer: integer 0 to 3 delivery days, default 1. Kitchen daily cost default AED 500.
- Wrap-up day W: a Monday to Saturday date, tomorrow or later, within 370 days (except "End the season today", which sets W = K = today).
- Live database first: read every existing function body with `pg_get_functiondef` before changing it. Never re-apply an older file from `supabase/migrations/`. Mirror every live migration verbatim into `supabase/migrations/20260914_<name>.sql`.
- Every live change in this plan is additive and must leave current behaviour unchanged while no wrap-up day is set.
- Customer-facing copy: plain words, no emoji, no em or en dashes. Admin copy may be denser but follows the same rules.
- Work happens in the worktree `.claude/worktrees/season-wind-down` on branch `feat/season-wind-down`. Another session commits to `main` in parallel, so stage and commit ONLY the paths listed in each task (`git add <paths>`), never `git add -A` or `git commit -a`.
- Commit messages end with: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Test command: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit -p .`. Lint: `npm run lint`.

## File Map

| File | Responsibility |
|---|---|
| Create `src/contexts/season/domain/season-dates.ts` | AE today, add days, delivery-day test, close day K, wrap-up validation |
| Create `src/contexts/season/domain/season-phase.ts` | Season snapshot type and which admin actions each phase allows |
| Create `src/contexts/season/domain/season-projection.ts` | Remaining delivery dates, disposition per plan, last meal on the books, kitchen calendar |
| Create `src/contexts/season/domain/meal-value.ts` | Meal value from order money, with a pre-discount estimate fallback |
| Tests beside each: `*.test.ts` | vitest |
| Create `supabase/migrations/20260914173304_season_wind_down_foundation.sql` | Mirror of the live additive schema migration |
| Create `supabase/migrations/20260914173723_season_transitions.sql` | Mirror of the live transition functions and the interim scheduled-pause tick |
| Create `src/contexts/season/usecases/season-transitions.ts` | Server-side wrappers: call RPC, audit, invalidate intake cache |
| Modify `src/infra/config/intake.ts` | `IntakeState` gains `phase`, `wrapUpDay`, `bufferDays`, `closeDay`, `salesStopped` |
| Modify `src/infra/config/intake-cache.test.ts` | Cover the new fields |
| Modify `src/app/admin/season/actions.ts` | Replace pause/schedule actions with season transition actions |
| Create `src/app/admin/season/season-data.ts` | Server loader: live plans, closures, order money → projection inputs |
| Modify `src/app/admin/season/page.tsx` | Load season snapshot + projection, pass to client |
| Create `src/app/admin/season/SeasonPlanner.tsx` | Planner (open / no W) and wind-down board (W set) |
| Modify `src/app/admin/season/SeasonClient.tsx` | Replace the old Pause/Resume and Schedule sections with `SeasonPlanner` |
| Modify `src/app/dev/season-admin/page.tsx` | Fixtures for open, winding down (no W), winding down (W set) |

---

### Task 1: Season dates and phase rules

**Files:**
- Create: `src/contexts/season/domain/season-dates.ts`
- Create: `src/contexts/season/domain/season-phase.ts`
- Test: `src/contexts/season/domain/season-dates.test.ts`
- Test: `src/contexts/season/domain/season-phase.test.ts`

**Interfaces:**
- Produces:
  - `addDaysIso(iso: string, days: number): string`
  - `isoDow(iso: string): number` (1 = Monday … 7 = Sunday)
  - `type SeasonWeekType = '5DAYS' | '6DAYS'`
  - `isDeliveryDayIso(iso: string, weekType: SeasonWeekType): boolean`
  - `closeDayFor(wrapUpDay: string, bufferDays: number): string`
  - `validateSeasonEnd(input: { wrapUpDay: string; bufferDays: number; todayAe: string }): string | null`
  - `todayAeIso(nowMs?: number): string`
  - `MAX_SCHEDULE_DAYS_AHEAD = 370`, `MAX_BUFFER_DAYS = 3`, `DEFAULT_BUFFER_DAYS = 1`
  - `type SeasonPhase = 'open' | 'winding_down' | 'break'`
  - `type SeasonAction = 'schedule' | 'move' | 'clear' | 'stop_sales' | 'resume_sales' | 'end_today' | 'reopen'`
  - `interface SeasonSnapshot { phase: SeasonPhase; wrapUpDay: string | null; closeDay: string | null; bufferDays: number; salesStopped: boolean }`
  - `allowedSeasonActions(s: SeasonSnapshot, todayAe: string): SeasonAction[]`

- [ ] **Step 1: Write the failing tests**

`src/contexts/season/domain/season-dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { addDaysIso, isoDow, isDeliveryDayIso, closeDayFor, validateSeasonEnd, todayAeIso } from './season-dates'

// Calendar anchors (checked): 2026-09-14 is a Monday, 2026-10-03 a Saturday,
// 2026-10-04 a Sunday, 2026-10-05 a Monday.
describe('season-dates', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysIso('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDaysIso('2026-10-01', -1)).toBe('2026-09-30')
  })

  it('reads the ISO weekday', () => {
    expect(isoDow('2026-09-14')).toBe(1)
    expect(isoDow('2026-10-03')).toBe(6)
    expect(isoDow('2026-10-04')).toBe(7)
  })

  it('knows delivery days for both cadences', () => {
    expect(isDeliveryDayIso('2026-10-03', '6DAYS')).toBe(true)
    expect(isDeliveryDayIso('2026-10-03', '5DAYS')).toBe(false)
    expect(isDeliveryDayIso('2026-10-04', '6DAYS')).toBe(false)
  })

  it('close day skips Sunday and counts delivery days', () => {
    expect(closeDayFor('2026-10-03', 0)).toBe('2026-10-03')
    expect(closeDayFor('2026-10-03', 1)).toBe('2026-10-05')
    expect(closeDayFor('2026-09-28', 1)).toBe('2026-09-29')
    expect(closeDayFor('2026-10-02', 2)).toBe('2026-10-05')
  })

  it('validates the wrap-up day and buffer', () => {
    const todayAe = '2026-09-14'
    expect(validateSeasonEnd({ wrapUpDay: '2026-10-03', bufferDays: 1, todayAe })).toBeNull()
    expect(validateSeasonEnd({ wrapUpDay: '', bufferDays: 1, todayAe })).toBe('Pick a wrap-up day first.')
    expect(validateSeasonEnd({ wrapUpDay: '2026-02-30', bufferDays: 1, todayAe })).toBe('That date does not exist. Check the day and month.')
    expect(validateSeasonEnd({ wrapUpDay: '2026-09-14', bufferDays: 1, todayAe })).toBe('The wrap-up day has to be tomorrow or later.')
    expect(validateSeasonEnd({ wrapUpDay: '2027-10-01', bufferDays: 1, todayAe })).toBe('Pick a wrap-up day within the next year.')
    expect(validateSeasonEnd({ wrapUpDay: '2026-10-04', bufferDays: 1, todayAe })).toBe('Pick a delivery day. Sunday is not one.')
    expect(validateSeasonEnd({ wrapUpDay: '2026-10-03', bufferDays: 4, todayAe })).toBe('The buffer must be 0 to 3 delivery days.')
    expect(validateSeasonEnd({ wrapUpDay: '2026-10-03', bufferDays: 1.5, todayAe })).toBe('The buffer must be 0 to 3 delivery days.')
  })

  it('reads today on the Dubai calendar', () => {
    // 2026-09-14T21:30Z is 01:30 on 15 Sep in Dubai.
    expect(todayAeIso(Date.parse('2026-09-14T21:30:00Z'))).toBe('2026-09-15')
    expect(todayAeIso(Date.parse('2026-09-14T19:30:00Z'))).toBe('2026-09-14')
  })
})
```

`src/contexts/season/domain/season-phase.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { allowedSeasonActions, type SeasonSnapshot } from './season-phase'

const today = '2026-09-14'
const snap = (s: Partial<SeasonSnapshot>): SeasonSnapshot => ({
  phase: 'open', wrapUpDay: null, closeDay: null, bufferDays: 1, salesStopped: false, ...s,
})

describe('allowedSeasonActions', () => {
  it('open: schedule, stop sales, or end today', () => {
    expect(allowedSeasonActions(snap({}), today)).toEqual(['schedule', 'stop_sales', 'end_today'])
  })

  it('winding down with sales stopped and no wrap-up day (the live legacy pause)', () => {
    expect(allowedSeasonActions(snap({ phase: 'winding_down', salesStopped: true }), today))
      .toEqual(['schedule', 'resume_sales', 'end_today'])
  })

  it('winding down with a future wrap-up day and sales open', () => {
    expect(allowedSeasonActions(snap({ phase: 'winding_down', wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }), today))
      .toEqual(['move', 'clear', 'stop_sales', 'end_today'])
  })

  it('winding down with a future wrap-up day and sales stopped early', () => {
    expect(allowedSeasonActions(snap({ phase: 'winding_down', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', salesStopped: true }), today))
      .toEqual(['move', 'clear', 'resume_sales', 'end_today'])
  })

  it('winding down after the wrap-up day has passed: nothing to move, sales cannot resume', () => {
    expect(allowedSeasonActions(snap({ phase: 'winding_down', wrapUpDay: '2026-09-12', closeDay: '2026-09-14', salesStopped: true }), today))
      .toEqual(['clear', 'end_today'])
  })

  it('break: reopen only', () => {
    expect(allowedSeasonActions(snap({ phase: 'break', wrapUpDay: '2026-09-12', closeDay: '2026-09-14', salesStopped: true }), today))
      .toEqual(['reopen'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/season/domain/season-dates.test.ts src/contexts/season/domain/season-phase.test.ts`
Expected: FAIL with "Failed to resolve import './season-dates'" (and './season-phase').

- [ ] **Step 3: Write the implementation**

`src/contexts/season/domain/season-dates.ts`:

```ts
/**
 * Season dates: pure date arithmetic for the season wind-down.
 *
 * Spec: docs/superpowers/specs/2026-09-14-season-wind-down-design.md §3 and §5.
 * Dates are YYYY-MM-DD on the Asia/Dubai calendar. Everything parses with a
 * trailing Z and uses UTC getters, so the host timezone can never shift a day.
 */

export type SeasonWeekType = '5DAYS' | '6DAYS'

export const MAX_SCHEDULE_DAYS_AHEAD = 370
export const MAX_BUFFER_DAYS = 3
export const DEFAULT_BUFFER_DAYS = 1

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 1 = Monday … 7 = Sunday, the same convention as Postgres isodow. */
export function isoDow(iso: string): number {
  const js = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return js === 0 ? 7 : js
}

export function isDeliveryDayIso(iso: string, weekType: SeasonWeekType): boolean {
  const dow = isoDow(iso)
  return weekType === '5DAYS' ? dow <= 5 : dow <= 6
}

/**
 * K: the wrap-up day moved forward by `bufferDays` Monday-to-Saturday delivery
 * days. The buffer only ever cooks make-up meals from skips (spec §6.2).
 */
export function closeDayFor(wrapUpDay: string, bufferDays: number): string {
  let day = wrapUpDay
  let left = Math.max(0, Math.floor(bufferDays))
  while (left > 0) {
    day = addDaysIso(day, 1)
    if (isDeliveryDayIso(day, '6DAYS')) left--
  }
  return day
}

/** Returns the admin-facing reason the chosen dates cannot be scheduled, or null. */
export function validateSeasonEnd(input: { wrapUpDay: string; bufferDays: number; todayAe: string }): string | null {
  const { wrapUpDay, bufferDays, todayAe } = input
  if (!ISO_DATE.test(wrapUpDay)) return 'Pick a wrap-up day first.'
  const parsed = new Date(`${wrapUpDay}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== wrapUpDay) {
    return 'That date does not exist. Check the day and month.'
  }
  if (wrapUpDay <= todayAe) return 'The wrap-up day has to be tomorrow or later.'
  if (wrapUpDay > addDaysIso(todayAe, MAX_SCHEDULE_DAYS_AHEAD)) return 'Pick a wrap-up day within the next year.'
  if (!isDeliveryDayIso(wrapUpDay, '6DAYS')) return 'Pick a delivery day. Sunday is not one.'
  if (!Number.isInteger(bufferDays) || bufferDays < 0 || bufferDays > MAX_BUFFER_DAYS) {
    return `The buffer must be 0 to ${MAX_BUFFER_DAYS} delivery days.`
  }
  return null
}

export function todayAeIso(nowMs: number = Date.now()): string {
  return new Date(nowMs + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
```

`src/contexts/season/domain/season-phase.ts`:

```ts
/**
 * Season phase: which admin actions each state allows.
 *
 * Spec §5. The SQL transition functions are the authority and refuse anything
 * this list would not offer; this module exists so the Season page only ever
 * shows buttons that will work.
 */

export type SeasonPhase = 'open' | 'winding_down' | 'break'

export type SeasonAction = 'schedule' | 'move' | 'clear' | 'stop_sales' | 'resume_sales' | 'end_today' | 'reopen'

export interface SeasonSnapshot {
  phase: SeasonPhase
  wrapUpDay: string | null
  closeDay: string | null
  bufferDays: number
  salesStopped: boolean
}

export function allowedSeasonActions(s: SeasonSnapshot, todayAe: string): SeasonAction[] {
  if (s.phase === 'break') return ['reopen']

  if (s.phase === 'open') return ['schedule', 'stop_sales', 'end_today']

  // winding_down
  if (!s.wrapUpDay) return ['schedule', 'resume_sales', 'end_today']

  const wrapUpStillAhead = s.wrapUpDay > todayAe
  const actions: SeasonAction[] = []
  if (wrapUpStillAhead) actions.push('move')
  actions.push('clear')
  if (wrapUpStillAhead) actions.push(s.salesStopped ? 'resume_sales' : 'stop_sales')
  actions.push('end_today')
  return actions
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/contexts/season/domain/season-dates.test.ts src/contexts/season/domain/season-phase.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/season/domain/season-dates.ts src/contexts/season/domain/season-dates.test.ts src/contexts/season/domain/season-phase.ts src/contexts/season/domain/season-phase.test.ts
git commit -m "feat(season): wrap-up day, close day and which season actions each phase allows

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Plan projection

**Files:**
- Create: `src/contexts/season/domain/season-projection.ts`
- Test: `src/contexts/season/domain/season-projection.test.ts`

**Interfaces:**
- Consumes: `addDaysIso`, `isDeliveryDayIso`, `SeasonWeekType` from Task 1.
- Produces:
  - `type Disposition = 'finishes' | 'customer_paused' | 'runs_past' | 'starts_after' | 'staff_pending'`
  - `type ProjectionStatus = 'Active' | 'Skipped' | 'Paused' | 'Scheduled'`
  - `interface ProjectionPlan { id; customerId; planName; status: ProjectionStatus; startDate; endDate; weekType: SeasonWeekType; mealsPerDay: number; totalMeals: number; deliveredMeals: number; creditedSkipDays: number; bufferGrants: number; skippedDates: readonly string[]; plannedPauseStart: string | null; staffApproval: string | null; lastDeliveryTickDate: string | null }` (all id/date/name fields `string`)
  - `interface ProjectionContext { todayAe: string; closureDates: ReadonlySet<string>; wrapUpDay: string | null; closeDay: string | null }`
  - `interface PlanProjection { planId: string; disposition: Disposition; cookDates: string[]; lastDinner: string | null; deliveriesAfterWrapUp: number; mealsAfterWrapUp: number; mealsLeft: number }`
  - `remainingDeliveryDates(plan: ProjectionPlan, ctx: Pick<ProjectionContext, 'todayAe' | 'closureDates'>): string[]`
  - `projectPlan(plan: ProjectionPlan, ctx: ProjectionContext): PlanProjection`
  - `lastMealOnTheBooks(projections: readonly PlanProjection[]): { date: string; planIds: string[] } | null`
  - `interface KitchenDay { date: string; meals: number; lastDinners: number }`
  - `kitchenCalendar(plans: readonly ProjectionPlan[], projections: readonly PlanProjection[]): KitchenDay[]`
  - `interface SeasonSummary { byDisposition: Record<Disposition, number>; kitchenDays: number; kitchenCostAed: number; mealsAfterWrapUp: number; lastKitchenDay: string | null }`
  - `summarizeSeason(projections: readonly PlanProjection[], calendar: readonly KitchenDay[], kitchenDailyCostAed: number): SeasonSummary`

- [ ] **Step 1: Write the failing test**

`src/contexts/season/domain/season-projection.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  remainingDeliveryDates, projectPlan, lastMealOnTheBooks, kitchenCalendar, summarizeSeason,
  type ProjectionPlan, type ProjectionContext,
} from './season-projection'

// Anchors: Mon 2026-09-14 is "today". Sundays: 20 Sep, 27 Sep, 4 Oct.
// A Monday-to-Saturday Monthly Premium that started Mon 7 Sep has 6 meals
// delivered by Sat 12 Sep and 18 left, Mon 14 Sep to Sat 3 Oct.
const plan = (p: Partial<ProjectionPlan> = {}): ProjectionPlan => ({
  id: 'p1', customerId: 'c1', planName: 'Monthly Premium', status: 'Active',
  startDate: '2026-09-07', endDate: '2026-10-03', weekType: '6DAYS',
  mealsPerDay: 1, totalMeals: 24, deliveredMeals: 6, creditedSkipDays: 0, bufferGrants: 0,
  skippedDates: [], plannedPauseStart: null, staffApproval: null, lastDeliveryTickDate: '2026-09-12',
  ...p,
})
const ctx = (c: Partial<ProjectionContext> = {}): ProjectionContext => ({
  todayAe: '2026-09-14', closureDates: new Set(), wrapUpDay: null, closeDay: null, ...c,
})

describe('remainingDeliveryDates', () => {
  it('walks from today to the end date, skipping Sundays', () => {
    const dates = remainingDeliveryDates(plan(), ctx())
    expect(dates).toHaveLength(18)
    expect(dates[0]).toBe('2026-09-14')
    expect(dates.at(-1)).toBe('2026-10-03')
    expect(dates).not.toContain('2026-09-20')
  })

  it('drops today once tonight\'s delivery is recorded', () => {
    const dates = remainingDeliveryDates(plan({ lastDeliveryTickDate: '2026-09-14' }), ctx())
    expect(dates[0]).toBe('2026-09-15')
    expect(dates).toHaveLength(17)
  })

  it('drops skipped days and company closures', () => {
    const dates = remainingDeliveryDates(plan({ skippedDates: ['2026-09-16'] }), ctx({ closureDates: new Set(['2026-09-17']) }))
    expect(dates).not.toContain('2026-09-16')
    expect(dates).not.toContain('2026-09-17')
    expect(dates).toHaveLength(16)
  })

  it('starts on the start date for a plan that has not begun', () => {
    const dates = remainingDeliveryDates(plan({ status: 'Scheduled', startDate: '2026-09-21', endDate: '2026-09-26', lastDeliveryTickDate: null }), ctx())
    expect(dates).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'])
  })
})

describe('projectPlan', () => {
  it('no wrap-up day: every remaining dinner is on the books', () => {
    const p = projectPlan(plan(), ctx())
    expect(p.disposition).toBe('finishes')
    expect(p.lastDinner).toBe('2026-10-03')
    expect(p.cookDates).toHaveLength(18)
    expect(p.mealsLeft).toBe(18)
  })

  it('finishes when the last dinner is on the wrap-up day', () => {
    const p = projectPlan(plan(), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
    expect(p.disposition).toBe('finishes')
    expect(p.mealsAfterWrapUp).toBe(0)
  })

  it('runs past when dinners are due after the wrap-up day', () => {
    const p = projectPlan(plan(), ctx({ wrapUpDay: '2026-09-30', closeDay: '2026-10-01' }))
    expect(p.disposition).toBe('runs_past')
    expect(p.deliveriesAfterWrapUp).toBe(3)
    expect(p.mealsAfterWrapUp).toBe(3)
    expect(p.lastDinner).toBe('2026-09-30')
  })

  it('counts two meals a day on Monthly Max', () => {
    const p = projectPlan(plan({ mealsPerDay: 2, totalMeals: 48, deliveredMeals: 12, planName: 'Monthly Max' }), ctx({ wrapUpDay: '2026-09-30', closeDay: '2026-10-01' }))
    expect(p.mealsAfterWrapUp).toBe(6)
  })

  it('a buffer grant lets a make-up dinner cook on the buffer day', () => {
    const p = projectPlan(plan({ endDate: '2026-10-05', bufferGrants: 1 }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
    expect(p.disposition).toBe('finishes')
    expect(p.lastDinner).toBe('2026-10-05')
  })

  it('a buffer grant never cooks after the close day', () => {
    const p = projectPlan(plan({ endDate: '2026-10-06', bufferGrants: 1 }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
    expect(p.disposition).toBe('runs_past')
    expect(p.mealsAfterWrapUp).toBe(1)
    expect(p.lastDinner).toBe('2026-10-05')
  })

  it('a paused plan is a customer pause with nothing cooking', () => {
    const p = projectPlan(plan({ status: 'Paused' }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
    expect(p.disposition).toBe('customer_paused')
    expect(p.cookDates).toEqual([])
    expect(p.mealsLeft).toBe(18)
  })

  it('a planned pause on or before the wrap-up day cooks only until the pause', () => {
    const p = projectPlan(plan({ plannedPauseStart: '2026-09-21' }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
    expect(p.disposition).toBe('customer_paused')
    expect(p.cookDates).toHaveLength(6)
    expect(p.lastDinner).toBe('2026-09-19')
  })

  it('a planned pause after the wrap-up day does not save the plan from running past', () => {
    const p = projectPlan(plan({ plannedPauseStart: '2026-10-02' }), ctx({ wrapUpDay: '2026-09-30', closeDay: '2026-10-01' }))
    expect(p.disposition).toBe('runs_past')
    expect(p.mealsAfterWrapUp).toBe(3)
  })

  it('a plan starting after the wrap-up day is held whole', () => {
    const p = projectPlan(
      plan({ status: 'Scheduled', startDate: '2026-10-06', endDate: '2026-11-02', deliveredMeals: 0, lastDeliveryTickDate: null }),
      ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }),
    )
    expect(p.disposition).toBe('starts_after')
    expect(p.mealsAfterWrapUp).toBe(24)
    expect(p.cookDates).toEqual([])
  })

  it('a staff renewal waiting for approval is left alone', () => {
    const p = projectPlan(plan({ status: 'Scheduled', staffApproval: 'pending' }), ctx({ wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }))
    expect(p.disposition).toBe('staff_pending')
  })

  it('credited skips come off the meals left', () => {
    expect(projectPlan(plan({ creditedSkipDays: 2 }), ctx()).mealsLeft).toBe(16)
  })
})

describe('books, calendar and summary', () => {
  const p1 = plan()
  const p2 = plan({ id: 'p2', customerId: 'c2', planName: 'Monthly Max', mealsPerDay: 2, totalMeals: 48, deliveredMeals: 36, startDate: '2026-08-24', endDate: '2026-09-19' })

  it('finds the last meal on the books', () => {
    const projections = [projectPlan(p1, ctx()), projectPlan(p2, ctx())]
    expect(lastMealOnTheBooks(projections)).toEqual({ date: '2026-10-03', planIds: ['p1'] })
    expect(lastMealOnTheBooks([])).toBeNull()
  })

  it('builds the kitchen calendar with meals and last dinners per day', () => {
    const plans = [p1, p2]
    const projections = plans.map((p) => projectPlan(p, ctx()))
    const cal = kitchenCalendar(plans, projections)
    expect(cal.find((d) => d.date === '2026-09-14')).toEqual({ date: '2026-09-14', meals: 3, lastDinners: 0 })
    expect(cal.find((d) => d.date === '2026-09-19')).toEqual({ date: '2026-09-19', meals: 3, lastDinners: 1 })
    expect(cal.find((d) => d.date === '2026-10-03')).toEqual({ date: '2026-10-03', meals: 1, lastDinners: 1 })
    expect(cal).toHaveLength(18)
  })

  it('summarises kitchen days, cost and dispositions', () => {
    const plans = [p1, p2]
    const c = ctx({ wrapUpDay: '2026-09-30', closeDay: '2026-10-01' })
    const projections = plans.map((p) => projectPlan(p, c))
    const summary = summarizeSeason(projections, kitchenCalendar(plans, projections), 500)
    expect(summary.byDisposition).toEqual({ finishes: 1, customer_paused: 0, runs_past: 1, starts_after: 0, staff_pending: 0 })
    expect(summary.kitchenDays).toBe(15)
    expect(summary.kitchenCostAed).toBe(7500)
    expect(summary.mealsAfterWrapUp).toBe(3)
    expect(summary.lastKitchenDay).toBe('2026-09-30')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/contexts/season/domain/season-projection.test.ts`
Expected: FAIL with "Failed to resolve import './season-projection'".

- [ ] **Step 3: Write the implementation**

`src/contexts/season/domain/season-projection.ts`:

```ts
/**
 * Season projection: what the end of the season does to every live plan.
 *
 * Spec §6.1 (dispositions) and §6.2 (the buffer only cooks make-up meals that
 * hold a grant). Pure: the Season page feeds it live rows, and the SQL twin in
 * plan C must return the same answers for the same inputs.
 */

import { addDaysIso, isDeliveryDayIso, type SeasonWeekType } from './season-dates'

export type Disposition = 'finishes' | 'customer_paused' | 'runs_past' | 'starts_after' | 'staff_pending'
export type ProjectionStatus = 'Active' | 'Skipped' | 'Paused' | 'Scheduled'

export interface ProjectionPlan {
  id: string
  customerId: string
  planName: string
  status: ProjectionStatus
  startDate: string
  endDate: string
  weekType: SeasonWeekType
  mealsPerDay: number
  totalMeals: number
  deliveredMeals: number
  creditedSkipDays: number
  bufferGrants: number
  skippedDates: readonly string[]
  plannedPauseStart: string | null
  staffApproval: string | null
  lastDeliveryTickDate: string | null
}

export interface ProjectionContext {
  todayAe: string
  closureDates: ReadonlySet<string>
  wrapUpDay: string | null
  closeDay: string | null
}

export interface PlanProjection {
  planId: string
  disposition: Disposition
  /** Dates the kitchen will still cook for this plan under the season rules. */
  cookDates: string[]
  lastDinner: string | null
  /** Delivery days due after the wrap-up day that no buffer grant covers. */
  deliveriesAfterWrapUp: number
  mealsAfterWrapUp: number
  /** total − delivered − credited skip days × meals per day. */
  mealsLeft: number
}

export interface KitchenDay {
  date: string
  meals: number
  lastDinners: number
}

export interface SeasonSummary {
  byDisposition: Record<Disposition, number>
  kitchenDays: number
  kitchenCostAed: number
  mealsAfterWrapUp: number
  lastKitchenDay: string | null
}

// A plan cannot legitimately run longer than this; it bounds the walk, it is not a rule.
const MAX_WALK_DAYS = 400

export function remainingDeliveryDates(
  plan: ProjectionPlan,
  ctx: Pick<ProjectionContext, 'todayAe' | 'closureDates'>,
): string[] {
  let from = plan.startDate > ctx.todayAe ? plan.startDate : ctx.todayAe
  // Tonight's delivery already recorded: today is no longer remaining.
  if (plan.lastDeliveryTickDate && plan.lastDeliveryTickDate >= from) {
    from = addDaysIso(plan.lastDeliveryTickDate, 1)
  }
  const skipped = new Set(plan.skippedDates)
  const out: string[] = []
  let day = from
  for (let i = 0; i < MAX_WALK_DAYS && day <= plan.endDate; i++, day = addDaysIso(day, 1)) {
    if (!isDeliveryDayIso(day, plan.weekType)) continue
    if (ctx.closureDates.has(day) || skipped.has(day)) continue
    out.push(day)
  }
  return out
}

export function projectPlan(plan: ProjectionPlan, ctx: ProjectionContext): PlanProjection {
  const mealsLeft = Math.max(0, plan.totalMeals - plan.deliveredMeals - plan.creditedSkipDays * plan.mealsPerDay)
  const result = (
    disposition: Disposition,
    cookDates: string[],
    deliveriesAfterWrapUp: number,
    mealsAfterWrapUp: number,
  ): PlanProjection => ({
    planId: plan.id,
    disposition,
    cookDates,
    lastDinner: cookDates.length > 0 ? cookDates[cookDates.length - 1] : null,
    deliveriesAfterWrapUp,
    mealsAfterWrapUp,
    mealsLeft,
  })

  if (plan.status === 'Scheduled' && plan.staffApproval === 'pending') return result('staff_pending', [], 0, 0)
  if (plan.status === 'Paused') return result('customer_paused', [], 0, 0)

  const wrapUp = ctx.wrapUpDay
  const all = remainingDeliveryDates(plan, ctx)

  if (plan.plannedPauseStart && (!wrapUp || plan.plannedPauseStart <= wrapUp)) {
    const pauseStart = plan.plannedPauseStart
    return result('customer_paused', all.filter((d) => d < pauseStart && (!wrapUp || d <= wrapUp)), 0, 0)
  }

  if (!wrapUp) return result('finishes', all, 0, 0)

  const close = ctx.closeDay && ctx.closeDay > wrapUp ? ctx.closeDay : wrapUp
  const regular = all.filter((d) => d <= wrapUp)
  const afterWrapUp = all.filter((d) => d > wrapUp)
  const granted = afterWrapUp.filter((d) => d <= close).slice(0, Math.max(0, plan.bufferGrants))
  const notCooked = afterWrapUp.length - granted.length

  if (plan.status === 'Scheduled' && plan.startDate > wrapUp && granted.length === 0) {
    return result('starts_after', [], afterWrapUp.length, mealsLeft)
  }
  if (notCooked > 0) {
    return result('runs_past', [...regular, ...granted], notCooked, notCooked * plan.mealsPerDay)
  }
  return result('finishes', [...regular, ...granted], 0, 0)
}

export function lastMealOnTheBooks(projections: readonly PlanProjection[]): { date: string; planIds: string[] } | null {
  let date: string | null = null
  for (const p of projections) {
    if (p.lastDinner && (date === null || p.lastDinner > date)) date = p.lastDinner
  }
  if (date === null) return null
  const last = date
  return { date: last, planIds: projections.filter((p) => p.lastDinner === last).map((p) => p.planId) }
}

export function kitchenCalendar(plans: readonly ProjectionPlan[], projections: readonly PlanProjection[]): KitchenDay[] {
  const mealsPerDay = new Map(plans.map((p) => [p.id, p.mealsPerDay]))
  const days = new Map<string, KitchenDay>()
  for (const projection of projections) {
    const perDay = mealsPerDay.get(projection.planId)
    if (perDay === undefined) continue
    for (const date of projection.cookDates) {
      const row = days.get(date) ?? { date, meals: 0, lastDinners: 0 }
      row.meals += perDay
      if (date === projection.lastDinner) row.lastDinners += 1
      days.set(date, row)
    }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function summarizeSeason(
  projections: readonly PlanProjection[],
  calendar: readonly KitchenDay[],
  kitchenDailyCostAed: number,
): SeasonSummary {
  const byDisposition: Record<Disposition, number> = {
    finishes: 0, customer_paused: 0, runs_past: 0, starts_after: 0, staff_pending: 0,
  }
  let mealsAfterWrapUp = 0
  for (const p of projections) {
    byDisposition[p.disposition] += 1
    mealsAfterWrapUp += p.mealsAfterWrapUp
  }
  return {
    byDisposition,
    kitchenDays: calendar.length,
    kitchenCostAed: calendar.length * kitchenDailyCostAed,
    mealsAfterWrapUp,
    lastKitchenDay: calendar.length > 0 ? calendar[calendar.length - 1].date : null,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/contexts/season/domain/season-projection.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/season/domain/season-projection.ts src/contexts/season/domain/season-projection.test.ts
git commit -m "feat(season): project every live plan against a wrap-up day, with a kitchen calendar

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Meal value

**Files:**
- Create: `src/contexts/season/domain/meal-value.ts`
- Test: `src/contexts/season/domain/meal-value.test.ts`

**Interfaces:**
- Produces:
  - `interface OrderMoney { amountPaidFils: number | null; creditAppliedFils: number | null; mealsCount: number | null; pricePerMealAed: number | null }`
  - `type MealValue = { fils: number; exact: boolean } | null`
  - `mealValueOf(order: OrderMoney): MealValue`
  - `formatAed(fils: number): string` (e.g. `1800` → `"AED 18"`, `1850` → `"AED 18.50"`)

- [ ] **Step 1: Write the failing test**

`src/contexts/season/domain/meal-value.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mealValueOf, formatAed } from './meal-value'

describe('mealValueOf', () => {
  it('uses what was paid when the order records it', () => {
    expect(mealValueOf({ amountPaidFils: 43200, creditAppliedFils: 0, mealsCount: 24, pricePerMealAed: 19 })).toEqual({ fils: 1800, exact: true })
  })

  it('counts wallet credit used as part of what was paid', () => {
    expect(mealValueOf({ amountPaidFils: 41200, creditAppliedFils: 2000, mealsCount: 24, pricePerMealAed: 19 })).toEqual({ fils: 1800, exact: true })
  })

  it('rounds down to the fils', () => {
    expect(mealValueOf({ amountPaidFils: 10000, creditAppliedFils: 0, mealsCount: 3, pricePerMealAed: null })).toEqual({ fils: 3333, exact: true })
  })

  it('falls back to the pre-discount rate as an estimate', () => {
    expect(mealValueOf({ amountPaidFils: null, creditAppliedFils: null, mealsCount: 24, pricePerMealAed: 18 })).toEqual({ fils: 1800, exact: false })
  })

  it('knows nothing without meals or money', () => {
    expect(mealValueOf({ amountPaidFils: 43200, creditAppliedFils: 0, mealsCount: 0, pricePerMealAed: 18 })).toBeNull()
    expect(mealValueOf({ amountPaidFils: null, creditAppliedFils: null, mealsCount: 24, pricePerMealAed: null })).toBeNull()
  })
})

describe('formatAed', () => {
  it('drops .00 and keeps real fils', () => {
    expect(formatAed(1800)).toBe('AED 18')
    expect(formatAed(1850)).toBe('AED 18.50')
    expect(formatAed(0)).toBe('AED 0')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/contexts/season/domain/meal-value.test.ts`
Expected: FAIL with "Failed to resolve import './meal-value'".

- [ ] **Step 3: Write the implementation**

`src/contexts/season/domain/meal-value.ts`:

```ts
/**
 * Meal value: what one meal of an order was actually worth to the customer.
 *
 * Spec §10.1. (cash charged + wallet credit used) ÷ meals in the order, rounded
 * down to the fils. orders.price_per_meal is the PRE-discount rate, so it only
 * ever serves as a labelled estimate until plan D backfills the real amounts.
 */

export interface OrderMoney {
  amountPaidFils: number | null
  creditAppliedFils: number | null
  mealsCount: number | null
  pricePerMealAed: number | null
}

export type MealValue = { fils: number; exact: boolean } | null

export function mealValueOf(order: OrderMoney): MealValue {
  const meals = order.mealsCount ?? 0
  if (meals <= 0) return null
  if (order.amountPaidFils != null && order.creditAppliedFils != null) {
    return { fils: Math.floor((order.amountPaidFils + order.creditAppliedFils) / meals), exact: true }
  }
  if (order.pricePerMealAed != null && order.pricePerMealAed > 0) {
    return { fils: Math.round(order.pricePerMealAed * 100), exact: false }
  }
  return null
}

export function formatAed(fils: number): string {
  const whole = fils % 100 === 0
  return `AED ${whole ? String(fils / 100) : (fils / 100).toFixed(2)}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/contexts/season/domain/meal-value.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/season/domain/meal-value.ts src/contexts/season/domain/meal-value.test.ts
git commit -m "feat(season): meal value from what the order really paid, estimate otherwise

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Foundation schema (live, additive)

**Files:**
- Create: `supabase/migrations/20260914173304_season_wind_down_foundation.sql`

**Interfaces:**
- Produces (live database):
  - `intake_settings`: `season_phase text not null default 'open'` (check `open|winding_down|break`), `wrap_up_day date`, `buffer_delivery_days smallint not null default 1` (0 to 3), `close_day date` (null together with `wrap_up_day`, and `>= wrap_up_day`), `sales_stopped_at timestamptz`, `break_started_at timestamptz`, `kitchen_daily_cost_aed numeric not null default 500`.
  - `subscriptions`: `credited_skip_days smallint not null default 0`, `season_buffer_grants smallint not null default 0`, `season_hold_id uuid` (FK `season_holds`).
  - `season_holds` table (columns below), RLS on, customers read their own rows, service role writes.
  - `credits`: `subscription_id uuid` (FK), `meal_date date`, unique partial index `credits_one_season_skip_per_meal` on `(subscription_id, meal_date) where source = 'season_skip'`.
  - `orders`: `amount_paid_fils integer`, `credit_applied_fils integer`, `refund_reason text` (check `season_hold`).
  - Live row takeover: a row with `paused = true` becomes `season_phase = 'winding_down'` with `sales_stopped_at = paused_at`.

Notes for the implementer:
- `subscriptions` gives `authenticated` table-level SELECT but column-level UPDATE. New columns therefore become readable by customers and NOT writable by them. That is intended; later plans write these columns with the service role.
- `credits` and `orders` rely on RLS (their table grants are broad); the new columns inherit that.

- [ ] **Step 1: Confirm the live starting point**

Run with `execute_sql` (project `yjjayivwfqjfppawgyaz`):

```sql
select paused, paused_at is not null as has_paused_at, pause_scheduled_for, cycle_started_at is not null as has_cycle
from public.intake_settings;
select column_name from information_schema.columns
where table_schema = 'public' and table_name in ('intake_settings','subscriptions','credits','orders')
  and column_name in ('season_phase','credited_skip_days','meal_date','amount_paid_fils');
select to_regclass('public.season_holds') as season_holds;
```

Expected: `paused = true`, `has_paused_at = true`, `pause_scheduled_for = null`, `has_cycle = true`; zero rows from the column query; `season_holds` null. If the columns already exist, stop and report instead of continuing.

- [ ] **Step 2: Write the migration file**

`supabase/migrations/20260914173304_season_wind_down_foundation.sql`:

```sql
-- ============================================================================
-- Season wind-down foundation (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md
-- §5.1, §5.2, §10.1, §10.2, §13.1). Additive only: no function, trigger or
-- cron change, and no existing column is altered. Behaviour is unchanged
-- while no wrap-up day is set.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_wind_down_foundation`. This file is the mirror.
-- ============================================================================

BEGIN;

-- ── intake_settings: the season ─────────────────────────────────────────────
ALTER TABLE public.intake_settings
  ADD COLUMN IF NOT EXISTS season_phase text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS wrap_up_day date,
  ADD COLUMN IF NOT EXISTS buffer_delivery_days smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS close_day date,
  ADD COLUMN IF NOT EXISTS sales_stopped_at timestamptz,
  ADD COLUMN IF NOT EXISTS break_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS kitchen_daily_cost_aed numeric NOT NULL DEFAULT 500;

ALTER TABLE public.intake_settings
  DROP CONSTRAINT IF EXISTS intake_settings_season_phase_check,
  ADD CONSTRAINT intake_settings_season_phase_check
    CHECK (season_phase IN ('open', 'winding_down', 'break')),
  DROP CONSTRAINT IF EXISTS intake_settings_buffer_check,
  ADD CONSTRAINT intake_settings_buffer_check
    CHECK (buffer_delivery_days BETWEEN 0 AND 3),
  DROP CONSTRAINT IF EXISTS intake_settings_kitchen_cost_check,
  ADD CONSTRAINT intake_settings_kitchen_cost_check
    CHECK (kitchen_daily_cost_aed >= 0),
  DROP CONSTRAINT IF EXISTS intake_settings_season_dates_check,
  ADD CONSTRAINT intake_settings_season_dates_check
    CHECK (
      (wrap_up_day IS NULL AND close_day IS NULL)
      OR (wrap_up_day IS NOT NULL AND close_day IS NOT NULL AND close_day >= wrap_up_day)
    );

COMMENT ON COLUMN public.intake_settings.season_phase IS
  'open | winding_down | break. Written only by the season_* transition functions.';
COMMENT ON COLUMN public.intake_settings.wrap_up_day IS
  'W: last day of regular deliveries and the last day a new plan may deliver. Kept through the break.';
COMMENT ON COLUMN public.intake_settings.close_day IS
  'K: W moved forward by buffer_delivery_days Monday-to-Saturday days. The break starts the night after K.';

-- Take over a sales pause that predates the season model (spec §5.2): it is a
-- wind-down with sales stopped and no wrap-up day yet. The break never starts
-- until a wrap-up day is set, which is exactly today's behaviour.
UPDATE public.intake_settings
SET season_phase = 'winding_down',
    sales_stopped_at = COALESCE(paused_at, now()),
    updated_at = now()
WHERE paused = true
  AND season_phase = 'open';

-- ── season_holds ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.season_holds (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id       uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  customer_id           uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id              uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  cycle_started_at      timestamptz NOT NULL,
  reason                text NOT NULL CHECK (reason IN ('season', 'customer_pause')),
  state                 text NOT NULL DEFAULT 'held' CHECK (state IN (
                          'held', 'paused_by_customer', 'ready', 'refund_requested',
                          'refund_processing', 'refunded', 'refund_failed', 'released')),
  held_meals            integer NOT NULL CHECK (held_meals >= 0),
  meal_value_fils       integer CHECK (meal_value_fils >= 0),
  cash_refund_fils      integer CHECK (cash_refund_fils >= 0),
  credit_share_fils     integer CHECK (credit_share_fils >= 0),
  waitlist_credit_id    uuid REFERENCES public.credits(id) ON DELETE SET NULL,
  refund_requested_at   timestamptz,
  refund_decided_by     text,
  refund_decline_reason text,
  stripe_refund_id      text,
  credit_return_id      uuid REFERENCES public.credits(id) ON DELETE SET NULL,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  ready_at              timestamptz,
  released_at           timestamptz,
  refunded_at           timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT season_holds_one_per_plan_per_season UNIQUE (subscription_id, cycle_started_at)
);

CREATE INDEX IF NOT EXISTS season_holds_customer_idx ON public.season_holds (customer_id);
CREATE INDEX IF NOT EXISTS season_holds_open_state_idx ON public.season_holds (state)
  WHERE state NOT IN ('released', 'refunded');

ALTER TABLE public.season_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.season_holds FROM anon, authenticated;
GRANT SELECT ON public.season_holds TO authenticated;
GRANT ALL ON public.season_holds TO service_role;
DROP POLICY IF EXISTS season_holds_own_read ON public.season_holds;
CREATE POLICY season_holds_own_read ON public.season_holds
  FOR SELECT TO authenticated USING (customer_id = auth.uid());

COMMENT ON TABLE public.season_holds IS
  'One row per plan per season whose meals were still owed when the break started (spec §6.3). Money trail for keep / refund.';

-- ── subscriptions ───────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS credited_skip_days smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS season_buffer_grants smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS season_hold_id uuid REFERENCES public.season_holds(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_credited_skip_days_check,
  ADD CONSTRAINT subscriptions_credited_skip_days_check CHECK (credited_skip_days >= 0),
  DROP CONSTRAINT IF EXISTS subscriptions_season_buffer_grants_check,
  ADD CONSTRAINT subscriptions_season_buffer_grants_check CHECK (season_buffer_grants >= 0);

COMMENT ON COLUMN public.subscriptions.credited_skip_days IS
  'Skips turned into wallet credit instead of a make-up day (spec §7.2). Never moves end_date.';
COMMENT ON COLUMN public.subscriptions.season_buffer_grants IS
  'Make-up meals allowed to cook on a buffer day between the wrap-up day and the close day (spec §6.2).';

-- ── credits ─────────────────────────────────────────────────────────────────
ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meal_date date;

CREATE UNIQUE INDEX IF NOT EXISTS credits_one_season_skip_per_meal
  ON public.credits (subscription_id, meal_date)
  WHERE source = 'season_skip';

-- ── orders ──────────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS amount_paid_fils integer CHECK (amount_paid_fils >= 0),
  ADD COLUMN IF NOT EXISTS credit_applied_fils integer CHECK (credit_applied_fils >= 0),
  ADD COLUMN IF NOT EXISTS refund_reason text CHECK (refund_reason IN ('season_hold'));

COMMENT ON COLUMN public.orders.amount_paid_fils IS 'Stripe amount_total in fils (0 for a credit-only order). Spec §10.1.';
COMMENT ON COLUMN public.orders.credit_applied_fils IS 'Wallet credit applied to this order in fils. Spec §10.1.';

COMMIT;
```

- [ ] **Step 3: Apply it live**

Use the Supabase connector `apply_migration` with project `yjjayivwfqjfppawgyaz`, name `season_wind_down_foundation`, and the file content WITHOUT the `BEGIN;` / `COMMIT;` lines.
Expected: success.

- [ ] **Step 4: Verify the live result**

```sql
select season_phase, paused, sales_stopped_at is not null as sales_stopped, wrap_up_day, close_day, buffer_delivery_days, kitchen_daily_cost_aed
from public.intake_settings;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'subscriptions' and column_name in ('credited_skip_days','season_buffer_grants','season_hold_id'))
    or (table_name = 'credits' and column_name in ('subscription_id','meal_date'))
    or (table_name = 'orders' and column_name in ('amount_paid_fils','credit_applied_fils','refund_reason')))
order by 1, 2;

select grantee, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'season_holds' and grantee in ('anon','authenticated','service_role')
group by grantee order by grantee;

select count(*) filter (where status in ('Active','Paused','Skipped','Scheduled')) as live_plans,
       count(*) filter (where credited_skip_days <> 0 or season_buffer_grants <> 0 or season_hold_id is not null) as touched
from public.subscriptions;
```

Expected:
- `winding_down | true | true | null | null | 1 | 500`
- 8 column rows; `credited_skip_days` and `season_buffer_grants` are `NO` nullable with default `0`.
- `season_holds` grants: `authenticated` SELECT only; `service_role` all; no `anon` row.
- `touched = 0`, and `live_plans` equals the count before the migration (3 on 2026-09-14).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260914173304_season_wind_down_foundation.sql
git commit -m "feat(season): season columns, season_holds, and money columns on orders and credits

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Season transition functions (live SQL)

**Files:**
- Create: `supabase/migrations/20260914173723_season_transitions.sql`

**Interfaces:**
- Consumes: the columns from Task 4 (`season_phase`, `wrap_up_day`, `buffer_delivery_days`, `close_day`, `sales_stopped_at`), existing `public.ae_today()`.
- Produces (all `SECURITY DEFINER`, execute revoked from `public, anon, authenticated`; service role only):
  - `public.season_close_day(p_wrap_up date, p_buffer integer) returns date`
  - `public.season_schedule_end(p_wrap_up date, p_buffer integer, p_actor text) returns jsonb`
  - `public.season_move_end(p_wrap_up date, p_buffer integer, p_actor text) returns jsonb`
  - `public.season_clear_end(p_actor text) returns jsonb`
  - `public.season_stop_sales(p_actor text) returns jsonb`
  - `public.season_resume_sales(p_actor text) returns jsonb`
  - `public.season_end_today(p_actor text) returns jsonb`
  - Replaced body of `public.intake_scheduled_pause_tick()` (same signature `returns table(flipped boolean, cleared_only boolean)`, same cron job `intake_scheduled_pause_00_15_ae`).
  - Every refusal raises an exception whose message starts with `SEASON_BAD_PHASE`, `SEASON_INVALID_DATE` or `SEASON_NO_SETTINGS`.
  - Every function returns `jsonb` with keys `phase`, `wrap_up_day`, `close_day`, `buffer`, `sales_stopped`.

- [ ] **Step 1: Read the live tick before replacing it**

Run through the Supabase connector (`execute_sql`, project `yjjayivwfqjfppawgyaz`):

```sql
select pg_get_functiondef('public.intake_scheduled_pause_tick'::regproc);
```

Expected: the body that flips `paused`, stamps `paused_by = 'schedule'` and `cycle_started_at = now()`, and clears `pause_scheduled_for` when `pause_scheduled_for < today_ae`. If it differs from that description, stop and report the difference instead of continuing.

- [ ] **Step 2: Write the migration file**

`supabase/migrations/20260914173723_season_transitions.sql`:

```sql
-- ============================================================================
-- Season transitions (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md §5).
--
-- One function per admin transition. Each locks the singleton intake_settings
-- row, checks its guard, and writes the season columns AND the legacy
-- compatibility columns (paused, paused_at, paused_by, pause_scheduled_for,
-- cycle_started_at, cycle_ended_at) so every existing reader keeps working.
-- Audit logging happens in the TypeScript caller (logAdminAction).
--
-- Also replaces intake_scheduled_pause_tick: under the season model, passing
-- the wrap-up day closes sales but keeps the phase, the wrap-up day and the
-- season epoch. The break itself arrives with plan C.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_transitions`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.season_close_day(p_wrap_up date, p_buffer integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_day  date := p_wrap_up;
  v_left integer := GREATEST(0, COALESCE(p_buffer, 0));
BEGIN
  WHILE v_left > 0 LOOP
    v_day := v_day + 1;
    IF EXTRACT(isodow FROM v_day)::int <> 7 THEN
      v_left := v_left - 1;
    END IF;
  END LOOP;
  RETURN v_day;
END;
$$;

CREATE OR REPLACE FUNCTION public._season_check_end_dates(p_wrap_up date, p_buffer integer, p_today date)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_wrap_up IS NULL OR p_wrap_up <= p_today THEN
    RAISE EXCEPTION 'SEASON_INVALID_DATE: wrap-up day % must be after %', p_wrap_up, p_today;
  END IF;
  IF p_wrap_up > p_today + 370 THEN
    RAISE EXCEPTION 'SEASON_INVALID_DATE: wrap-up day % is more than 370 days away', p_wrap_up;
  END IF;
  IF EXTRACT(isodow FROM p_wrap_up)::int = 7 THEN
    RAISE EXCEPTION 'SEASON_INVALID_DATE: wrap-up day % is a Sunday', p_wrap_up;
  END IF;
  IF p_buffer IS NULL OR p_buffer < 0 OR p_buffer > 3 THEN
    RAISE EXCEPTION 'SEASON_INVALID_DATE: buffer % must be 0 to 3', p_buffer;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._season_state(p_row public.intake_settings)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'phase', p_row.season_phase,
    'wrap_up_day', p_row.wrap_up_day,
    'close_day', p_row.close_day,
    'buffer', p_row.buffer_delivery_days,
    'sales_stopped', p_row.sales_stopped_at IS NOT NULL
  );
$$;

-- open, or the legacy wind-down with no wrap-up day  →  winding_down with W and K.
CREATE OR REPLACE FUNCTION public.season_schedule_end(p_wrap_up date, p_buffer integer, p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.intake_settings;
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

  RETURN public._season_state(r);
END;
$$;

-- winding_down with a wrap-up day still ahead  →  new W and K.
CREATE OR REPLACE FUNCTION public.season_move_end(p_wrap_up date, p_buffer integer, p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.intake_settings;
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

  RETURN public._season_state(r);
END;
$$;

-- winding_down with a wrap-up day  →  open (sales running) or the legacy
-- wind-down with no wrap-up day (sales already stopped).
CREATE OR REPLACE FUNCTION public.season_clear_end(p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.intake_settings;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF NOT (r.season_phase = 'winding_down' AND r.wrap_up_day IS NOT NULL) THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: nothing to clear in % (wrap-up day %)', r.season_phase, r.wrap_up_day;
  END IF;

  IF r.sales_stopped_at IS NOT NULL THEN
    UPDATE public.intake_settings SET
      wrap_up_day = NULL, close_day = NULL, pause_scheduled_for = NULL, updated_at = now()
    WHERE id = r.id
    RETURNING * INTO r;
  ELSE
    UPDATE public.intake_settings SET
      season_phase = 'open',
      wrap_up_day = NULL, close_day = NULL, pause_scheduled_for = NULL,
      cycle_ended_at = now(),
      updated_at = now()
    WHERE id = r.id
    RETURNING * INTO r;
  END IF;

  RETURN public._season_state(r);
END;
$$;

-- open, or winding_down with sales running and the wrap-up day still ahead
-- →  sales stopped now. From open this starts a season with no wrap-up day.
CREATE OR REPLACE FUNCTION public.season_stop_sales(p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.intake_settings;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF NOT (
    r.season_phase = 'open'
    OR (r.season_phase = 'winding_down' AND r.sales_stopped_at IS NULL AND COALESCE(r.wrap_up_day > public.ae_today(), false))
  ) THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: cannot stop sales from % (sales stopped %, wrap-up day %)', r.season_phase, r.sales_stopped_at, r.wrap_up_day;
  END IF;

  UPDATE public.intake_settings SET
    season_phase = 'winding_down',
    sales_stopped_at = now(),
    paused = true,
    paused_at = now(),
    paused_by = p_actor,
    cycle_started_at = CASE WHEN r.season_phase = 'open' THEN now() ELSE r.cycle_started_at END,
    updated_at = now()
  WHERE id = r.id
  RETURNING * INTO r;

  RETURN public._season_state(r);
END;
$$;

-- winding_down with sales stopped  →  sales running again. With no wrap-up
-- day that is a full reopen (phase open, cycle_ended_at stamped, exactly what
-- the old Resume button did). With a wrap-up day still ahead the taper resumes.
CREATE OR REPLACE FUNCTION public.season_resume_sales(p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.intake_settings;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF NOT (
    r.season_phase = 'winding_down' AND r.sales_stopped_at IS NOT NULL
    AND (r.wrap_up_day IS NULL OR r.wrap_up_day > public.ae_today())
  ) THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: cannot resume sales from % (sales stopped %, wrap-up day %)', r.season_phase, r.sales_stopped_at, r.wrap_up_day;
  END IF;

  IF r.wrap_up_day IS NULL THEN
    UPDATE public.intake_settings SET
      season_phase = 'open',
      sales_stopped_at = NULL,
      paused = false,
      paused_at = NULL,
      cycle_ended_at = now(),
      updated_at = now()
    WHERE id = r.id
    RETURNING * INTO r;
  ELSE
    UPDATE public.intake_settings SET
      sales_stopped_at = NULL,
      paused = false,
      paused_at = NULL,
      updated_at = now()
    WHERE id = r.id
    RETURNING * INTO r;
  END IF;

  RETURN public._season_state(r);
END;
$$;

-- open or winding_down  →  W = K = today, buffer 0, sales stopped. Tonight's
-- deliveries still run; plan C's break tick starts the break after tonight.
CREATE OR REPLACE FUNCTION public.season_end_today(p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.intake_settings;
  v_today date := public.ae_today();
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

  RETURN public._season_state(r);
END;
$$;

-- Interim scheduled-pause tick (00:15 AE). Season model: once the wrap-up day
-- has passed, sales close; the phase, the wrap-up day and the season epoch are
-- kept. Legacy model (a pause_scheduled_for written while the phase is open,
-- which the new functions never do) keeps its original behaviour.
CREATE OR REPLACE FUNCTION public.intake_scheduled_pause_tick()
RETURNS TABLE(flipped boolean, cleared_only boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_ae date := (now() at time zone 'Asia/Dubai')::date;
  r public.intake_settings;
BEGIN
  flipped := false; cleared_only := false;

  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEXT; RETURN;
  END IF;

  IF r.season_phase = 'winding_down' AND r.wrap_up_day IS NOT NULL AND r.wrap_up_day < today_ae THEN
    IF NOT r.paused THEN
      UPDATE public.intake_settings SET
        paused = true,
        paused_at = now(),
        paused_by = 'schedule',
        sales_stopped_at = COALESCE(r.sales_stopped_at, now()),
        updated_at = now()
      WHERE id = r.id;
      flipped := true;
    END IF;
    RETURN NEXT; RETURN;
  END IF;

  IF r.season_phase = 'open' AND r.pause_scheduled_for IS NOT NULL AND r.pause_scheduled_for < today_ae THEN
    IF r.paused THEN
      UPDATE public.intake_settings SET pause_scheduled_for = NULL, updated_at = now() WHERE id = r.id;
      cleared_only := true;
    ELSE
      UPDATE public.intake_settings SET
        paused = true,
        paused_at = now(),
        paused_by = 'schedule',
        cycle_started_at = now(),
        pause_scheduled_for = NULL,
        updated_at = now()
      WHERE id = r.id AND paused = false;
      flipped := true;
    END IF;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_close_day(date, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._season_check_end_dates(date, integer, date) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._season_state(public.intake_settings) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_schedule_end(date, integer, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_move_end(date, integer, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_clear_end(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_stop_sales(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_resume_sales(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_end_today(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intake_scheduled_pause_tick() FROM public, anon, authenticated;

COMMIT;
```

- [ ] **Step 3: Apply it live**

Use the Supabase connector `apply_migration` with project `yjjayivwfqjfppawgyaz`, name `season_transitions`, and the file content WITHOUT the `BEGIN;` / `COMMIT;` lines (the connector wraps the migration in its own transaction).
Expected: success, and `list_migrations` shows `season_transitions`.

- [ ] **Step 4: Rehearse every transition inside a transaction that rolls itself back**

Run with `execute_sql`. The block raises at the end on purpose, so nothing it does is kept; the error text is the test report.

```sql
DO $$
DECLARE
  v_today date := public.ae_today();
  v_w date := public.ae_today() + 14;
  v_w2 date;
  s public.intake_settings;
  v_cycle timestamptz;
  v_log text := '';
BEGIN
  IF EXTRACT(isodow FROM v_w)::int = 7 THEN v_w := v_w + 1; END IF;
  v_w2 := v_w + 1;
  IF EXTRACT(isodow FROM v_w2)::int = 7 THEN v_w2 := v_w2 + 1; END IF;

  -- Start from the live takeover state: winding_down, sales stopped, no W.
  UPDATE public.intake_settings SET season_phase = 'winding_down', sales_stopped_at = now(), paused = true, wrap_up_day = NULL, close_day = NULL, pause_scheduled_for = NULL;

  PERFORM public.season_resume_sales('plan-a-test');
  SELECT * INTO s FROM public.intake_settings;
  IF s.season_phase <> 'open' OR s.paused OR s.cycle_ended_at IS NULL THEN RAISE EXCEPTION 'FAIL resume_sales %', row_to_json(s); END IF;
  v_log := v_log || 'resume_sales ok; ';

  PERFORM public.season_schedule_end(v_w, 1, 'plan-a-test');
  SELECT * INTO s FROM public.intake_settings;
  IF s.season_phase <> 'winding_down' OR s.wrap_up_day <> v_w OR s.close_day <> public.season_close_day(v_w, 1)
     OR s.pause_scheduled_for <> v_w OR s.paused THEN RAISE EXCEPTION 'FAIL schedule %', row_to_json(s); END IF;
  v_cycle := s.cycle_started_at;
  v_log := v_log || 'schedule ok; ';

  PERFORM public.season_move_end(v_w2, 0, 'plan-a-test');
  SELECT * INTO s FROM public.intake_settings;
  IF s.wrap_up_day <> v_w2 OR s.close_day <> v_w2 OR s.cycle_started_at <> v_cycle THEN RAISE EXCEPTION 'FAIL move %', row_to_json(s); END IF;
  v_log := v_log || 'move ok; ';

  PERFORM public.season_stop_sales('plan-a-test');
  SELECT * INTO s FROM public.intake_settings;
  IF NOT s.paused OR s.sales_stopped_at IS NULL OR s.season_phase <> 'winding_down' THEN RAISE EXCEPTION 'FAIL stop_sales %', row_to_json(s); END IF;
  v_log := v_log || 'stop_sales ok; ';

  PERFORM public.season_resume_sales('plan-a-test');
  SELECT * INTO s FROM public.intake_settings;
  IF s.paused OR s.sales_stopped_at IS NOT NULL OR s.season_phase <> 'winding_down' OR s.wrap_up_day <> v_w2 THEN RAISE EXCEPTION 'FAIL resume taper %', row_to_json(s); END IF;
  v_log := v_log || 'resume taper ok; ';

  PERFORM public.season_clear_end('plan-a-test');
  SELECT * INTO s FROM public.intake_settings;
  IF s.season_phase <> 'open' OR s.wrap_up_day IS NOT NULL OR s.pause_scheduled_for IS NOT NULL THEN RAISE EXCEPTION 'FAIL clear %', row_to_json(s); END IF;
  v_log := v_log || 'clear ok; ';

  PERFORM public.season_end_today('plan-a-test');
  SELECT * INTO s FROM public.intake_settings;
  IF s.wrap_up_day <> v_today OR s.close_day <> v_today OR NOT s.paused OR s.buffer_delivery_days <> 0 THEN RAISE EXCEPTION 'FAIL end_today %', row_to_json(s); END IF;
  v_log := v_log || 'end_today ok; ';

  BEGIN
    PERFORM public.season_schedule_end(v_w, 1, 'plan-a-test');
    RAISE EXCEPTION 'FAIL schedule was allowed after end_today';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SEASON_BAD_PHASE%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'bad phase refused ok; ';

  BEGIN
    PERFORM public._season_check_end_dates(v_today, 1, v_today);
    RAISE EXCEPTION 'FAIL today accepted as a wrap-up day';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SEASON_INVALID_DATE%' THEN RAISE; END IF;
  END;
  v_log := v_log || 'invalid date refused ok; ';

  -- Interim tick: a wrap-up day in the past closes sales and keeps the season.
  UPDATE public.intake_settings SET wrap_up_day = v_today - 1, close_day = v_today - 1, paused = false, sales_stopped_at = NULL, cycle_started_at = v_cycle;
  PERFORM public.intake_scheduled_pause_tick();
  SELECT * INTO s FROM public.intake_settings;
  IF NOT s.paused OR s.paused_by <> 'schedule' OR s.season_phase <> 'winding_down' OR s.wrap_up_day <> v_today - 1 OR s.cycle_started_at <> v_cycle THEN
    RAISE EXCEPTION 'FAIL interim tick %', row_to_json(s);
  END IF;
  v_log := v_log || 'interim tick ok; ';

  RAISE EXCEPTION 'SEASON_TRANSITIONS_OK: %', v_log;
END;
$$;
```

Expected: an error whose message is `SEASON_TRANSITIONS_OK: resume_sales ok; schedule ok; move ok; stop_sales ok; resume taper ok; clear ok; end_today ok; bad phase refused ok; invalid date refused ok; interim tick ok;`. Any message starting with `FAIL` is a real failure: fix the function, re-apply, and re-run.

Then confirm the live row is untouched:

```sql
select season_phase, paused, wrap_up_day, close_day, sales_stopped_at is not null as sales_stopped from public.intake_settings;
```

Expected: `winding_down | true | null | null | true`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260914173723_season_transitions.sql
git commit -m "feat(season): SQL owns every season change, and passing the wrap-up day keeps the season

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Season transitions in TypeScript, intake state, admin actions

**Files:**
- Create: `src/contexts/season/domain/season-errors.ts`
- Test: `src/contexts/season/domain/season-errors.test.ts`
- Create: `src/contexts/season/usecases/season-transitions.ts`
- Test: `src/contexts/season/usecases/season-transitions.test.ts`
- Modify: `src/infra/config/intake.ts`
- Modify: `src/infra/config/intake.test.ts`
- Modify: `src/infra/config/intake-cache.test.ts`
- Modify: `src/contexts/subscriptions/usecases/subscription-mutations.test.ts` (the `intakeState()` fixture helper near line 113)
- Modify: `src/app/admin/season/actions.ts`
- Modify: `src/app/admin/season/SeasonClient.tsx` (rewire the four old handlers only; the full UI comes in Task 7)

**Interfaces:**
- Consumes: `validateSeasonEnd`, `todayAeIso`, `DEFAULT_BUFFER_DAYS` (Task 1); `SeasonPhase` (Task 1); SQL functions from Task 5.
- Produces:
  - `friendlySeasonError(message: string | null | undefined): string`, `SEASON_ERROR_FALLBACK: string`
  - `type SeasonTransitionResult = { ok: true } | { error: string }`
  - `scheduleSeasonEnd(adminEmail: string, wrapUpDay: string, bufferDays: number): Promise<SeasonTransitionResult>`
  - `moveSeasonEnd(adminEmail: string, wrapUpDay: string, bufferDays: number): Promise<SeasonTransitionResult>`
  - `clearSeasonEnd(adminEmail: string): Promise<SeasonTransitionResult>`
  - `stopSeasonSales(adminEmail: string): Promise<SeasonTransitionResult>`
  - `resumeSeasonSales(adminEmail: string): Promise<SeasonTransitionResult>`
  - `endSeasonToday(adminEmail: string): Promise<SeasonTransitionResult>`
  - `IntakeState` gains `phase: SeasonPhase`, `wrapUpDay: string | null`, `bufferDays: number`, `closeDay: string | null`, `salesStopped: boolean`
  - Server actions in `src/app/admin/season/actions.ts`: `scheduleSeasonEndAction(wrapUpDay: string, bufferDays: number)`, `moveSeasonEndAction(wrapUpDay: string, bufferDays: number)`, `clearSeasonEndAction()`, `stopSeasonSalesAction()`, `resumeSeasonSalesAction()`, `endSeasonTodayAction()`, each returning `Promise<SeasonTransitionResult>`. `setIntakePaused`, `scheduleIntakePause` and `clearScheduledIntakePause` are deleted.

- [ ] **Step 1: Write the failing tests**

`src/contexts/season/domain/season-errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { friendlySeasonError, SEASON_ERROR_FALLBACK } from './season-errors'

describe('friendlySeasonError', () => {
  it('explains a refused phase change', () => {
    expect(friendlySeasonError('SEASON_BAD_PHASE: cannot move from open (wrap-up day <NULL>)'))
      .toBe('The season changed while you were looking. Refresh the page and try again.')
  })

  it('explains a refused date', () => {
    expect(friendlySeasonError('SEASON_INVALID_DATE: wrap-up day 2026-10-04 is a Sunday'))
      .toBe('That wrap-up day cannot be used. Pick a Monday to Saturday date from tomorrow, within a year, with a buffer of 0 to 3 days.')
  })

  it('explains a missing settings row', () => {
    expect(friendlySeasonError('SEASON_NO_SETTINGS')).toBe('The season settings row is missing, so nothing was changed.')
  })

  it('never shows a raw database message', () => {
    expect(friendlySeasonError('connection terminated unexpectedly')).toBe(SEASON_ERROR_FALLBACK)
    expect(friendlySeasonError(null)).toBe(SEASON_ERROR_FALLBACK)
  })
})
```

`src/contexts/season/usecases/season-transitions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { rpcMock, invalidateMock, auditMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  invalidateMock: vi.fn(),
  auditMock: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ rpc: rpcMock }) }))
vi.mock('@/infra/config/intake', () => ({ invalidateIntakeCache: invalidateMock }))
vi.mock('@/contexts/admin/usecases/audit', () => ({ logAdminAction: auditMock }))

import { scheduleSeasonEnd, moveSeasonEnd, clearSeasonEnd, stopSeasonSales, resumeSeasonSales, endSeasonToday } from './season-transitions'

const ADMIN = 'admin@dormers.ae'

beforeEach(() => {
  rpcMock.mockReset()
  invalidateMock.mockReset()
  auditMock.mockReset()
  vi.useFakeTimers()
  // 12:00 in Dubai on Monday 14 Sep 2026.
  vi.setSystemTime(new Date('2026-09-14T08:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('season transitions', () => {
  it('refuses a bad wrap-up day before touching the database', async () => {
    expect(await scheduleSeasonEnd(ADMIN, '2026-10-04', 1)).toEqual({ error: 'Pick a delivery day. Sunday is not one.' })
    expect(await moveSeasonEnd(ADMIN, '2026-09-14', 1)).toEqual({ error: 'The wrap-up day has to be tomorrow or later.' })
    expect(rpcMock).not.toHaveBeenCalled()
    expect(invalidateMock).not.toHaveBeenCalled()
  })

  it('schedules through the SQL function, audits the result, and drops the cache', async () => {
    rpcMock.mockResolvedValue({ data: { phase: 'winding_down' }, error: null })
    expect(await scheduleSeasonEnd(ADMIN, '2026-10-03', 1)).toEqual({ ok: true })
    expect(rpcMock).toHaveBeenCalledWith('season_schedule_end', { p_wrap_up: '2026-10-03', p_buffer: 1, p_actor: ADMIN })
    expect(invalidateMock).toHaveBeenCalledTimes(1)
    expect(auditMock).toHaveBeenCalledWith(ADMIN, 'season_end_scheduled', 'intake_settings', 'singleton', {
      p_wrap_up: '2026-10-03', p_buffer: 1, state: { phase: 'winding_down' },
    })
  })

  it('turns a refusal into admin copy, still drops the cache, and does not audit', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'SEASON_BAD_PHASE: nothing to clear in open' } })
    expect(await clearSeasonEnd(ADMIN)).toEqual({ error: 'The season changed while you were looking. Refresh the page and try again.' })
    expect(invalidateMock).toHaveBeenCalledTimes(1)
    expect(auditMock).not.toHaveBeenCalled()
  })

  it('calls the right function for every action', async () => {
    rpcMock.mockResolvedValue({ data: {}, error: null })
    await moveSeasonEnd(ADMIN, '2026-10-05', 0)
    await clearSeasonEnd(ADMIN)
    await stopSeasonSales(ADMIN)
    await resumeSeasonSales(ADMIN)
    await endSeasonToday(ADMIN)
    expect(rpcMock.mock.calls).toEqual([
      ['season_move_end', { p_wrap_up: '2026-10-05', p_buffer: 0, p_actor: ADMIN }],
      ['season_clear_end', { p_actor: ADMIN }],
      ['season_stop_sales', { p_actor: ADMIN }],
      ['season_resume_sales', { p_actor: ADMIN }],
      ['season_end_today', { p_actor: ADMIN }],
    ])
    expect(auditMock.mock.calls.map((c) => c[1])).toEqual([
      'season_end_moved', 'season_end_cleared', 'season_sales_stopped', 'season_sales_resumed', 'season_ended_today',
    ])
  })
})
```

Append to `src/infra/config/intake.test.ts`, inside the existing `describe('getIntakeState', ...)` block:

```ts
  it('reads the season phase and dates', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { ...ROW, season_phase: 'winding_down', wrap_up_day: '2026-10-03', buffer_delivery_days: 1, close_day: '2026-10-05', sales_stopped_at: null },
      error: null,
    })
    const state = await getIntakeState()
    expect(state.phase).toBe('winding_down')
    expect(state.wrapUpDay).toBe('2026-10-03')
    expect(state.bufferDays).toBe(1)
    expect(state.closeDay).toBe('2026-10-05')
    expect(state.salesStopped).toBe(false)
  })

  it('reports sales stopped when the row carries a stop time', async () => {
    maybeSingleMock.mockResolvedValue({ data: { ...ROW, season_phase: 'winding_down', sales_stopped_at: '2026-09-02T01:50:11Z' }, error: null })
    expect((await getIntakeState()).salesStopped).toBe(true)
  })

  it('treats an unknown phase as open', async () => {
    maybeSingleMock.mockResolvedValue({ data: { ...ROW, season_phase: 'closed-ish' }, error: null })
    expect((await getIntakeState()).phase).toBe('open')
  })

  it('fails open on the season too', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const state = await getIntakeState()
    expect(state.phase).toBe('open')
    expect(state.wrapUpDay).toBeNull()
    expect(state.closeDay).toBeNull()
    expect(state.salesStopped).toBe(false)
    expect(state.bufferDays).toBe(1)
  })
```

Append to `src/infra/config/intake-cache.test.ts`, inside `describe('an admin write is never answered from the old row', ...)`:

```ts
  it('every season transition drops it', () => {
    const transitions = read('src/contexts/season/usecases/season-transitions.ts')
    const rpcs = transitions.split('.rpc(').length - 1
    const invalidations = transitions.split('invalidateIntakeCache()').length - 1
    expect(rpcs).toBeGreaterThan(0)
    expect(invalidations).toBe(rpcs)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/season/domain/season-errors.test.ts src/contexts/season/usecases/season-transitions.test.ts src/infra/config/intake.test.ts src/infra/config/intake-cache.test.ts`
Expected: FAIL. `season-errors` and `season-transitions` cannot be resolved; the new `intake.test.ts` cases fail on `state.phase` being undefined; the new cache case fails to read the missing file.

- [ ] **Step 3: Write the implementation**

`src/contexts/season/domain/season-errors.ts`:

```ts
/**
 * Admin copy for a refused season transition. The SQL functions raise
 * messages that start with a code; the admin never sees the raw text.
 */

const SEASON_ERROR_COPY: ReadonlyArray<readonly [string, string]> = [
  ['SEASON_BAD_PHASE', 'The season changed while you were looking. Refresh the page and try again.'],
  ['SEASON_INVALID_DATE', 'That wrap-up day cannot be used. Pick a Monday to Saturday date from tomorrow, within a year, with a buffer of 0 to 3 days.'],
  ['SEASON_NO_SETTINGS', 'The season settings row is missing, so nothing was changed.'],
]

export const SEASON_ERROR_FALLBACK = 'The season could not be changed and nothing was saved. Try again.'

export function friendlySeasonError(message: string | null | undefined): string {
  if (!message) return SEASON_ERROR_FALLBACK
  for (const [code, copy] of SEASON_ERROR_COPY) {
    if (message.includes(code)) return copy
  }
  return SEASON_ERROR_FALLBACK
}
```

`src/contexts/season/usecases/season-transitions.ts`:

```ts
import 'server-only'

/**
 * Season transitions, server side (spec §5).
 *
 * The SQL functions from supabase/migrations/20260914173723_season_transitions.sql
 * are the authority: they lock the settings row, check the guard and keep the
 * legacy paused / pause_scheduled_for columns in step. This module validates
 * dates first (so the admin gets a precise sentence), calls the function,
 * drops the intake cache, and writes the audit entry for a transition that
 * actually happened.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { invalidateIntakeCache } from '@/infra/config/intake'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { todayAeIso, validateSeasonEnd } from '../domain/season-dates'
import { friendlySeasonError } from '../domain/season-errors'

export type SeasonTransitionResult = { ok: true } | { error: string }

type SeasonFunction =
  | 'season_schedule_end'
  | 'season_move_end'
  | 'season_clear_end'
  | 'season_stop_sales'
  | 'season_resume_sales'
  | 'season_end_today'

async function runSeasonTransition(
  adminEmail: string,
  fn: SeasonFunction,
  args: Record<string, unknown>,
  auditAction: string,
): Promise<SeasonTransitionResult> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb.rpc(fn, { ...args, p_actor: adminEmail })
  // Dropped even on failure: a refusal can mean the row moved underneath us.
  invalidateIntakeCache()
  if (error) return { error: friendlySeasonError(error.message) }
  await logAdminAction(adminEmail, auditAction, 'intake_settings', 'singleton', { ...args, state: data })
  return { ok: true }
}

export async function scheduleSeasonEnd(adminEmail: string, wrapUpDay: string, bufferDays: number): Promise<SeasonTransitionResult> {
  const invalid = validateSeasonEnd({ wrapUpDay, bufferDays, todayAe: todayAeIso() })
  if (invalid) return { error: invalid }
  return runSeasonTransition(adminEmail, 'season_schedule_end', { p_wrap_up: wrapUpDay, p_buffer: bufferDays }, 'season_end_scheduled')
}

export async function moveSeasonEnd(adminEmail: string, wrapUpDay: string, bufferDays: number): Promise<SeasonTransitionResult> {
  const invalid = validateSeasonEnd({ wrapUpDay, bufferDays, todayAe: todayAeIso() })
  if (invalid) return { error: invalid }
  return runSeasonTransition(adminEmail, 'season_move_end', { p_wrap_up: wrapUpDay, p_buffer: bufferDays }, 'season_end_moved')
}

export async function clearSeasonEnd(adminEmail: string): Promise<SeasonTransitionResult> {
  return runSeasonTransition(adminEmail, 'season_clear_end', {}, 'season_end_cleared')
}

export async function stopSeasonSales(adminEmail: string): Promise<SeasonTransitionResult> {
  return runSeasonTransition(adminEmail, 'season_stop_sales', {}, 'season_sales_stopped')
}

export async function resumeSeasonSales(adminEmail: string): Promise<SeasonTransitionResult> {
  return runSeasonTransition(adminEmail, 'season_resume_sales', {}, 'season_sales_resumed')
}

export async function endSeasonToday(adminEmail: string): Promise<SeasonTransitionResult> {
  return runSeasonTransition(adminEmail, 'season_end_today', {}, 'season_ended_today')
}
```

`src/infra/config/intake.ts`, four edits:

1. Add the import under `import 'server-only'` and the admin-client import:

```ts
import type { SeasonPhase } from '@/contexts/season/domain/season-phase'
```

2. Add these fields to the end of `export interface IntakeState` (after `pauseScheduledFor`):

```ts
  /** Season phase (spec §5). Fails open to 'open'. */
  phase: SeasonPhase
  /** W, the wrap-up day, or null when none is set. */
  wrapUpDay: string | null
  /** Buffer delivery days between W and the close day. */
  bufferDays: number
  /** K, the close day, or null when no wrap-up day is set. */
  closeDay: string | null
  /** True when sales were stopped (manually, or by passing W). */
  salesStopped: boolean
```

3. Add to `FAIL_OPEN` (after `pauseScheduledFor: null,`):

```ts
  phase: 'open',
  wrapUpDay: null,
  bufferDays: 1,
  closeDay: null,
  salesStopped: false,
```

4. In `getIntakeState`, replace the `.select(...)` string and add the new fields to the `state` object:

```ts
      .select('paused, headline, body, credit_nonveg_aed, credit_veg_aed, credit_religious_aed, cycle_started_at, cycle_ended_at, pause_scheduled_for, season_phase, wrap_up_day, buffer_delivery_days, close_day, sales_stopped_at')
```

```ts
      phase: row.season_phase === 'winding_down' || row.season_phase === 'break' ? row.season_phase : 'open',
      wrapUpDay: row.wrap_up_day == null ? null : String(row.wrap_up_day),
      bufferDays: row.buffer_delivery_days == null ? FAIL_OPEN.bufferDays : Number(row.buffer_delivery_days),
      closeDay: row.close_day == null ? null : String(row.close_day),
      salesStopped: row.sales_stopped_at != null,
```

`src/contexts/subscriptions/usecases/subscription-mutations.test.ts`: in the `intakeState(pauseScheduledFor)` helper, add these properties to the returned object so it still satisfies `IntakeState`:

```ts
    phase: pauseScheduledFor ? ('winding_down' as const) : ('open' as const),
    wrapUpDay: pauseScheduledFor,
    bufferDays: 0,
    closeDay: pauseScheduledFor,
    salesStopped: false,
```

`src/app/admin/season/actions.ts`:
- Delete `setIntakePaused`, `scheduleIntakePause`, `clearScheduledIntakePause`, and the helpers only they used (`MAX_SCHEDULE_DAYS_AHEAD`, `todayAE`, `addDays`).
- Keep `updateIntakeCopy`, `updateIntakeCredits`, `setReopenTarget` unchanged.
- Add:

```ts
import {
    scheduleSeasonEnd,
    moveSeasonEnd,
    clearSeasonEnd,
    stopSeasonSales,
    resumeSeasonSales,
    endSeasonToday,
    type SeasonTransitionResult,
} from '@/contexts/season/usecases/season-transitions'

export async function scheduleSeasonEndAction(wrapUpDay: string, bufferDays: number): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await scheduleSeasonEnd(user.email, wrapUpDay, bufferDays)
    revalidatePath('/admin/season')
    return result
}

export async function moveSeasonEndAction(wrapUpDay: string, bufferDays: number): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await moveSeasonEnd(user.email, wrapUpDay, bufferDays)
    revalidatePath('/admin/season')
    return result
}

export async function clearSeasonEndAction(): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await clearSeasonEnd(user.email)
    revalidatePath('/admin/season')
    return result
}

export async function stopSeasonSalesAction(): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await stopSeasonSales(user.email)
    revalidatePath('/admin/season')
    return result
}

export async function resumeSeasonSalesAction(): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await resumeSeasonSales(user.email)
    revalidatePath('/admin/season')
    return result
}

export async function endSeasonTodayAction(): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await endSeasonToday(user.email)
    revalidatePath('/admin/season')
    return result
}
```

`src/app/admin/season/SeasonClient.tsx` (interim rewire; Task 7 replaces this UI):
- Import `scheduleSeasonEndAction, clearSeasonEndAction, stopSeasonSalesAction, resumeSeasonSalesAction` instead of `setIntakePaused, scheduleIntakePause, clearScheduledIntakePause`, and `DEFAULT_BUFFER_DAYS` from `@/contexts/season/domain/season-dates`.
- `handleResume`: call `resumeSeasonSalesAction()`.
- `handleConfirmPause`: call `stopSeasonSalesAction()`.
- `handleConfirmSchedule`: call `scheduleSeasonEndAction(dateDraft, DEFAULT_BUFFER_DAYS)`.
- `handleConfirmClear`: call `clearSeasonEndAction()`.

- [ ] **Step 4: Run the tests, the typecheck and the full suite**

Run: `npx vitest run src/contexts/season src/infra/config`
Expected: PASS.

Run: `npx tsc --noEmit -p .`
Expected: no errors. If any other file builds an `IntakeState` object literal, add the five fields there the same way.

Run: `npx vitest run`
Expected: every test passes (the baseline on 2026-09-14 was 80 files, 1129 tests, before this plan's additions).

- [ ] **Step 5: Commit**

```bash
git add src/contexts/season/domain/season-errors.ts src/contexts/season/domain/season-errors.test.ts src/contexts/season/usecases/season-transitions.ts src/contexts/season/usecases/season-transitions.test.ts src/infra/config/intake.ts src/infra/config/intake.test.ts src/infra/config/intake-cache.test.ts src/contexts/subscriptions/usecases/subscription-mutations.test.ts src/app/admin/season/actions.ts src/app/admin/season/SeasonClient.tsx
git commit -m "feat(season): admin season changes go through the SQL functions, and intake state knows the phase

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Season planner on the admin Season page

**Files:**
- Create: `src/app/admin/season/season-data.ts`
- Test: `src/app/admin/season/season-data.test.ts`
- Create: `src/app/admin/season/SeasonPlanner.tsx`
- Modify: `src/app/admin/season/page.tsx`
- Modify: `src/app/admin/season/SeasonClient.tsx`

**Interfaces:**
- Consumes: Task 1 (`addDaysIso`, `closeDayFor`, `validateSeasonEnd`, `DEFAULT_BUFFER_DAYS`, `MAX_BUFFER_DAYS`, `todayAeIso`, `allowedSeasonActions`, `SeasonSnapshot`, `SeasonPhase`), Task 2 (`projectPlan`, `lastMealOnTheBooks`, `kitchenCalendar`, `summarizeSeason`, `ProjectionPlan`, `ProjectionStatus`, `Disposition`), Task 3 (`mealValueOf`, `formatAed`, `MealValue`), Task 6 server actions (`scheduleSeasonEndAction`, `moveSeasonEndAction`, `clearSeasonEndAction`, `stopSeasonSalesAction`, `resumeSeasonSalesAction`, `endSeasonTodayAction`).
- Produces:
  - `interface SeasonPlanRow extends ProjectionPlan { customerName: string; dormName: string | null; mealValue: MealValue }`
  - `interface SeasonPageData { snapshot: SeasonSnapshot; salesStoppedAt: string | null; kitchenDailyCostAed: number; todayAe: string; closureDates: string[]; plans: SeasonPlanRow[] }`
  - `loadSeasonPageData(todayAe: string, sb?: SeasonDataClient): Promise<SeasonPageData>` (the optional client is the test seam)
  - `SeasonPlanner({ data }: { data: SeasonPageData })` client component
  - `prettyDay(iso: string): string` (e.g. `'2026-10-03'` → `'Sat 3 Oct'`), exported from `SeasonPlanner.tsx`
  - `SeasonClient` props become `{ settings: IntakeSettingsRow; members: WaitlistMember[]; season: SeasonPageData }` (`overhangCount` is removed)

- [ ] **Step 1: Write the failing loader test**

`src/app/admin/season/season-data.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => { throw new Error('tests pass a fake client') } }))

import { loadSeasonPageData, type SeasonDataClient } from './season-data'

type Result = { data: unknown; error: { message: string } | null }

/** A chainable, thenable stand-in for the supabase query builder. */
function fakeClient(tables: Record<string, Result>): SeasonDataClient {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: [], error: null }
      const builder = {
        select: () => builder,
        in: () => builder,
        gte: () => builder,
        order: () => builder,
        maybeSingle: () => Promise.resolve(result),
        then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(result).then(onOk, onErr),
      }
      return builder
    },
  } as unknown as SeasonDataClient
}

const SETTINGS = { season_phase: 'winding_down', wrap_up_day: '2026-10-03', buffer_delivery_days: 1, close_day: '2026-10-05', sales_stopped_at: null, kitchen_daily_cost_aed: '500' }
const SUB = {
  id: 's1', customer_id: 'c1', plan_name: 'Monthly Premium', status: 'Active', start_date: '2026-09-07', end_date: '2026-10-03',
  week_type: '6DAYS', meals_per_day: 1, total_meals: 24, delivered_meals: 6, credited_skip_days: 0, season_buffer_grants: 0,
  skipped_dates: null, planned_pause_start: null, staff_approval: null, last_delivery_tick_date: '2026-09-12',
}

describe('loadSeasonPageData', () => {
  it('maps the settings row, plans, customers, closures and the latest order', async () => {
    const data = await loadSeasonPageData('2026-09-14', fakeClient({
      intake_settings: { data: SETTINGS, error: null },
      subscriptions: { data: [SUB, { ...SUB, id: 's2', customer_id: 'c2', week_type: '5DAYS', status: 'Paused', meals_per_day: null, delivered_meals: null }], error: null },
      customers: { data: [{ id: 'c1', name: '  Omar Farouk ', dorm_name: 'Academic City' }, { id: 'c2', name: null, dorm_name: null }], error: null },
      orders: { data: [
        { subscription_id: 's1', amount_paid_fils: 43200, credit_applied_fils: 0, meals_count: 24, price_per_meal: '19', created_at: '2026-09-06T10:00:00Z' },
        { subscription_id: 's1', amount_paid_fils: 99999, credit_applied_fils: 0, meals_count: 24, price_per_meal: '19', created_at: '2026-08-01T10:00:00Z' },
        { subscription_id: 's2', amount_paid_fils: null, credit_applied_fils: null, meals_count: 24, price_per_meal: '18', created_at: '2026-08-20T10:00:00Z' },
      ], error: null },
      company_closures: { data: [{ closure_date: '2026-09-30' }], error: null },
    }))

    expect(data.snapshot).toEqual({ phase: 'winding_down', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', bufferDays: 1, salesStopped: false })
    expect(data.kitchenDailyCostAed).toBe(500)
    expect(data.todayAe).toBe('2026-09-14')
    expect(data.closureDates).toEqual(['2026-09-30'])
    expect(data.plans).toHaveLength(2)
    expect(data.plans[0]).toMatchObject({ id: 's1', customerName: 'Omar Farouk', dormName: 'Academic City', mealValue: { fils: 1800, exact: true }, skippedDates: [] })
    expect(data.plans[1]).toMatchObject({ id: 's2', customerName: 'Unnamed', weekType: '5DAYS', status: 'Paused', mealsPerDay: 1, deliveredMeals: 0, mealValue: { fils: 1800, exact: false } })
  })

  it('treats a missing settings row as open', async () => {
    const data = await loadSeasonPageData('2026-09-14', fakeClient({ intake_settings: { data: null, error: null } }))
    expect(data.snapshot).toEqual({ phase: 'open', wrapUpDay: null, closeDay: null, bufferDays: 1, salesStopped: false })
    expect(data.plans).toEqual([])
  })

  it('fails loudly instead of planning from half the facts', async () => {
    await expect(loadSeasonPageData('2026-09-14', fakeClient({
      intake_settings: { data: SETTINGS, error: null },
      subscriptions: { data: null, error: { message: 'permission denied' } },
    }))).rejects.toThrow('Season plans read failed: permission denied')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/admin/season/season-data.test.ts`
Expected: FAIL with "Failed to resolve import './season-data'".

- [ ] **Step 3: Write the loader**

`src/app/admin/season/season-data.ts`:

```ts
import 'server-only'

/**
 * Everything the Season page needs to plan the end of a season, read live.
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
}

export interface SeasonPageData {
  snapshot: SeasonSnapshot
  salesStoppedAt: string | null
  kitchenDailyCostAed: number
  todayAe: string
  closureDates: string[]
  plans: SeasonPlanRow[]
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
}

type OrderRow = {
  subscription_id: string | null
  amount_paid_fils: number | null
  credit_applied_fils: number | null
  meals_count: number | null
  price_per_meal: number | string | null
  created_at: string
}

export async function loadSeasonPageData(todayAe: string, sb: SeasonDataClient = createAdminSupabaseClient()): Promise<SeasonPageData> {
  const [settingsRes, subsRes, closuresRes] = await Promise.all([
    sb.from('intake_settings')
      .select('season_phase, wrap_up_day, buffer_delivery_days, close_day, sales_stopped_at, kitchen_daily_cost_aed')
      .maybeSingle(),
    sb.from('subscriptions')
      .select('id, customer_id, plan_name, status, start_date, end_date, week_type, meals_per_day, total_meals, delivered_meals, credited_skip_days, season_buffer_grants, skipped_dates, planned_pause_start, staff_approval, last_delivery_tick_date')
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

  const subs = (subsRes.data ?? []) as SubRow[]
  const customerIds = [...new Set(subs.map((r) => r.customer_id))]
  const subIds = subs.map((r) => r.id)

  const [customersRes, ordersRes] = await Promise.all([
    sb.from('customers').select('id, name, dorm_name').in('id', customerIds.length ? customerIds : [NO_ID]),
    sb.from('orders')
      .select('subscription_id, amount_paid_fils, credit_applied_fils, meals_count, price_per_meal, created_at')
      .in('subscription_id', subIds.length ? subIds : [NO_ID])
      .order('created_at', { ascending: false }),
  ])
  if (customersRes.error) throw new Error(`Season customers read failed: ${customersRes.error.message}`)
  if (ordersRes.error) throw new Error(`Season orders read failed: ${ordersRes.error.message}`)

  const customers = new Map(
    ((customersRes.data ?? []) as Array<{ id: string; name: string | null; dorm_name: string | null }>).map((c) => [c.id, c]),
  )
  // Newest first, so the first order seen for a plan is the one that bought it.
  const orderByPlan = new Map<string, OrderRow>()
  for (const order of (ordersRes.data ?? []) as OrderRow[]) {
    if (order.subscription_id && !orderByPlan.has(order.subscription_id)) orderByPlan.set(order.subscription_id, order)
  }

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
    }
  })

  return {
    snapshot,
    salesStoppedAt: settings.sales_stopped_at == null ? null : String(settings.sales_stopped_at),
    kitchenDailyCostAed: settings.kitchen_daily_cost_aed == null ? 500 : Number(settings.kitchen_daily_cost_aed),
    todayAe,
    closureDates: ((closuresRes.data ?? []) as Array<{ closure_date: string }>).map((r) => r.closure_date),
    plans,
  }
}
```

- [ ] **Step 4: Run the loader test to verify it passes**

Run: `npx vitest run src/app/admin/season/season-data.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the planner component**

`src/app/admin/season/SeasonPlanner.tsx`:

```tsx
'use client'

/**
 * Season planner (spec §11.1 and §11.2).
 *
 * Open, or sales stopped with no wrap-up day: the owner sees the last meal on
 * the books and the kitchen calendar, tries a wrap-up day and a buffer, and
 * reads what that choice costs before scheduling it. Winding down: the same
 * view is the wind-down board, with move, clear, stop or resume sales, and end
 * today. Every number comes from the pure projection in
 * src/contexts/season/domain, fed the live rows from season-data.ts.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Pause, Play, Power, XCircle } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminButton } from '../_components/AdminButton'
import {
    scheduleSeasonEndAction,
    moveSeasonEndAction,
    clearSeasonEndAction,
    stopSeasonSalesAction,
    resumeSeasonSalesAction,
    endSeasonTodayAction,
} from './actions'
import type { SeasonPageData, SeasonPlanRow } from './season-data'
import {
    addDaysIso,
    closeDayFor,
    todayAeIso,
    validateSeasonEnd,
    DEFAULT_BUFFER_DAYS,
    MAX_BUFFER_DAYS,
} from '@/contexts/season/domain/season-dates'
import { allowedSeasonActions, type SeasonAction, type SeasonSnapshot } from '@/contexts/season/domain/season-phase'
import {
    projectPlan,
    lastMealOnTheBooks,
    kitchenCalendar,
    summarizeSeason,
    type Disposition,
    type KitchenDay,
    type PlanProjection,
    type SeasonSummary,
} from '@/contexts/season/domain/season-projection'
import { formatAed } from '@/contexts/season/domain/meal-value'
import type { AdminTokens } from '@/ui-system/tokens/admin-theme'

export const END_TODAY_PHRASE = 'END SEASON'

type ConfirmKind = Exclude<SeasonAction, 'reopen'>

const DISPOSITION_LABEL: Record<Disposition, string> = {
    runs_past: 'Runs past',
    starts_after: 'Starts after',
    customer_paused: 'Customer paused',
    staff_pending: 'Staff approval pending',
    finishes: 'Finishes',
}

const DISPOSITION_ORDER: Record<Disposition, number> = {
    runs_past: 0,
    starts_after: 1,
    customer_paused: 2,
    staff_pending: 3,
    finishes: 4,
}

export function prettyDay(iso: string): string {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    })
}

function plural(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`
}

interface SeasonView {
    projections: Map<string, PlanProjection>
    calendar: KitchenDay[]
    summary: SeasonSummary
    exposureFils: number
    exposureEstimated: boolean
    exposureUnknownPlans: number
}

function buildView(data: SeasonPageData, closures: ReadonlySet<string>, wrapUpDay: string | null, closeDay: string | null): SeasonView {
    const list = data.plans.map((plan) => projectPlan(plan, { todayAe: data.todayAe, closureDates: closures, wrapUpDay, closeDay }))
    const calendar = kitchenCalendar(data.plans, list)
    const projections = new Map(list.map((p) => [p.planId, p]))
    let exposureFils = 0
    let exposureEstimated = false
    let exposureUnknownPlans = 0
    for (const plan of data.plans) {
        const meals = projections.get(plan.id)?.mealsAfterWrapUp ?? 0
        if (meals === 0) continue
        if (!plan.mealValue) { exposureUnknownPlans += 1; continue }
        exposureFils += meals * plan.mealValue.fils
        if (!plan.mealValue.exact) exposureEstimated = true
    }
    return {
        projections,
        calendar,
        summary: summarizeSeason(list, calendar, data.kitchenDailyCostAed),
        exposureFils,
        exposureEstimated,
        exposureUnknownPlans,
    }
}

function exposureText(view: SeasonView): string {
    const money = `${formatAed(view.exposureFils)}${view.exposureEstimated ? ' (estimated)' : ''}`
    return view.exposureUnknownPlans > 0
        ? `${money}, plus ${plural(view.exposureUnknownPlans, 'plan', 'plans')} with no price on record`
        : money
}

function confirmCopy(
    kind: ConfirmKind,
    c: { wrap: string; buffer: number; snapshot: SeasonSnapshot; view: SeasonView; endTodayView: SeasonView },
): { title: string; body: string[]; cta: string; danger: boolean } {
    if (kind === 'schedule' || kind === 'move') {
        const s = c.view.summary.byDisposition
        const summary = c.view.summary
        return {
            title: kind === 'schedule' ? 'Schedule the season end?' : 'Move the season end?',
            body: [
                `Wrap-up day ${prettyDay(c.wrap)}, buffer ${plural(c.buffer, 'delivery day', 'delivery days')}, close day ${prettyDay(closeDayFor(c.wrap, c.buffer))}. The break starts the night after the close day.`,
                `${plural(s.finishes, 'plan finishes', 'plans finish')}, ${plural(s.runs_past, 'plan runs', 'plans run')} past the wrap-up day, ${plural(s.starts_after, 'plan starts', 'plans start')} after it, and ${plural(s.customer_paused, 'customer pause waits', 'customer pauses wait')} for next semester.`,
                summary.mealsAfterWrapUp > 0
                    ? `${plural(summary.mealsAfterWrapUp, 'meal is', 'meals are')} left after the wrap-up day: ${exposureText(c.view)} to keep for next semester or refund.`
                    : 'No meals are left after the wrap-up day.',
                `The kitchen cooks ${plural(summary.kitchenDays, 'more day', 'more days')} (${formatAed(summary.kitchenCostAed * 100)}).`,
                `From now on, new plans must finish by ${prettyDay(c.wrap)}.`,
            ],
            cta: kind === 'schedule' ? 'Yes, schedule it' : 'Yes, move it',
            danger: false,
        }
    }
    if (kind === 'clear') {
        return {
            title: 'Clear the wrap-up day?',
            body: c.snapshot.salesStopped
                ? ['Sales stay stopped. With no wrap-up day the kitchen keeps cooking until the last plan ends.']
                : ['Every plan goes back on sale at full length straight away, and the season ends.'],
            cta: 'Yes, clear it',
            danger: false,
        }
    }
    if (kind === 'stop_sales') {
        return {
            title: 'Stop sales now?',
            body: [
                'Nobody can buy or renew a plan from now on. Plans already paid for keep running.',
                c.snapshot.wrapUpDay
                    ? `The wrap-up day stays ${prettyDay(c.snapshot.wrapUpDay)}.`
                    : 'No wrap-up day is set yet, so plan the season end next.',
            ],
            cta: 'Yes, stop sales',
            danger: true,
        }
    }
    if (kind === 'resume_sales') {
        return {
            title: 'Resume sales?',
            body: c.snapshot.wrapUpDay
                ? [`Plans that finish by ${prettyDay(c.snapshot.wrapUpDay)} go back on sale.`]
                : ['Every plan goes back on sale at full length, and the season ends. Customers on the waitlist who hold credit see the reopened notice.'],
            cta: 'Yes, resume sales',
            danger: false,
        }
    }
    const e = c.endTodayView.summary
    const heldPlans = e.byDisposition.runs_past + e.byDisposition.starts_after
    return {
        title: 'End the season today?',
        body: [
            'Tonight is the last kitchen night, and sales stop now.',
            e.mealsAfterWrapUp > 0
                ? `${plural(heldPlans, 'plan still has', 'plans still have')} ${plural(e.mealsAfterWrapUp, 'meal', 'meals')} after today: ${exposureText(c.endTodayView)} to keep or refund.`
                : 'No plan has meals after today.',
            `Type ${END_TODAY_PHRASE} to confirm.`,
        ],
        cta: 'End the season today',
        danger: true,
    }
}

export function SeasonPlanner({ data }: { data: SeasonPageData }) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const { snapshot, todayAe } = data
    const closures = useMemo(() => new Set(data.closureDates), [data.closureDates])
    const actions = allowedSeasonActions(snapshot, todayAe)
    const canSchedule = actions.includes('schedule')
    const canMove = actions.includes('move')
    const editing = canSchedule || canMove

    const books = useMemo(() => buildView(data, closures, null, null), [data, closures])
    const lastOnBooks = useMemo(() => lastMealOnTheBooks([...books.projections.values()]), [books])

    const [wrapDraft, setWrapDraft] = useState(snapshot.wrapUpDay ?? lastOnBooks?.date ?? addDaysIso(todayAe, 1))
    const [bufferDraft, setBufferDraft] = useState(snapshot.wrapUpDay ? snapshot.bufferDays : DEFAULT_BUFFER_DAYS)
    const draftError = editing ? validateSeasonEnd({ wrapUpDay: wrapDraft, bufferDays: bufferDraft, todayAe }) : null
    const draftChanged = wrapDraft !== snapshot.wrapUpDay || bufferDraft !== snapshot.bufferDays

    const shownWrap = editing && !draftError ? wrapDraft : snapshot.wrapUpDay
    const shownClose = editing && !draftError ? closeDayFor(wrapDraft, bufferDraft) : snapshot.closeDay
    const view = useMemo(() => buildView(data, closures, shownWrap, shownClose), [data, closures, shownWrap, shownClose])
    const endTodayView = useMemo(() => buildView(data, closures, todayAe, todayAe), [data, closures, todayAe])
    const kitchenDaysSaved = shownWrap ? Math.max(0, books.calendar.length - view.calendar.length) : 0

    const [confirm, setConfirm] = useState<ConfirmKind | null>(null)
    const [phrase, setPhrase] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    const rows = useMemo(
        () => [...data.plans].sort((a, b) => {
            const pa = view.projections.get(a.id)
            const pb = view.projections.get(b.id)
            if (!pa || !pb) return 0
            return DISPOSITION_ORDER[pa.disposition] - DISPOSITION_ORDER[pb.disposition]
                || (pb.lastDinner ?? '').localeCompare(pa.lastDinner ?? '')
                || a.customerName.localeCompare(b.customerName)
        }),
        [data.plans, view],
    )

    function openConfirm(kind: ConfirmKind) {
        setError(null)
        setPhrase('')
        setConfirm(kind)
    }

    function runConfirmed() {
        const kind = confirm
        if (!kind) return
        setError(null)
        startTransition(async () => {
            const result =
                kind === 'schedule' ? await scheduleSeasonEndAction(wrapDraft, bufferDraft)
                : kind === 'move' ? await moveSeasonEndAction(wrapDraft, bufferDraft)
                : kind === 'clear' ? await clearSeasonEndAction()
                : kind === 'stop_sales' ? await stopSeasonSalesAction()
                : kind === 'resume_sales' ? await resumeSeasonSalesAction()
                : await endSeasonTodayAction()
            if ('error' in result) { setError(result.error); return }
            setConfirm(null)
            setPhrase('')
            router.refresh()
        })
    }

    const salesStoppedOn = data.salesStoppedAt ? prettyDay(todayAeIso(Date.parse(data.salesStoppedAt))) : null
    const status =
        snapshot.phase === 'open'
            ? { tone: `${t.successBg} ${t.success}`, title: 'Open', text: 'Selling normally. The kitchen cooks for every plan on the books.' }
        : snapshot.phase === 'break'
            ? { tone: `${t.dangerBg} ${t.danger}`, title: 'On the break', text: 'No sales and no cooking until you reopen.' }
        : !snapshot.wrapUpDay
            ? {
                tone: `${t.warningBg} ${t.warning}`,
                title: 'Sales stopped, no wrap-up day',
                text: `${salesStoppedOn ? `Sales stopped on ${salesStoppedOn}. ` : ''}The kitchen keeps cooking until the last plan ends, and a customer who resumes a pause can keep it running. Set a wrap-up day so the season has an end.`,
            }
            : {
                tone: `${t.accentBg} ${t.accent}`,
                title: `Winding down to ${prettyDay(snapshot.wrapUpDay)}`,
                text: `Regular dinners stop after ${prettyDay(snapshot.wrapUpDay)}. Close day ${prettyDay(snapshot.closeDay ?? snapshot.wrapUpDay)}, and the break starts the night after. ${snapshot.salesStopped ? 'Sales are stopped.' : 'New plans must finish by the wrap-up day.'}`,
            }

    const summary = view.summary
    const copy = confirm ? confirmCopy(confirm, { wrap: wrapDraft, buffer: bufferDraft, snapshot, view, endTodayView }) : null

    return (
        <div className={`mt-6 rounded-xl border p-5 ${t.card}`}>
            <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${status.tone}`}>
                <CalendarClock size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                <div>
                    <div className="text-[14px] font-black">{status.title}</div>
                    <div className={`text-[12px] font-medium mt-0.5 max-w-[72ch] ${t.body}`}>{status.text}</div>
                </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 mt-4">
                <Fact
                    t={t}
                    label="Last meal on the books"
                    value={lastOnBooks ? prettyDay(lastOnBooks.date) : 'None'}
                    detail={lastOnBooks ? plural(lastOnBooks.planIds.length, 'plan', 'plans') : 'No live plans'}
                />
                <Fact
                    t={t}
                    label="Kitchen days left"
                    value={String(summary.kitchenDays)}
                    detail={`${formatAed(summary.kitchenCostAed * 100)} at ${formatAed(data.kitchenDailyCostAed * 100)} a day`}
                />
                <Fact
                    t={t}
                    label="Meals after the wrap-up day"
                    value={String(summary.mealsAfterWrapUp)}
                    detail={summary.mealsAfterWrapUp > 0 ? `${exposureText(view)} to keep or refund` : 'Nothing to hold'}
                />
            </div>

            {editing && (
                <div className={`mt-5 pt-4 border-t ${t.border}`}>
                    <div className={`text-[11px] font-black uppercase tracking-[0.1em] ${t.muted}`}>
                        {canMove ? 'Move the season end' : 'Plan the season end'}
                    </div>
                    <div className="mt-3 flex items-end gap-3 flex-wrap">
                        <label className="flex flex-col gap-1.5" htmlFor="season-wrap-up-day">
                            <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>Wrap-up day</span>
                            <input
                                id="season-wrap-up-day"
                                type="date"
                                value={wrapDraft}
                                min={addDaysIso(todayAe, 1)}
                                onChange={(e) => { setWrapDraft(e.target.value); setError(null) }}
                                className={`rounded-lg border px-3 py-2 text-[13px] font-semibold ${t.input} ${t.inputFocus}`}
                            />
                        </label>
                        <label className="flex flex-col gap-1.5" htmlFor="season-buffer">
                            <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>Buffer</span>
                            <select
                                id="season-buffer"
                                value={bufferDraft}
                                onChange={(e) => { setBufferDraft(Number(e.target.value)); setError(null) }}
                                className={`rounded-lg border px-3 py-2 text-[13px] font-semibold ${t.input} ${t.inputFocus}`}
                            >
                                {Array.from({ length: MAX_BUFFER_DAYS + 1 }, (_, n) => (
                                    <option key={n} value={n}>{plural(n, 'delivery day', 'delivery days')}</option>
                                ))}
                            </select>
                        </label>
                        <AdminButton
                            icon={<CalendarClock size={14} strokeWidth={2.5} />}
                            onClick={() => openConfirm(canMove ? 'move' : 'schedule')}
                            disabled={Boolean(draftError) || pending || (canMove && !draftChanged)}
                        >
                            {canMove ? 'Save new dates' : 'Schedule'}
                        </AdminButton>
                    </div>
                    <p className={`text-[12px] font-medium mt-2 max-w-[72ch] ${draftError ? t.danger : t.muted}`}>
                        {draftError
                            ?? `Close day ${prettyDay(closeDayFor(wrapDraft, bufferDraft))}. The buffer only cooks make-up meals from skips and is never sold.${kitchenDaysSaved > 0 ? ` Against the last meal on the books this saves ${plural(kitchenDaysSaved, 'kitchen day', 'kitchen days')} (${formatAed(kitchenDaysSaved * data.kitchenDailyCostAed * 100)}).` : ''}`}
                    </p>
                </div>
            )}

            <div className="mt-4 flex gap-2 flex-wrap">
                {actions.includes('stop_sales') && (
                    <AdminButton variant="danger" icon={<Pause size={14} strokeWidth={2.5} />} onClick={() => openConfirm('stop_sales')} disabled={pending}>
                        Stop sales now
                    </AdminButton>
                )}
                {actions.includes('resume_sales') && (
                    <AdminButton icon={<Play size={14} strokeWidth={2.5} />} onClick={() => openConfirm('resume_sales')} disabled={pending}>
                        {snapshot.wrapUpDay ? 'Resume sales' : 'Resume sales and end the season'}
                    </AdminButton>
                )}
                {actions.includes('clear') && (
                    <AdminButton variant="ghost" icon={<XCircle size={14} strokeWidth={2.5} />} onClick={() => openConfirm('clear')} disabled={pending}>
                        Clear the wrap-up day
                    </AdminButton>
                )}
                {actions.includes('end_today') && (
                    <AdminButton variant="danger" icon={<Power size={14} strokeWidth={2.5} />} onClick={() => openConfirm('end_today')} disabled={pending}>
                        End the season today
                    </AdminButton>
                )}
            </div>
            {error && !confirm && <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{error}</p>}

            <div className="grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5 mt-5">
                <PlansTable rows={rows} view={view} t={t} />
                <KitchenCalendarList calendar={view.calendar} wrapUpDay={shownWrap} closeDay={shownClose} t={t} />
            </div>

            {confirm && copy && (
                <AdminModal label={copy.title} maxW="max-w-[500px]" onBackdrop={() => { if (!pending) setConfirm(null) }}>
                    <div className={`px-5 py-4 border-b ${t.border}`}>
                        <div className={`text-[15px] font-black ${t.heading}`}>{copy.title}</div>
                    </div>
                    <div className="px-5 py-4 flex flex-col gap-2">
                        {copy.body.map((line) => (
                            <p key={line} className={`text-[13px] font-medium leading-relaxed ${t.body}`}>{line}</p>
                        ))}
                        {confirm === 'end_today' && (
                            <input
                                id="season-end-today-phrase"
                                value={phrase}
                                onChange={(e) => setPhrase(e.target.value)}
                                placeholder={END_TODAY_PHRASE}
                                autoComplete="off"
                                className={`mt-1 rounded-lg border px-3 py-2 text-[13px] font-semibold ${t.input} ${t.inputFocus}`}
                            />
                        )}
                        {error && <p className={`text-[12px] font-bold ${t.danger}`}>{error}</p>}
                    </div>
                    <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
                        <AdminButton variant="ghost" onClick={() => setConfirm(null)} disabled={pending}>Cancel</AdminButton>
                        <AdminButton
                            variant={copy.danger ? 'danger' : 'primary'}
                            onClick={runConfirmed}
                            loading={pending}
                            disabled={confirm === 'end_today' && phrase.trim() !== END_TODAY_PHRASE}
                        >
                            {copy.cta}
                        </AdminButton>
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

function dispositionTone(d: Disposition, t: AdminTokens): string {
    if (d === 'runs_past' || d === 'starts_after') return `${t.dangerBg} ${t.danger}`
    if (d === 'customer_paused' || d === 'staff_pending') return `${t.warningBg} ${t.warning}`
    return `${t.successBg} ${t.success}`
}

function PlansTable({ rows, view, t }: { rows: SeasonPlanRow[]; view: SeasonView; t: AdminTokens }) {
    if (rows.length === 0) {
        return <p className={`text-[13px] font-medium ${t.muted}`}>No live plans.</p>
    }
    return (
        <div className={`rounded-xl border overflow-x-auto ${t.border}`}>
            <table className="w-full text-[12px]">
                <thead className={t.tableHeader}>
                    <tr>
                        {['Customer', 'Plan', 'Season', 'Last dinner', 'After wrap-up', 'Meal value'].map((h) => (
                            <th key={h} className="text-left font-black uppercase tracking-[0.06em] text-[10px] px-3 py-2 whitespace-nowrap">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((plan) => {
                        const p = view.projections.get(plan.id)
                        if (!p) return null
                        return (
                            <tr key={plan.id} className={t.tableRow}>
                                <td className="px-3 py-2">
                                    <div className={`font-bold ${t.heading}`}>{plan.customerName}</div>
                                    <div className={t.muted}>{plan.dormName ?? 'No dorm set'}</div>
                                </td>
                                <td className="px-3 py-2">
                                    <div className={t.body}>{plan.planName}</div>
                                    <div className={t.muted}>{plan.status}</div>
                                </td>
                                <td className="px-3 py-2">
                                    <span className={`inline-block rounded-full border px-2 py-0.5 font-bold whitespace-nowrap ${dispositionTone(p.disposition, t)}`}>
                                        {DISPOSITION_LABEL[p.disposition]}
                                    </span>
                                </td>
                                <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${t.body}`}>{p.lastDinner ? prettyDay(p.lastDinner) : 'None'}</td>
                                <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${t.body}`}>{p.mealsAfterWrapUp > 0 ? plural(p.mealsAfterWrapUp, 'meal', 'meals') : '0'}</td>
                                <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${t.body}`}>
                                    {plan.mealValue ? `${formatAed(plan.mealValue.fils)}${plan.mealValue.exact ? '' : ' est.'}` : 'Unknown'}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

function KitchenCalendarList({ calendar, wrapUpDay, closeDay, t }: { calendar: KitchenDay[]; wrapUpDay: string | null; closeDay: string | null; t: AdminTokens }) {
    return (
        <div className={`rounded-xl border ${t.border}`}>
            <div className={`px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] ${t.tableHeader}`}>Kitchen calendar</div>
            {calendar.length === 0 ? (
                <p className={`px-3 py-3 text-[12px] font-medium ${t.muted}`}>Nothing left to cook.</p>
            ) : (
                <ul className="max-h-[420px] overflow-y-auto">
                    {calendar.map((day) => {
                        const marks = [
                            day.date === wrapUpDay ? 'wrap-up' : null,
                            wrapUpDay != null && day.date > wrapUpDay ? 'buffer' : null,
                            closeDay != null && day.date === closeDay && closeDay !== wrapUpDay ? 'close' : null,
                        ].filter(Boolean).join(', ')
                        return (
                            <li key={day.date} className={`flex items-center justify-between gap-3 px-3 py-1.5 text-[12px] border-b last:border-b-0 ${t.border}`}>
                                <span className={`font-bold tabular-nums ${t.heading}`}>
                                    {prettyDay(day.date)}{marks ? <span className={`ml-1.5 font-semibold ${t.accent}`}>{marks}</span> : null}
                                </span>
                                <span className={`tabular-nums ${t.muted}`}>
                                    {plural(day.meals, 'meal', 'meals')}{day.lastDinners > 0 ? `, ${plural(day.lastDinners, 'last dinner', 'last dinners')}` : ''}
                                </span>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
```

- [ ] **Step 6: Load the season on the page**

`src/app/admin/season/page.tsx`:
- Add imports: `import { loadSeasonPageData } from './season-data'` and `import { todayAeIso } from '@/contexts/season/domain/season-dates'`.
- Delete the whole `overhangCount` block (the comment starting "Journeys that already run past the scheduled last delivery day" through `overhangCount = count ?? 0 }`).
- Replace `const members = await fetchWaitlistMembers(sb, cycleStartedAt)` and the returned JSX with:

```tsx
    const [members, season] = await Promise.all([
        fetchWaitlistMembers(sb, cycleStartedAt),
        loadSeasonPageData(todayAeIso(), sb),
    ])

    return (
        <SeasonClient
            settings={settings}
            members={members}
            season={season}
        />
    )
```

- [ ] **Step 7: Put the planner into the Season client**

`src/app/admin/season/SeasonClient.tsx`:
- Imports: remove `Pause`, `Play`, `CalendarClock` from the lucide import (keep `Gift`, `AlertTriangle`, `Send` only if still used), remove `scheduleSeasonEndAction`, `clearSeasonEndAction`, `stopSeasonSalesAction`, `resumeSeasonSalesAction`, `DEFAULT_BUFFER_DAYS` and `prettySeasonDate` if no longer used; add `import { SeasonPlanner } from './SeasonPlanner'` and `import type { SeasonPageData } from './season-data'`.
- `Props`: replace `overhangCount: number` with `season: SeasonPageData`; destructure `season` instead of `overhangCount`.
- Delete the state and handlers under `// ── Pause / resume toggle` (`confirmOpen` … `handleConfirmPause`) and under `// ── Scheduled pause` (`dateDraft` … `handleConfirmClear`, including `minScheduleDate`).
- Delete the `{settings.paused && (...)}` "New intake is PAUSED" banner.
- Change the Status KPI to read the season:

```tsx
<KPI
    label="Status"
    value={season.snapshot.phase === 'open' ? 'Open' : season.snapshot.phase === 'break' ? 'Break' : 'Winding down'}
    t={t}
    tone={season.snapshot.phase === 'open' ? 'success' : 'danger'}
/>
```

- Replace the entire `{/* Pause / resume */}` card (from that comment through the card's closing `</div>`, which contains "Schedule the pause" and the reopening-notice link) with:

```tsx
            <SeasonPlanner data={season} />

            {season.snapshot.phase === 'open' && (
                <div className={`mt-4 rounded-xl border p-5 ${t.card}`}>
                    <p className={`text-[12px] font-medium max-w-[52ch] ${t.muted}`}>
                        Reopening after a pause? The reopening notice tells the early access list their credit is ready, and lapsed customers that plans are back.
                    </p>
                    <Link
                        href="/admin/comms/broadcast?preset=reopen"
                        className={`mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-[0.04em] ring-1 ring-[#f57f20]/30 ${t.card} ${t.accent} transition-all hover:ring-[#f57f20]/50`}
                    >
                        <Send size={14} strokeWidth={2.2} />
                        Send the reopening notice
                    </Link>
                </div>
            )}
```

- Delete the three old modals: `{confirmOpen && (...)}` (pause confirm), `{scheduleConfirmOpen && (...)}` and `{clearConfirmOpen && (...)}`.
- Update the page subtitle under the `Season` heading to: `Plan the end of the season, see what it costs, and set the credit customers earn for joining the early-access list.`

- [ ] **Step 8: Verify**

Run: `npx vitest run src/app/admin/season src/contexts/season src/infra/config`
Expected: PASS.

Run: `npx tsc --noEmit -p .`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors or warnings in the files this task touched.

Run: `git grep -n "setIntakePaused\|scheduleIntakePause\|clearScheduledIntakePause\|overhangCount" -- src`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add src/app/admin/season/season-data.ts src/app/admin/season/season-data.test.ts src/app/admin/season/SeasonPlanner.tsx src/app/admin/season/page.tsx src/app/admin/season/SeasonClient.tsx
git commit -m "feat(season): the Season page plans the season end from the last meal on the books

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Fixtures, rendered check, live read check

**Files:**
- Modify: `src/app/dev/season-admin/page.tsx`
- Create: `scripts/check-season-planner.mjs`
- Create: `scripts/check-season-data.ts`
- Modify: `package.json` (two scripts)

**Interfaces:**
- Consumes: `SeasonClient` props from Task 7 (`settings`, `members`, `season`), `SeasonPageData` / `SeasonPlanRow`, `loadSeasonPageData`, `projectPlan`, `lastMealOnTheBooks`.
- Produces: dev fixture URL `/dev/season-admin?season=open|stopped|scheduled|stopped_scheduled` (default `stopped`, which is the live state on 2026-09-14); `npm run check:season-planner`; `npm run check:season-data`.

- [ ] **Step 1: Add season fixtures to the dev harness**

In `src/app/dev/season-admin/page.tsx`:
- Import `import type { SeasonPageData, SeasonPlanRow } from '@/app/admin/season/season-data'`.
- Extend `searchParams` with `season?: string`.
- Add these fixtures above the page component:

```tsx
// Anchored to Monday 14 Sep 2026 so the projection reads the same every time.
const FIXTURE_TODAY = '2026-09-14'

function fixturePlan(p: Partial<SeasonPlanRow> & Pick<SeasonPlanRow, 'id' | 'customerName' | 'planName' | 'startDate' | 'endDate'>): SeasonPlanRow {
  return {
    customerId: `c-${p.id}`, status: 'Active', weekType: '6DAYS', mealsPerDay: 1, totalMeals: 24, deliveredMeals: 0,
    creditedSkipDays: 0, bufferGrants: 0, skippedDates: [], plannedPauseStart: null, staffApproval: null,
    lastDeliveryTickDate: '2026-09-12', dormName: 'Academic City', mealValue: { fils: 1800, exact: false },
    ...p,
  }
}

// One plan per disposition the planner has to show, with the wrap-up day on Wed 30 Sep:
// runs past (6-day and 5-day, one with no price), starts after, customer paused,
// staff approval pending, and a plan that finishes.
const FIXTURE_PLANS: SeasonPlanRow[] = [
  fixturePlan({ id: 'a', customerName: 'Omar Farouk', planName: 'Monthly Premium', startDate: '2026-09-07', endDate: '2026-10-03', deliveredMeals: 6, mealValue: { fils: 1800, exact: true } }),
  fixturePlan({ id: 'b', customerName: 'Aisha Rahman', planName: 'Monthly Max', startDate: '2026-09-01', endDate: '2026-09-28', mealsPerDay: 2, totalMeals: 48, deliveredMeals: 22, dormName: 'Dubai Investment Park', mealValue: { fils: 1750, exact: false } }),
  fixturePlan({ id: 'c', customerName: 'Priya Nair', planName: 'Monthly Premium', status: 'Paused', startDate: '2026-08-24', endDate: '2026-09-25', deliveredMeals: 10, lastDeliveryTickDate: '2026-09-05' }),
  fixturePlan({ id: 'd', customerName: 'Yusuf Ali', planName: 'Weekly Flex', status: 'Scheduled', startDate: '2026-10-01', endDate: '2026-10-07', totalMeals: 6, lastDeliveryTickDate: null, mealValue: { fils: 1900, exact: false } }),
  fixturePlan({ id: 'e', customerName: 'Chen Wei', planName: 'Monthly Premium', weekType: '5DAYS', startDate: '2026-09-07', endDate: '2026-10-02', totalMeals: 20, deliveredMeals: 5, lastDeliveryTickDate: '2026-09-11', dormName: null, mealValue: null }),
  fixturePlan({ id: 'f', customerName: 'Layla Haddad', planName: 'Staff Monthly', status: 'Scheduled', startDate: '2026-09-28', endDate: '2026-10-24', staffApproval: 'pending', lastDeliveryTickDate: null, mealValue: null }),
]

const FIXTURE_SNAPSHOTS: Record<string, SeasonPageData['snapshot']> = {
  open: { phase: 'open', wrapUpDay: null, closeDay: null, bufferDays: 1, salesStopped: false },
  stopped: { phase: 'winding_down', wrapUpDay: null, closeDay: null, bufferDays: 1, salesStopped: true },
  scheduled: { phase: 'winding_down', wrapUpDay: '2026-09-30', closeDay: '2026-10-01', bufferDays: 1, salesStopped: false },
  stopped_scheduled: { phase: 'winding_down', wrapUpDay: '2026-09-30', closeDay: '2026-10-01', bufferDays: 1, salesStopped: true },
}

function fixtureSeason(key: string | undefined): SeasonPageData {
  const snapshot = FIXTURE_SNAPSHOTS[key ?? 'stopped'] ?? FIXTURE_SNAPSHOTS.stopped
  return {
    snapshot,
    salesStoppedAt: snapshot.salesStopped ? '2026-09-02T01:50:11Z' : null,
    kitchenDailyCostAed: 500,
    todayAe: FIXTURE_TODAY,
    closureDates: ['2026-09-16'],
    plans: FIXTURE_PLANS,
  }
}
```

- Set `paused` in the fixture `settings` to `snapshot.salesStopped`, and pass `season={fixtureSeason(params.season)}` to `SeasonClient` instead of `overhangCount`.
- Update the header comment's query-param list with `?season=open|stopped|scheduled|stopped_scheduled`.

- [ ] **Step 2: Write the rendered check**

`scripts/check-season-planner.mjs` renders the four fixture states at 1280 and 390 wide and fails on anything a reviewer would otherwise have to eyeball. Reuse the Chromium discovery from `scripts/check-waitlist-gate-fit.mjs` (the `findUnder(join(homedir(), 'Library', 'Caches', 'ms-playwright'), …)` lookup and its `chromium` import) rather than writing a new one.

```js
#!/usr/bin/env node
/**
 * Renders /dev/season-admin in every season fixture at desktop and phone
 * width and fails when the planner is missing, a state shows the wrong
 * controls, the page scrolls sideways, or the console logs an error.
 * Needs the dev server: BASE_URL defaults to http://localhost:3000.
 * Screenshots go to SHOT_DIR when it is set.
 */
// Copy the Chromium launch helpers from scripts/check-waitlist-gate-fit.mjs here.

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SHOT_DIR = process.env.SHOT_DIR ?? null

const EXPECT = {
  open: { title: 'Open', controls: ['Schedule', 'Stop sales now', 'End the season today'], absent: ['Resume sales', 'Clear the wrap-up day'] },
  stopped: { title: 'Sales stopped, no wrap-up day', controls: ['Schedule', 'Resume sales and end the season', 'End the season today'], absent: ['Stop sales now', 'Clear the wrap-up day'] },
  scheduled: { title: 'Winding down to Wed 30 Sep', controls: ['Save new dates', 'Stop sales now', 'Clear the wrap-up day', 'End the season today'], absent: ['Resume sales'] },
  stopped_scheduled: { title: 'Winding down to Wed 30 Sep', controls: ['Save new dates', 'Resume sales', 'Clear the wrap-up day', 'End the season today'], absent: ['Stop sales now'] },
}

const failures = []
const browser = await launchChromium()
for (const [state, expect] of Object.entries(EXPECT)) {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto(`${BASE}/dev/season-admin?season=${state}`, { waitUntil: 'networkidle' })
    const label = `${state} @${width}`
    const body = await page.locator('body').innerText()
    if (!body.includes(expect.title)) failures.push(`${label}: missing status "${expect.title}"`)
    if (!body.includes('Last meal on the books')) failures.push(`${label}: missing "Last meal on the books"`)
    if (!body.includes('Kitchen calendar')) failures.push(`${label}: missing the kitchen calendar`)
    for (const c of expect.controls) {
      if (await page.getByRole('button', { name: c, exact: true }).count() === 0) failures.push(`${label}: missing button "${c}"`)
    }
    for (const c of expect.absent) {
      if (await page.getByRole('button', { name: c, exact: true }).count() > 0) failures.push(`${label}: unexpected button "${c}"`)
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow > 1) failures.push(`${label}: page scrolls sideways by ${overflow}px`)
    if (errors.length) failures.push(`${label}: console errors: ${errors.join(' | ')}`)
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/season-${state}-${width}.png`, fullPage: true })
    await page.close()
  }
}
await browser.close()

if (failures.length) {
  console.error(`check-season-planner: ${failures.length} failure(s)\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('check-season-planner: 8 renders OK')
```

Replace the `// Copy the Chromium launch helpers…` comment with the actual helper code from `scripts/check-waitlist-gate-fit.mjs`, exposing it as `async function launchChromium()` that returns a launched Playwright browser.

- [ ] **Step 3: Write the live read check**

`scripts/check-season-data.ts` runs the real loader against the live database, read-only, and prints what the planner would show:

```ts
/**
 * Read-only: loads the Season page data from the live database and prints the
 * season, the plans by disposition and the last meal on the books.
 * Run: npm run check:season-data
 */
import { loadSeasonPageData } from '../src/app/admin/season/season-data'
import { todayAeIso } from '../src/contexts/season/domain/season-dates'
import { projectPlan, lastMealOnTheBooks } from '../src/contexts/season/domain/season-projection'

async function main() {
  const data = await loadSeasonPageData(todayAeIso())
  const closures = new Set(data.closureDates)
  const books = data.plans.map((p) => projectPlan(p, { todayAe: data.todayAe, closureDates: closures, wrapUpDay: null, closeDay: null }))
  const withSeason = data.plans.map((p) => projectPlan(p, { todayAe: data.todayAe, closureDates: closures, wrapUpDay: data.snapshot.wrapUpDay, closeDay: data.snapshot.closeDay }))
  console.log(JSON.stringify({
    today: data.todayAe,
    snapshot: data.snapshot,
    salesStoppedAt: data.salesStoppedAt,
    plans: data.plans.length,
    lastMealOnTheBooks: lastMealOnTheBooks(books),
    dispositions: withSeason.map((p) => ({ plan: p.planId.slice(0, 8), disposition: p.disposition, lastDinner: p.lastDinner, mealsLeft: p.mealsLeft })),
    mealValues: data.plans.map((p) => ({ plan: p.id.slice(0, 8), mealValue: p.mealValue })),
  }, null, 2))
}

main().catch((err) => { console.error(err); process.exit(1) })
```

Add to `package.json` `scripts`:

```json
    "check:season-planner": "node scripts/check-season-planner.mjs",
    "check:season-data": "tsx --env-file=.env.local --conditions=react-server scripts/check-season-data.ts"
```

- [ ] **Step 4: Run both checks**

Start the dev server in the background from the worktree root: `npm run dev -- -p 3100`. Wait until `http://localhost:3100/dev/season-admin` answers 200.

Run: `BASE_URL=http://localhost:3100 SHOT_DIR=<an existing scratch directory> npm run check:season-planner`
Expected: `check-season-planner: 8 renders OK`. Open the eight screenshots and confirm, for `scheduled @1280`: Omar Farouk and Chen Wei show "Runs past", Yusuf Ali "Starts after", Priya Nair "Customer paused", Layla Haddad "Staff approval pending", Aisha Rahman "Finishes"; the kitchen calendar marks Wed 30 Sep "wrap-up".

Run: `npm run check:season-data`
Expected: JSON with `snapshot.phase` `"winding_down"`, `snapshot.salesStopped` `true`, `snapshot.wrapUpDay` `null`, `plans` equal to the live count of Active/Skipped/Paused/Scheduled plans, and a `lastMealOnTheBooks` date. No error. (On 2026-09-14 that was 3 plans with the last meal on Mon 28 Sep.)

Stop the dev server.

- [ ] **Step 5: Full suite and commit**

Run: `npx vitest run` and `npx tsc --noEmit -p .`
Expected: all pass, no type errors.

```bash
git add src/app/dev/season-admin/page.tsx scripts/check-season-planner.mjs scripts/check-season-data.ts package.json
git commit -m "test(season): fixtures, a rendered check and a live read check for the season planner

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## After Plan A

1. Final whole-branch review (subagent-driven-development).
2. Merge `feat/season-wind-down` into `main` (coordinate with the other session so its uncommitted work is untouched), then deploy with `git push origin main:Production` (owner decision 2026-09-14: deploy after each plan passes).
3. After the deploy, open `/admin/season` as the owner: the status reads "Sales stopped, no wrap-up day" and the planner shows the last meal on the books.
4. Write Plan B (wind-down customer rules) from spec §7.

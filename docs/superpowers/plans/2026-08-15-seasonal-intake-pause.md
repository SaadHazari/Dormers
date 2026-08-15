# Seasonal Intake Pause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the operator a switch that stops all new plan purchases between semesters, presents an unmissable and honest explanation, and captures the blocked lead with an early-access list and a monthly-only credit.

**Architecture:** A single-row `intake_settings` table read through a cached, fail-open module modelled exactly on the existing `feature-flags.ts` kill-switch. Enforcement is server-side at every purchase entry point; the UI gate is presentation only. The credit rides the existing `credits` → `synthesizePerSessionCoupon` → Stripe coupon pipeline, extended with a nullable plan restriction that leaves every existing credit source behaving identically.

**Tech Stack:** Next.js App Router (RSC + server actions), TypeScript, Supabase (Postgres + RLS), Stripe, framer-motion, Vitest.

**Spec:** [docs/superpowers/specs/2026-08-15-seasonal-intake-pause-design.md](../specs/2026-08-15-seasonal-intake-pause-design.md)

**Companion plan:** the broadcast composer and the two Meta WhatsApp templates (spec §9, §10) are a separate plan. This one ships working software without them; the reopening message is sent by hand until that plan lands.

---

## Global Constraints

- **Live Supabase is the Ohio project `yjjayivwfqjfppawgyaz`.** All DDL goes through the Supabase MCP against that project id. Repo migration files are a mirror for source control and are known to drift from live — never trust a repo file as the current state.
- **New tables need explicit `revoke` + RLS.** `anon` and `authenticated` inherit full default DML on every table in this database, so RLS is the protection, not withheld grants.
- **Fail open, always.** A settings-read failure resolves to "not paused". A flag-table problem must never block a sale.
- **Credit amounts:** Non Veg `20`, Veg `15`, Religious Preference `20` (AED). Editable in admin, never hardcoded at a call site.
- **Monthly means `monthly-max` and `monthly-premium` only.** Not `staff-monthly`, not `trial`, not `weekly-flex`, not `welcome-gift`.
- **No end date anywhere.** No countdown, no scheduled resume, no "back on the Nth" copy. Ever.
- **Copy carries no emoji and no em or en dashes.** Use periods, commas, and "to" for ranges. Curly apostrophes are fine.
- **Brand tokens:** orange `#f57f20` is the ceiling (fade lighter, never darker into amber or red). `#8c4214` for small orange text on cream. Navy `#091825`. Cream `#ede8da` / `#f5f0e8`. Never sharp `#fff` on navy — warm cream `#f5f0e8` instead. White is only for text on orange fills.
- **`useReducedMotion` is honoured on every animated surface.**
- **Test command:** `npx vitest run <path>`. **Before any push:** `npm run lint` — Netlify treats `no-unused-vars` as an error and `tsc` alone misses orphaned imports.
- **Never push to git.** Commit freely; pushing burns paid Netlify build credits and happens only when explicitly asked.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260815_intake_settings.sql` | Mirror of the `intake_settings` DDL |
| `supabase/migrations/20260815_credits_eligible_plans.sql` | Mirror of the `credits.eligible_plan_ids` DDL |
| `supabase/migrations/20260815_intake_waitlist.sql` | Mirror of the `intake_waitlist` DDL |
| `src/infra/config/intake.ts` | Cached, fail-open read of `intake_settings` |
| `src/infra/config/intake.test.ts` | Tests for the above |
| `src/contexts/subscriptions/domain/credit-eligibility.ts` | Pure predicate: may this credit apply to this plan |
| `src/contexts/subscriptions/domain/credit-eligibility.test.ts` | Tests for the above |
| `src/contexts/subscriptions/usecases/join-intake-waitlist.ts` | Opt-in server action |
| `src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts` | Tests for the above |
| `src/app/dashboard/_shared/IntakePausedGate.tsx` | The frosted gate over the plan grid |
| `src/app/dashboard/_shared/IntakePauseTakeover.tsx` | Once-per-state-change full-surface moment |
| `src/app/dashboard/_shared/LockedCreditNote.tsx` | Inline "why this credit is not applying" note |
| `src/app/admin/season/page.tsx` | Admin server component |
| `src/app/admin/season/SeasonClient.tsx` | Admin UI |
| `src/app/admin/season/actions.ts` | Admin server actions |

**Modified:**

| File | Change |
|---|---|
| `src/infra/supabase/subscriptions-repo.ts` | `getRedeemableCredit` becomes plan-aware |
| `src/app/api/checkout/route.ts` | Pause guard; plan-filtered credit fetch |
| `src/app/r/[cid]/actions.ts` | Pause guard on gift claim |
| `src/contexts/payments/usecases/free-checkout.ts` | Pause guard |
| `src/app/dashboard/plan/page.tsx` | Pass intake state + per-plan credit split |
| `src/app/dashboard/plan/PlanClient.tsx` | Render gate + locked-credit note |
| `src/app/dashboard/plan/CheckoutPanel.tsx` | Render locked-credit note; handle `INTAKE_PAUSED` |
| `src/app/dashboard/_mobile/MobileCheckout.tsx` | Same as CheckoutPanel |
| `src/app/dashboard/_mobile/MobilePlan.tsx` | Render gate |
| `src/app/dashboard/_mobile/MobileExplore.tsx` | Render gate |
| `src/app/dashboard/NoPlanView.tsx` | Render gate |
| `src/app/dashboard/explore-plans/page.tsx` | Pass intake state |
| `src/app/dashboard/Sidebar.tsx` | Now tray entries |
| `src/app/dashboard/ClientDashboard.tsx` | Mount the takeover |
| `src/app/admin/AdminSidebar.tsx` | "Season" entry under Setup |

---

## Task 1: `intake_settings` table

**Files:**
- Create: `supabase/migrations/20260815_intake_settings.sql`

**Interfaces:**
- Consumes: nothing
- Produces: table `public.intake_settings`, single row, columns `paused boolean`, `headline text`, `body text`, `credit_nonveg_aed numeric`, `credit_veg_aed numeric`, `credit_religious_aed numeric`, `paused_at timestamptz`, `paused_by text`, `updated_at timestamptz`

- [ ] **Step 1: Apply the DDL live via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` against project `yjjayivwfqjfppawgyaz`, name `intake_settings`:

```sql
create table if not exists public.intake_settings (
  id                   boolean primary key default true,
  paused               boolean not null default false,
  headline             text    not null default 'We are between semesters.',
  body                 text    not null default 'Dormers cooks when the dorms are full. We have paused new plans until enough of you are back on campus.',
  credit_nonveg_aed    numeric not null default 20,
  credit_veg_aed       numeric not null default 15,
  credit_religious_aed numeric not null default 20,
  paused_at            timestamptz,
  paused_by            text,
  updated_at           timestamptz not null default now(),
  constraint intake_settings_singleton check (id)
);

alter table public.intake_settings enable row level security;
revoke all on public.intake_settings from anon, authenticated;
grant all on public.intake_settings to service_role;

insert into public.intake_settings (id) values (true) on conflict (id) do nothing;
```

- [ ] **Step 2: Verify the row exists**

Run via `mcp__claude_ai_Supabase__execute_sql`:

```sql
select paused, credit_nonveg_aed, credit_veg_aed, credit_religious_aed from public.intake_settings;
```

Expected: exactly one row, `paused = false`, amounts `20 / 15 / 20`.

- [ ] **Step 3: Verify the singleton constraint holds**

```sql
insert into public.intake_settings (id) values (true);
```

Expected: FAIL with a duplicate key violation on `intake_settings_pkey`. This proves a second row cannot be created.

- [ ] **Step 4: Write the source-control mirror**

Create `supabase/migrations/20260815_intake_settings.sql` containing the exact DDL from Step 1, prefixed with:

```sql
-- Seasonal intake pause — operator switch that stops all new plan purchases.
-- Single row enforced by the `id boolean primary key default true` + check
-- trick, so there is never a "which row is live" question.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-15. This file is the source-control mirror.
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260815_intake_settings.sql
git commit -m "feat(intake): add intake_settings table for the seasonal pause switch"
```

---

## Task 2: `getIntakeState()` — cached, fail-open read

**Files:**
- Create: `src/infra/config/intake.ts`
- Test: `src/infra/config/intake.test.ts`
- Read first: `src/infra/config/feature-flags.ts` (this module is its sibling and must match its shape)

**Interfaces:**
- Consumes: `createAdminSupabaseClient` from `@/infra/supabase/admin-client`
- Produces:
  ```ts
  export interface IntakeState {
    paused: boolean
    headline: string
    body: string
    creditNonvegAed: number
    creditVegAed: number
    creditReligiousAed: number
  }
  export function getIntakeState(): Promise<IntakeState>
  export function creditAedFor(state: IntakeState, mealPreferenceType: string | null | undefined): number
  export function __resetIntakeCache(): void
  ```

- [ ] **Step 1: Write the failing test**

Create `src/infra/config/intake.test.ts`:

```ts
/**
 * Tests for getIntakeState — reads the single settings row, caches it, and
 * FAILS OPEN (not paused) on any error or missing row. A settings-table
 * problem must never block a sale.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { maybeSingleMock } = vi.hoisted(() => ({ maybeSingleMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({ select: () => ({ maybeSingle: maybeSingleMock }) }),
  }),
}))

import { getIntakeState, creditAedFor, __resetIntakeCache } from './intake'

const ROW = {
  paused: true,
  headline: 'We are between semesters.',
  body: 'Back when the dorms fill up.',
  credit_nonveg_aed: 20,
  credit_veg_aed: 15,
  credit_religious_aed: 20,
}

beforeEach(() => {
  __resetIntakeCache()
  maybeSingleMock.mockReset()
})

describe('getIntakeState', () => {
  it('reports paused when the row says paused', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null })
    const state = await getIntakeState()
    expect(state.paused).toBe(true)
    expect(state.headline).toBe('We are between semesters.')
    expect(state.creditVegAed).toBe(15)
  })

  it('reports open when the row says not paused', async () => {
    maybeSingleMock.mockResolvedValue({ data: { ...ROW, paused: false }, error: null })
    expect((await getIntakeState()).paused).toBe(false)
  })

  it('fails OPEN when the row is missing', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    expect((await getIntakeState()).paused).toBe(false)
  })

  it('fails OPEN when the read errors', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'db down' } })
    expect((await getIntakeState()).paused).toBe(false)
  })

  it('still returns usable credit defaults when it fails open', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const state = await getIntakeState()
    expect(state.creditNonvegAed).toBe(20)
    expect(state.creditVegAed).toBe(15)
    expect(state.creditReligiousAed).toBe(20)
  })

  it('caches within the TTL (second call does not hit the DB)', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null })
    await getIntakeState()
    await getIntakeState()
    expect(maybeSingleMock).toHaveBeenCalledTimes(1)
  })
})

describe('creditAedFor', () => {
  const state = {
    paused: true,
    headline: '',
    body: '',
    creditNonvegAed: 20,
    creditVegAed: 15,
    creditReligiousAed: 20,
  }

  it('gives the non-veg amount to a Non Veg customer', () => {
    expect(creditAedFor(state, 'Non Veg')).toBe(20)
  })

  it('gives the veg amount to a Veg customer', () => {
    expect(creditAedFor(state, 'Veg')).toBe(15)
  })

  it('gives the religious amount to a Religious Preference customer', () => {
    expect(creditAedFor(state, 'Religious Preference')).toBe(20)
  })

  it('falls back to the non-veg amount for an unknown or missing preference', () => {
    expect(creditAedFor(state, null)).toBe(20)
    expect(creditAedFor(state, 'Something Else')).toBe(20)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/infra/config/intake.test.ts
```

Expected: FAIL — cannot resolve `./intake`.

- [ ] **Step 3: Write the implementation**

Create `src/infra/config/intake.ts`:

```ts
import 'server-only'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'

/**
 * Seasonal intake pause — the operator switch that stops all new plan
 * purchases between semesters.
 *
 * Sibling of feature-flags.ts and deliberately the same shape: a short
 * in-memory cache over a service-role read, so flipping the switch in the
 * admin panel takes effect within CACHE_TTL_MS with no redeploy.
 *
 * FAIL OPEN: if the read errors or the row is missing, intake stays OPEN.
 * A settings-table outage must never block a sale — the switch exists for
 * deliberate pausing, not as a hard dependency of checkout.
 */

const CACHE_TTL_MS = 30_000

export interface IntakeState {
  paused: boolean
  headline: string
  body: string
  creditNonvegAed: number
  creditVegAed: number
  creditReligiousAed: number
}

/** Used when the row is missing or unreadable. Intake stays open. */
const FAIL_OPEN: IntakeState = {
  paused: false,
  headline: '',
  body: '',
  creditNonvegAed: 20,
  creditVegAed: 15,
  creditReligiousAed: 20,
}

let cache: { state: IntakeState; at: number } | null = null

export async function getIntakeState(): Promise<IntakeState> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.state

  try {
    const sb = createAdminSupabaseClient()
    const { data, error } = await sb
      .from('intake_settings')
      .select('paused, headline, body, credit_nonveg_aed, credit_veg_aed, credit_religious_aed')
      .maybeSingle()
    if (error) throw error
    if (!data) return FAIL_OPEN

    const row = data as Record<string, unknown>
    const state: IntakeState = {
      paused: row.paused === true,
      headline: String(row.headline ?? ''),
      body: String(row.body ?? ''),
      creditNonvegAed: Number(row.credit_nonveg_aed ?? FAIL_OPEN.creditNonvegAed),
      creditVegAed: Number(row.credit_veg_aed ?? FAIL_OPEN.creditVegAed),
      creditReligiousAed: Number(row.credit_religious_aed ?? FAIL_OPEN.creditReligiousAed),
    }
    cache = { state, at: Date.now() }
    return state
  } catch {
    return FAIL_OPEN // never let a settings-read failure close the shop
  }
}

/**
 * The waitlist credit this customer is owed, by meal preference.
 * Religious Preference takes the non-veg figure (owner decision) because
 * the plan includes non-veg days and is priced closer to non-veg than veg.
 * Unknown or missing preference errs generous rather than stingy.
 */
export function creditAedFor(
  state: IntakeState,
  mealPreferenceType: string | null | undefined,
): number {
  if (mealPreferenceType === 'Veg') return state.creditVegAed
  if (mealPreferenceType === 'Religious Preference') return state.creditReligiousAed
  return state.creditNonvegAed
}

/** Test seam — clear the in-memory cache between tests. */
export function __resetIntakeCache(): void {
  cache = null
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/infra/config/intake.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/infra/config/intake.ts src/infra/config/intake.test.ts
git commit -m "feat(intake): add cached fail-open intake-state reader"
```

---

## Task 3: Credit plan-eligibility predicate

**Files:**
- Create: `src/contexts/subscriptions/domain/credit-eligibility.ts`
- Test: `src/contexts/subscriptions/domain/credit-eligibility.test.ts`

**Interfaces:**
- Consumes: `PlanId` from `@/contexts/subscriptions/domain/plans`
- Produces:
  ```ts
  export const MONTHLY_PLAN_IDS: readonly PlanId[]
  export const INTAKE_WAITLIST_SOURCE = 'intake_waitlist'
  export function creditAppliesToPlan(eligiblePlanIds: string[] | null | undefined, planId: PlanId): boolean
  ```

This is a pure function with no I/O so the rule is testable on its own and reusable by both the display path and the checkout path — the two that the existing repo comment insists must stay in lockstep.

- [ ] **Step 1: Write the failing test**

Create `src/contexts/subscriptions/domain/credit-eligibility.test.ts`:

```ts
/**
 * Credit plan-eligibility. A NULL restriction means "usable anywhere", which
 * is what every credit issued before the intake-pause feature carries — the
 * regression tests below are the guard on that.
 */

import { describe, it, expect } from 'vitest'
import { creditAppliesToPlan, MONTHLY_PLAN_IDS } from './credit-eligibility'

describe('creditAppliesToPlan', () => {
  it('applies an unrestricted credit to every plan (existing behaviour)', () => {
    for (const plan of ['monthly-max', 'monthly-premium', 'weekly-flex', 'trial', 'welcome-gift', 'staff-monthly'] as const) {
      expect(creditAppliesToPlan(null, plan)).toBe(true)
      expect(creditAppliesToPlan(undefined, plan)).toBe(true)
    }
  })

  it('applies a monthly-restricted credit to both monthly plans', () => {
    expect(creditAppliesToPlan([...MONTHLY_PLAN_IDS], 'monthly-max')).toBe(true)
    expect(creditAppliesToPlan([...MONTHLY_PLAN_IDS], 'monthly-premium')).toBe(true)
  })

  it('rejects a monthly-restricted credit on weekly, trial, gift and staff plans', () => {
    for (const plan of ['weekly-flex', 'trial', 'welcome-gift', 'staff-monthly'] as const) {
      expect(creditAppliesToPlan([...MONTHLY_PLAN_IDS], plan)).toBe(false)
    }
  })

  it('treats an empty restriction array as restricting everything', () => {
    expect(creditAppliesToPlan([], 'monthly-max')).toBe(false)
  })

  it('does not include staff-monthly in MONTHLY_PLAN_IDS', () => {
    expect(MONTHLY_PLAN_IDS).not.toContain('staff-monthly')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/contexts/subscriptions/domain/credit-eligibility.test.ts
```

Expected: FAIL — cannot resolve `./credit-eligibility`.

- [ ] **Step 3: Write the implementation**

Create `src/contexts/subscriptions/domain/credit-eligibility.ts`:

```ts
import type { PlanId } from './plans'

/**
 * Plans the seasonal-pause waitlist credit may be redeemed against.
 *
 * `staff-monthly` is deliberately absent: it is intern remuneration assigned
 * by an admin, not a customer purchase, and the checkout route already
 * exempts it from every discount mechanism.
 */
export const MONTHLY_PLAN_IDS: readonly PlanId[] = ['monthly-max', 'monthly-premium']

/** `credits.source` value for a credit granted by joining the early-access list. */
export const INTAKE_WAITLIST_SOURCE = 'intake_waitlist'

/**
 * May this credit be applied to this plan?
 *
 * NULL / undefined means unrestricted, which is what every credit issued
 * before this feature carries (referral, Dorm Wars, weekly review). Those
 * must keep applying everywhere, so the null case returns true.
 */
export function creditAppliesToPlan(
  eligiblePlanIds: string[] | null | undefined,
  planId: PlanId,
): boolean {
  if (eligiblePlanIds == null) return true
  return eligiblePlanIds.includes(planId)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/contexts/subscriptions/domain/credit-eligibility.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/subscriptions/domain/credit-eligibility.ts src/contexts/subscriptions/domain/credit-eligibility.test.ts
git commit -m "feat(credits): add plan-eligibility predicate with unrestricted default"
```

---

## Task 4: `credits.eligible_plan_ids` column

**Files:**
- Create: `supabase/migrations/20260815_credits_eligible_plans.sql`

**Interfaces:**
- Consumes: existing `public.credits` table
- Produces: nullable `eligible_plan_ids text[]` on `credits`

- [ ] **Step 1: Apply the DDL live via Supabase MCP**

Project `yjjayivwfqjfppawgyaz`, migration name `credits_eligible_plans`:

```sql
alter table public.credits
  add column if not exists eligible_plan_ids text[];

comment on column public.credits.eligible_plan_ids is
  'NULL = redeemable against any plan (the default, and what every credit issued before the seasonal intake pause carries). A non-null array restricts redemption to those plan ids.';
```

- [ ] **Step 2: Verify every existing credit is unrestricted**

```sql
select count(*) as total,
       count(*) filter (where eligible_plan_ids is not null) as restricted
  from public.credits;
```

Expected: `restricted = 0`. If this is not zero, stop — something has written a restriction before the feature exists.

- [ ] **Step 3: Confirm column-level grants did not widen**

```sql
select grantee, privilege_type
  from information_schema.column_privileges
 where table_name = 'credits' and column_name = 'eligible_plan_ids';
```

Expected: no `anon` or `authenticated` rows with `UPDATE`. Credits are server-controlled; a customer must never set their own restriction.

- [ ] **Step 4: Write the source-control mirror**

Create `supabase/migrations/20260815_credits_eligible_plans.sql` with the DDL from Step 1, prefixed with:

```sql
-- Plan-restricted credits, for the seasonal intake pause.
--
-- BACKWARDS COMPATIBILITY IS THE POINT: the column is nullable and every
-- existing row stays NULL, which the eligibility predicate reads as
-- "redeemable anywhere". Referral, Dorm Wars and weekly-review credits are
-- completely unaffected.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-15. This file is the source-control mirror.
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260815_credits_eligible_plans.sql
git commit -m "feat(credits): add nullable eligible_plan_ids restriction column"
```

---

## Task 5: Plan-aware `getRedeemableCredit`

**Files:**
- Modify: `src/infra/supabase/subscriptions-repo.ts:120-164`
- Test: `src/infra/supabase/redeemable-credit.test.ts` (create)

Read the comment block above `getRedeemableCredit` before changing anything. It states the invariant this task must preserve: the checkout route and the plan page **must use the same filter** so the displayed amount and the redeemed amount stay in lockstep. Splitting that filter is the bug this task exists to avoid.

**Interfaces:**
- Consumes: `creditAppliesToPlan`, `PlanId`
- Produces:
  ```ts
  export interface RedeemableCreditRow { id: string; amount_aed: number }
  export interface RedeemableCredit {
    rows: RedeemableCreditRow[]
    balanceFils: number
    lockedFils: number          // NEW — held but not usable on this plan
    lockedRequiresMonthly: boolean  // NEW — drives the customer-facing note
  }
  export function getRedeemableCredit(sb: SupabaseClient, userId: string, planId?: PlanId): Promise<RedeemableCredit>
  ```

`planId` is optional so existing callers that do not care about a specific plan keep compiling; omitting it means "no plan filter", which preserves today's behaviour exactly.

- [ ] **Step 1: Write the failing test**

Create `src/infra/supabase/redeemable-credit.test.ts`:

```ts
/**
 * getRedeemableCredit must stay the single source of truth for BOTH the
 * displayed credit and the redeemed credit. These tests pin the split
 * between redeemable and locked, and guard that unrestricted credits keep
 * behaving exactly as they did before plan restrictions existed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRedeemableCredit } from './subscriptions-repo'

const orderMock = vi.fn()

function sbWith(rows: unknown[]) {
  orderMock.mockResolvedValue({ data: rows, error: null })
  return {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: orderMock }) }) }),
    }),
  } as never
}

beforeEach(() => orderMock.mockReset())

describe('getRedeemableCredit', () => {
  it('sums unrestricted credits with no plan filter (existing behaviour)', async () => {
    const sb = sbWith([
      { id: 'a', amount_aed: 30, eligible_plan_ids: null },
      { id: 'b', amount_aed: 12.5, eligible_plan_ids: null },
    ])
    const res = await getRedeemableCredit(sb, 'user-1')
    expect(res.balanceFils).toBe(4250)
    expect(res.lockedFils).toBe(0)
    expect(res.rows).toHaveLength(2)
  })

  it('keeps unrestricted credits redeemable on a weekly plan', async () => {
    const sb = sbWith([{ id: 'a', amount_aed: 30, eligible_plan_ids: null }])
    const res = await getRedeemableCredit(sb, 'user-1', 'weekly-flex')
    expect(res.balanceFils).toBe(3000)
    expect(res.lockedFils).toBe(0)
  })

  it('redeems a monthly-restricted credit on a monthly plan', async () => {
    const sb = sbWith([{ id: 'w', amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] }])
    const res = await getRedeemableCredit(sb, 'user-1', 'monthly-premium')
    expect(res.balanceFils).toBe(2000)
    expect(res.lockedFils).toBe(0)
    expect(res.lockedRequiresMonthly).toBe(false)
  })

  it('locks a monthly-restricted credit on a weekly plan', async () => {
    const sb = sbWith([{ id: 'w', amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] }])
    const res = await getRedeemableCredit(sb, 'user-1', 'weekly-flex')
    expect(res.balanceFils).toBe(0)
    expect(res.rows).toHaveLength(0)
    expect(res.lockedFils).toBe(2000)
    expect(res.lockedRequiresMonthly).toBe(true)
  })

  it('locks a monthly-restricted credit on a trial plan too', async () => {
    const sb = sbWith([{ id: 'w', amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] }])
    const res = await getRedeemableCredit(sb, 'user-1', 'trial')
    expect(res.lockedFils).toBe(2000)
    expect(res.lockedRequiresMonthly).toBe(true)
  })

  it('splits a mixed balance correctly on a weekly plan', async () => {
    const sb = sbWith([
      { id: 'referral', amount_aed: 50, eligible_plan_ids: null },
      { id: 'waitlist', amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] },
    ])
    const res = await getRedeemableCredit(sb, 'user-1', 'weekly-flex')
    expect(res.balanceFils).toBe(5000)
    expect(res.rows.map(r => r.id)).toEqual(['referral'])
    expect(res.lockedFils).toBe(2000)
    expect(res.lockedRequiresMonthly).toBe(true)
  })

  it('redeems the whole mixed balance on a monthly plan', async () => {
    const sb = sbWith([
      { id: 'referral', amount_aed: 50, eligible_plan_ids: null },
      { id: 'waitlist', amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] },
    ])
    const res = await getRedeemableCredit(sb, 'user-1', 'monthly-max')
    expect(res.balanceFils).toBe(7000)
    expect(res.lockedFils).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/infra/supabase/redeemable-credit.test.ts
```

Expected: FAIL — `lockedFils` is undefined and the third argument is not accepted.

- [ ] **Step 3: Write the implementation**

In `src/infra/supabase/subscriptions-repo.ts`, add the import at the top of the file:

```ts
import { creditAppliesToPlan } from '@/contexts/subscriptions/domain/credit-eligibility'
import type { PlanId } from '@/contexts/subscriptions/domain/plans'
```

Replace the `RedeemableCredit` interface and `getRedeemableCredit` body with:

```ts
export interface RedeemableCredit {
  rows:        RedeemableCreditRow[]
  /** Sum of `amount_aed × 100`, rounded — the balance redeemable on THIS plan. */
  balanceFils: number
  /** Held, approved, but not redeemable against this plan. Display only. */
  lockedFils:  number
  /** True when the locked balance would unlock on a monthly plan. */
  lockedRequiresMonthly: boolean
}

/**
 * Returns approved credit rows + their summed balance in fils for redemption.
 *
 * When `planId` is supplied the rows are filtered by `eligible_plan_ids`, and
 * anything excluded is reported separately as `lockedFils` so the customer can
 * be told WHY a credit they hold is not coming off the price. Omitting
 * `planId` applies no filter, preserving the pre-restriction behaviour for
 * callers that are not plan-specific.
 *
 * Both the checkout route and the plan page MUST call this with the same
 * planId — that lockstep is what keeps the displayed discount and the charged
 * discount identical.
 */
export async function getRedeemableCredit(
  sb: SupabaseClient,
  userId: string,
  planId?: PlanId,
): Promise<RedeemableCredit> {
  const { data } = await sb
    .from('credits')
    .select('id, amount_aed, eligible_plan_ids')
    .eq('customer_id', userId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true })

  const all = (data ?? []) as Array<{
    id: string
    amount_aed: number
    eligible_plan_ids: string[] | null
  }>

  const rows: RedeemableCreditRow[] = []
  let lockedFils = 0
  let lockedRequiresMonthly = false

  for (const r of all) {
    const usable = planId == null || creditAppliesToPlan(r.eligible_plan_ids, planId)
    if (usable) {
      rows.push({ id: r.id, amount_aed: Number(r.amount_aed) })
    } else {
      lockedFils += Math.round(Number(r.amount_aed) * 100)
      if ((r.eligible_plan_ids ?? []).some(p => p.startsWith('monthly-'))) {
        lockedRequiresMonthly = true
      }
    }
  }

  const balanceFils = rows.reduce(
    (sum, r) => sum + Math.round(r.amount_aed * 100),
    0,
  )
  return { rows, balanceFils, lockedFils, lockedRequiresMonthly }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/infra/supabase/redeemable-credit.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Run the whole suite to catch existing callers**

```bash
npx vitest run
```

Expected: PASS. Any failure here is an existing caller destructuring `RedeemableCredit` — fix it by ignoring the new fields, not by changing the shape.

- [ ] **Step 6: Commit**

```bash
git add src/infra/supabase/subscriptions-repo.ts src/infra/supabase/redeemable-credit.test.ts
git commit -m "feat(credits): make redeemable-credit lookup plan-aware with a locked split"
```

---

## Task 6: Pause guard on the checkout API

**Files:**
- Modify: `src/app/api/checkout/route.ts` (guard immediately after the `if (!user)` block, around line 38)
- Test: `src/app/api/intake-pause-guard.test.ts` (create)

**Interfaces:**
- Consumes: `getIntakeState` from `@/infra/config/intake`
- Produces: `409` response body `{ error: 'INTAKE_PAUSED', message: string }`

Placing the guard directly after the auth check means a paused shop does zero Stripe, pricing or DB work before rejecting.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/intake-pause-guard.test.ts`:

```ts
/**
 * The pause is enforced on the SERVER. A stale browser tab, a bookmarked
 * form, or a hand-crafted POST must all be rejected — the UI gate is a
 * courtesy, this is the enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getIntakeStateMock } = vi.hoisted(() => ({ getIntakeStateMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/config/intake', () => ({
  getIntakeState: getIntakeStateMock,
  creditAedFor: () => 20,
}))
vi.mock('@/infra/stripe/client', () => ({
  stripeClient: () => ({}),
}))
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } } }) },
  }),
}))
vi.mock('@/infra/admin-alerts/notify', () => ({ notifyAdmin: vi.fn() }))

import { POST } from './checkout/route'

beforeEach(() => getIntakeStateMock.mockReset())

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/checkout intake guard', () => {
  it('rejects with 409 INTAKE_PAUSED when intake is paused', async () => {
    getIntakeStateMock.mockResolvedValue({ paused: true, headline: 'We are between semesters.', body: 'Back soon enough.' })
    const res = await POST(req({ amount: 30000, plan: 'monthly-premium' }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe('INTAKE_PAUSED')
    expect(typeof json.message).toBe('string')
  })

  it('does not reject when intake is open', async () => {
    getIntakeStateMock.mockResolvedValue({ paused: false, headline: '', body: '' })
    const res = await POST(req({ amount: 30000, plan: 'monthly-premium' }))
    expect(res.status).not.toBe(409)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/app/api/intake-pause-guard.test.ts
```

Expected: FAIL — the paused case does not return 409.

- [ ] **Step 3: Write the implementation**

In `src/app/api/checkout/route.ts`, add to the imports:

```ts
import { getIntakeState } from '@/infra/config/intake';
```

Insert immediately after the `if (!user) { ... }` block:

```ts
    // ── Seasonal intake pause ──────────────────────────────────────────────
    // Placed before ANY Stripe, pricing or profile work so a paused shop
    // rejects cheaply. The UI gates the plan surfaces, but a stale tab or a
    // hand-crafted POST reaches here — this is the authoritative stop.
    // getIntakeState fails open, so a settings-read blip lets the sale through
    // rather than closing the shop by accident.
    const intake = await getIntakeState();
    if (intake.paused) {
      return NextResponse.json({
        error: 'INTAKE_PAUSED',
        message: intake.body || 'We have paused new plans for now. Save your spot and we will message you the day we reopen.',
      }, { status: 409 });
    }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/app/api/intake-pause-guard.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/checkout/route.ts src/app/api/intake-pause-guard.test.ts
git commit -m "feat(intake): reject checkout server-side while intake is paused"
```

---

## Task 7: Checkout applies the plan filter to credits

**Files:**
- Modify: `src/app/api/checkout/route.ts` (the credit fetch around line 318)

**Interfaces:**
- Consumes: `getRedeemableCredit(sb, userId, planId)` from Task 5
- Produces: no new exports; the coupon synth now only ever sees eligible rows

The filter belongs at the **fetch**, before `synthesizePerSessionCoupon`. Filtering after synthesis would leave the coupon and the reserved row set disagreeing, which is the exact failure this ordering prevents.

- [ ] **Step 1: Write the failing test**

Append to `src/app/api/intake-pause-guard.test.ts`:

```ts
describe('checkout credit fetch is plan-scoped', () => {
  it('passes the resolved plan id to getRedeemableCredit', async () => {
    getIntakeStateMock.mockResolvedValue({ paused: false, headline: '', body: '' })
    const { getRedeemableCredit } = await import('@/infra/supabase/subscriptions-repo')
    const spy = vi.mocked(getRedeemableCredit)
    await POST(req({ amount: 30000, plan: 'weekly-flex' }))
    const planArg = spy.mock.calls.at(-1)?.[2]
    expect(planArg).toBe('weekly-flex')
  })
})
```

Add this mock alongside the others at the top of the file:

```ts
vi.mock('@/infra/supabase/subscriptions-repo', () => ({
  getRedeemableCredit: vi.fn(async () => ({ rows: [], balanceFils: 0, lockedFils: 0, lockedRequiresMonthly: false })),
}))
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/app/api/intake-pause-guard.test.ts
```

Expected: FAIL — `planArg` is `undefined` because the route calls the two-argument form.

- [ ] **Step 3: Write the implementation**

In `src/app/api/checkout/route.ts`, find the `getRedeemableCredit` call in the Dorm Wars credit-redemption block (around line 318) and pass the resolved plan id as the third argument:

```ts
    // Plan-scoped so a plan-restricted credit (the seasonal-pause waitlist
    // credit is monthly-only) never reaches the coupon synth for a plan it
    // cannot be spent on. Filtering here rather than after synthesis keeps the
    // coupon and the reserved row set in agreement.
    const { rows: creditRows } = isStaffPlan
      ? { rows: [] }
      : await getRedeemableCredit(supabase, user.id, planDef.id);
```

Keep the existing staff-plan short-circuit exactly as it is — staff surcharge is exempt from every discount mechanism and must not start fetching credits.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/app/api/intake-pause-guard.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Run the whole suite**

```bash
npx vitest run
```

Expected: PASS. Pay attention to any existing checkout or tier-audit test — a regression here is a money bug.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/checkout/route.ts src/app/api/intake-pause-guard.test.ts
git commit -m "feat(credits): scope the checkout credit fetch to the plan being bought"
```

---

## Task 8: Pause guard on gift claim and free checkout

**Files:**
- Modify: `src/app/r/[cid]/actions.ts`
- Modify: `src/contexts/payments/usecases/free-checkout.ts`
- Test: `src/contexts/payments/free-checkout-intake-guard.test.ts` (create)

A claimed gift is a real meal the kitchen has to cook, so it is intake and must stop. Staff provisioning in `src/contexts/staff` is deliberately **not** touched — it is admin-assigned remuneration.

**Interfaces:**
- Consumes: `getIntakeState`
- Produces: both paths return their existing error shape with an intake-paused message

- [ ] **Step 1: Write the failing test**

Create `src/contexts/payments/free-checkout-intake-guard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getIntakeStateMock } = vi.hoisted(() => ({ getIntakeStateMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/config/intake', () => ({ getIntakeState: getIntakeStateMock }))

import { assertIntakeOpen } from './usecases/free-checkout'

beforeEach(() => getIntakeStateMock.mockReset())

describe('assertIntakeOpen', () => {
  it('throws while intake is paused', async () => {
    getIntakeStateMock.mockResolvedValue({ paused: true, body: 'Paused for the season.' })
    await expect(assertIntakeOpen()).rejects.toThrow(/paused/i)
  })

  it('resolves while intake is open', async () => {
    getIntakeStateMock.mockResolvedValue({ paused: false, body: '' })
    await expect(assertIntakeOpen()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/contexts/payments/free-checkout-intake-guard.test.ts
```

Expected: FAIL — `assertIntakeOpen` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/contexts/payments/usecases/free-checkout.ts`:

```ts
import { getIntakeState } from '@/infra/config/intake'

/**
 * Shared intake guard for the non-Stripe provisioning paths — free checkout
 * and referral gift claims. A claimed gift is a real meal the kitchen has to
 * cook, so it counts as intake and stops with everything else.
 *
 * Staff and intern provisioning is intentionally NOT guarded: it is assigned
 * by an admin rather than bought by a customer.
 */
export async function assertIntakeOpen(): Promise<void> {
  const intake = await getIntakeState()
  if (intake.paused) {
    throw new Error(
      intake.body || 'New plans are paused for now. Save your spot and we will message you the day we reopen.',
    )
  }
}
```

Call `await assertIntakeOpen()` at the top of the free-checkout provisioning function, and at the top of the gift-claim action in `src/app/r/[cid]/actions.ts` (import it from `@/contexts/payments/usecases/free-checkout`), inside the existing try/catch so the customer sees the message rather than a crash.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/contexts/payments/free-checkout-intake-guard.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/payments/usecases/free-checkout.ts src/app/r/\[cid\]/actions.ts src/contexts/payments/free-checkout-intake-guard.test.ts
git commit -m "feat(intake): stop gift claims and free checkout while intake is paused"
```

---

## Task 9: `intake_waitlist` table

**Files:**
- Create: `supabase/migrations/20260815_intake_waitlist.sql`

**Interfaces:**
- Produces: `public.intake_waitlist` with `customer_id uuid unique`

- [ ] **Step 1: Apply the DDL live via Supabase MCP**

Project `yjjayivwfqjfppawgyaz`, migration name `intake_waitlist`:

```sql
create table if not exists public.intake_waitlist (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  credit_id   uuid references public.credits(id),
  notified_at timestamptz
);

create index if not exists intake_waitlist_pending_idx
  on public.intake_waitlist (joined_at)
  where notified_at is null;

alter table public.intake_waitlist enable row level security;
revoke all on public.intake_waitlist from anon, authenticated;
grant select on public.intake_waitlist to authenticated;
grant all on public.intake_waitlist to service_role;

create policy "own_row_read" on public.intake_waitlist
  for select to authenticated using (customer_id = auth.uid());

create policy "service_role_full_access" on public.intake_waitlist
  for all using (true) with check (true);
```

The `unique` on `customer_id` is what makes the opt-in idempotent — it is the database, not the application, that guarantees one credit per customer.

- [ ] **Step 2: Verify the uniqueness guarantee**

```sql
insert into public.intake_waitlist (customer_id)
  select id from public.customers limit 1;
insert into public.intake_waitlist (customer_id)
  select id from public.customers limit 1;
```

Expected: the first succeeds, the second FAILS with a unique violation. Then clean up:

```sql
delete from public.intake_waitlist;
```

- [ ] **Step 3: Verify a customer cannot read someone else's row**

```sql
select policyname, cmd, qual from pg_policies where tablename = 'intake_waitlist';
```

Expected: an `own_row_read` SELECT policy qualified by `customer_id = auth.uid()`.

- [ ] **Step 4: Write the source-control mirror**

Create `supabase/migrations/20260815_intake_waitlist.sql` with the DDL from Step 1, prefixed with:

```sql
-- Early-access list for the seasonal intake pause.
--
-- The UNIQUE on customer_id is load-bearing: it is what makes the opt-in
-- idempotent, so a double tap can never grant two credits. Do not relax it.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-15. This file is the source-control mirror.
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260815_intake_waitlist.sql
git commit -m "feat(intake): add intake_waitlist table with idempotent customer uniqueness"
```

---

## Task 10: Join-the-list server action

**Files:**
- Create: `src/contexts/subscriptions/usecases/join-intake-waitlist.ts`
- Test: `src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts`

**Interfaces:**
- Consumes: `getIntakeState`, `creditAedFor`, `MONTHLY_PLAN_IDS`, `INTAKE_WAITLIST_SOURCE`
- Produces:
  ```ts
  export interface JoinWaitlistResult { ok: boolean; alreadyJoined: boolean; creditAed: number; message: string }
  export function joinIntakeWaitlist(): Promise<JoinWaitlistResult>
  ```

- [ ] **Step 1: Write the failing test**

Create `src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts`:

```ts
/**
 * Opt-in must be idempotent (a double tap grants exactly one credit) and must
 * pick the amount from the customer's meal preference.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getIntakeStateMock, insertWaitlistMock, insertCreditMock, customerMock, userMock } = vi.hoisted(() => ({
  getIntakeStateMock: vi.fn(),
  insertWaitlistMock: vi.fn(),
  insertCreditMock: vi.fn(),
  customerMock: vi.fn(),
  userMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/infra/config/intake', async () => {
  const actual = await vi.importActual<typeof import('@/infra/config/intake')>('@/infra/config/intake')
  return { getIntakeState: getIntakeStateMock, creditAedFor: actual.creditAedFor }
})
vi.mock('@/utils/supabase/auth', () => ({ getUserFromHeaders: userMock }))
vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'customers') return { select: () => ({ eq: () => ({ maybeSingle: customerMock }) }) }
      if (table === 'credits') return { insert: () => ({ select: () => ({ single: insertCreditMock }) }) }
      // intake_waitlist — insert for the opt-in, update to stamp credit_id
      return { insert: insertWaitlistMock, update: () => ({ eq: async () => ({ error: null }) }) }
    },
  }),
}))

import { joinIntakeWaitlist } from './join-intake-waitlist'

const STATE = {
  paused: true, headline: '', body: '',
  creditNonvegAed: 20, creditVegAed: 15, creditReligiousAed: 20,
}

beforeEach(() => {
  getIntakeStateMock.mockReset().mockResolvedValue(STATE)
  userMock.mockReset().mockResolvedValue({ id: 'u1', email: 'a@b.c' })
  insertCreditMock.mockReset().mockResolvedValue({ data: { id: 'credit-1' }, error: null })
  insertWaitlistMock.mockReset().mockResolvedValue({ error: null })
  customerMock.mockReset()
})

describe('joinIntakeWaitlist', () => {
  it('grants the veg amount to a Veg customer', async () => {
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Veg' }, error: null })
    const res = await joinIntakeWaitlist()
    expect(res.ok).toBe(true)
    expect(res.creditAed).toBe(15)
  })

  it('grants the non-veg amount to a Religious Preference customer', async () => {
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Religious Preference' }, error: null })
    expect((await joinIntakeWaitlist()).creditAed).toBe(20)
  })

  it('is idempotent — a second join grants no second credit', async () => {
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Non Veg' }, error: null })
    insertWaitlistMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    const res = await joinIntakeWaitlist()
    expect(res.ok).toBe(true)
    expect(res.alreadyJoined).toBe(true)
    expect(insertCreditMock).not.toHaveBeenCalled()
  })

  it('refuses when intake is not actually paused', async () => {
    getIntakeStateMock.mockResolvedValue({ ...STATE, paused: false })
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Non Veg' }, error: null })
    const res = await joinIntakeWaitlist()
    expect(res.ok).toBe(false)
    expect(insertCreditMock).not.toHaveBeenCalled()
  })

  it('refuses when there is no signed-in user', async () => {
    userMock.mockResolvedValue(null)
    expect((await joinIntakeWaitlist()).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts
```

Expected: FAIL — cannot resolve `./join-intake-waitlist`.

- [ ] **Step 3: Write the implementation**

Create `src/contexts/subscriptions/usecases/join-intake-waitlist.ts`:

```ts
'use server'

import { getIntakeState, creditAedFor } from '@/infra/config/intake'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { MONTHLY_PLAN_IDS, INTAKE_WAITLIST_SOURCE } from '../domain/credit-eligibility'

export interface JoinWaitlistResult {
  ok: boolean
  alreadyJoined: boolean
  creditAed: number
  message: string
}

/**
 * Join the early-access list during a seasonal pause.
 *
 * The waitlist row goes in FIRST. Its UNIQUE(customer_id) is the idempotency
 * guarantee, so a double tap loses the race at the database and never reaches
 * the credit insert. Doing it the other way round would mint a second credit
 * before discovering the duplicate.
 *
 * The credit is granted NOW, not at reopening, deliberately: holding a visible
 * balance during the wait is the whole mechanic. It is restricted to monthly
 * plans and does not expire.
 */
export async function joinIntakeWaitlist(): Promise<JoinWaitlistResult> {
  const none = { ok: false, alreadyJoined: false, creditAed: 0 }

  const user = await getUserFromHeaders()
  if (!user) return { ...none, message: 'Please sign in first.' }

  const intake = await getIntakeState()
  if (!intake.paused) {
    return { ...none, message: 'Plans are open. No need to save a spot.' }
  }

  const sb = createAdminSupabaseClient()

  const { data: customer } = await sb
    .from('customers')
    .select('meal_preference_type')
    .eq('id', user.id)
    .maybeSingle()

  const creditAed = creditAedFor(
    intake,
    (customer as { meal_preference_type?: string } | null)?.meal_preference_type,
  )

  const { error: waitlistError } = await sb
    .from('intake_waitlist')
    .insert({ customer_id: user.id })

  if (waitlistError) {
    // 23505 = unique violation. Already on the list, already credited.
    if (waitlistError.code === '23505') {
      return {
        ok: true,
        alreadyJoined: true,
        creditAed,
        message: 'You are already on the list.',
      }
    }
    return { ...none, message: 'Could not save your spot. Please try again.' }
  }

  const { data: credit, error: creditError } = await sb
    .from('credits')
    .insert({
      customer_id: user.id,
      amount_aed: creditAed,
      source: INTAKE_WAITLIST_SOURCE,
      status: 'approved',
      eligible_plan_ids: [...MONTHLY_PLAN_IDS],
    })
    .select('id')
    .single()

  if (creditError) {
    // The spot is saved either way. An admin can reconcile a missing credit
    // from the waitlist row, which is better than failing the customer's tap.
    return {
      ok: true,
      alreadyJoined: false,
      creditAed: 0,
      message: 'Your spot is saved. We will sort your credit before we reopen.',
    }
  }

  await sb
    .from('intake_waitlist')
    .update({ credit_id: (credit as { id: string }).id })
    .eq('customer_id', user.id)

  return {
    ok: true,
    alreadyJoined: false,
    creditAed,
    message: `Your spot is saved. AED ${creditAed} is waiting in your account.`,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/subscriptions/usecases/join-intake-waitlist.ts src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts
git commit -m "feat(intake): add idempotent join-the-list action that grants the waitlist credit"
```

---

## Task 11: The paused gate component

**Files:**
- Create: `src/app/dashboard/_shared/IntakePausedGate.tsx`
- Read first: `src/app/dashboard/_shared/ProfileGateOverlay.tsx` (this is its sibling; match its structure)

**Interfaces:**
- Consumes: `joinIntakeWaitlist`, tokens from `./tokens`
- Produces:
  ```tsx
  export function IntakePausedGate(props: {
    headline: string
    body: string
    creditAed: number
    alreadyJoined: boolean
  }): JSX.Element
  ```

- [ ] **Step 1: Build the component**

Create `src/app/dashboard/_shared/IntakePausedGate.tsx`. It mirrors `ProfileGateOverlay`'s absolute-inset frosted overlay and sticky card, with three differences: it animates in via framer-motion, it carries a one-tap action, and it transforms in place on success.

Requirements the implementer must satisfy exactly:

- Root is `position: absolute; inset: -8; zIndex: 5` with `background: var(--ds-overlay)` and a `blur(7px)` backdrop filter, matching the profile gate so the two feel like one family.
- The card is `position: sticky; top: 96` so it never falls below the fold on mobile.
- Entry animation: opacity 0 to 1 and y 8 to 0 over 0.28s. **Wrap in `useReducedMotion()` and skip the transform entirely when it returns true** — the message still arrives, just without movement.
- Headline uses `S.fg`, body uses `S.fgMuted`, both `fontFamily: BODY`.
- The credit line is the loudest element on the card: `AED {creditAed} is waiting in your account`. Use `OG_DEEP` (`#8c4214`), not `OG`, because it sits on a cream surface where the lighter orange fails contrast.
- Button: background `OG`, text `#fff` (white is correct on an orange fill), `borderRadius: 'var(--radius-pill)'`, uppercase, letter-spacing `0.04em`.
- On tap, call `joinIntakeWaitlist()` inside a `useTransition`, disable the button while pending, then swap the card contents to the confirmed state without unmounting the card.
- Confirmed state: a check glyph, "You are on the list.", the credit line, and a text link to `/dashboard/menu` reading "See what you will be eating". The customer leaves with an appetite, not a rejection.
- **No date, no countdown, no "back soon".** If a future edit adds one, it is wrong.
- `alreadyJoined` renders the confirmed state directly on mount, with no animation.

- [ ] **Step 2: Verify it renders at 375px**

Use the headless recipe in the project notes (`playwright-core` + cached Chromium at `/tmp/pw-runner`). Screenshot `/dashboard/plan` at 375px wide with intake paused.

Expected: the card is fully visible without horizontal scroll, the credit line is legible against the cream, and the button is at least 44px tall.

- [ ] **Step 3: Verify the reduced-motion path**

Re-run the screenshot with `prefers-reduced-motion: reduce` emulated.

Expected: the card is present and complete, with no transform applied.

- [ ] **Step 4: Lint**

```bash
npm run lint
```

Expected: clean. Orphaned imports are build-breaking on Netlify.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/_shared/IntakePausedGate.tsx
git commit -m "feat(intake): add the paused gate that sits over the plan grid"
```

---

## Task 12: Thread the gate into every plan surface

**Files:**
- Modify: `src/app/dashboard/plan/page.tsx`
- Modify: `src/app/dashboard/plan/PlanClient.tsx:1711` (beside the existing `ProfileGateOverlay` mount)
- Modify: `src/app/dashboard/_mobile/MobilePlan.tsx`
- Modify: `src/app/dashboard/_mobile/MobileExplore.tsx`
- Modify: `src/app/dashboard/NoPlanView.tsx`
- Modify: `src/app/dashboard/explore-plans/page.tsx`

**Interfaces:**
- Consumes: `getIntakeState`, `IntakePausedGate`
- Produces: an `intake` prop on each surface, shaped `{ paused: boolean; headline: string; body: string; creditAed: number; alreadyJoined: boolean }`

Follow exactly how `missingProfileFields` already flows from the server component into `PlanClient` and out to `ProfileGateOverlay`. Same shape, same place, so the two gates stay siblings rather than two competing mechanisms.

- [ ] **Step 1: Resolve intake state in the server components**

In `src/app/dashboard/plan/page.tsx`, add `getIntakeState()` and the customer's waitlist row to the existing `Promise.all`, and derive the customer-specific credit with `creditAedFor`. Pass the resulting `intake` object into `PlanClient`. Do the same in `src/app/dashboard/explore-plans/page.tsx`.

- [ ] **Step 2: Mount the gate beside the profile gate**

In `PlanClient.tsx`, at the existing overlay mount point:

```tsx
{intake.paused
  ? <IntakePausedGate
      headline={intake.headline}
      body={intake.body}
      creditAed={intake.creditAed}
      alreadyJoined={intake.alreadyJoined}
    />
  : profileGated && <ProfileGateOverlay missing={missingFields} />}
```

The pause takes precedence over the profile gate. Telling someone to finish their profile so they can buy something that is not for sale is the wrong instruction.

- [ ] **Step 3: Repeat for the three remaining surfaces**

Mount the same component with the same precedence rule in `MobilePlan.tsx`, `MobileExplore.tsx` and `NoPlanView.tsx`. Each already has a wrapper with `position: relative` for the profile gate; reuse it.

- [ ] **Step 4: Verify every surface**

Screenshot all four at 375px and at desktop width with intake paused.

Expected: on each surface, plans are visible but blurred, and exactly one gate card is shown. No surface shows both gates.

- [ ] **Step 5: Verify the keyboard path is closed**

Tab through a gated surface and press Enter on a plan card.

Expected: nothing is selected. The overlay blocks pointers but not keyboard focus, which is why the profile gate guards at the `onSelect` call sites too. Add the same guard here.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/app/dashboard
git commit -m "feat(intake): gate every plan surface while intake is paused"
```

---

## Task 13: The locked-credit note

**Files:**
- Create: `src/app/dashboard/_shared/LockedCreditNote.tsx`
- Modify: `src/app/dashboard/plan/CheckoutPanel.tsx`
- Modify: `src/app/dashboard/_mobile/MobileCheckout.tsx`
- Modify: `src/app/dashboard/plan/page.tsx`

**Interfaces:**
- Consumes: `lockedFils` and `lockedRequiresMonthly` from Task 5
- Produces:
  ```tsx
  export function LockedCreditNote(props: { lockedAed: number }): JSX.Element | null
  ```

The rule from the spec: if a customer holds a credit and it is not being applied to the price in front of them, they are told why on that screen, before they pay. This applies on **weekly and trial alike** — never only on some plans.

- [ ] **Step 1: Build the component**

Create `src/app/dashboard/_shared/LockedCreditNote.tsx`. Returns `null` when `lockedAed` is 0.

Copy, verbatim:

> **AED {lockedAed} credit not applied.** Your credit unlocks on a monthly plan. It stays in your account until then.

Styling: sits directly beside the price, inside a card with `background: var(--ds-og-wash-strong)` and a 1px `var(--ds-og-border-strong)` border, radius 12, padding `10px 12px`. The amount is `OG_DEEP` and bold; the explanation is `S.fgMuted` at 12.5px. No icon larger than 16px — this is an explanation, not an alarm.

- [ ] **Step 2: Wire it into both checkout surfaces**

`CheckoutPanel.tsx` and `MobileCheckout.tsx` both receive `lockedFils` for the currently-selected plan and render `<LockedCreditNote lockedAed={lockedFils / 100} />` immediately below the total.

Because `getRedeemableCredit` is now plan-aware, the plan page must resolve the split **per selectable plan**, not once. Pass a map of `planId → { balanceFils, lockedFils }` from the server component so switching plan cards updates the number without a round trip.

- [ ] **Step 3: Verify on all three non-monthly plans**

With a waitlist credit present, open checkout for `weekly-flex`, then `trial`.

Expected: on both, the total shows no discount AND the note is visible. This is the exact hole the owner caught in review — trial must not be silent.

- [ ] **Step 4: Verify it disappears on monthly**

Open checkout for `monthly-premium` with the same credit.

Expected: the discount is applied to the total, and the note is absent.

- [ ] **Step 5: Verify displayed matches charged**

Complete a real Stripe test checkout on `monthly-premium`.

Expected: the Stripe session amount equals the displayed net exactly. Any mismatch means the display path and the checkout path have drifted, which is the failure the repo comment on `getRedeemableCredit` warns about.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/app/dashboard
git commit -m "feat(credits): explain an unapplied credit at checkout on every plan"
```

---

## Task 14: Now tray entries

**Files:**
- Modify: `src/app/dashboard/Sidebar.tsx`
- Modify: `src/app/dashboard/SidebarDropdowns.tsx`

**Interfaces:**
- Consumes: `getIntakeState`, the customer's waitlist row
- Produces: up to two Now tray entries

Per the project's Now tray architecture, time-bound state lives here rather than on content pages.

- [ ] **Step 1: Add the paused entry**

When `intake.paused`, add a tray entry: title "New plans paused", subtitle "We are between semesters." It links to `/dashboard/plan`. Quiet and factual — the takeover in Task 15 does the shouting; this is the residue.

- [ ] **Step 2: Add the credit entry**

When the customer is on the waitlist and holds an unspent waitlist credit, add a tray entry: title "AED {n} waiting", subtitle "Unlocks on a monthly plan."

This entry is the ownership mechanic. If the balance is not on screen it is not doing its job, so it stays for as long as the credit is unspent — including after intake reopens, when it becomes the reason to come back.

- [ ] **Step 3: Verify both entries at 375px**

Screenshot the sidebar with intake paused and a credit held.

Expected: both entries render, text does not truncate mid-word, and the tray does not overflow.

- [ ] **Step 4: Verify the credit entry survives reopening**

Set `paused = false` with a credit still unspent.

Expected: the paused entry is gone, the credit entry remains.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/app/dashboard/Sidebar.tsx src/app/dashboard/SidebarDropdowns.tsx
git commit -m "feat(intake): surface pause state and waiting credit in the Now tray"
```

---

## Task 15: Pause and reopen takeovers

**Files:**
- Create: `src/app/dashboard/_shared/IntakePauseTakeover.tsx`
- Modify: `src/app/dashboard/ClientDashboard.tsx`
- Read first: `src/app/dashboard/_shared/CheckoutSuccessTakeover.tsx` (match its visual language)

**Interfaces:**
- Produces:
  ```tsx
  export function IntakePauseTakeover(props: {
    variant: 'pausing' | 'reopened'
    creditAed: number
    onDismiss: () => void
  }): JSX.Element
  ```

- [ ] **Step 1: Build both variants**

`pausing` — shown to customers with a live plan on their first dashboard visit after the pause begins.

**Lead with the reassurance, not the news.** Heading: "Your plan is safe." Then: new plans are paused between semesters, every delivery already paid for continues exactly as scheduled, and we will message you when we reopen. A pause announcement that reads as "Dormers is closing" causes churn this feature exists to avoid.

`reopened` — shown to the early-access list when intake reopens. Heading: "We are back." Body names the credit: "Your AED {n} is ready." Primary action goes to `/dashboard/plan`.

Both use the `TIER_POP` dark navy panel with `TIER_POP_TEXT.primary` (`#f5f0e8`) — warm cream, never sharp white.

- [ ] **Step 2: Fire each once per state change**

Track dismissal per state transition, not per session, so the takeover never returns after being dismissed. Reuse the pattern `CheckoutSuccessTakeover` already uses for clearing its trigger.

The Now tray carries the state afterwards. A takeover that reappears is nagging.

- [ ] **Step 3: Honour reduced motion**

Wrap all entry animation in `useReducedMotion()`.

- [ ] **Step 4: Verify the once-only rule**

Load the dashboard with the pause freshly on, dismiss the takeover, then reload three times.

Expected: it appears exactly once and never again. Then flip to reopened.

Expected: the reopened takeover appears once, independently of the pausing one having been dismissed.

- [ ] **Step 5: Verify at 375px**

Screenshot both variants on mobile.

Expected: both fit without horizontal scroll, and the dismiss control is reachable with a thumb.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/app/dashboard/_shared/IntakePauseTakeover.tsx src/app/dashboard/ClientDashboard.tsx
git commit -m "feat(intake): add once-only pause and reopen takeovers"
```

---

## Task 16: Plan-ending-during-a-pause banner

**Files:**
- Create: `src/app/dashboard/_shared/PlanEndingPausedBanner.tsx`
- Modify: `src/app/dashboard/ActiveDashboard.tsx`
- Modify: `src/app/dashboard/_mobile/MobileHome.tsx`
- Read first: `src/app/dashboard/_shared/OutOfZoneBanner.tsx` (the inline banner pattern to follow)

**Interfaces:**
- Consumes: `getIntakeState`, the subscription's `end_date`, the customer's waitlist row
- Produces:
  ```tsx
  export function PlanEndingPausedBanner(props: {
    daysRemaining: number
    creditAed: number
    alreadyJoined: boolean
  }): JSX.Element | null
  ```

This is spec §6.4's "plan ending during a pause" row. Without it, a loyal customer discovers the pause by reaching checkout and finding it shut, which is exactly the silent flow break the governing principle forbids.

- [ ] **Step 1: Build the banner**

Renders only when intake is paused AND the customer's active subscription ends within 7 days. Returns `null` otherwise.

Copy: **"Your plan ends in {n} days."** Then: new plans are paused between semesters, so this one will not roll over. Save your spot and AED {creditAed} is waiting for the day we reopen.

Same one-tap `joinIntakeWaitlist()` action as the gate, and the same in-place transform to a confirmed state. When `alreadyJoined` is true it renders the confirmed variant on mount.

Styling follows `OutOfZoneBanner`: full-width card above the fold, `var(--ds-og-wash-strong)` background with a `var(--ds-og-border-strong)` border. The day count is `OG_DEEP` and bold.

The 7-day window matches the existing `renewEligible` threshold in `PlanClient.tsx:222`, so the banner appears exactly when the customer would otherwise have been offered a renew button.

- [ ] **Step 2: Mount on both home surfaces**

Add to `ActiveDashboard.tsx` (desktop) and `MobileHome.tsx` (mobile), above the hero in both.

- [ ] **Step 3: Verify the window boundary**

Set a test subscription's `end_date` to 8 days out with intake paused.

Expected: no banner. Move it to 7 days out.

Expected: banner appears.

- [ ] **Step 4: Verify it disappears when intake is open**

Set `paused = false` with an `end_date` 3 days out.

Expected: no banner, and the normal renew affordance is back.

- [ ] **Step 5: Verify at 375px**

Screenshot mobile home with the banner showing.

Expected: fits without horizontal scroll, does not push the hero below the fold.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/app/dashboard
git commit -m "feat(intake): warn customers whose plan ends during a pause"
```

---

## Task 17: Admin season page

**Files:**
- Create: `src/app/admin/season/page.tsx`
- Create: `src/app/admin/season/SeasonClient.tsx`
- Create: `src/app/admin/season/actions.ts`
- Modify: `src/app/admin/AdminSidebar.tsx:102-108` (the Setup group)
- Read first: `src/app/admin/holidays/page.tsx` and `src/app/admin/holidays/actions.ts` (the pattern to follow)

**Interfaces:**
- Consumes: `requireAdmin`, `createAdminSupabaseClient`, `logAdminAction`
- Produces:
  ```ts
  export function setIntakePaused(paused: boolean): Promise<{ ok: true } | { error: string }>
  export function updateIntakeCopy(headline: string, body: string): Promise<{ ok: true } | { error: string }>
  export function updateIntakeCredits(nonveg: number, veg: number, religious: number): Promise<{ ok: true } | { error: string }>
  ```

- [ ] **Step 1: Write the server actions**

Each action calls `await requireAdmin()` first, writes through `createAdminSupabaseClient`, calls `logAdminAction`, and calls `revalidatePath('/admin/season')`.

`setIntakePaused` also stamps `paused_at` and `paused_by` when turning the pause on, and clears `paused_at` when turning it off.

Validation, with these exact bounds: headline 1 to 120 characters, body 1 to 400 characters, each credit amount 0 to 200 inclusive. Reject anything outside with a plain-English message.

- [ ] **Step 2: Build the page**

The server component reads the settings row and counts the waitlist, mirroring how `holidays/page.tsx` reads closures and counts subscriptions in one `Promise.all`.

`SeasonClient` shows: the toggle, a live preview of the customer-facing card rendered from the current copy, the three credit fields, and the waitlist count.

- [ ] **Step 3: Confirm before toggling**

Turning the pause **on** requires a confirmation naming the consequence: "This stops every new plan purchase, including renewals. Existing subscriptions are unaffected."

Modals mount through `AdminModal` so they centre over the content area rather than drifting over the fixed 220px rail.

- [ ] **Step 4: Add the sidebar entry**

In `AdminSidebar.tsx`, add to the Setup group directly after Holidays:

```tsx
{ label: 'Season', href: '/admin/season', icon: <CalendarClock size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
```

Import `CalendarClock` from `lucide-react`.

- [ ] **Step 5: Verify the round trip**

Toggle the pause on in the admin panel, wait 30 seconds for the cache TTL, then load `/dashboard/plan` as a customer.

Expected: the gate appears. Toggle off, wait 30 seconds, reload.

Expected: plans are buyable again.

- [ ] **Step 6: Verify the audit trail**

```sql
select action, target_id, meta, created_at
  from public.admin_audit_log
 where action like '%intake%'
 order by created_at desc limit 5;
```

Expected: a row for each toggle and each edit, stamped with the admin's email.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint
git add src/app/admin/season src/app/admin/AdminSidebar.tsx
git commit -m "feat(admin): add the Season page for pausing and resuming intake"
```

---

## Task 18: Full-system verification

**Files:** none created; this task is the gate before the feature is called done.

- [ ] **Step 1: Run the entire suite**

```bash
npx vitest run
```

Expected: PASS, no skips.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 3: Verify cold-start budget is untouched**

```bash
npm run check:cold-start
```

Expected: within budget. Server init has a hard budget on this project; a previous regression truncated dashboard streams into a "Try again" dialog.

- [ ] **Step 4: Walk the customer path end to end**

With intake paused, as a customer with no plan: reach `/dashboard/plan`, see the gate, tap once, see the confirmation, see the Now tray entry, see the credit on the plan page.

Then turn intake off and buy `monthly-premium`.

Expected: the credit comes off the total, the Stripe amount matches the displayed net, and the credit row ends at `status = 'applied'`.

- [ ] **Step 5: Verify the regression surface**

With intake open, confirm a referral credit and a Dorm Wars credit still apply to a `weekly-flex` purchase exactly as before.

Expected: unchanged behaviour. This is the guard on the riskiest change in the plan.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(intake): address issues found in full-system verification"
```

---

## Deferred to the companion plan

- The broadcast composer (spec §9), including the email design on the dashboard brand and the logo as a 2x PNG.
- The two Meta WhatsApp templates `intake_pausing` and `intake_reopened` (spec §10), and the toggle offering to send them.

Until that plan lands, the reopening message is sent by hand. The `intake_waitlist.notified_at` column exists and stays null so the eventual broadcast can find everyone who has not yet been told.

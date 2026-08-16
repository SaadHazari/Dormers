# Credit Wallet and Per-Cycle Waitlist Credit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the early-access credit re-grantable at every new pause, give the pause takeover a join button that sits beside its existing dismiss, and surface the customer's credit balance as a persistent Credit Wallet in the sidebar.

**Architecture:** Three independent pieces, ordered by dependency. Task 1 is a data-model correction: the waitlist join and its credit are currently unique per customer *forever*, which blocks a returning customer at the second pause; they become unique per customer *per pause cycle*, keyed on `intake_settings.cycle_started_at`. Task 2 adds an accept action to the pausing takeover without removing its dismiss. Task 3 moves the credit balance out of the time-bound Now tray into a persistent sidebar rail.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase (Postgres + service-role admin client), vitest (node environment), framer-motion, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-15-seasonal-intake-pause-design.md`

## Global Constraints

- **Live database is Supabase project `yjjayivwfqjfppawgyaz` (Dormers-Ohio).** All migrations run through the Supabase MCP `apply_migration` against that project id. Repo SQL under `migrations/` is stale and must not be trusted.
- **vitest runs in the `node` environment with no React Testing Library** (`vitest.config.ts`, `include: ['src/**/*.{test,spec}.{ts,tsx}']`). Component render tests are not available. Any logic worth testing must be extracted into a pure module and tested there. This is the established pattern — see `src/app/dashboard/_shared/intake-join-outcome.ts`.
- **No emoji and no em or en dashes in user-facing copy.** Use periods and commas, and "to" for ranges. Curly apostrophes are fine.
- **`#f57f20` is the brand orange ceiling.** Gradients may fade lighter; never darker into amber, burnt orange or red.
- **Never sharp `#ffffff` text on navy.** Use warm cream `#f5f0e8`. White is only for text on an orange fill.
- **Radii come from `src/app/globals.css`:** `--radius-card: 16px`, `--radius-button: 12px`, `--radius-sm: 12px`, `--radius-md: 20px`, `--radius-pill: 999px`.
- **A held credit that is not being applied must always be explained on screen.** Never a footnote, never silent.
- **Pre-push verification is `npm run lint`, not just `tsc`.** Netlify treats `no-unused-vars` as an error.
- **Never push to git.** Commit freely; pushing is the user's explicit call.

---

### Task 1: Scope the waitlist join and its credit to one pause cycle

Today `intake_waitlist_customer_id_key` is `UNIQUE (customer_id)` and `credits_one_intake_waitlist_per_customer` is `UNIQUE (customer_id) WHERE source = 'intake_waitlist'`. Both are lifetime rules, so a customer who joined the first pause cannot join a second one and cannot be granted a second credit. The intended rule is one join and one credit **per pause cycle**, with the credit still single-use within that cycle.

`intake_settings.cycle_started_at` is stamped on every pause-ON and never cleared, so it is the natural cycle key.

**Files:**
- Migration: applied via Supabase MCP `apply_migration`, name `intake_waitlist_per_cycle`
- Modify: `src/contexts/subscriptions/usecases/join-intake-waitlist.ts`
- Modify: `src/infra/supabase/subscriptions-repo.ts` (`getWaitlistStatus`, around line 275)
- Test: `src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts` (exists)

**Interfaces:**
- Consumes: `getIntakeState()` from `src/infra/config/intake.ts`, which already returns `cycleStartedAt: string | null`.
- Produces:
  - `getWaitlistStatus(sb, userId, cycleStartedAt?: string | null): Promise<WaitlistStatus>` — third parameter added, optional so existing callers keep compiling until updated in the same task.
  - `WaitlistStatus.joined` now means "joined the CURRENT cycle".
  - `WaitlistStatus.unspentCreditAed` continues to mean "all approved waitlist credit this customer holds, from any cycle" — it is their money and must stay visible even if it was minted last season.

- [ ] **Step 1: Apply the migration**

Run through Supabase MCP `apply_migration`, project `yjjayivwfqjfppawgyaz`, name `intake_waitlist_per_cycle`:

```sql
-- intake_waitlist gets a cycle marker so a join is scoped to one pause.
alter table public.intake_waitlist
  add column if not exists cycle_started_at timestamptz;

-- Existing rows belong to the pause that is running now. Fall back to
-- joined_at if the settings row somehow has no cycle stamp.
update public.intake_waitlist w
set cycle_started_at = coalesce(
      (select s.cycle_started_at from public.intake_settings s limit 1),
      w.joined_at
    )
where w.cycle_started_at is null;

alter table public.intake_waitlist
  alter column cycle_started_at set not null;

-- Swap the lifetime-unique for a per-cycle unique. This index is still the
-- double-tap race guard: the second concurrent tap loses here, before any
-- credit is minted.
alter table public.intake_waitlist
  drop constraint if exists intake_waitlist_customer_id_key;

create unique index if not exists intake_waitlist_customer_cycle_key
  on public.intake_waitlist (customer_id, cycle_started_at);

-- Credits link back to the waitlist row that minted them, mirroring the
-- existing weekly_review_id / monthly_review_id pattern on this table.
alter table public.credits
  add column if not exists intake_waitlist_id uuid
    references public.intake_waitlist(id) on delete set null;

update public.credits c
set intake_waitlist_id = w.id
from public.intake_waitlist w
where w.credit_id = c.id
  and c.intake_waitlist_id is null;

-- One credit per waitlist row replaces one credit per customer forever.
-- Combined with the per-cycle waitlist unique above, this yields exactly one
-- waitlist credit per customer per pause.
drop index if exists public.credits_one_intake_waitlist_per_customer;

create unique index if not exists credits_one_per_intake_waitlist_row
  on public.credits (intake_waitlist_id)
  where intake_waitlist_id is not null;
```

- [ ] **Step 2: Verify the migration landed**

Run through Supabase MCP `execute_sql`:

```sql
select i.relname, pg_get_indexdef(x.indexrelid) as def
from pg_index x
join pg_class t on t.oid = x.indrelid
join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and i.relname in ('intake_waitlist_customer_cycle_key',
                    'credits_one_per_intake_waitlist_row',
                    'intake_waitlist_customer_id_key',
                    'credits_one_intake_waitlist_per_customer');
```

Expected: the first two exist, the last two are absent.

- [ ] **Step 3: Write the failing tests**

Append to `src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts`. These test the pure cycle-resolution helper introduced in Step 5, not the Supabase round trip.

```ts
import { describe, it, expect } from 'vitest'
import { resolveJoinCycle } from './join-intake-waitlist'

describe('resolveJoinCycle', () => {
  it('returns the cycle stamp when intake is paused and stamped', () => {
    expect(resolveJoinCycle({ paused: true, cycleStartedAt: '2026-08-15T18:15:51.035Z' }))
      .toEqual({ ok: true, cycleStartedAt: '2026-08-15T18:15:51.035Z' })
  })

  it('refuses when intake is open — there is no spot to save', () => {
    expect(resolveJoinCycle({ paused: false, cycleStartedAt: '2026-08-15T18:15:51.035Z' }))
      .toEqual({ ok: false, reason: 'not_paused' })
  })

  // A paused row with no cycle stamp cannot be scoped, and inserting a null
  // cycle would violate the NOT NULL added in Step 1. Fail loudly rather than
  // minting a credit that belongs to no pause.
  it('refuses when paused but the cycle was never stamped', () => {
    expect(resolveJoinCycle({ paused: true, cycleStartedAt: null }))
      .toEqual({ ok: false, reason: 'no_cycle' })
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts`
Expected: FAIL with "resolveJoinCycle is not exported" or "is not a function".

- [ ] **Step 5: Add the helper and thread the cycle through the join action**

In `src/contexts/subscriptions/usecases/join-intake-waitlist.ts`, add above `joinIntakeWaitlist`:

```ts
export type JoinCycle =
  | { ok: true; cycleStartedAt: string }
  | { ok: false; reason: 'not_paused' | 'no_cycle' }

/**
 * Which pause cycle is this join for?
 *
 * Pure so the rule is testable without Supabase. A join is only valid while
 * intake is paused AND that pause stamped a cycle. `intake_waitlist.cycle_started_at`
 * is NOT NULL, so an unstamped pause must be refused rather than inserted with
 * a null that would throw at the database.
 */
export function resolveJoinCycle(intake: { paused: boolean; cycleStartedAt: string | null }): JoinCycle {
  if (!intake.paused) return { ok: false, reason: 'not_paused' }
  if (!intake.cycleStartedAt) return { ok: false, reason: 'no_cycle' }
  return { ok: true, cycleStartedAt: intake.cycleStartedAt }
}
```

Replace the existing `if (!intake.paused) { ... }` guard inside `joinIntakeWaitlist` with:

```ts
  const cycle = resolveJoinCycle(intake)
  if (!cycle.ok) {
    return {
      ...none,
      message: cycle.reason === 'not_paused'
        ? 'Plans are open. No need to save a spot.'
        : 'We could not save your spot right now. Please try again shortly.',
    }
  }
```

Change the waitlist insert to carry the cycle:

```ts
  const { data: waitlistRow, error: waitlistError } = await sb
    .from('intake_waitlist')
    .insert({ customer_id: user.id, cycle_started_at: cycle.cycleStartedAt })
    .select('id')
    .single()
```

Replace `findWaitlistCredit` entirely. It must find the credit belonging to THIS cycle's waitlist row, at any status, so a credit already spent this cycle is never double-minted:

```ts
/**
 * The credit minted by a specific waitlist row, if one landed.
 *
 * Keyed on the waitlist row rather than on (customer_id, source) because the
 * customer may legitimately hold waitlist credits from earlier pauses. Status
 * is deliberately NOT filtered: a credit already spent this cycle still exists
 * and must block a second mint.
 */
async function findCycleCredit(
  sb: AdminSupabaseClient,
  waitlistId: string,
): Promise<{ creditId: string; amountAed: number; spent: boolean } | null> {
  const { data } = await sb
    .from('credits')
    .select('id, amount_aed, status')
    .eq('intake_waitlist_id', waitlistId)
    .maybeSingle()

  if (!data) return null
  const row = data as { id: string; amount_aed: string | number; status: string }
  return {
    creditId: row.id,
    amountAed: Number(row.amount_aed),
    spent: row.status === 'applied',
  }
}
```

Change `mintWaitlistCredit` to take and store the waitlist id:

```ts
async function mintWaitlistCredit(
  sb: AdminSupabaseClient,
  customerId: string,
  waitlistId: string,
  creditAed: number,
): Promise<{ creditId: string; amountAed: number } | null> {
  const { data: credit, error: creditError } = await sb
    .from('credits')
    .insert({
      customer_id: customerId,
      amount_aed: creditAed,
      source: INTAKE_WAITLIST_SOURCE,
      status: 'approved',
      eligible_plan_ids: [...MONTHLY_PLAN_IDS],
      intake_waitlist_id: waitlistId,
    })
    .select('id')
    .single()

  if (!creditError) {
    return { creditId: (credit as { id: string }).id, amountAed: creditAed }
  }

  // 23505 = a concurrent call already minted for this waitlist row.
  if (creditError.code === '23505') {
    const existing = await findCycleCredit(sb, waitlistId)
    return existing ? { creditId: existing.creditId, amountAed: existing.amountAed } : null
  }

  return null
}
```

In the `23505` already-joined branch, look up the existing row's id before checking for its credit:

```ts
    const { data: existingRow } = await sb
      .from('intake_waitlist')
      .select('id')
      .eq('customer_id', user.id)
      .eq('cycle_started_at', cycle.cycleStartedAt)
      .maybeSingle()

    if (!existingRow) {
      return { ...none, message: 'Could not save your spot. Please try again.' }
    }
    const waitlistId = (existingRow as { id: string }).id
    const existing = await findCycleCredit(sb, waitlistId)
```

Then replace every remaining `mintWaitlistCredit(sb, user.id, creditAed)` call with `mintWaitlistCredit(sb, user.id, waitlistId, creditAed)`, using `(waitlistRow as { id: string }).id` on the fresh-insert path.

Change `stampCreditId` to target the row rather than the customer:

```ts
async function stampCreditId(
  sb: AdminSupabaseClient,
  waitlistId: string,
  creditId: string,
): Promise<void> {
  const { error } = await sb
    .from('intake_waitlist')
    .update({ credit_id: creditId })
    .eq('id', waitlistId)

  if (error) {
    console.error('joinIntakeWaitlist: failed to stamp credit_id on intake_waitlist row', {
      waitlistId, creditId, error,
    })
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts`
Expected: PASS, including the pre-existing cases in that file.

- [ ] **Step 7: Scope `getWaitlistStatus` to the current cycle**

In `src/infra/supabase/subscriptions-repo.ts`, replace the `getWaitlistStatus` signature and its waitlist read:

```ts
export async function getWaitlistStatus(
  sb: SupabaseClient,
  userId: string,
  cycleStartedAt?: string | null,
): Promise<WaitlistStatus> {
  // `joined` is scoped to the CURRENT pause: a customer who joined last
  // season has not joined this one and must still see the join button.
  // `unspentCreditAed` is deliberately NOT scoped — an unspent credit from an
  // earlier pause is still the customer's money and stays visible.
  const waitlistQuery = cycleStartedAt
    ? sb.from('intake_waitlist').select('id').eq('customer_id', userId).eq('cycle_started_at', cycleStartedAt).maybeSingle()
    : sb.from('intake_waitlist').select('id').eq('customer_id', userId).limit(1).maybeSingle()

  const [waitlistResult, creditsResult] = await Promise.all([
    waitlistQuery,
    sb.from('credits').select('amount_aed').eq('customer_id', userId).eq('source', INTAKE_WAITLIST_SOURCE).eq('status', 'approved'),
  ])
```

Leave the rest of the function body unchanged.

- [ ] **Step 8: Pass the cycle from every caller**

Run: `grep -rn "getWaitlistStatus(" src --include="*.ts" --include="*.tsx"`

For each call site that already has an `IntakeState` in scope, add `intake.cycleStartedAt` as the third argument. Where no `IntakeState` is in scope, call `await getIntakeState()` first (it is cached for 30 seconds, so the extra call is not a new round trip).

- [ ] **Step 9: Verify the whole project still compiles and lints**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint`
Expected: no errors. Warnings about `<img>` in `QrCodesClient.tsx` and `RiderClient.tsx` are pre-existing and expected.

- [ ] **Step 10: Commit**

```bash
git add src/contexts/subscriptions/usecases/join-intake-waitlist.ts \
        src/contexts/subscriptions/usecases/join-intake-waitlist.test.ts \
        src/infra/supabase/subscriptions-repo.ts
git commit -m "fix(intake): scope the waitlist join and credit to one pause cycle

The unique rules were per customer for life, so a customer who joined the
first pause could neither rejoin nor be granted a credit at the second one.
Joining is now unique per (customer, cycle_started_at), and a credit is
unique per waitlist row, which together give exactly one credit per customer
per pause. The credit stays single-use within its cycle.

getWaitlistStatus.joined is now cycle-scoped. unspentCreditAed deliberately
is not: an unspent credit from an earlier pause is still the customer's
money and must stay on screen."
```

---

### Task 2: Join button on the pause takeover, beside its dismiss

The pausing takeover is the loudest surface this feature has, and today its only control is a "Got it" dismiss. It gains a "Save my spot" action. The dismiss stays: anything a customer can accept, they must also be able to decline.

**Files:**
- Create: `src/app/dashboard/_shared/pause-takeover-actions.ts`
- Test: `src/app/dashboard/_shared/pause-takeover-actions.test.ts`
- Modify: `src/app/dashboard/_shared/IntakePauseTakeover.tsx`
- Modify: `src/app/dashboard/ClientDashboard.tsx` (passes the new prop)

**Interfaces:**
- Consumes: `deriveJoinOutcome` and `JoinOutcome` from `src/app/dashboard/_shared/intake-join-outcome.ts`; `joinIntakeWaitlist` from `src/contexts/subscriptions/usecases/join-intake-waitlist`.
- Produces: `pauseTakeoverCta(input): PauseTakeoverCta` — consumed only inside `IntakePauseTakeover`.

- [ ] **Step 1: Write the failing test**

Create `src/app/dashboard/_shared/pause-takeover-actions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pauseTakeoverCta } from './pause-takeover-actions'

describe('pauseTakeoverCta', () => {
  it('offers the join and softens the dismiss when there is a spot to save', () => {
    expect(pauseTakeoverCta({ variant: 'pausing', alreadyJoined: false, justJoined: false }))
      .toEqual({ showJoin: true, joinLabel: 'Save my spot', dismissLabel: 'Not now' })
  })

  it('drops the join once the customer is already on the list', () => {
    expect(pauseTakeoverCta({ variant: 'pausing', alreadyJoined: true, justJoined: false }))
      .toEqual({ showJoin: false, joinLabel: '', dismissLabel: 'Got it' })
  })

  it('drops the join immediately after a successful tap', () => {
    expect(pauseTakeoverCta({ variant: 'pausing', alreadyJoined: false, justJoined: true }))
      .toEqual({ showJoin: false, joinLabel: '', dismissLabel: 'Got it' })
  })

  // The reopened variant has nothing to accept — it is pure payoff.
  it('leaves the reopened variant untouched', () => {
    expect(pauseTakeoverCta({ variant: 'reopened', alreadyJoined: true, justJoined: false }))
      .toEqual({ showJoin: false, joinLabel: '', dismissLabel: 'See your plan options' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/dashboard/_shared/pause-takeover-actions.test.ts`
Expected: FAIL with "Failed to resolve import ./pause-takeover-actions".

- [ ] **Step 3: Write the helper**

Create `src/app/dashboard/_shared/pause-takeover-actions.ts`:

```ts
/**
 * Which controls the seasonal takeover shows.
 *
 * Pure because this repo's vitest runs in the node environment with no React
 * Testing Library, so the only way to test takeover behaviour is to keep the
 * rules out of JSX. Same reasoning as intake-join-outcome.ts.
 *
 * The rule that matters: whenever a join is offered, a decline is offered
 * beside it. A takeover that can only be accepted is a trap, so the dismiss
 * is never removed, only reworded.
 */
export interface PauseTakeoverCta {
  showJoin: boolean
  joinLabel: string
  dismissLabel: string
}

export function pauseTakeoverCta(input: {
  variant: 'pausing' | 'reopened'
  alreadyJoined: boolean
  justJoined: boolean
}): PauseTakeoverCta {
  if (input.variant === 'reopened') {
    return { showJoin: false, joinLabel: '', dismissLabel: 'See your plan options' }
  }
  if (input.alreadyJoined || input.justJoined) {
    return { showJoin: false, joinLabel: '', dismissLabel: 'Got it' }
  }
  return { showJoin: true, joinLabel: 'Save my spot', dismissLabel: 'Not now' }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/dashboard/_shared/pause-takeover-actions.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire the helper into the takeover**

In `src/app/dashboard/_shared/IntakePauseTakeover.tsx`:

Extend `Props`:

```ts
interface Props {
    variant: 'pausing' | 'reopened'
    creditAed: number
    onDismiss: () => void
    /** True when this customer already saved a spot in the CURRENT pause. */
    alreadyJoined?: boolean
}
```

Add imports at the top of the file:

```ts
import { useTransition } from 'react'
import { joinIntakeWaitlist } from '@/contexts/subscriptions/usecases/join-intake-waitlist'
import { deriveJoinOutcome, type JoinOutcome } from './intake-join-outcome'
import { pauseTakeoverCta } from './pause-takeover-actions'
```

Inside the component, beside the existing `dismissing` state:

```ts
    const [outcome, setOutcome] = useState<JoinOutcome | null>(null)
    const [joining, startJoin] = useTransition()

    const cta = pauseTakeoverCta({
        variant,
        alreadyJoined: !!alreadyJoined,
        justJoined: !!outcome?.joined,
    })

    // Every displayed value comes from the action's own result, never from the
    // prospective `creditAed` prop — that prop is what the settings row would
    // mint, not what actually landed. Promising an amount that was never
    // created is the exact regression intake-join-outcome.ts exists to stop.
    const handleJoin = () => {
        startJoin(async () => {
            const result = await joinIntakeWaitlist()
            setOutcome(deriveJoinOutcome(result))
        })
    }
```

Replace the single-button block (currently the `<div style={{ display: 'flex', justifyContent: 'center' }}>` wrapper around the one `<button>`) with a column holding the join button above the dismiss:

```tsx
                {outcome?.message && (
                    <p style={{
                        margin: '0 0 18px 0', fontSize: 14, lineHeight: '22px',
                        color: TIER_POP_TEXT.primary, textAlign: 'center',
                    }}>
                        {outcome.message}
                    </p>
                )}
                {outcome?.error && (
                    <p style={{
                        margin: '0 0 18px 0', fontSize: 14, lineHeight: '22px',
                        color: '#ffb4a2', textAlign: 'center',
                    }}>
                        {outcome.error}
                    </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    {cta.showJoin && (
                        <button
                            type="button"
                            onClick={handleJoin}
                            disabled={joining}
                            style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                minHeight: 48, padding: '14px 32px',
                                borderRadius: 'var(--radius-pill)', border: 0,
                                background: OG, color: '#fff',
                                fontFamily: BODY, fontSize: 13, fontWeight: 700,
                                letterSpacing: '0.06em', textTransform: 'uppercase',
                                cursor: joining ? 'default' : 'pointer',
                                boxShadow: '0 8px 28px rgba(245,127,32,0.50)',
                                opacity: joining ? 0.85 : 1,
                            }}
                        >
                            {joining ? 'Saving your spot' : cta.joinLabel}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleDismiss}
                        disabled={dismissing}
                        style={cta.showJoin ? {
                            // Secondary when it sits under an offer: still a real
                            // control, visibly not the primary one.
                            minHeight: 44, padding: '10px 24px',
                            borderRadius: 'var(--radius-pill)',
                            border: '1px solid rgba(245,240,232,0.28)',
                            background: 'transparent', color: TIER_POP_TEXT.primary,
                            fontFamily: BODY, fontSize: 12, fontWeight: 700,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            cursor: dismissing ? 'default' : 'pointer',
                        } : {
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                            minHeight: 48, padding: '14px 32px',
                            borderRadius: 'var(--radius-pill)', border: 0,
                            background: OG, color: '#fff',
                            fontFamily: BODY, fontSize: 13, fontWeight: 700,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            cursor: dismissing ? 'default' : 'pointer',
                            boxShadow: '0 8px 28px rgba(245,127,32,0.50)',
                            opacity: dismissing ? 0.85 : 1,
                        }}
                    >
                        {dismissing
                            ? (variant === 'reopened' ? 'Loading your plan' : 'Closing')
                            : cta.dismissLabel}
                    </button>
                </div>
```

- [ ] **Step 6: Pass `alreadyJoined` from the dashboard**

In `src/app/dashboard/ClientDashboard.tsx`, find the `<IntakePauseTakeover` mount and add `alreadyJoined={...}` using the same waitlist-joined value already threaded to the sidebar and gate. Run `grep -n "IntakePauseTakeover\|alreadyJoined\|waitlistCreditAed" src/app/dashboard/ClientDashboard.tsx` to locate the existing prop and reuse it rather than adding a second source of truth.

- [ ] **Step 7: Verify compile, lint and tests**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint && npx vitest run`
Expected: no type errors, no new lint findings, all tests pass.

- [ ] **Step 8: Verify visually at 375px**

Follow the headless recipe in the `reference_headless_browser_verification` memory: `playwright-core` from `/tmp/pw-runner/node_modules`, browser binary at `~/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`.

Confirm on a 375px viewport that both buttons are visible without scrolling, the dismiss reads as secondary, and the join button's confirmation message replaces it rather than sitting beside a stale offer.

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/_shared/pause-takeover-actions.ts \
        src/app/dashboard/_shared/pause-takeover-actions.test.ts \
        src/app/dashboard/_shared/IntakePauseTakeover.tsx \
        src/app/dashboard/ClientDashboard.tsx
git commit -m "feat(intake): let the pause takeover save a spot, not just dismiss

The loudest surface this feature has could only be acknowledged. It now
carries the same Save my spot action as the plan gate, with the dismiss kept
beside it and reworded to Not now: anything a customer can accept, they must
be able to decline.

Displayed amounts come from the action's own result, never the prospective
creditAed prop, so a failed mint can never promise money that does not exist."
```

---

### Task 3: Credit Wallet in the sidebar

The credit currently lives in the Now tray as "AED 20 waiting". The Now tray is for time-bound items; a credit balance has no deadline and deliberately outlives the pause, so it belongs in a persistent rail instead. Moving it also satisfies the spec's own requirement better: a wallet is always on screen, a tray row is behind a toggle.

**Files:**
- Create: `src/app/dashboard/_shared/credit-wallet.ts`
- Test: `src/app/dashboard/_shared/credit-wallet.test.ts`
- Create: `src/app/dashboard/CreditWallet.tsx`
- Modify: `src/app/dashboard/Sidebar.tsx` (mount the rail, drop the credit prop plumbing into the tray)
- Modify: `src/app/dashboard/SidebarDropdowns.tsx` (remove `WaitlistCreditRow` and its call site, around lines 550 and 595 to 622)
- Modify: `src/app/dashboard/page.tsx` (supply the wallet rows)

**Interfaces:**
- Consumes: `getRedeemableCredit(sb, userId)` from `src/infra/supabase/subscriptions-repo.ts`, called with **no** `planId` so nothing is filtered out. It returns `{ rows, balanceFils, lockedFils, lockedRequiresMonthly }`.
- Produces:
  - `walletSummary(rows): WalletSummary` from `credit-wallet.ts`
  - `<CreditWallet totalAed={number} monthlyOnlyAed={number} expanded={boolean} />`

- [ ] **Step 1: Write the failing test**

Create `src/app/dashboard/_shared/credit-wallet.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { walletSummary } from './credit-wallet'

const MONTHLY = ['monthly-max', 'monthly-premium']

describe('walletSummary', () => {
  it('reports nothing to show on an empty wallet', () => {
    expect(walletSummary([])).toEqual({ totalAed: 0, monthlyOnlyAed: 0, hasCredit: false, note: null })
  })

  it('sums unrestricted credit with no note', () => {
    expect(walletSummary([
      { amount_aed: 25, eligible_plan_ids: null },
      { amount_aed: 10, eligible_plan_ids: null },
    ])).toEqual({ totalAed: 35, monthlyOnlyAed: 0, hasCredit: true, note: null })
  })

  // A held credit that will not apply must always be explained on screen.
  it('explains a monthly-only credit', () => {
    expect(walletSummary([{ amount_aed: 20, eligible_plan_ids: MONTHLY }]))
      .toEqual({
        totalAed: 20, monthlyOnlyAed: 20, hasCredit: true,
        note: 'AED 20 of this unlocks on a monthly plan.',
      })
  })

  it('separates a mixed balance', () => {
    expect(walletSummary([
      { amount_aed: 15, eligible_plan_ids: null },
      { amount_aed: 20, eligible_plan_ids: MONTHLY },
    ])).toEqual({
      totalAed: 35, monthlyOnlyAed: 20, hasCredit: true,
      note: 'AED 20 of this unlocks on a monthly plan.',
    })
  })

  // PostgREST returns numeric columns as strings; concatenation instead of
  // addition here would silently show "1520" rather than 35.
  it('coerces string amounts before summing', () => {
    expect(walletSummary([
      { amount_aed: '15' as unknown as number, eligible_plan_ids: null },
      { amount_aed: '20' as unknown as number, eligible_plan_ids: null },
    ]).totalAed).toBe(35)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/dashboard/_shared/credit-wallet.test.ts`
Expected: FAIL with "Failed to resolve import ./credit-wallet".

- [ ] **Step 3: Write the helper**

Create `src/app/dashboard/_shared/credit-wallet.ts`:

```ts
import { MONTHLY_PLAN_IDS } from '@/contexts/subscriptions/domain/credit-eligibility'

/**
 * What the sidebar Credit Wallet shows.
 *
 * Pure so the money rules are testable without a DOM — this repo's vitest runs
 * in the node environment with no React Testing Library. Same reasoning as
 * intake-join-outcome.ts.
 *
 * `note` is not decoration. A credit the customer holds but cannot spend on
 * every plan has to say so wherever the balance appears, or the balance is a
 * promise the checkout will quietly break.
 */
export interface WalletSummary {
  totalAed: number
  /** Portion of the total restricted to monthly plans. */
  monthlyOnlyAed: number
  hasCredit: boolean
  note: string | null
}

export interface WalletRow {
  amount_aed: number
  eligible_plan_ids: string[] | null
}

export function walletSummary(rows: WalletRow[]): WalletSummary {
  let totalAed = 0
  let monthlyOnlyAed = 0

  for (const r of rows) {
    // PostgREST hands numerics back as strings; coerce or this concatenates.
    const amount = Number(r.amount_aed)
    totalAed += amount
    const ids = r.eligible_plan_ids
    if (ids != null && ids.some(p => (MONTHLY_PLAN_IDS as readonly string[]).includes(p))) {
      monthlyOnlyAed += amount
    }
  }

  return {
    totalAed,
    monthlyOnlyAed,
    hasCredit: totalAed > 0,
    note: monthlyOnlyAed > 0 ? `AED ${monthlyOnlyAed} of this unlocks on a monthly plan.` : null,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/dashboard/_shared/credit-wallet.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Build the rail component**

Create `src/app/dashboard/CreditWallet.tsx`. It mirrors the Dorm Wars rail already in `Sidebar.tsx` (lines 304 to 356): a small framed container with a tinted background, one row inside, a tooltip when the sidebar is collapsed.

```tsx
'use client'

import { Wallet } from 'lucide-react'
import { walletSummary, type WalletRow } from './_shared/credit-wallet'

const BODY = "'Montserrat', system-ui, sans-serif"
const OG3 = '#f57f20'

/**
 * Persistent credit balance in the sidebar.
 *
 * This used to be a Now-tray row. The tray is for time-bound items, and a
 * credit balance has no deadline and deliberately outlives the pause that
 * granted it, so it belongs on a rail that is always on screen rather than
 * behind a toggle. That also satisfies the spec's own rule better: if the
 * balance is not visible it is not doing its job.
 *
 * Renders nothing on a zero balance. An empty wallet is noise.
 */
export function CreditWallet({ rows, expanded }: { rows: WalletRow[]; expanded: boolean }) {
  const summary = walletSummary(rows)
  if (!summary.hasCredit) return null

  return (
    <div
      style={{
        marginBottom: 12,
        padding: 6,
        borderRadius: 'var(--radius-sm)',
        background: 'rgba(245,127,32,0.10)',
        border: '1px solid rgba(245,127,32,0.22)',
      }}
    >
      <div
        data-tooltip={summary.note ?? `AED ${summary.totalAed} in credit`}
        data-tooltip-placement="right"
        style={{
          display: 'flex', alignItems: 'center',
          gap: expanded ? 10 : 0,
          justifyContent: expanded ? 'flex-start' : 'center',
          padding: '9px 10px', borderRadius: 'var(--radius-sm)',
          fontFamily: BODY, color: OG3, whiteSpace: 'nowrap',
          transition: 'gap 220ms',
        }}
      >
        <Wallet size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
        {expanded && (
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 800, lineHeight: 1.2, fontFeatureSettings: '"tnum"' }}>
              AED {summary.totalAed}
            </span>
            {summary.note && (
              <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--ds-fg-muted)', marginTop: 2, lineHeight: 1.3, whiteSpace: 'normal' }}>
                {summary.note}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Mount it and remove the tray row**

In `src/app/dashboard/Sidebar.tsx`:
- Import `CreditWallet` and add `walletRows?: WalletRow[]` to `Props`, defaulting to `[]`.
- Render `<CreditWallet rows={walletRows} expanded={expanded} />` immediately **above** the Dorm Wars rail block that begins at line 304.
- Remove the `waitlistCreditAed` prop and stop forwarding it to `<NowTray>`.

In `src/app/dashboard/SidebarDropdowns.tsx`:
- Delete the `WaitlistCreditRow` component (lines 595 to 622) and its `{showWaitlistCredit && ...}` call site (around line 550), plus the now-unused `showWaitlistCredit` and `waitlistCreditAed` props on `NowTray`.
- Leave `IntakePausedRow` in place. It is graded Persistent in the spec and stays.

In `src/app/dashboard/page.tsx`:
- Call `getRedeemableCredit(supabase, user.id)` with no `planId` and pass `rows` through as `walletRows`. Note `RedeemableCreditRow` carries only `{ id, amount_aed }`, so also select `eligible_plan_ids` for the wallet, or read the credits rows directly here in the same shape `WalletRow` expects.

- [ ] **Step 7: Verify compile, lint and tests**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint && npx vitest run`
Expected: clean. If `npm run lint` reports `no-unused-vars` on a leftover `waitlistCreditAed`, remove the orphan rather than silencing it — Netlify fails the build on that rule.

- [ ] **Step 8: Verify visually at 375px and 1440px**

Use the same headless recipe as Task 2 Step 8. Confirm:
- the wallet renders above the Dorm Wars rail and matches its frame
- collapsed sidebar shows only the icon with a working tooltip
- the monthly-only note wraps rather than clipping
- a zero balance renders nothing at all

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/_shared/credit-wallet.ts \
        src/app/dashboard/_shared/credit-wallet.test.ts \
        src/app/dashboard/CreditWallet.tsx \
        src/app/dashboard/Sidebar.tsx \
        src/app/dashboard/SidebarDropdowns.tsx \
        src/app/dashboard/page.tsx
git commit -m "feat(dashboard): move the credit balance into a sidebar Credit Wallet

The balance lived in the Now tray, which is for time-bound items. A credit has
no deadline and deliberately outlives the pause that granted it, so it now sits
on a persistent rail above Dorm Wars, always on screen rather than behind a
toggle. The monthly-only restriction travels with the balance, so a credit that
will not apply is never shown without its reason.

IntakePausedRow stays in the tray: the spec grades an ongoing pause Persistent."
```

---

## Self-Review

**Spec coverage.** Task 1 corrects the credit-reuse rule to match the owner's stated intent, which the spec's "Credit reuse: single use" line described ambiguously; the per-cycle reading is now explicit in code and schema. Task 2 implements the spec's "Credit granted on opt-in, Present, celebratory" moment on the takeover surface, which previously had no join path. Task 3 relocates the spec's "Credit waiting, ongoing, Persistent" treatment from the tray to a rail, preserving its stated requirement that the balance be on screen.

**Placeholders.** None. Every code step carries the actual code. The two steps that say "run grep" are locating existing call sites whose exact line numbers will have shifted by then, and each states precisely what to change once found.

**Type consistency.** `WalletRow` is defined in `credit-wallet.ts` and consumed by `CreditWallet.tsx` and `Sidebar.tsx` under the same name. `JoinCycle`, `resolveJoinCycle`, `findCycleCredit` and the four-argument `mintWaitlistCredit` are consistent across Task 1. `pauseTakeoverCta` and `PauseTakeoverCta` match between the test, the helper and the takeover.

**Known gap, deliberately out of scope.** Task 3 Step 6 notes that `getRedeemableCredit` returns rows without `eligible_plan_ids`. Rather than widening that payment-critical return type, the wallet reads what it needs in `page.tsx`. Widening `RedeemableCreditRow` would touch the checkout and webhook lockstep and belongs in its own change.

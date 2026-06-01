# Comped Meal Accounting — Ops Guide

How Dormers tracks free meals (referee welcome gifts today, intern compensation
and any future comp programs later) for finance/books purposes.

## TL;DR

Every free meal lands a row in `public.comped_meal_ledger` the moment the
kitchen delivers it. The CFO/accountant queries `public.comped_expense_rollup`
at quarter-end for a one-line answer per category.

## The Tables

### `comped_meal_ledger` (append-only)

| Column             | Notes |
| ------------------ | ----- |
| `id`               | UUID PK |
| `subscription_id`  | FK to the subscription that drove the delivery |
| `customer_id`      | FK to the recipient |
| `plan_name`        | Snapshot of the subscription's plan name at delivery time |
| `cogs_aed`         | Snapshot of per-meal COGS (kitchen ingredient cost) at delivery time |
| `expense_category` | `referee_acquisition`, `intern_compensation`, etc. |
| `delivered_at`     | The kitchen delivery timestamp |
| `created_at`       | When this row was written (typically same as delivered_at) |

**Invariants — DO NOT VIOLATE:**

1. **Append-only.** No UPDATEs, no DELETEs. To reverse a meal, insert a SECOND
   row with negative `cogs_aed` and `expense_category` suffixed `_reversal`.
2. **`cogs_aed` is snapshotted** at delivery time. Historical rows stay correct
   even after kitchen costs change.
3. One row per actual delivery — written by `subscription_delivery_tick()`
   when `delivered_meals` is actually incremented (not when scheduled, not
   when re-scheduled).

### `comped_expense_rollup` (view)

Quarter-aggregated view of the ledger, computed in Asia/Dubai fiscal time
so quarter boundaries match the company's books.

| Column             | Notes |
| ------------------ | ----- |
| `fiscal_quarter`   | e.g. `2026-Q2` |
| `expense_category` | One row per category per quarter |
| `meals_given`      | Count |
| `expense_aed`      | Sum of `cogs_aed` |
| `first_delivery`   | Earliest delivery in the bucket |
| `last_delivery`    | Latest delivery in the bucket |

## The COGS Rate

The per-meal kitchen cost lives in the Supabase vault as `cogs_aed_per_meal`.
The delivery cron reads it at tick time and snapshots into each ledger row.

**To update the rate:**

```sql
SELECT vault.create_secret('15.50', 'cogs_aed_per_meal', '');
-- OR if updating an existing secret:
UPDATE vault.secrets SET secret = '15.50' WHERE name = 'cogs_aed_per_meal';
```

**Cadence:** review quarterly with the kitchen / supplier rates. The default
fallback (when vault is unset) is `12.00 AED`. The cron emits a `WARNING` when
the vault row is missing — check Supabase logs if you see it.

## The Quarter-End Query

```sql
-- All comped expense, this quarter
SELECT *
FROM public.comped_expense_rollup
WHERE fiscal_quarter = '2026-Q2';

-- Drill down by category
SELECT fiscal_quarter, expense_category, meals_given, expense_aed
FROM public.comped_expense_rollup
ORDER BY fiscal_quarter DESC, expense_category;

-- Row-level audit trail for a specific quarter (for the accountant)
SELECT delivered_at, customer_id, plan_name, expense_category, cogs_aed
FROM public.comped_meal_ledger
WHERE (delivered_at AT TIME ZONE 'Asia/Dubai') >= '2026-04-01'
  AND (delivered_at AT TIME ZONE 'Asia/Dubai') <  '2026-07-01'
ORDER BY delivered_at;
```

## P&L Categorisation

| `expense_category`      | P&L Line | Notes |
| ----------------------- | -------- | ----- |
| `referee_acquisition`   | Marketing → Customer Acquisition | Dorm Wars referee welcome meals |
| `intern_compensation`   | Staff Costs → Employee Benefits  | Reserved — intern program lives in admin dashboard work (deferred) |

## Adding a New Comped Category

Two-line change in `expense_category_for_plan(plan_name)` (see
`supabase/migrations/20260531_comped_meal_ledger.sql`):

```sql
WHEN p_plan_name = '<New Plan Name>' THEN '<new_category>'
```

…and a row in the table above documenting the P&L line. No other code change
needed — the cron picks it up on the next delivery.

## Reversing a Meal (Bad Delivery, Customer-Service Comp Refund, etc.)

```sql
INSERT INTO public.comped_meal_ledger (
  subscription_id, customer_id, plan_name,
  cogs_aed, expense_category, delivered_at
)
SELECT subscription_id, customer_id, plan_name,
       -1 * cogs_aed,
       expense_category || '_reversal',
       now()
FROM public.comped_meal_ledger
WHERE id = '<the-original-row-id>';
```

The rollup naturally subtracts (negative sum). Auditor sees the full history.

## Zoho Sync (Deferred)

Today the ledger is in-app only. A future cron will roll up the previous
month's totals and post a SINGLE expense entry to Zoho Books (one entry
per (month, category), NOT per meal). That's a Phase 7f task — out of scope
until the Zoho "Customer Acquisition — Referee Gifts" and
"Staff Benefits — Intern Meals" expense accounts exist on the Zoho side.

For now, the accountant works from `comped_expense_rollup` directly or
exports rows for the period via CSV.

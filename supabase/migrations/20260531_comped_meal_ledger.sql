-- ============================================================================
-- Comped meal ledger — append-only financial trail for free meals.
--
-- WHY THIS EXISTS
-- The `orders` table is the canonical record of revenue (Stripe-paid or
-- credit-redeemed). Free meals — referee welcome gifts today, intern
-- compensation later, customer-service comps after that — are an EXPENSE,
-- not revenue, and shoving them into `orders` with a sentinel
-- payment_method would force every revenue query to carry an exclusion
-- filter forever. Two different facts deserve two tables.
--
-- INVARIANTS
-- 1. Append-only. No UPDATE/DELETE grants. To "reverse" a meal, write a
--    SECOND row with negative cogs_aed and category '*_reversal'.
-- 2. Cost snapshotted at delivery time (cogs_aed). If kitchen ingredient
--    costs change next quarter, historical rows stay correct.
-- 3. One row per actual delivery — written when delivered_meals goes
--    0 → 1 on a gift sub, NOT at claim/scheduling time.
-- 4. Idempotent on (subscription_id, delivered_at_date) so the cron
--    rerunning a tick won't double-charge the expense.
--
-- COGS SOURCE
-- Vault secret `cogs_aed_per_meal` — a numeric string. CFO updates it
-- when ingredient costs shift. Default 12.00 if the vault row is missing
-- so the ledger always lands a row (never silently skips a delivery).
--
-- CFO QUARTERLY QUERY
--    SELECT fiscal_quarter,
--           COUNT(*) AS meals_given,
--           SUM(cogs_aed) AS expense_aed
--    FROM comped_meal_ledger
--    WHERE expense_category = 'referee_acquisition'
--      AND delivered_at >= $start AND delivered_at < $end
--    GROUP BY fiscal_quarter;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.comped_meal_ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES public.subscriptions(id),
  customer_id      uuid NOT NULL REFERENCES public.customers(id),
  plan_name        text NOT NULL,
  -- Cost of goods at delivery time. Snapshot, never recomputed.
  cogs_aed         numeric(8,2) NOT NULL CHECK (cogs_aed IS NOT NULL),
  -- expense_category gives accounting the P&L line. Today only one value
  -- ships ('referee_acquisition'); intern + future categories extend.
  expense_category text NOT NULL,
  -- delivered_at is the actual date the kitchen sent it out. The delivery
  -- cron runs at 20:00 Dubai, so this is effectively "today" at write time
  -- but lives as its own column for clarity + auditability.
  delivered_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Generated quarter label for fast indexed rollups.
  fiscal_quarter   text GENERATED ALWAYS AS (
    extract(year from delivered_at)::text || '-Q' ||
    extract(quarter from delivered_at)::text
  ) STORED
);

COMMENT ON TABLE public.comped_meal_ledger IS
  'Append-only ledger of free meals delivered. Source of truth for quarterly customer-acquisition / staff-benefits expense reporting. Never UPDATE or DELETE — reversals get a negative-cogs row.';

-- Idempotency: at most one entry per (subscription, delivery date) for a
-- given expense_category. The delivery cron's CTE-based insert relies on
-- ON CONFLICT DO NOTHING under this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_sub_date_category
  ON public.comped_meal_ledger (subscription_id, (delivered_at::date), expense_category);

-- Quarter-end roll-up index.
CREATE INDEX IF NOT EXISTS idx_ledger_quarter_category
  ON public.comped_meal_ledger (fiscal_quarter, expense_category);

-- Read-only by default; service_role writes, anon/authenticated denied.
ALTER TABLE public.comped_meal_ledger ENABLE ROW LEVEL SECURITY;

-- ── Helper: resolve current per-meal COGS from vault ────────────────────────
CREATE OR REPLACE FUNCTION public.current_cogs_aed_per_meal()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  raw_val text;
  parsed  numeric;
BEGIN
  SELECT decrypted_secret INTO raw_val
    FROM vault.decrypted_secrets WHERE name = 'cogs_aed_per_meal' LIMIT 1;
  IF raw_val IS NULL OR raw_val = '' THEN
    -- Conservative default until ops sets the vault row. The cron emits
    -- a warning so this gets noticed.
    RAISE WARNING 'current_cogs_aed_per_meal: vault cogs_aed_per_meal not set; defaulting to 12.00';
    RETURN 12.00;
  END IF;
  BEGIN
    parsed := raw_val::numeric;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'current_cogs_aed_per_meal: vault cogs_aed_per_meal="%" not parseable; defaulting to 12.00', raw_val;
    RETURN 12.00;
  END;
  RETURN parsed;
END;
$$;

-- ── Resolve a subscription's expense category by plan_name ──────────────────
-- Centralised so future plan kinds (intern, comp) can be mapped in one place.
CREATE OR REPLACE FUNCTION public.expense_category_for_plan(p_plan_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_plan_name = 'Welcome Meal'    THEN 'referee_acquisition'
    WHEN p_plan_name = 'Intern Program'  THEN 'intern_compensation'
    ELSE NULL
  END;
$$;

-- ── Rewire subscription_delivery_tick to also write the ledger ──────────────
-- The existing UPDATE drove `delivered_meals = LEAST(total_meals, +
-- meals_per_day)`. We keep that exact behaviour but wrap it in a CTE so we
-- capture the rows that actually got incremented today, then INSERT into
-- the ledger only for those whose plan_name maps to a comped category.
CREATE OR REPLACE FUNCTION public.subscription_delivery_tick()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cogs_today numeric;
BEGIN
  cogs_today := public.current_cogs_aed_per_meal();

  WITH delivered_today AS (
    UPDATE public.subscriptions s
       SET delivered_meals = LEAST(
             s.total_meals,
             COALESCE(s.delivered_meals, 0) + COALESCE(s.meals_per_day, 1)
           )
     WHERE s.status = 'Active'
       AND public.is_delivery_day(CURRENT_DATE, s.week_type)
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
   WHERE public.expense_category_for_plan(d.plan_name) IS NOT NULL
  ON CONFLICT (subscription_id, (delivered_at::date), expense_category) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.subscription_delivery_tick() IS
  'Daily 20:00 Dubai cron. Increments delivered_meals on every active sub on a delivery day, and writes a comped_meal_ledger row for any sub whose plan maps to an expense category (welcome meals, future intern program, etc).';

COMMIT;

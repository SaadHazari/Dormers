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

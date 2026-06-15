-- ============================================================================
-- Company closures — scheduled holidays and emergency kitchen shutdowns.
-- (Applied to the live DB via MCP on 2026-06-14; tracked here for the repo.)
--
-- 1. company_closures table (date + reason + who created it)
-- 2. is_company_closure(date) helper
-- 3. closure_days column on subscriptions (extends end_date like paused_days)
-- 4. Updated trigger to include closure_days in end_date recomputation
-- 5. Updated delivery_tick to skip closure days
-- 6. Updated pause_tick to skip closure days
-- 7. New closure_tick to extend active subs on closure days
-- ============================================================================

-- ── 1. company_closures table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_closures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  closure_date date NOT NULL UNIQUE,
  reason text NOT NULL,
  created_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.company_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.company_closures
  FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT ON public.company_closures TO authenticated;
GRANT ALL ON public.company_closures TO service_role;

-- ── 2. is_company_closure(date) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_company_closure(p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_closures WHERE closure_date = p_date
  );
$$;

-- ── 3. closure_days on subscriptions ──────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS closure_days smallint NOT NULL DEFAULT 0
  CHECK (closure_days >= 0);

-- ── 4. Updated trigger: include closure_days in end_date recomputation ────
CREATE OR REPLACE FUNCTION public._subscriptions_recompute_end_date()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_kind text;
BEGIN
  v_kind := CASE
    WHEN lower(NEW.plan_name) LIKE '%monthly%' THEN 'monthly'
    WHEN lower(NEW.plan_name) LIKE '%weekly%'  THEN 'weekly'
    WHEN lower(NEW.plan_name) LIKE '%trial%'   THEN 'trial'
    ELSE NULL
  END;
  IF v_kind IS NULL OR NEW.start_date IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.end_date := public.compute_subscription_end_date(
    NEW.start_date,
    v_kind,
    NEW.week_type,
    COALESCE(NEW.skipped_meals_count, 0) + COALESCE(NEW.bonus_meals, 0),
    COALESCE(NEW.paused_days, 0) + COALESCE(NEW.closure_days, 0)
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_subscriptions_recompute_end_date ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_recompute_end_date
  BEFORE INSERT OR UPDATE OF start_date, plan_name, week_type, skipped_meals_count, paused_days, bonus_meals, closure_days
  ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._subscriptions_recompute_end_date();

-- ── 5. Updated delivery_tick: bail on closure days ────────────────────────
CREATE OR REPLACE FUNCTION public.subscription_delivery_tick()
RETURNS void
LANGUAGE plpgsql
AS $$
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
             s.total_meals,
             COALESCE(s.delivered_meals, 0) + COALESCE(s.meals_per_day, 1)
           ),
           last_delivery_tick_date = CURRENT_DATE
     WHERE s.status = 'Active'
       AND COALESCE(s.delivered_meals, 0) < s.total_meals
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
$$;

-- ── 6. Updated pause_tick: bail on closure days ───────────────────────────
CREATE OR REPLACE FUNCTION public.subscription_pause_tick()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_company_closure(CURRENT_DATE) THEN
    RETURN;
  END IF;

  UPDATE public.subscriptions
  SET
    paused_days  = COALESCE(paused_days, 0) + 1,
    paused_dates = CASE
      WHEN CURRENT_DATE::text = ANY(COALESCE(paused_dates, '{}'::text[]))
        THEN paused_dates
      ELSE array_append(COALESCE(paused_dates, '{}'::text[]), CURRENT_DATE::text)
    END,
    last_pause_tick_date = CURRENT_DATE
  WHERE status = 'Paused'
    AND public.is_delivery_day(CURRENT_DATE, week_type)
    AND (last_pause_tick_date IS NULL OR last_pause_tick_date < CURRENT_DATE);
END;
$$;

-- ── 7. New closure_tick: extend all live subs on closure delivery days ────
CREATE OR REPLACE FUNCTION public.subscription_closure_tick()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_company_closure(CURRENT_DATE) THEN
    RETURN;
  END IF;

  UPDATE public.subscriptions
  SET closure_days = COALESCE(closure_days, 0) + 1
  WHERE status IN ('Active', 'Skipped', 'Scheduled', 'Paused')
    AND public.is_delivery_day(CURRENT_DATE, week_type)
    AND COALESCE(delivered_meals, 0) < total_meals;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('subscription_closure_tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'subscription_closure_tick',
  '15 20 * * *',
  'SELECT public.subscription_closure_tick();'
);

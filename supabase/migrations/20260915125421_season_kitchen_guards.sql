-- ============================================================================
-- Season wind-down, plan C: the kitchen stops after the season (spec
-- docs/superpowers/specs/2026-09-14-season-wind-down-design.md §9 G1, G4, G6).
--
-- Each body was copied from pg_get_functiondef on live (the Plan B bodies from
-- migration season_credited_skip_ticks for the two subscription ticks); only
-- the lines marked "Plan C" differ. "Cooks today" is the delivery tick's own
-- conditions, never status alone.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_kitchen_guards`. This file is the mirror.
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
  -- today. With none, there is nothing to be unconfirmed. Tonight's recorded
  -- delivery is counted back in, so the check reads the same after 20:00.
  SELECT season_phase, wrap_up_day, close_day INTO v_phase, v_wrap, v_close FROM public.intake_settings;  -- Plan C
  IF v_phase = 'break'  -- Plan C
     OR (v_phase = 'winding_down' AND v_wrap IS NOT NULL AND CURRENT_DATE > v_wrap  -- Plan C
         AND NOT EXISTS (  -- Plan C
           SELECT 1 FROM public.subscriptions s  -- Plan C
           WHERE s.status = 'Active'  -- Plan C
             AND s.season_hold_id IS NULL  -- Plan C
             AND COALESCE(s.delivered_meals, 0)  -- Plan C
                 - CASE WHEN s.last_delivery_tick_date = CURRENT_DATE THEN COALESCE(s.meals_per_day, 1) ELSE 0 END  -- Plan C
                 < s.total_meals - COALESCE(s.credited_skip_days, 0) * COALESCE(s.meals_per_day, 1)  -- Plan C
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

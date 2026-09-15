-- ============================================================================
-- Season wind-down, plan C: the SQL twin of the TypeScript projection
-- (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md §6.1,
-- §6.2). Lockstep with src/contexts/season/domain/season-projection.ts and
-- season-kitchen.ts through season-projection.fixtures.ts
-- (npm run season:lockstep-sql prints the check; run it on live).
--
-- The rule: walk the meals left, not the end date. The delivery tick cooks by
-- meals, so closures and skips still ahead push the last dinner out, and a
-- plan whose end date has passed with meals left still has dinners owed.
-- A planned pause on or before the close day makes the plan a customer pause
-- (the status tick pauses it before the break holds it).
--
-- Additive only. Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through
-- the Management API as migration `season_project_plans`. This file is the
-- mirror.
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

  IF p_wrap_up IS NULL THEN
    IF v_pause IS NOT NULL THEN
      RETURN public._season_projection_result(
        v_id, 'customer_paused',
        ARRAY(SELECT u.d FROM unnest(v_all) AS u(d) WHERE u.d < v_pause ORDER BY u.d), 0, 0, v_left);
    END IF;
    RETURN public._season_projection_result(v_id, 'finishes', v_all, 0, 0, v_left);
  END IF;

  v_close   := CASE WHEN p_close IS NOT NULL AND p_close > p_wrap_up THEN p_close ELSE p_wrap_up END;
  v_regular := ARRAY(SELECT u.d FROM unnest(v_all) AS u(d) WHERE u.d <= p_wrap_up ORDER BY u.d);
  v_after   := ARRAY(SELECT u.d FROM unnest(v_all) AS u(d) WHERE u.d > p_wrap_up ORDER BY u.d);
  -- A buffer day already behind the plan used a grant slot, cooked or not.
  v_slots   := GREATEST(0, v_grants - public._season_buffer_slots_used(p_wrap_up, v_from, v_week, v_skipped, v_closures));
  v_granted := ARRAY(SELECT u.d FROM unnest(v_after) AS u(d) WHERE u.d <= v_close ORDER BY u.d LIMIT v_slots);

  -- A planned pause on or before the close day: the status tick pauses the
  -- plan before the break, so the break holds it as a customer pause.
  IF v_pause IS NOT NULL AND v_pause <= v_close THEN
    RETURN public._season_projection_result(
      v_id, 'customer_paused',
      ARRAY(SELECT u.d FROM unnest(v_regular || v_granted) AS u(d) WHERE u.d < v_pause ORDER BY u.d),
      0, 0, v_left);
  END IF;

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

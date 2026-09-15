-- ============================================================================
-- Season wind-down, plan B: when the wrap-up day is scheduled or moved, skips
-- whose make-up meal now lands after it become wallet credit, and buffer grants
-- no longer needed (or beyond a reduced buffer) are released the same way
-- (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md §7.2, X6).
--
-- season_schedule_end and season_move_end were copied from pg_get_functiondef
-- on live; only the lines marked "Plan B" differ.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_reconcile_skips`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.season_reconcile_skips(p_wrap_up date, p_close date, p_buffer integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s            public.subscriptions;
  v_today      date := public.ae_today();
  v_close      date := GREATEST(p_close, p_wrap_up);
  v_end        date;
  v_after      integer;
  v_in_buffer  integer;
  v_grants     integer;
  v_candidates date[];
  v_n          integer;
  v_pick       date[];
  v_credit     integer;
  v_day        date;
  v_receipts   jsonb := '[]'::jsonb;
BEGIN
  FOR s IN
    SELECT * FROM public.subscriptions
    WHERE status IN ('Active', 'Skipped')
      AND (planned_pause_start IS NULL OR planned_pause_start > p_wrap_up)
      AND (skipped_meals_count > 0 OR season_buffer_grants > 0)
    ORDER BY id
    FOR UPDATE
  LOOP
    v_end := public.season_projected_end(s.end_date, s.week_type, v_today, s.skipped_dates);

    SELECT count(*), count(*) FILTER (WHERE g.d::date <= v_close)
      INTO v_after, v_in_buffer
    FROM generate_series(GREATEST(p_wrap_up + 1, v_today), v_end, interval '1 day') AS g(d)
    WHERE public.is_delivery_day(g.d::date, s.week_type)
      AND NOT public.is_company_closure(g.d::date)
      AND NOT (g.d::date = ANY(COALESCE(s.skipped_dates, '{}'::date[])));

    v_grants := LEAST(s.season_buffer_grants, GREATEST(p_buffer, 0), v_in_buffer);
    -- DISTINCT: a date listed twice in skipped_dates is still one skipped meal,
    -- and credited_skip_dates must stay exactly credited_skip_days long.
    v_candidates := ARRAY(
      SELECT DISTINCT t.x FROM unnest(COALESCE(s.skipped_dates, '{}'::date[])) AS t(x)
      WHERE NOT (t.x = ANY(s.credited_skip_dates))
      ORDER BY t.x DESC
    );
    v_n := LEAST(s.skipped_meals_count, GREATEST(v_after - v_grants, 0), cardinality(v_candidates));

    IF v_n = 0 AND v_grants = s.season_buffer_grants THEN CONTINUE; END IF;

    IF v_n > 0 THEN
      v_credit := public.season_skip_credit_fils(s.id);
      IF v_credit IS NULL THEN
        v_receipts := v_receipts || jsonb_build_object(
          'subscription_id', s.id, 'customer_id', s.customer_id,
          'meal_dates', '[]'::jsonb, 'credit_fils', NULL, 'skipped_no_value', v_n);
        v_n := 0;
        IF v_grants = s.season_buffer_grants THEN CONTINUE; END IF;
      END IF;
    END IF;

    v_pick := v_candidates[1:v_n];

    UPDATE public.subscriptions SET
      skipped_meals_count  = s.skipped_meals_count - v_n,
      credited_skip_days   = s.credited_skip_days + v_n,
      credited_skip_dates  = ARRAY(SELECT DISTINCT t.x FROM unnest(s.credited_skip_dates || v_pick) AS t(x) ORDER BY t.x),
      season_buffer_grants = v_grants
    WHERE id = s.id;

    IF v_n > 0 THEN
      IF v_credit > 0 THEN
        FOREACH v_day IN ARRAY v_pick LOOP
          INSERT INTO public.credits (customer_id, amount_aed, source, status, eligible_plan_ids, subscription_id, meal_date)
          VALUES (s.customer_id, v_credit / 100.0, 'season_skip',
                  CASE WHEN v_day > v_today THEN 'pending' ELSE 'approved' END, NULL, s.id, v_day)
          ON CONFLICT (subscription_id, meal_date) WHERE source = 'season_skip'
          DO UPDATE SET status = EXCLUDED.status, amount_aed = EXCLUDED.amount_aed, created_at = now()
            WHERE public.credits.status = 'rejected';
        END LOOP;
      END IF;
      v_receipts := v_receipts || jsonb_build_object(
        'subscription_id', s.id, 'customer_id', s.customer_id,
        'meal_dates', to_jsonb(v_pick), 'credit_fils', v_credit, 'skipped_no_value', 0);
    END IF;
  END LOOP;

  RETURN v_receipts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_reconcile_skips(date, date, integer) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.season_schedule_end(p_wrap_up date, p_buffer integer, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.intake_settings;
  v_reconciled jsonb;  -- Plan B
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

  v_reconciled := public.season_reconcile_skips(r.wrap_up_day, r.close_day, r.buffer_delivery_days);  -- Plan B
  RETURN public._season_state(r) || jsonb_build_object('reconciled', v_reconciled);  -- Plan B
END;
$function$;

CREATE OR REPLACE FUNCTION public.season_move_end(p_wrap_up date, p_buffer integer, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.intake_settings;
  v_reconciled jsonb;  -- Plan B
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

  v_reconciled := public.season_reconcile_skips(r.wrap_up_day, r.close_day, r.buffer_delivery_days);  -- Plan B
  RETURN public._season_state(r) || jsonb_build_object('reconciled', v_reconciled);  -- Plan B
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.season_schedule_end(date, integer, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_move_end(date, integer, text) FROM public, anon, authenticated;

COMMIT;

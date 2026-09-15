-- ============================================================================
-- Season wind-down, plan C: reopening, releasing a held plan, and skips
-- reconciled when the season ends today (spec
-- docs/superpowers/specs/2026-09-14-season-wind-down-design.md §5, §6.3, §7.5, §7.6).
--
-- season_end_today was copied from pg_get_functiondef on live; only the lines
-- marked "Plan C" differ. It now refuses once the wrap-up day has passed:
-- resetting W and K to today would reopen the kitchen for every plan with
-- meals left that night. Reopening notices are Plan F; refunds are Plan D.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_reopen_release`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.season_reopen(p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r              public.intake_settings;
  v_ready        integer := 0;
  v_ready_pauses integer := 0;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF r.season_phase <> 'break' THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: cannot reopen from %', r.season_phase;
  END IF;

  WITH moved AS (
    UPDATE public.season_holds
    SET state = 'ready', ready_at = now(), updated_at = now()
    WHERE state IN ('held', 'paused_by_customer')
    RETURNING reason
  )
  SELECT count(*) FILTER (WHERE reason = 'season'), count(*) FILTER (WHERE reason = 'customer_pause')
    INTO v_ready, v_ready_pauses
  FROM moved;

  UPDATE public.intake_settings SET
    season_phase = 'open',
    wrap_up_day = NULL,
    close_day = NULL,
    pause_scheduled_for = NULL,
    sales_stopped_at = NULL,
    paused = false,
    paused_at = NULL,
    cycle_ended_at = now(),
    updated_at = now()
  WHERE id = r.id
  RETURNING * INTO r;

  RETURN public._season_state(r) || jsonb_build_object('ready_holds', v_ready, 'ready_customer_pauses', v_ready_pauses);
END;
$$;

CREATE OR REPLACE FUNCTION public.season_release_hold(
  p_customer_id uuid, p_subscription_id uuid, p_start_date date, p_resume_cutoff boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today     date := public.ae_today();
  v_phase     text;
  s           public.subscriptions;
  h           public.season_holds;
  v_followers integer := 0;
BEGIN
  SELECT season_phase INTO v_phase FROM public.intake_settings;
  IF v_phase = 'break' THEN
    RAISE EXCEPTION 'SEASON_BREAK: plan % cannot restart during the semester break', p_subscription_id;
  END IF;

  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id AND customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_RELEASE_NOT_FOUND'; END IF;
  IF s.season_hold_id IS NULL THEN RAISE EXCEPTION 'SEASON_RELEASE_NOT_HELD: plan % has no hold', s.id; END IF;
  SELECT * INTO h FROM public.season_holds WHERE id = s.season_hold_id FOR UPDATE;
  IF NOT FOUND OR h.state <> 'ready' THEN
    RAISE EXCEPTION 'SEASON_RELEASE_NOT_READY: hold is %', COALESCE(h.state, 'missing');
  END IF;

  PERFORM set_config('dormers.season_release', 'on', true);

  IF s.status = 'Paused' THEN
    IF p_start_date IS NOT NULL THEN
      RAISE EXCEPTION 'SEASON_RELEASE_BAD_INPUT: a paused plan resumes, it takes no start date';
    END IF;
    UPDATE public.subscriptions SET
      status = 'Active',
      pause_date = NULL,
      season_hold_id = NULL,
      resume_cutoff_date = CASE WHEN p_resume_cutoff THEN v_today ELSE resume_cutoff_date END,
      paused_dates = CASE
        WHEN p_resume_cutoff AND NOT (v_today::text = ANY(COALESCE(paused_dates, '{}'::text[])))
          THEN array_append(COALESCE(paused_dates, '{}'::text[]), v_today::text)
        ELSE paused_dates END
    WHERE id = s.id;

    -- A queued renewal held behind this plan follows it (Plan C scope rule 1).
    WITH followers AS (
      UPDATE public.season_holds fh
      SET state = 'released', released_at = now(), updated_at = now()
      FROM public.subscriptions q
      WHERE q.customer_id = s.customer_id
        AND q.id <> s.id
        AND q.status = 'Scheduled'
        AND q.season_hold_id = fh.id
        AND fh.state = 'ready'
      RETURNING q.id AS subscription_id
    )
    UPDATE public.subscriptions sub SET season_hold_id = NULL
    FROM followers f
    WHERE sub.id = f.subscription_id;
    GET DIAGNOSTICS v_followers = ROW_COUNT;
  ELSIF s.status = 'Scheduled' THEN
    IF p_start_date IS NULL THEN
      RAISE EXCEPTION 'SEASON_RELEASE_BAD_INPUT: a held Scheduled plan needs a start date';
    END IF;
    -- start_date_changed_at stays as it was: this change does not use the allowance (spec §7.6).
    UPDATE public.subscriptions SET start_date = p_start_date, season_hold_id = NULL WHERE id = s.id;
  ELSE
    RAISE EXCEPTION 'SEASON_RELEASE_BAD_STATUS: %', s.status;
  END IF;

  UPDATE public.season_holds SET state = 'released', released_at = now(), updated_at = now() WHERE id = h.id;
  PERFORM set_config('dormers.season_release', '', true);

  RETURN jsonb_build_object(
    'subscription_id', s.id,
    'status', CASE WHEN s.status = 'Paused' THEN 'Active' ELSE 'Scheduled' END,
    'followers', v_followers
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.season_end_today(p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.intake_settings;
  v_today date := public.ae_today();
  v_reconciled jsonb;  -- Plan C
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF r.season_phase NOT IN ('open', 'winding_down') THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: cannot end the season from %', r.season_phase;
  END IF;
  -- Plan C: once the wrap-up day has passed, moving it to today would reopen
  -- the kitchen tonight for every plan with meals left. Clear and reschedule instead.
  IF r.season_phase = 'winding_down' AND r.wrap_up_day IS NOT NULL AND r.wrap_up_day < v_today THEN  -- Plan C
    RAISE EXCEPTION 'SEASON_BAD_PHASE: the wrap-up day % has passed', r.wrap_up_day;  -- Plan C
  END IF;  -- Plan C

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

  -- Plan C (spec §5): skips whose make-up meal now lands after today become credit.
  v_reconciled := public.season_reconcile_skips(r.wrap_up_day, r.close_day, r.buffer_delivery_days);  -- Plan C
  RETURN public._season_state(r) || jsonb_build_object('reconciled', v_reconciled);  -- Plan C
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.season_reopen(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_release_hold(uuid, uuid, date, boolean) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_end_today(text) FROM public, anon, authenticated;

COMMIT;

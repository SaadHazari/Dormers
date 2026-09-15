-- ============================================================================
-- Season transitions (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md §5).
--
-- One function per admin transition. Each locks the singleton intake_settings
-- row, checks its guard, and writes the season columns AND the legacy
-- compatibility columns (paused, paused_at, paused_by, pause_scheduled_for,
-- cycle_started_at, cycle_ended_at) so every existing reader keeps working.
-- Audit logging happens in the TypeScript caller (logAdminAction).
--
-- Also replaces intake_scheduled_pause_tick: under the season model, passing
-- the wrap-up day closes sales but keeps the phase, the wrap-up day and the
-- season epoch. The break itself arrives with plan C.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_transitions`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.season_close_day(p_wrap_up date, p_buffer integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_day  date := p_wrap_up;
  v_left integer := GREATEST(0, COALESCE(p_buffer, 0));
BEGIN
  WHILE v_left > 0 LOOP
    v_day := v_day + 1;
    IF EXTRACT(isodow FROM v_day)::int <> 7 THEN
      v_left := v_left - 1;
    END IF;
  END LOOP;
  RETURN v_day;
END;
$$;

CREATE OR REPLACE FUNCTION public._season_check_end_dates(p_wrap_up date, p_buffer integer, p_today date)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_wrap_up IS NULL OR p_wrap_up <= p_today THEN
    RAISE EXCEPTION 'SEASON_INVALID_DATE: wrap-up day % must be after %', p_wrap_up, p_today;
  END IF;
  IF p_wrap_up > p_today + 370 THEN
    RAISE EXCEPTION 'SEASON_INVALID_DATE: wrap-up day % is more than 370 days away', p_wrap_up;
  END IF;
  IF EXTRACT(isodow FROM p_wrap_up)::int = 7 THEN
    RAISE EXCEPTION 'SEASON_INVALID_DATE: wrap-up day % is a Sunday', p_wrap_up;
  END IF;
  IF p_buffer IS NULL OR p_buffer < 0 OR p_buffer > 3 THEN
    RAISE EXCEPTION 'SEASON_INVALID_DATE: buffer % must be 0 to 3', p_buffer;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._season_state(p_row public.intake_settings)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'phase', p_row.season_phase,
    'wrap_up_day', p_row.wrap_up_day,
    'close_day', p_row.close_day,
    'buffer', p_row.buffer_delivery_days,
    'sales_stopped', p_row.sales_stopped_at IS NOT NULL
  );
$$;

-- open, or the legacy wind-down with no wrap-up day  →  winding_down with W and K.
CREATE OR REPLACE FUNCTION public.season_schedule_end(p_wrap_up date, p_buffer integer, p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.intake_settings;
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

  RETURN public._season_state(r);
END;
$$;

-- winding_down with a wrap-up day still ahead  →  new W and K.
CREATE OR REPLACE FUNCTION public.season_move_end(p_wrap_up date, p_buffer integer, p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.intake_settings;
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

  RETURN public._season_state(r);
END;
$$;

-- winding_down with a wrap-up day  →  open (sales running) or the legacy
-- wind-down with no wrap-up day (sales already stopped).
CREATE OR REPLACE FUNCTION public.season_clear_end(p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.intake_settings;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF NOT (r.season_phase = 'winding_down' AND r.wrap_up_day IS NOT NULL) THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: nothing to clear in % (wrap-up day %)', r.season_phase, r.wrap_up_day;
  END IF;

  IF r.sales_stopped_at IS NOT NULL THEN
    UPDATE public.intake_settings SET
      wrap_up_day = NULL, close_day = NULL, pause_scheduled_for = NULL, updated_at = now()
    WHERE id = r.id
    RETURNING * INTO r;
  ELSE
    UPDATE public.intake_settings SET
      season_phase = 'open',
      wrap_up_day = NULL, close_day = NULL, pause_scheduled_for = NULL,
      cycle_ended_at = now(),
      updated_at = now()
    WHERE id = r.id
    RETURNING * INTO r;
  END IF;

  RETURN public._season_state(r);
END;
$$;

-- open, or winding_down with sales running and the wrap-up day still ahead
-- →  sales stopped now. From open this starts a season with no wrap-up day.
CREATE OR REPLACE FUNCTION public.season_stop_sales(p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.intake_settings;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF NOT (
    r.season_phase = 'open'
    OR (r.season_phase = 'winding_down' AND r.sales_stopped_at IS NULL AND COALESCE(r.wrap_up_day > public.ae_today(), false))
  ) THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: cannot stop sales from % (sales stopped %, wrap-up day %)', r.season_phase, r.sales_stopped_at, r.wrap_up_day;
  END IF;

  UPDATE public.intake_settings SET
    season_phase = 'winding_down',
    sales_stopped_at = now(),
    paused = true,
    paused_at = now(),
    paused_by = p_actor,
    cycle_started_at = CASE WHEN r.season_phase = 'open' THEN now() ELSE r.cycle_started_at END,
    updated_at = now()
  WHERE id = r.id
  RETURNING * INTO r;

  RETURN public._season_state(r);
END;
$$;

-- winding_down with sales stopped  →  sales running again. With no wrap-up
-- day that is a full reopen (phase open, cycle_ended_at stamped, exactly what
-- the old Resume button did). With a wrap-up day still ahead the taper resumes.
CREATE OR REPLACE FUNCTION public.season_resume_sales(p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.intake_settings;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF NOT (
    r.season_phase = 'winding_down' AND r.sales_stopped_at IS NOT NULL
    AND (r.wrap_up_day IS NULL OR r.wrap_up_day > public.ae_today())
  ) THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: cannot resume sales from % (sales stopped %, wrap-up day %)', r.season_phase, r.sales_stopped_at, r.wrap_up_day;
  END IF;

  IF r.wrap_up_day IS NULL THEN
    UPDATE public.intake_settings SET
      season_phase = 'open',
      sales_stopped_at = NULL,
      paused = false,
      paused_at = NULL,
      cycle_ended_at = now(),
      updated_at = now()
    WHERE id = r.id
    RETURNING * INTO r;
  ELSE
    UPDATE public.intake_settings SET
      sales_stopped_at = NULL,
      paused = false,
      paused_at = NULL,
      updated_at = now()
    WHERE id = r.id
    RETURNING * INTO r;
  END IF;

  RETURN public._season_state(r);
END;
$$;

-- open or winding_down  →  W = K = today, buffer 0, sales stopped. Tonight's
-- deliveries still run; plan C's break tick starts the break after tonight.
CREATE OR REPLACE FUNCTION public.season_end_today(p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.intake_settings;
  v_today date := public.ae_today();
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NO_SETTINGS'; END IF;
  IF r.season_phase NOT IN ('open', 'winding_down') THEN
    RAISE EXCEPTION 'SEASON_BAD_PHASE: cannot end the season from %', r.season_phase;
  END IF;

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

  RETURN public._season_state(r);
END;
$$;

-- Interim scheduled-pause tick (00:15 AE). Season model: once the wrap-up day
-- has passed, sales close; the phase, the wrap-up day and the season epoch are
-- kept. Legacy model (a pause_scheduled_for written while the phase is open,
-- which the new functions never do) keeps its original behaviour.
CREATE OR REPLACE FUNCTION public.intake_scheduled_pause_tick()
RETURNS TABLE(flipped boolean, cleared_only boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_ae date := (now() at time zone 'Asia/Dubai')::date;
  r public.intake_settings;
BEGIN
  flipped := false; cleared_only := false;

  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEXT; RETURN;
  END IF;

  IF r.season_phase = 'winding_down' AND r.wrap_up_day IS NOT NULL AND r.wrap_up_day < today_ae THEN
    IF NOT r.paused THEN
      UPDATE public.intake_settings SET
        paused = true,
        paused_at = now(),
        paused_by = 'schedule',
        sales_stopped_at = COALESCE(r.sales_stopped_at, now()),
        updated_at = now()
      WHERE id = r.id;
      flipped := true;
    END IF;
    RETURN NEXT; RETURN;
  END IF;

  IF r.season_phase = 'open' AND r.pause_scheduled_for IS NOT NULL AND r.pause_scheduled_for < today_ae THEN
    IF r.paused THEN
      UPDATE public.intake_settings SET pause_scheduled_for = NULL, updated_at = now() WHERE id = r.id;
      cleared_only := true;
    ELSE
      UPDATE public.intake_settings SET
        paused = true,
        paused_at = now(),
        paused_by = 'schedule',
        cycle_started_at = now(),
        pause_scheduled_for = NULL,
        updated_at = now()
      WHERE id = r.id AND paused = false;
      flipped := true;
    END IF;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_close_day(date, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._season_check_end_dates(date, integer, date) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._season_state(public.intake_settings) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_schedule_end(date, integer, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_move_end(date, integer, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_clear_end(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_stop_sales(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_resume_sales(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_end_today(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intake_scheduled_pause_tick() FROM public, anon, authenticated;

COMMIT;

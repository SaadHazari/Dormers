-- ============================================================================
-- Season wind-down: fixes from the fresh-eyes review of plans B and C.
--
-- A2. season_release_hold read the season phase without a lock, so a Resume
--     racing the break tick could set a plan Active as the break committed
--     (the delivery tick would still refuse to cook it, and the invariants
--     tick would alert an hour later). It now share-locks intake_settings
--     first, in the same order as season_skip and season_unskip. The body was
--     copied from the applied season_reopen_release migration; only the marked
--     line differs.
-- A3. planPause cancels the future skips that fall inside the pause window
--     through the user client, which left a buffer grant behind when the
--     cancelled skip was the one that used the buffer. season_trim_buffer_grants
--     keeps a grant only for a buffer day the meals walk would still fill
--     (season_unskip reads the projected end date for the same purpose; the
--     walk is used here because planPause leaves end_date where it was).
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_review_fixes`. This file is the mirror.
-- ============================================================================

BEGIN;

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
  -- Review fix A2: share-lock the season row so a Resume cannot slip past a
  -- break that is committing at the same moment (season_begin_break takes the
  -- row FOR UPDATE first; season_skip and season_unskip lock the same way).
  SELECT season_phase INTO v_phase FROM public.intake_settings FOR SHARE;  -- review fix
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

CREATE OR REPLACE FUNCTION public.season_trim_buffer_grants(p_subscription_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          public.intake_settings;
  s          public.subscriptions;
  v_today    date := public.ae_today();
  v_closures date[];
  v          jsonb;
  v_from     date;
  v_after    integer;
  v_used     integer;
  v_needed   integer;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR SHARE;
  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_TRIM_NOT_FOUND'; END IF;
  IF COALESCE(s.season_buffer_grants, 0) = 0 OR r.wrap_up_day IS NULL THEN
    RETURN COALESCE(s.season_buffer_grants, 0);
  END IF;

  -- A grant is worth keeping only for a buffer day the meals walk would still
  -- fill: project the plan as if it held every slot and count the days after
  -- the wrap-up day it cooks on, plus the buffer days already behind it
  -- (those used their slot, cooked or not, like _season_project_plan says).
  v_closures := ARRAY(
    SELECT c.closure_date FROM public.company_closures c
    WHERE c.closure_date >= LEAST(v_today, r.wrap_up_day) ORDER BY c.closure_date);
  v := public._season_project_plan(
    to_jsonb(s) || jsonb_build_object('season_buffer_grants', 1000),
    v_today, r.wrap_up_day, r.close_day, v_closures);
  SELECT count(*) INTO v_after
  FROM jsonb_array_elements_text(COALESCE(v->'cook_dates', '[]'::jsonb)) AS t(x)
  WHERE x::date > r.wrap_up_day;

  v_from := GREATEST(s.start_date, v_today);
  IF s.last_delivery_tick_date IS NOT NULL AND s.last_delivery_tick_date >= v_from THEN v_from := s.last_delivery_tick_date + 1; END IF;
  IF s.resume_cutoff_date IS NOT NULL AND s.resume_cutoff_date = v_from THEN v_from := v_from + 1; END IF;
  v_used := public._season_buffer_slots_used(r.wrap_up_day, v_from, s.week_type, s.skipped_dates, v_closures);

  v_needed := LEAST(s.season_buffer_grants, v_used + v_after);
  UPDATE public.subscriptions SET season_buffer_grants = v_needed WHERE id = s.id;
  RETURN v_needed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_release_hold(uuid, uuid, date, boolean) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_trim_buffer_grants(uuid) FROM public, anon, authenticated;

COMMIT;

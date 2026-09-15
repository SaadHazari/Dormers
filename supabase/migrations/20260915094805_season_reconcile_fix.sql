-- ============================================================================
-- Season wind-down, plan B, Task 8 fix: the reconcile keeps every plan's books
-- balanced (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md
-- §7.2, X6, D7).
--
-- Replaces season_reconcile_skips from `20260915082710_season_reconcile_skips.sql`
-- and season_unskip from `20260915080428_season_skip_guards.sql`.
--
-- Why. The first reconcile converted n skips to credit without looking at
-- where the skipped dates sat. Lowering skipped_meals_count by n pulls
-- end_date back n delivery days, so any skipped or credited date inside that
-- removed tail landed after the plan's new end: its credit could never be
-- released (the release tick needs the date inside the plan), the delivery
-- cap sat one meal below the days the kitchen would cook, and in one shape a
-- make-up meal was cooked after the close day.
--
-- The rule now, per plan (Active or Skipped, no planned pause on or before W):
--   1. N = dated skips that are not credited. S = skipped_meals_count.
--      U = max(0, S − |N|), skips with no date (legacy), which cannot be credited.
--   2. The plan kind is the end-date trigger's own rule (monthly / weekly /
--      trial by name). An unknown kind (Welcome Meal) is never recomputed by
--      the trigger, so the plan is left alone and reported.
--   3. Kept grants g = least(grants held, the buffer, buffer days the plan
--      would still cook). Grants never grow here: a make-up meal that lands on
--      a buffer day at scheduling becomes credit unless the plan already holds
--      a grant (owner, 2026-09-15).
--   4. The allowed end A = max(projected no-skip end, the g-th delivery day
--      after W). k = the smallest number of skips to convert so the projected
--      end with (S − k) skips is on or before A.
--   5. Every skipped or credited date after the new end is dropped; a dropped
--      credited date's pending credit is rejected (a settled one blocks the
--      schedule: SEASON_RECONCILE_SETTLED). The (k − dropped normal dates)
--      latest remaining normal dates become credited, future ones pending,
--      today's or past ones approved. The credited count never goes down.
--   6. Self-check before moving on: no skipped or credited date after the
--      projected end, credited count not lower, and for a plan with no pauses,
--      closures, bonus meals or untraced skips, the delivery days left in the
--      plan minus its skipped dates equal the meals it still owes. A breach
--      raises SEASON_RECONCILE_INCONSISTENT and blocks the schedule rather than
--      leak a meal or a credit.
--
-- season_unskip now reads intake_settings FOR SHARE before locking the plan,
-- the same order as season_skip, season_schedule_end and season_move_end, so
-- an undo racing a schedule cannot deadlock.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_reconcile_fix`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.season_reconcile_skips(p_wrap_up date, p_close date, p_buffer integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s              public.subscriptions;
  s2             public.subscriptions;
  v_today        date := public.ae_today();
  v_close        date := GREATEST(p_close, p_wrap_up);
  v_kind         text;
  v_mpd          integer;
  v_normal       date[];      -- N, ascending
  v_untraced     integer;     -- U
  v_max_k        integer;
  v_end_now      date;        -- projected end today
  v_no_skip_end  date;        -- projected end with every normal skip converted
  v_in_buffer    integer;
  v_grants       integer;     -- g
  v_grant_day    date;        -- the g-th delivery day after W
  v_allowed      date;        -- A
  v_k            integer;
  v_new_end      date;        -- E_k, what the trigger will store
  v_reached      boolean;
  v_i            integer;
  v_credit       integer;
  v_dropped      date[];      -- every skipped date after E_k
  v_dropped_n    integer;     -- how many of those were normal skips
  v_dropped_c    date[];      -- the credited ones
  v_newly        date[];      -- normal dates that become credited
  v_kept_skipped date[];
  v_new_credited date[];
  v_settled      integer;
  v_credit_id    uuid;
  v_day          date;
  v_after_end    integer;
  v_cookable     integer;
  v_simple       boolean;
  v_conservation boolean;
  v_receipts     jsonb := '[]'::jsonb;
BEGIN
  FOR s IN
    SELECT * FROM public.subscriptions
    WHERE status IN ('Active', 'Skipped')
      AND (planned_pause_start IS NULL OR planned_pause_start > p_wrap_up)
      AND (skipped_meals_count > 0 OR season_buffer_grants > 0)
    ORDER BY id
    FOR UPDATE
  LOOP
    -- 1. The plan kind, exactly as _subscriptions_recompute_end_date derives it.
    v_kind := CASE
      WHEN lower(s.plan_name) LIKE '%monthly%' THEN 'monthly'
      WHEN lower(s.plan_name) LIKE '%weekly%'  THEN 'weekly'
      WHEN lower(s.plan_name) LIKE '%trial%'   THEN 'trial'
      ELSE NULL
    END;
    IF v_kind IS NULL OR s.start_date IS NULL THEN
      v_receipts := v_receipts || jsonb_build_object(
        'subscription_id', s.id, 'customer_id', s.customer_id,
        'meal_dates', '[]'::jsonb, 'credit_fils', NULL, 'skipped_no_value', 0,
        'skipped_unknown_kind', true);
      CONTINUE;
    END IF;
    v_mpd := GREATEST(1, COALESCE(s.meals_per_day, 1));

    -- 2. Normal dated skips (DISTINCT: a date listed twice is one skipped meal).
    v_normal := ARRAY(
      SELECT DISTINCT t.x FROM unnest(COALESCE(s.skipped_dates, '{}'::date[])) AS t(x)
      WHERE NOT (t.x = ANY(s.credited_skip_dates))
      ORDER BY t.x
    );
    v_untraced := GREATEST(0, s.skipped_meals_count - cardinality(v_normal));
    v_max_k := LEAST(cardinality(v_normal), GREATEST(s.skipped_meals_count, 0));

    -- 3. Kept grants: only as many as the buffer allows and the plan would use.
    v_end_now := public.season_projected_end(s.end_date, s.week_type, v_today, s.skipped_dates);
    SELECT count(*) INTO v_in_buffer
    FROM generate_series(p_wrap_up + 1, LEAST(v_close, v_end_now), interval '1 day') AS g(d)
    WHERE public.is_delivery_day(g.d::date, s.week_type)
      AND NOT public.is_company_closure(g.d::date)
      AND NOT (g.d::date = ANY(COALESCE(s.skipped_dates, '{}'::date[])));
    v_grants := LEAST(s.season_buffer_grants, GREATEST(COALESCE(p_buffer, 0), 0), v_in_buffer);

    -- 4. The allowed end and the smallest k that reaches it.
    v_grant_day := p_wrap_up;
    v_i := 0;
    WHILE v_i < v_grants LOOP
      v_grant_day := v_grant_day + 1;
      IF public.is_delivery_day(v_grant_day, s.week_type) AND NOT public.is_company_closure(v_grant_day) THEN
        v_i := v_i + 1;
      END IF;
      EXIT WHEN v_grant_day > p_wrap_up + 30;
    END LOOP;
    v_no_skip_end := public.season_projected_end(
      public.compute_subscription_end_date(s.start_date, v_kind, s.week_type,
        (s.skipped_meals_count - v_max_k) + COALESCE(s.bonus_meals, 0),
        COALESCE(s.paused_days, 0) + COALESCE(s.closure_days, 0)),
      s.week_type, v_today, s.skipped_dates);
    v_allowed := GREATEST(v_no_skip_end, v_grant_day);

    v_k := NULL;
    v_reached := false;
    FOR v_i IN 0..v_max_k LOOP
      v_new_end := public.compute_subscription_end_date(s.start_date, v_kind, s.week_type,
        (s.skipped_meals_count - v_i) + COALESCE(s.bonus_meals, 0),
        COALESCE(s.paused_days, 0) + COALESCE(s.closure_days, 0));
      IF public.season_projected_end(v_new_end, s.week_type, v_today, s.skipped_dates) <= v_allowed THEN
        v_k := v_i;
        v_reached := true;
        EXIT;
      END IF;
    END LOOP;
    IF v_k IS NULL THEN
      -- Only untraced skips are left: convert every dated one and report the rest.
      v_k := v_max_k;
    END IF;

    IF v_k = 0 THEN
      IF v_grants <> s.season_buffer_grants THEN
        UPDATE public.subscriptions SET season_buffer_grants = v_grants WHERE id = s.id;
        v_receipts := v_receipts || jsonb_build_object(
          'subscription_id', s.id, 'customer_id', s.customer_id,
          'meal_dates', '[]'::jsonb, 'credit_fils', NULL, 'skipped_no_value', 0,
          'grants_before', s.season_buffer_grants, 'grants_after', v_grants);
      END IF;
      CONTINUE;
    END IF;

    -- 5. Value the skips. A plan worth nothing on paper is left alone and reported.
    v_credit := public.season_skip_credit_fils(s.id);
    IF v_credit IS NULL THEN
      v_receipts := v_receipts || jsonb_build_object(
        'subscription_id', s.id, 'customer_id', s.customer_id,
        'meal_dates', '[]'::jsonb, 'credit_fils', NULL, 'skipped_no_value', v_k);
      CONTINUE;
    END IF;

    -- 6. Dates stranded after the new end, and the normal dates that become credit.
    v_dropped := ARRAY(
      SELECT DISTINCT t.x FROM unnest(COALESCE(s.skipped_dates, '{}'::date[])) AS t(x)
      WHERE t.x > v_new_end ORDER BY t.x);
    v_dropped_c := ARRAY(
      SELECT t.x FROM unnest(v_dropped) AS t(x) WHERE t.x = ANY(s.credited_skip_dates) ORDER BY t.x);
    v_dropped_n := cardinality(v_dropped) - cardinality(v_dropped_c);
    IF v_k - v_dropped_n < 0 THEN
      RAISE EXCEPTION 'SEASON_RECONCILE_INCONSISTENT: % drops % normal skips for k=%', s.id, v_dropped_n, v_k;
    END IF;
    v_newly := ARRAY(
      SELECT t.x FROM unnest(v_normal) AS t(x) WHERE t.x <= v_new_end ORDER BY t.x DESC
      LIMIT (v_k - v_dropped_n));
    IF cardinality(v_newly) <> v_k - v_dropped_n THEN
      RAISE EXCEPTION 'SEASON_RECONCILE_INCONSISTENT: % has % normal dates inside % but needs %',
        s.id, cardinality(v_newly), v_new_end, v_k - v_dropped_n;
    END IF;
    v_newly := ARRAY(SELECT t.x FROM unnest(v_newly) AS t(x) ORDER BY t.x);

    v_kept_skipped := ARRAY(
      SELECT DISTINCT t.x FROM unnest(COALESCE(s.skipped_dates, '{}'::date[])) AS t(x)
      WHERE t.x <= v_new_end ORDER BY t.x);
    v_new_credited := ARRAY(
      SELECT DISTINCT t.x FROM unnest(
        ARRAY(SELECT c.x FROM unnest(s.credited_skip_dates) AS c(x) WHERE NOT (c.x = ANY(v_dropped_c))) || v_newly
      ) AS t(x) ORDER BY t.x);
    IF cardinality(v_new_credited) < s.credited_skip_days THEN
      RAISE EXCEPTION 'SEASON_RECONCILE_INCONSISTENT: % credited count would fall from % to %',
        s.id, s.credited_skip_days, cardinality(v_new_credited);
    END IF;

    -- A dropped credited date whose credit is already settled cannot be taken back (X6).
    IF cardinality(v_dropped_c) > 0 THEN
      SELECT count(*) INTO v_settled FROM public.credits
      WHERE subscription_id = s.id AND source = 'season_skip'
        AND meal_date = ANY(v_dropped_c) AND status <> 'pending';
      IF v_settled > 0 THEN
        RAISE EXCEPTION 'SEASON_RECONCILE_SETTLED: % has % settled credits after %', s.id, v_settled, v_new_end;
      END IF;
      UPDATE public.credits SET status = 'rejected'
      WHERE subscription_id = s.id AND source = 'season_skip'
        AND meal_date = ANY(v_dropped_c) AND status = 'pending';
    END IF;

    -- 7. Write the plan. The end-date trigger recomputes end_date from the new count.
    UPDATE public.subscriptions SET
      skipped_meals_count  = s.skipped_meals_count - v_k,
      skipped_dates        = v_kept_skipped,
      credited_skip_days   = cardinality(v_new_credited),
      credited_skip_dates  = v_new_credited,
      season_buffer_grants = v_grants
    WHERE id = s.id
    RETURNING * INTO s2;
    IF s2.end_date IS DISTINCT FROM v_new_end THEN
      RAISE EXCEPTION 'SEASON_RECONCILE_INCONSISTENT: % stored end % differs from %', s.id, s2.end_date, v_new_end;
    END IF;

    -- 8. Mint the credit for each newly credited date (plans worth 0 mint nothing).
    IF v_credit > 0 THEN
      FOREACH v_day IN ARRAY v_newly LOOP
        v_credit_id := NULL;
        INSERT INTO public.credits (customer_id, amount_aed, source, status, eligible_plan_ids, subscription_id, meal_date)
        VALUES (s.customer_id, v_credit / 100.0, 'season_skip',
                CASE WHEN v_day > v_today THEN 'pending' ELSE 'approved' END, NULL, s.id, v_day)
        ON CONFLICT (subscription_id, meal_date) WHERE source = 'season_skip'
        DO UPDATE SET status = EXCLUDED.status, amount_aed = EXCLUDED.amount_aed, created_at = now(),
          applied_at = NULL, applied_to = NULL, reserved_token = NULL, reserved_until = NULL
          WHERE public.credits.status = 'rejected'
        RETURNING id INTO v_credit_id;
        IF v_credit_id IS NULL THEN
          RAISE EXCEPTION 'SEASON_RECONCILE_INCONSISTENT: % already holds a live credit for %', s.id, v_day;
        END IF;
      END LOOP;
    END IF;

    -- 9. Self-check on the row as written.
    SELECT count(*) INTO v_after_end
    FROM unnest(s2.skipped_dates || s2.credited_skip_dates) AS t(x)
    WHERE t.x > public.season_projected_end(s2.end_date, s2.week_type, v_today, s2.skipped_dates);
    IF v_after_end > 0 THEN
      RAISE EXCEPTION 'SEASON_RECONCILE_INCONSISTENT: % keeps % dates after its end %', s.id, v_after_end, s2.end_date;
    END IF;
    SELECT count(*) INTO v_cookable
    FROM generate_series(s2.start_date, s2.end_date, interval '1 day') AS g(d)
    WHERE public.is_delivery_day(g.d::date, s2.week_type)
      AND NOT (g.d::date = ANY(COALESCE(s2.skipped_dates, '{}'::date[])));
    v_conservation := (v_cookable * v_mpd = s2.total_meals - s2.credited_skip_days * v_mpd);
    v_simple := COALESCE(s2.paused_days, 0) = 0 AND cardinality(COALESCE(s2.paused_dates, '{}'::text[])) = 0
      AND COALESCE(s2.closure_days, 0) = 0 AND COALESCE(s2.bonus_meals, 0) = 0 AND v_untraced = 0;
    IF v_simple AND NOT v_conservation THEN
      RAISE EXCEPTION 'SEASON_RECONCILE_INCONSISTENT: % cooks % days for % meals owed (% a day)',
        s.id, v_cookable, s2.total_meals - s2.credited_skip_days * v_mpd, v_mpd;
    END IF;

    v_receipts := v_receipts || jsonb_build_object(
      'subscription_id', s.id, 'customer_id', s.customer_id,
      'meal_dates', to_jsonb(v_newly), 'credit_fils', v_credit, 'skipped_no_value', 0,
      'dropped_dates', to_jsonb(v_dropped),
      'credited_before', s.credited_skip_days, 'credited_after', s2.credited_skip_days,
      'grants_before', s.season_buffer_grants, 'grants_after', v_grants,
      'end_date', s2.end_date,
      'skipped_untraced', (NOT v_reached OR v_untraced > 0),
      'conservation', CASE WHEN v_simple THEN 'checked' WHEN v_conservation THEN 'holds' ELSE 'reported' END,
      'cookable_days', v_cookable);
  END LOOP;

  RETURN v_receipts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_reconcile_skips(date, date, integer) FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- season_unskip: the live body from `20260915080428_season_skip_guards.sql`, with the
-- intake_settings FOR SHARE read moved ahead of the plan lock.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.season_unskip(p_customer_id uuid, p_subscription_id uuid, p_meal_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s            public.subscriptions;
  r            public.intake_settings;
  c            public.credits;
  v_has_credit boolean;
  v_today      date := public.ae_today();
  v_dates      date[];
  v_new_end    date;
  v_needed     integer;
BEGIN
  -- Lock order: the season row first, then the plan, the same as season_skip,
  -- season_schedule_end and season_move_end, so an undo never deadlocks a schedule.
  SELECT * INTO r FROM public.intake_settings FOR SHARE;

  SELECT * INTO s FROM public.subscriptions
  WHERE id = p_subscription_id AND customer_id = p_customer_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_SKIP_NOT_FOUND'; END IF;
  IF s.status NOT IN ('Active', 'Skipped') THEN RAISE EXCEPTION 'SEASON_SKIP_BAD_STATUS: %', s.status; END IF;
  IF p_meal_date <= v_today THEN RAISE EXCEPTION 'SEASON_UNSKIP_TOO_LATE'; END IF;
  IF NOT (p_meal_date = ANY(COALESCE(s.skipped_dates, '{}'::date[]))) THEN RAISE EXCEPTION 'SEASON_UNSKIP_NOT_SKIPPED'; END IF;
  v_dates := array_remove(s.skipped_dates, p_meal_date);

  IF p_meal_date = ANY(s.credited_skip_dates) THEN
    SELECT * INTO c FROM public.credits
    WHERE subscription_id = s.id AND meal_date = p_meal_date AND source = 'season_skip'
    FOR UPDATE;
    v_has_credit := FOUND;
    IF v_has_credit AND c.status <> 'pending' THEN
      RAISE EXCEPTION 'SEASON_UNSKIP_SETTLED: credit is %', c.status;
    END IF;
    UPDATE public.subscriptions SET
      skipped_dates       = v_dates,
      credited_skip_days  = s.credited_skip_days - 1,
      credited_skip_dates = array_remove(s.credited_skip_dates, p_meal_date)
    WHERE id = s.id;
    IF v_has_credit THEN
      UPDATE public.credits SET status = 'rejected' WHERE id = c.id;
    END IF;
    RETURN jsonb_build_object('kind', 'credited');
  END IF;

  UPDATE public.subscriptions SET
    skipped_dates       = v_dates,
    skipped_meals_count = GREATEST(0, s.skipped_meals_count - 1)
  WHERE id = s.id
  RETURNING end_date INTO v_new_end;

  IF EXISTS (
    SELECT 1 FROM unnest(s.credited_skip_dates) AS t(d)
    WHERE t.d > public.season_projected_end(v_new_end, s.week_type, v_today, v_dates)
  ) THEN
    RAISE EXCEPTION 'SEASON_UNSKIP_CREDITED_AFTER: %', (
      SELECT min(t.d) FROM unnest(s.credited_skip_dates) AS t(d)
      WHERE t.d > public.season_projected_end(v_new_end, s.week_type, v_today, v_dates)
    );
  END IF;

  -- A grant only stays while a make-up meal still lands on a buffer day.
  IF s.season_buffer_grants > 0 AND r.wrap_up_day IS NOT NULL THEN
    SELECT count(*) INTO v_needed
    FROM generate_series(
      r.wrap_up_day + 1,
      LEAST(public.season_projected_end(v_new_end, s.week_type, v_today, v_dates), GREATEST(r.close_day, r.wrap_up_day)),
      interval '1 day'
    ) AS g(d)
    WHERE public.is_delivery_day(g.d::date, s.week_type)
      AND NOT public.is_company_closure(g.d::date)
      AND NOT (g.d::date = ANY(v_dates));
    UPDATE public.subscriptions SET season_buffer_grants = LEAST(s.season_buffer_grants, v_needed) WHERE id = s.id;
  END IF;

  RETURN jsonb_build_object('kind', 'normal', 'end_date', v_new_end);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_unskip(uuid, uuid, date) FROM public, anon, authenticated;

COMMIT;

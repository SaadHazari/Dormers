-- ============================================================================
-- Season wind-down, plan B, fix round 1: close a credited-skip undo gap and
-- match the SQL and TypeScript fallback credit figure
-- (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md §7.2, §10.1, D7).
--
-- Replaces four functions from `20260915043834_season_skip_functions.sql` and
-- `20260915044446_season_skip_credit_tick.sql`:
--
-- season_skip_credit_fils: a Stripe test-mode order (`cs_test_%`) is never
-- trusted for the exact (card + wallet) path, even when amount_paid_fils and
-- credit_applied_fils are both recorded — test payments are not money
-- (owner decision D7). Falls back to 90% of list price, same as before.
--
-- season_skip: (a) a NULL skip cap now refuses instead of comparing against
-- NULL, which SQL's `>=` would silently treat as "not exceeded" and let
-- through; (b) a meal date that is not a real delivery day, lands on a
-- company closure, or falls after the plan's current end date is refused
-- with SEASON_SKIP_BAD_DATE; (c) resurrecting a rejected season_skip credit
-- also clears its spend/reservation columns (applied_at, applied_to,
-- reserved_token, reserved_until), so a credit that was once spent and later
-- undone-then-reskipped does not come back still marked spent.
--
-- season_unskip: undoing a grant skip can shrink the plan's end date and,
-- with it, its projected end. If a credited-skip date the plan already owes
-- money for now falls after that shrunk projected end, the kitchen will cook
-- every day up to the (now earlier) end and never deliver the credited day,
-- while the pending credit still pays out. This left the customer able to
-- collect a full plan AND a skip credit for a day inside it. The undo now
-- refuses with SEASON_UNSKIP_CREDITED_AFTER instead of cascading, rolling
-- back its own subscriptions UPDATE. The read of intake_settings this branch
-- depends on for the buffer-grant recompute is now FOR SHARE, so it cannot
-- race a concurrent change to wrap_up_day/close_day.
--
-- season_skip_credit_tick: added a matching guard on the release side. A
-- credit whose meal_date now falls after the plan's projected end (for
-- example because an admin removed a closure and the plan shrank) is held,
-- not released, however it got into that state.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_skip_guards`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.season_skip_credit_fils(p_subscription_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  o record;
  v_per_meal integer;
BEGIN
  SELECT plan_name, meals_per_day INTO s FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF s.plan_name ILIKE '%staff monthly%' OR s.plan_name ILIKE '%welcome meal%' THEN RETURN 0; END IF;

  SELECT amount_paid_fils, credit_applied_fils, meals_count, price_per_meal, stripe_session_id INTO o
  FROM public.orders WHERE subscription_id = p_subscription_id
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF COALESCE(o.meals_count, 0) <= 0 THEN RETURN NULL; END IF;

  IF o.amount_paid_fils IS NOT NULL AND o.credit_applied_fils IS NOT NULL AND COALESCE(o.stripe_session_id, '') NOT LIKE 'cs\_test\_%' THEN
    v_per_meal := floor((o.amount_paid_fils + o.credit_applied_fils)::numeric / o.meals_count);
  ELSIF o.price_per_meal IS NOT NULL AND o.price_per_meal > 0 THEN
    v_per_meal := floor(round(o.price_per_meal * 100) * 90 / 100.0);
  ELSE
    RETURN NULL;
  END IF;
  RETURN v_per_meal * GREATEST(1, COALESCE(s.meals_per_day, 1));
END;
$$;

CREATE OR REPLACE FUNCTION public.season_skip(
  p_customer_id uuid,
  p_subscription_id uuid,
  p_meal_date date,
  p_same_day boolean,
  p_outcome text,
  p_wrap_up date,
  p_close date,
  p_skip_cap integer,
  p_expected_credit_fils integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r           public.intake_settings;
  s           public.subscriptions;
  v_today     date := public.ae_today();
  v_close     date;
  v_make_up   date;
  v_outcome   text;
  v_credit    integer;
  v_status    text;
  v_credit_id uuid;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('grant', 'credited') THEN
    RAISE EXCEPTION 'SEASON_SKIP_BAD_OUTCOME: %', p_outcome;
  END IF;

  SELECT * INTO r FROM public.intake_settings FOR SHARE;
  IF NOT FOUND OR r.season_phase <> 'winding_down' OR r.wrap_up_day IS NULL
     OR r.wrap_up_day IS DISTINCT FROM p_wrap_up OR r.close_day IS DISTINCT FROM p_close THEN
    RAISE EXCEPTION 'SEASON_SKIP_CHANGED: the season moved';
  END IF;

  SELECT * INTO s FROM public.subscriptions
  WHERE id = p_subscription_id AND customer_id = p_customer_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_SKIP_NOT_FOUND'; END IF;

  IF p_same_day THEN
    IF p_meal_date <> v_today OR s.status <> 'Active' THEN
      RAISE EXCEPTION 'SEASON_SKIP_BAD_STATUS: % on %', s.status, p_meal_date;
    END IF;
  ELSIF p_meal_date <= v_today OR s.status NOT IN ('Active', 'Skipped') THEN
    RAISE EXCEPTION 'SEASON_SKIP_BAD_STATUS: % on %', s.status, p_meal_date;
  END IF;
  IF p_meal_date = ANY(COALESCE(s.skipped_dates, '{}'::date[])) THEN
    RAISE EXCEPTION 'SEASON_SKIP_ALREADY';
  END IF;
  IF NOT public.is_delivery_day(p_meal_date, s.week_type) OR public.is_company_closure(p_meal_date) OR p_meal_date > s.end_date THEN
    RAISE EXCEPTION 'SEASON_SKIP_BAD_DATE: %', p_meal_date;
  END IF;
  IF p_skip_cap IS NULL OR s.skipped_meals_count + s.credited_skip_days >= p_skip_cap THEN
    RAISE EXCEPTION 'SEASON_SKIP_NO_SKIPS_LEFT';
  END IF;

  v_close := GREATEST(r.close_day, r.wrap_up_day);
  v_make_up := public.season_make_up_day(s.end_date, s.week_type, v_today, s.skipped_dates);
  v_outcome := CASE
    WHEN v_make_up <= r.wrap_up_day THEN 'normal'
    WHEN v_make_up <= v_close AND s.season_buffer_grants < r.buffer_delivery_days THEN 'grant'
    ELSE 'credited'
  END;
  IF v_outcome <> p_outcome THEN
    RAISE EXCEPTION 'SEASON_SKIP_CHANGED: expected %, found %', p_outcome, v_outcome;
  END IF;

  IF v_outcome = 'grant' THEN
    UPDATE public.subscriptions SET
      skipped_meals_count  = s.skipped_meals_count + 1,
      skipped_dates        = ARRAY(SELECT DISTINCT t.d FROM unnest(COALESCE(s.skipped_dates, '{}'::date[]) || p_meal_date) AS t(d) ORDER BY t.d),
      season_buffer_grants = s.season_buffer_grants + 1,
      status               = CASE WHEN p_same_day THEN 'Skipped' ELSE s.status END,
      last_skipped_date    = CASE WHEN p_same_day THEN now() ELSE s.last_skipped_date END
    WHERE id = s.id;
    RETURN jsonb_build_object('outcome', 'grant', 'make_up_day', v_make_up);
  END IF;

  v_credit := public.season_skip_credit_fils(s.id);
  IF v_credit IS NULL THEN RAISE EXCEPTION 'SEASON_SKIP_NO_VALUE'; END IF;
  IF v_credit IS DISTINCT FROM p_expected_credit_fils THEN
    RAISE EXCEPTION 'SEASON_SKIP_CHANGED: credit % expected %', v_credit, p_expected_credit_fils;
  END IF;

  UPDATE public.subscriptions SET
    skipped_dates       = ARRAY(SELECT DISTINCT t.d FROM unnest(COALESCE(s.skipped_dates, '{}'::date[]) || p_meal_date) AS t(d) ORDER BY t.d),
    credited_skip_days  = s.credited_skip_days + 1,
    credited_skip_dates = ARRAY(SELECT DISTINCT t.d FROM unnest(s.credited_skip_dates || p_meal_date) AS t(d) ORDER BY t.d),
    status              = CASE WHEN p_same_day THEN 'Skipped' ELSE s.status END,
    last_skipped_date   = CASE WHEN p_same_day THEN now() ELSE s.last_skipped_date END
  WHERE id = s.id;

  -- Same-day skips cannot be undone, so their credit is usable at once.
  v_status := CASE WHEN p_same_day THEN 'approved' ELSE 'pending' END;
  IF v_credit > 0 THEN
    INSERT INTO public.credits (customer_id, amount_aed, source, status, eligible_plan_ids, subscription_id, meal_date)
    VALUES (s.customer_id, v_credit / 100.0, 'season_skip', v_status, NULL, s.id, p_meal_date)
    ON CONFLICT (subscription_id, meal_date) WHERE source = 'season_skip'
    DO UPDATE SET status = EXCLUDED.status, amount_aed = EXCLUDED.amount_aed, created_at = now(),
      applied_at = NULL, applied_to = NULL, reserved_token = NULL, reserved_until = NULL
      WHERE public.credits.status = 'rejected'
    RETURNING id INTO v_credit_id;
    IF v_credit_id IS NULL THEN RAISE EXCEPTION 'SEASON_SKIP_ALREADY: credit exists'; END IF;
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'credited',
    'make_up_day', v_make_up,
    'credit_fils', v_credit,
    'credit_status', CASE WHEN v_credit > 0 THEN v_status ELSE 'none' END,
    'credit_id', v_credit_id
  );
END;
$$;

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
  SELECT * INTO r FROM public.intake_settings FOR SHARE;
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

CREATE OR REPLACE FUNCTION public.season_skip_credit_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.credits c
  SET status = 'approved'
  FROM public.subscriptions s
  WHERE c.source = 'season_skip'
    AND c.status = 'pending'
    AND c.meal_date < public.ae_today()
    AND s.id = c.subscription_id
    AND c.meal_date = ANY(s.credited_skip_dates)
    AND c.meal_date <= public.season_projected_end(s.end_date, s.week_type, public.ae_today(), s.skipped_dates);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_skip_credit_fils(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_skip(uuid, uuid, date, boolean, text, date, date, integer, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_unskip(uuid, uuid, date) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_skip_credit_tick() FROM public, anon, authenticated;

COMMIT;

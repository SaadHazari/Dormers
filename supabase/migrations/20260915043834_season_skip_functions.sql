-- ============================================================================
-- Season wind-down, plan B: credited skips and buffer grants
-- (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md §7.2, §10.1).
--
-- The customer server actions decide the outcome in TypeScript
-- (src/contexts/season/domain/skip-outcome.ts) to word the sheet, then call
-- season_skip with the service role. season_skip recomputes the outcome and the
-- credit amount under a row lock and refuses when either differs, so a moved
-- wrap-up day or a stale tab can never mint credit the customer was not shown.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_skip_functions`. This file is the mirror.
-- ============================================================================

BEGIN;

-- The end date the plan will really have: subscription_closure_tick pushes it
-- one delivery day per closure from today to the end, except on a skipped day.
CREATE OR REPLACE FUNCTION public.season_projected_end(p_end date, p_week_type text, p_today date, p_skipped date[])
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owed integer;
  v_day  date := p_end;
  v_i    integer := 0;
BEGIN
  SELECT count(DISTINCT c.closure_date) INTO v_owed
  FROM public.company_closures c
  WHERE c.closure_date >= p_today
    AND c.closure_date <= p_end
    AND public.is_delivery_day(c.closure_date, p_week_type)
    AND NOT (c.closure_date = ANY(COALESCE(p_skipped, '{}'::date[])));
  WHILE v_owed > 0 AND v_i < 60 LOOP
    v_i := v_i + 1;
    v_day := v_day + 1;
    IF public.is_delivery_day(v_day, p_week_type) AND NOT public.is_company_closure(v_day) THEN
      v_owed := v_owed - 1;
    END IF;
  END LOOP;
  RETURN v_day;
END;
$$;

-- The delivery day one more skip would add.
CREATE OR REPLACE FUNCTION public.season_make_up_day(p_end date, p_week_type text, p_today date, p_skipped date[])
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := public.season_projected_end(p_end, p_week_type, p_today, p_skipped);
  v_i   integer := 0;
BEGIN
  LOOP
    v_day := v_day + 1;
    v_i := v_i + 1;
    EXIT WHEN (public.is_delivery_day(v_day, p_week_type) AND NOT public.is_company_closure(v_day)) OR v_i >= 60;
  END LOOP;
  RETURN v_day;
END;
$$;

-- Wallet credit for one skipped delivery day, in fils: what the customer paid
-- for that meal, (card charge + wallet credit used) ÷ meals in the order, × the
-- day's meals (spec D7). An order with no recorded money (Stripe test mode
-- during the pilot, or unresolvable) falls back to 90% of its list price.
-- 0 for plans not paid in cash (X5). NULL = nothing to go on.
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

  SELECT amount_paid_fils, credit_applied_fils, meals_count, price_per_meal INTO o
  FROM public.orders WHERE subscription_id = p_subscription_id
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF COALESCE(o.meals_count, 0) <= 0 THEN RETURN NULL; END IF;

  IF o.amount_paid_fils IS NOT NULL AND o.credit_applied_fils IS NOT NULL THEN
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
  IF s.skipped_meals_count + s.credited_skip_days >= p_skip_cap THEN
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
    DO UPDATE SET status = EXCLUDED.status, amount_aed = EXCLUDED.amount_aed, created_at = now()
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

  -- A grant only stays while a make-up meal still lands on a buffer day.
  SELECT * INTO r FROM public.intake_settings;
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

REVOKE EXECUTE ON FUNCTION public.season_projected_end(date, text, date, date[]) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_make_up_day(date, text, date, date[]) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_skip_credit_fils(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_skip(uuid, uuid, date, boolean, text, date, date, integer, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_unskip(uuid, uuid, date) FROM public, anon, authenticated;

COMMIT;

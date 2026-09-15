-- ============================================================================
-- Season wind-down, plan E: customer messages and the owner's digest (spec
-- docs/superpowers/specs/2026-09-14-season-wind-down-design.md §11.7, §12).
--
-- season_notices is the outbox (§12.3): one row per fact, per plan, per season,
-- queued by SQL at the moment the fact is born (schedule, break start) and sent
-- by /api/internal/season-notices-send, which re-checks the fact, sends the
-- email, queues the WhatsApp and stamps each channel. dispatch_season_notices_tick
-- runs every 5 minutes and is idle when nothing is due.
--
-- Copied from live and changed only on the lines marked "Plan E":
--   season_begin_break (queues N8 and N9), dispatch_customer_notifications_tick
--   (eight season template branches, §12.4) and dispatch_renew_nudges_tick (G7).
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_notices`. This file is the mirror.
-- ============================================================================

BEGIN;

-- ── The outbox ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.season_notices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  kind                text NOT NULL CHECK (kind IN (
                        'season_plan_runs_past', 'season_last_dinners', 'season_plan_held',
                        'season_pause_carries', 'season_plan_ready', 'season_credit_waiting')),
  subject_id          uuid NOT NULL,
  cycle_started_at    timestamptz NOT NULL,
  -- The fact's own key: a wrap-up day for N2, so a moved wrap-up day can be told again.
  fact_key            text NOT NULL DEFAULT '',
  send_after          timestamptz NOT NULL,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_sent_at       timestamptz,
  whatsapp_queued_at  timestamptz,
  dropped_at          timestamptz,
  drop_reason         text,
  attempts            integer NOT NULL DEFAULT 0,
  last_error          text,
  claimed_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT season_notices_one_per_fact UNIQUE (kind, subject_id, cycle_started_at, fact_key)
);
CREATE INDEX IF NOT EXISTS season_notices_due_idx ON public.season_notices (send_after)
  WHERE dropped_at IS NULL AND (email_sent_at IS NULL OR whatsapp_queued_at IS NULL);
ALTER TABLE public.season_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.season_notices FROM anon, authenticated;

ALTER TABLE public.intake_settings ADD COLUMN IF NOT EXISTS season_digest_state jsonb;

-- The next 10:00 in Dubai, strictly ahead of now (spec §12.1).
CREATE OR REPLACE FUNCTION public._season_next_ten_am()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN (now() AT TIME ZONE 'Asia/Dubai')::time < time '10:00'
      THEN ((now() AT TIME ZONE 'Asia/Dubai')::date + time '10:00') AT TIME ZONE 'Asia/Dubai'
    ELSE (((now() AT TIME ZONE 'Asia/Dubai')::date + 1) + time '10:00') AT TIME ZONE 'Asia/Dubai'
  END;
$$;

-- The waitlist credit this customer would get (creditAedFor in intake.ts, and season_begin_break).
CREATE OR REPLACE FUNCTION public._season_credit_aed_for(p_customer_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE c.meal_preference_type
    WHEN 'Veg' THEN r.credit_veg_aed
    WHEN 'Religious Preference' THEN r.credit_religious_aed
    ELSE r.credit_nonveg_aed
  END
  FROM public.intake_settings r
  LEFT JOIN public.customers c ON c.id = p_customer_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.season_queue_notice(
  p_kind text, p_customer_id uuid, p_subject_id uuid, p_cycle timestamptz, p_fact_key text, p_send_after timestamptz, p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- A fact that was dropped before it went out (the wrap-up day moved away
  -- and back, say) is revived with today's payload; a fact already told is
  -- never told twice.
  INSERT INTO public.season_notices (kind, customer_id, subject_id, cycle_started_at, fact_key, send_after, payload)
  VALUES (p_kind, p_customer_id, p_subject_id, p_cycle, COALESCE(p_fact_key, ''), p_send_after, COALESCE(p_payload, '{}'::jsonb))
  ON CONFLICT ON CONSTRAINT season_notices_one_per_fact DO UPDATE
    SET dropped_at = NULL, drop_reason = NULL, send_after = EXCLUDED.send_after, payload = EXCLUDED.payload,
        attempts = 0, last_error = NULL, claimed_at = NULL
    WHERE public.season_notices.dropped_at IS NOT NULL
      AND public.season_notices.email_sent_at IS NULL AND public.season_notices.whatsapp_queued_at IS NULL
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

-- Unsent rows of a kind are dropped when their fact is gone (spec §12.1).
CREATE OR REPLACE FUNCTION public.season_drop_notices(p_kind text, p_reason text, p_subject_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.season_notices
  SET dropped_at = now(), drop_reason = p_reason
  WHERE kind = p_kind
    AND dropped_at IS NULL
    AND email_sent_at IS NULL AND whatsapp_queued_at IS NULL
    AND (p_subject_id IS NULL OR subject_id = p_subject_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- N2 (spec §12.2): every plan that runs past the wrap-up day hears about the
-- split at 10:00 the next day, and again only if a moved wrap-up day changes it.
CREATE OR REPLACE FUNCTION public.season_queue_schedule_notices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        public.intake_settings;
  p        record;
  v_key    text;
  v_n      integer;
  v_queued integer := 0;
  v_moved  integer := 0;
BEGIN
  SELECT * INTO r FROM public.intake_settings;
  IF NOT FOUND OR r.season_phase <> 'winding_down' OR r.wrap_up_day IS NULL OR r.cycle_started_at IS NULL THEN
    RETURN jsonb_build_object('queued', 0, 'moved', 0);
  END IF;
  FOR p IN
    SELECT pr.*, s.plan_name
    FROM public.season_project_plans(r.wrap_up_day, r.close_day) pr
    JOIN public.subscriptions s ON s.id = pr.subscription_id
    WHERE pr.disposition = 'runs_past' AND pr.status IN ('Active', 'Skipped')
  LOOP
    v_key := r.wrap_up_day::text || ':' || p.meals_after_wrap_up::text;
    -- A split that changed drops the unsent old row; a sent one is told again.
    UPDATE public.season_notices
    SET dropped_at = now(), drop_reason = 'schedule_moved'
    WHERE kind = 'season_plan_runs_past' AND subject_id = p.subscription_id AND fact_key <> v_key
      AND dropped_at IS NULL AND email_sent_at IS NULL AND whatsapp_queued_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_moved := v_moved + v_n;
    IF public.season_queue_notice(
      'season_plan_runs_past', p.customer_id, p.subscription_id, r.cycle_started_at, v_key, public._season_next_ten_am(),
      jsonb_build_object(
        'plan_name', p.plan_name,
        'wrap_up_day', r.wrap_up_day,
        'last_dinner', p.last_dinner,
        'held_meals', p.meals_after_wrap_up,
        'credit_aed', COALESCE(public._season_credit_aed_for(p.customer_id), 0)))
    THEN v_queued := v_queued + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('queued', v_queued, 'moved', v_moved);
END;
$$;

-- N8 and N9 (spec §12.2): every hold the break just made, at 10:00.
CREATE OR REPLACE FUNCTION public.season_queue_break_notices(p_cycle timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h        record;
  v_queued integer := 0;
BEGIN
  FOR h IN
    SELECT sh.id, sh.customer_id, sh.subscription_id, sh.reason, sh.held_meals, s.plan_name,
           (SELECT c.amount_aed FROM public.credits c WHERE c.id = sh.waitlist_credit_id) AS credit_aed
    FROM public.season_holds sh
    JOIN public.subscriptions s ON s.id = sh.subscription_id
    WHERE sh.cycle_started_at = p_cycle AND sh.state IN ('held', 'paused_by_customer')
  LOOP
    IF public.season_queue_notice(
      CASE WHEN h.reason = 'season' THEN 'season_plan_held' ELSE 'season_pause_carries' END,
      h.customer_id, h.id, p_cycle, '', public._season_next_ten_am(),
      jsonb_build_object(
        'plan_name', h.plan_name,
        'held_meals', h.held_meals,
        'credit_aed', COALESCE(h.credit_aed, 0),
        'offer_aed', COALESCE(public._season_credit_aed_for(h.customer_id), 0)))
    THEN v_queued := v_queued + 1; END IF;
  END LOOP;
  RETURN v_queued;
END;
$$;

-- Same lease as broadcast_claim_batch: a row is claimed for two minutes, at most five tries.
CREATE OR REPLACE FUNCTION public.season_notice_claim_batch(p_limit integer)
RETURNS SETOF public.season_notices
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.season_notices n
  SET claimed_at = now(), attempts = attempts + 1
  WHERE n.id IN (
    SELECT id FROM public.season_notices
    WHERE dropped_at IS NULL
      AND send_after <= now()
      AND (email_sent_at IS NULL OR whatsapp_queued_at IS NULL)
      AND attempts < 5
      AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes')
    ORDER BY send_after, id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING n.*;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_season_notices_tick()
RETURNS TABLE(dispatched integer, skipped_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault'
AS $$
DECLARE
  base_url     text;
  retry_secret text;
  http_req_id  bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.season_notices
    WHERE dropped_at IS NULL AND send_after <= now()
      AND (email_sent_at IS NULL OR whatsapp_queued_at IS NULL)
      AND attempts < 5
      AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes')
  ) THEN
    dispatched := 0; skipped_reason := 'idle';
    RETURN NEXT; RETURN;
  END IF;

  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;
  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'dispatch_season_notices_tick: required vault secrets missing';
    dispatched := 0; skipped_reason := 'no_config';
    RETURN NEXT; RETURN;
  END IF;

  SELECT net.http_post(
    url     := base_url || '/api/internal/season-notices-send',
    headers := jsonb_build_object('Authorization', 'Bearer ' || retry_secret, 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  ) INTO http_req_id;

  dispatched := 1; skipped_reason := NULL;
  RETURN NEXT;
END;
$$;

-- ── The owner's digest (spec §11.7) ────────────────────────────────────────
-- 18:00 AE while winding down, only when something changed since the last
-- one; the final roster two days before the close day; and on the close day
-- at 20:30 AE, tonight's deliveries. Never a kitchen cost: that is kitchen data.

-- p_now is the clock, so a rehearsal can walk the 18:00 and 20:30 paths; cron calls it with the default.
CREATE OR REPLACE FUNCTION public.season_admin_digest_tick(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          public.intake_settings;
  v_today    date := (p_now AT TIME ZONE 'Asia/Dubai')::date;
  v_now_ae   time := (p_now AT TIME ZONE 'Asia/Dubai')::time;
  v_state    jsonb;
  v_prev     jsonb;
  v_sent     text[] := '{}';
  v_tonight  integer;
  v_plans    integer;
  v_roster   text;
  v_runs     integer;
  v_held     integer;
  v_credited numeric;
  v_grants   integer;
  v_last     date;
  v_closures text;
  v_msg      text;
BEGIN
  SELECT * INTO r FROM public.intake_settings;
  IF NOT FOUND OR r.season_phase <> 'winding_down' OR r.wrap_up_day IS NULL THEN
    RETURN jsonb_build_object('sent', to_jsonb(v_sent), 'reason', 'not_winding_down');
  END IF;

  -- The close-day evening run.
  IF v_now_ae >= time '20:00' THEN
    IF v_today = COALESCE(r.close_day, r.wrap_up_day) THEN
      SELECT COALESCE(sum(s.meals_per_day), 0), count(*) INTO v_tonight, v_plans
      FROM public.season_project_plans(r.wrap_up_day, r.close_day) pr
      JOIN public.subscriptions s ON s.id = pr.subscription_id
      WHERE v_today = ANY(pr.cook_dates);
      BEGIN
        PERFORM public.send_admin_whatsapp_alert(
          CASE WHEN v_tonight > 0
            THEN format('Tonight is the last kitchen night of the season: %s meals for %s plans. The break starts at 00:20 and plans with meals left are kept for next semester. You will get a summary once it has.', v_tonight, v_plans)
            ELSE 'No dinners tonight: the buffer day has no make-up meals to cook. The break starts at 00:20 and plans with meals left are kept for next semester. You will get a summary once it has.'
          END,
          'season_digest');
        v_sent := v_sent || 'close_day_tonight'::text;
      EXCEPTION WHEN OTHERS THEN RAISE WARNING 'season digest alert failed: %', SQLERRM; END;
    END IF;
    RETURN jsonb_build_object('sent', to_jsonb(v_sent));
  END IF;

  -- What the 18:00 digest watches.
  SELECT count(*) FILTER (WHERE pr.disposition = 'runs_past'),
         COALESCE(sum(pr.meals_after_wrap_up) FILTER (WHERE pr.disposition = 'runs_past'), 0),
         max(pr.last_dinner)
    INTO v_runs, v_held, v_last
  FROM public.season_project_plans(r.wrap_up_day, r.close_day) pr;
  SELECT COALESCE(sum(c.amount_aed), 0) INTO v_credited
  FROM public.credits c WHERE c.source = 'season_skip' AND c.created_at >= COALESCE(r.cycle_started_at, now() - interval '90 days');
  SELECT COALESCE(sum(s.season_buffer_grants), 0) INTO v_grants
  FROM public.subscriptions s WHERE s.status IN ('Active', 'Skipped', 'Paused', 'Scheduled');
  SELECT string_agg(to_char(cc.closure_date, 'Dy DD Mon'), ', ' ORDER BY cc.closure_date) INTO v_closures
  FROM public.company_closures cc WHERE cc.closure_date BETWEEN v_today AND COALESCE(r.close_day, r.wrap_up_day);

  v_state := jsonb_build_object(
    'wrap_up_day', r.wrap_up_day, 'close_day', r.close_day,
    'runs_past', v_runs, 'held_meals', v_held, 'credited_aed', v_credited,
    'grants', v_grants, 'last_dinner', v_last, 'closures', COALESCE(v_closures, ''));
  v_prev := r.season_digest_state;

  IF v_prev IS DISTINCT FROM v_state THEN
    v_msg := format('Season update. Wrap-up day %s, close day %s. %s plans run past the wrap-up day with %s meals to hold. Credited skips so far AED %s. Buffer grants %s. Last dinner on the books %s.%s',
      to_char(r.wrap_up_day, 'Dy DD Mon'), to_char(COALESCE(r.close_day, r.wrap_up_day), 'Dy DD Mon'),
      v_runs, v_held, trim(to_char(v_credited, 'FM999990.99'), '.'), v_grants,
      COALESCE(to_char(v_last, 'Dy DD Mon'), 'none'),
      CASE WHEN v_closures IS NOT NULL THEN ' Closures before the close day: ' || v_closures || '.' ELSE '' END);
    IF v_prev IS NOT NULL AND (v_prev->>'last_dinner') IS NOT NULL AND v_last IS NOT NULL
       AND (v_prev->>'last_dinner')::date > v_last AND v_last < r.wrap_up_day THEN
      v_msg := v_msg || format(' The last dinner moved earlier, so the wrap-up day could move to %s.', to_char(v_last, 'Dy DD Mon'));
    END IF;
    BEGIN
      PERFORM public.send_admin_whatsapp_alert(v_msg, 'season_digest');
      v_sent := v_sent || 'daily_change'::text;
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'season digest alert failed: %', SQLERRM; END;
    UPDATE public.intake_settings SET season_digest_state = v_state WHERE id = r.id;
  END IF;

  -- The final roster, two days before the close day.
  IF v_today = COALESCE(r.close_day, r.wrap_up_day) - 2 THEN
    SELECT string_agg(d.day || ': ' || d.n || ' meals', ', ' ORDER BY d.day) INTO v_roster
    FROM (
      SELECT to_char(x.d, 'Dy DD') AS day, sum(s.meals_per_day) AS n
      FROM public.season_project_plans(r.wrap_up_day, r.close_day) pr
      JOIN public.subscriptions s ON s.id = pr.subscription_id
      CROSS JOIN LATERAL unnest(pr.cook_dates) AS x(d)
      WHERE x.d >= v_today
      GROUP BY x.d
    ) d;
    BEGIN
      PERFORM public.send_admin_whatsapp_alert(
        format('Final roster for the season: %s. %s plans will be held for next semester with %s meals, and each paid one gets its waitlist credit when the break starts.',
          COALESCE(v_roster, 'no dinners left'), v_runs, v_held),
        'season_digest');
      v_sent := v_sent || 'final_roster'::text;
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'season digest alert failed: %', SQLERRM; END;
  END IF;

  RETURN jsonb_build_object('sent', to_jsonb(v_sent), 'state', v_state);
END;
$$;

-- ── Live functions changed on marked lines ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.season_begin_break()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r              public.intake_settings;
  s              public.subscriptions;
  v_today        date := public.ae_today();
  v_cycle        timestamptz;
  v_left         integer;
  v_reason       text;
  v_hold         uuid;
  v_order_id     uuid;
  v_paid_fils    integer;
  v_credit_fils  integer;
  v_meals        integer;
  v_session      text;
  v_paid         boolean;
  v_pref         text;
  v_amount       numeric;
  v_waitlist     uuid;
  v_credit       uuid;
  v_season_holds integer := 0;
  v_pause_holds  integer := 0;
  v_held_meals   integer := 0;
  v_credits      integer := 0;
  v_credit_aed   numeric := 0;
  v_closed       integer := 0;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('started', false, 'reason', 'no_settings');
  END IF;
  IF r.season_phase <> 'winding_down' OR r.close_day IS NULL OR r.close_day >= v_today THEN
    RETURN jsonb_build_object('started', false, 'reason', 'not_due');
  END IF;
  v_cycle := COALESCE(r.cycle_started_at, now());

  FOR s IN
    SELECT * FROM public.subscriptions
    WHERE status IN ('Active', 'Skipped', 'Paused', 'Scheduled')
      AND season_hold_id IS NULL
    ORDER BY id
    FOR UPDATE
  LOOP
    -- Held by meals, not dates (spec §8 step 4).
    v_left := GREATEST(0, s.total_meals - COALESCE(s.delivered_meals, 0)
                          - COALESCE(s.credited_skip_days, 0) * COALESCE(s.meals_per_day, 1));
    IF v_left = 0 THEN CONTINUE; END IF;

    IF s.status IN ('Active', 'Skipped') THEN
      v_reason := 'season';
    ELSIF s.status = 'Paused' THEN
      v_reason := 'customer_pause';
    ELSIF s.staff_approval = 'pending' THEN
      CONTINUE;
    ELSE
      v_reason := 'season';
    END IF;

    v_order_id := NULL; v_paid_fils := NULL; v_credit_fils := NULL; v_meals := NULL; v_session := NULL;
    SELECT o.id, o.amount_paid_fils, o.credit_applied_fils, o.meals_count, o.stripe_session_id
      INTO v_order_id, v_paid_fils, v_credit_fils, v_meals, v_session
    FROM public.orders o
    WHERE o.subscription_id = s.id
    ORDER BY o.created_at DESC
    LIMIT 1;

    -- meal_value_fils is stored only when it is exact under Plan B's money
    -- rule (season_skip_guards): recorded money on an order that is not a
    -- Stripe test-mode session (spec D7: test payments are not money).
    -- Otherwise NULL, so Plan D never refunds from an estimate.
    v_hold := NULL;
    INSERT INTO public.season_holds (subscription_id, customer_id, order_id, cycle_started_at, reason, state, held_meals, meal_value_fils)
    VALUES (
      s.id, s.customer_id, v_order_id, v_cycle, v_reason,
      CASE WHEN v_reason = 'season' THEN 'held' ELSE 'paused_by_customer' END,
      v_left,
      CASE WHEN v_paid_fils IS NOT NULL AND v_credit_fils IS NOT NULL AND COALESCE(v_meals, 0) > 0
                AND COALESCE(v_session, '') NOT LIKE 'cs\_test\_%'
           THEN floor((v_paid_fils + v_credit_fils)::numeric / v_meals)::integer END
    )
    ON CONFLICT ON CONSTRAINT season_holds_one_per_plan_per_season DO NOTHING
    RETURNING id INTO v_hold;
    IF v_hold IS NULL THEN
      SELECT id INTO v_hold FROM public.season_holds WHERE subscription_id = s.id AND cycle_started_at = v_cycle;
    END IF;

    IF s.status IN ('Active', 'Skipped') THEN
      UPDATE public.subscriptions
      SET status = 'Paused', pause_date = now(), planned_pause_start = NULL, season_hold_id = v_hold
      WHERE id = s.id;
    ELSE
      UPDATE public.subscriptions SET season_hold_id = v_hold WHERE id = s.id;
    END IF;

    IF v_reason = 'season' THEN
      v_season_holds := v_season_holds + 1;
      v_held_meals := v_held_meals + v_left;
    ELSE
      v_pause_holds := v_pause_holds + 1;
    END IF;

    -- Paid season holds earn the waitlist credit (spec §8 step 7, X5).
    v_paid := v_reason = 'season' AND v_order_id IS NOT NULL AND public.expense_category_for_plan(s.plan_name) IS NULL;
    IF v_paid THEN
      INSERT INTO public.intake_waitlist (customer_id, cycle_started_at)
      VALUES (s.customer_id, v_cycle)
      ON CONFLICT (customer_id, cycle_started_at) DO NOTHING;
      SELECT id INTO v_waitlist FROM public.intake_waitlist WHERE customer_id = s.customer_id AND cycle_started_at = v_cycle;
      v_credit := NULL;
      SELECT id INTO v_credit FROM public.credits WHERE intake_waitlist_id = v_waitlist;

      IF v_credit IS NULL THEN
        -- The TypeScript twins are creditAedFor (intake.ts) and mintWaitlistCredit (join-intake-waitlist.ts).
        SELECT meal_preference_type INTO v_pref FROM public.customers WHERE id = s.customer_id;
        v_amount := CASE v_pref
          WHEN 'Veg' THEN r.credit_veg_aed
          WHEN 'Religious Preference' THEN r.credit_religious_aed
          ELSE r.credit_nonveg_aed
        END;
        IF v_amount > 0 THEN
          INSERT INTO public.credits (customer_id, amount_aed, source, status, eligible_plan_ids, intake_waitlist_id)
          VALUES (s.customer_id, v_amount, 'intake_waitlist', 'approved', ARRAY['monthly-max', 'monthly-premium']::text[], v_waitlist)
          ON CONFLICT (intake_waitlist_id) WHERE intake_waitlist_id IS NOT NULL DO NOTHING
          RETURNING id INTO v_credit;
          IF v_credit IS NOT NULL THEN
            v_credits := v_credits + 1;
            v_credit_aed := v_credit_aed + v_amount;
          ELSE
            SELECT id INTO v_credit FROM public.credits WHERE intake_waitlist_id = v_waitlist;
          END IF;
        END IF;
      END IF;

      IF v_credit IS NOT NULL THEN
        UPDATE public.intake_waitlist SET credit_id = v_credit WHERE id = v_waitlist AND credit_id IS NULL;
        UPDATE public.season_holds SET waitlist_credit_id = v_credit, updated_at = now() WHERE id = v_hold;
      END IF;
    END IF;
  END LOOP;

  -- No promise of a meal after the close day survives the break (spec §8 step 8).
  UPDATE public.customer_notifications
  SET sent_at = now(), wamid = 'cancelled:superseded'
  WHERE sent_at IS NULL
    AND kind = 'meal_resumed_confirm'
    AND CASE WHEN (payload->>'resume_date') ~ '^\d{4}-\d{2}-\d{2}$'
             THEN (payload->>'resume_date')::date > r.close_day
             ELSE false END;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  UPDATE public.intake_settings SET
    season_phase = 'break',
    paused = true,
    paused_at = COALESCE(r.paused_at, now()),
    paused_by = CASE WHEN r.paused THEN r.paused_by ELSE 'schedule' END,
    sales_stopped_at = COALESCE(r.sales_stopped_at, now()),
    break_started_at = now(),
    cycle_started_at = v_cycle,
    updated_at = now()
  WHERE id = r.id;

  PERFORM public.season_queue_break_notices(v_cycle);  -- Plan E: N8 and N9 at 10:00

  BEGIN
    PERFORM public.send_admin_whatsapp_alert(
      format('The semester break has started and the kitchen is closed until you reopen. Held for next semester: %s plans, %s meals. Customer pauses carried: %s. Waitlist credit added: %s customers, AED %s. Reopen on the Season page when you are back.',
             v_season_holds, v_held_meals, v_pause_holds, v_credits, trim(to_char(v_credit_aed, 'FM999990.99'), '.')),
      'season_break');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'season break summary alert failed: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'started', true,
    'season_holds', v_season_holds,
    'customer_pause_holds', v_pause_holds,
    'held_meals', v_held_meals,
    'credits_minted', v_credits,
    'credit_aed', v_credit_aed,
    'notifications_closed', v_closed
  );
END;
$$;


-- The eight season kinds (spec §12.4) join the WhatsApp queue's allowed kinds.
ALTER TABLE public.customer_notifications DROP CONSTRAINT IF EXISTS customer_notifications_kind_check;
ALTER TABLE public.customer_notifications ADD CONSTRAINT customer_notifications_kind_check CHECK (kind = ANY (ARRAY[
  'meal_skipped_confirm', 'meal_resumed_confirm', 'meal_skip_scheduled_confirm', 'meal_skip_cancelled_confirm',
  'plan_paused_confirm', 'plan_pause_scheduled_confirm', 'plan_pause_cancelled_confirm', 'plan_resumed_confirm',
  'plan_start_date_changed_confirm', 'payment_order_confirmed', 'welcome_meal_confirmed', 'subscription_renew_nudge',
  'meals_gifted_confirm', 'referral_converted', 'refund_processed', 'subscription_ended', 'delivery_confirmed',
  'delivery_unconfirmed_8pm', 'intake_ended_credit', 'intake_ended_offer',
  'season_plan_runs_past', 'season_last_dinners', 'season_skip_credited', 'season_plan_held',
  'season_pause_carries', 'season_spot_saved', 'season_plan_ready', 'season_credit_waiting'
]::text[]));

CREATE OR REPLACE FUNCTION public.dispatch_customer_notifications_tick()
 RETURNS TABLE(sent_count integer, skipped_unverified_count integer, skipped_no_template_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  sent_total          int := 0;
  unverified_total    int := 0;
  no_template_total   int := 0;
  notif_row           RECORD;
  whatsapp_token      text;
  phone_number_id     text;
  template_name       text;
  template_lang       text;
  first_name          text;
  to_phone            text;
  meta_url            text;
  meta_payload        jsonb;
  components          jsonb;
  meal_date_str       text;
  start_date_str      text;
  end_date_str        text;
  plan_name_str       text;
  total_aed_str       text;
  meals_gifted_str    text;
  referral_str        text;
  credit_aed_str      text;
  offer_aed_str       text;
  refund_aed_str      text;
  delivered_meals_str text;
  wrap_up_day_str     text;  -- Plan E
  last_dinner_str     text;  -- Plan E
  held_meals_str      text;  -- Plan E
  http_req_id         bigint;
BEGIN
  SELECT decrypted_secret INTO whatsapp_token
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_access_token' LIMIT 1;
  SELECT decrypted_secret INTO phone_number_id
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_phone_number_id' LIMIT 1;

  IF whatsapp_token IS NULL OR phone_number_id IS NULL THEN
    RAISE WARNING 'dispatch_customer_notifications_tick: shared Meta secrets missing';
    sent_count := 0;
    skipped_unverified_count := 0;
    skipped_no_template_count := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  meta_url := format('https://graph.facebook.com/v22.0/%s/messages', phone_number_id);

  FOR notif_row IN
    SELECT n.id AS notif_id, n.customer_id, n.kind, n.payload, n.scheduled_for,
           c.whatsapp_number, c.whatsapp_verified, c.name AS customer_name
    FROM public.customer_notifications n
    JOIN public.customers c ON c.id = n.customer_id
    WHERE n.scheduled_for <= now() AND n.sent_at IS NULL
    ORDER BY n.scheduled_for ASC
    LIMIT 100
    FOR UPDATE OF n SKIP LOCKED
  LOOP
    IF notif_row.whatsapp_number IS NULL OR notif_row.whatsapp_verified IS NOT TRUE THEN
      UPDATE public.customer_notifications
         SET sent_at = now(), wamid = 'skipped:unverified'
       WHERE id = notif_row.notif_id;
      unverified_total := unverified_total + 1;
      CONTINUE;
    END IF;

    template_name := NULL;
    SELECT decrypted_secret INTO template_name
      FROM vault.decrypted_secrets
      WHERE name = 'tpl_' || notif_row.kind LIMIT 1;
    IF template_name IS NULL THEN
      -- Grace window, then give up. A missing vault entry used to leave the
      -- row unsent forever: it came back every tick and sat at the front of the
      -- oldest-first batch, crowding out real sends. Six hours is long enough to
      -- add a secret someone forgot, short enough that a genuinely absent
      -- template cannot jam the queue.
      IF notif_row.scheduled_for < now() - interval '6 hours' THEN
        UPDATE public.customer_notifications
           SET sent_at = now(), wamid = 'skipped:no_template'
         WHERE id = notif_row.notif_id;
        RAISE WARNING 'dispatch_customer_notifications_tick: giving up after 6h, no template for kind=%', notif_row.kind;
      ELSE
        RAISE WARNING 'dispatch_customer_notifications_tick: no template for kind=%', notif_row.kind;
      END IF;
      no_template_total := no_template_total + 1;
      CONTINUE;
    END IF;

    template_lang := CASE notif_row.kind
      WHEN 'meal_resumed_confirm'      THEN 'en_AE'
      ELSE 'en'
    END;

    first_name := COALESCE(NULLIF(split_part(notif_row.customer_name, ' ', 1), ''), 'there');
    to_phone := regexp_replace(notif_row.whatsapp_number, '^\+', '');

    meal_date_str := NULL;
    IF notif_row.payload ? 'meal_date' THEN
      meal_date_str := to_char((notif_row.payload ->> 'meal_date')::date, 'FMDDth FMMonth');
    END IF;
    start_date_str := NULL;
    IF notif_row.payload ? 'start_date' THEN
      start_date_str := to_char((notif_row.payload ->> 'start_date')::date, 'FMDDth FMMonth');
    END IF;
    end_date_str := NULL;
    IF notif_row.payload ? 'end_date' THEN
      end_date_str := to_char((notif_row.payload ->> 'end_date')::date, 'FMDDth FMMonth');
    END IF;
    plan_name_str := NULLIF(notif_row.payload ->> 'plan_name', '');
    total_aed_str := NULLIF(notif_row.payload ->> 'total_aed', '');
    meals_gifted_str := NULLIF(notif_row.payload ->> 'meals_gifted', '');

    referral_str        := NULLIF(notif_row.payload ->> 'referral', '');
    credit_aed_str      := NULLIF(notif_row.payload ->> 'credit_aed', '');
    offer_aed_str       := NULLIF(notif_row.payload ->> 'offer_aed', '');
    refund_aed_str      := NULLIF(notif_row.payload ->> 'refund_aed', '');
    delivered_meals_str := NULLIF(notif_row.payload ->> 'delivered_meals', '');
    -- Plan E: season kinds (spec §12.4)
    wrap_up_day_str := NULL;
    IF notif_row.payload ? 'wrap_up_day' THEN
      wrap_up_day_str := to_char((notif_row.payload ->> 'wrap_up_day')::date, 'FMDay FMDDth FMMonth');
    END IF;
    last_dinner_str := NULL;
    IF notif_row.payload ? 'last_dinner' THEN
      last_dinner_str := to_char((notif_row.payload ->> 'last_dinner')::date, 'FMDay FMDDth FMMonth');
    END IF;
    held_meals_str := NULLIF(notif_row.payload ->> 'held_meals', '');

    components := CASE notif_row.kind

      WHEN 'meal_skipped_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'meal_date', 'text', meal_date_str))))

      WHEN 'payment_order_confirmed' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'total_aed', 'text', total_aed_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'start_date', 'text', start_date_str))))

      WHEN 'welcome_meal_confirmed' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'start_date', 'text', start_date_str))))

      WHEN 'meal_resumed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))

      WHEN 'plan_paused_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))

      WHEN 'plan_pause_scheduled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'start_date', 'text', start_date_str))))

      WHEN 'plan_resumed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))

      WHEN 'meal_skip_scheduled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'meal_date', 'text', meal_date_str))))

      WHEN 'meal_skip_cancelled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'meal_date', 'text', meal_date_str))))

      WHEN 'plan_pause_cancelled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))

      WHEN 'plan_start_date_changed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'start_date', 'text', start_date_str))))

      WHEN 'subscription_renew_nudge' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'end_date',  'text', end_date_str))))

      WHEN 'meals_gifted_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'meals_gifted', 'text', meals_gifted_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'end_date',     'text', end_date_str))))

      WHEN 'referral_converted' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'referral', 'text', referral_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'x',        'text', credit_aed_str))))

      WHEN 'refund_processed' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'x', 'text', refund_aed_str))))

      WHEN 'subscription_ended' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'x',         'text', delivered_meals_str))))

      -- v7: no-variable template — send empty components array
      WHEN 'intake_ended_credit' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name',       'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'delivered_meals', 'text', delivered_meals_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed',      'text', credit_aed_str))))

      WHEN 'intake_ended_offer' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name',       'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'delivered_meals', 'text', delivered_meals_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'offer_aed',       'text', offer_aed_str))))

      WHEN 'season_plan_runs_past' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'wrap_up_day', 'text', wrap_up_day_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'held_meals', 'text', held_meals_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed', 'text', credit_aed_str))))

      WHEN 'season_last_dinners' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'last_dinner', 'text', last_dinner_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'wrap_up_day', 'text', wrap_up_day_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'offer_aed', 'text', offer_aed_str))))

      WHEN 'season_skip_credited' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'wrap_up_day', 'text', wrap_up_day_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed', 'text', credit_aed_str))))

      WHEN 'season_plan_held' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'held_meals', 'text', held_meals_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed', 'text', credit_aed_str))))

      WHEN 'season_pause_carries' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'offer_aed', 'text', offer_aed_str))))

      WHEN 'season_spot_saved' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed', 'text', credit_aed_str))))

      WHEN 'season_plan_ready' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'held_meals', 'text', held_meals_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str))))

      WHEN 'season_credit_waiting' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed', 'text', credit_aed_str))))

      WHEN 'delivery_confirmed' THEN
        jsonb_build_array()

    END;

    -- The CASE above has no ELSE, so a kind with a vault entry but no branch
    -- lands here as NULL. The old code posted that to Meta as
    -- "components": null and then stamped sent_at, so the message was silently
    -- lost while the row claimed success — and a malformed request risks the
    -- number's quality rating, which affects every template we send. Close it
    -- out honestly and post nothing.
    IF components IS NULL THEN
      RAISE WARNING 'dispatch_customer_notifications_tick: no component branch for kind=%', notif_row.kind;
      UPDATE public.customer_notifications
         SET sent_at = now(), wamid = 'skipped:no_component_branch'
       WHERE id = notif_row.notif_id;
      no_template_total := no_template_total + 1;
      CONTINUE;
    END IF;

    meta_payload := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'to', to_phone,
      'type', 'template',
      'template', jsonb_build_object(
        'name', template_name,
        'language', jsonb_build_object('code', template_lang),
        'components', components
      )
    );

    SELECT net.http_post(
      url := meta_url,
      headers := jsonb_build_object('Authorization', 'Bearer ' || whatsapp_token, 'Content-Type', 'application/json'),
      body := meta_payload
    ) INTO http_req_id;

    UPDATE public.customer_notifications
       SET sent_at = now(),
           meta_request_id = http_req_id
     WHERE id = notif_row.notif_id;
    sent_total := sent_total + 1;
  END LOOP;

  sent_count := sent_total;
  skipped_unverified_count := unverified_total;
  skipped_no_template_count := no_template_total;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_renew_nudges_tick()
 RETURNS TABLE(dispatched_count integer, skipped_no_config integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  dispatched_total int := 0;
  no_config_total  int := 0;
  sub_row          RECORD;
  base_url         text;
  retry_secret     text;
  http_req_id      bigint;
BEGIN
  -- Plan E (spec G7): silent during the semester break. While sales are
  -- stopped or the season winds down the route decides per plan: a renewal
  -- nudge when a plan can still follow, season_last_dinners (N4) when not.
  IF EXISTS (SELECT 1 FROM public.intake_settings WHERE season_phase = 'break') THEN
    dispatched_count  := 0;
    skipped_no_config := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'dispatch_renew_nudges_tick: required vault secrets missing';
    dispatched_count := 0;
    skipped_no_config := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR sub_row IN
    SELECT s.id
    FROM public.subscriptions s
    WHERE s.status = 'Active'
      AND (
        s.plan_name ILIKE '%Monthly Max%'
        OR s.plan_name ILIKE '%Monthly Premium%'
        OR s.plan_name ILIKE '%Weekly Flex%'
      )
      AND s.end_date BETWEEN CURRENT_DATE + 2 AND CURRENT_DATE + 3
      AND NOT EXISTS (
        SELECT 1 FROM public.subscriptions q
        WHERE q.customer_id = s.customer_id
          AND q.status = 'Scheduled'
          AND q.start_date > CURRENT_DATE
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_notifications cn
        WHERE cn.customer_id = s.customer_id
          AND cn.kind = 'subscription_renew_nudge'
          AND cn.scheduled_for > NOW() - INTERVAL '7 days'
          AND (cn.meta_status_code IS NULL OR cn.meta_status_code BETWEEN 200 AND 299)
      )
    LIMIT 200
  LOOP
    SELECT net.http_post(
      url     := base_url || '/api/internal/renew-nudge-send',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || retry_secret,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object('subscription_id', sub_row.id::text)
    ) INTO http_req_id;

    dispatched_total := dispatched_total + 1;
  END LOOP;

  dispatched_count  := dispatched_total;
  skipped_no_config := no_config_total;
  RETURN NEXT;
END;
$function$;

-- ── Cron ────────────────────────────────────────────────────────────────────
-- N5 moves from 00:45 to 10:00 AE (spec §12.2); the outbox is checked every
-- five minutes; the digest runs at 18:00 AE and again at 20:30 AE for the
-- close-day note.
SELECT cron.schedule('dispatch_subscription_ended_0045_ae', '0 6 * * *', ' SELECT public.dispatch_subscription_ended_tick(); ');
SELECT cron.schedule('dispatch_season_notices_tick', '*/5 * * * *', 'SELECT public.dispatch_season_notices_tick();');
SELECT cron.schedule('season_admin_digest_tick', '0 14 * * *', 'SELECT public.season_admin_digest_tick();');
SELECT cron.schedule('season_admin_digest_tick_close_day', '30 16 * * *', 'SELECT public.season_admin_digest_tick();');

REVOKE EXECUTE ON FUNCTION public._season_next_ten_am() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._season_credit_aed_for(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_queue_notice(text, uuid, uuid, timestamptz, text, timestamptz, jsonb) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_drop_notices(text, text, uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_queue_schedule_notices() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_queue_break_notices(timestamptz) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_notice_claim_batch(integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_season_notices_tick() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_admin_digest_tick(timestamptz) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_begin_break() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_customer_notifications_tick() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_renew_nudges_tick() FROM public, anon, authenticated;

COMMIT;

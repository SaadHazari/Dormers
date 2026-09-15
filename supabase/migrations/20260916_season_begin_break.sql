-- ============================================================================
-- Season wind-down, plan C: the break begins (spec
-- docs/superpowers/specs/2026-09-14-season-wind-down-design.md §8, §9 G10
-- rules "an Active plan during the break" and "break not started by 01:30 AE").
--
-- Functions only. Migration season_break_cron schedules them.
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_begin_break`. This file is the mirror.
-- ============================================================================

BEGIN;

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

-- 00:20 AE, retried at 00:50 and 01:20 (migration season_break_cron). Replaces
-- intake_scheduled_pause_tick, keeping both of its paths.
CREATE OR REPLACE FUNCTION public.season_break_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.ae_today();
  r public.intake_settings;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('action', 'none', 'reason', 'no_settings');
  END IF;

  -- The first Dubai day after the close day: the break begins (spec §8).
  IF r.season_phase = 'winding_down' AND r.close_day IS NOT NULL AND r.close_day < v_today THEN
    RETURN jsonb_build_object('action', 'begin_break') || public.season_begin_break();
  END IF;

  -- Past the wrap-up day: sales close; the season carries on to the close day.
  IF r.season_phase = 'winding_down' AND r.wrap_up_day IS NOT NULL AND r.wrap_up_day < v_today THEN
    IF NOT r.paused THEN
      UPDATE public.intake_settings SET
        paused = true,
        paused_at = now(),
        paused_by = 'schedule',
        sales_stopped_at = COALESCE(r.sales_stopped_at, now()),
        updated_at = now()
      WHERE id = r.id;
      RETURN jsonb_build_object('action', 'sales_closed');
    END IF;
    RETURN jsonb_build_object('action', 'none', 'reason', 'waiting_for_close_day');
  END IF;

  -- Legacy: a pause_scheduled_for written while open (the season functions never do).
  IF r.season_phase = 'open' AND r.pause_scheduled_for IS NOT NULL AND r.pause_scheduled_for < v_today THEN
    IF r.paused THEN
      UPDATE public.intake_settings SET pause_scheduled_for = NULL, updated_at = now() WHERE id = r.id;
      RETURN jsonb_build_object('action', 'legacy_cleared');
    END IF;
    UPDATE public.intake_settings SET
      paused = true,
      paused_at = now(),
      paused_by = 'schedule',
      cycle_started_at = now(),
      pause_scheduled_for = NULL,
      updated_at = now()
    WHERE id = r.id AND paused = false;
    RETURN jsonb_build_object('action', 'legacy_paused');
  END IF;

  RETURN jsonb_build_object('action', 'none');
END;
$$;

-- Hourly (migration season_break_cron). Plan G adds the other G10 rules here.
CREATE OR REPLACE FUNCTION public.season_invariants_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          public.intake_settings;
  v_today    date := public.ae_today();
  v_now_ae   timestamp := now() AT TIME ZONE 'Asia/Dubai';
  v_active   integer;
  v_list     text;
  v_breaches text[] := '{}';
BEGIN
  SELECT * INTO r FROM public.intake_settings;
  IF NOT FOUND OR r.season_phase = 'open' THEN
    RETURN jsonb_build_object('checked', false);
  END IF;

  -- An Active plan the delivery tick would cook, during the break.
  IF r.season_phase = 'break' THEN
    WITH cooking AS (
      SELECT id, plan_name, created_at FROM public.subscriptions
      WHERE status = 'Active'
        AND COALESCE(delivered_meals, 0) < total_meals - COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1)
    )
    SELECT count(*), string_agg(x.plan_name || ' ' || x.id::text, ', ' ORDER BY x.created_at)
      INTO v_active, v_list
    FROM (SELECT * FROM cooking ORDER BY created_at LIMIT 5) x;
    SELECT count(*) INTO v_active FROM public.subscriptions
    WHERE status = 'Active'
      AND COALESCE(delivered_meals, 0) < total_meals - COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1);
    IF v_active > 0 THEN
      v_breaches := v_breaches || 'active_during_break'::text;
      BEGIN
        PERFORM public.send_admin_whatsapp_alert(
          format('URGENT: %s plans are Active during the semester break, so they could be counted for cooking: %s. Pause each one from its customer page and check the Season page.', v_active, v_list),
          'season_invariant');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'season invariant alert failed: %', SQLERRM;
      END;
    END IF;
  END IF;

  -- The break has not started although the close day has passed (01:30 AE).
  IF r.season_phase = 'winding_down' AND r.close_day IS NOT NULL AND r.close_day < v_today
     AND (v_now_ae::time >= time '01:30' OR r.close_day < v_today - 1) THEN
    v_breaches := v_breaches || 'break_not_started'::text;
    BEGIN
      PERFORM public.send_admin_whatsapp_alert(
        format('URGENT: the semester break has not started. The close day was %s and it is past 01:30 in Dubai, so plans with meals left are not held and nothing stops a restart. Check the semester break starter on the Scheduled Jobs page.', to_char(r.close_day, 'Dy DD Mon')),
        'season_invariant');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'season invariant alert failed: %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('checked', true, 'breaches', to_jsonb(v_breaches));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_begin_break() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_break_tick() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_invariants_tick() FROM public, anon, authenticated;

COMMIT;

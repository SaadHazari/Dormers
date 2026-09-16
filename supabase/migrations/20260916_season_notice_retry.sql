-- ============================================================================
-- Season wind-down: a season message is never abandoned, and never fails in
-- silence (spec §12.3, G10).
--
-- The outbox gave a row five quick tries and then parked it forever. The
-- eight season email templates are created in ZeptoMail by hand, so the
-- normal first state of the world is "the template does not exist yet": every
-- message parks, and nothing says so. Now a parked row waits six hours and
-- tries again, and season_invariants_tick says how many are waiting and why.
--
-- Both bodies were copied from the applied migrations (season_notices,
-- season_invariants_g10); only the marked lines differ.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_notice_retry`. This file is the mirror.
-- ============================================================================

BEGIN;

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
      -- A row that used up its five quick tries is not abandoned: it waits six
      -- hours and tries again, so a template added later drains the backlog on
      -- its own. The ceiling stops a permanently broken row spinning forever.
      AND attempts < 50
      AND (attempts < 5 OR claimed_at < now() - interval '6 hours')
      AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes')
    ORDER BY send_after, id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING n.*;
$$;

CREATE OR REPLACE FUNCTION public.season_invariants_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          public.intake_settings;
  v_alerted  jsonb;   -- Plan G: breach key -> last alert time, so a standing breach is said every six hours, not every hour
  v_today    date := public.ae_today();
  v_now_ae   timestamp := now() AT TIME ZONE 'Asia/Dubai';
  v_active   integer;
  v_list     text;
  v_breaches text[] := '{}';
  v_stuck    integer;  -- Plan D
  v_waiting  record;   -- Plan D
  v_n        integer;  -- Plan G
BEGIN
  SELECT * INTO r FROM public.intake_settings;
  IF NOT FOUND THEN  -- Plan D: the refund checks below run in every phase
    RETURN jsonb_build_object('checked', false);
  END IF;
  v_alerted := COALESCE(r.season_digest_state->'alerted', '{}'::jsonb);

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
        v_alerted := public._season_alert_once(v_alerted, 'active_during_break', 
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
      v_alerted := public._season_alert_once(v_alerted, 'break_not_started', 
        format('URGENT: the semester break has not started. The close day was %s and it is past 01:30 in Dubai, so plans with meals left are not held and nothing stops a restart. Check the semester break starter on the Scheduled Jobs page.', to_char(r.close_day, 'Dy DD Mon')),
        'season_invariant');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'season invariant alert failed: %', SQLERRM;
    END;
  END IF;

  -- Plan F (spec §11.7 "Reopened"): reopened two hours ago and the reopening
  -- notice has not gone out. Said once per reopening.
  IF r.season_phase = 'open' AND r.cycle_ended_at IS NOT NULL AND r.reopen_notice_sent_at IS NULL
     AND r.cycle_ended_at < now() - interval '2 hours' AND r.cycle_ended_at > now() - interval '48 hours'
     AND COALESCE(r.season_digest_state->>'reopen_reminded_for', '') <> r.cycle_ended_at::text THEN
    v_breaches := v_breaches || 'reopen_notice_not_sent'::text;
    BEGIN
      PERFORM public.send_admin_whatsapp_alert(
        'You reopened over two hours ago and the reopening notice has not gone out. Held plans are ready, but nobody has been told. Send it from the Season page.',
        'season_reopen');
      UPDATE public.intake_settings
      SET season_digest_state = COALESCE(season_digest_state, '{}'::jsonb) || jsonb_build_object('reopen_reminded_for', r.cycle_ended_at::text)
      WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'season reopen reminder failed: %', SQLERRM;
    END;
  END IF;

  -- Plan D (spec G10): a refund Stripe may have taken but we never recorded.
  SELECT count(*), string_agg(id::text, ', ') INTO v_stuck, v_list
  FROM public.season_holds
  WHERE state = 'refund_processing' AND updated_at < now() - interval '30 minutes';
  IF v_stuck > 0 THEN
    v_breaches := v_breaches || 'refund_processing_stuck'::text;
    BEGIN
      v_alerted := public._season_alert_once(v_alerted, 'refund_processing_stuck', 
        format('URGENT: %s season refund(s) have been processing for over 30 minutes: %s. Check Stripe for the refund, then use Retry on the Season page or settle by hand.', v_stuck, v_list),
        'season_invariant');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'season invariant alert failed: %', SQLERRM;
    END;
  END IF;

  -- Plan D (spec §10.3 step 6): a request the owner has not answered in 24 hours, reminded once.
  FOR v_waiting IN
    SELECT h.id, h.held_meals, h.cash_refund_fils, h.credit_share_fils, c.name AS customer_name, s.plan_name
    FROM public.season_holds h
    JOIN public.subscriptions s ON s.id = h.subscription_id
    JOIN public.customers c ON c.id = h.customer_id
    WHERE h.state = 'refund_requested'
      AND h.refund_requested_at < now() - interval '24 hours'
      AND h.refund_reminded_at IS NULL
    ORDER BY h.refund_requested_at
  LOOP
    v_breaches := v_breaches || 'refund_request_waiting'::text;
    BEGIN
      PERFORM public.send_admin_whatsapp_alert(
        format('Reminder: %s asked for a refund on their %s a day ago and is still waiting. %s held meals, AED %s back to the card and AED %s back to the wallet. Approve or decline on the Season page.',
          v_waiting.customer_name, v_waiting.plan_name, v_waiting.held_meals,
          to_char(COALESCE(v_waiting.cash_refund_fils, 0) / 100.0, 'FM999990.00'),
          to_char(COALESCE(v_waiting.credit_share_fils, 0) / 100.0, 'FM999990.00')),
        'season_refund');
      UPDATE public.season_holds SET refund_reminded_at = now() WHERE id = v_waiting.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'season refund reminder failed: %', SQLERRM;
    END;
  END LOOP;

  -- Plan G (spec G10): the rest of the invariants, while a season is ending or on the break.
  IF r.season_phase IN ('winding_down', 'break') AND r.wrap_up_day IS NOT NULL THEN
    -- A delivery recorded after the close day.
    SELECT count(*), string_agg(plan_name || ' ' || id::text, ', ') INTO v_n, v_list
    FROM public.subscriptions
    WHERE last_delivery_tick_date > COALESCE(r.close_day, r.wrap_up_day);
    IF v_n > 0 THEN
      v_breaches := v_breaches || 'delivery_after_close_day'::text;
      v_alerted := public._season_alert_once(v_alerted, 'delivery_after_close_day',
        format('URGENT: %s plans have a delivery recorded after the close day %s: %s. The kitchen cooked when it should have been closed. Check the delivery tick on the Scheduled Jobs page.', v_n, to_char(COALESCE(r.close_day, r.wrap_up_day), 'Dy DD Mon'), v_list),
        'season_invariant');
    END IF;
    -- A delivery after the wrap-up day on a plan without a buffer grant.
    SELECT count(*), string_agg(plan_name || ' ' || id::text, ', ') INTO v_n, v_list
    FROM public.subscriptions
    WHERE last_delivery_tick_date > r.wrap_up_day
      AND last_delivery_tick_date <= COALESCE(r.close_day, r.wrap_up_day)
      AND COALESCE(season_buffer_grants, 0) = 0;
    IF v_n > 0 THEN
      v_breaches := v_breaches || 'delivery_after_wrap_up_without_grant'::text;
      v_alerted := public._season_alert_once(v_alerted, 'delivery_after_wrap_up_without_grant',
        format('%s plans were cooked for after the wrap-up day without a buffer grant: %s. The buffer is for make-up meals only; check the plans on the Season page.', v_n, v_list),
        'season_invariant');
    END IF;
  END IF;

  -- A paid season hold with no waitlist credit (spec §8 step 7, X5).
  SELECT count(*), string_agg(h.id::text, ', ') INTO v_n, v_list
  FROM public.season_holds h
  JOIN public.subscriptions s ON s.id = h.subscription_id
  WHERE h.reason = 'season' AND h.state IN ('held', 'ready', 'refund_requested', 'refund_failed')
    AND h.order_id IS NOT NULL AND h.waitlist_credit_id IS NULL
    AND public.expense_category_for_plan(s.plan_name) IS NULL
    AND h.created_at < now() - interval '1 hour';
  IF v_n > 0 THEN
    v_breaches := v_breaches || 'paid_hold_without_credit'::text;
    v_alerted := public._season_alert_once(v_alerted, 'paid_hold_without_credit',
      format('%s paid held plans have no waitlist credit: holds %s. The break should have minted it; add the credit from the customer page and tell me if it happens again.', v_n, v_list),
      'season_invariant');
  END IF;

  -- A season-skip credit still pending two days after its meal date (the credit tick should have released it).
  SELECT count(*), string_agg(c.id::text, ', ') INTO v_n, v_list
  FROM public.credits c
  WHERE c.source = 'season_skip' AND c.status = 'pending' AND c.meal_date < v_today - 2;
  IF v_n > 0 THEN
    v_breaches := v_breaches || 'season_skip_credit_stale'::text;
    v_alerted := public._season_alert_once(v_alerted, 'season_skip_credit_stale',
      format('%s skipped-meal credits are still pending two days after their meal date: %s. Check the season credit tick on the Scheduled Jobs page.', v_n, v_list),
      'season_invariant');
  END IF;

  -- A season message that could not be sent. The usual cause is an email
  -- template that does not exist in ZeptoMail yet.
  SELECT count(*), string_agg(DISTINCT kind, ', ') INTO v_n, v_list
  FROM public.season_notices
  WHERE dropped_at IS NULL AND attempts >= 5
    AND (email_sent_at IS NULL OR whatsapp_queued_at IS NULL);
  IF v_n > 0 THEN
    v_breaches := v_breaches || 'season_notices_stuck'::text;
    v_alerted := public._season_alert_once(v_alerted, 'season_notices_stuck',
      format('%s season messages could not be sent yet (%s). The usual cause is an email template that is not set up in ZeptoMail. They keep retrying every six hours, so setting it up is enough to release them.', v_n, v_list),
      'season_invariant');
  END IF;

  -- Remember what was said and when.
  UPDATE public.intake_settings
  SET season_digest_state = COALESCE(season_digest_state, '{}'::jsonb) || jsonb_build_object('alerted', v_alerted)
  WHERE id = r.id AND COALESCE(season_digest_state->'alerted', '{}'::jsonb) IS DISTINCT FROM v_alerted;

  RETURN jsonb_build_object('checked', r.season_phase <> 'open' OR v_stuck > 0 OR v_breaches <> '{}', 'breaches', to_jsonb(v_breaches));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_notice_claim_batch(integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_invariants_tick() FROM public, anon, authenticated;

COMMIT;

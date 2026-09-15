-- ============================================================================
-- Season wind-down, plan D: refunds for held meals (spec
-- docs/superpowers/specs/2026-09-14-season-wind-down-design.md §6.3, §10.3,
-- owner decisions D2, D6, D7, X4, X5, X7).
--
-- The hold row is the ledger. Every step is a compare-and-set on
-- season_holds.state so a customer tapping Resume and asking for a refund at
-- the same moment, or an admin approving twice, cannot both win:
--
--   held | ready ──request──▶ refund_requested ──approve──▶ refund_processing
--   refund_requested ──cancel | decline──▶ held (break) | ready (after reopening)
--   refund_processing ──Stripe accepted──▶ refunded   (plan Ended, credit share back)
--   refund_processing ──Stripe rejected──▶ refund_failed ──approve (retry)──▶ refund_processing
--
-- Money rule (D7, memory stripe-test-mode-pilot): a refund is offered only when
-- the hold's order has recorded money, a PaymentIntent, and is not a Stripe
-- test-mode session. Cash = floor(held × amount_paid / meals), capped at what
-- Stripe still allows (read by the app and passed in). Credit share =
-- floor(held × credit_applied / meals), returned as a season_refund_return
-- credit. Staff and welcome plans (expense_category_for_plan) get neither (X5).
-- The waitlist credit minted with the hold stays (X7).
--
-- season_invariants_tick was copied from the applied season_begin_break
-- migration; only the lines marked "Plan D" differ: the refund checks run in
-- every phase (a stuck refund after reopening is still stuck), a refund_processing
-- older than 30 minutes alerts, and a request waiting 24 hours reminds the owner once.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_refunds`. This file is the mirror.
-- ============================================================================

BEGIN;

ALTER TABLE public.season_holds ADD COLUMN IF NOT EXISTS refund_reminded_at timestamptz;

-- A hold that moved money, or tried to, is a record, never collateral of a cascade. The
-- subscription and customer cascades stay for holds without a refund so the
-- checkout rollbacks (a plan deleted seconds after it was created and held on
-- arrival during the break) keep working.
CREATE OR REPLACE FUNCTION public._season_holds_protect_money()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.state IN ('refund_processing', 'refund_failed', 'refunded') OR OLD.stripe_refund_id IS NOT NULL THEN
    RAISE EXCEPTION 'SEASON_HOLD_MONEY: hold % carries a refund (%) and cannot be deleted', OLD.id, COALESCE(OLD.stripe_refund_id, OLD.state);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_season_holds_protect_money ON public.season_holds;
CREATE TRIGGER trg_season_holds_protect_money
  BEFORE DELETE ON public.season_holds
  FOR EACH ROW EXECUTE FUNCTION public._season_holds_protect_money();

-- What a refund of this hold is worth, before the Stripe cap. Raises when the
-- hold is not refundable at all; the app hides the button on the same facts
-- (seasonRefundOffer in src/contexts/season/domain/season-refund.ts).
CREATE OR REPLACE FUNCTION public._season_refund_facts(h public.season_holds, s public.subscriptions)
RETURNS TABLE(order_id uuid, payment_intent text, cash_fils integer, credit_fils integer)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  o public.orders;
BEGIN
  IF h.reason <> 'season' THEN
    RAISE EXCEPTION 'SEASON_REFUND_NOT_OFFERED: a customer pause is not refunded (X4)';
  END IF;
  IF public.expense_category_for_plan(s.plan_name) IS NOT NULL THEN
    RAISE EXCEPTION 'SEASON_REFUND_NOT_OFFERED: % was not paid for (X5)', s.plan_name;
  END IF;
  IF h.order_id IS NULL THEN
    RAISE EXCEPTION 'SEASON_REFUND_NOT_OFFERED: the hold has no order';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = h.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SEASON_REFUND_NOT_OFFERED: order % is gone', h.order_id;
  END IF;
  IF o.stripe_payment_id IS NULL OR COALESCE(o.stripe_session_id, '') LIKE 'cs\_test\_%' THEN
    RAISE EXCEPTION 'SEASON_REFUND_NOT_OFFERED: the order was not paid through a live Stripe payment (D7)';
  END IF;
  IF h.meal_value_fils IS NULL OR o.amount_paid_fils IS NULL OR o.credit_applied_fils IS NULL OR COALESCE(o.meals_count, 0) <= 0 THEN
    RAISE EXCEPTION 'SEASON_REFUND_NOT_OFFERED: the order has no recorded money';
  END IF;
  IF h.held_meals <= 0 THEN
    RAISE EXCEPTION 'SEASON_REFUND_NOT_OFFERED: no meals are held';
  END IF;
  order_id       := o.id;
  payment_intent := o.stripe_payment_id;
  cash_fils      := floor(h.held_meals::numeric * o.amount_paid_fils / o.meals_count)::integer;
  credit_fils    := floor(h.held_meals::numeric * o.credit_applied_fils / o.meals_count)::integer;
  RETURN NEXT;
END;
$$;

-- Where a hold goes back to when a request is cancelled or declined: held
-- during the break, ready once the season has reopened (season_reopen moves
-- only held and paused_by_customer, so a request that straddles the reopening
-- lands on ready here).
CREATE OR REPLACE FUNCTION public._season_refund_back_state()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN (SELECT season_phase FROM public.intake_settings LIMIT 1) = 'break' THEN 'held' ELSE 'ready' END;
$$;

CREATE OR REPLACE FUNCTION public.season_request_refund(
  p_customer_id uuid, p_subscription_id uuid, p_refundable_cap_fils integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s      public.subscriptions;
  h      public.season_holds;
  f      record;
  v_cash integer;
BEGIN
  IF p_refundable_cap_fils IS NULL OR p_refundable_cap_fils < 0 THEN
    RAISE EXCEPTION 'SEASON_REFUND_BAD_INPUT: the Stripe cap is required';
  END IF;

  -- Lock order matches season_release_hold: the plan, then its hold.
  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id AND customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_REFUND_NOT_FOUND'; END IF;
  IF s.season_hold_id IS NULL THEN RAISE EXCEPTION 'SEASON_REFUND_NOT_HELD: plan % has no hold', s.id; END IF;
  SELECT * INTO h FROM public.season_holds WHERE id = s.season_hold_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_REFUND_NOT_HELD: hold % is missing', s.season_hold_id; END IF;
  IF h.state NOT IN ('held', 'ready') THEN
    RAISE EXCEPTION 'SEASON_REFUND_BAD_STATE: hold is %', h.state;
  END IF;

  SELECT * INTO f FROM public._season_refund_facts(h, s);
  v_cash := LEAST(f.cash_fils, p_refundable_cap_fils);
  IF v_cash <= 0 AND f.credit_fils <= 0 THEN
    RAISE EXCEPTION 'SEASON_REFUND_NOTHING: nothing is left to refund on this payment';
  END IF;

  UPDATE public.season_holds SET
    state = 'refund_requested',
    cash_refund_fils = v_cash,
    credit_share_fils = f.credit_fils,
    refund_requested_at = now(),
    refund_reminded_at = NULL,
    refund_decided_by = NULL,
    refund_decline_reason = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE id = h.id;

  RETURN jsonb_build_object(
    'hold_id', h.id,
    'subscription_id', s.id,
    'customer_id', s.customer_id,
    'plan_name', s.plan_name,
    'held_meals', h.held_meals,
    'cash_refund_fils', v_cash,
    'credit_share_fils', f.credit_fils,
    'previous_state', h.state
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.season_cancel_refund_request(p_customer_id uuid, p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s      public.subscriptions;
  h      public.season_holds;
  v_back text := public._season_refund_back_state();
BEGIN
  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id AND customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_REFUND_NOT_FOUND'; END IF;
  IF s.season_hold_id IS NULL THEN RAISE EXCEPTION 'SEASON_REFUND_NOT_HELD: plan % has no hold', s.id; END IF;
  SELECT * INTO h FROM public.season_holds WHERE id = s.season_hold_id FOR UPDATE;
  IF NOT FOUND OR h.state <> 'refund_requested' THEN
    RAISE EXCEPTION 'SEASON_REFUND_BAD_STATE: hold is %', COALESCE(h.state, 'missing');
  END IF;

  UPDATE public.season_holds SET
    state = v_back,
    ready_at = CASE WHEN v_back = 'ready' THEN COALESCE(ready_at, now()) ELSE ready_at END,
    refund_requested_at = NULL,
    refund_reminded_at = NULL,
    updated_at = now()
  WHERE id = h.id;

  RETURN jsonb_build_object(
    'hold_id', h.id,
    'subscription_id', s.id,
    'customer_id', s.customer_id,
    'plan_name', s.plan_name,
    'held_meals', h.held_meals,
    'cash_refund_fils', h.cash_refund_fils,
    'credit_share_fils', h.credit_share_fils,
    'state', v_back
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.season_approve_refund(p_hold_id uuid, p_actor text, p_refundable_cap_fils integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s        public.subscriptions;
  h        public.season_holds;
  f        record;
  v_sub    uuid;
  v_cash   integer;
  v_credit integer;
BEGIN
  SELECT subscription_id INTO v_sub FROM public.season_holds WHERE id = p_hold_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_REFUND_NOT_FOUND'; END IF;
  SELECT * INTO s FROM public.subscriptions WHERE id = v_sub FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_REFUND_NOT_FOUND'; END IF;
  SELECT * INTO h FROM public.season_holds WHERE id = p_hold_id FOR UPDATE;
  IF h.state NOT IN ('refund_requested', 'refund_failed') THEN
    RAISE EXCEPTION 'SEASON_REFUND_BAD_STATE: hold is %', h.state;
  END IF;

  SELECT * INTO f FROM public._season_refund_facts(h, s);
  IF h.stripe_refund_id IS NOT NULL THEN
    -- Stripe already accepted a refund for this hold and only our bookkeeping
    -- failed: the amounts on the hold are what moved, so they stay as they are.
    v_cash := h.cash_refund_fils;
    v_credit := h.credit_share_fils;
  ELSE
    IF p_refundable_cap_fils IS NULL OR p_refundable_cap_fils < 0 THEN
      RAISE EXCEPTION 'SEASON_REFUND_BAD_INPUT: the Stripe cap is required';
    END IF;
    v_cash := LEAST(f.cash_fils, p_refundable_cap_fils);
    v_credit := f.credit_fils;
    IF v_cash <= 0 AND v_credit <= 0 THEN
      RAISE EXCEPTION 'SEASON_REFUND_NOTHING: nothing is left to refund on this payment';
    END IF;
  END IF;

  UPDATE public.season_holds SET
    state = 'refund_processing',
    cash_refund_fils = v_cash,
    credit_share_fils = v_credit,
    refund_decided_by = p_actor,
    refund_decline_reason = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE id = h.id;
  UPDATE public.orders SET refund_reason = 'season_hold' WHERE id = f.order_id;

  RETURN jsonb_build_object(
    'hold_id', h.id,
    'subscription_id', s.id,
    'customer_id', s.customer_id,
    'order_id', f.order_id,
    'plan_name', s.plan_name,
    'held_meals', h.held_meals,
    'payment_intent', f.payment_intent,
    'cash_refund_fils', v_cash,
    'credit_share_fils', v_credit,
    'stripe_refund_id', h.stripe_refund_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.season_finish_refund(p_hold_id uuid, p_stripe_refund_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s        public.subscriptions;
  h        public.season_holds;
  v_sub    uuid;
  v_credit uuid;
BEGIN
  SELECT subscription_id INTO v_sub FROM public.season_holds WHERE id = p_hold_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_REFUND_NOT_FOUND'; END IF;
  SELECT * INTO s FROM public.subscriptions WHERE id = v_sub FOR UPDATE;
  SELECT * INTO h FROM public.season_holds WHERE id = p_hold_id FOR UPDATE;
  IF h.state <> 'refund_processing' THEN
    RAISE EXCEPTION 'SEASON_REFUND_BAD_STATE: hold is %', h.state;
  END IF;
  IF h.cash_refund_fils > 0 AND COALESCE(p_stripe_refund_id, '') = '' THEN
    RAISE EXCEPTION 'SEASON_REFUND_BAD_INPUT: a cash refund needs its Stripe refund id';
  END IF;

  -- The credit share goes back to the wallet as its own row (spec §10.2).
  IF COALESCE(h.credit_share_fils, 0) > 0 AND h.credit_return_id IS NULL THEN
    INSERT INTO public.credits (customer_id, amount_aed, source, status, subscription_id)
    VALUES (h.customer_id, h.credit_share_fils::numeric / 100, 'season_refund_return', 'approved', s.id)
    RETURNING id INTO v_credit;
  ELSE
    v_credit := h.credit_return_id;
  END IF;

  -- The plan ends. The status guard (G2) only watches Active, but the flag is
  -- set anyway so a future guard on Ended treats this like a release.
  PERFORM set_config('dormers.season_release', 'on', true);
  UPDATE public.subscriptions SET status = 'Ended', planned_pause_start = NULL WHERE id = s.id;
  PERFORM set_config('dormers.season_release', '', true);

  UPDATE public.season_holds SET
    state = 'refunded',
    stripe_refund_id = COALESCE(NULLIF(p_stripe_refund_id, ''), stripe_refund_id),
    credit_return_id = v_credit,
    refunded_at = now(),
    last_error = NULL,
    updated_at = now()
  WHERE id = h.id;

  RETURN jsonb_build_object(
    'hold_id', h.id,
    'subscription_id', s.id,
    'customer_id', s.customer_id,
    'order_id', h.order_id,
    'plan_name', s.plan_name,
    'held_meals', h.held_meals,
    'cash_refund_fils', h.cash_refund_fils,
    'credit_share_fils', h.credit_share_fils,
    'credit_return_id', v_credit,
    'stripe_refund_id', COALESCE(NULLIF(p_stripe_refund_id, ''), h.stripe_refund_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.season_fail_refund(p_hold_id uuid, p_error text, p_stripe_refund_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h public.season_holds;
BEGIN
  SELECT * INTO h FROM public.season_holds WHERE id = p_hold_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_REFUND_NOT_FOUND'; END IF;
  IF h.state <> 'refund_processing' THEN
    RAISE EXCEPTION 'SEASON_REFUND_BAD_STATE: hold is %', h.state;
  END IF;
  UPDATE public.season_holds SET
    state = 'refund_failed',
    last_error = left(COALESCE(p_error, 'unknown error'), 500),
    stripe_refund_id = COALESCE(NULLIF(p_stripe_refund_id, ''), stripe_refund_id),
    updated_at = now()
  WHERE id = h.id;
  RETURN jsonb_build_object('hold_id', h.id, 'subscription_id', h.subscription_id, 'customer_id', h.customer_id, 'state', 'refund_failed');
END;
$$;

CREATE OR REPLACE FUNCTION public.season_decline_refund(p_hold_id uuid, p_actor text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s      public.subscriptions;
  h      public.season_holds;
  v_sub  uuid;
  v_back text := public._season_refund_back_state();
BEGIN
  IF length(btrim(COALESCE(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'SEASON_REFUND_BAD_INPUT: a decline needs a reason the customer will read';
  END IF;
  SELECT subscription_id INTO v_sub FROM public.season_holds WHERE id = p_hold_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_REFUND_NOT_FOUND'; END IF;
  SELECT * INTO s FROM public.subscriptions WHERE id = v_sub FOR UPDATE;
  SELECT * INTO h FROM public.season_holds WHERE id = p_hold_id FOR UPDATE;
  IF h.state <> 'refund_requested' THEN
    RAISE EXCEPTION 'SEASON_REFUND_BAD_STATE: hold is %', h.state;
  END IF;

  UPDATE public.season_holds SET
    state = v_back,
    ready_at = CASE WHEN v_back = 'ready' THEN COALESCE(ready_at, now()) ELSE ready_at END,
    refund_decided_by = p_actor,
    refund_decline_reason = left(btrim(p_reason), 300),
    refund_reminded_at = NULL,
    updated_at = now()
  WHERE id = h.id;

  RETURN jsonb_build_object(
    'hold_id', h.id,
    'subscription_id', s.id,
    'customer_id', s.customer_id,
    'plan_name', s.plan_name,
    'held_meals', h.held_meals,
    'cash_refund_fils', h.cash_refund_fils,
    'credit_share_fils', h.credit_share_fils,
    'state', v_back
  );
END;
$$;

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
  v_stuck    integer;  -- Plan D
  v_waiting  record;   -- Plan D
BEGIN
  SELECT * INTO r FROM public.intake_settings;
  IF NOT FOUND THEN  -- Plan D: the refund checks below run in every phase
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

  -- Plan D (spec G10): a refund Stripe may have taken but we never recorded.
  SELECT count(*), string_agg(id::text, ', ') INTO v_stuck, v_list
  FROM public.season_holds
  WHERE state = 'refund_processing' AND updated_at < now() - interval '30 minutes';
  IF v_stuck > 0 THEN
    v_breaches := v_breaches || 'refund_processing_stuck'::text;
    BEGIN
      PERFORM public.send_admin_whatsapp_alert(
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

  RETURN jsonb_build_object('checked', r.season_phase <> 'open' OR v_stuck > 0 OR v_breaches <> '{}', 'breaches', to_jsonb(v_breaches));
END;
$$;

REVOKE EXECUTE ON FUNCTION public._season_holds_protect_money() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._season_refund_facts(public.season_holds, public.subscriptions) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._season_refund_back_state() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_request_refund(uuid, uuid, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_cancel_refund_request(uuid, uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_approve_refund(uuid, text, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_finish_refund(uuid, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_fail_refund(uuid, text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_decline_refund(uuid, text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_invariants_tick() FROM public, anon, authenticated;

COMMIT;

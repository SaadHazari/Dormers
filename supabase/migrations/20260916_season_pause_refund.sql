-- ============================================================================
-- Season wind-down: a customer-paused plan can ask for a refund too.
--
-- Owner decision, 2026-09-16, reversing X4. X4 reasoned that a pause is the
-- customer's own choice, so the meals are not ours to buy back. During the
-- break that stops being true: the customer cannot resume even if they want
-- to, so the wait is our doing, not theirs. A pause carried into the break
-- can now ask for a refund on the same terms as a held plan, and the owner
-- still approves every one.
--
-- A cancelled or declined request goes back to where the hold came from:
-- paused_by_customer for a pause, held for a season hold, ready once the
-- season has reopened.
--
-- The notices also learn whether a refund is really on offer, so an email
-- never promises one the dashboard will not show (a staff plan, a test-mode
-- order, an order with no recorded money).
--
-- Every body was copied from the applied migrations (season_refunds,
-- season_notices); only the lines marked "Plan H" differ.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_pause_refund`. This file is the mirror.
-- ============================================================================

BEGIN;

-- Could this plan's money back a refund (D7, X5)? Used by the notices so an
-- email never offers a refund the dashboard will not show. The hold's own
-- check stays _season_refund_facts, which is what actually gates the money.
CREATE OR REPLACE FUNCTION public._season_refund_money_ok(p_subscription_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT public.expense_category_for_plan(s.plan_name) IS NULL
       AND o.stripe_payment_id IS NOT NULL
       AND COALESCE(o.stripe_session_id, '') NOT LIKE 'cs\_test\_%'
       AND o.amount_paid_fils IS NOT NULL
       AND o.credit_applied_fils IS NOT NULL
       AND COALESCE(o.meals_count, 0) > 0
       AND (o.amount_paid_fils + o.credit_applied_fils) > 0
    FROM public.subscriptions s
    JOIN LATERAL (
      SELECT * FROM public.orders o2 WHERE o2.subscription_id = s.id ORDER BY o2.created_at DESC LIMIT 1
    ) o ON true
    WHERE s.id = p_subscription_id
  ), false);
$$;

DROP FUNCTION IF EXISTS public._season_refund_back_state();

CREATE OR REPLACE FUNCTION public._season_refund_back_state(p_reason text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN (SELECT season_phase FROM public.intake_settings LIMIT 1) <> 'break' THEN 'ready'
    WHEN p_reason = 'customer_pause' THEN 'paused_by_customer'
    ELSE 'held'
  END;
$$;

CREATE OR REPLACE FUNCTION public._season_refund_facts(h public.season_holds, s public.subscriptions)
RETURNS TABLE(order_id uuid, payment_intent text, cash_fils integer, credit_fils integer)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  o public.orders;
BEGIN
  -- Plan H: a customer pause is refundable too. X4 said no, because a pause is
  -- the customer's own choice; the owner reversed it on 2026-09-16, because
  -- during the break that customer cannot resume even if they want to, and
  -- holding their money until we reopen is not a choice they made.
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
  IF h.state NOT IN ('held', 'ready', 'paused_by_customer') THEN  -- Plan H
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
  v_back text;  -- Plan H: set once the hold is read, from its own reason
BEGIN
  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id AND customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_REFUND_NOT_FOUND'; END IF;
  IF s.season_hold_id IS NULL THEN RAISE EXCEPTION 'SEASON_REFUND_NOT_HELD: plan % has no hold', s.id; END IF;
  SELECT * INTO h FROM public.season_holds WHERE id = s.season_hold_id FOR UPDATE;
  IF NOT FOUND OR h.state <> 'refund_requested' THEN
    RAISE EXCEPTION 'SEASON_REFUND_BAD_STATE: hold is %', COALESCE(h.state, 'missing');
  END IF;

  v_back := public._season_refund_back_state(h.reason);  -- Plan H

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
  v_back text;  -- Plan H: set once the hold is read, from its own reason
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

  v_back := public._season_refund_back_state(h.reason);  -- Plan H

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
        'offer_aed', COALESCE(public._season_credit_aed_for(h.customer_id), 0),
        'can_refund', public._season_refund_money_ok(h.subscription_id)))  -- Plan H
    THEN v_queued := v_queued + 1; END IF;
  END LOOP;
  RETURN v_queued;
END;
$$;

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
        'credit_aed', COALESCE(public._season_credit_aed_for(p.customer_id), 0),
        'can_refund', public._season_refund_money_ok(p.subscription_id)))  -- Plan H
    THEN v_queued := v_queued + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('queued', v_queued, 'moved', v_moved);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._season_refund_money_ok(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._season_refund_back_state(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._season_refund_facts(public.season_holds, public.subscriptions) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_request_refund(uuid, uuid, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_cancel_refund_request(uuid, uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_decline_refund(uuid, text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_queue_break_notices(timestamptz) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_queue_schedule_notices() FROM public, anon, authenticated;

COMMIT;

-- ============================================================================
-- Plan refunds, hardened after review (2026-09-16).
--
-- 1. A refunded plan stays refunded. Customers can write subscriptions.status
--    through the API (the dashboard's pause and skip use it), so a refunded
--    plan could be set back to Active and cook the meals that were paid back.
--    Now a guard trigger refuses any customer write to a refunded plan, refuses
--    anyone restarting it, never lets its meals grow, and keeps a plan whose
--    last dinner is tonight ending tonight even when another trigger
--    recomputes its end date (a closure, a pause).
-- 2. No wallet share on money Stripe already gave back: an order refunded by
--    hand (invoice_status Refunded or Partially Refunded), or one where Stripe
--    allows less than the card share, is refused and left to the owner.
-- 3. Try the refund again never changes the amount (the app now finds an
--    earlier Stripe refund by its metadata before making one), and also picks
--    up a refund left in processing for more than 10 minutes (a request that
--    died half way).
-- 4. refund_credit_notes.claimed_until, so two runs of the same credit note
--    never overlap.
--
-- Bodies copied from migration plan_refunds; only the lines marked
-- "hardening" differ. Applied live through the Management API as migration
-- `plan_refunds_hardening`. This file is the mirror.
-- ============================================================================

BEGIN;

ALTER TABLE public.refund_credit_notes ADD COLUMN IF NOT EXISTS claimed_until timestamptz;

CREATE OR REPLACE FUNCTION public._plan_refund_facts(s public.subscriptions)
RETURNS TABLE(order_id uuid, payment_intent text, refunded_meals integer, tonight_kept boolean, cash_fils integer, credit_fils integer)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  o          public.orders;
  v_today    date := public.ae_today();
  v_cutoff   boolean := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dubai')::time >= time '14:00';
  v_mpd      integer := COALESCE(s.meals_per_day, 1);
  v_left     integer;
  v_tonight  boolean;
  v_meals    integer;
BEGIN
  IF s.status NOT IN ('Active', 'Paused', 'Skipped', 'Scheduled') THEN
    RAISE EXCEPTION 'PLAN_REFUND_BAD_STATE: plan is %', s.status;
  END IF;
  IF s.season_hold_id IS NOT NULL THEN
    RAISE EXCEPTION 'PLAN_REFUND_SEASON_HOLD: plan % is kept for next semester', s.id;
  END IF;
  IF public.expense_category_for_plan(s.plan_name) IS NOT NULL THEN
    RAISE EXCEPTION 'PLAN_REFUND_NOT_OFFERED: % was not paid for', s.plan_name;
  END IF;
  SELECT * INTO o FROM public.orders WHERE subscription_id = s.id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_REFUND_NOT_OFFERED: plan % has no order', s.id;
  END IF;
  IF o.stripe_payment_id IS NULL OR COALESCE(o.stripe_session_id, '') LIKE 'cs\_test\_%' THEN
    RAISE EXCEPTION 'PLAN_REFUND_NOT_OFFERED: the order was not paid through a live Stripe payment';
  END IF;
  IF o.amount_paid_fils IS NULL OR o.credit_applied_fils IS NULL OR COALESCE(o.meals_count, 0) <= 0 THEN
    RAISE EXCEPTION 'PLAN_REFUND_NOT_OFFERED: the order has no recorded money';
  END IF;
  IF o.invoice_status IN ('Refunded', 'Partially Refunded') THEN  -- hardening
    RAISE EXCEPTION 'PLAN_REFUND_STRIPE_CHANGED: order % was already refunded by hand', o.id;  -- hardening
  END IF;  -- hardening

  v_left := GREATEST(0, s.total_meals - COALESCE(s.delivered_meals, 0) - COALESCE(s.credited_skip_days, 0) * v_mpd);
  v_tonight := v_cutoff AND public._plan_cooks_tonight(s, v_today);
  v_meals := LEAST(v_left - CASE WHEN v_tonight THEN LEAST(v_mpd, v_left) ELSE 0 END, o.meals_count);
  IF v_meals <= 0 THEN
    RAISE EXCEPTION 'PLAN_REFUND_NOTHING: no meals are left to refund';
  END IF;

  order_id       := o.id;
  payment_intent := o.stripe_payment_id;
  refunded_meals := v_meals;
  tonight_kept   := v_tonight;
  cash_fils      := floor(v_meals::numeric * o.amount_paid_fils / o.meals_count)::integer;
  credit_fils    := floor(v_meals::numeric * o.credit_applied_fils / o.meals_count)::integer;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.plan_refund_start(p_customer_id uuid, p_subscription_id uuid, p_refundable_cap_fils integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c      public.customers;
  s      public.subscriptions;
  f      record;
  v_id   uuid;
  v_mpd  integer;
  v_left integer;
BEGIN
  IF p_refundable_cap_fils IS NULL OR p_refundable_cap_fils < 0 THEN
    RAISE EXCEPTION 'PLAN_REFUND_BAD_INPUT: the Stripe cap is required';
  END IF;
  SELECT * INTO c FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_REFUND_NOT_FOUND'; END IF;
  IF c.refund_allowed_at IS NULL THEN
    RAISE EXCEPTION 'PLAN_REFUND_NOT_ALLOWED: the refund switch is off';
  END IF;
  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id AND customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_REFUND_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.plan_refunds WHERE subscription_id = s.id) THEN
    RAISE EXCEPTION 'PLAN_REFUND_ALREADY: plan % already has a refund', s.id;
  END IF;

  SELECT * INTO f FROM public._plan_refund_facts(s);
  -- hardening: Stripe allowing less than the card share means money already
  -- went back some other way; the wallet share would then be paid twice.
  IF p_refundable_cap_fils < f.cash_fils THEN
    RAISE EXCEPTION 'PLAN_REFUND_STRIPE_CHANGED: Stripe allows % of % fils', p_refundable_cap_fils, f.cash_fils;
  END IF;
  IF f.cash_fils <= 0 AND f.credit_fils <= 0 THEN
    RAISE EXCEPTION 'PLAN_REFUND_NOTHING: nothing is left to refund on this payment';
  END IF;

  INSERT INTO public.plan_refunds (subscription_id, customer_id, order_id, state, refunded_meals, tonight_kept, cash_refund_fils, credit_share_fils, allowed_by)
  VALUES (s.id, s.customer_id, f.order_id, 'processing', f.refunded_meals, f.tonight_kept, f.cash_fils, f.credit_fils, c.refund_allowed_by)
  RETURNING id INTO v_id;

  UPDATE public.orders SET refund_reason = 'plan_refund' WHERE id = f.order_id;
  UPDATE public.customers SET refund_allowed_at = NULL, refund_allowed_by = NULL WHERE id = c.id;

  v_mpd := COALESCE(s.meals_per_day, 1);
  v_left := GREATEST(0, s.total_meals - COALESCE(s.delivered_meals, 0) - COALESCE(s.credited_skip_days, 0) * v_mpd);
  IF f.tonight_kept THEN
    UPDATE public.subscriptions SET
      total_meals = COALESCE(delivered_meals, 0) + COALESCE(credited_skip_days, 0) * v_mpd + LEAST(v_mpd, v_left),
      end_date = public.ae_today(),
      planned_pause_start = NULL
    WHERE id = s.id;
  ELSE
    -- The guard trigger below keeps it Ended.
    UPDATE public.subscriptions SET status = 'Ended', planned_pause_start = NULL WHERE id = s.id;
  END IF;

  RETURN jsonb_build_object(
    'refund_id', v_id,
    'subscription_id', s.id,
    'customer_id', s.customer_id,
    'order_id', f.order_id,
    'plan_name', s.plan_name,
    'payment_intent', f.payment_intent,
    'refunded_meals', f.refunded_meals,
    'tonight_kept', f.tonight_kept,
    'cash_refund_fils', f.cash_fils,
    'credit_share_fils', f.credit_fils,
    'stripe_refund_id', NULL
  );
END;
$$;

-- hardening: the amount never changes on a retry, and a refund stuck in
-- processing for 10 minutes can be picked up. p_refundable_cap_fils is kept
-- for the call signature and no longer used.
CREATE OR REPLACE FUNCTION public.plan_refund_retry(p_refund_id uuid, p_refundable_cap_fils integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.plan_refunds;
  o public.orders;
BEGIN
  SELECT * INTO r FROM public.plan_refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_REFUND_NOT_FOUND'; END IF;
  IF NOT (r.state = 'failed' OR (r.state = 'processing' AND r.updated_at < now() - interval '10 minutes')) THEN
    RAISE EXCEPTION 'PLAN_REFUND_BAD_STATE: refund is %', r.state;
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = r.order_id;
  UPDATE public.plan_refunds SET state = 'processing', last_error = NULL, updated_at = now() WHERE id = r.id;
  RETURN jsonb_build_object(
    'refund_id', r.id,
    'subscription_id', r.subscription_id,
    'customer_id', r.customer_id,
    'order_id', r.order_id,
    'plan_name', (SELECT plan_name FROM public.subscriptions WHERE id = r.subscription_id),
    'payment_intent', o.stripe_payment_id,
    'refunded_meals', r.refunded_meals,
    'tonight_kept', r.tonight_kept,
    'cash_refund_fils', r.cash_refund_fils,
    'credit_share_fils', r.credit_share_fils,
    'stripe_refund_id', r.stripe_refund_id
  );
END;
$$;

-- hardening: a refunded plan stays refunded. Runs after the other BEFORE
-- UPDATE triggers (names sort alphabetically), so it has the last word on
-- end_date.
CREATE OR REPLACE FUNCTION public._subscriptions_plan_refund_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.plan_refunds;
BEGIN
  SELECT * INTO r FROM public.plan_refunds WHERE subscription_id = OLD.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- SECURITY DEFINER changes current_user, so the caller is read from the
  -- API request: a customer's own token, never the service role or a cron.
  IF COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'PLAN_REFUNDED: plan % was refunded and cannot be changed', OLD.id;
  END IF;
  IF OLD.status = 'Ended' AND NEW.status IS DISTINCT FROM 'Ended' THEN
    RAISE EXCEPTION 'PLAN_REFUNDED: plan % was refunded and cannot restart', OLD.id;
  END IF;
  IF NEW.total_meals > OLD.total_meals THEN
    NEW.total_meals := OLD.total_meals;
  END IF;
  IF r.tonight_kept THEN
    NEW.end_date := LEAST(NEW.end_date, (r.created_at AT TIME ZONE 'Asia/Dubai')::date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_zz_plan_refund_guard ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_zz_plan_refund_guard
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._subscriptions_plan_refund_guard();

REVOKE ALL ON FUNCTION public._subscriptions_plan_refund_guard() FROM public, anon, authenticated;

COMMIT;

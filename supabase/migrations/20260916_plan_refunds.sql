-- ============================================================================
-- Plan refunds: the owner lets one customer refund the rest of their plan.
--
-- Owner decision, 2026-09-16. The customer page in the admin panel has an
-- "Allow a refund" switch. While it is on, the customer sees "Refund my
-- remaining meals" on My Plan. Pressing it refunds the meals they have left
-- and ends the plan straight away; the switch turns itself off, so it covers
-- one refund.
--
-- The money follows the season refund (spec §10.3): meals left x what the
-- order paid per meal, never more than Stripe still allows; the share paid
-- with wallet credit goes back to the wallet. Only a paid plan on a live
-- Stripe payment qualifies (D7, X5), and a plan kept for next semester uses
-- the season refund instead.
--
-- Tonight's dinner: before the 2 PM cutoff it is refunded with the rest.
-- After 2 PM the kitchen is already cooking it, so it is left out of the
-- refund and delivered; the plan is cut to that one dinner (total_meals) and
-- its end date set to today, so the delivery tick delivers it and the status
-- tick ends the plan that night.
--
-- plan_refunds: one row per refunded plan (processing, failed, refunded).
-- refund_credit_notes: the Zoho credit note for any cash refund, plan or
-- season, so the customer gets the PDF and a failed one can be sent again.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `plan_refunds`. This file is the mirror.
-- ============================================================================

BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS refund_allowed_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_allowed_by text;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_refund_reason_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_refund_reason_check
  CHECK (refund_reason = ANY (ARRAY['season_hold'::text, 'plan_refund'::text]));

CREATE TABLE IF NOT EXISTS public.plan_refunds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   uuid NOT NULL UNIQUE REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id          uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  state             text NOT NULL CHECK (state IN ('processing', 'failed', 'refunded')),
  refunded_meals    integer NOT NULL CHECK (refunded_meals > 0),
  tonight_kept      boolean NOT NULL DEFAULT false,
  cash_refund_fils  integer NOT NULL CHECK (cash_refund_fils >= 0),
  credit_share_fils integer NOT NULL CHECK (credit_share_fils >= 0),
  allowed_by        text,
  stripe_refund_id  text,
  credit_return_id  uuid REFERENCES public.credits(id) ON DELETE SET NULL,
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  refunded_at       timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_refunds_customer_idx ON public.plan_refunds (customer_id);
ALTER TABLE public.plan_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_refunds FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.refund_credit_notes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                   text NOT NULL CHECK (kind IN ('plan_refund', 'season_refund')),
  refund_id              uuid NOT NULL,
  order_id               uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id            uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  refunded_meals         integer NOT NULL CHECK (refunded_meals > 0),
  cash_fils              integer NOT NULL CHECK (cash_fils > 0),
  stripe_refund_id       text NOT NULL,
  zoho_creditnote_id     text,
  zoho_creditnote_number text,
  zoho_refund_id         text,
  emailed_at             timestamptz,
  attempts               integer NOT NULL DEFAULT 0,
  last_error             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_credit_notes_one_per_refund UNIQUE (kind, refund_id)
);
CREATE INDEX IF NOT EXISTS refund_credit_notes_customer_idx ON public.refund_credit_notes (customer_id);
ALTER TABLE public.refund_credit_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.refund_credit_notes FROM anon, authenticated;

-- Would the kitchen cook this plan tonight if nothing changed? Mirrors the
-- WHERE of subscription_delivery_tick, for a caller who already knows it is
-- past the 2 PM cutoff and before the tick has run.
CREATE OR REPLACE FUNCTION public._plan_cooks_tonight(s public.subscriptions, p_today date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_phase text;
  v_wrap  date;
  v_close date;
BEGIN
  IF s.status <> 'Active' OR s.season_hold_id IS NOT NULL THEN RETURN false; END IF;
  IF COALESCE(s.delivered_meals, 0) >= s.total_meals - COALESCE(s.credited_skip_days, 0) * COALESCE(s.meals_per_day, 1) THEN RETURN false; END IF;
  IF NOT public.is_delivery_day(p_today, s.week_type) OR public.is_company_closure(p_today) THEN RETURN false; END IF;
  IF s.resume_cutoff_date IS NOT NULL AND s.resume_cutoff_date >= p_today THEN RETURN false; END IF;
  IF s.last_delivery_tick_date IS NOT NULL AND s.last_delivery_tick_date >= p_today THEN RETURN false; END IF;
  SELECT season_phase, wrap_up_day, close_day INTO v_phase, v_wrap, v_close FROM public.intake_settings;
  IF v_phase = 'break' THEN RETURN false; END IF;
  IF v_phase = 'winding_down' AND v_wrap IS NOT NULL THEN
    IF p_today > GREATEST(COALESCE(v_close, v_wrap), v_wrap) THEN RETURN false; END IF;
    IF p_today > v_wrap THEN
      RETURN public._season_buffer_cooks(p_today, v_wrap, v_close, s.week_type, s.skipped_dates, s.season_buffer_grants);
    END IF;
  END IF;
  RETURN true;
END;
$$;

-- What a refund of this plan would pay right now. Raises PLAN_REFUND_* when
-- the plan does not qualify. Shared by the offer (read) and the start (write).
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

  v_left := GREATEST(0, s.total_meals - COALESCE(s.delivered_meals, 0) - COALESCE(s.credited_skip_days, 0) * v_mpd);
  v_tonight := v_cutoff AND public._plan_cooks_tonight(s, v_today);
  -- Bonus and gifted meals were never paid for, so the refund stops at what the order bought.
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

-- The offer My Plan shows: null when the switch is off or the plan does not qualify.
CREATE OR REPLACE FUNCTION public.plan_refund_offer(p_customer_id uuid, p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.subscriptions;
  f record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND refund_allowed_at IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id AND customer_id = p_customer_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.plan_refunds WHERE subscription_id = s.id) THEN RETURN NULL; END IF;
  BEGIN
    SELECT * INTO f FROM public._plan_refund_facts(s);
  EXCEPTION WHEN raise_exception THEN
    RETURN NULL;
  END;
  RETURN jsonb_build_object(
    'order_id', f.order_id,
    'payment_intent', f.payment_intent,
    'refunded_meals', f.refunded_meals,
    'tonight_kept', f.tonight_kept,
    'cash_fils', f.cash_fils,
    'credit_fils', f.credit_fils
  );
END;
$$;

-- The customer presses the button: recheck everything under lock, end the
-- plan, turn the switch off, and leave a processing row for the app to pay.
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
  v_cash integer;
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
  v_cash := LEAST(f.cash_fils, p_refundable_cap_fils);
  IF v_cash <= 0 AND f.credit_fils <= 0 THEN
    RAISE EXCEPTION 'PLAN_REFUND_NOTHING: nothing is left to refund on this payment';
  END IF;

  INSERT INTO public.plan_refunds (subscription_id, customer_id, order_id, state, refunded_meals, tonight_kept, cash_refund_fils, credit_share_fils, allowed_by)
  VALUES (s.id, s.customer_id, f.order_id, 'processing', f.refunded_meals, f.tonight_kept, v_cash, f.credit_fils, c.refund_allowed_by)
  RETURNING id INTO v_id;

  UPDATE public.orders SET refund_reason = 'plan_refund' WHERE id = f.order_id;
  UPDATE public.customers SET refund_allowed_at = NULL, refund_allowed_by = NULL WHERE id = c.id;

  IF f.tonight_kept THEN
    -- Tonight's dinner is the last one: the delivery tick cooks it, the status tick ends the plan.
    v_mpd := COALESCE(s.meals_per_day, 1);
    v_left := GREATEST(0, s.total_meals - COALESCE(s.delivered_meals, 0) - COALESCE(s.credited_skip_days, 0) * v_mpd);
    UPDATE public.subscriptions SET
      total_meals = COALESCE(delivered_meals, 0) + COALESCE(credited_skip_days, 0) * v_mpd + LEAST(v_mpd, v_left),
      end_date = public.ae_today(),
      planned_pause_start = NULL
    WHERE id = s.id;
  ELSE
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
    'cash_refund_fils', v_cash,
    'credit_share_fils', f.credit_fils,
    'stripe_refund_id', NULL
  );
END;
$$;

-- The owner presses Try the refund again on a failed one.
CREATE OR REPLACE FUNCTION public.plan_refund_retry(p_refund_id uuid, p_refundable_cap_fils integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      public.plan_refunds;
  o      public.orders;
  v_cash integer;
BEGIN
  SELECT * INTO r FROM public.plan_refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_REFUND_NOT_FOUND'; END IF;
  IF r.state <> 'failed' THEN RAISE EXCEPTION 'PLAN_REFUND_BAD_STATE: refund is %', r.state; END IF;
  SELECT * INTO o FROM public.orders WHERE id = r.order_id;
  IF r.stripe_refund_id IS NOT NULL THEN
    v_cash := r.cash_refund_fils;  -- Stripe already paid; only the bookkeeping is left.
  ELSE
    IF p_refundable_cap_fils IS NULL OR p_refundable_cap_fils < 0 THEN
      RAISE EXCEPTION 'PLAN_REFUND_BAD_INPUT: the Stripe cap is required';
    END IF;
    v_cash := LEAST(r.cash_refund_fils, p_refundable_cap_fils);
  END IF;
  UPDATE public.plan_refunds SET state = 'processing', cash_refund_fils = v_cash, last_error = NULL, updated_at = now() WHERE id = r.id;
  RETURN jsonb_build_object(
    'refund_id', r.id,
    'subscription_id', r.subscription_id,
    'customer_id', r.customer_id,
    'order_id', r.order_id,
    'plan_name', (SELECT plan_name FROM public.subscriptions WHERE id = r.subscription_id),
    'payment_intent', o.stripe_payment_id,
    'refunded_meals', r.refunded_meals,
    'tonight_kept', r.tonight_kept,
    'cash_refund_fils', v_cash,
    'credit_share_fils', r.credit_share_fils,
    'stripe_refund_id', r.stripe_refund_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.plan_refund_fail(p_refund_id uuid, p_error text, p_stripe_refund_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.plan_refunds SET
    state = 'failed',
    last_error = left(COALESCE(p_error, 'unknown error'), 500),
    stripe_refund_id = COALESCE(NULLIF(p_stripe_refund_id, ''), stripe_refund_id),
    updated_at = now()
  WHERE id = p_refund_id AND state = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_REFUND_BAD_STATE: refund % is not processing', p_refund_id; END IF;
END;
$$;

-- Stripe accepted the money: the wallet share goes back and the row is done.
CREATE OR REPLACE FUNCTION public.plan_refund_finish(p_refund_id uuid, p_stripe_refund_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        public.plan_refunds;
  v_credit uuid;
BEGIN
  SELECT * INTO r FROM public.plan_refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_REFUND_NOT_FOUND'; END IF;
  IF r.state <> 'processing' THEN RAISE EXCEPTION 'PLAN_REFUND_BAD_STATE: refund is %', r.state; END IF;
  IF r.cash_refund_fils > 0 AND COALESCE(p_stripe_refund_id, '') = '' THEN
    RAISE EXCEPTION 'PLAN_REFUND_BAD_INPUT: a cash refund needs its Stripe refund id';
  END IF;

  IF r.credit_share_fils > 0 AND r.credit_return_id IS NULL THEN
    INSERT INTO public.credits (customer_id, amount_aed, source, status, subscription_id)
    VALUES (r.customer_id, r.credit_share_fils::numeric / 100, 'plan_refund_return', 'approved', r.subscription_id)
    RETURNING id INTO v_credit;
  ELSE
    v_credit := r.credit_return_id;
  END IF;

  UPDATE public.plan_refunds SET
    state = 'refunded',
    stripe_refund_id = COALESCE(NULLIF(p_stripe_refund_id, ''), stripe_refund_id),
    credit_return_id = v_credit,
    refunded_at = now(),
    last_error = NULL,
    updated_at = now()
  WHERE id = r.id;

  RETURN jsonb_build_object(
    'refund_id', r.id,
    'subscription_id', r.subscription_id,
    'customer_id', r.customer_id,
    'order_id', r.order_id,
    'refunded_meals', r.refunded_meals,
    'cash_refund_fils', r.cash_refund_fils,
    'credit_share_fils', r.credit_share_fils,
    'credit_return_id', v_credit,
    'stripe_refund_id', COALESCE(NULLIF(p_stripe_refund_id, ''), r.stripe_refund_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public._plan_cooks_tonight(public.subscriptions, date) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._plan_refund_facts(public.subscriptions) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_refund_offer(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_refund_start(uuid, uuid, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_refund_retry(uuid, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_refund_fail(uuid, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_refund_finish(uuid, text) FROM public, anon, authenticated;

COMMIT;

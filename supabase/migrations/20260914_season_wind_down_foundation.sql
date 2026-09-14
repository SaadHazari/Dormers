-- ============================================================================
-- Season wind-down foundation (spec docs/superpowers/specs/2026-09-14-season-wind-down-design.md
-- §5.1, §5.2, §10.1, §10.2, §13.1). Additive only: no function, trigger or
-- cron change, and no existing column is altered. Behaviour is unchanged
-- while no wrap-up day is set.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_wind_down_foundation`. This file is the mirror.
-- ============================================================================

BEGIN;

-- ── intake_settings: the season ─────────────────────────────────────────────
ALTER TABLE public.intake_settings
  ADD COLUMN IF NOT EXISTS season_phase text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS wrap_up_day date,
  ADD COLUMN IF NOT EXISTS buffer_delivery_days smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS close_day date,
  ADD COLUMN IF NOT EXISTS sales_stopped_at timestamptz,
  ADD COLUMN IF NOT EXISTS break_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS kitchen_daily_cost_aed numeric NOT NULL DEFAULT 500;

ALTER TABLE public.intake_settings
  DROP CONSTRAINT IF EXISTS intake_settings_season_phase_check,
  ADD CONSTRAINT intake_settings_season_phase_check
    CHECK (season_phase IN ('open', 'winding_down', 'break')),
  DROP CONSTRAINT IF EXISTS intake_settings_buffer_check,
  ADD CONSTRAINT intake_settings_buffer_check
    CHECK (buffer_delivery_days BETWEEN 0 AND 3),
  DROP CONSTRAINT IF EXISTS intake_settings_kitchen_cost_check,
  ADD CONSTRAINT intake_settings_kitchen_cost_check
    CHECK (kitchen_daily_cost_aed >= 0),
  DROP CONSTRAINT IF EXISTS intake_settings_season_dates_check,
  ADD CONSTRAINT intake_settings_season_dates_check
    CHECK (
      (wrap_up_day IS NULL AND close_day IS NULL)
      OR (wrap_up_day IS NOT NULL AND close_day IS NOT NULL AND close_day >= wrap_up_day)
    );

COMMENT ON COLUMN public.intake_settings.season_phase IS
  'open | winding_down | break. Written only by the season_* transition functions.';
COMMENT ON COLUMN public.intake_settings.wrap_up_day IS
  'W: last day of regular deliveries and the last day a new plan may deliver. Kept through the break.';
COMMENT ON COLUMN public.intake_settings.close_day IS
  'K: W moved forward by buffer_delivery_days Monday-to-Saturday days. The break starts the night after K.';

-- Take over a sales pause that predates the season model (spec §5.2): it is a
-- wind-down with sales stopped and no wrap-up day yet. The break never starts
-- until a wrap-up day is set, which is exactly today's behaviour.
UPDATE public.intake_settings
SET season_phase = 'winding_down',
    sales_stopped_at = COALESCE(paused_at, now()),
    updated_at = now()
WHERE paused = true
  AND season_phase = 'open';

-- ── season_holds ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.season_holds (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id       uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  customer_id           uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id              uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  cycle_started_at      timestamptz NOT NULL,
  reason                text NOT NULL CHECK (reason IN ('season', 'customer_pause')),
  state                 text NOT NULL DEFAULT 'held' CHECK (state IN (
                          'held', 'paused_by_customer', 'ready', 'refund_requested',
                          'refund_processing', 'refunded', 'refund_failed', 'released')),
  held_meals            integer NOT NULL CHECK (held_meals >= 0),
  meal_value_fils       integer CHECK (meal_value_fils >= 0),
  cash_refund_fils      integer CHECK (cash_refund_fils >= 0),
  credit_share_fils     integer CHECK (credit_share_fils >= 0),
  waitlist_credit_id    uuid REFERENCES public.credits(id) ON DELETE SET NULL,
  refund_requested_at   timestamptz,
  refund_decided_by     text,
  refund_decline_reason text,
  stripe_refund_id      text,
  credit_return_id      uuid REFERENCES public.credits(id) ON DELETE SET NULL,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  ready_at              timestamptz,
  released_at           timestamptz,
  refunded_at           timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT season_holds_one_per_plan_per_season UNIQUE (subscription_id, cycle_started_at)
);

CREATE INDEX IF NOT EXISTS season_holds_customer_idx ON public.season_holds (customer_id);
CREATE INDEX IF NOT EXISTS season_holds_open_state_idx ON public.season_holds (state)
  WHERE state NOT IN ('released', 'refunded');

ALTER TABLE public.season_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.season_holds FROM anon, authenticated;
GRANT SELECT ON public.season_holds TO authenticated;
GRANT ALL ON public.season_holds TO service_role;
DROP POLICY IF EXISTS season_holds_own_read ON public.season_holds;
CREATE POLICY season_holds_own_read ON public.season_holds
  FOR SELECT TO authenticated USING (customer_id = auth.uid());

COMMENT ON TABLE public.season_holds IS
  'One row per plan per season whose meals were still owed when the break started (spec §6.3). Money trail for keep / refund.';

-- ── subscriptions ───────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS credited_skip_days smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS season_buffer_grants smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS season_hold_id uuid REFERENCES public.season_holds(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_credited_skip_days_check,
  ADD CONSTRAINT subscriptions_credited_skip_days_check CHECK (credited_skip_days >= 0),
  DROP CONSTRAINT IF EXISTS subscriptions_season_buffer_grants_check,
  ADD CONSTRAINT subscriptions_season_buffer_grants_check CHECK (season_buffer_grants >= 0);

COMMENT ON COLUMN public.subscriptions.credited_skip_days IS
  'Skips turned into wallet credit instead of a make-up day (spec §7.2). Never moves end_date.';
COMMENT ON COLUMN public.subscriptions.season_buffer_grants IS
  'Make-up meals allowed to cook on a buffer day between the wrap-up day and the close day (spec §6.2).';

-- ── credits ─────────────────────────────────────────────────────────────────
ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meal_date date;

CREATE UNIQUE INDEX IF NOT EXISTS credits_one_season_skip_per_meal
  ON public.credits (subscription_id, meal_date)
  WHERE source = 'season_skip';

-- ── orders ──────────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS amount_paid_fils integer CHECK (amount_paid_fils >= 0),
  ADD COLUMN IF NOT EXISTS credit_applied_fils integer CHECK (credit_applied_fils >= 0),
  ADD COLUMN IF NOT EXISTS refund_reason text CHECK (refund_reason IN ('season_hold'));

COMMENT ON COLUMN public.orders.amount_paid_fils IS 'Stripe amount_total in fils (0 for a credit-only order). Spec §10.1.';
COMMENT ON COLUMN public.orders.credit_applied_fils IS 'Wallet credit applied to this order in fils. Spec §10.1.';

COMMIT;

-- ============================================================================
-- Extend customer_notifications.kind CHECK with two delivery notification kinds.
--
-- New kinds:
--   - delivery_confirmed      — sent to customer when delivery triple-match passes
--   - delivery_unconfirmed_8pm — 8PM failsafe alert when delivery is unverified
--
-- This migration ONLY extends the CHECK constraint. It does NOT touch the
-- dispatcher function — the CASE branches for these kinds will be added in
-- Phase 6 when the Meta WhatsApp templates are ready. The existing dispatcher
-- safely logs a warning and increments skipped_no_template_count for kinds
-- that have no Vault secret yet.
--
-- Previous version: v6 (20260613) with 16 kinds.
-- This version: v7 — adds delivery_confirmed + delivery_unconfirmed_8pm = 18 total.
-- ============================================================================

ALTER TABLE public.customer_notifications
  DROP CONSTRAINT customer_notifications_kind_check;

ALTER TABLE public.customer_notifications
  ADD CONSTRAINT customer_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'meal_skipped_confirm'::text,
    'meal_resumed_confirm'::text,
    'meal_skip_scheduled_confirm'::text,
    'meal_skip_cancelled_confirm'::text,
    'plan_paused_confirm'::text,
    'plan_pause_scheduled_confirm'::text,
    'plan_pause_cancelled_confirm'::text,
    'plan_resumed_confirm'::text,
    'plan_start_date_changed_confirm'::text,
    'payment_order_confirmed'::text,
    'welcome_meal_confirmed'::text,
    'subscription_renew_nudge'::text,
    'meals_gifted_confirm'::text,
    'referral_converted'::text,
    'refund_processed'::text,
    'subscription_ended'::text,
    'delivery_confirmed'::text,
    'delivery_unconfirmed_8pm'::text
  ]));

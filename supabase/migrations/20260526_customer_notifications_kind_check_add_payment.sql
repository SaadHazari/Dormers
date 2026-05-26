-- ============================================================================
-- Extend customer_notifications.kind CHECK to include payment_order_confirmed.
--
-- The original constraint was created when only skip/pause/resume kinds
-- existed. The dispatcher v4 migration added the per-kind component
-- branching for payment_order_confirmed but didn't update this CHECK,
-- so inserts via the TS helper would fail at write time.
-- ============================================================================

ALTER TABLE public.customer_notifications
  DROP CONSTRAINT IF EXISTS customer_notifications_kind_check;

ALTER TABLE public.customer_notifications
  ADD CONSTRAINT customer_notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'meal_skipped_confirm'::text,
    'meal_resumed_confirm'::text,
    'plan_paused_confirm'::text,
    'plan_pause_scheduled_confirm'::text,
    'plan_resumed_confirm'::text,
    'payment_order_confirmed'::text
  ]));

-- ============================================================================
-- Extend customer_notifications.kind CHECK to include four new action confirms.
--
-- Symmetric "receipt" messages for the user-initiated subscription actions
-- that had no WhatsApp confirmation:
--   • meal_skip_scheduled_confirm    — schedule a future skip
--   • meal_skip_cancelled_confirm    — un-skip a previously scheduled date
--   • plan_pause_cancelled_confirm   — cancel a planned future pause
--   • plan_start_date_changed_confirm — reschedule a Scheduled plan's start
--
-- These match the existing pattern: queueCustomerNotification inserts a row
-- here, dispatcher cron renders + sends via Meta. Dispatcher v7 (next
-- migration) adds the per-kind CASE branches that render the components.
-- ============================================================================

ALTER TABLE public.customer_notifications
  DROP CONSTRAINT IF EXISTS customer_notifications_kind_check;

ALTER TABLE public.customer_notifications
  ADD CONSTRAINT customer_notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'meal_skipped_confirm'::text,
    'meal_resumed_confirm'::text,
    'meal_skip_scheduled_confirm'::text,
    'meal_skip_cancelled_confirm'::text,
    'plan_paused_confirm'::text,
    'plan_pause_scheduled_confirm'::text,
    'plan_pause_cancelled_confirm'::text,
    'plan_resumed_confirm'::text,
    'plan_start_date_changed_confirm'::text,
    'payment_order_confirmed'::text
  ]));

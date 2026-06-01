-- ============================================================================
-- Extend customer_notifications.kind CHECK to include the renewal nudge.
--
-- New kind:
--   • subscription_renew_nudge — T-3 days outbound reminder for customers
--     whose Active subscription is ending soon and who have NO Scheduled
--     follow-on queued. Companion email goes through ZeptoMail; WhatsApp
--     goes through the existing dispatcher CASE (added in a follow-up
--     migration once the Meta template is approved).
--
-- Inert by itself — the kind is only WRITABLE after this migration, but
-- nothing inserts rows yet. The dispatcher CASE + cron schedule land in
-- a later migration once the Meta template name + locale are confirmed in
-- Business Manager. Until then, any row with this kind that somehow lands
-- in the table would be skipped by the dispatcher's existing
-- skipped_no_template_count path (no vault entry yet).
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
    'payment_order_confirmed'::text,
    'welcome_meal_confirmed'::text,
    'subscription_renew_nudge'::text
  ]));

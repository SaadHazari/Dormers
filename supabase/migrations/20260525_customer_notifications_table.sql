-- ============================================================================
-- Customer WhatsApp notifications queue.
--
-- One row per outbound WhatsApp message sent to a customer (skip-meal
-- confirms, pause confirms, resume confirms, etc). Server actions insert
-- rows; a 5-minute pg_cron job pulls due rows and dispatches them via
-- pg_net to Meta's Cloud API.
--
-- Why a queue table instead of firing inline from server actions:
--   • Resume messages must be scheduled hours/days in the future
--   • Failed Meta API calls auto-retry on the next cron pass
--   • Single audit log for ops: who got what, when, did it land
--   • Idempotent — sent_at marker prevents duplicate sends
--
-- The dispatcher function + cron schedule + Meta payload structure live
-- in a follow-up migration so this one stays a pure schema change.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,

  -- Notification kind drives which Meta template is used + which payload
  -- fields are expected. Check constraint locks the allowed set; adding
  -- a new kind = update this list + add the dispatcher branch + register
  -- the template name in vault.
  kind            text NOT NULL CHECK (kind IN (
    'meal_skipped_confirm',
    'meal_resumed_confirm',
    'plan_paused_confirm',
    'plan_pause_scheduled_confirm',
    'plan_resumed_confirm'
  )),

  -- When the message should be sent. Cron pulls rows where this is in
  -- the past AND sent_at IS NULL. For "immediate" notifications, set
  -- this to now() at insert time.
  scheduled_for   timestamp with time zone NOT NULL,

  -- Free-form per-kind payload. The dispatcher reads specific keys
  -- depending on the kind — e.g. meal_skipped_confirm needs
  -- {"meal_date": "2026-05-25"}. Keeps the schema flexible without
  -- needing migrations for every new template parameter.
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Idempotency marker. Once set, the cron skips this row.
  sent_at         timestamp with time zone,

  -- Meta's message ID from the send response — used by ops to look up
  -- delivery status in Meta Business Manager. Special value
  -- 'skipped:unverified' = customer's whatsapp_verified was false, no
  -- send was attempted but row is closed out so we don't loop on it.
  wamid           text,

  created_at      timestamp with time zone NOT NULL DEFAULT now()
);

-- Cron's primary filter — partial index on pending rows keeps it tiny
-- (only un-sent rows occupy index space; sent ones drop out).
CREATE INDEX IF NOT EXISTS customer_notifications_pending_idx
  ON public.customer_notifications (scheduled_for)
  WHERE sent_at IS NULL;

-- Per-customer history lookup (for an ops or customer-facing audit view
-- of "what WhatsApps have we sent this person").
CREATE INDEX IF NOT EXISTS customer_notifications_customer_id_idx
  ON public.customer_notifications (customer_id, created_at DESC);

-- RLS: customer_notifications carries no customer secrets, but the
-- dispatcher uses service-role so we don't need permissive policies.
-- Enable RLS without policies = default-deny for everyone except
-- service_role. Customers can't read their own notification log
-- directly through the API; ops would build an admin view.
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.customer_notifications IS
  'Outbound WhatsApp message queue. Server actions insert; 5-min pg_cron dispatches via pg_net + Meta Cloud API; sent_at marker prevents duplicates.';

COMMIT;

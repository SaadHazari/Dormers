-- ============================================================================
-- Stagger the Zoho receipt email 2 minutes after the club@ welcome email.
--
-- The two emails arriving simultaneously felt spammy to the customer.
-- Architecture:
--   • Webhook now fires WhatsApp + ZeptoMail synchronously, skips Zoho.
--   • Webhook stamps orders.zoho_scheduled_for = NOW() + 2 minutes.
--   • A new pg_cron runs every minute looking for orders past their
--     scheduled time with no Zoho marker yet, and fires the Zoho call
--     via the internal retry route.
--   • The hourly retry cron continues to handle failed retries
--     (5-attempt budget with admin alert).
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS zoho_scheduled_for timestamptz;

-- Partial index for the every-minute dispatch cron — rows still owing a
-- Zoho send AND past their scheduled time. The query is fast even at
-- millions of orders because everything else is excluded.
CREATE INDEX IF NOT EXISTS orders_zoho_due_idx
  ON public.orders (zoho_scheduled_for)
  WHERE zoho_invoice_id IS NULL
    AND zoho_scheduled_for IS NOT NULL
    AND post_payment_admin_alerted_at IS NULL;

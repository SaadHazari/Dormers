-- ============================================================================
-- Post-payment fan-out idempotency markers on orders.
--
-- The Stripe webhook now fans out to three side-effect channels after the
-- existing webhook_completed_at checkpoint: WhatsApp confirmation, ZeptoMail
-- receipt, and Zoho Books invoice creation. Each marker below lets the
-- webhook (and the hourly retry cron) skip channels that already succeeded
-- and only re-attempt the ones that failed, without re-sending anything.
--
-- post_payment_errors is an append-only audit log so the admin can see what
-- broke and why on any given order — and so the retry cron can count
-- attempts per channel and bail to a manual alert after the budget.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS zoho_invoice_id text,
  ADD COLUMN IF NOT EXISTS zoho_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS post_payment_errors jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Partial index: rows the retry cron needs to scan for unfinished channels.
-- Only orders that completed the webhook checkpoint are candidates; orders
-- still mid-webhook are handled by the webhook itself, not the retry cron.
CREATE INDEX IF NOT EXISTS orders_post_payment_pending_idx
  ON public.orders (webhook_completed_at)
  WHERE webhook_completed_at IS NOT NULL
    AND (whatsapp_sent_at IS NULL
         OR email_sent_at IS NULL
         OR zoho_invoice_id IS NULL);

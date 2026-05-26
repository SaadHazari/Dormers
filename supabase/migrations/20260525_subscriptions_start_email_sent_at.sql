-- ============================================================================
-- subscriptions.start_email_sent_at — idempotency marker for the day-1
-- "Today's the day" email. The 9 AM AE cron uses this to find subscriptions
-- starting today that haven't been emailed yet, and the email sender stamps
-- it after a successful ZeptoMail send.
-- ============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS start_email_sent_at timestamptz;

-- Partial index for the daily cron query — only subs that still owe an
-- email. Tiny table at query-time even at scale.
CREATE INDEX IF NOT EXISTS subscriptions_start_day_due_idx
  ON public.subscriptions (start_date)
  WHERE start_email_sent_at IS NULL;

-- ============================================================================
-- dispatch_start_day_emails_tick — daily 9 AM AE cron that fires the day-1
-- "Today's the day" email for every subscription whose start_date is today.
--
-- Why 9 AM AE: gives the customer a full day of anticipation before the
-- 7-8 PM delivery window. Fires once per sub via the
-- subscriptions.start_email_sent_at marker; if the cron misses a day
-- (rare — pg_cron is reliable), the sub never gets the email retroactively,
-- which is intentional ("today's the day" makes no sense yesterday).
--
-- Sender: club@dormers.ae via ZeptoMail (handled by the internal route).
-- Migrated from the previous Make.com scenario.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_start_day_emails_tick()
RETURNS TABLE(dispatched_count int, skipped_no_config int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  dispatched_total  int := 0;
  no_config_total   int := 0;
  sub_row           RECORD;
  base_url          text;
  retry_secret      text;
  http_req_id       bigint;
BEGIN
  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'dispatch_start_day_emails_tick: required vault secrets missing';
    dispatched_count := 0;
    skipped_no_config := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  -- start_date is stored as a DATE (no time). At 5 AM UTC (9 AM AE) the UTC
  -- date matches the AE date, so CURRENT_DATE works without timezone math.
  FOR sub_row IN
    SELECT id
    FROM public.subscriptions
    WHERE start_date = CURRENT_DATE
      AND start_email_sent_at IS NULL
    LIMIT 200
  LOOP
    SELECT net.http_post(
      url     := base_url || '/api/internal/start-day-email-send',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || retry_secret,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object('subscription_id', sub_row.id::text)
    ) INTO http_req_id;

    dispatched_total := dispatched_total + 1;
  END LOOP;

  dispatched_count  := dispatched_total;
  skipped_no_config := no_config_total;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.dispatch_start_day_emails_tick() IS
  'Daily 9 AM AE (5 UTC) dispatcher for the day-1 "Today is the Day" email. Finds subscriptions starting today with no start_email_sent_at marker and POSTs the internal start-day-email-send route per sub.';

-- 9 AM AE = 5:00 UTC (Dubai is UTC+4 year-round, no DST).
DO $$
BEGIN
  PERFORM cron.unschedule('dispatch_start_day_emails_9am_ae');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'dispatch_start_day_emails_9am_ae',
  '0 5 * * *',
  $cron$ SELECT public.dispatch_start_day_emails_tick(); $cron$
);

COMMIT;

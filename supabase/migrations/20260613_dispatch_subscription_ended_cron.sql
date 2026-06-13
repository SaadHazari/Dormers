-- ============================================================================
-- dispatch_subscription_ended_tick — daily 20:15 UTC (00:15 AE) cron that
-- fires the subscription-ended WhatsApp + email for every subscription that
-- subscription_status_tick (00:05 AE) just flipped to Ended.
--
-- Runs 10 minutes after the status tick so the Ended transition is committed.
--
-- Selection:
--   • status = 'Ended'
--   • end_date = yesterday or today AE (just ended, not old ones)
--   • Paid plans only (same ILIKE filter as renew nudge)
--   • No existing subscription_ended notification in the last 7 days (dedup)
--
-- Dispatches via net.http_post to /api/internal/subscription-ended-send,
-- which handles the full fanout (WhatsApp queue + email).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_subscription_ended_tick()
RETURNS TABLE(dispatched_count int, skipped_no_config int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  dispatched_total int := 0;
  no_config_total  int := 0;
  sub_row          RECORD;
  base_url         text;
  retry_secret     text;
  http_req_id      bigint;
BEGIN
  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'dispatch_subscription_ended_tick: required vault secrets missing';
    dispatched_count := 0;
    skipped_no_config := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR sub_row IN
    SELECT s.id
    FROM public.subscriptions s
    WHERE s.status = 'Ended'
      AND s.end_date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE
      AND (
        s.plan_name ILIKE '%Monthly Max%'
        OR s.plan_name ILIKE '%Monthly Premium%'
        OR s.plan_name ILIKE '%Weekly Flex%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_notifications cn
        WHERE cn.customer_id = s.customer_id
          AND cn.kind = 'subscription_ended'
          AND cn.scheduled_for > NOW() - INTERVAL '7 days'
      )
    LIMIT 200
  LOOP
    SELECT net.http_post(
      url     := base_url || '/api/internal/subscription-ended-send',
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

COMMENT ON FUNCTION public.dispatch_subscription_ended_tick() IS
  'Daily 00:15 AE (20:15 UTC) dispatcher for subscription-ended notifications. Finds paid subs that just transitioned to Ended (end_date yesterday or today) with no prior notification in the past 7 days, then POSTs the internal subscription-ended-send route per sub.';

-- 20:15 UTC = 00:15 AE (Dubai UTC+4). Runs 10 minutes after
-- subscription_status_tick (20:05 UTC / 00:05 AE) so Ended transitions
-- are committed before we query them.
DO $$
BEGIN
  PERFORM cron.unschedule('dispatch_subscription_ended_0015_ae');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'dispatch_subscription_ended_0015_ae',
  '15 20 * * *',
  $cron$ SELECT public.dispatch_subscription_ended_tick(); $cron$
);

COMMIT;

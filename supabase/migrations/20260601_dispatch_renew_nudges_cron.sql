-- ============================================================================
-- dispatch_renew_nudges_tick — daily 14:00 UTC (18:00 AE) cron that fires the
-- T-3 days renewal nudge for every Active subscription whose end_date is 2-3
-- days out AND who has no Scheduled follow-on queued.
--
-- Per the locked plan (.claude/plans/we-still-do-not-optimized-pascal.md):
--   • Audience: Active paid plans only (not Paused, not Trial, not Scheduled).
--   • Cadence: single fire at T-3 days. 7-day dedup prevents repeat fires
--     if end_date slides via skips/pauses.
--   • Selection excludes customers with an already-queued follow-on
--     (Scheduled status, future start_date) — they're already renewed.
--   • Selection excludes anyone already nudged in the last 7 days.
--
-- This function ONLY enqueues + POSTs to /api/internal/renew-nudge-send.
-- The route loads the sub + customer, computes the recap, and fans WhatsApp
-- + email via runRenewNudgeForCustomer. Idempotency anchor is the
-- customer_notifications row inserted by queueCustomerNotification inside
-- the route — next tick's 7-day dedup window catches it.
--
-- Sender: club@dormers.ae via ZeptoMail + Meta WhatsApp Cloud.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_renew_nudges_tick()
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
    RAISE WARNING 'dispatch_renew_nudges_tick: required vault secrets missing';
    dispatched_count := 0;
    skipped_no_config := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  -- plan_name is free-form text (carries emoji prefixes in some rows) so
  -- we substring-match the paid SKUs. Trials + Welcome Meal are status
  -- 'Active' too but have their own renew flows; do not nudge them here.
  FOR sub_row IN
    SELECT s.id
    FROM public.subscriptions s
    WHERE s.status = 'Active'
      AND (
        s.plan_name ILIKE '%Monthly Max%'
        OR s.plan_name ILIKE '%Monthly Premium%'
        OR s.plan_name ILIKE '%Weekly Flex%'
      )
      AND s.end_date BETWEEN CURRENT_DATE + 2 AND CURRENT_DATE + 3
      AND NOT EXISTS (
        SELECT 1 FROM public.subscriptions q
        WHERE q.customer_id = s.customer_id
          AND q.status = 'Scheduled'
          AND q.start_date > CURRENT_DATE
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_notifications cn
        WHERE cn.customer_id = s.customer_id
          AND cn.kind = 'subscription_renew_nudge'
          AND cn.scheduled_for > NOW() - INTERVAL '7 days'
      )
    LIMIT 200
  LOOP
    SELECT net.http_post(
      url     := base_url || '/api/internal/renew-nudge-send',
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

COMMENT ON FUNCTION public.dispatch_renew_nudges_tick() IS
  'Daily 18:00 AE (14:00 UTC) dispatcher for the T-3 days renewal nudge. Finds Active subs ending in 2-3 days with no Scheduled follow-on and no nudge in the past 7 days, then POSTs the internal renew-nudge-send route per sub.';

-- 14:00 UTC = 18:00 AE (Dubai UTC+4, no DST). Runs after the AE morning
-- delivery + status_tick chain so subscription state is settled.
DO $$
BEGIN
  PERFORM cron.unschedule('dispatch_renew_nudges_18_ae');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'dispatch_renew_nudges_18_ae',
  '0 14 * * *',
  $cron$ SELECT public.dispatch_renew_nudges_tick(); $cron$
);

COMMIT;

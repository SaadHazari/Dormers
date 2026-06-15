-- ============================================================================
-- Notification dispatch auto-retry — closes the silent-failure gap.
--
-- Problem: dispatch_customer_notifications_tick uses pg_net.http_post (async)
-- and stamps sent_at immediately. When Meta returns a non-2xx, the reconciler
-- records the failure but the row stays "sent" — dedup queries in downstream
-- crons (renew-nudge, subscription-ended) see the row and skip the customer
-- permanently. The notification is silently lost.
--
-- Fix: the reconciler now auto-retries failed dispatches up to 3 times with
-- exponential backoff. On each failure:
--   1. Increment dispatch_attempts
--   2. Reset sent_at = NULL, meta_request_id = NULL, meta_status_code = NULL
--   3. Push scheduled_for forward by (attempts × 10 minutes)
-- The dispatcher's WHERE scheduled_for <= now() AND sent_at IS NULL naturally
-- re-fires the retry after the backoff window.
--
-- After 3 failed attempts the row stays permanently marked (sent_at set,
-- meta_status_code = non-2xx) and the existing alert_failed_notifications_tick
-- pings the admin.
--
-- Also hardens the dedup queries in dispatch_renew_nudges_tick and
-- dispatch_subscription_ended_tick to exclude rows with confirmed non-2xx
-- status codes, as a belt-and-suspenders guard.
-- ============================================================================

BEGIN;

-- ── 1. Add dispatch_attempts column ──────────────────────────────────────────

ALTER TABLE public.customer_notifications
  ADD COLUMN IF NOT EXISTS dispatch_attempts int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.customer_notifications.dispatch_attempts IS
  'Number of times the dispatcher has attempted to send this notification via Meta. Reconciler auto-retries up to 3 times on non-2xx.';

-- ── 2. Reconciler v2: auto-retry on failure ──────────────────────────────────
-- Must drop first because the return type changed (added retry_count column).

DROP FUNCTION IF EXISTS public.reconcile_notification_meta_responses_tick();

CREATE FUNCTION public.reconcile_notification_meta_responses_tick()
RETURNS TABLE(reconciled_count int, success_count int, failure_count int, retry_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  total_reconciled int := 0;
  total_success    int := 0;
  total_failure    int := 0;
  total_retry      int := 0;
  rec              RECORD;
  parsed_wamid     text;
  max_attempts     int := 3;
BEGIN
  FOR rec IN
    SELECT n.id, n.meta_request_id, n.dispatch_attempts, n.scheduled_for,
           r.status_code, r.content
    FROM public.customer_notifications n
    JOIN net._http_response r ON r.id = n.meta_request_id
    WHERE n.meta_request_id IS NOT NULL
      AND n.meta_status_code IS NULL
      AND n.sent_at > now() - interval '6 hours'
    LIMIT 500
  LOOP
    IF rec.status_code BETWEEN 200 AND 299 THEN
      -- Success: record status + extract wamid
      parsed_wamid := NULL;
      BEGIN
        parsed_wamid := (rec.content::jsonb -> 'messages' -> 0 ->> 'id');
      EXCEPTION WHEN OTHERS THEN
        parsed_wamid := NULL;
      END;

      UPDATE public.customer_notifications
         SET meta_status_code = rec.status_code,
             wamid = COALESCE(parsed_wamid, wamid)
       WHERE id = rec.id;

      total_success := total_success + 1;
    ELSE
      -- Failure: retry if under the cap, otherwise mark as permanently failed
      IF rec.dispatch_attempts < max_attempts THEN
        UPDATE public.customer_notifications
           SET sent_at = NULL,
               meta_request_id = NULL,
               meta_status_code = NULL,
               dispatch_attempts = rec.dispatch_attempts + 1,
               -- Backoff: 10min × attempt number from the original scheduled time
               scheduled_for = rec.scheduled_for + ((rec.dispatch_attempts + 1) * interval '10 minutes')
         WHERE id = rec.id;

        total_retry := total_retry + 1;
      ELSE
        -- Exhausted retries — mark permanently failed for the alerter
        UPDATE public.customer_notifications
           SET meta_status_code = rec.status_code
         WHERE id = rec.id;

        total_failure := total_failure + 1;
      END IF;
    END IF;

    total_reconciled := total_reconciled + 1;
  END LOOP;

  reconciled_count := total_reconciled;
  success_count := total_success;
  failure_count := total_failure;
  retry_count := total_retry;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.reconcile_notification_meta_responses_tick() IS
  'v2: auto-retries failed dispatches up to 3 times with 10min×N backoff. Joins customer_notifications.meta_request_id to net._http_response to back-fill meta_status_code + wamid on success, or reset for retry on failure.';

-- ── 3. Harden renew-nudge cron dedup to exclude confirmed failures ───────────

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
          -- Only treat as "already nudged" if the send succeeded or is
          -- still in-flight (NULL = not yet reconciled). Confirmed failures
          -- (non-2xx after max retries) should not block a fresh attempt.
          AND (cn.meta_status_code IS NULL OR cn.meta_status_code BETWEEN 200 AND 299)
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
  'v2: failure-aware dedup. Daily 18:00 AE dispatcher for T-3 renewal nudge. Excludes subs with a successful or in-flight nudge in 7 days, but allows re-dispatch when prior attempts permanently failed (non-2xx after max retries).';

-- ── 4. Harden subscription-ended cron dedup to exclude confirmed failures ────

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
          AND (cn.meta_status_code IS NULL OR cn.meta_status_code BETWEEN 200 AND 299)
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
  'v2: failure-aware dedup. Daily 00:15 AE dispatcher for subscription-ended notifications. Confirmed-failed prior attempts no longer block fresh dispatch.';

COMMIT;

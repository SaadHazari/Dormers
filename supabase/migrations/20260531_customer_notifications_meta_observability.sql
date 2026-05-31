-- ============================================================================
-- Customer notifications — Meta response observability.
--
-- The dispatcher today fires `pg_net.http_post` and immediately stamps
-- sent_at = now(), with no read-back from Meta. The Saif WhatsApp regression
-- (template name not in language) lived undetected for 5 days because of
-- exactly this — failures looked indistinguishable from successes.
--
-- This migration:
--   1. Adds `meta_request_id`, `meta_status_code`, `meta_error_alerted_at`
--      columns to customer_notifications (wamid already existed; we now
--      back-fill it on success).
--   2. Bumps the dispatcher to v7 — stores the pg_net request_id alongside
--      sent_at so we can correlate later. Behaviour-equivalent to v6
--      otherwise.
--   3. Adds `reconcile_notification_meta_responses_tick()` — runs every
--      5 min, joins pending rows to net._http_response, writes back the
--      HTTP status code AND extracts the wamid from successful 200 bodies.
--   4. Adds `alert_failed_notifications_tick()` — runs every 30 min,
--      pings the admin once per (kind) for any rows still NOT 2xx that
--      haven't been alerted yet. The kind-level dedupe (vs row-level)
--      means a broken template that affects 100 sends produces ONE alert,
--      not a hundred.
-- ============================================================================

BEGIN;

ALTER TABLE public.customer_notifications
  ADD COLUMN IF NOT EXISTS meta_request_id      bigint,
  ADD COLUMN IF NOT EXISTS meta_status_code     int,
  ADD COLUMN IF NOT EXISTS meta_error_alerted_at timestamptz;

COMMENT ON COLUMN public.customer_notifications.meta_request_id IS
  'pg_net request_id from the http_post. Used to correlate with net._http_response in the reconciler cron.';
COMMENT ON COLUMN public.customer_notifications.meta_status_code IS
  'HTTP status from Meta, back-filled by reconcile_notification_meta_responses_tick. NULL until the reconciler runs.';
COMMENT ON COLUMN public.customer_notifications.meta_error_alerted_at IS
  'Set when alert_failed_notifications_tick pings the admin about a row. Prevents re-alerting.';

CREATE INDEX IF NOT EXISTS idx_notif_meta_pending
  ON public.customer_notifications (meta_request_id)
  WHERE meta_request_id IS NOT NULL AND meta_status_code IS NULL;

-- ── Dispatcher v7: stamp meta_request_id alongside sent_at ──────────────────
CREATE OR REPLACE FUNCTION public.dispatch_customer_notifications_tick()
RETURNS TABLE(sent_count int, skipped_unverified_count int, skipped_no_template_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  sent_total          int := 0;
  unverified_total    int := 0;
  no_template_total   int := 0;
  notif_row           RECORD;
  whatsapp_token      text;
  phone_number_id     text;
  template_name       text;
  template_lang       text;
  first_name          text;
  to_phone            text;
  meta_url            text;
  meta_payload        jsonb;
  components          jsonb;
  meal_date_str       text;
  start_date_str      text;
  plan_name_str       text;
  total_aed_str       text;
  http_req_id         bigint;
BEGIN
  SELECT decrypted_secret INTO whatsapp_token
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_access_token' LIMIT 1;
  SELECT decrypted_secret INTO phone_number_id
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_phone_number_id' LIMIT 1;

  IF whatsapp_token IS NULL OR phone_number_id IS NULL THEN
    RAISE WARNING 'dispatch_customer_notifications_tick: shared Meta secrets missing';
    sent_count := 0;
    skipped_unverified_count := 0;
    skipped_no_template_count := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  meta_url := format('https://graph.facebook.com/v22.0/%s/messages', phone_number_id);

  FOR notif_row IN
    SELECT n.id AS notif_id, n.customer_id, n.kind, n.payload,
           c.whatsapp_number, c.whatsapp_verified, c.name AS customer_name
    FROM public.customer_notifications n
    JOIN public.customers c ON c.id = n.customer_id
    WHERE n.scheduled_for <= now() AND n.sent_at IS NULL
    ORDER BY n.scheduled_for ASC
    LIMIT 100
    FOR UPDATE OF n SKIP LOCKED
  LOOP
    IF notif_row.whatsapp_number IS NULL OR notif_row.whatsapp_verified IS NOT TRUE THEN
      UPDATE public.customer_notifications
         SET sent_at = now(), wamid = 'skipped:unverified'
       WHERE id = notif_row.notif_id;
      unverified_total := unverified_total + 1;
      CONTINUE;
    END IF;

    template_name := NULL;
    SELECT decrypted_secret INTO template_name
      FROM vault.decrypted_secrets
      WHERE name = 'tpl_' || notif_row.kind LIMIT 1;
    IF template_name IS NULL THEN
      RAISE WARNING 'dispatch_customer_notifications_tick: no template for kind=%', notif_row.kind;
      no_template_total := no_template_total + 1;
      CONTINUE;
    END IF;

    template_lang := CASE notif_row.kind
      WHEN 'meal_resumed_confirm'      THEN 'en_AE'
      WHEN 'payment_order_confirmed'   THEN 'en_US'
      ELSE 'en'
    END;

    first_name := COALESCE(NULLIF(split_part(notif_row.customer_name, ' ', 1), ''), 'there');
    to_phone := regexp_replace(notif_row.whatsapp_number, '^\+', '');

    meal_date_str := NULL;
    IF notif_row.payload ? 'meal_date' THEN
      meal_date_str := to_char((notif_row.payload ->> 'meal_date')::date, 'FMDDth FMMonth');
    END IF;
    start_date_str := NULL;
    IF notif_row.payload ? 'start_date' THEN
      start_date_str := to_char((notif_row.payload ->> 'start_date')::date, 'FMDDth FMMonth');
    END IF;
    plan_name_str := NULLIF(notif_row.payload ->> 'plan_name', '');
    total_aed_str := NULLIF(notif_row.payload ->> 'total_aed', '');

    components := CASE notif_row.kind
      WHEN 'meal_skipped_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', meal_date_str))))
      WHEN 'payment_order_confirmed' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', 'AED ' || total_aed_str),
            jsonb_build_object('type', 'text', 'text', plan_name_str))))
      WHEN 'meal_resumed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))
      WHEN 'plan_paused_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))
      WHEN 'plan_pause_scheduled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'start_date', 'text', start_date_str))))
      WHEN 'plan_resumed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))
    END;

    meta_payload := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'to', to_phone,
      'type', 'template',
      'template', jsonb_build_object(
        'name', template_name,
        'language', jsonb_build_object('code', template_lang),
        'components', components
      )
    );

    SELECT net.http_post(
      url := meta_url,
      headers := jsonb_build_object('Authorization', 'Bearer ' || whatsapp_token, 'Content-Type', 'application/json'),
      body := meta_payload
    ) INTO http_req_id;

    UPDATE public.customer_notifications
       SET sent_at = now(),
           meta_request_id = http_req_id
     WHERE id = notif_row.notif_id;
    sent_total := sent_total + 1;
  END LOOP;

  sent_count := sent_total;
  skipped_unverified_count := unverified_total;
  skipped_no_template_count := no_template_total;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.dispatch_customer_notifications_tick() IS
  'v7: stores pg_net request_id alongside sent_at so the reconciler cron can back-fill Meta status + wamid.';

-- ── Reconciler: backfill meta_status_code + wamid from net._http_response ────
CREATE OR REPLACE FUNCTION public.reconcile_notification_meta_responses_tick()
RETURNS TABLE(reconciled_count int, success_count int, failure_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  total_reconciled int := 0;
  total_success    int := 0;
  total_failure    int := 0;
  rec              RECORD;
  parsed_wamid     text;
BEGIN
  FOR rec IN
    SELECT n.id, n.meta_request_id, r.status_code, r.content
    FROM public.customer_notifications n
    JOIN net._http_response r ON r.id = n.meta_request_id
    WHERE n.meta_request_id IS NOT NULL
      AND n.meta_status_code IS NULL
      AND n.sent_at > now() - interval '6 hours'
    LIMIT 500
  LOOP
    parsed_wamid := NULL;
    IF rec.status_code BETWEEN 200 AND 299 THEN
      BEGIN
        parsed_wamid := (rec.content::jsonb -> 'messages' -> 0 ->> 'id');
      EXCEPTION WHEN OTHERS THEN
        parsed_wamid := NULL;
      END;
      total_success := total_success + 1;
    ELSE
      total_failure := total_failure + 1;
    END IF;

    UPDATE public.customer_notifications
       SET meta_status_code = rec.status_code,
           wamid = COALESCE(parsed_wamid, wamid)
     WHERE id = rec.id;

    total_reconciled := total_reconciled + 1;
  END LOOP;

  reconciled_count := total_reconciled;
  success_count := total_success;
  failure_count := total_failure;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.reconcile_notification_meta_responses_tick() IS
  'Every-5-min reconciler. Joins customer_notifications.meta_request_id to net._http_response to back-fill meta_status_code + wamid.';

-- ── Failure alerter: ping admin on non-2xx, kind-day deduped ────────────────
CREATE OR REPLACE FUNCTION public.alert_failed_notifications_tick()
RETURNS TABLE(alerted_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  total_alerted int := 0;
  failed        RECORD;
  alert_msg     text;
  http_req_id   bigint;
BEGIN
  -- One representative row per (kind, meta_status_code) bucket per 24h window.
  -- Avoids spamming the admin number when a template regression breaks
  -- every send of a kind.
  FOR failed IN
    SELECT DISTINCT ON (n.kind, n.meta_status_code)
           n.id,
           n.kind,
           n.meta_status_code,
           COUNT(*) OVER (PARTITION BY n.kind, n.meta_status_code) AS sibling_count
    FROM public.customer_notifications n
    WHERE n.meta_status_code IS NOT NULL
      AND n.meta_status_code NOT BETWEEN 200 AND 299
      AND n.meta_error_alerted_at IS NULL
      AND n.sent_at > now() - interval '24 hours'
    ORDER BY n.kind, n.meta_status_code, n.sent_at DESC
    LIMIT 20
  LOOP
    alert_msg := format(
      'WhatsApp dispatcher: Meta rejected %s send(s) of kind=%s with HTTP %s in the last 24h. ' ||
      'Latest row id=%s — check customer_notifications for context, then net._http_response for Meta''s reason.',
      failed.sibling_count, failed.kind, failed.meta_status_code, failed.id
    );

    SELECT public.send_admin_whatsapp_alert(alert_msg, failed.kind) INTO http_req_id;

    -- Mark every still-unalerted row in this bucket so we don't re-fire
    -- for the same regression on the next tick.
    UPDATE public.customer_notifications
       SET meta_error_alerted_at = now()
     WHERE kind = failed.kind
       AND meta_status_code = failed.meta_status_code
       AND meta_error_alerted_at IS NULL
       AND sent_at > now() - interval '24 hours';

    total_alerted := total_alerted + 1;
  END LOOP;

  alerted_count := total_alerted;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.alert_failed_notifications_tick() IS
  'Every-30-min cron. Pings admin once per (kind, status_code) bucket per 24h window when Meta rejects a notification send.';

-- ── Schedule the two new crons ──────────────────────────────────────────────
DO $$ BEGIN PERFORM cron.unschedule('reconcile_notification_meta_responses_5min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'reconcile_notification_meta_responses_5min',
  '*/5 * * * *',
  $cron$ SELECT public.reconcile_notification_meta_responses_tick(); $cron$
);

DO $$ BEGIN PERFORM cron.unschedule('alert_failed_notifications_30min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'alert_failed_notifications_30min',
  '20,50 * * * *',
  $cron$ SELECT public.alert_failed_notifications_tick(); $cron$
);

COMMIT;

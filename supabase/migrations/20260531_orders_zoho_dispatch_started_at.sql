-- ============================================================================
-- Zoho dispatch in-flight guard.
--
-- The every-minute dispatch_zoho_due_tick and the hourly
-- retry_post_payment_fanout_tick both pick up orders with
-- `zoho_invoice_id IS NULL` and POST to /api/internal/post-payment-retry.
-- The route is fast on the happy path, but `createAndSendPaidInvoice` can
-- take 30–60s on a slow day (contact lookup → contact create → invoice
-- create → payment record → PDF fetch → upload → email send, all
-- synchronous round-trips to Zoho).
--
-- If a dispatch takes longer than the cron interval, the next tick sees
-- the same row (zoho_invoice_id still null) and dispatches again. Two
-- parallel calls to the route both pass the `runPostPaymentFanout` marker
-- read, both call Zoho, and the customer ends up with two contacts +
-- two invoices in Zoho.
--
-- This migration adds `orders.zoho_dispatch_started_at` — a soft lock the
-- crons CAS-set BEFORE the http_post. If another tick already claimed it
-- within the last 5 minutes, we skip this row. Stuck calls auto-release
-- after 5 min so a hung route doesn't lock the order forever.
-- ============================================================================

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS zoho_dispatch_started_at timestamptz;

COMMENT ON COLUMN public.orders.zoho_dispatch_started_at IS
  'Soft lock set by Zoho-dispatching crons before invoking the retry route. CAS-claimed under a 5-min staleness window so a hung dispatch auto-releases. Prevents double-invoicing if Zoho is slow and two cron ticks overlap.';

-- ── Update dispatch_zoho_due_tick to CAS-claim before http_post ──────────────
CREATE OR REPLACE FUNCTION public.dispatch_zoho_due_tick()
RETURNS TABLE(dispatched_count int, skipped_no_config int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  dispatched_total  int := 0;
  no_config_total   int := 0;
  order_row         RECORD;
  base_url          text;
  retry_secret      text;
  claimed           uuid;
  http_req_id       bigint;
BEGIN
  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'dispatch_zoho_due_tick: required vault secrets missing';
    dispatched_count := 0;
    skipped_no_config := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR order_row IN
    SELECT id
    FROM public.orders
    WHERE zoho_scheduled_for IS NOT NULL
      AND zoho_scheduled_for <= now()
      AND zoho_invoice_id IS NULL
      AND post_payment_admin_alerted_at IS NULL
      AND (zoho_dispatch_started_at IS NULL
           OR zoho_dispatch_started_at < now() - interval '5 minutes')
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(post_payment_errors, '[]'::jsonb)) AS e
        WHERE e->>'channel' = 'zoho'
      )
    ORDER BY zoho_scheduled_for ASC
    LIMIT 50
  LOOP
    -- CAS-claim: only proceed if no other tick has touched this row in the
    -- last 5 minutes. Two simultaneous ticks racing on the same row: only
    -- one's UPDATE returns a row.
    UPDATE public.orders
       SET zoho_dispatch_started_at = now()
     WHERE id = order_row.id
       AND (zoho_dispatch_started_at IS NULL
            OR zoho_dispatch_started_at < now() - interval '5 minutes')
       AND zoho_invoice_id IS NULL
    RETURNING id INTO claimed;

    IF claimed IS NULL THEN
      CONTINUE;
    END IF;

    SELECT net.http_post(
      url     := base_url || '/api/internal/post-payment-retry',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || retry_secret,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object('order_id', order_row.id::text)
    ) INTO http_req_id;

    dispatched_total := dispatched_total + 1;
  END LOOP;

  dispatched_count  := dispatched_total;
  skipped_no_config := no_config_total;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.dispatch_zoho_due_tick() IS
  'Every-minute Zoho dispatcher with CAS-claim on zoho_dispatch_started_at. Prevents double-invoicing when a Zoho call exceeds the 1-minute cron interval.';

-- ── Update retry_post_payment_fanout_tick: same in-flight guard for Zoho ─────
CREATE OR REPLACE FUNCTION public.retry_post_payment_fanout_tick()
RETURNS TABLE(retried_count int, alerted_count int, skipped_no_config int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  retried_total      int := 0;
  alerted_total      int := 0;
  no_config_total    int := 0;
  order_row          RECORD;
  attempts_whatsapp  int;
  attempts_email     int;
  attempts_zoho      int;
  max_attempts       int;
  base_url           text;
  retry_secret       text;
  whatsapp_token     text;
  phone_number_id    text;
  alert_template     text;
  admin_phone        text;
  meta_url           text;
  meta_payload       jsonb;
  channels_failed    text[];
  err_obj            jsonb;
  alert_summary      text;
  claimed            uuid;
  http_req_id        bigint;
BEGIN
  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;
  SELECT decrypted_secret INTO whatsapp_token
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_access_token' LIMIT 1;
  SELECT decrypted_secret INTO phone_number_id
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_phone_number_id' LIMIT 1;
  SELECT decrypted_secret INTO alert_template
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_admin_alert_template_name' LIMIT 1;
  SELECT decrypted_secret INTO admin_phone
    FROM vault.decrypted_secrets WHERE name = 'admin_alert_phone_e164' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'retry_post_payment_fanout_tick: required vault secrets missing';
    no_config_total := 1;
    retried_count := 0;
    alerted_count := 0;
    skipped_no_config := no_config_total;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR order_row IN
    SELECT
      id,
      whatsapp_sent_at,
      email_sent_at,
      zoho_invoice_id,
      post_payment_errors,
      post_payment_admin_alerted_at,
      zoho_dispatch_started_at
    FROM public.orders
    WHERE webhook_completed_at IS NOT NULL
      AND zoho_scheduled_for IS NOT NULL
      AND post_payment_admin_alerted_at IS NULL
      AND (whatsapp_sent_at IS NULL
           OR email_sent_at IS NULL
           OR zoho_invoice_id IS NULL)
    ORDER BY webhook_completed_at ASC
    LIMIT 50
  LOOP
    attempts_whatsapp := 0;
    attempts_email := 0;
    attempts_zoho := 0;
    IF order_row.post_payment_errors IS NOT NULL THEN
      FOR err_obj IN SELECT jsonb_array_elements(order_row.post_payment_errors)
      LOOP
        IF err_obj ->> 'channel' = 'whatsapp' THEN
          attempts_whatsapp := attempts_whatsapp + 1;
        ELSIF err_obj ->> 'channel' = 'email' THEN
          attempts_email := attempts_email + 1;
        ELSIF err_obj ->> 'channel' = 'zoho' THEN
          attempts_zoho := attempts_zoho + 1;
        END IF;
      END LOOP;
    END IF;

    max_attempts := GREATEST(
      CASE WHEN order_row.whatsapp_sent_at IS NULL THEN attempts_whatsapp ELSE 0 END,
      CASE WHEN order_row.email_sent_at    IS NULL THEN attempts_email    ELSE 0 END,
      CASE WHEN order_row.zoho_invoice_id  IS NULL THEN attempts_zoho     ELSE 0 END
    );

    IF max_attempts >= 5 THEN
      IF whatsapp_token IS NULL OR phone_number_id IS NULL
         OR alert_template IS NULL OR admin_phone IS NULL THEN
        RAISE WARNING 'retry_post_payment_fanout_tick: admin alert config missing for order %', order_row.id;
        CONTINUE;
      END IF;

      channels_failed := ARRAY[]::text[];
      IF order_row.whatsapp_sent_at IS NULL THEN
        channels_failed := array_append(channels_failed, format('WhatsApp (%s tries)', attempts_whatsapp));
      END IF;
      IF order_row.email_sent_at IS NULL THEN
        channels_failed := array_append(channels_failed, format('email (%s tries)', attempts_email));
      END IF;
      IF order_row.zoho_invoice_id IS NULL THEN
        channels_failed := array_append(channels_failed, format('Zoho invoice (%s tries)', attempts_zoho));
      END IF;

      alert_summary := format(
        'Post-payment fan-out broken on order %s. Failed channels: %s. Check post_payment_errors for the error trail.',
        order_row.id,
        array_to_string(channels_failed, ', ')
      );

      meta_url := format('https://graph.facebook.com/v22.0/%s/messages', phone_number_id);
      meta_payload := jsonb_build_object(
        'messaging_product', 'whatsapp',
        'to', regexp_replace(admin_phone, '^\+', ''),
        'type', 'template',
        'template', jsonb_build_object(
          'name', alert_template,
          'language', jsonb_build_object('code', 'en'),
          'components', jsonb_build_array(
            jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
              jsonb_build_object('type', 'text', 'parameter_name', 'escalation', 'text', alert_summary)
            )),
            jsonb_build_object('type', 'button', 'sub_type', 'url', 'index', '0',
              'parameters', jsonb_build_array(
                jsonb_build_object('type', 'text', 'text', order_row.id::text)
              )
            )
          )
        )
      );

      SELECT net.http_post(
        url     := meta_url,
        headers := jsonb_build_object('Authorization', 'Bearer ' || whatsapp_token, 'Content-Type', 'application/json'),
        body    := meta_payload
      ) INTO http_req_id;

      UPDATE public.orders
         SET post_payment_admin_alerted_at = now()
       WHERE id = order_row.id;

      alerted_total := alerted_total + 1;
    ELSE
      -- CAS-claim the Zoho-dispatch slot if Zoho is one of the channels we'd
      -- retry. If Zoho is already done OR another tick claimed within the
      -- last 5 minutes, the retry skips the http_post — preventing
      -- double-invoicing when this cron overlaps with dispatch_zoho_due.
      IF order_row.zoho_invoice_id IS NULL
         AND order_row.zoho_dispatch_started_at IS NOT NULL
         AND order_row.zoho_dispatch_started_at > now() - interval '5 minutes' THEN
        CONTINUE;
      END IF;

      UPDATE public.orders
         SET zoho_dispatch_started_at = now()
       WHERE id = order_row.id
         AND (zoho_dispatch_started_at IS NULL
              OR zoho_dispatch_started_at < now() - interval '5 minutes')
      RETURNING id INTO claimed;

      IF claimed IS NULL AND order_row.zoho_invoice_id IS NULL THEN
        -- Lost the CAS race to another tick; safe to skip.
        CONTINUE;
      END IF;

      SELECT net.http_post(
        url     := base_url || '/api/internal/post-payment-retry',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || retry_secret,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object('order_id', order_row.id::text)
      ) INTO http_req_id;

      retried_total := retried_total + 1;
    END IF;
  END LOOP;

  retried_count     := retried_total;
  alerted_count     := alerted_total;
  skipped_no_config := no_config_total;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.retry_post_payment_fanout_tick() IS
  'v3: adds CAS-claim on zoho_dispatch_started_at so overlap with dispatch_zoho_due_tick cannot double-invoice the same order.';

COMMIT;

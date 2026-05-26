-- ============================================================================
-- retry_post_payment_fanout_tick v2 — only consider orders that came through
-- the new webhook flow (i.e. have orders.zoho_scheduled_for set).
--
-- Bug fix: the v1 cron picked up ALL orders where any marker was NULL, which
-- after the new-flow deploy included every historical order processed by the
-- old Make-based path (markers were never set because those columns didn't
-- exist). Result: customers received "payment confirmed" emails + WhatsApp
-- for orders they paid days ago.
--
-- Fix: orders.zoho_scheduled_for is only set by the new webhook code. Adding
-- it to the WHERE clause makes the cron strictly opt-in for new-flow orders,
-- regardless of marker state on legacy rows.
-- ============================================================================

BEGIN;

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
      post_payment_admin_alerted_at
    FROM public.orders
    WHERE webhook_completed_at IS NOT NULL
      AND zoho_scheduled_for IS NOT NULL   -- ← v2 guard: only new-flow orders
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
            jsonb_build_object(
              'type', 'body',
              'parameters', jsonb_build_array(
                jsonb_build_object(
                  'type', 'text',
                  'parameter_name', 'escalation',
                  'text', alert_summary
                )
              )
            ),
            jsonb_build_object(
              'type', 'button',
              'sub_type', 'url',
              'index', '0',
              'parameters', jsonb_build_array(
                jsonb_build_object('type', 'text', 'text', order_row.id::text)
              )
            )
          )
        )
      );

      SELECT net.http_post(
        url     := meta_url,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || whatsapp_token,
          'Content-Type',  'application/json'
        ),
        body    := meta_payload
      ) INTO http_req_id;

      UPDATE public.orders
         SET post_payment_admin_alerted_at = now()
       WHERE id = order_row.id;

      alerted_total := alerted_total + 1;
    ELSE
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
  'v2: only retries orders with zoho_scheduled_for IS NOT NULL (i.e. orders that came through the new webhook flow). Prevents backfilling historical Make-era orders with payment-received messages days/weeks after the fact.';

COMMIT;

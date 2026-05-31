-- ============================================================================
-- Customer notifications dispatcher v8 — payment template gets first-delivery date.
--
-- The Meta template previously named `payment_confirmation_2` was rebuilt and
-- re-approved as `payment_order_confirmed` with a third positional body
-- variable for the first delivery date. The vault row `tpl_payment_order_confirmed`
-- was swapped at the same time to point at the new template name.
--
-- Symptom this fixes: queued-plan customers got the same payment confirmation
-- as immediate-start customers ("Payment received: AED X for Plan Y") with no
-- indication of *when* their plan actually starts — confusing and the worst
-- silence is right after a paid order. The post-payment-fanout has always
-- passed `start_date` in the notification payload (see post-payment-fanout.ts
-- sendWhatsApp); the dispatcher just wasn't rendering it.
--
-- Only change vs v7: the payment_order_confirmed CASE branch now sends three
-- positional body params instead of two. start_date_str is already computed
-- earlier in the function (existing v6+ code), so no other plumbing needed.
-- ============================================================================

BEGIN;

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

      -- payment_order_confirmed (v8): positional body with 3 vars.
      -- {{1}} = amount ("AED 89.50"), {{2}} = plan name, {{3}} = first delivery date.
      WHEN 'payment_order_confirmed' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', 'AED ' || total_aed_str),
            jsonb_build_object('type', 'text', 'text', plan_name_str),
            jsonb_build_object('type', 'text', 'text', start_date_str))))

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

      WHEN 'meal_skip_scheduled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'meal_date', 'text', meal_date_str))))

      WHEN 'meal_skip_cancelled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'meal_date', 'text', meal_date_str))))

      WHEN 'plan_pause_cancelled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))

      WHEN 'plan_start_date_changed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'start_date', 'text', start_date_str))))
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

    UPDATE public.customer_notifications SET sent_at = now() WHERE id = notif_row.notif_id;
    sent_total := sent_total + 1;
  END LOOP;

  sent_count := sent_total;
  skipped_unverified_count := unverified_total;
  skipped_no_template_count := no_template_total;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.dispatch_customer_notifications_tick() IS
  'v8: payment_order_confirmed now sends 3 positional body params (amount, plan, first delivery date). Paired with vault row swap from payment_confirmation_2 to payment_order_confirmed. All other v7 branches preserved verbatim.';

COMMIT;

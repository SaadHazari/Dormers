-- ============================================================================
-- Customer notifications dispatcher v4 — adds payment_order_confirmed.
--
-- Adds a branch for the post-payment WhatsApp confirmation fired from the
-- Stripe webhook fan-out. Same hybrid pattern as v3: named params for this
-- kind (matches the Meta template the user will build), positional remains
-- for meal_skipped_confirm only.
--
-- Template payload (from src/app/api/webhook/route.ts):
--   {
--     start_date: '2026-06-01',      -- ISO; dispatcher formats to "1st June"
--     plan_name: 'Monthly Premium',
--     total_aed: '89.50'
--   }
--
-- Meta template to create (user does this in Business Manager):
--   Name:     payment_order_confirmed
--   Category: UTILITY
--   Language: English
--   Variable type: Named
--   Header (text): You're all set, {{first_name}}.
--   Body:
--     Your {{plan_name}} is booked (AED {{total_aed}}). First meal lands
--     {{start_date}}.
--
--     Hop back into Dormers to peek at the menu and swap any meals you'd
--     rather skip — takes under a minute. We'll WhatsApp you again when
--     delivery's on the way.
--
--     Reply here if you need us.
--
-- After Meta approves the template, run (one-time, separately):
--   INSERT INTO vault.secrets (name, secret)
--   VALUES ('tpl_payment_order_confirmed', '<approved_template_name>');
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
    SELECT
      n.id          AS notif_id,
      n.customer_id AS customer_id,
      n.kind        AS kind,
      n.payload     AS payload,
      c.whatsapp_number,
      c.whatsapp_verified,
      c.name        AS customer_name
    FROM public.customer_notifications n
    JOIN public.customers c ON c.id = n.customer_id
    WHERE n.scheduled_for <= now()
      AND n.sent_at IS NULL
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
      WHERE name = 'tpl_' || notif_row.kind
      LIMIT 1;

    IF template_name IS NULL THEN
      RAISE WARNING 'dispatch_customer_notifications_tick: no template for kind=%', notif_row.kind;
      no_template_total := no_template_total + 1;
      CONTINUE;
    END IF;

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

    -- Per-kind payload construction. meal_skipped_confirm uses positional
    -- (no parameter_name); all others use named (parameter_name required).
    components := CASE notif_row.kind

      -- ── POSITIONAL (template built with Number variable type) ────────
      WHEN 'meal_skipped_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', first_name)
          )),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', meal_date_str)
          ))
        )

      -- ── NAMED (templates built with Named variable type) ─────────────
      WHEN 'meal_resumed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name)
          ))
        )

      WHEN 'plan_paused_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name)
          ))
        )

      WHEN 'plan_pause_scheduled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name)
          )),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'start_date', 'text', start_date_str)
          ))
        )

      WHEN 'plan_resumed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name)
          ))
        )

      -- ── Post-payment confirmation (named, header + 3-var body) ──────
      WHEN 'payment_order_confirmed' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name)
          )),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name',  'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'total_aed',  'text', total_aed_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'start_date', 'text', start_date_str)
          ))
        )
    END;

    meta_payload := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'to', to_phone,
      'type', 'template',
      'template', jsonb_build_object(
        'name', template_name,
        'language', jsonb_build_object('code', 'en'),
        'components', components
      )
    );

    SELECT net.http_post(
      url     := meta_url,
      headers := jsonb_build_object('Authorization', 'Bearer ' || whatsapp_token, 'Content-Type', 'application/json'),
      body    := meta_payload
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
  'v4: adds payment_order_confirmed (named, header + 3-var body: plan_name, total_aed, start_date). Hybrid params retained from v3.';

COMMIT;

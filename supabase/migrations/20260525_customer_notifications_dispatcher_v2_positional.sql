-- ============================================================================
-- Customer notifications dispatcher v2 — matches the actual Meta template
-- structure user is creating.
--
-- Three changes from v1:
--   1. Positional variables ({{1}}, {{2}}) instead of named ones. Meta's
--      "Number" variable type — which user picked when building the
--      meal_skipped_confirm template — uses positional indices, not
--      parameter_name. The payload shape drops parameter_name; order
--      matters.
--   2. Per-kind components array — each template can independently have
--      header / body / both. The user's first template uses Header + Body
--      with one var in each. Earlier dispatcher only sent body.
--   3. Ordinal date format — "31st May" (matching user's "31st May" sample
--      in Meta) instead of "Sat, May 31". Postgres to_char with 'FMDDth
--      FMMonth' produces 1st/2nd/3rd/...
--
-- The customer_notifications schema is unchanged; only the function body
-- and the payload→params mapping change.
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

    -- Pre-format dates with ordinal suffix where the template needs one.
    -- "FMDDth FMMonth" → "31st May", "1st June", etc. The FM modifier
    -- strips zero-padding so we don't get "01st June".
    meal_date_str := NULL;
    IF notif_row.payload ? 'meal_date' THEN
      meal_date_str := to_char((notif_row.payload ->> 'meal_date')::date, 'FMDDth FMMonth');
    END IF;
    start_date_str := NULL;
    IF notif_row.payload ? 'start_date' THEN
      start_date_str := to_char((notif_row.payload ->> 'start_date')::date, 'FMDDth FMMonth');
    END IF;

    -- Build the components array per kind. Each template was built in
    -- Meta with positional ({{N}}) variables (Number type), so params
    -- carry just type+text — no parameter_name.
    components := CASE notif_row.kind

      WHEN 'meal_skipped_confirm' THEN
        -- Header: Hey {{1}},  (first_name)
        -- Body:   Your Dinner for *{{1}}* is skipped. ... (meal_date)
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', first_name)
          )),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', meal_date_str)
          ))
        )

      WHEN 'meal_resumed_confirm' THEN
        -- Header: Morning {{1}},  (first_name)
        -- Body:   no variables
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', first_name)
          ))
        )

      WHEN 'plan_paused_confirm' THEN
        -- Header: Hey {{1}},  (first_name)
        -- Body:   no variables
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', first_name)
          ))
        )

      WHEN 'plan_pause_scheduled_confirm' THEN
        -- Header: Hey {{1}},  (first_name)
        -- Body:   Your plan will pause starting *{{1}}*. ... (start_date)
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', first_name)
          )),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', start_date_str)
          ))
        )

      WHEN 'plan_resumed_confirm' THEN
        -- Header: Morning {{1}},  (first_name)
        -- Body:   no variables
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', first_name)
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
  'v2: positional template params, per-kind header+body components, ordinal date format ("31st May").';

COMMIT;

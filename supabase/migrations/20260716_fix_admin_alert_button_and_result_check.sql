-- 2026-07-16: admin WhatsApp alert channel repair.
-- Applied live via MCP the same day (fix_admin_alert_button_and_result_check
-- + fix_get_admin_alert_result_determinism). This file mirrors the live state.
--
-- Root cause: the Meta template's URL button became static, so every send
-- carrying button parameters was rejected with error 132018 — and because
-- net.http_post is fire-and-forget, the RPC still returned success and no
-- backup channel ever fired.

-- 1. Stop sending button parameters. p_button_text kept for signature
--    compatibility but no longer used.
CREATE OR REPLACE FUNCTION public.send_admin_whatsapp_alert(p_message text, p_button_text text DEFAULT 'unknown'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  whatsapp_token   text;
  phone_number_id  text;
  alert_template   text;
  admin_phone      text;
  meta_url         text;
  meta_payload     jsonb;
  http_req_id      bigint;
BEGIN
  SELECT decrypted_secret INTO whatsapp_token
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_access_token' LIMIT 1;
  SELECT decrypted_secret INTO phone_number_id
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_phone_number_id' LIMIT 1;
  SELECT decrypted_secret INTO alert_template
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_admin_alert_template_name' LIMIT 1;
  SELECT decrypted_secret INTO admin_phone
    FROM vault.decrypted_secrets WHERE name = 'admin_alert_phone_e164' LIMIT 1;

  IF whatsapp_token IS NULL OR phone_number_id IS NULL
     OR alert_template IS NULL OR admin_phone IS NULL THEN
    RAISE WARNING 'send_admin_whatsapp_alert: vault secrets missing — cannot send';
    RETURN NULL;
  END IF;

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
          jsonb_build_object('type', 'text', 'parameter_name', 'escalation', 'text', p_message)
        ))
      )
    )
  );

  SELECT net.http_post(
    url     := meta_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || whatsapp_token, 'Content-Type', 'application/json'),
    body    := meta_payload
  ) INTO http_req_id;

  RETURN http_req_id;
END;
$function$;

-- 2. Result check for a queued alert, so the app can detect a Meta rejection
--    and fall back to email.
CREATE OR REPLACE FUNCTION public.get_admin_alert_result(p_request_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT coalesce(
    (SELECT jsonb_build_object(
       'found', true,
       'status_code', r.status_code,
       'error_msg', r.error_msg,
       'body', left(r.content, 500)
     )
     FROM net._http_response r
     WHERE r.id = p_request_id),
    jsonb_build_object('found', false)
  );
$function$;

REVOKE ALL ON FUNCTION public.get_admin_alert_result(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_alert_result(bigint) TO service_role;

-- 3. The failsafe route takes ~20s cold; pg_net's 5s default cut the
--    connection mid-flight every night. Raise to 30s.
CREATE OR REPLACE FUNCTION public.ops_failsafe_send_tick()
 RETURNS TABLE(fired_count integer, skipped_no_config integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  fired_total      int := 0;
  no_config_total  int := 0;
  base_url         text;
  retry_secret     text;
  http_req_id      bigint;
BEGIN
  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'ops_failsafe_send_tick: required vault secrets missing (admin_base_url, internal_retry_secret)';
    fired_count       := 0;
    skipped_no_config := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT net.http_post(
    url     := base_url || '/api/internal/ops-failsafe-send',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || retry_secret,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO http_req_id;

  fired_total := 1;

  fired_count       := fired_total;
  skipped_no_config := no_config_total;
  RETURN NEXT;
END;
$function$;

-- ============================================================================
-- send_admin_whatsapp_alert(p_message, p_button_text)
--
-- Shared RPC for ad-hoc admin WhatsApp pings from anywhere in the codebase.
-- Reuses the existing `whatsapp_admin_alert_template_name` template + vault
-- secrets that the post-payment retry cron already uses.
--
-- Template shape (registered in Meta):
--   • Header: "Dormers Admin Alert"          (static)
--   • Body:   "Boss, Check this out: {{escalation}}"
--             (one named param: 'escalation' — the message we pass)
--   • Button: URL with one text param        (deep-link / context anchor)
--
-- Designed to be called from Node-side use-cases via supabase.rpc() so
-- TypeScript handlers don't need their own Meta Graph integration or
-- vault secret access — same alert path, single source of truth.
--
-- Returns the pg_net request_id so callers can grep net._http_response
-- if they need to inspect Meta's reply.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.send_admin_whatsapp_alert(
  p_message     text,
  p_button_text text DEFAULT 'unknown'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
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
        )),
        jsonb_build_object('type', 'button', 'sub_type', 'url', 'index', '0',
          'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', p_button_text)
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

  RETURN http_req_id;
END;
$$;

COMMENT ON FUNCTION public.send_admin_whatsapp_alert(text, text) IS
  'Ad-hoc admin WhatsApp ping. Reuses whatsapp_admin_alert_template_name template + vault secrets. Callable from app routes via supabase.rpc.';

-- Lock down to service_role only — never customer-callable.
REVOKE EXECUTE ON FUNCTION public.send_admin_whatsapp_alert(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_admin_whatsapp_alert(text, text) TO service_role;

COMMIT;

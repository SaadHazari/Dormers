-- ============================================================================
-- Stale fraud-queue WhatsApp alert v3 — named body variable + URL button.
--
-- The approved Meta template uses:
--   • Body with a NAMED variable `{{escalation}}` (Meta only allows {{1}}
--     etc. for numeric values; text vars must be named)
--   • A "Visit website" URL button with dynamic URL
--     `https://dormers.ae/admin/referral-review-queue?focus={{1}}`
--     where {{1}} is replaced with the queue row id at send time
--
-- Updates to the payload structure:
--   • body.parameters[].parameter_name = 'escalation' (was positional)
--   • Added components[] entry for the button with sub_type='url'
--   • Dropped the inline URL from the body text — button carries it
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_stale_fraud_queue_tick()
RETURNS TABLE(alerted_count int, skipped_no_config int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  alerted_total      int := 0;
  skipped_total      int := 0;
  stale_row          RECORD;
  whatsapp_token     text;
  phone_number_id    text;
  template_name      text;
  admin_phone        text;
  alert_summary      text;
  meta_url           text;
  meta_payload       jsonb;
  http_req_id        bigint;
BEGIN
  SELECT decrypted_secret INTO whatsapp_token
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_access_token' LIMIT 1;
  SELECT decrypted_secret INTO phone_number_id
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_phone_number_id' LIMIT 1;
  SELECT decrypted_secret INTO template_name
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_admin_alert_template_name' LIMIT 1;
  SELECT decrypted_secret INTO admin_phone
    FROM vault.decrypted_secrets WHERE name = 'admin_alert_phone_e164' LIMIT 1;

  IF whatsapp_token IS NULL
     OR phone_number_id IS NULL
     OR template_name IS NULL
     OR admin_phone IS NULL
  THEN
    RAISE WARNING 'notify_stale_fraud_queue_tick: vault secrets missing';
    skipped_total := 1;
    alerted_count := 0;
    skipped_no_config := skipped_total;
    RETURN NEXT;
    RETURN;
  END IF;

  meta_url := format('https://graph.facebook.com/v22.0/%s/messages', phone_number_id);

  FOR stale_row IN
    SELECT
      q.id           AS queue_id,
      q.reason       AS queue_reason,
      q.created_at   AS queue_created_at,
      r.id           AS referral_id,
      r.invitee_first_name,
      r.invitee_phone,
      r.converted_at,
      c.name         AS inviter_name,
      c.cid          AS inviter_cid,
      cr.amount_aed  AS credit_aed
    FROM public.referral_review_queue q
    JOIN public.referrals r ON r.id = q.referral_id
    LEFT JOIN public.customers c ON c.id = r.inviter_user_id
    LEFT JOIN public.credits cr ON cr.referral_id = r.id AND cr.status = 'pending'
    WHERE q.status = 'pending'
      AND q.alerted_at IS NULL
      AND q.created_at < now() - INTERVAL '24 hours'
    ORDER BY q.created_at ASC
  LOOP
    -- Body text: dropped the URL since the button carries it now.
    alert_summary := format(
      '%s day(s) old · invitee %s (%s) joined via %s · AED %s locked · reason: %s',
      EXTRACT(DAY FROM (now() - stale_row.queue_created_at))::int,
      COALESCE(stale_row.invitee_first_name, 'unknown'),
      COALESCE(stale_row.invitee_phone, 'no-phone'),
      COALESCE(stale_row.inviter_name, 'unknown-inviter'),
      COALESCE(stale_row.credit_aed::text, '?'),
      COALESCE(stale_row.queue_reason, 'no-reason')
    );

    -- Payload now has TWO component entries:
    --   1. body with NAMED parameter `escalation`
    --   2. button (sub_type=url, index=0) with the queue_id as the
    --      dynamic suffix that fills the template's {{1}} placeholder
    meta_payload := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'to', regexp_replace(admin_phone, '^\+', ''),
      'type', 'template',
      'template', jsonb_build_object(
        'name', template_name,
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
              jsonb_build_object(
                'type', 'text',
                'text', stale_row.queue_id::text
              )
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

    UPDATE public.referral_review_queue
       SET alerted_at = now()
     WHERE id = stale_row.queue_id;

    alerted_total := alerted_total + 1;
  END LOOP;

  alerted_count     := alerted_total;
  skipped_no_config := skipped_total;
  RETURN NEXT;
END;
$$;

COMMIT;

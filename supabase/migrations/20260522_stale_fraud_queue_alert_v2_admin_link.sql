-- ============================================================================
-- Stale fraud-queue WhatsApp alert v2 — include deep link to the admin
-- review page.
--
-- v1 (20260522_stale_fraud_queue_whatsapp_alert.sql) pointed admins at
-- /admin/layer4-queue, which is a different system entirely (Google
-- reviews / weekly surveys, not referral fraud). v2 fixes the link by
-- pointing at the brand-new /admin/referral-review-queue page with
-- ?focus=<queue_id> so the relevant row scrolls into view.
--
-- New vault secret introduced:
--   admin_base_url — e.g. 'https://dormers.ae'  (no trailing slash)
--
-- Falls back to 'https://dormers.ae' if the secret is unset, so the
-- function keeps working without re-seeding for production.
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
  admin_base_url     text;
  alert_summary      text;
  admin_link         text;
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
  SELECT decrypted_secret INTO admin_base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;

  -- The 4 critical secrets must be set. admin_base_url has a sensible
  -- production default, so we don't gate on it.
  IF whatsapp_token IS NULL
     OR phone_number_id IS NULL
     OR template_name IS NULL
     OR admin_phone IS NULL
  THEN
    RAISE WARNING 'notify_stale_fraud_queue_tick: vault secrets missing — set whatsapp_access_token / whatsapp_phone_number_id / whatsapp_admin_alert_template_name / admin_alert_phone_e164';
    skipped_total := 1;
    alerted_count := 0;
    skipped_no_config := skipped_total;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Fall back to production URL if the env-specific secret isn't set.
  IF admin_base_url IS NULL OR admin_base_url = '' THEN
    admin_base_url := 'https://dormers.ae';
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
    -- Deep link to the queue page with the row pre-focused (auto-scrolls
    -- into view + highlighted on render).
    admin_link := format(
      '%s/admin/referral-review-queue?focus=%s',
      admin_base_url,
      stale_row.queue_id
    );

    -- Format the alert body. Newline + bare URL on a separate line
    -- makes WhatsApp render the link as a tappable preview card.
    alert_summary := format(
      '%s day(s) old · invitee %s (%s) joined via %s · AED %s locked · reason: %s%s%s',
      EXTRACT(DAY FROM (now() - stale_row.queue_created_at))::int,
      COALESCE(stale_row.invitee_first_name, 'unknown'),
      COALESCE(stale_row.invitee_phone, 'no-phone'),
      COALESCE(stale_row.inviter_name, 'unknown-inviter'),
      COALESCE(stale_row.credit_aed::text, '?'),
      COALESCE(stale_row.queue_reason, 'no-reason'),
      E'\n\nApprove or reject:\n',
      admin_link
    );

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
              jsonb_build_object('type', 'text', 'text', alert_summary)
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

COMMENT ON FUNCTION public.notify_stale_fraud_queue_tick() IS
  'Hourly sweep for stale referral_review_queue rows. v2: alert message now includes a deep link to /admin/referral-review-queue?focus=<queue_id>.';

COMMIT;

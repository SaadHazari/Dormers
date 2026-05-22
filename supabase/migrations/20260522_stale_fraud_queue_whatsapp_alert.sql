-- ============================================================================
-- Stale referral fraud-queue WhatsApp alert pipeline.
--
-- Problem this solves:
--   When a referral conversion is flagged into referral_review_queue with a
--   soft_signal reason, the credit sits as 'pending' until an admin marks
--   the queue row as approved/rejected. There's no escalation if nobody
--   reviews it. Today we have a 5-day-old unreviewed row blocking AED 20.
--
-- How this fixes it:
--   1. Add alerted_at column to referral_review_queue (idempotency marker).
--   2. Enable pg_net so a Postgres function can call Meta's WhatsApp API.
--   3. Create vault secrets for WhatsApp credentials + admin phone.
--   4. notify_stale_fraud_queue_tick() finds queue rows older than 24h,
--      pending, never alerted; sends one WhatsApp per row to the admin
--      phone via the configured Meta template; marks alerted_at.
--   5. Schedule the function hourly via pg_cron.
--
-- Setup required AFTER applying this migration (one-time, admin):
--   SELECT vault.create_secret('REPLACE_WITH_TOKEN',         'whatsapp_access_token');
--   SELECT vault.create_secret('REPLACE_WITH_PHONE_ID',      'whatsapp_phone_number_id');
--   SELECT vault.create_secret('REPLACE_WITH_TEMPLATE_NAME', 'whatsapp_admin_alert_template_name');
--   SELECT vault.create_secret('966552426072',               'admin_alert_phone_e164');
--
-- The admin_alert template should be a Meta-approved utility template
-- with ONE body parameter that carries the formatted alert text, e.g.:
--   "*Dormers admin alert* — {{1}}"
-- The template name set in vault must match the approved template's name.
-- Until the vault secrets are populated, the function logs and no-ops.
-- ============================================================================

BEGIN;

-- ── 1. Enable pg_net ──────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── 2. Add alerted_at idempotency marker ──────────────────────────────────
ALTER TABLE public.referral_review_queue
  ADD COLUMN IF NOT EXISTS alerted_at timestamp with time zone;

COMMENT ON COLUMN public.referral_review_queue.alerted_at IS
  'Timestamp when an admin WhatsApp alert was sent for this row. NULL = never alerted. Prevents re-sending the same alert on every cron tick.';

CREATE INDEX IF NOT EXISTS referral_review_queue_pending_unalerted_idx
  ON public.referral_review_queue (created_at)
  WHERE status = 'pending' AND alerted_at IS NULL;

-- ── 3. The notify function ────────────────────────────────────────────────
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
  -- Pull all required secrets up-front. If any are missing, log and bail
  -- — better to no-op than to crash the cron.
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
    RAISE WARNING 'notify_stale_fraud_queue_tick: vault secrets missing — set whatsapp_access_token / whatsapp_phone_number_id / whatsapp_admin_alert_template_name / admin_alert_phone_e164';
    skipped_total := 1;
    alerted_count := 0;
    skipped_no_config := skipped_total;
    RETURN NEXT;
    RETURN;
  END IF;

  meta_url := format('https://graph.facebook.com/v22.0/%s/messages', phone_number_id);

  -- Walk stale, pending, unalerted queue rows. 24h threshold matches the
  -- "soft signal review SLA" — if it's been a full day, escalate.
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
    -- Build the alert summary as a single-line string for the template's
    -- {{1}} body parameter. Keep it short — Meta templates have character
    -- limits and the WhatsApp UI truncates long lines.
    alert_summary := format(
      '%s day(s) old — invitee %s (%s) joined via %s. AED %s locked. Reason: %s. Check /admin/layer4-queue.',
      EXTRACT(DAY FROM (now() - stale_row.queue_created_at))::int,
      COALESCE(stale_row.invitee_first_name, 'unknown'),
      COALESCE(stale_row.invitee_phone, 'no-phone'),
      COALESCE(stale_row.inviter_name, 'unknown-inviter'),
      COALESCE(stale_row.credit_aed::text, '?'),
      COALESCE(stale_row.queue_reason, 'no-reason')
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

    -- Fire the WhatsApp send. pg_net is async — the request enters a
    -- queue and is dispatched by a background worker. We don't wait
    -- for the response; failures show up in net._http_response and can
    -- be inspected separately.
    SELECT net.http_post(
      url     := meta_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || whatsapp_token,
        'Content-Type',  'application/json'
      ),
      body    := meta_payload
    ) INTO http_req_id;

    -- Mark this queue row as alerted so we don't re-send on the next
    -- tick. If pg_net's send ultimately fails, ops will see no msg
    -- arrive and can manually NULL out alerted_at to retry.
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
  'Hourly sweep for referral_review_queue rows older than 24h with no admin response. Sends one WhatsApp alert per row via Meta Cloud API; marks alerted_at to prevent duplicates. Secrets pulled from vault.decrypted_secrets — no-ops if not configured.';

-- ── 4. Schedule the cron ──────────────────────────────────────────────────
-- Hourly is reasonable for fraud escalation — daily would mean some rows
-- wait 47h before being alerted. The function is idempotent (alerted_at
-- prevents re-sends), so hourly checking is cheap when nothing's stale.
DO $$
BEGIN
  PERFORM cron.unschedule('notify_stale_fraud_queue_tick');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'notify_stale_fraud_queue_tick',
  '5 * * * *',  -- every hour at :05
  $cron$ SELECT public.notify_stale_fraud_queue_tick(); $cron$
);

COMMIT;

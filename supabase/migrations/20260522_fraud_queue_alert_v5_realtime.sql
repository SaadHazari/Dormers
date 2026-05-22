-- ============================================================================
-- Stale fraud-queue WhatsApp alert v5 — real-time, no 24h delay.
--
-- Two changes:
--   1. Drop the "older than 24h" filter from the tick function. Every
--      unalerted row gets an alert.
--   2. Add an AFTER INSERT trigger on referral_review_queue so the alert
--      fires immediately when a row is created. Cron stays scheduled
--      hourly as a fallback safety net (catches rows where the trigger
--      failed — e.g. pg_net was down, vault secret was missing at
--      insert time, etc.).
--
-- Concurrency: added `FOR UPDATE OF q SKIP LOCKED` to the SELECT in the
-- FOR loop so simultaneous trigger + cron runs don't double-alert the
-- same row. First one to grab the row claims it; the other skips.
--
-- The alert message format (plain English from v4) is unchanged.
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
  age_phrase         text;
  signals_explained  text;
  signal_code        text;
  signal_lines       text[];
  meta_url           text;
  meta_payload       jsonb;
  http_req_id        bigint;
  days_old           int;
BEGIN
  SELECT decrypted_secret INTO whatsapp_token
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_access_token' LIMIT 1;
  SELECT decrypted_secret INTO phone_number_id
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_phone_number_id' LIMIT 1;
  SELECT decrypted_secret INTO template_name
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_admin_alert_template_name' LIMIT 1;
  SELECT decrypted_secret INTO admin_phone
    FROM vault.decrypted_secrets WHERE name = 'admin_alert_phone_e164' LIMIT 1;

  IF whatsapp_token IS NULL OR phone_number_id IS NULL OR template_name IS NULL OR admin_phone IS NULL THEN
    RAISE WARNING 'notify_stale_fraud_queue_tick: vault secrets missing';
    skipped_total := 1;
    alerted_count := 0;
    skipped_no_config := skipped_total;
    RETURN NEXT;
    RETURN;
  END IF;

  meta_url := format('https://graph.facebook.com/v22.0/%s/messages', phone_number_id);

  -- v5: dropped the AND q.created_at < now() - INTERVAL '24 hours' filter
  -- so any unalerted row qualifies. FOR UPDATE OF q SKIP LOCKED makes
  -- concurrent trigger+cron calls safe — first claim wins, others skip
  -- the row without blocking.
  FOR stale_row IN
    SELECT
      q.id           AS queue_id,
      q.reason       AS queue_reason,
      q.flags        AS queue_flags,
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
    ORDER BY q.created_at ASC
    FOR UPDATE OF q SKIP LOCKED
  LOOP
    days_old := EXTRACT(DAY FROM (now() - stale_row.queue_created_at))::int;
    age_phrase := CASE
      WHEN days_old = 0 THEN 'just now'
      WHEN days_old = 1 THEN 'yesterday'
      ELSE format('%s days ago', days_old)
    END;

    signal_lines := ARRAY[]::text[];
    IF stale_row.queue_flags IS NOT NULL AND stale_row.queue_flags ? 'signals' THEN
      FOR signal_code IN
        SELECT jsonb_array_elements_text(stale_row.queue_flags -> 'signals')
      LOOP
        IF signal_code = 'device_fp_reuse' THEN
          signal_lines := array_append(signal_lines, 'Same browser used by someone who already claimed a free trial — could be a roommate''s old device, or someone farming credits.');
        ELSIF signal_code LIKE 'ip:%' THEN
          CONTINUE;
        ELSE
          signal_lines := array_append(signal_lines, signal_code);
        END IF;
      END LOOP;
    END IF;

    IF array_length(signal_lines, 1) IS NULL OR array_length(signal_lines, 1) = 0 THEN
      signals_explained := 'Flagged for manual review (no specific signal recorded).';
    ELSIF array_length(signal_lines, 1) = 1 THEN
      signals_explained := 'Why we flagged this: ' || signal_lines[1];
    ELSE
      signals_explained := 'Why we flagged this:' || E'\n• ' || array_to_string(signal_lines, E'\n• ');
    END IF;

    alert_summary := format(
      '%s (%s) joined via %s %s. AED %s is locked until you decide.%s%s',
      COALESCE(stale_row.invitee_first_name, 'Someone'),
      COALESCE(stale_row.invitee_phone, 'no phone on file'),
      COALESCE(stale_row.inviter_name, 'an unknown inviter'),
      age_phrase,
      COALESCE(stale_row.credit_aed::text, '?'),
      E'\n\n',
      signals_explained
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
              jsonb_build_object('type', 'text', 'parameter_name', 'escalation', 'text', alert_summary)
            )
          ),
          jsonb_build_object(
            'type', 'button',
            'sub_type', 'url',
            'index', '0',
            'parameters', jsonb_build_array(
              jsonb_build_object('type', 'text', 'text', stale_row.queue_id::text)
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

    UPDATE public.referral_review_queue SET alerted_at = now() WHERE id = stale_row.queue_id;
    alerted_total := alerted_total + 1;
  END LOOP;

  alerted_count := alerted_total;
  skipped_no_config := skipped_total;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.notify_stale_fraud_queue_tick() IS
  'v5: real-time alerts. Drops the 24h delay filter — any unalerted row triggers a WhatsApp send. Concurrency-safe via FOR UPDATE SKIP LOCKED.';

-- ── Trigger: fire alert immediately on INSERT ─────────────────────────────
-- Calls the tick function which picks up the just-inserted row (and any
-- other unalerted rows that happened to slip through). pg_net's HTTP send
-- is async so this doesn't block the inserting transaction.

CREATE OR REPLACE FUNCTION public.trg_referral_review_queue_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only alert on the pending state. If a row is inserted directly as
  -- approved/rejected (shouldn't normally happen but defensive), skip.
  IF NEW.status = 'pending' THEN
    PERFORM public.notify_stale_fraud_queue_tick();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS referral_review_queue_alert_on_insert ON public.referral_review_queue;

CREATE TRIGGER referral_review_queue_alert_on_insert
  AFTER INSERT ON public.referral_review_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_referral_review_queue_alert();

COMMENT ON TRIGGER referral_review_queue_alert_on_insert ON public.referral_review_queue IS
  'Fires the WhatsApp alert pipeline the moment a referral gets flagged. Cron job 7 stays scheduled hourly as a safety-net catcher for rows where this trigger failed (e.g. pg_net was down, vault secret missing at insert time).';

COMMIT;

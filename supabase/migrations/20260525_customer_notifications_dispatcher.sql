-- ============================================================================
-- Customer notifications dispatcher — pulls due rows from
-- customer_notifications and sends them via Meta WhatsApp Cloud API.
--
-- Runs every 5 minutes via pg_cron. Idempotent (sent_at marker).
-- Concurrency-safe via FOR UPDATE SKIP LOCKED.
--
-- Per-kind template names are stored in vault under predictable secret
-- names (tpl_<kind>) so each can be added independently as Meta
-- approves them. If a template name secret is missing for a kind, the
-- function logs a warning and skips that row (leaves it in the queue
-- for the next pass — ops sets the secret, alerts catch up).
--
-- whatsapp_verified=false customers get sent_at=now() + wamid='skipped:unverified'
-- so the row closes out without us trying to send to an unreachable
-- number on every cron pass. Should be rare — all signups force WA
-- verification — but legacy data could have these.
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
  body_params         jsonb;
  http_req_id         bigint;
BEGIN
  -- Pull the shared Meta credentials once per tick.
  SELECT decrypted_secret INTO whatsapp_token
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_access_token' LIMIT 1;
  SELECT decrypted_secret INTO phone_number_id
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_phone_number_id' LIMIT 1;

  IF whatsapp_token IS NULL OR phone_number_id IS NULL THEN
    RAISE WARNING 'dispatch_customer_notifications_tick: shared Meta secrets missing — set whatsapp_access_token and whatsapp_phone_number_id';
    sent_count := 0;
    skipped_unverified_count := 0;
    skipped_no_template_count := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  meta_url := format('https://graph.facebook.com/v22.0/%s/messages', phone_number_id);

  -- Walk due, unsent rows. SKIP LOCKED makes concurrent ticks safe.
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
    -- Defensive: if the customer has no number or isn't verified,
    -- close the row out without sending. Avoids loop-spamming Meta with
    -- requests that'll bounce back.
    IF notif_row.whatsapp_number IS NULL
       OR notif_row.whatsapp_verified IS NOT TRUE
    THEN
      UPDATE public.customer_notifications
         SET sent_at = now(), wamid = 'skipped:unverified'
       WHERE id = notif_row.notif_id;
      unverified_total := unverified_total + 1;
      CONTINUE;
    END IF;

    -- Per-kind template name lookup. Each kind's template gets its own
    -- vault secret so they can be staged independently as Meta approves
    -- them. Missing secret = skip this row this tick.
    template_name := NULL;
    SELECT decrypted_secret INTO template_name
      FROM vault.decrypted_secrets
      WHERE name = 'tpl_' || notif_row.kind
      LIMIT 1;

    IF template_name IS NULL THEN
      RAISE WARNING 'dispatch_customer_notifications_tick: no template configured for kind=% (set vault secret tpl_%)', notif_row.kind, notif_row.kind;
      no_template_total := no_template_total + 1;
      -- Don't mark sent_at — leave in queue for when ops registers the secret.
      CONTINUE;
    END IF;

    -- First-name extraction. customers.name is "Saad Hazari" → "Saad".
    -- Fallback to "there" if no name on file so the template still has
    -- a sensible value for {{first_name}}.
    first_name := COALESCE(NULLIF(split_part(notif_row.customer_name, ' ', 1), ''), 'there');
    to_phone := regexp_replace(notif_row.whatsapp_number, '^\+', '');

    -- Build the body parameters per kind. Each template expects a known
    -- set of named text parameters. Add new branches when adding kinds.
    body_params := CASE notif_row.kind
      WHEN 'meal_skipped_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name),
          jsonb_build_object('type', 'text', 'parameter_name', 'meal_date',
            'text', to_char((notif_row.payload ->> 'meal_date')::date, 'FMDy, FMMon FMDD'))
        )
      WHEN 'meal_resumed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name)
        )
      WHEN 'plan_paused_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name)
        )
      WHEN 'plan_pause_scheduled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name),
          jsonb_build_object('type', 'text', 'parameter_name', 'start_date',
            'text', to_char((notif_row.payload ->> 'start_date')::date, 'FMDy, FMMon FMDD'))
        )
      WHEN 'plan_resumed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name)
        )
    END;

    meta_payload := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'to', to_phone,
      'type', 'template',
      'template', jsonb_build_object(
        'name', template_name,
        'language', jsonb_build_object('code', 'en'),
        'components', jsonb_build_array(
          jsonb_build_object('type', 'body', 'parameters', body_params)
        )
      )
    );

    -- pg_net's http_post is async — request enters a queue, dispatched
    -- by a background worker. We get a request_id back, not the response.
    -- Mark sent_at immediately; failures show up in net._http_response
    -- and can be inspected separately.
    SELECT net.http_post(
      url     := meta_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || whatsapp_token,
        'Content-Type',  'application/json'
      ),
      body    := meta_payload
    ) INTO http_req_id;

    UPDATE public.customer_notifications
       SET sent_at = now()
     WHERE id = notif_row.notif_id;
    sent_total := sent_total + 1;
  END LOOP;

  sent_count := sent_total;
  skipped_unverified_count := unverified_total;
  skipped_no_template_count := no_template_total;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.dispatch_customer_notifications_tick() IS
  'Pulls due rows from customer_notifications and sends WhatsApp via Meta Cloud API. Runs every 5 min via pg_cron. Idempotent + concurrency-safe.';

-- ── Schedule ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('dispatch_customer_notifications_tick');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'dispatch_customer_notifications_tick',
  '*/5 * * * *',  -- every 5 minutes
  $cron$ SELECT public.dispatch_customer_notifications_tick(); $cron$
);

COMMIT;

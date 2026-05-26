-- ============================================================================
-- dispatch_zoho_due_tick — every-minute cron that fires the initial Zoho
-- receipt email 2 minutes after the webhook stamps zoho_scheduled_for.
--
-- This complements (not replaces) the hourly retry_post_payment_fanout_tick.
-- Division of labour:
--   • dispatch_zoho_due_tick (every minute): FIRST attempt only.
--     Filters out orders that already have a Zoho entry in
--     post_payment_errors — failures are owned by the hourly retry.
--   • retry_post_payment_fanout_tick (every hour): retries after failures,
--     with 5-attempt budget + admin alert.
--
-- Both call the same internal route; both rely on the orchestrator's
-- per-channel marker idempotency to be safe in face of race conditions.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_zoho_due_tick()
RETURNS TABLE(dispatched_count int, skipped_no_config int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  dispatched_total  int := 0;
  no_config_total   int := 0;
  order_row         RECORD;
  base_url          text;
  retry_secret      text;
  http_req_id       bigint;
BEGIN
  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'dispatch_zoho_due_tick: required vault secrets missing';
    dispatched_count := 0;
    skipped_no_config := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR order_row IN
    SELECT id
    FROM public.orders
    WHERE zoho_scheduled_for IS NOT NULL
      AND zoho_scheduled_for <= now()
      AND zoho_invoice_id IS NULL
      AND post_payment_admin_alerted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(post_payment_errors, '[]'::jsonb)) AS e
        WHERE e->>'channel' = 'zoho'
      )
    ORDER BY zoho_scheduled_for ASC
    LIMIT 50
  LOOP
    SELECT net.http_post(
      url     := base_url || '/api/internal/post-payment-retry',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || retry_secret,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object('order_id', order_row.id::text)
    ) INTO http_req_id;

    dispatched_total := dispatched_total + 1;
  END LOOP;

  dispatched_count  := dispatched_total;
  skipped_no_config := no_config_total;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.dispatch_zoho_due_tick() IS
  'Every-minute dispatcher for the 2-min-deferred Zoho receipt email. Picks up orders past their zoho_scheduled_for with no prior Zoho attempt and POSTs the internal retry route to fire the first Zoho send. Failures handled by retry_post_payment_fanout_tick (hourly).';

-- Schedule every minute.
DO $$
BEGIN
  PERFORM cron.unschedule('dispatch_zoho_due_every_minute');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'dispatch_zoho_due_every_minute',
  '* * * * *',
  $cron$ SELECT public.dispatch_zoho_due_tick(); $cron$
);

COMMIT;

-- ============================================================================
-- ops_failsafe_cron — 8 PM UAE (16:00 UTC) nightly failsafe that checks for
-- unverified deliveries. Fires a single POST to /api/internal/ops-failsafe-send
-- which computes pending dorms and WhatsApps the owner via notifyAdmin.
--
-- Three sections:
--   1. delivery_failsafe_alerts — idempotency/dedup table (one row per date)
--   2. ops_failsafe_send_tick() — PL/pgSQL tick function using pg_net
--   3. cron.schedule — registers the job as ops_failsafe_20_ae
-- ============================================================================

-- --------------------------------------------------------------------------
-- Section 1: Dedup table
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.delivery_failsafe_alerts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_date   date        NOT NULL,
  pending_dorms text[]     NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_date)
);

GRANT SELECT, INSERT ON public.delivery_failsafe_alerts TO service_role;

-- --------------------------------------------------------------------------
-- Section 2: Tick function
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ops_failsafe_send_tick()
RETURNS TABLE(fired_count int, skipped_no_config int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
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
    body    := '{}'::jsonb
  ) INTO http_req_id;

  fired_total := 1;

  fired_count       := fired_total;
  skipped_no_config := no_config_total;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.ops_failsafe_send_tick() IS
  'Nightly 8 PM AE (16:00 UTC) failsafe tick. Reads vault secrets and POSTs once to /api/internal/ops-failsafe-send. The route does the actual dorm lookup + notifyAdmin dispatch.';

-- --------------------------------------------------------------------------
-- Section 3: Cron schedule
-- --------------------------------------------------------------------------

-- Unschedule first so re-running the migration is safe
DO $$
BEGIN
  PERFORM cron.unschedule('ops_failsafe_20_ae');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8 PM UAE = 16:00 UTC (Dubai is UTC+4, no DST year-round)
SELECT cron.schedule(
  'ops_failsafe_20_ae',
  '0 16 * * *',
  $cron$ SELECT public.ops_failsafe_send_tick(); $cron$
);

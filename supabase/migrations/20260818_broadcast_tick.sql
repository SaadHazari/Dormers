-- ============================================================================
-- dispatch_broadcast_tick — per-minute cron that drives the broadcast
-- dispatcher. The EXISTS guard makes idle ticks free: no HTTP request unless
-- a broadcast is actually in 'sending', so the every-minute schedule costs
-- nothing between broadcasts. One POST per tick; the route bounds its own
-- batch (25), so throughput is ~25 emails/minute — deliberate pacing that
-- also staggers any CTA flash crowd.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-18. This file is the source-control mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_broadcast_tick()
RETURNS TABLE(dispatched int, skipped_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  base_url     text;
  retry_secret text;
  http_req_id  bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.broadcasts WHERE status = 'sending') THEN
    dispatched := 0; skipped_reason := 'idle';
    RETURN NEXT; RETURN;
  END IF;

  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'dispatch_broadcast_tick: required vault secrets missing';
    dispatched := 0; skipped_reason := 'no_config';
    RETURN NEXT; RETURN;
  END IF;

  SELECT net.http_post(
    url     := base_url || '/api/internal/broadcast-send',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || retry_secret,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  ) INTO http_req_id;

  dispatched := 1; skipped_reason := NULL;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.dispatch_broadcast_tick() IS
  'Per-minute broadcast pump. Free when idle (EXISTS guard); POSTs /api/internal/broadcast-send once per tick while a broadcast is sending.';

REVOKE EXECUTE ON FUNCTION public.dispatch_broadcast_tick() FROM public, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('dispatch_broadcast_every_minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'dispatch_broadcast_every_minute',
  '* * * * *',
  $cron$ SELECT public.dispatch_broadcast_tick(); $cron$
);

COMMIT;

-- ============================================================================
-- Orphan subscription detector.
--
-- Concurrent-webhook race scenario (mitigated in Phase 2 by rolling back
-- the sub on order-insert failure): two webhooks both pass the
-- existingOrder check, both insert subscriptions, one's order insert wins
-- on the UNIQUE constraint, the loser was supposed to delete the orphan
-- but that delete itself can fail (DB hiccup, RLS regression, etc.).
--
-- This cron catches anything that slipped: subscriptions older than 15
-- minutes with no matching orders row. Alerts once per orphan via the
-- new `orphan_alerted_at` column.
--
-- Also catches the symmetric case — orders pointing at a deleted/
-- non-existent subscription_id, though that requires manual sub deletion
-- to produce.
-- ============================================================================

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS orphan_alerted_at timestamptz;

COMMENT ON COLUMN public.subscriptions.orphan_alerted_at IS
  'Set by detect_orphan_subscriptions_tick when admin has been pinged about this orphan. Prevents re-alerting on the next cron.';

CREATE OR REPLACE FUNCTION public.detect_orphan_subscriptions_tick()
RETURNS TABLE(alerted_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  total_alerted int := 0;
  orphan_row    RECORD;
  alert_msg     text;
  http_req_id   bigint;
BEGIN
  FOR orphan_row IN
    SELECT s.id, s.customer_id, s.plan_name, s.status, s.start_date, s.created_at
    FROM public.subscriptions s
    LEFT JOIN public.orders o ON o.subscription_id = s.id
    WHERE o.id IS NULL
      AND s.created_at < now() - interval '15 minutes'
      AND s.orphan_alerted_at IS NULL
      -- Exclude historical backfill / test rows. The active-flow rows are
      -- all newer than the cutover commit on 2026-05-20; if you imported
      -- legacy data after that date you'll want to bump this filter.
      AND s.created_at > timestamp '2026-05-25'
      AND s.status IN ('Active', 'Paused', 'Skipped', 'Scheduled')
    ORDER BY s.created_at ASC
    LIMIT 20
  LOOP
    alert_msg := format(
      'Orphan subscription detected: id=%s customer=%s plan=%s status=%s start=%s. ' ||
      'Created %s ago with NO matching orders row — likely a concurrent-webhook race ' ||
      'where the sub-rollback also failed. Inspect and DELETE the sub if confirmed orphan.',
      orphan_row.id,
      orphan_row.customer_id,
      orphan_row.plan_name,
      orphan_row.status,
      orphan_row.start_date,
      age(now(), orphan_row.created_at)
    );

    SELECT public.send_admin_whatsapp_alert(alert_msg, orphan_row.id::text) INTO http_req_id;

    UPDATE public.subscriptions
       SET orphan_alerted_at = now()
     WHERE id = orphan_row.id;

    total_alerted := total_alerted + 1;
  END LOOP;

  alerted_count := total_alerted;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.detect_orphan_subscriptions_tick() IS
  'Every-30-min cron. Pings admin once per active orphan subscription (live status, >15 min old, no matching order).';

DO $$ BEGIN PERFORM cron.unschedule('detect_orphan_subscriptions_30min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'detect_orphan_subscriptions_30min',
  '25,55 * * * *',
  $cron$ SELECT public.detect_orphan_subscriptions_tick(); $cron$
);

COMMIT;

-- ============================================================================
-- Seasonal intake pause — stop the renewal nudge at the source.
--
-- THE BUG: dispatch_renew_nudges_tick fires the T-3 renewal reminder every day
-- regardless of intake_settings.paused. During a seasonal pause it messages
-- customers on WhatsApp AND email telling them to renew, and the button lands
-- on a checkout that refuses them. The louder the nudge, the worse it reads.
--
-- THE FIX: one guard at the top. Paused means no nudges at all, and no rows
-- written — a nudge is a moment, not a milestone. If the pause lifts while a
-- plan is still inside its T-3 window, the next tick nudges for real; a dedup
-- row would have swallowed that.
--
-- The send route (src/app/api/internal/renew-nudge-send/route.ts) carries the
-- same check. This function stops the fleet of POSTs ever being fired; the
-- route is the guarantee that ships with the deploy and the backstop if this
-- function is ever restored from an older migration.
--
-- Deliberately NOT touched here:
--   • The cron schedule. The live job dispatch_renew_nudges_18_ae is left
--     exactly as it is. Re-running cron.schedule from a migration file is how
--     the ended dispatcher's live 20:45 job came to disagree with the 20:15 in
--     20260613_dispatch_subscription_ended_cron.sql.
--   • dispatch_subscription_ended_tick. That one MUST keep firing during a
--     pause — it is what delivers the season plan-ended email. Its per-channel
--     behaviour is decided in application code (resolveEndedNotice), not SQL.
--
-- BODY PROVENANCE: copied from the LIVE Ohio definition on 2026-08-17, not
-- from 20260601_dispatch_renew_nudges_cron.sql, which is stale — live carries
-- an extra meta_status_code clause in the dedup NOT EXISTS that the repo file
-- never gained. Applied live via Supabase MCP the same day. This file is the
-- source-control mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_renew_nudges_tick()
RETURNS TABLE(dispatched_count int, skipped_no_config int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  dispatched_total int := 0;
  no_config_total  int := 0;
  sub_row          RECORD;
  base_url         text;
  retry_secret     text;
  http_req_id      bigint;
BEGIN
  -- Seasonal intake pause. Checked before the vault reads because a paused
  -- shop has nothing to dispatch and no reason to touch secrets.
  --
  -- Fails CLOSED, unlike the application-side getIntakeState which fails open.
  -- Different risks: there, a settings-read failure must never block a sale;
  -- here, the row is a plain local SELECT that cannot realistically fail, and
  -- if intake_settings were somehow unreadable the honest default for an
  -- automated blast is silence.
  IF EXISTS (SELECT 1 FROM public.intake_settings WHERE paused) THEN
    dispatched_count  := 0;
    skipped_no_config := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'dispatch_renew_nudges_tick: required vault secrets missing';
    dispatched_count := 0;
    skipped_no_config := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  -- plan_name is free-form text (carries emoji prefixes in some rows) so
  -- we substring-match the paid SKUs. Trials + Welcome Meal are status
  -- 'Active' too but have their own renew flows; do not nudge them here.
  FOR sub_row IN
    SELECT s.id
    FROM public.subscriptions s
    WHERE s.status = 'Active'
      AND (
        s.plan_name ILIKE '%Monthly Max%'
        OR s.plan_name ILIKE '%Monthly Premium%'
        OR s.plan_name ILIKE '%Weekly Flex%'
      )
      AND s.end_date BETWEEN CURRENT_DATE + 2 AND CURRENT_DATE + 3
      AND NOT EXISTS (
        SELECT 1 FROM public.subscriptions q
        WHERE q.customer_id = s.customer_id
          AND q.status = 'Scheduled'
          AND q.start_date > CURRENT_DATE
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_notifications cn
        WHERE cn.customer_id = s.customer_id
          AND cn.kind = 'subscription_renew_nudge'
          AND cn.scheduled_for > NOW() - INTERVAL '7 days'
          AND (cn.meta_status_code IS NULL OR cn.meta_status_code BETWEEN 200 AND 299)
      )
    LIMIT 200
  LOOP
    SELECT net.http_post(
      url     := base_url || '/api/internal/renew-nudge-send',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || retry_secret,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object('subscription_id', sub_row.id::text)
    ) INTO http_req_id;

    dispatched_total := dispatched_total + 1;
  END LOOP;

  dispatched_count  := dispatched_total;
  skipped_no_config := no_config_total;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.dispatch_renew_nudges_tick() IS
  'Daily 18:00 AE (14:00 UTC) dispatcher for the T-3 days renewal nudge. No-ops entirely while intake_settings.paused is true — the nudge drives at a checkout that refuses the customer during a seasonal pause. Otherwise finds Active subs ending in 2-3 days with no Scheduled follow-on and no successful nudge in the past 7 days, then POSTs the internal renew-nudge-send route per sub.';

COMMIT;

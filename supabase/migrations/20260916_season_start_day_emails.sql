-- ============================================================================
-- Season wind-down, plan C: no "your plan starts today" email for a plan held
-- for next semester, and none during the break (spec §8, pre-flight F10).
--
-- The body was copied from pg_get_functiondef on live; only the lines marked
-- "Plan C" differ.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_start_day_emails`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_start_day_emails_tick()
 RETURNS TABLE(dispatched_count integer, skipped_no_config integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  dispatched_total  int := 0;
  no_config_total   int := 0;
  sub_row           RECORD;
  base_url          text;
  retry_secret      text;
  http_req_id       bigint;
BEGIN
  -- Plan C: the kitchen is closed during the break, so no plan starts today.
  IF EXISTS (SELECT 1 FROM public.intake_settings WHERE season_phase = 'break') THEN  -- Plan C
    dispatched_count := 0;  -- Plan C
    skipped_no_config := 0;  -- Plan C
    RETURN NEXT;  -- Plan C
    RETURN;  -- Plan C
  END IF;  -- Plan C

  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'dispatch_start_day_emails_tick: required vault secrets missing';
    dispatched_count := 0;
    skipped_no_config := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR sub_row IN
    SELECT id
    FROM public.subscriptions
    WHERE start_date = CURRENT_DATE
      AND start_email_sent_at IS NULL
      AND season_hold_id IS NULL  -- Plan C: a held plan does not start today
    LIMIT 200
  LOOP
    SELECT net.http_post(
      url     := base_url || '/api/internal/start-day-email-send',
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
$function$;

COMMIT;

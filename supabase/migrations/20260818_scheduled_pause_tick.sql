-- ============================================================================
-- intake_scheduled_pause_tick — flips the seasonal pause ON the first AE day
-- AFTER pause_scheduled_for (the last delivery day). Runs daily at 00:15 AE,
-- ten minutes after subscription_status_tick so the last day's statuses have
-- already settled. Performs EXACTLY the transition the admin button performs
-- (src/app/admin/season/actions.ts): paused=true, paused_at=now(),
-- paused_by='schedule', cycle_started_at=now() — cycle_ended_at is left
-- alone, exactly like the manual path. The schedule is consumed (set null)
-- in the same statement so the flip can never re-fire.
-- If the owner paused manually before the date arrived, the tick just clears
-- the schedule and touches nothing else.
-- Dubai has no DST; '(now() at time zone ''Asia/Dubai'')::date' is exact.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-18. This file is the source-control mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.intake_scheduled_pause_tick()
RETURNS TABLE(flipped boolean, cleared_only boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_ae date := (now() at time zone 'Asia/Dubai')::date;
  r record;
BEGIN
  flipped := false; cleared_only := false;

  SELECT id, paused, pause_scheduled_for INTO r
  FROM public.intake_settings
  WHERE pause_scheduled_for IS NOT NULL
    AND pause_scheduled_for < today_ae
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEXT; RETURN;
  END IF;

  IF r.paused THEN
    UPDATE public.intake_settings
    SET pause_scheduled_for = NULL, updated_at = now()
    WHERE id = r.id;
    cleared_only := true;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.intake_settings
  SET paused = true,
      paused_at = now(),
      paused_by = 'schedule',
      cycle_started_at = now(),
      pause_scheduled_for = NULL,
      updated_at = now()
  WHERE id = r.id AND paused = false;

  flipped := true;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.intake_scheduled_pause_tick() IS
  'Daily 00:15 AE. Flips the seasonal pause ON the first AE day after pause_scheduled_for, performing the same transition as the admin button with paused_by=schedule. Clears the schedule either way.';

REVOKE EXECUTE ON FUNCTION public.intake_scheduled_pause_tick() FROM public, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('intake_scheduled_pause_00_15_ae');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'intake_scheduled_pause_00_15_ae',
  '15 20 * * *',
  $cron$ SELECT public.intake_scheduled_pause_tick(); $cron$
);

COMMIT;

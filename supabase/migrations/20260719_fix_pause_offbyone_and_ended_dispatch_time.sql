-- Audit 2026-07-19 fixes (applied live via MCP the same day; this file is the
-- repo record).
--
-- 1. Planned-pause off-by-one.
--    subscription_status_tick (20:30 UTC) flips planned pauses to Paused for
--    the NEW AE day; subscription_pause_tick (20:35 UTC) then counts
--    CURRENT_DATE — the AE day that just ENDED at 20:00 UTC and was fully
--    delivered. That gave every planned pause one spurious paused_day (and,
--    via trg_subscriptions_recompute_end_date, one free end_date extension).
--    Guard: only count a day as paused if the pause began before that day
--    ended (AE day D ends at D 20:00 UTC). NULL pause_date keeps legacy
--    behavior.
CREATE OR REPLACE FUNCTION public.subscription_pause_tick()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF public.is_company_closure(CURRENT_DATE) THEN
    RETURN;
  END IF;

  UPDATE public.subscriptions
  SET
    paused_days  = COALESCE(paused_days, 0) + 1,
    paused_dates = CASE
      WHEN CURRENT_DATE::text = ANY(COALESCE(paused_dates, '{}'::text[]))
        THEN paused_dates
      ELSE array_append(COALESCE(paused_dates, '{}'::text[]), CURRENT_DATE::text)
    END,
    last_pause_tick_date = CURRENT_DATE
  WHERE status = 'Paused'
    AND public.is_delivery_day(CURRENT_DATE, week_type)
    AND (last_pause_tick_date IS NULL OR last_pause_tick_date < CURRENT_DATE)
    AND (pause_date IS NULL OR pause_date < CURRENT_DATE + interval '20 hours');
END;
$function$;

-- 2. "Plan ended" message fired a day late.
--    The dispatch job ran at 20:15 UTC (00:15 AE) but subscriptions only flip
--    to Ended at 20:30 UTC (00:30 AE), so the message always caught the flip
--    the FOLLOWING night. Moved to 20:45 UTC (00:45 AE), 15 minutes after the
--    flip. Job renamed so the name stays truthful.
SELECT cron.unschedule('dispatch_subscription_ended_0015_ae');
SELECT cron.schedule(
  'dispatch_subscription_ended_0045_ae',
  '45 20 * * *',
  ' SELECT public.dispatch_subscription_ended_tick(); '
);

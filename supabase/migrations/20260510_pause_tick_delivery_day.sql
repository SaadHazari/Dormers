-- ============================================================================
-- Fix: subscription_pause_tick should only count delivery days
--
-- Previously the cron incremented paused_days for every Paused sub every
-- night, including weekends (Sat for 6DAYS, Sat+Sun for 5DAYS). This inflated
-- paused_days with non-delivery nights and pushed end_date out further than
-- warranted — the customer was effectively getting free calendar extension for
-- days when the kitchen wasn't operating anyway.
--
-- Fix: mirror the delivery_tick pattern and gate the increment on
-- is_delivery_day(CURRENT_DATE, week_type). The pause_tick fires at 20:10 UTC
-- (00:10 AE), four hours after delivery_tick at 16:00 UTC (20:00 AE). Both
-- crons share the same CURRENT_DATE (UTC calendar day), so the delivery-day
-- check is perfectly aligned — paused subs now shadow active subs on the exact
-- same operational-day gate.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.subscription_pause_tick()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Increment paused_days only on delivery days for this sub's week_type.
  -- Non-delivery nights (Sun for 6DAYS, Sat+Sun for 5DAYS) are skipped so the
  -- customer's end_date extension reflects actual missed meal slots, not raw
  -- calendar days. The end_date trigger fires automatically on each increment.
  UPDATE public.subscriptions
  SET paused_days = COALESCE(paused_days, 0) + 1
  WHERE status = 'Paused'
    AND public.is_delivery_day(CURRENT_DATE, week_type);
END;
$$;

COMMIT;

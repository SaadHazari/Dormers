-- ============================================================================
-- Add `paused_dates` to subscriptions and teach the daily pause cron to
-- record them.
--
-- Why: `paused_days` is a count, not a date list — so we know HOW MANY
-- days a sub was paused but not WHICH ones. The weekly-review surface
-- needs to identify paused days inside a reviewed week so meals for
-- those days render greyed-out ("Paused meal") instead of being asked
-- to review a meal that never arrived.
--
-- This column is parallel to `skipped_dates` (already serving the same
-- role for individual skips). Cron-populated, append-only.
-- ============================================================================

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paused_dates text[] NOT NULL DEFAULT '{}';

-- Teach the daily pause_tick to record the date alongside the count.
-- Each tick fires at 20:10 UTC (00:10 AE) and at that moment CURRENT_DATE
-- in UTC = the AE delivery day that just ended. We append it only on
-- delivery days (mirroring the count gate) and only if it's not already
-- present (idempotent if the cron ever fires twice for the same day).
CREATE OR REPLACE FUNCTION public.subscription_pause_tick()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
  SET
    paused_days  = COALESCE(paused_days, 0) + 1,
    paused_dates = CASE
      WHEN CURRENT_DATE::text = ANY(COALESCE(paused_dates, '{}'::text[]))
        THEN paused_dates
      ELSE array_append(COALESCE(paused_dates, '{}'::text[]), CURRENT_DATE::text)
    END
  WHERE status = 'Paused'
    AND public.is_delivery_day(CURRENT_DATE, week_type);
END;
$$;

COMMIT;

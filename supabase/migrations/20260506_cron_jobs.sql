-- ============================================================================
-- Subscription state machine — Phase 2: cron jobs
--
-- Three pg_cron jobs that turn the state machine from request-driven to
-- time-driven. Without these, statuses never change without a user load.
--
--   Cron A — subscription_status_tick   00:05 Asia/Dubai (20:05 UTC)
--     • Skipped   → Active   (auto-revert so today's delivery proceeds)
--     • Scheduled → Active   (on start_date)
--     • Active|Paused with delivered_meals >= total_meals AND end_date < today
--                  → Ended   (consumption + calendar both consumed)
--
--   Cron B — subscription_delivery_tick 20:00 Asia/Dubai (16:00 UTC)
--     • For every Active sub on a delivery day:
--         delivered_meals = LEAST(total_meals, delivered_meals + meals_per_day)
--     • Skipped/Paused subs are skipped because they're not Active.
--
--   Cron C — subscription_pause_tick    00:10 Asia/Dubai (20:10 UTC)
--     • For every Paused sub: paused_days += 1
--     • The end_date trigger fires automatically and pushes end_date out.
--
-- All times in UTC (pg_cron is UTC-only on Supabase). Asia/Dubai is UTC+4
-- year-round (no DST), so the conversion is stable.
-- ============================================================================

BEGIN;

-- ── 0. Enable pg_cron ──────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 1. Helper: is_delivery_day(date, week_type) ────────────────────────────
-- Returns true iff this date is a kitchen delivery day for this week_type.
-- ISO dow: 1=Mon … 7=Sun.

CREATE OR REPLACE FUNCTION public.is_delivery_day(p_date date, p_week_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_week_type = '7DAYS' THEN true
    WHEN p_week_type = '6DAYS' THEN EXTRACT(isodow FROM p_date)::int <> 7
    WHEN p_week_type = '5DAYS' THEN EXTRACT(isodow FROM p_date)::int NOT IN (6, 7)
    ELSE true
  END;
$$;

-- ── 2. Wrapper: subscription_status_tick() ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.subscription_status_tick()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Skipped → Active (auto-revert at the start of every day)
  UPDATE public.subscriptions
  SET status = 'Active'
  WHERE status = 'Skipped';

  -- Scheduled → Active when start_date arrives
  UPDATE public.subscriptions
  SET status = 'Active'
  WHERE status = 'Scheduled' AND start_date <= CURRENT_DATE;

  -- Active|Paused → Ended only when BOTH the calendar AND consumption are done.
  -- Pure end_date < today is not enough — a sub that's had its end_date pushed
  -- out by a skip should still get its final meal.
  UPDATE public.subscriptions
  SET status = 'Ended'
  WHERE status IN ('Active', 'Paused')
    AND delivered_meals >= total_meals
    AND end_date < CURRENT_DATE;
END;
$$;

-- ── 3. Wrapper: subscription_delivery_tick() ───────────────────────────────
CREATE OR REPLACE FUNCTION public.subscription_delivery_tick()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Increment delivered_meals for every Active sub on a delivery day.
  -- LEAST() guards against drift if a subscription somehow has more delivered
  -- than total (data corruption / manual fixes).
  UPDATE public.subscriptions
  SET delivered_meals = LEAST(
        total_meals,
        COALESCE(delivered_meals, 0) + COALESCE(meals_per_day, 1)
      )
  WHERE status = 'Active'
    AND public.is_delivery_day(CURRENT_DATE, week_type);
END;
$$;

-- ── 4. Wrapper: subscription_pause_tick() ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.subscription_pause_tick()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- For every Paused sub, +1 paused_days. The end_date trigger fires
  -- automatically and pushes end_date out by one calendar day.
  UPDATE public.subscriptions
  SET paused_days = COALESCE(paused_days, 0) + 1
  WHERE status = 'Paused';
END;
$$;

-- ── 5. Schedule the jobs ───────────────────────────────────────────────────
-- Idempotent: unschedule existing jobs by name (errors swallowed) before
-- re-scheduling. Times converted from Asia/Dubai (UTC+4, no DST) to UTC.

DO $$
BEGIN
  PERFORM cron.unschedule('subscription_status_tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('subscription_delivery_tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('subscription_pause_tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule (cron format: minute hour day-of-month month day-of-week, UTC)
SELECT cron.schedule(
  'subscription_status_tick',
  '5 20 * * *',     -- 00:05 Asia/Dubai = 20:05 UTC
  'SELECT public.subscription_status_tick();'
);

SELECT cron.schedule(
  'subscription_pause_tick',
  '10 20 * * *',    -- 00:10 Asia/Dubai = 20:10 UTC
  'SELECT public.subscription_pause_tick();'
);

SELECT cron.schedule(
  'subscription_delivery_tick',
  '0 16 * * *',     -- 20:00 Asia/Dubai = 16:00 UTC
  'SELECT public.subscription_delivery_tick();'
);

COMMIT;

-- ============================================================================
-- VERIFICATION
--
-- List scheduled jobs:
--   SELECT jobname, schedule, command, active FROM cron.job
--   WHERE jobname LIKE 'subscription_%';
--
-- Manually run one immediately (e.g., to test status_tick):
--   SELECT public.subscription_status_tick();
--
-- View recent run history:
--   SELECT j.jobname, r.start_time, r.end_time, r.status, r.return_message
--   FROM cron.job_run_details r
--   JOIN cron.job j ON j.jobid = r.jobid
--   WHERE j.jobname LIKE 'subscription_%'
--   ORDER BY r.start_time DESC
--   LIMIT 20;
-- ============================================================================

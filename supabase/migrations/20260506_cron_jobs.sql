-- ============================================================================
-- Subscription state machine — Phase 2: cron jobs
--
-- Three pg_cron jobs that turn the state machine from request-driven to
-- time-driven. Without these, statuses never change without a user load.
--
--   Cron A — subscription_status_tick   00:05 Asia/Dubai (20:05 UTC)
--     • Skipped   → Active   (auto-revert so today's delivery proceeds)
--     • Scheduled → Active   (on start_date)
--     • Active    → Skipped  (pre-registered future skip in skipped_dates)
--     • Active|Skipped → Paused (planned_pause_start = today)
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
  -- 1. Revert yesterday's Skipped → Active.
  UPDATE public.subscriptions
  SET status = 'Active'
  WHERE status = 'Skipped';

  -- 2. Promote subs whose start_date has arrived: Scheduled → Active.
  UPDATE public.subscriptions
  SET status = 'Active'
  WHERE status = 'Scheduled' AND start_date <= public.ae_today();

  -- 3. Promote pre-registered future skips: Active → Skipped when today
  --    is in skipped_dates.
  UPDATE public.subscriptions
  SET status = 'Skipped'
  WHERE status = 'Active'
    AND public.ae_today() = ANY(skipped_dates);

  -- 4. Activate planned pauses. When today AE matches planned_pause_start
  --    and the sub is Active or Skipped, flip to Paused. Skipped→Paused is
  --    allowed because Paused takes precedence operationally. pause_date
  --    is stamped so paused_days starts incrementing via pause_tick;
  --    resume_cutoff_date is set so a same-day resume gets the cutoff-aware
  --    messaging rather than the bare same-day lock; planned_pause_start
  --    is cleared since it's served its purpose.
  UPDATE public.subscriptions
  SET status = 'Paused',
      pause_date = NOW(),
      resume_cutoff_date = public.ae_today(),
      planned_pause_start = NULL
  WHERE status IN ('Active', 'Skipped')
    AND planned_pause_start = public.ae_today();

  -- 5. End completed cycles.
  UPDATE public.subscriptions
  SET status = 'Ended'
  WHERE status IN ('Active', 'Paused')
    AND delivered_meals >= total_meals
    AND end_date < public.ae_today();
END;
$$;

-- ── 3. Wrapper: subscription_delivery_tick() ───────────────────────────────
CREATE OR REPLACE FUNCTION public.subscription_delivery_tick()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cogs_today numeric;
BEGIN
  cogs_today := public.current_cogs_aed_per_meal();

  WITH delivered_today AS (
    UPDATE public.subscriptions s
       SET delivered_meals = LEAST(
             s.total_meals,
             COALESCE(s.delivered_meals, 0) + COALESCE(s.meals_per_day, 1)
           ),
           last_delivery_tick_date = CURRENT_DATE
     WHERE s.status = 'Active'
       AND COALESCE(s.delivered_meals, 0) < s.total_meals
       AND public.is_delivery_day(CURRENT_DATE, s.week_type)
       AND (s.resume_cutoff_date IS NULL OR s.resume_cutoff_date::date < CURRENT_DATE)
       AND (s.last_delivery_tick_date IS NULL OR s.last_delivery_tick_date < CURRENT_DATE)
    RETURNING s.id AS subscription_id, s.customer_id, s.plan_name
  )
  INSERT INTO public.comped_meal_ledger (
    subscription_id, customer_id, plan_name, cogs_aed, expense_category, delivered_at
  )
  SELECT d.subscription_id,
         d.customer_id,
         d.plan_name,
         cogs_today,
         public.expense_category_for_plan(d.plan_name),
         now()
    FROM delivered_today d
   WHERE public.expense_category_for_plan(d.plan_name) IS NOT NULL;
END;
$$;

-- ── 4. Wrapper: subscription_pause_tick() ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.subscription_pause_tick()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
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
    AND (last_pause_tick_date IS NULL OR last_pause_tick_date < CURRENT_DATE);
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

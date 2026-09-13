-- ============================================================================
-- 2026-09-13 — pause/closure days are paid back in DELIVERY days.
-- (Applied to the live DB via MCP the same day; this file is the repo record.
--  Bodies below are exactly what was applied.)
--
-- subscription_pause_tick and subscription_closure_tick count a day only when
-- is_delivery_day() is true, but compute_subscription_end_date added the sum
-- as CALENDAR days and merely nudged a weekend landing forward. A 5DAYS plan
-- ending Friday with three closed days therefore ended Monday — one delivery
-- day back for three lost. Meals were never lost (status_tick's Ended needs
-- delivered_meals >= total_meals), but end_date sat short of the last meal,
-- the dashboard grid was 1–2 cells short, queued renewals were anchored to the
-- wrong day, and the customer read "Days left 0" beside "3 deliveries left".
--
-- 1. compute_subscription_end_date walks forward one delivery day per owed day.
-- 2. subscription_closure_tick becomes idempotent (last_closure_tick_date),
--    stops extending plans that have not started, skips held staff renewals,
--    and skips a customer-skipped day (already credited by the skip).
-- 3. trg_subscriptions_shift_queued_scheduled also fires on closure_days, so a
--    closure extension pushes a queued renewal like a pause does.
-- 4. Live rows recomputed under the new maths.
-- ============================================================================

-- ── 1. compute_subscription_end_date ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_subscription_end_date(p_start_date date, p_plan_kind text, p_week_type text, p_skip_count integer, p_pause_days integer)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_w           integer;
  v_d_base      integer;
  v_d           integer;
  v_skip        integer := GREATEST(0, COALESCE(p_skip_count, 0));
  v_pause       integer := GREATEST(0, COALESCE(p_pause_days, 0));
  v_wd_start    integer;
  v_shift       integer;
  v_s2          date;
  v_wd2         integer;
  v_x           integer;
  v_penalty     integer;
  v_total_days  integer;
  v_calc        date;
  v_owed        integer;
  v_end_dow     integer;
  v_end_shift   integer;
BEGIN
  v_w := CASE p_week_type
           WHEN '5DAYS' THEN 5
           WHEN '6DAYS' THEN 6
           WHEN '7DAYS' THEN 7
           ELSE 6
         END;
  v_d_base := CASE lower(p_plan_kind)
                WHEN 'trial'   THEN 1
                WHEN 'weekly'  THEN v_w
                WHEN 'monthly' THEN 4 * v_w
                ELSE 0
              END;
  IF v_d_base = 0 THEN RETURN NULL; END IF;
  v_d := v_d_base + v_skip;
  v_wd_start := EXTRACT(isodow FROM p_start_date)::integer;
  v_shift := CASE
    WHEN p_week_type = '7DAYS' THEN 0
    WHEN p_week_type = '6DAYS' AND v_wd_start = 7 THEN 1
    WHEN p_week_type = '5DAYS' AND v_wd_start = 6 THEN 2
    WHEN p_week_type = '5DAYS' AND v_wd_start = 7 THEN 1
    ELSE 0
  END;
  v_s2 := p_start_date + v_shift;
  v_wd2 := EXTRACT(isodow FROM v_s2)::integer;
  v_x := v_d - 1;
  v_penalty := CASE
    WHEN p_week_type = '7DAYS' THEN 0
    WHEN p_week_type = '6DAYS' THEN floor(((v_wd2 - 1) + v_x) / 6.0)::integer
    WHEN p_week_type = '5DAYS' THEN 2 * floor(((v_wd2 - 1) + v_x) / 5.0)::integer
    ELSE 0
  END;
  v_total_days := v_x + v_penalty;
  v_calc := v_s2 + v_total_days;

  -- Pay back every paused or closed delivery day with a delivery day: the
  -- ticks only count such days on is_delivery_day() dates, so calendar
  -- arithmetic here under-extended whenever the payback crossed a weekend.
  v_owed := v_pause;
  WHILE v_owed > 0 LOOP
    v_calc := v_calc + 1;
    IF public.is_delivery_day(v_calc, p_week_type) THEN
      v_owed := v_owed - 1;
    END IF;
  END LOOP;

  -- A base end can still land off-cadence; push it forward (no-op after a walk).
  v_end_dow := EXTRACT(isodow FROM v_calc)::integer;
  v_end_shift := CASE
    WHEN p_week_type = '7DAYS' THEN 0
    WHEN p_week_type = '6DAYS' AND v_end_dow = 7 THEN 1
    WHEN p_week_type = '5DAYS' AND v_end_dow = 6 THEN 2
    WHEN p_week_type = '5DAYS' AND v_end_dow = 7 THEN 1
    ELSE 0
  END;
  RETURN v_calc + v_end_shift;
END;
$function$;

-- ── 2. subscription_closure_tick ───────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_closure_tick_date date;

COMMENT ON COLUMN public.subscriptions.last_closure_tick_date IS
  'Last CURRENT_DATE on which subscription_closure_tick credited this plan a closure day. Makes the tick idempotent: a re-run on the same night no longer hands out a second day.';

CREATE OR REPLACE FUNCTION public.subscription_closure_tick()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_company_closure(CURRENT_DATE) THEN
    RETURN;
  END IF;

  UPDATE public.subscriptions
  SET closure_days = COALESCE(closure_days, 0) + 1,
      last_closure_tick_date = CURRENT_DATE
  WHERE status IN ('Active', 'Paused', 'Scheduled')
    -- A plan that has not started lost nothing tonight. start_date = today
    -- is included: this tick (20:15 UTC) runs before status_tick promotes
    -- Scheduled → Active (20:30 UTC), and that customer's first dinner was
    -- the one the closure took.
    AND start_date <= CURRENT_DATE
    -- A staff renewal held at the approval gate is not delivering yet.
    AND (staff_approval IS DISTINCT FROM 'pending')
    -- A day the customer chose to skip is already paid back by the skip;
    -- crediting it again would hand out two days for one dinner.
    AND NOT (CURRENT_DATE = ANY(COALESCE(skipped_dates, '{}'::date[])))
    AND public.is_delivery_day(CURRENT_DATE, week_type)
    AND COALESCE(delivered_meals, 0) < total_meals
    AND (last_closure_tick_date IS NULL OR last_closure_tick_date < CURRENT_DATE);
END;
$function$;

-- ── 3. Queued renewals follow a closure extension too ──────────────────────
DROP TRIGGER IF EXISTS trg_subscriptions_shift_queued_scheduled ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_shift_queued_scheduled
  AFTER INSERT OR UPDATE OF start_date, plan_name, week_type, skipped_meals_count, paused_days, closure_days
  ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._subscriptions_shift_queued_scheduled();

-- ── 4. Recompute live plans under the new maths ────────────────────────────
-- UPDATE OF paused_days fires the BEFORE recompute trigger and the AFTER
-- queue-shift trigger even when the value is unchanged. Ended plans are
-- history and stay as they were.
UPDATE public.subscriptions
   SET paused_days = paused_days
 WHERE status IN ('Active', 'Paused', 'Skipped', 'Scheduled');

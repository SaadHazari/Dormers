-- ============================================================================
-- Staff renewal approval — the gate, in source control, plus the alerts.
-- (Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) on 2026-09-02.)
--
-- Part 1 closes a source-control hole. 20260612_staff_renewal_approval.sql
-- ends with a comment saying the tick guard "lives in the live DB", and the
-- repo's canonical subscription_status_tick (20260506_cron_jobs.sql) has no
-- guard at all. Re-applying that file would have silently reopened the gate,
-- and no test could have seen the difference. The body below is the live
-- function read back verbatim on 2026-09-02, guard included.
--
-- NOTE the schedule: live runs at 20:30 UTC (00:30 AE), not the 20:05 in
-- 20260506_cron_jobs.sql. This file does not reschedule anything — it only
-- records the drift so the next person doesn't "fix" the live cron back to
-- a stale repo value. Reconciling the rest of the migrations against live is
-- a separate job (see .planning/release-it/AUDIT.md).
--
-- Part 2 is the alerting: a renewal nobody looks at is a renewal that never
-- starts. One sat pending from 2026-08-24 and was found by reading the
-- database rather than by being told.
-- ============================================================================

BEGIN;

-- ── Part 1: the gate, verbatim from live ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.subscription_status_tick()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- 1. Revert yesterday's Skipped → Active.
  UPDATE public.subscriptions
  SET status = 'Active'
  WHERE status = 'Skipped';

  -- 2. Promote subs whose start_date has arrived: Scheduled → Active.
  --    Staff renewals hold at the gate until the admin approves them.
  UPDATE public.subscriptions
  SET status = 'Active'
  WHERE status = 'Scheduled' AND start_date <= public.ae_today()
    AND (staff_approval IS DISTINCT FROM 'pending');

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
$function$;

-- ── Part 1b: a column the repo never created ───────────────────────────────
-- original_start_date exists live (stamped BEFORE INSERT by
-- _subscriptions_set_original_start_date, read by
-- _subscriptions_shift_queued_scheduled as the floor a queued sub can never
-- be dragged below) but no migration in this folder creates it. Approving a
-- renewal writes it, so on a database rebuilt from the repo the UPDATE would
-- error and no staff renewal could be approved at all. Idempotent: a no-op
-- against live, load-bearing against a rebuild.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS original_start_date date;

COMMENT ON COLUMN public.subscriptions.original_start_date IS
  'The start date this sub was first scheduled for. Floors _subscriptions_shift_queued_scheduled so a queue is never dragged earlier than intended. Re-stamped when an admin approves a staff renewal, because approval is what creates that renewal''s real start date.';

-- ── Part 1c: the queue-shift trigger, verbatim from live ───────────────────
-- approveStaffRenewal's correctness rests on this function's floor: it moves
-- a queued sub to GREATEST(live.end_date + 1, original_start_date), which is
-- why approval re-stamps original_start_date rather than start_date alone.
-- The repo's only definition (20260506_shift_queued_on_extension.sql) predates
-- that floor and never reads the column, so the repo described behaviour the
-- database has not had for months. Read back from live on 2026-09-02.
CREATE OR REPLACE FUNCTION public._subscriptions_shift_queued_scheduled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_min_start  date;
  v_queued     record;
  v_new_start  date;
  v_anchor     date;
  v_safety     int;
BEGIN
  IF NEW.status = 'Scheduled' THEN RETURN NEW; END IF;
  IF NEW.end_date IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.end_date IS NOT DISTINCT FROM NEW.end_date THEN
    RETURN NEW;
  END IF;

  v_min_start := NEW.end_date + 1;

  -- Consider ALL queued subs for this customer (no longer just the ones that
  -- currently overlap). This is what makes the trigger bidirectional: when
  -- the current sub's end_date contracts, queues that were pushed forward
  -- by a previous extension now get pulled back toward their anchor.
  FOR v_queued IN
    SELECT id, week_type, start_date, original_start_date
    FROM public.subscriptions
    WHERE customer_id = NEW.customer_id
      AND id <> NEW.id
      AND status = 'Scheduled'
  LOOP
    v_anchor := COALESCE(v_queued.original_start_date, v_queued.start_date);
    -- Floor at the anchor so we never drag the queue earlier than the
    -- customer originally scheduled it.
    v_new_start := GREATEST(v_min_start, v_anchor);
    v_safety := 0;
    WHILE NOT public.is_delivery_day(v_new_start, v_queued.week_type) AND v_safety < 14 LOOP
      v_new_start := v_new_start + 1;
      v_safety := v_safety + 1;
    END LOOP;

    -- Only UPDATE when the new start differs from the current — avoids
    -- triggering recursive recompute on a no-op.
    IF v_new_start IS DISTINCT FROM v_queued.start_date THEN
      UPDATE public.subscriptions
      SET start_date = v_new_start
      WHERE id = v_queued.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ── Part 2: alerting ───────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS staff_approval_alerted_at timestamptz;

COMMENT ON COLUMN public.subscriptions.staff_approval_alerted_at IS
  'Last time notify_pending_staff_renewals_tick pinged the admin about this renewal. Drives once-then-daily cadence.';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS staff_leak_alerted_at timestamptz;

COMMENT ON COLUMN public.subscriptions.staff_leak_alerted_at IS
  'Last time the admin was alerted that this staff sub went live while its approval was still pending. Separate from staff_approval_alerted_at so the routine reminder can never suppress the emergency.';

-- Runs every 15 minutes and does two things:
--
--   1. Pending renewals — alerts once when one appears, then once a day
--      while it is still waiting.
--
--   2. The impossible state — a Staff Monthly sub that is LIVE while
--      staff_approval is still 'pending'. Step 2 above refuses to promote
--      those, so if one appears the gate has failed and the kitchen is
--      already cooking (the label list is status = 'Active'). Hourly, on
--      its own stamp, so the daily reminder can never mute the emergency.
--
-- Alerting lives in the database rather than the app because both entry
-- paths — the free 5-day renewal and the Stripe webhook for the prepaid
-- 6-day — reach 'pending' through the same BEFORE INSERT trigger. One
-- implementation covers both and cannot be bypassed by a code path nobody
-- remembered.
CREATE OR REPLACE FUNCTION public.notify_pending_staff_renewals_tick()
RETURNS TABLE(alerted_count int, leaked_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  alerted_total int := 0;
  leaked_total  int := 0;
  r             RECORD;
  days_waiting  int;
  waiting_for   text;
  cadence       text;
  price_line    text;
  alert_msg     text;
  http_req_id   bigint;
BEGIN
  FOR r IN
    SELECT s.id, s.status, s.week_type, s.created_at, c.name AS customer_name
    FROM public.subscriptions s
    LEFT JOIN public.customers c ON c.id = s.customer_id
    WHERE s.plan_name = 'Staff Monthly'
      AND s.staff_approval = 'pending'
      AND (
        -- Waiting at the gate, as designed: once, then daily.
        (s.status = 'Scheduled'
          AND (s.staff_approval_alerted_at IS NULL
               OR s.staff_approval_alerted_at < now() - interval '24 hours'))
        OR
        -- Live without approval: should be unreachable. Hourly until fixed,
        -- on its own stamp so the reminder above cannot mute it. Sharing one
        -- stamp meant a renewal pinged as pending less than 24h before it
        -- leaked stayed silent for the rest of that window.
        (s.status IN ('Active', 'Paused', 'Skipped')
          AND (s.staff_leak_alerted_at IS NULL
               OR s.staff_leak_alerted_at < now() - interval '1 hour'))
      )
    ORDER BY s.created_at ASC
    LIMIT 20
  LOOP
    cadence := CASE WHEN r.week_type = '6DAYS' THEN '6-day (Mon-Sat)' ELSE '5-day (Mon-Fri)' END;
    price_line := CASE WHEN r.week_type = '6DAYS' THEN 'prepaid AED 80' ELSE 'free' END;

    IF r.status = 'Scheduled' THEN
      days_waiting := EXTRACT(DAY FROM (now() - r.created_at))::int;
      waiting_for := CASE
        WHEN days_waiting = 0 THEN 'today'
        WHEN days_waiting = 1 THEN 'yesterday'
        ELSE format('%s days ago', days_waiting)
      END;
      alert_msg := format(
        'Staff renewal waiting for your approval: %s picked the %s plan (%s), queued %s. '
        || 'Nothing starts until you approve it, and the first delivery day is set the moment you do. '
        || 'Approve or decline at /admin/staff.',
        COALESCE(r.customer_name, 'An intern'), cadence, price_line, waiting_for
      );

      UPDATE public.subscriptions SET staff_approval_alerted_at = now() WHERE id = r.id;
      alerted_total := alerted_total + 1;
    ELSE
      alert_msg := format(
        'URGENT - staff plan is LIVE without approval: %s has a %s Staff Monthly sub at status %s '
        || 'while staff_approval is still pending. The approval gate in subscription_status_tick has failed. '
        || 'The kitchen label list is status=Active, so meals may already be cooking. Sub id %s.',
        COALESCE(r.customer_name, 'An intern'), cadence, r.status, r.id
      );

      UPDATE public.subscriptions SET staff_leak_alerted_at = now() WHERE id = r.id;
      leaked_total := leaked_total + 1;
    END IF;

    SELECT public.send_admin_whatsapp_alert(alert_msg, r.id::text) INTO http_req_id;
  END LOOP;

  alerted_count := alerted_total;
  leaked_count  := leaked_total;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.notify_pending_staff_renewals_tick() IS
  'Every 15 min. WhatsApps the admin about staff renewals awaiting approval (once, then daily), and hourly if a pending staff sub is ever live.';

REVOKE EXECUTE ON FUNCTION public.notify_pending_staff_renewals_tick() FROM public, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('notify_pending_staff_renewals_15min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'notify_pending_staff_renewals_15min',
  '*/15 * * * *',
  $cron$ SELECT public.notify_pending_staff_renewals_tick(); $cron$
);

COMMIT;

-- ============================================================================
-- Phase 8K Model C — daily review-credit cleanup cron.
--
-- The TS helper (src/lib/dorm-wars/review-cleanup.ts) runs lazily: any
-- dashboard navigation triggers it for that one customer. That covers
-- ~all active users. This cron handles the long tail — users who don't
-- visit the dashboard for weeks after their cycle ends. Without it,
-- their pending pool sits stranded forever (UI shows "AED N pending"
-- but it's never resolved).
--
-- Logic mirrors the TS helper exactly:
--   For each (customer, sub) with pending weekly_review credits whose
--   linked reviews' latest week_end_date + 30 days is in the past:
--     • If submitted reviews >= expected weeks → approve the pending
--       pool (drift recovery — the original threshold-flip failed but
--       the user did earn the reward)
--     • Else → reject the pending pool (cycle forfeit; user missed at
--       least one week)
--
-- Scheduled at 20:40 UTC (00:40 Dubai), 10 minutes after the existing
-- status_tick chain finishes. Safe to run more often if needed — the
-- query is idempotent (filtered to status='pending', so already-flipped
-- rows never re-process).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.review_credit_cleanup_tick()
RETURNS TABLE(approved_count int, rejected_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approved_total int := 0;
  rejected_total int := 0;
  closed_cycle   RECORD;
  submitted_count int;
  expected_weeks  int;
BEGIN
  -- Walk every (customer, subscription) tuple that still has pending
  -- weekly_review credits AND whose latest reviewed week is at least 30
  -- days old (cycle late-window closed). Pre-filtering at SQL level
  -- means we don't pull every pending row into the loop.
  FOR closed_cycle IN
    SELECT
      c.customer_id,
      wr.subscription_id,
      MAX(wr.week_end_date) AS latest_week_end
    FROM public.credits c
    JOIN public.weekly_reviews wr ON wr.id = c.weekly_review_id
    WHERE c.source = 'layer4_weekly_review'
      AND c.status = 'pending'
    GROUP BY c.customer_id, wr.subscription_id
    HAVING MAX(wr.week_end_date) + INTERVAL '30 days' < CURRENT_DATE
  LOOP
    -- Count submitted reviews for this (customer, sub).
    SELECT COUNT(*) INTO submitted_count
    FROM public.weekly_reviews
    WHERE customer_id = closed_cycle.customer_id
      AND subscription_id = closed_cycle.subscription_id;

    -- Compute expected weeks from sub's date range. Mirrors the TS
    -- getSubscriptionWeeks helper: floor((end - start) / 7).
    SELECT FLOOR((s.end_date - s.start_date) / 7) INTO expected_weeks
    FROM public.subscriptions s
    WHERE s.id = closed_cycle.subscription_id;

    -- Defensive: skip if subscription lookup failed (shouldn't happen
    -- via FK, but safe against bad data).
    IF expected_weeks IS NULL THEN
      CONTINUE;
    END IF;

    IF submitted_count >= expected_weeks THEN
      -- Drift recovery — user hit the threshold but the original
      -- threshold-flip failed. Approve the pool.
      WITH flipped AS (
        UPDATE public.credits SET status = 'approved'
        WHERE customer_id = closed_cycle.customer_id
          AND source = 'layer4_weekly_review'
          AND status = 'pending'
          AND weekly_review_id IN (
            SELECT id FROM public.weekly_reviews
            WHERE customer_id = closed_cycle.customer_id
              AND subscription_id = closed_cycle.subscription_id
          )
        RETURNING 1
      )
      SELECT approved_total + COUNT(*) INTO approved_total FROM flipped;
    ELSE
      -- Cycle forfeit — user missed at least one week.
      WITH rejected AS (
        UPDATE public.credits SET status = 'rejected'
        WHERE customer_id = closed_cycle.customer_id
          AND source = 'layer4_weekly_review'
          AND status = 'pending'
          AND weekly_review_id IN (
            SELECT id FROM public.weekly_reviews
            WHERE customer_id = closed_cycle.customer_id
              AND subscription_id = closed_cycle.subscription_id
          )
        RETURNING 1
      )
      SELECT rejected_total + COUNT(*) INTO rejected_total FROM rejected;
    END IF;
  END LOOP;

  approved_count := approved_total;
  rejected_count := rejected_total;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.review_credit_cleanup_tick() IS
  'Daily sweep for stranded pending weekly_review credits whose cycle late window has closed. Approves pending for users who hit the threshold (drift recovery), rejects pending for users who missed at least one week (forfeit). Idempotent — only touches status=pending rows.';

-- ── Schedule via pg_cron ───────────────────────────────────────────────────
-- 20:40 UTC = 00:40 Dubai. Runs after status_tick (20:30) + pause_tick
-- (20:35) so all subscription state changes are settled before the
-- cleanup sees them. Daily is sufficient — the lazy cleanup on dashboard
-- visits handles same-day resolution for active users; this cron only
-- catches the long tail.
--
-- Use unschedule guard so re-running this migration doesn't fail.
DO $$
BEGIN
  PERFORM cron.unschedule('review_credit_cleanup_tick');
EXCEPTION
  WHEN OTHERS THEN
    -- Job didn't exist yet — fine.
    NULL;
END $$;

SELECT cron.schedule(
  'review_credit_cleanup_tick',
  '40 20 * * *',
  $cron$ SELECT public.review_credit_cleanup_tick(); $cron$
);

COMMIT;

-- ============================================================================
-- Atomic streak tick RPC. Replaces the read-then-write logic in
-- /api/dorm-wars/streak/tick/route.ts which had a TOCTOU race: two parallel
-- requests could both read the same row + both write count+1 instead of the
-- correct count+1 once, OR worse — one could read "yesterday" and increment
-- while another read "older" and reset, leaving the streak wiped.
--
-- Atomicity guarantees:
--   • Single statement, so Postgres ensures either-all-or-nothing.
--   • ON CONFLICT DO UPDATE clamps the increment/reset to the row that
--     actually exists at COMMIT time, so concurrent inserts converge cleanly.
--   • Date comparisons happen inside the statement against a single now(),
--     not across two server-side roundtrips.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tick_streak(p_customer_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today     date := (now() at time zone 'UTC')::date;
  v_yesterday date := v_today - INTERVAL '1 day';
  v_new_count integer;
BEGIN
  INSERT INTO public.streaks (customer_id, count, last_visit_date_utc, updated_at)
  VALUES (p_customer_id, 1, v_today, now())
  ON CONFLICT (customer_id) DO UPDATE
    SET
      count = CASE
        WHEN public.streaks.last_visit_date_utc = v_today      THEN public.streaks.count
        WHEN public.streaks.last_visit_date_utc = v_yesterday  THEN public.streaks.count + 1
        ELSE 1
      END,
      last_visit_date_utc = v_today,
      updated_at = now()
  RETURNING count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

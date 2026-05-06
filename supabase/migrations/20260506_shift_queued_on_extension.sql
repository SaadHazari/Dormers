-- ════════════════════════════════════════════════════════════════════
--  Auto-shift queued Scheduled sub when primary's end_date moves
-- ════════════════════════════════════════════════════════════════════
--  Bug fixed: when a primary sub's end_date extends (skip via skipMeal,
--  pause via pause_tick, start-date change), it could land on or past
--  a queued Scheduled sub's start_date — creating a same-day overlap
--  in which both subs are Active and delivery_tick double-feeds.
--
--  This trigger fires AFTER UPDATE OF end_date on a primary (non-Scheduled)
--  sub. If a queued Scheduled exists for the same customer with
--  start_date <= new end_date, it shifts that Scheduled's start_date
--  forward to the next delivery day after the primary's new end_date.
--  The end_date trigger on the Scheduled row then re-fires automatically,
--  recomputing its end_date with the same week_type-aware formula.
--
--  We do NOT shift Scheduled subs whose start_date is already comfortably
--  after the primary's new end_date — the customer's explicit start
--  choice is preserved when there's no conflict.
--
--  Skips and pauses past the queued start_date are still bounded by
--  per-sub maxSkips and the customer's own pause behaviour, so the
--  shift cap inside the loop (14 calendar days) is never reached in
--  practice — it's a safety belt against an infinite loop on bad data.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._subscriptions_shift_queued_scheduled()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_min_start  date;
  v_queued     record;
  v_new_start  date;
  v_safety     int;
BEGIN
  -- Only react when a non-Scheduled (primary) row's end_date moves.
  IF NEW.status = 'Scheduled' THEN RETURN NEW; END IF;
  IF NEW.end_date IS NULL THEN RETURN NEW; END IF;
  -- AFTER UPDATE only — skip if end_date didn't actually change.
  IF TG_OP = 'UPDATE' AND OLD.end_date IS NOT DISTINCT FROM NEW.end_date THEN
    RETURN NEW;
  END IF;

  -- Day after primary's new end_date.
  v_min_start := NEW.end_date + 1;

  FOR v_queued IN
    SELECT id, week_type, start_date
    FROM public.subscriptions
    WHERE customer_id = NEW.customer_id
      AND id <> NEW.id
      AND status = 'Scheduled'
      AND start_date <= NEW.end_date
  LOOP
    -- Walk forward to the next valid delivery day for the queued sub's
    -- week_type. Cap iterations to avoid pathological loops on bad data.
    v_new_start := v_min_start;
    v_safety := 0;
    WHILE NOT public.is_delivery_day(v_new_start, v_queued.week_type) AND v_safety < 14 LOOP
      v_new_start := v_new_start + 1;
      v_safety := v_safety + 1;
    END LOOP;

    -- Trigger _subscriptions_recompute_end_date refires on this UPDATE
    -- because start_date is in its UPDATE OF column list.
    UPDATE public.subscriptions
    SET start_date = v_new_start
    WHERE id = v_queued.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_shift_queued_scheduled
  ON public.subscriptions;

-- IMPORTANT: this trigger must watch the same input-column set that the
-- BEFORE _subscriptions_recompute_end_date trigger watches, NOT end_date
-- itself. AFTER UPDATE OF end_date only fires when the UPDATE statement
-- lists end_date — but skip / pause-tick / start-date-change updates
-- never list end_date directly; they list skipped_meals_count,
-- paused_days, or start_date, and the BEFORE trigger writes end_date
-- in-place. Watching the same input columns guarantees we fire whenever
-- end_date could have moved.
CREATE TRIGGER trg_subscriptions_shift_queued_scheduled
  AFTER INSERT OR UPDATE OF
    start_date, plan_name, week_type, skipped_meals_count, paused_days
  ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public._subscriptions_shift_queued_scheduled();

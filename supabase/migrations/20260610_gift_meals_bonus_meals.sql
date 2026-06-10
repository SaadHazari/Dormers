-- ============================================================================
-- Gift meals — admin goodwill meals added onto a live plan.
-- (Applied to the live DB via MCP on 2026-06-10; tracked here for the repo.)
--
-- bonus_meals extends the cycle exactly like a skip does: one extra working
-- day appended to the calendar per meal. The canonical end_date formula
-- (compute_subscription_end_date) already models "extra working days" via
-- its skip-count parameter, so the trigger passes (skips + bonus) through
-- that same parameter — no formula change, no new code path to drift.
--
-- The trigger's UPDATE OF column list must include bonus_meals, otherwise
-- granting a gift would not recompute end_date until the next skip/pause.
-- ============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS bonus_meals smallint NOT NULL DEFAULT 0
  CHECK (bonus_meals >= 0);

CREATE OR REPLACE FUNCTION public._subscriptions_recompute_end_date()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_kind text;
BEGIN
  v_kind := CASE
    WHEN lower(NEW.plan_name) LIKE '%monthly%' THEN 'monthly'
    WHEN lower(NEW.plan_name) LIKE '%weekly%'  THEN 'weekly'
    WHEN lower(NEW.plan_name) LIKE '%trial%'   THEN 'trial'
    ELSE NULL
  END;
  IF v_kind IS NULL OR NEW.start_date IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.end_date := public.compute_subscription_end_date(
    NEW.start_date,
    v_kind,
    NEW.week_type,
    -- Skips and gifted bonus meals both append working days to the cycle;
    -- the formula treats them identically.
    COALESCE(NEW.skipped_meals_count, 0) + COALESCE(NEW.bonus_meals, 0),
    COALESCE(NEW.paused_days, 0)
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_subscriptions_recompute_end_date ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_recompute_end_date
  BEFORE INSERT OR UPDATE OF start_date, plan_name, week_type, skipped_meals_count, paused_days, bonus_meals
  ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._subscriptions_recompute_end_date();

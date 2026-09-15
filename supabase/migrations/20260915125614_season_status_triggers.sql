-- ============================================================================
-- Season wind-down, plan C: guards on subscriptions for the break (spec
-- docs/superpowers/specs/2026-09-14-season-wind-down-design.md §9 G2, G3).
--
-- G2: during the break no plan becomes Active unless the transaction set
--     dormers.season_release = on (season_release_hold and, later, the refund
--     function). Server actions turn SEASON_BREAK into the §7.5 copy.
-- G3: during the break a new Active or Scheduled plan is held on arrival, with
--     a WhatsApp to the owner and no automatic credit (owner, 2026-09-15).
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_status_triggers`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._subscriptions_season_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'Active'
     AND OLD.status IS DISTINCT FROM 'Active'
     AND COALESCE(current_setting('dormers.season_release', true), '') <> 'on'
     AND EXISTS (SELECT 1 FROM public.intake_settings WHERE season_phase = 'break') THEN
    RAISE EXCEPTION 'SEASON_BREAK: plan % cannot restart during the semester break', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_season_guard ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_season_guard
  BEFORE UPDATE OF status ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._subscriptions_season_guard();

CREATE OR REPLACE FUNCTION public._subscriptions_season_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       public.intake_settings;
  v_cycle timestamptz;
  v_hold  uuid;
  v_left  integer;
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN ('Active', 'Scheduled') THEN
    RETURN NULL;
  END IF;
  SELECT * INTO r FROM public.intake_settings;
  IF NOT FOUND OR r.season_phase <> 'break' THEN
    RETURN NULL;
  END IF;

  v_cycle := COALESCE(r.cycle_started_at, r.break_started_at, now());
  v_left := GREATEST(0, NEW.total_meals - COALESCE(NEW.delivered_meals, 0)
                        - COALESCE(NEW.credited_skip_days, 0) * COALESCE(NEW.meals_per_day, 1));

  INSERT INTO public.season_holds (subscription_id, customer_id, cycle_started_at, reason, state, held_meals)
  VALUES (NEW.id, NEW.customer_id, v_cycle, 'season', 'held', v_left)
  ON CONFLICT ON CONSTRAINT season_holds_one_per_plan_per_season DO NOTHING
  RETURNING id INTO v_hold;
  IF v_hold IS NULL THEN
    SELECT id INTO v_hold FROM public.season_holds WHERE subscription_id = NEW.id AND cycle_started_at = v_cycle;
  END IF;

  UPDATE public.subscriptions SET status = 'Scheduled', season_hold_id = v_hold WHERE id = NEW.id;

  -- The alert must never block the plan row a customer paid for.
  BEGIN
    PERFORM public.send_admin_whatsapp_alert(
      format('A plan was created during the semester break, so it is held and will not cook: %s, %s meals, customer %s, plan %s. Check how it was sold and contact the customer.',
             NEW.plan_name, v_left, NEW.customer_id, NEW.id),
      NEW.id::text);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'season arrival alert failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_season_arrival ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_season_arrival
  AFTER INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._subscriptions_season_arrival();

REVOKE EXECUTE ON FUNCTION public._subscriptions_season_guard() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._subscriptions_season_arrival() FROM public, anon, authenticated;

COMMIT;

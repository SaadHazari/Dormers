-- Demo accounts: a customer an investor can sign into on the live site and use
-- like a normal subscriber, even while the season is on its break.
--
-- customers.is_demo marks the account. Every season rule that would hold,
-- freeze or alarm on an Active plan during the break steps around it, so the
-- demo plan keeps delivering (on paper), skipping and pausing like a plan in
-- an open semester. The app mirrors this: the demo customer sees the season
-- as open, checkout refuses them (production takes real cards), and the
-- kitchen, rider and public activity counts leave them out.
--
-- Seeded and purged by scripts/seed-demo-account.ts.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers.is_demo IS
  'Investor demo account. Season break rules skip it; kitchen and rider counts exclude it. See scripts/seed-demo-account.ts.';

CREATE OR REPLACE FUNCTION public.is_demo_customer(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT is_demo FROM public.customers WHERE id = p_customer_id), false);
$$;

REVOKE ALL ON FUNCTION public.is_demo_customer(uuid) FROM PUBLIC, anon, authenticated;

-- ── Arrival: a demo plan created during the break is not held ───────────────
CREATE OR REPLACE FUNCTION public._subscriptions_season_arrival()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r       public.intake_settings;
  v_cycle timestamptz;
  v_hold  uuid;
  v_left  integer;
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN ('Active', 'Scheduled') THEN
    RETURN NULL;
  END IF;
  IF public.is_demo_customer(NEW.customer_id) THEN  -- demo account
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
$function$;

-- ── Guard: a demo plan may resume during the break ──────────────────────────
CREATE OR REPLACE FUNCTION public._subscriptions_season_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'Active'
     AND OLD.status IS DISTINCT FROM 'Active'
     AND COALESCE(current_setting('dormers.season_release', true), '') <> 'on'
     AND NOT public.is_demo_customer(NEW.customer_id)  -- demo account
     AND EXISTS (SELECT 1 FROM public.intake_settings WHERE season_phase = 'break') THEN
    RAISE EXCEPTION 'SEASON_BREAK: plan % cannot restart during the semester break', NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── Delivery tick: during the break only demo plans tick ────────────────────
CREATE OR REPLACE FUNCTION public.subscription_delivery_tick()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  cogs_today numeric;
  v_phase    text;             -- Plan C
  v_wrap     date;             -- Plan C
  v_close    date;             -- Plan C
  v_buffer   boolean := false; -- Plan C
  v_demo_only boolean := false; -- demo account
BEGIN
  IF public.is_company_closure(CURRENT_DATE) THEN
    RETURN;
  END IF;

  -- Plan C (spec G1): the kitchen is closed during the break and after the
  -- close day; between the wrap-up day and the close day only buffer grants cook.
  -- Demo accounts keep ticking through the break so their dashboard stays alive.
  SELECT season_phase, wrap_up_day, close_day INTO v_phase, v_wrap, v_close FROM public.intake_settings;  -- Plan C
  IF v_phase = 'break' THEN  -- Plan C
    v_demo_only := true;  -- demo account
  END IF;  -- Plan C
  IF v_phase = 'winding_down' AND v_wrap IS NOT NULL THEN  -- Plan C
    IF CURRENT_DATE > GREATEST(COALESCE(v_close, v_wrap), v_wrap) THEN  -- Plan C
      RETURN;  -- Plan C
    END IF;  -- Plan C
    v_buffer := CURRENT_DATE > v_wrap;  -- Plan C
  END IF;  -- Plan C

  cogs_today := public.current_cogs_aed_per_meal();

  WITH delivered_today AS (
    UPDATE public.subscriptions s
       SET delivered_meals = LEAST(
             s.total_meals - COALESCE(s.credited_skip_days, 0) * COALESCE(s.meals_per_day, 1),  -- Plan B
             COALESCE(s.delivered_meals, 0) + COALESCE(s.meals_per_day, 1)
           ),
           last_delivery_tick_date = CURRENT_DATE
     WHERE s.status = 'Active'
       AND COALESCE(s.delivered_meals, 0) < s.total_meals - COALESCE(s.credited_skip_days, 0) * COALESCE(s.meals_per_day, 1)  -- Plan B
       AND public.is_delivery_day(CURRENT_DATE, s.week_type)
       AND (s.resume_cutoff_date IS NULL OR s.resume_cutoff_date::date < CURRENT_DATE)
       AND (s.last_delivery_tick_date IS NULL OR s.last_delivery_tick_date < CURRENT_DATE)
       AND s.season_hold_id IS NULL  -- Plan C
       AND (NOT v_demo_only OR public.is_demo_customer(s.customer_id))  -- demo account
       AND (NOT v_buffer OR public._season_buffer_cooks(CURRENT_DATE, v_wrap, v_close, s.week_type, s.skipped_dates, s.season_buffer_grants))  -- Plan C
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
   WHERE public.expense_category_for_plan(d.plan_name) IS NOT NULL
     AND NOT public.is_demo_customer(d.customer_id);  -- demo account: no kitchen cost
END;
$function$;

-- ── Status tick: during the break demo plans still move ─────────────────────
CREATE OR REPLACE FUNCTION public.subscription_status_tick()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE  -- Plan C
  v_break boolean := EXISTS (SELECT 1 FROM public.intake_settings WHERE season_phase = 'break');  -- Plan C
BEGIN
  -- 1. Revert yesterday's Skipped → Active.
  --    Plan C: during the break nothing becomes Active (G2 would refuse it and
  --    roll back the whole tick). The break already held every Skipped plan
  --    with meals left, so a Skipped plan with every meal delivered or
  --    credited simply ends. Demo accounts are the exception: G2 lets them
  --    through, so they return to Active as in an open semester.
  IF v_break THEN  -- Plan C
    UPDATE public.subscriptions  -- Plan C
    SET status = 'Ended'  -- Plan C
    WHERE status = 'Skipped'  -- Plan C
      AND season_hold_id IS NULL  -- Plan C
      AND COALESCE(delivered_meals, 0) + COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1) >= total_meals;  -- Plan C
    UPDATE public.subscriptions  -- demo account
    SET status = 'Active'
    WHERE status = 'Skipped'
      AND public.is_demo_customer(customer_id);
  ELSE  -- Plan C
  UPDATE public.subscriptions
  SET status = 'Active'
  WHERE status = 'Skipped';
  END IF;  -- Plan C

  -- 2. Promote subs whose start_date has arrived: Scheduled → Active.
  --    Staff renewals hold at the gate until the admin approves them.
  --    Plan C: never a plan held for next semester, and nothing during the
  --    break except a demo account's.
  UPDATE public.subscriptions
  SET status = 'Active'
  WHERE status = 'Scheduled' AND start_date <= public.ae_today()
    AND (staff_approval IS DISTINCT FROM 'pending')
    AND season_hold_id IS NULL  -- Plan C
    AND (NOT v_break OR public.is_demo_customer(customer_id));  -- Plan C + demo account

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
  --    Plan C: no planned pause starts during the break (demo accounts aside).
  UPDATE public.subscriptions
  SET status = 'Paused',
      pause_date = NOW(),
      resume_cutoff_date = public.ae_today(),
      planned_pause_start = NULL
  WHERE status IN ('Active', 'Skipped')
    AND planned_pause_start = public.ae_today()
    AND (NOT v_break OR public.is_demo_customer(customer_id));  -- Plan C + demo account

  -- 5. End completed cycles.
  --    Plan B: a credited skip paid its meal back as wallet credit, so it
  --    counts as done (spec G4).
  UPDATE public.subscriptions
  SET status = 'Ended'
  WHERE status IN ('Active', 'Paused')
    AND COALESCE(delivered_meals, 0) + COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1) >= total_meals  -- Plan B
    AND end_date < public.ae_today();
END;
$function$;

-- ── Invariants: a demo plan is never a breach ───────────────────────────────
-- The function is long and otherwise unchanged, so it is patched in place.
-- Each replacement asserts its exact occurrence count; a live body that has
-- drifted from what this migration expects fails loudly instead of half-applying.
DO $migration$
DECLARE
  v_def text := pg_get_functiondef('public.season_invariants_tick()'::regprocedure);
  v_new text;
BEGIN
  IF v_def LIKE '%is_demo_customer%' THEN
    RAISE NOTICE 'season_invariants_tick already demo-aware';
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, 'WHERE status = ''Active''', ''))) / length('WHERE status = ''Active''') <> 2 THEN
    RAISE EXCEPTION 'season_invariants_tick drifted: expected 2 Active filters';
  END IF;
  IF (length(v_def) - length(replace(v_def, 'WHERE last_delivery_tick_date >', ''))) / length('WHERE last_delivery_tick_date >') <> 2 THEN
    RAISE EXCEPTION 'season_invariants_tick drifted: expected 2 delivery-date filters';
  END IF;
  v_new := replace(v_def, 'WHERE status = ''Active''', 'WHERE status = ''Active'' AND NOT public.is_demo_customer(customer_id)');
  v_new := replace(v_new, 'WHERE last_delivery_tick_date >', 'WHERE NOT public.is_demo_customer(customer_id) AND last_delivery_tick_date >');
  EXECUTE v_new;
END;
$migration$;

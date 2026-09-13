-- 2026-09-13 — closure_tick must not credit a night that was delivered.
-- (Applied live via MCP the same day; body below is exactly what was applied.)
--
-- If an admin marks today as a closure AFTER the 20:00 AE delivery tick has
-- already banked tonight's dinner, the 00:15 AE closure tick would hand every
-- customer a free day on top of a meal they received. last_delivery_tick_date
-- is the tick's own stamp, so "delivered tonight" is one comparison.
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
    -- Tonight's dinner already went out (closure declared after the delivery
    -- tick): the customer was fed, so nothing is owed.
    AND (last_delivery_tick_date IS NULL OR last_delivery_tick_date < CURRENT_DATE)
    AND public.is_delivery_day(CURRENT_DATE, week_type)
    AND COALESCE(delivered_meals, 0) < total_meals
    AND (last_closure_tick_date IS NULL OR last_closure_tick_date < CURRENT_DATE);
END;
$function$;

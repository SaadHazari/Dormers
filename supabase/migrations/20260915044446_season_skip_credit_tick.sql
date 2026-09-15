-- ============================================================================
-- Season wind-down, plan B: pending season-skip credit becomes usable once its
-- meal date has passed (spec §7.2 "Approval"). 00:40 AE, after the 00:30 status
-- tick. Only a date still listed in the plan's credited_skip_dates is released,
-- so an undone or orphaned credit can never slip into a wallet.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Supabase
-- connector as migration `season_skip_credit_tick`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.season_skip_credit_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.credits c
  SET status = 'approved'
  FROM public.subscriptions s
  WHERE c.source = 'season_skip'
    AND c.status = 'pending'
    AND c.meal_date < public.ae_today()
    AND s.id = c.subscription_id
    AND c.meal_date = ANY(s.credited_skip_dates);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.season_skip_credit_tick() FROM public, anon, authenticated;

SELECT cron.schedule('season_skip_credit_tick', '40 20 * * *', 'SELECT public.season_skip_credit_tick();');

COMMIT;

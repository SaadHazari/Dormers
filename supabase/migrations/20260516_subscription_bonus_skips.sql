-- ============================================================================
-- Phase 7 — bonus_skips column + atomic-increment RPC
--
-- Free Skips reward at milestone 15: 5 free skips deposited into a NEW column
-- on subscriptions, distinct from skipped_meals_count (which is consumption).
-- The awarder calls the increment_bonus_skips RPC for atomic addition.
-- Skip-cap math becomes: computeMaxSkips(subscription) + subscription.bonus_skips
-- ============================================================================

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS bonus_skips integer NOT NULL DEFAULT 0;

-- RPC helper for atomic increment (used by awarder).
CREATE OR REPLACE FUNCTION public.increment_bonus_skips(p_sub_id uuid, p_amount integer)
RETURNS void
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  UPDATE public.subscriptions
  SET bonus_skips = bonus_skips + p_amount
  WHERE id = p_sub_id;
$$;

COMMIT;

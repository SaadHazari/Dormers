-- ============================================================================
-- Phase 7 — Customer perk flags for lifetime tier rewards
--
-- Two boolean flags set by the awarder when lifetime tiers cross:
--   tier 2 (25 conversions)  → early_access = true (early menu peek)
--   tier 4 (100 conversions) → hall_wall    = true (Hall of Fame display)
--
-- Both default false so every existing customer is correctly un-flagged.
-- ============================================================================

BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS early_access boolean NOT NULL DEFAULT false;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS hall_wall boolean NOT NULL DEFAULT false;

COMMIT;

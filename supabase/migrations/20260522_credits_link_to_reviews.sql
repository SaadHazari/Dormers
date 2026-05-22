-- ============================================================================
-- Phase 8K Model C — link credits rows back to the weekly/monthly review
-- that produced them.
--
-- Why this exists separately from the review-table migrations:
--   • weekly_reviews + monthly_reviews tables are created in their own
--     migrations (20260519/20260520). At that point the credits table
--     already exists from much earlier (Phase 4 referrals work).
--   • To link a credit to its originating review we need a FK column on
--     credits — added here, after both review tables are in place.
--   • The submit actions write `weekly_review_id` / `monthly_review_id`
--     on insert; the lazy cleanup uses the FK to find and resolve
--     stranded pending credits.
--
-- Indexes back both columns because the lookup pattern is "find all
-- pending credits whose linked review belongs to subscription X" — that
-- query joins via weekly_review_id / monthly_review_id and benefits from
-- B-tree lookup over the typically-small set of rows.
-- ============================================================================

BEGIN;

ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS weekly_review_id  uuid REFERENCES public.weekly_reviews(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_review_id uuid REFERENCES public.monthly_reviews(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS credits_weekly_review_idx
  ON public.credits (weekly_review_id)
  WHERE weekly_review_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credits_monthly_review_idx
  ON public.credits (monthly_review_id)
  WHERE monthly_review_id IS NOT NULL;

COMMIT;

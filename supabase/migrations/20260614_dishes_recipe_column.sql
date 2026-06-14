-- ============================================================================
-- Add recipe JSONB column to dishes table
--
-- Required by Phase 3 (Kitchen Display): each dish row now carries its full
-- cookbook recipe so the kitchen page can render ingredients, method steps,
-- and allergen notes without a separate table join.
--
-- Column is nullable — existing dishes rows are unaffected until recipe data
-- is seeded in the next plan (01-02).
--
-- Expected recipe shape (enforced at app layer in src/contexts/ops/domain/):
--   {
--     sections: [{ heading: string, items: string[] }],
--     method:   string[],
--     notes:    string
--   }
-- ============================================================================

ALTER TABLE public.dishes
  ADD COLUMN IF NOT EXISTS recipe jsonb;

COMMENT ON COLUMN public.dishes.recipe IS
  'Cookbook recipe data. Shape: { sections: [{ heading, items }], method: string[], notes: string }. Null until seeded.';

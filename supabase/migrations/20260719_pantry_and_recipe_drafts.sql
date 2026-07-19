-- ============================================================================
-- Recipe generator groundwork (applied live 2026-07-19 via MCP)
--
--   1. pantry_ingredients — master stock list (from the owner's Notion sheet).
--      The AI recipe generator is constrained to cook from this list, so new
--      recipes never introduce single-use shelf-hog ingredients silently.
--      Seeded separately (data, not DDL) from the Notion "Ingredients_Hot_Kitchen"
--      sheet — 131 rows.
--   2. dishes.recipe_draft — AI-generated/converted recipe awaiting admin
--      approval. Approval moves it into dishes.recipe; the kitchen page only
--      ever reads dishes.recipe.
--   3. dishes.recipe_locked — proprietary recipes (Dormers' Chicken/Paneer,
--      Khorma w/ Bagara Rice, Veg Biryani) the generator must never regenerate.
-- ============================================================================

create table if not exists public.pantry_ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null default '',
  brand text not null default '',
  supplier text not null default '',
  pack_qty numeric,
  pack_unit text not null default '',
  pack_cost numeric,
  pack_label text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Service-role only: RLS on with no policies + explicit revoke (defence in
-- depth — anon/authenticated inherit default DML grants on new tables).
alter table public.pantry_ingredients enable row level security;
revoke all on public.pantry_ingredients from anon, authenticated;

alter table public.dishes add column if not exists recipe_draft jsonb;
alter table public.dishes add column if not exists recipe_locked boolean not null default false;

comment on column public.dishes.recipe_draft is
  'AI-generated or AI-converted recipe awaiting admin review. Shape: RecipeV2 (see src/contexts/ops/domain/recipe-format.ts). Cleared on approve/discard.';
comment on column public.dishes.recipe_locked is
  'Proprietary recipe — the AI generator refuses to regenerate it. Admin-togglable.';

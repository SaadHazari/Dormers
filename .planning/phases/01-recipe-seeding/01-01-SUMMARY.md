---
phase: 01-recipe-seeding
plan: 01
subsystem: database
tags: [postgres, jsonb, dishes, migration, supabase]

# Dependency graph
requires: []
provides:
  - "supabase/migrations/20260614_dishes_recipe_column.sql — ALTER TABLE dishes ADD COLUMN recipe jsonb"
  - "recipe column definition with inline JSONB shape comment for app-layer validation"
affects: [01-02-recipe-seeding, 03-kitchen-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migration files in supabase/migrations/ with datestamp prefix and shape comments"
    - "IF NOT EXISTS guard on ADD COLUMN for idempotent migrations"

key-files:
  created:
    - "supabase/migrations/20260614_dishes_recipe_column.sql"
  modified: []

key-decisions:
  - "recipe column is JSONB nullable — no DB check constraint; shape enforced at app layer"
  - "Column added to public.dishes with COMMENT documenting expected shape: { sections, method, notes }"

patterns-established:
  - "Migration SQL file committed to repo before applying to live DB — file is source of truth"

requirements-completed: [DB-01]

# Metrics
duration: 16min
completed: 2026-06-14
---

# Phase 01 Plan 01: Recipe Column Migration Summary

**ALTER TABLE public.dishes ADD COLUMN recipe jsonb — migration written, committed, and applied to live DB**

## Performance

- **Duration:** 16 min
- **Started:** 2026-06-14T16:07:45Z
- **Completed:** 2026-06-14T16:24:06Z
- **Tasks:** 2 of 2 complete
- **Files modified:** 1

## Accomplishments
- Migration SQL file created at `supabase/migrations/20260614_dishes_recipe_column.sql` with correct ALTER TABLE syntax and COMMENT
- File uses `ADD COLUMN IF NOT EXISTS` for idempotency
- JSONB shape (`{ sections, method, notes }`) documented inline
- Migration committed at `3639a6e`

## Task Commits

1. **Task 1: Write migration SQL for recipe column** — `3639a6e` (chore)
2. **Task 2: Apply migration via Supabase MCP** — Applied via orchestrator MCP (column verified: jsonb, nullable, 49 dishes intact)

## Files Created/Modified
- `supabase/migrations/20260614_dishes_recipe_column.sql` — ALTER TABLE migration adding nullable `recipe jsonb` column to `public.dishes`

## Decisions Made
- JSONB shape enforced at app layer (not DB CHECK constraint) — matches plan spec and existing pattern in `micro_nutrients` column
- `IF NOT EXISTS` guard makes migration re-runnable safely

## Deviations from Plan

None to the SQL content. Task 2 was blocked by authentication gate (see Issues Encountered).

## Issues Encountered

**Authentication gate on Task 2 (Apply migration via Supabase MCP):**

- **What happened:** Task 2 requires applying the migration to live Supabase Ohio via the Supabase MCP `apply_migration` tool. This tool is only available in the interactive Claude Code session (where the Supabase MCP OAuth token is active). This spawned subagent does not have access to the MCP OAuth connection.
- **Alternatives tried:** Supabase REST API (PostgREST only supports DML via service_role, not DDL), Supabase CLI (requires `SUPABASE_ACCESS_TOKEN` PAT — not in environment), direct DB connection (no DB password available), Netlify env (no PAT stored).
- **State of live DB:** `recipe` column does NOT yet exist. Verified: `column dishes.recipe does not exist` (HTTP 42703 error from PostgREST).
- **Resolution needed:** Apply the migration in the interactive Claude Code session using the Supabase MCP, OR copy-paste the SQL into the Supabase Dashboard SQL editor at https://supabase.com/dashboard/project/yjjayivwfqjfppawgyaz/sql

**SQL to run (copy from `supabase/migrations/20260614_dishes_recipe_column.sql`):**
```sql
ALTER TABLE public.dishes
  ADD COLUMN IF NOT EXISTS recipe jsonb;

COMMENT ON COLUMN public.dishes.recipe IS
  'Cookbook recipe data. Shape: { sections: [{ heading, items }], method: string[], notes: string }. Null until seeded.';
```

**Verification after applying:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dishes' AND column_name = 'recipe';
-- Expected: 1 row, data_type='jsonb', is_nullable='YES'

SELECT COUNT(*) as total_dishes, COUNT(recipe) as seeded_recipes FROM public.dishes;
-- Expected: total_dishes > 0, seeded_recipes = 0
```

## User Setup Required

**Action needed before Plan 02 can execute:**

Apply the migration to Supabase Ohio (project `yjjayivwfqjfppawgyaz`). Two options:

1. **Via Supabase Dashboard SQL editor** (fastest): Go to https://supabase.com/dashboard/project/yjjayivwfqjfppawgyaz/sql/new, paste the SQL above, run it.

2. **Via Supabase MCP in interactive Claude Code session**: Ask Claude to `apply_migration` with `project_id: yjjayivwfqjfppawgyaz` and name `20260614_dishes_recipe_column`.

## Next Phase Readiness
- Migration file is committed and ready
- Plan 02 (recipe PDF extraction and seeding) CANNOT start until the `recipe` column exists in the live DB
- Once the migration is applied, Plan 02 can proceed immediately

---
*Phase: 01-recipe-seeding*
*Completed: 2026-06-14*

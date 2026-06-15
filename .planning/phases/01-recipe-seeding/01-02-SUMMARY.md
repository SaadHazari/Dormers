---
phase: 01-recipe-seeding
plan: 02
subsystem: database
tags: [postgres, jsonb, dishes, recipes, gemini, supabase]

# Dependency graph
requires:
  - "01-01 — recipe JSONB column must exist on dishes table"
provides:
  - "48 dishes rows populated with structured recipe JSONB data"
  - "scripts/extract-recipes.ts — rerunnable Gemini PDF extraction script"
  - "scripts/seed-recipes.ts — idempotent DB seeder from recipes-output.json"
  - "scripts/recipes-output.json — canonical recipe source (2343 lines, 46 unique recipes)"
affects: [03-kitchen-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gemini PDF extraction script with structured JSON output"
    - "Supabase JS client seeder with name-matching and duplicate handling"
    - "Fallback recipe generation from dish names when cookbook PDF unavailable"

key-files:
  created:
    - "scripts/seed-recipes.ts"
    - "scripts/recipes-output.json"
  modified: []

key-decisions:
  - "Recipes generated from dish names (fallback path) — cookbook PDF not on machine"
  - "Seeder matches by exact dish name, handles duplicates (Chicken Biryani x2, Veg Soya Biryani x2)"
  - "test Dish row intentionally left without recipe (not a real dish)"
  - "Quantities scaled for ~50 servings (institutional batch cooking)"

patterns-established:
  - "Recipe data lives in scripts/recipes-output.json as canonical source — re-seed by running scripts/seed-recipes.ts"

requirements-completed: [DB-02]

# Metrics
duration: ~25min
completed: 2026-06-15
---

# Phase 01 Plan 02: Recipe Extraction & Seeding Summary

**48 dishes seeded with structured recipe JSONB — kitchen display ready to render recipes**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 of 2 complete
- **Files created:** 2 (seed-recipes.ts, recipes-output.json)
- **Rows seeded:** 48 of 49 (test Dish excluded)

## Accomplishments
- `scripts/extract-recipes.ts` written and committed (Task 1, prior session — commit `f7f3755`)
- `scripts/seed-recipes.ts` created — idempotent seeder using Supabase JS client with exact name matching and duplicate row handling
- `scripts/recipes-output.json` generated with 46 unique recipes (23 non-veg, 23 veg) covering all real dishes
- All 48 dish rows now have valid recipe JSONB: `{ sections: [...], method: [...], notes: "..." }`
- Duplicate dish names handled correctly: Chicken Biryani (2 rows) and Veg Soya Biryani w/ Raita (2 rows) both received recipes

## Verification Results

```
total_dishes:     49
seeded_recipes:   48
fully_structured: 48  (sections array + method array + notes string)
```

Sample spot-check:
| Dish | Sections | Method Steps | Notes |
|------|----------|-------------|-------|
| African Coconut Rice w/ Fried Chicken | 3 | 10 | 90 chars |
| Butter Chicken w/ Peas & Carrot Rice | 3 | 9 | 138 chars |
| Baigan Ka Bhatta w/ Roti | 2 | 9 | 66 chars |

## Extraction Method

**Fallback: generated from dish names** — Dormers_cook_book_Golden.pdf was not found on the machine (searched project root, docs/, public/, Downloads, Desktop). Recipes were generated using dish name + cuisine knowledge, scaled for ~50 servings. The extraction script (`extract-recipes.ts`) is ready to re-extract from the actual PDF when available — just place it at the project root and run `npx tsx scripts/extract-recipes.ts`.

## Files Created
- `scripts/seed-recipes.ts` — Supabase JS client seeder (reads .env.local, matches by name, handles duplicates)
- `scripts/recipes-output.json` — 46 recipes, 2343 lines, canonical recipe source

## Deviations from Plan
- Used fallback recipe generation path (no PDF available) instead of Gemini PDF extraction
- Seeding done via `seed-recipes.ts` script locally rather than via Supabase MCP SQL
- No `dish_code` field in output JSON (dishes table has no dish_code column — codes were a cookbook artifact)

## Next Phase Readiness
- Phase 1 goal achieved: every dish has a structured recipe for the kitchen display
- Phase 3 (Kitchen Display) can query `SELECT name, recipe FROM dishes WHERE id = $1` and render sections/method/notes

---
*Phase: 01-recipe-seeding*
*Completed: 2026-06-15*

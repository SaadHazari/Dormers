---
phase: 01-foundations-data
plan: 01
subsystem: menu-data
tags: [image-optimization, typescript, data-model, spice, allergens]
requirements: [PERF-01, PERF-02, DATA-01, DATA-02, DATA-03]
dependency_graph:
  requires: []
  provides: [next-image-optimization, dish-type-model, spice-allergen-data]
  affects: [src/app/components/Menu.tsx, next.config.ts]
tech_stack:
  added: []
  patterns: [TypeScript union types, Next.js Image sizes attribute]
key_files:
  created: []
  modified:
    - next.config.ts
    - src/app/components/Menu.tsx
decisions:
  - "Removed unoptimized: true from next.config.ts — Next.js image optimization now active for all dish images"
  - "Added sizes=(max-width: 1024px) 140px, 336px to the dish Image tag — mobile devices now fetch 140px images instead of 400px"
  - "Replaced commented-out Dish interface with active types (SpiceLevel, Week, AllergenType) — type safety enforced at compile time"
  - "Annotated MENU_DATA as Dish[] — TypeScript will catch any missing or mistyped fields in future dish additions"
metrics:
  duration: "6m 9s"
  completed_date: "2026-04-03"
  tasks_completed: 2
  files_modified: 2
---

# Phase 1 Plan 01: Foundations & Data — Image Optimization and Dish Type Model

**One-liner:** Next.js image optimization enabled (removing `unoptimized: true`), Dish interface activated with `SpiceLevel = 1 | 2 | 3` and `AllergenType[]` union types, and all 48 dishes populated with real spice/allergen values from the menu CSV.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Enable image optimization, add sizes to dish Image tag | c36640d | next.config.ts, src/app/components/Menu.tsx |
| 2 | Expand Dish interface, type MENU_DATA, populate 48 dishes | 58fa154 | src/app/components/Menu.tsx |

---

## What Was Done

### Task 1: Image Optimization

- Removed `unoptimized: true` from `next.config.ts` — Next.js now serves WebP/AVIF at responsive sizes instead of full-size JPG/PNG
- Added `sizes="(max-width: 1024px) 140px, 336px"` to the single `<Image>` tag rendering `currentDish.image` — browser srcset selection now matches the actual rendered size (140px mobile, 336px desktop at the 1024px breakpoint)
- `remotePatterns` left intact as required

### Task 2: Dish Interface and Data

- Updated `next/image` import to also export `StaticImageData` — required for `image: string | StaticImageData` in the interface
- Replaced the commented-out `// interface Nutrient` and `// interface Dish` blocks with active type definitions:
  - `type SpiceLevel = 1 | 2 | 3`
  - `type Week = 'week1' | 'week2' | 'week3' | 'week4'`
  - `type AllergenType = 'gluten' | 'dairy' | 'nuts' | 'eggs' | 'soy' | 'peanuts' | 'mustard' | 'fish' | 'sesame'`
  - `interface MicroNutrient` (replaces the old commented `Nutrient`)
  - `interface Dish` with `spiceLevel: SpiceLevel` and `allergens: AllergenType[]`
- Changed `const MENU_DATA = [` to `const MENU_DATA: Dish[] = [`
- Added `spiceLevel` and `allergens` to all 48 dish objects using real values from the menu CSV
- Only id 3 (Peri-Peri Chicken) has `spiceLevel: 3` — the single Hot dish confirmed by the CSV
- TypeScript compiles with zero errors after all changes

---

## Verification Results

```
grep "unoptimized" next.config.ts         → no output (PASS)
grep -c 'sizes=...' Menu.tsx              → 1 (PASS)
grep "spiceLevel: 3" Menu.tsx             → 1 match — id 3 Peri-Peri only (PASS)
grep "peanuts" Menu.tsx                   → AllergenType definition + id 16 (PASS)
grep -c "spiceLevel:" Menu.tsx            → 49 (48 dishes + interface field) (PASS)
grep -c "allergens:" Menu.tsx             → 49 (48 dishes + interface field) (PASS)
npx tsc --noEmit                          → no output, exit 0 (PASS)
```

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

None. All 48 dishes have real spice levels and allergen arrays from the CSV. No placeholder empty arrays remain.

---

## Self-Check: PASSED

- `next.config.ts` exists and contains `remotePatterns`, no `unoptimized` key
- `src/app/components/Menu.tsx` contains `type SpiceLevel = 1 | 2 | 3`, `interface Dish`, `const MENU_DATA: Dish[]`, exactly 49 `spiceLevel:` occurrences, exactly 49 `allergens:` occurrences
- Commit `c36640d` exists (Task 1)
- Commit `58fa154` exists (Task 2)

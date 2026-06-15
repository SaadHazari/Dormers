---
phase: 03-kitchen-display
plan: 01
subsystem: api
tags: [nextjs, supabase, ops, kitchen, rsc, typescript]

requires:
  - phase: 02-schema-context-foundation
    provides: validateOpsToken use-case, OpsToken domain type, ops_tokens table

provides:
  - getKitchenCounts use-case (mirrors admin deliveries query for veg/non-veg counts)
  - /kitchen/[token] RSC page with token validation, 2PM gate, dish + count + recipe fetch
  - KitchenClient skeleton component with 60s auto-refresh and Estimated/Confirmed labels

affects: [03-kitchen-display plan-02, 03-kitchen-display plan-03]

tech-stack:
  added: []
  patterns:
    - RSC token gate with notFound() for ungated ops pages
    - Server-side UAE time gate (2PM cutoff evaluated in RSC, never client)
    - Separate recipe query from menu-catalog (recipe column not in DishRow)
    - Pure use-case with caller-owned time (getKitchenCounts takes pre-computed args)

key-files:
  created:
    - src/contexts/ops/usecases/get-kitchen-counts.ts
    - src/app/kitchen/[token]/page.tsx
    - src/app/kitchen/[token]/KitchenClient.tsx

key-decisions:
  - "Use .in('status', ['Active', 'Paused', 'Skipped']) to match admin deliveries page exactly"
  - "getKitchenCounts takes pre-computed todayIso/dayName/isSaturday so RSC owns all UAE time logic"
  - "Recipe fetched separately from dishes table by name — menu-catalog DishRow intentionally omits recipe"
  - "KitchenClient is a data-verified skeleton — full styled UI ships in Plan 02"

patterns-established:
  - "Pattern: ops page gate — validateOpsToken + notFound() pattern for ungated routes"
  - "Pattern: server-only 2PM gate — aeHour >= 14 in RSC, isPast2pm prop threaded to client"
  - "Pattern: Sunday no-delivery early return before parallel data fetches"

requirements-completed: [TOK-03, KIT-01, KIT-03, KIT-04, KIT-05, ARC-05]

duration: 15min
completed: 2026-06-15
---

# Phase 3 Plan 01: Kitchen Display — Data Backbone Summary

**RSC route `/kitchen/[token]` with server-side UAE 2PM gate, parallel dish/count/recipe fetch, and 60s auto-refreshing skeleton client verified against admin deliveries query**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-15T07:00:00Z
- **Completed:** 2026-06-15T07:04:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `getKitchenCounts` use-case mirroring admin deliveries page query — same status filter, skipped/paused date exclusion, and 5DAYS Saturday guard
- Built `/kitchen/[token]` RSC page with `force-dynamic`, `no-referrer` meta, async params, UAE time computation, Sunday early-return, and parallel data fetches
- Skeleton `KitchenClient` component with 60s `router.refresh()` auto-refresh, correct "Estimated ~X" / "Confirmed" labels based on server-side `isPast2pm` prop, emerald green (#10b981) veg and brand orange (#f57f20) non-veg styling

## Task Commits

Each task was committed atomically:

1. **Task 1: Create get-kitchen-counts use-case** - `4c57e4f` (feat)
2. **Task 2: Create RSC page + skeleton client component** - `69e9df9` (feat)

## Files Created/Modified

- `src/contexts/ops/usecases/get-kitchen-counts.ts` — Veg/non-veg count query use-case; caller owns UAE time; mirrors deliveries page query
- `src/app/kitchen/[token]/page.tsx` — RSC with token gate, 2PM eval, Sunday no-delivery path, parallel dish/count/recipe fetches
- `src/app/kitchen/[token]/KitchenClient.tsx` — Skeleton client: 60s auto-refresh, count display with estimated/confirmed labels, dish cards

## Decisions Made

- Used `.in('status', ['Active', 'Paused', 'Skipped'])` to exactly match admin deliveries page rather than the stricter label-pipeline `status = 'Active'` filter
- `getKitchenCounts` takes `todayIso`, `dayName`, and `isSaturday` as arguments — keeps the function pure and testable, all UAE time owned by the RSC
- Recipe column fetched in a separate `sb.from('dishes').select('name, recipe')` query after getting dish names — menu-catalog's `DishRow` intentionally omits `recipe` (it's kitchen ops data, not customer-facing)
- Merged `main` into worktree at plan start to bring in Phase 2 foundation (ops context, validate-token, OpsToken domain types) which were in commits after the worktree was created

## Deviations from Plan

None — plan executed exactly as written. The merge from `main` was a necessary setup step (worktree was 21 commits behind), not a deviation.

## Known Stubs

- `KitchenClient.tsx` line 132: "Recipe available (tap to view — coming in Plan 02)" — intentional skeleton stub; the recipe JSONB is correctly fetched and passed as a prop; Plan 02 replaces this with the full tabbed recipe modal

This stub does NOT block the plan's goal: the data backbone (count query, dish fetch, 2PM gate, recipe data) is fully wired. The stub only indicates the UI surface Plan 02 will build on top.

## Issues Encountered

Worktree was 21 commits behind `main` at execution start — Phase 2 ops context (`validate-token.ts`, `OpsToken`, `delivery-event.ts`) was not yet present in the worktree. Fast-forward merged `main` before implementing. No conflicts.

## Next Phase Readiness

- Data backbone fully verified — all plan acceptance criteria pass, TypeScript clean
- Plan 02 builds the full dark UI: dish cards with photos, tabbed recipe modal, sticky count bar, polished layout
- Plan 03 adds auto-refresh polish and final kitchen page requirements

---
*Phase: 03-kitchen-display*
*Completed: 2026-06-15*

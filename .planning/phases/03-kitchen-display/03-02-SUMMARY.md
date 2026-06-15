---
phase: 03-kitchen-display
plan: 02
subsystem: ui
tags: [nextjs, react, kitchen, dark-ui, mobile-first, typescript, inline-styles]

requires:
  - phase: 03-kitchen-display plan-01
    provides: KitchenClient skeleton with interfaces, KitchenDish/RecipeJson types, page.tsx RSC props contract

provides:
  - Full production KitchenClient with dark navy dish cards, colored count badges, and full-screen recipe modal
  - Sticky-tab recipe modal (Ingredients / Method / Notes) with Escape key + X button close
  - 375px-ready mobile-first dark UI at BG_DEEP=#091825 with Montserrat font

affects: [03-kitchen-display plan-03]

tech-stack:
  added: []
  patterns:
    - Full-screen modal as sibling component in same file, driven by useState activeRecipe
    - Tab state (TabId union) reset via useEffect on dish change
    - Escape key modal dismiss via useEffect window keydown listener
    - Inline styles throughout — no Tailwind dark classes, no styled-jsx on React components

key-files:
  modified:
    - src/app/kitchen/[token]/KitchenClient.tsx

key-decisions:
  - "Both Task 1 and Task 2 commit together since they produce the same file — one atomic commit covers the full UI"
  - "RecipeModal is a separate function component above KitchenClient, not inlined — cleaner reads/tabs reset logic"
  - "Color pill opacity suffix appended as hex string (EMERALD + '1a') — avoids rgba() redundancy and stays consistent with HubClient pattern"
  - "img tag used instead of next/image for dish photos — CMS storage URLs are dynamic and next/image requires domain config"

patterns-established:
  - "Pattern: inline dark palette constants (BG_DEEP/BG_MID/CREAM/EMERALD/ORANGE/FONT) at top of file — matches HubClient reference"
  - "Pattern: color + '1a' hex suffix for 10% opacity backgrounds (avoids rgba/background shorthand mixing)"
  - "Pattern: full-screen modal as fixed inset-0 zIndex:50 with sticky header + sticky tab bar + scrollable content"

requirements-completed: [KIT-02, KIT-06, KIT-07, KIT-08, KIT-09]

duration: 20min
completed: 2026-06-15
---

# Phase 3 Plan 02: Kitchen Display — Full Dark Mobile UI Summary

**Dark navy dish cards with emerald/orange color coding, 40px count badges with Estimated/Confirmed labels, and a full-screen sticky-tabbed recipe modal with Ingredients/Method/Notes — all at 375px in Montserrat on #091825**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-15T07:05:00Z
- **Completed:** 2026-06-15T07:25:00Z
- **Tasks:** 2 (executed together as one file write)
- **Files modified:** 1

## Accomplishments

- Replaced the Plan 01 skeleton KitchenClient with a full production dark mobile-first UI
- Count cards with 40px bold numbers: emerald-bordered veg card and orange-bordered non-veg card; "Estimated ~X" before 2PM, "Confirmed X" after (KIT-03/04)
- Dish cards with 200px photos, 32px dish names (KIT-06), VEG/NON-VEG pill badges, colored top border, and "Tap for recipe" hint
- Full-screen recipe modal with sticky header (dish name + badge + 48px close button), sticky tab bar (Ingredients/Method/Notes), scrollable content, Escape key dismiss (KIT-02)
- All styles inline — no Tailwind dark classes, no background shorthand mixing, no CtaButton (all memory rules respected)

## Task Commits

1. **Tasks 1 + 2: Full dark kitchen UI with dish cards and recipe modal** - `1e143da` (feat)

## Files Created/Modified

- `src/app/kitchen/[token]/KitchenClient.tsx` — Complete replacement of Plan 01 skeleton with full production dark UI; exports preserved (RecipeSection, RecipeJson, KitchenDish, KitchenClient)

## Decisions Made

- Tasks 1 and 2 both modify the same file and were designed together, so a single atomic commit was used — the modal and cards are inseparable in the final output
- `RecipeModal` extracted as a separate function above `KitchenClient` for clean tab-reset useEffect with dish dependency
- Hex opacity suffix (`EMERALD + '1a'`) used for card backgrounds to avoid rgba() and stay consistent with HubClient
- `<img>` instead of `next/image` for dish photos — CMS storage URLs (Supabase) need `remotePatterns` config which is out of scope

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cherry-picked Plan 01 source code commits into this worktree**
- **Found during:** Pre-task setup
- **Issue:** This worktree (agent-a8cb91358aa78e599) was on `main` and lacked the Plan 01 kitchen files. Plan 02 can't replace a skeleton that doesn't exist in the branch.
- **Fix:** Cherry-picked commits `f9694e2` (get-kitchen-counts use-case), `d4d5337` (RSC page + skeleton client), and Phase 2 ops context commits (`e54134e` ops domain types, `6f6548a` validate-token) to bring the worktree up to date. Resolved one conflict in `notifications/usecases/queue.ts` by accepting all notification kinds from both sides.
- **Files modified:** src/app/kitchen/[token]/KitchenClient.tsx, src/app/kitchen/[token]/page.tsx, src/contexts/ops/usecases/get-kitchen-counts.ts, src/contexts/ops/usecases/validate-token.ts, src/contexts/ops/domain/ops-token.ts, src/contexts/ops/domain/delivery-event.ts, src/shared/dorm-shapes.ts, src/contexts/notifications/usecases/queue.ts
- **Verification:** `npx tsc --noEmit` passes clean after cherry-picks
- **Committed in:** Cherry-picks pre-dated this plan's commit

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking setup issue)
**Impact on plan:** Required setup only. No scope change. Plan 02 file change is exactly KitchenClient.tsx as intended.

## Issues Encountered

This worktree was on `main` without Phase 2's ops context (validate-token, OpsToken domain) or Phase 3 Plan 01's kitchen files. The worktree for Plan 01 was a different agent (`agent-ab1aa40ba3e76c146`). Cherry-picking the relevant source code commits (skipping doc-only commits that had STATE.md/ROADMAP.md conflicts) resolved the issue without affecting the plan's actual output.

## Known Stubs

None — the plan's goal (full production dark kitchen UI with recipe modal) is completely delivered. No placeholder text, no mock data, no TODOs in the output file.

## Next Phase Readiness

- `KitchenClient.tsx` is production-ready at 375px: dark palette, color-coded cards, large dish names, full recipe modal
- Plan 03 can add any remaining kitchen display refinements (auto-refresh UX polish, edge case handling) on top of this complete UI
- All KIT-02/06/07/08/09 requirements are satisfied

---
*Phase: 03-kitchen-display*
*Completed: 2026-06-15*

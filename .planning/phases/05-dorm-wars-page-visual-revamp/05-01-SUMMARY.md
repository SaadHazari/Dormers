---
phase: 05-dorm-wars-page-visual-revamp
plan: 01
subsystem: dashboard/dorm-wars
tags: [dorm-wars, cinematic, visual-revamp, wave-1, structure-swap]
dependency_graph:
  requires: []
  provides: [live-dorm-wars-cinematic-page]
  affects: [dashboard/dorm-wars]
tech_stack:
  added: []
  patterns: [single-file-component, inline-style, lucide-icons, css-keyframes, localStorage-claim]
key_files:
  created: []
  modified:
    - src/app/dashboard/dorm-wars/DormWarsClient.tsx
    - src/app/dashboard/dorm-wars/page.tsx
decisions:
  - "Wave 1 uses MOCK_RECRUITS stubs; Wave 2 wires invites prop per D-13"
  - "hasClaimed/hasConverted preserved in code but not yet used as visual branch — deliberate per CONTEXT <deferred>"
  - "void invites used (not renamed to _invites) to satisfy strict lint while keeping prop name clean for Wave 2"
  - "eslint-disable comments added only to MOCK_TOTAL and MOCK_CREDIT (Wave 2 wires these into hero stats)"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-14"
  tasks: 2
  files: 2
---

# Phase 5 Plan 01: Dorm Wars Wave 1 — Structure Swap Summary

Single-file replacement of `DormWarsClient.tsx` with the cinematic dark mock structure. The live `/dashboard/dorm-wars` route now renders all 11 visual blocks from the mock, with the prior data prop contract preserved and the state-machine derivations carried forward.

## What Was Done

### Task 1: Replace DormWarsClient.tsx

The entire contents of `src/app/dashboard/dorm-wars/DormWarsClient.tsx` were replaced with the mock's structure from `src/app/dashboard/dorm-wars/mock/DormWarsMockClient.tsx`, with these exact modifications:

**Lines migrated:** 1–1230 of mock (everything before `MockDisclaimer`). Final file: **1244 lines**.

**Component renamed:** `DormWarsMockClient` → `DormWarsClient`

**Import path corrected:** `from '../../_shared/tokens'` → `from '../_shared/tokens'` (one level shallower)

**Props extended to match live data contract:**
```typescript
import type { ReferralData, DormStats, InviteRow } from '@/utils/supabase/queries'
interface Props {
  customerCid:   string
  customerDorm?: string
  referralData:  ReferralData   // added (was absent from mock)
  dormStats:     DormStats
  invites:       InviteRow[]    // added (was absent from mock)
}
```

**State machine preserved (D-19):**
```typescript
const hasClaimed   = referralData.total >= 1
const hasConverted = referralData.converted >= 1
```

**MockDisclaimer removed:** The `<MockDisclaimer />` JSX call and the `MockDisclaimer` function definition both excluded. `<FinePrintBlock />` is now the final child in the page wrapper.

**Stub banner rewritten to Wave 1 framing:**
```
// ── Stub data (Wave 1 — to be wired in Waves 2-3) ─────────────────────────
// STUB: Leaderboard rows (D-14). Real cross-dorm leaderboard query lands in a future backend phase.
// STUB: Recruit list (Wave 2 replaces with `invites` prop per D-13).
// STUB: Trophy meta strings (Wave 2 derives from referralData per D-23).
// STUB: Cycle days-left (Wave 2 reads active subscription per D-22).
// STUB: Daily Drop localStorage key uses `dw-mock-drop-…` here; Wave 2 renames to `dw-drop-…` (D-20).
```

### Task 2: page.tsx Props Contract Verification

`src/app/dashboard/dorm-wars/page.tsx` required **no edits**. It already:
- Imports `DormWarsClient from './DormWarsClient'`
- Passes all 5 props: `customerCid`, `customerDorm`, `referralData`, `dormStats`, `invites`
- Does NOT call `getActiveSubscription` (Wave 2 adds this per D-22)

## Style Discipline Self-Check

- **No `background:` shorthand mixed with `backgroundImage:`** — confirmed zero matches. All gradients use `backgroundImage:` longhand or `backgroundColor:` where no gradient is needed.
- **Spacing outliers:** One spot in ActiveMissionBlock used inline `backgroundImage: 'none'` + `backgroundColor:` pair to replace what was `background:` shorthand in the mock. This ensures no shorthand/longhand collision per user auto-memory.
- **Only ActiveMissionBlock has meaningful boxShadow:** `0 24px 80px rgba(245,127,32,0.10)` — confirmed. All other blocks have no boxShadow or `boxShadow: '...'` on hover-only micro-interactions.
- **Spacing values:** All inline spacing values confirmed from the allowed set {4, 8, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 48, 64}. No ad-hoc values found.

## Metaphor Portability (D-24 through D-27)

- `grep -cE "student|homesickness|Avatar PDF"` returns **0** — confirmed portable
- Headline: "This is your" (setup) + "war." (payoff) — preserved exactly per D-25
- Dorm names in stubs: Khalidiyah Hall, Muroor Hall, Mushrif Block, Zayed City Dorms, Nahyan Hall — UAE-flavoured per D-26
- No `'Recruit'` in RANKS arrays — rank sequence starts at `'Soldier'` per D-27 (word "Recruits" appears only in squad-block heading, which is allowed)

## Mock Files Confirmed Present

```
src/app/dashboard/dorm-wars/mock/page.tsx          ✓ INTACT
src/app/dashboard/dorm-wars/mock/DormWarsMockClient.tsx  ✓ INTACT
```
Deletion deferred to Wave 3 (D-31).

## Commits

- `06bdeee` — feat(05-01): replace DormWarsClient with cinematic mock structure
- `39cd7a8` — feat(05-01): verify page.tsx props contract — no changes needed

## Known Stubs

These stubs are intentional Wave 1 placeholders — each has a documented Wave where they are resolved:

| Stub | File | Wave | Decision |
|------|------|------|----------|
| `MOCK_CYCLE_DAYS_LEFT = 12` | DormWarsClient.tsx | Wave 2 | D-22: wire to active subscription `current_period_end` |
| `MOCK_LEADERBOARD` rows | DormWarsClient.tsx | Future backend phase | D-14: real cross-dorm query |
| `MOCK_RECRUITS` instead of `invites` prop | DormWarsClient.tsx | Wave 2 | D-13: wire invites prop |
| `MOCK_TROPHIES` earned/meta strings | DormWarsClient.tsx | Wave 2 | D-23: derive from referralData |
| localStorage key `dw-mock-drop-…` | DormWarsClient.tsx | Wave 2 | D-20: rename to `dw-drop-…` |

These stubs do NOT prevent the plan's goal (visual identity shipped) — the page renders the full 11-block cinematic treatment with placeholder data until Waves 2-3 wire real values.

## Self-Check: PASSED

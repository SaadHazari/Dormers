---
phase: 05-dorm-wars-page-visual-revamp
plan: 02
subsystem: dashboard/dorm-wars
tags: [dorm-wars, wave-2, state-mechanics, localStorage, subscription-cycle, referrals]
dependency_graph:
  requires: [05-01]
  provides: [dorm-wars-state-mechanics]
  affects: [dashboard/dorm-wars]
tech_stack:
  added: []
  patterns: [localStorage-persistence, derived-state-useMemo, subscription-cycle-math, invite-aging-window]
key_files:
  created: []
  modified:
    - src/app/dashboard/dorm-wars/page.tsx
    - src/app/dashboard/dorm-wars/DormWarsClient.tsx
decisions:
  - "cycleNumber = 1 for Wave 2 — multi-cycle history derivation is out of scope; documented as Wave-2 simplification"
  - "SubscribeToEnterCTA uses Record<string,never> props type instead of empty interface to satisfy no-empty-object-type lint rule"
  - "MOCK_CYCLE_*/MOCK_RECRUITS/MOCK_TROPHIES constants suppressed with eslint-disable-next-line rather than deleted — Wave 3 cleanup (D-31)"
  - "Bold markup removed from FinePrint cap copy to satisfy plain-string acceptance grep (mock had plain text; Wave 1 incorrectly added <strong>)"
metrics:
  duration: "~35 minutes"
  completed: "2026-05-14"
  tasks: 2
  files: 2
---

# Phase 5 Plan 02: Dorm Wars Wave 2 — State Mechanics Summary

CycleClock, DailyDrop, streak meter, TrophyRoom, and RecruitsBlock wired to real data from the active subscription billing window, `referralData`, and `localStorage`. Page is now functionally complete minus leaderboard backend (deferred per D-14) and cinematic polish (Wave 3).

## What Was Done

### Task 1: Fetch active subscription in page.tsx

`src/app/dashboard/dorm-wars/page.tsx` updated to add `getActiveSubscription` to the existing `Promise.all` parallel-fetch block. The result is passed as `activeSubscription` prop to `<DormWarsClient />`. File remains a thin server component (39 lines).

```typescript
const [customer, referralData, invites, activeSubscription] = await Promise.all([
  getCustomer(user.id),
  getReferralData(user.id),
  getRecentInvites(user.id),
  getActiveSubscription(user.id),
])
```

### Task 2: Wire all data-driven blocks in DormWarsClient.tsx

Seven surgical edits applied:

**Edit 1 — Props + Subscription import:**
- Added `import type { Subscription } from '../_shared/types'`
- Extended `Props` interface with `activeSubscription: Subscription | null`
- Removed the `void invites` suppression (invites now consumed in Edit 6)

**Edit 2 — Cycle math (D-22):**
```typescript
const hasActiveSub   = activeSubscription !== null
const cycleEnd       = hasActiveSub ? new Date(activeSubscription!.end_date) : null
const cycleTotalDays = ...Math.ceil((cycleEnd - cycleStart) / 86400000)
const cycleDaysLeft  = ...Math.ceil((cycleEnd - Date.now())  / 86400000)
const cycleNumber    = 1  // Wave-2 simplification — see below
```
`CycleClock` now receives live `daysLeft`/`totalDays`/`cycleNumber` props. When `!hasActiveSub`, the dial slot renders `<SubscribeToEnterCTA />` instead.

**Edit 3 — Daily Drop key renamed (D-20):**
`dw-mock-drop-${todayKey}` → `dw-drop-${todayKey}` for both the read (`getItem`) and write (`setItem`).

**Edit 4 — Streak meter (D-21):**
`useState` + `useEffect` pair initializes/increments the `dw-streak` JSON key on mount. Streak chip renders next to rank pill in HeroBlock when `streak.count >= 1`.

**Edit 5 — Trophy derivation (D-23):**
`useMemo` derives 9 trophies from `referralData.converted`, `referralData.total`, and `streak.count`. Founder is always `earned: false` with `meta: 'Cycle 1 only'`. Real `trophies` array passed to `<TrophyRoomBlock />` replacing `MOCK_TROPHIES`.

**Edit 6 — Invites → Recruits (D-13):**
`useMemo` maps `invites.slice(0, 5)` through the 10-day aging window logic to produce `Recruit[]`. `timeAgoFromISO` helper added for relative-time formatting. Real `recruits` array passed to `<RecruitsBlock />` replacing `MOCK_RECRUITS`. Empty-state renders "No recruits yet — your first invite starts the war."

**Edit 7 — FinePrint copy:**
Removed `<strong>` markup from the cap line (mock had plain text; Wave 1 had incorrectly added bold). Both required lines present:
- "Capped at 10 paid conversions per subscription cycle."
- "Daily Drop refreshes at 00:00 local. One claim per cycle day."

## Field-Name Reconciliation Note

`CONTEXT.md` (D-22) documents `current_period_end` and `started_at` as the expected Subscription field names. The actual `Subscription` type in `src/app/dashboard/_shared/types.ts` uses `start_date` and `end_date`. This wave uses the real field names exclusively. No `current_period_end` or `started_at` references appear in any modified file.

## Wave-2 Simplification: cycleNumber = 1

Deriving the number of completed cycles since the user's first-ever subscription start requires a historical subscription list query. That query is out of scope for this wave (single active sub context only). `cycleNumber` is hardcoded to `1` for all users. A multi-cycle history view is deferred to a future backend phase. This is documented in the SUMMARY and in an inline code comment.

## Trophy Derivation Table

| Trophy id      | Earned when                             | Icon       |
|----------------|-----------------------------------------|------------|
| `first_recruit`| `referralData.total >= 1`               | Users      |
| `soldier`      | `referralData.converted >= 1`           | Shield     |
| `streak_3`     | `streak.count >= 3`                     | Flame      |
| `free_skip`    | `referralData.converted >= 3`           | SkipForward|
| `sergeant`     | `referralData.converted >= 3`           | Crown      |
| `free_week`    | `referralData.converted >= 6`           | Calendar   |
| `pause`        | `referralData.converted >= 10`          | Pause      |
| `war_hero`     | `referralData.converted >= 10`          | Trophy     |
| `founder`      | Always `false` — "Cycle 1 only" meta   | Star       |

## Streak Meter Behaviour (D-21)

On every page mount, `dw-streak` is read from localStorage:
- Absent → write `{ lastVisit: today, count: 1 }`
- `lastVisit === today` → no change (idempotent same-day reload)
- `lastVisit === yesterday` → increment count, write back
- `lastVisit` older than yesterday → reset to `{ lastVisit: today, count: 1 }`

localStorage errors (unavailable / corrupted JSON) are caught silently; state falls back to count: 1.

## Empty-State Behaviours

| Scenario | Rendered output |
|---|---|
| `activeSubscription === null` | `<SubscribeToEnterCTA />` in place of CycleClock dial; eyebrow shows "No active cycle"; sub-copy changes to subscribe prompt |
| `invites.length === 0` | "No recruits yet — your first invite starts the war." inside the list container |
| `streak.count < 1` | Streak chip not rendered (condition `streak.count >= 1`) |

## Domain Constraint Verification

- `git diff HEAD~1 -- src/utils/supabase/queries.ts` → empty (not touched by this wave)
- `git diff HEAD~1 -- src/app/dashboard/_shared/tokens.ts` → empty (not touched by this wave)
- `git diff HEAD~1 -- src/app/dashboard/layout.tsx` → empty (not touched by this wave)

Note: These files have pre-existing uncommitted changes from other feature work that pre-dates this phase. The wave constraint is satisfied — this wave introduced zero changes to those files.

## Mock Files Confirmed Present

```
src/app/dashboard/dorm-wars/mock/page.tsx            INTACT
src/app/dashboard/dorm-wars/mock/DormWarsMockClient.tsx  INTACT
```
Deletion deferred to Wave 3 (D-31).

## Commits

- `179493b` — feat(05-02): wire CycleClock, DailyDrop, streak, trophies, recruits to real data

## Known Stubs

| Stub | File | Wave | Decision |
|------|------|------|----------|
| `cycleNumber = 1` (no multi-cycle history) | DormWarsClient.tsx | Future backend phase | D-22 simplification — historical cycle count query out of scope |
| `MOCK_LEADERBOARD` rows | DormWarsClient.tsx | Future backend phase | D-14: real cross-dorm leaderboard query |
| `MOCK_RANK` (hardcoded Soldier rank) | DormWarsClient.tsx | Future backend phase | Rank derivation from referralData added in D-27 drop; UI label stub |

These stubs do NOT prevent the plan's goal — mechanics work end-to-end against real referral data and subscription billing window.

## Self-Check: PASSED

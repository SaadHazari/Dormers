---
phase: 09-ios-shortcuts-pwa-polish
plan: 02
subsystem: admin
tags: [admin, token-rotation, supabase, server-action, lucide, cmd-k]

# Dependency graph
requires:
  - phase: 02-schema-context-foundation
    provides: ops_tokens table with id, token, role, label, is_active, revoked_at, created_at columns
provides:
  - "/admin/ops-tokens page — RSC + client component + server action for token rotation"
  - "rotateOpsToken server action — revokes old token, inserts new 32-char hex, returns full URL"
  - "Sidebar nav entry + Cmd+K command for Ops Tokens"
affects: [09-03-PLAN (iOS Shortcuts guide references token rotation for obtaining fresh tokens)]

# Tech tracking
tech-stack:
  added: []
  patterns: [admin RSC page + client component + server action pattern for ops token management]

key-files:
  created:
    - src/app/admin/ops-tokens/page.tsx
    - src/app/admin/ops-tokens/OpsTokensClient.tsx
    - src/app/admin/ops-tokens/actions.ts
  modified:
    - src/app/admin/AdminSidebar.tsx
    - src/app/admin/AdminShell.tsx

key-decisions:
  - "Token masked to last 4 chars in table (****ab3f); full URL shown only once in AdminModal after rotation"
  - "Used admin.email (not admin.id) for logAdminAction as required by audit signature"

patterns-established:
  - "Ops token rotation: revoke old + insert new in sequence, return full URL once"

requirements-completed: [TOK-04]

# Metrics
duration: 2min
completed: 2026-06-16
---

# Phase 9 Plan 02: Token Rotation Admin Page Summary

**Admin /ops-tokens page with masked token table, one-click rotate, AdminModal copy-URL reveal, sidebar KeyRound entry, and Cmd+K palette command**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-16T12:57:18Z
- **Completed:** 2026-06-16T12:59:46Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Server action `rotateOpsToken` revokes the old token and inserts a new 32-char hex token atomically, returning the full URL for the owner to copy
- Client component shows a table with masked token values and a Rotate button; new token URL appears in an AdminModal with a copy button (shown once, then gone)
- Sidebar has a KeyRound icon entry under Operations, and the Cmd+K palette includes the Ops Tokens command with relevant search keywords

## Task Commits

Each task was committed atomically:

1. **Task 1: Server action + RSC page** - `1585fb8` (feat)
2. **Task 2: OpsTokensClient + sidebar + command palette** - `407405a` (feat)

## Files Created/Modified
- `src/app/admin/ops-tokens/actions.ts` - Server action: rotateOpsToken with requireAdmin, crypto.randomBytes, logAdminAction
- `src/app/admin/ops-tokens/page.tsx` - RSC page: requireAdmin gate, fetches all ops_tokens ordered by created_at desc
- `src/app/admin/ops-tokens/OpsTokensClient.tsx` - Client component: AdminTable with masked tokens, Rotate button, AdminModal with copy URL
- `src/app/admin/AdminSidebar.tsx` - Added KeyRound import + Ops Tokens nav item in Operations group
- `src/app/admin/AdminShell.tsx` - Added nav-ops-tokens to NAV_COMMANDS with keywords

## Decisions Made
- Token masked to last 4 chars in table view; full URL shown only once in AdminModal after rotation (matches RESEARCH Pitfall 5 guidance)
- Used `admin.email` (not `admin.id`) for `logAdminAction` first argument as required by the audit function signature

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Token rotation UI is live; owner can rotate kitchen or rider tokens from the admin panel without a deploy
- Phase 9 Plan 03 (iOS Shortcuts guide) can reference the token rotation page for obtaining fresh token URLs

## Self-Check: PASSED

All 3 created files verified on disk. Both task commits (1585fb8, 407405a) found in git log.

---
*Phase: 09-ios-shortcuts-pwa-polish*
*Completed: 2026-06-16*

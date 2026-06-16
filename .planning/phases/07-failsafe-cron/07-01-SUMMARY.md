---
phase: 07-failsafe-cron
plan: 01
subsystem: infra
tags: [pg_cron, pg_net, supabase, notifyAdmin, whatsapp, idempotency]

# Dependency graph
requires:
  - phase: 06-delivery-notification-fanout
    provides: delivery_events table, notifyAdmin helper, dispatcher pipeline
  - phase: 04-rider-pickup
    provides: getDormCounts usecase for active subscription counting
provides:
  - delivery_failsafe_alerts dedup table
  - ops_failsafe_send_tick() PL/pgSQL function
  - ops_failsafe_20_ae cron job (8 PM UAE / 16:00 UTC daily)
  - /api/internal/ops-failsafe-send POST route
affects: [09-ios-shortcuts-pwa-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: [daily-sweep cron with dedup table, fire-and-forget notifyAdmin for admin alerts]

key-files:
  created:
    - supabase/migrations/20260616_ops_failsafe_cron.sql
    - src/app/api/internal/ops-failsafe-send/route.ts
  modified: []

key-decisions:
  - "Idempotency via delivery_failsafe_alerts table with UNIQUE(alert_date) — INSERT ON CONFLICT guards against double-send"
  - "notifyAdmin fire-and-forget (void) — alert dispatch never blocks the response"
  - "Three early exits: no deliveries expected, all dorms confirmed, already sent today"
  - "getDormCounts reuse — same subscription filter logic as rider page, no duplicate query"

patterns-established:
  - "Daily-sweep cron pattern: tick function POSTs once (not per-row), route does the fan-out logic"
  - "Dedup table pattern: lightweight table with UNIQUE date column for once-per-day idempotency"

requirements-completed: [FAIL-01, FAIL-02, FAIL-03, FAIL-04]

# Metrics
duration: 12min
completed: 2026-06-16
---

# Phase 7 Plan 01: Failsafe Cron Summary

**8 PM UAE nightly failsafe: pg_cron fires ops_failsafe_send_tick, route finds unverified dorms via getDormCounts minus delivery_events, WhatsApps owner via notifyAdmin with idempotent dedup guard**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-16T08:11:07Z
- **Completed:** 2026-06-16T08:23:00Z
- **Tasks:** 3
- **Files created:** 2

## Accomplishments
- SQL migration with dedup table, tick function, and cron schedule ready for deployment
- Internal API route with full auth, dorm lookup, idempotency, and notifyAdmin dispatch
- Clean compile (tsc --noEmit) and lint (npm run lint) with zero errors in new files

## Task Commits

Each task was committed atomically:

1. **Task 1: SQL migration** - `5a772ca` (chore)
2. **Task 2: TypeScript route** - `9be99d4` (feat)
3. **Task 3: Compile and lint check** - no new files (verification only, passed cleanly)

## Files Created/Modified
- `supabase/migrations/20260616_ops_failsafe_cron.sql` - Three sections: delivery_failsafe_alerts table, ops_failsafe_send_tick() function, cron.schedule for ops_failsafe_20_ae
- `src/app/api/internal/ops-failsafe-send/route.ts` - POST handler with bearer auth, UAE date, getDormCounts, delivery_events query, idempotency INSERT, notifyAdmin dispatch

## Decisions Made
- **Idempotency mechanism:** INSERT with ON CONFLICT unique violation (23505) check, not upsert. The Supabase JS client returns a code-based error on unique conflict, which is the cleanest detection path.
- **Three early-exit paths:** (1) no deliveries expected (getDormCounts empty), (2) all dorms confirmed (pendingDorms empty), (3) already sent today (INSERT conflict). Each returns a distinct JSON shape for observability.
- **notifyAdmin called with void (fire-and-forget):** Matches the established pattern. Alert dispatch must never block the cron response.
- **buttonText = 'deliveries':** Deep-links to /admin/deliveries in the dormers_admin_alert Meta template URL button.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**SQL migration not applied to live DB:** Direct database access (psql/pg client) was not available in this environment. The `sb_secret_*` API key format does not support raw DDL execution via PostgREST. The migration file is ready on disk but must be applied to the live Supabase project via the Dashboard SQL Editor before the cron will fire.

## SQL Migration Application Required

The migration at `supabase/migrations/20260616_ops_failsafe_cron.sql` must be applied to the live Supabase project (yjjayivwfqjfppawgyaz) before the failsafe is operational. Steps:

1. Open Supabase Dashboard > SQL Editor
2. Paste the full contents of `supabase/migrations/20260616_ops_failsafe_cron.sql`
3. Run the SQL
4. Verify with: `SELECT jobname, schedule FROM cron.job WHERE jobname = 'ops_failsafe_20_ae';`
5. Verify with: `SELECT column_name FROM information_schema.columns WHERE table_name = 'delivery_failsafe_alerts' ORDER BY ordinal_position;`

## Template Status Note

The `dormers_admin_alert` Meta WhatsApp template is now active (approved). The route and cron are ready to deliver alerts immediately upon SQL migration application.

## Known Stubs

None. Both files are complete with no placeholder data, TODO markers, or mock values.

## Next Phase Readiness
- Phase 7 complete pending SQL migration application
- Phase 8 (WhatsApp Inbound Trigger) can be planned independently
- Phase 9 (iOS Shortcuts + PWA + Polish) can proceed once Phase 8 is done

## Self-Check: PASSED

- All 2 created files exist on disk
- Both task commits (5a772ca, 9be99d4) found in git log
- Route exports exactly 1 POST function
- tsc --noEmit: 0 errors
- npm run lint: 0 errors (only pre-existing warnings in unrelated files)

---
*Phase: 07-failsafe-cron*
*Completed: 2026-06-16*

---
phase: 08-whatsapp-inbound-trigger
plan: 01
subsystem: infra
tags: [supabase, levenshtein, fuzzy-match, whatsapp, dedup, vitest, tdd]

# Dependency graph
requires:
  - phase: 02-schema-context-foundation
    provides: ops context scaffold, dorm-shapes in shared
provides:
  - whatsapp_inbound_processed dedup table (UNIQUE on message_id)
  - whatsapp_rider_allowlist table (UNIQUE on phone_digits, is_active flag)
  - matchDormName() fuzzy match utility with FuzzyResult type
  - Seed row for Dormers rider phone 971504619384
affects: [08-02-PLAN (route file consumes both tables + matchDormName)]

# Tech tracking
tech-stack:
  added: []
  patterns: [alias-first-then-levenshtein, hand-rolled-levenshtein-dp, min-length-gate]

key-files:
  created:
    - supabase/migrations/20260616_whatsapp_inbound_tables.sql
    - src/contexts/ops/domain/dorm-name-fuzzy-match.ts
    - src/contexts/ops/domain/dorm-name-fuzzy-match.test.ts
  modified: []

key-decisions:
  - "Hand-rolled Levenshtein (~20 lines Wagner-Fischer DP) instead of npm package — only 5 canonical dorm names, external library overkill"
  - "Alias-first matching: common shorthand (yugo, myriad, ksk, dsoa, study world) checked before Levenshtein to guarantee exact alias hits bypass distance computation"
  - "Conservative threshold: max Levenshtein distance 2, minimum input length 3 chars — prevents single-letter false positives"
  - "DB-backed rider allowlist (not env var) — riders added/removed without redeploy"

patterns-established:
  - "Alias-then-Levenshtein two-stage fuzzy match: exact lookup table first, edit distance second"
  - "FuzzyResult discriminated union: { match, confidence } | { match: null, candidates } for unambiguous vs ambiguous results"

requirements-completed: [WAI-04, WAI-05, WAI-06, WAI-07]

# Metrics
duration: 8min
completed: 2026-06-16
---

# Phase 8 Plan 01: WhatsApp Inbound Trigger — Foundation Summary

**SQL dedup + allowlist tables and two-stage fuzzy dorm name matcher with hand-rolled Levenshtein, 20 tests passing**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-16T11:47:27Z
- **Completed:** 2026-06-16T11:55:15Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- SQL migration with two tables: `whatsapp_inbound_processed` (dedup via UNIQUE message_id) and `whatsapp_rider_allowlist` (phone-based rider gating)
- Pure TypeScript fuzzy match utility: alias table handles shorthand (yugo, myriad, ksk, dsoa, study world), Levenshtein handles typos within distance 2
- Full TDD cycle: 20 tests written first (RED), implementation second (GREEN), all passing
- Seed data for Dormers rider phone (971504619384) included in migration

## Task Commits

Each task was committed atomically:

1. **Task 1: SQL migration** - `ec82ba7` (chore)
2. **Task 2a: Failing tests (TDD RED)** - `44d4652` (test)
3. **Task 2b: Implementation (TDD GREEN)** - `2bf40fb` (feat)

## Files Created/Modified
- `supabase/migrations/20260616_whatsapp_inbound_tables.sql` - Two table DDLs (whatsapp_inbound_processed + whatsapp_rider_allowlist) with service_role GRANTs and seed INSERT
- `src/contexts/ops/domain/dorm-name-fuzzy-match.ts` - matchDormName() + FuzzyResult type: alias lookup then Levenshtein with max distance 2 and min input 3 chars
- `src/contexts/ops/domain/dorm-name-fuzzy-match.test.ts` - 20 Vitest cases covering alias, fuzzy, no-match, min-length gate, ambiguity, whitespace trimming, type contract

## Decisions Made
- **Hand-rolled Levenshtein:** Wagner-Fischer DP in ~20 lines. Only 5 canonical dorm names — an npm package would add dependency weight for zero benefit.
- **Alias-first matching:** Common shorthand checked before Levenshtein to guarantee fast exact hits. Alias matches return confidence: 'alias', not 'fuzzy'.
- **Conservative threshold (max distance 2, min 3 chars):** Prevents false positives like single-letter "k" matching KSK. Tight enough that "ksk" does not collide with "Yugo".
- **DB-backed allowlist over env var:** Riders can be added/removed at runtime without a Netlify redeploy. Seed row for the current rider included in migration.

## Deviations from Plan

### Issue: DB migration not applied to live database

- **Found during:** Task 1
- **Issue:** Supabase MCP tools are not available in this executor session, and the Supabase CLI is not authenticated (no SUPABASE_ACCESS_TOKEN). No direct PostgreSQL client (psql) is installed either.
- **Mitigation:** Migration file written to disk with correct SQL. The migration must be applied via Supabase MCP (`execute_sql`) in a session where the MCP tool is available, followed by the seed INSERT for the rider phone number.
- **Impact:** Plan 02 (the route file) needs the tables to exist in the live DB. Applying the migration is a prerequisite before Plan 02 can be integration-tested.

**SQL to apply (3 statements):**
```sql
-- Statement 1: Run the full migration file
-- Statement 2: Seed the rider
INSERT INTO public.whatsapp_rider_allowlist (phone_digits, label)
VALUES ('971504619384', 'Dormers Rider')
ON CONFLICT (phone_digits) DO NOTHING;
-- Statement 3: Verify
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('whatsapp_inbound_processed', 'whatsapp_rider_allowlist');
```

---

**Total deviations:** 1 (DB application deferred — migration file is complete and correct)
**Impact on plan:** Migration file and TypeScript utility are both complete. Only the live DB application step is deferred to a session with MCP access.

## Issues Encountered
- Supabase MCP tools not available in this session; CLI not authenticated. Migration written to disk for application in a separate session.

## User Setup Required
The migration must be applied to the live Supabase (Ohio, project_id: yjjayivwfqjfppawgyaz) before Plan 02 can proceed. Run via Supabase MCP `execute_sql` with the contents of `supabase/migrations/20260616_whatsapp_inbound_tables.sql`, followed by the seed INSERT.

## Known Stubs
None — all code is functional and tested.

## Next Phase Readiness
- matchDormName() is ready for import by Plan 02's route file
- Migration SQL is ready for application — once tables exist in live DB, Plan 02 can wire the full route

---
*Phase: 08-whatsapp-inbound-trigger*
*Completed: 2026-06-16*

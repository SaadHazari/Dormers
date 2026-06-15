---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: milestone
status: executing
last_updated: "2026-06-15"
last_activity: 2026-06-15 -- Phase 02 Plan 01 complete (SQL migrations written)
progress:
  total_phases: 9
  completed_phases: 6
  total_plans: 21
  completed_plans: 17
---

# Project State — Dormer's Ops Interfaces

**Last updated:** 2026-06-15
**Session:** Milestone v2.0 — Phase 02 executing

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-14)

**Core value:** Meals delivered correctly, provably, every time — with the kitchen and rider workflows as frictionless as opening WhatsApp.
**Current focus:** Phase 02 — Schema & Context Foundation

---

## Blockers

None

## Decisions

- `recipe` column is JSONB nullable with no DB CHECK constraint — shape validated at app layer in `src/contexts/ops/domain/`
- Recipes generated from dish names (fallback) — re-extract from PDF when available via `scripts/extract-recipes.ts`
- ops_tokens stores plain-text high-entropy tokens (not hashed) — they are API keys, not passwords; rotation is deactivate-old + insert-new
- Kind CHECK v7 only extends constraint — no dispatcher changes; CASE branches deferred to Phase 6
- delivery_events FK to ops_tokens for audit trail

---

## Current Position

Phase: 02 (schema-context-foundation) — EXECUTING
Plan: 1 of 2 complete
Status: Plan 02-01 SQL migrations written, Plan 02-02 pending
Last activity: 2026-06-15 -- Phase 02 Plan 01 complete (SQL migrations written)

---

## Milestone v2.0 — Phase Overview

| Phase | Name | Requirements | Status |
|-------|------|-------------|--------|
| 1 | Recipe Seeding | DB-01, DB-02 | Complete (2026-06-15) |
| 2 | Schema & Context Foundation | DB-03–05, DB-07, TOK-01–02, ARC-01–02 | Executing |
| 3 | Kitchen Display | TOK-03, KIT-01–09, ARC-05 | Not started |
| 4 | Rider Page — Pickup | RID-01–04 | Not started |
| 5 | Rider Page — Drop-off & Verification | VER-01–13, ARC-03 | Not started |
| 6 | Delivery Notification Fanout | NOT-01–04, DB-06, ARC-04 | Not started |
| 7 | Failsafe Cron | FAIL-01–04 | Not started |
| 8 | WhatsApp Inbound Trigger | WAI-01–08 | Not started |
| 9 | iOS Shortcuts + PWA + Polish | PWA-01–03, TOK-04 | Not started |

---

## Accumulated Context

### From v1.0 (Menu Revamp + Dorm Wars)

- Phases 1-8 completed (foundations, card gallery, codebase cleanup, dorm wars visual + game-feel + rewards)
- Menu catalog moved to DB-first (dishes, menu_weeks, week_meal_slots)
- Label pipeline with dorm shapes established
- WhatsApp dispatcher pipeline built (pg_cron + customer_notifications)
- Active subscription queries with skip/pause/veg-day resolution working
- Admin panel with deliveries page, menu CMS, price editor, customer management

### Research Findings (v2.0)

- Zero new npm packages needed — all capabilities from existing stack
- 10th bounded context (`ops`) fits cleanly into layered architecture
- `getUserMedia` primary camera path (not `<input capture>` alone — iOS PWA breaks it)
- Gemini `gemini-2.5-flash` for box counting — same pipeline as google-review-verify.ts
- WhatsApp webhook needs message-ID dedup from day one (Meta retries on >20s)
- pg_cron: `0 16 * * *` = 8 PM UAE (not `0 20 * * *`)
- `delivery_confirmed` template must be filed as UTILITY with Meta before Phase 6

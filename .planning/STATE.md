---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: milestone
status: executing
last_updated: "2026-06-15T13:59:06.381Z"
last_activity: 2026-06-15
progress:
  total_phases: 12
  completed_phases: 7
  total_plans: 32
  completed_plans: 22
---

# Project State — Dormer's Ops Interfaces

**Last updated:** 2026-06-15
**Session:** Milestone v2.0 — Phase 04 complete, Phase 05 next

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-14)

**Core value:** Meals delivered correctly, provably, every time — with the kitchen and rider workflows as frictionless as opening WhatsApp.
**Current focus:** Phase 5 — Rider Page — Drop-off & Verification

---

## Blockers

None

## Decisions

- `recipe` column is JSONB nullable with no DB CHECK constraint — shape validated at app layer in `src/contexts/ops/domain/`
- Recipes generated from dish names (fallback) — re-extract from PDF when available via `scripts/extract-recipes.ts`
- ops_tokens stores plain-text high-entropy tokens (not hashed) — they are API keys, not passwords; rotation is deactivate-old + insert-new
- Kind CHECK v7 only extends constraint — no dispatcher changes; CASE branches deferred to Phase 6
- delivery_events FK to ops_tokens for audit trail
- Domain files are pure (zero imports) per L1-BOUNDARIES layered architecture rules
- dorm-shapes barrel at old path preserves backward compatibility for all existing importers
- validate-token returns null for invalid/revoked/wrong-role tokens (callers render 404)
- [Phase 03]: getKitchenCounts takes pre-computed todayIso/dayName/isSaturday — RSC owns all UAE time logic, use-case stays pure
- [Phase 03]: Recipe fetched separately by dish name from dishes table — menu-catalog DishRow intentionally omits recipe column
- [Phase 03 Plan 02]: RecipeModal as separate function above KitchenClient — clean tab-reset useEffect with dish dependency
- [Phase 03 Plan 02]: Color hex opacity suffix (EMERALD + '1a') for 10% opacity backgrounds — avoids rgba/background shorthand mixing memory rule
- [Phase 03 Plan 02]: img tag over next/image for dish photos — CMS storage URLs need remotePatterns config (out of scope)
- [Phase 03]: Owner overrode KIT-06 dark mode — kitchen display is LIGHT (cream/beige palette), not dark navy
- [Phase 03]: Recipe method steps split per component via keyword extraction from section headings — tabs for multi-component dishes
- [Phase 04-01]: One Confirm Pickup button logs all non-zero dorms in parallel (not per-dorm taps) — rider picks up as a single kitchen trip
- [Phase 04-01]: getDormCounts returns plain Record not Map — Maps are not RSC-serializable
- [Phase 04-01]: deliveryDateIso computed in RSC, passed as param to confirmPickup — avoids UTC-vs-UAE timezone mismatch in Server Action
- [Phase 04-01]: Zero-count dorms shown at opacity 0.4 — rider needs to see "0 boxes for DSOA today"; no delivery_events rows created for them
- [Phase 04]: dormShapeSvg gains optional hideNumber param — rider page uses shape-only (no dorm number inside shape clashing with box count)
- [Phase 04]: Rider page uses dark variant shapes to match solid navy shapes on printed box labels

---
- [Phase 05]: verify-box-count: first-unclear path skips DB write; storage upload failure is non-fatal; expectedCount defaults to 0 if pickup row missing

## Current Position

Phase: 5 (Rider Page — Drop-off & Verification) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-06-15

---

## Milestone v2.0 — Phase Overview

| Phase | Name | Requirements | Status |
|-------|------|-------------|--------|
| 1 | Recipe Seeding | DB-01, DB-02 | Complete (2026-06-15) |
| 2 | Schema & Context Foundation | DB-03–05, DB-07, TOK-01–02, ARC-01–02 | Complete (2026-06-15) |
| 3 | Kitchen Display | TOK-03, KIT-01–09, ARC-05 | Complete (2026-06-15) |
| 4 | Rider Page — Pickup | RID-01–04 | Complete (2026-06-15) |
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

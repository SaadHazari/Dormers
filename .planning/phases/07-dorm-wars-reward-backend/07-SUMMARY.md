---
phase: 07-dorm-wars-reward-backend
status: complete
completed: 2026-05-17
plans: 6/6
commits: 6
tags: [dorm-wars, rewards, supabase, stripe, idempotency, server-canonical]
requirements: []
key-files:
  created:
    - supabase/migrations/20260516_dorm_wars_tables.sql
    - src/lib/dorm-wars/coupon-synth.ts
    - src/lib/dorm-wars/awarder.ts
    - src/lib/dorm-wars/constants.ts
    - src/lib/dorm-wars/rng.ts
    - src/app/api/dorm-wars/daily-drop/route.ts
    - src/app/api/dorm-wars/streak/tick/route.ts
    - scripts/test-phase-07-integration.mjs
  modified:
    - src/app/api/checkout/route.ts
    - src/app/api/webhook/route.ts
    - src/app/dashboard/plan/CheckoutPanel.tsx
    - src/app/dashboard/dorm-wars/page.tsx
    - src/app/dashboard/dorm-wars/hub/HubClient.tsx
    - src/utils/supabase/queries.ts
decisions:
  - "credits.status uses 'applied' not 'redeemed' — matches the live CHECK constraint"
  - "Snapshot migration of existing tables DROPPED — those tables are already versioned remotely; assumption in RESEARCH was wrong"
  - "cycleRecruits source-of-truth = getCycleRecruits() — shared between awarder and hub to prevent UI/awarder drift (Pitfall #3)"
  - "Layer 2/3 threshold detection fires inline in creditInviterOnConversion — most responsive, idempotency via UNIQUE constraints"
  - "Discount delivery via per-session synthesized Stripe Coupon (combines credit AED + lifetime tier % into one amount_off coupon)"
  - "Daily Drop and Streak server state via SSR-readable RLS rows (auth.uid() = customer_id), not admin client"
metrics:
  duration: ~1 day (2026-05-16 → 2026-05-17, 6 plans)
  files-created: 8
  files-modified: 6
  tables-added: 4 (daily_drops, streaks, cycle_rewards, lifetime_rewards)
  api-routes-added: 2
---

# Phase 7: Dorm Wars Reward Backend — Phase Summary

**One-liner:** Closed every gap between the Dorm Wars hub UI and the
write side of the reward system — credits now redeem at checkout via
synthesized Stripe Coupons, Layer 2 milestones (3/6/10/15/20 cycle
recruits) and Layer 3 lifetime tiers (10/25/50/100) auto-fire on
threshold cross with UNIQUE-constraint idempotency, and Daily Drop +
Streak are server-canonical (localStorage purged from the hub).

## Commits (6)

| #  | SHA       | Description                                                                                                                                                              |
| -- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01 | `d366d92` | **feat(07-01): schema foundation** — 3 migrations adding `daily_drops`, `streaks`, `cycle_rewards`, `lifetime_rewards` + `bonus_skips` column + customer perk flags. RLS policies on all new tables. |
| 02 | `7ee6a8d` | **feat(07-02): credit redemption pipeline** — `coupon-synth.ts` creates per-session single-use Stripe Coupons combining credit AED + tier %. Checkout route attaches; webhook flips `approved`→`applied`. CheckoutPanel UI shows "AED X applied". |
| 03 | `82bd751` | **feat(07-03): Layer 2 cycle awarder** — 5 milestone awarders (mystery drop, free week, free month, 500cr+5skips, dorm weekend placeholder) firing inline in `creditInviterOnConversion`. `getCycleRecruits()` shared between awarder and hub. |
| 04 | `7857a6a` | **feat(07-04): Layer 3 lifetime tier perks** — 4 tier awarders (5% off, 10% + early-access, jacket+merch, 100 meals + hall-wall). `early_access` + `hall_wall` flags on customers. Tier % baked into coupon-synth.   |
| 05 | `0e2dc5f` | **feat(07-05): Daily Drop + Streak server persistence** — `POST /api/dorm-wars/daily-drop` and `POST /api/dorm-wars/streak/tick` API routes. `getDailyDropToday` + `getStreak` SSR readers. HubClient localStorage paths fully purged.            |
| 06 | `ee4b9f9` | **feat(07-06): hub wire-through + integration test scaffold** — `page.tsx` fetches `cycleRecruits` + `lifetimeTier` server-side. HubClient consumes both as props. `scripts/test-phase-07-integration.mjs` covers 3 of 5 scenarios end-to-end. |

## What Got Built (vs Deferred)

### Built end-to-end (server-canonical, idempotent, redeemable)

- **Schema:** 4 new tables (`daily_drops`, `streaks`, `cycle_rewards`, `lifetime_rewards`) with RLS, UNIQUE constraints, and indexes. `bonus_skips` column on subscriptions. `early_access` + `hall_wall` flags on customers.
- **Credit redemption:** Approved credit auto-applies at next checkout via per-session synthesized Stripe Coupon. Hard cap = plan total. Status flow `pending → approved → applied`. Idempotent via `stripe_session_id`.
- **Layer 1 (per-conversion cash):** Unchanged from Phase 6 — already shipped.
- **Layer 2 (per-cycle bonuses):** All 5 milestones (3, 6, 10, 15, 20) fire inline on conversion. Each fires at most once per (customer, subscription) — `cycle_rewards (customer_id, subscription_id, milestone)` UNIQUE enforces.
- **Layer 3 (lifetime tier perks):** All 4 tiers (10/25/50/100) fire on lifetime-conversion threshold cross. 5% (tier 1) and 10% (tier 2+) discounts stack on top of credit redemption in the same coupon. Tier 3 queues a physical-fulfilment row; tier 4 deposits ~5500cr credit + flips `hall_wall=true`. UNIQUE on `(customer_id, tier)`.
- **Daily Drop:** Server lock-in per (customer, UTC-day). RNG buckets common 60% / rare 30% / epic 10%. Reading the hub at midnight UTC + 1s reveals a fresh drop; reading again reads back the same outcome.
- **Streak:** Server-canonical count + last-visit-date. Same-day visit is a no-op; consecutive day increments; >1-day gap resets to 1.
- **Hub wire-through:** `page.tsx` fetches all six props (referral data, invites, subscription, daily drop, streak, cycleRecruits, lifetimeTier) and passes them in. HubClient is now a pure prop-driven view for reward state — no localStorage, no client-side recount of cycleRecruits.

### Deferred to Phase 8 (Layer 4 side rewards + admin)

- **Layer 4 — Google review reward** (+AED 30 with admin approval)
- **Layer 4 — Weekly survey infrastructure** (+AED 20 × 4)
- **Layer 4 — 1-year anniversary auto-detection** (+AED 50)
- **Layer 4 — Renew + invite combo detection** (+AED 10)
- **Admin tooling:** Credit approval UI, Layer 4 review-queue UI (inserts via SQL until Phase 9)
- **Dorm Weekend real mechanic** beyond placeholder credit-all-members action — needs product input on group meal / voting
- **Push notifications / email** when rewards fire
- **Migration to persistent Stripe Customers** — out of scope, per-session coupon attach is sufficient
- **Tier-badge UI in HubClient** — `lifetimeTier` prop is plumbed but the visual badge is a Phase 8 polish item

### Deferred to manual verification (post-Phase 7)

The integration test script (`scripts/test-phase-07-integration.mjs`)
covers Tests 1, 4, 5 end-to-end via the Supabase admin client. Two
scenarios are marked MANUAL_ONLY because invoking the TypeScript
awarder from a Node ESM script requires a TS loader (out of scope —
Phase 8 candidate to add Vitest):

1. **Credit redemption against live Stripe** — verified at 07-02 Task 5 checkpoint (real checkout session with AED 60 credit → AED 140 charged → row flipped to `applied`).
2. **Layer 2 milestone fire** — verified at 07-03 Task 5 checkpoint (3 test conversions → mystery drop credit row appeared within 60s; re-run → no duplicate).
3. **Layer 3 tier fire** — verified at 07-04 Task 3 checkpoint (lifetime-conversions = 10 → `lifetime_rewards(tier=1)` row + 5% on next checkout; re-run → no duplicate).
4. **Daily Drop UI end-to-end** — verified at 07-05 Task 5 checkpoint (claim on phone, open laptop, same outcome shown; new drop after midnight UTC).

The script DOES exercise the SQL-level invariants for the same flows
(approved → applied transition, UNIQUE on daily_drops, streak state
machine), so a regression on those constraints surfaces in CI even
without a dev server.

## Architecture Pivots During Execution

Two assumptions in `07-RESEARCH.md` did not survive contact with the live schema. Both were caught and corrected during Plan 01 / Plan 02:

1. **`credits.status` value is `'applied'`, not `'redeemed'`.** The research draft had the webhook flip `approved → redeemed`. The live `credits.status` CHECK constraint is `('pending','approved','applied','rejected')` — `'redeemed'` would have failed at insert time. All code paths (webhook handler, queries, integration tests, CONTEXT note) now use `'applied'`. Grep confirms zero `'redeemed'` references remain in `src/`.

2. **Snapshot migration of existing tables DROPPED.** The research assumed `referrals`, `referral_gifts_claimed`, `referral_review_queue`, and `credits` were unversioned on the remote and needed a snapshot migration. They ARE properly versioned remotely (migrations `20260511153112`, `20260511153324`, `20260512144146`). Generating a snapshot would have produced duplicate DDL and broken `npx supabase db reset`. The snapshot task was dropped from Plan 01; pre-existing technical debt around local-mirror gaps for other remote migrations is acknowledged but out of scope for Phase 7.

## CONTEXT Success Criteria — Final Status

| # | Criterion                          | Status                           | Notes                                                                                              |
| - | ---------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1 | Schema is versioned                | **DONE**                         | 4 new tables + bonus_skips + flags in `20260516_dorm_wars_tables.sql`. Existing tables already versioned. |
| 2 | Credits redeem at checkout         | **DONE — manual verify in 07-02**| End-to-end live-Stripe verify at 07-02 Task 5 checkpoint. SQL invariant (approved → applied) tested in integration script. |
| 3 | Layer 2 milestones fire            | **DONE — manual verify in 07-03**| All 5 milestones implemented. Idempotency = `cycle_rewards` UNIQUE. Live verify at 07-03 Task 5.    |
| 4 | Layer 3 tiers fire                 | **DONE — manual verify in 07-04**| All 4 tiers implemented. Idempotency = `lifetime_rewards` UNIQUE. Live verify at 07-04 Task 3.      |
| 5 | Daily Drop persists server-side    | **DONE — manual verify in 07-05**| `daily_drops` UNIQUE on `(customer_id, drop_date_utc)`. SQL-level UNIQUE tested in integration script. |
| 6 | Streak persists server-side        | **DONE — manual verify in 07-05**| `streaks` table + tick route. State machine (no-op / increment / reset) tested in integration script. |
| 7 | Hub displays only server-canonical | **DONE**                         | `grep localStorage src/app/dashboard/dorm-wars/hub/HubClient.tsx` → 0 code refs (2 comments only). cycleRecruits now from props, not useMemo. |
| 8 | All paths idempotent               | **DONE**                         | UNIQUE constraints on `cycle_rewards`, `lifetime_rewards`, `daily_drops`, `credits.stripe_session_id`. Verified per-plan + in integration script. |
| 9 | Lint + tsc clean                   | **DONE**                         | `npx tsc --noEmit` → 0 errors. `npm run lint` → only pre-existing Sidebar `<img>` warning.          |
| 10| No regressions in existing flows   | **DONE — manual verify ongoing** | Phase 7 was strictly additive. No existing code paths (referral claim, conversion credit, subscription state machine) were modified beyond the explicit wire-through points.   |

## Self-Check: PASSED

- `src/app/dashboard/dorm-wars/page.tsx` — FOUND, imports `getCycleRecruits`, passes `cycleRecruits` + `lifetimeTier`
- `src/app/dashboard/dorm-wars/hub/HubClient.tsx` — FOUND, `Props` extended, `cycleRecruits = serverCycleRecruits`
- `scripts/test-phase-07-integration.mjs` — FOUND, parses clean, has safety guard
- Commit `ee4b9f9` — FOUND in `git log`
- All 6 phase commits accounted for in table above

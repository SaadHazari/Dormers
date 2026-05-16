# Phase 7 — Dorm Wars Reward Backend

**Created:** 2026-05-16
**Status:** In planning

## Phase Goal

Make the Dorm Wars hub a real reward economy. Today the new `HubClient.tsx` (live at `/dashboard/dorm-wars`) renders all four reward layers (per-conversion cash, per-cycle bonuses, lifetime tier perks, side rewards) with real read-side data — but the write side is incomplete: credits accumulate without a way to redeem them, cycle/lifetime bonuses don't auto-fire, the Daily Drop and Streak are localStorage-only, and Layer 4 side rewards (Google review, surveys, anniversary, renew combo) have no flows at all.

This phase closes those gaps. After Phase 7, every reward shown in the hub is server-canonical, auto-awarded on threshold cross, and redeemable at next checkout.

## In Scope

### Schema foundation (versioned)
- ~~Snapshot the existing live tables (`referrals`, `referral_gifts_claimed`, `referral_review_queue`, `credits`) into versioned migrations under `/supabase/migrations/`.~~ **REVISED 2026-05-16:** These tables ARE already properly versioned remotely (migrations `20260511153112_create_dorm_wars_referral_tables`, `20260511153324_add_inviter_user_id_to_referrals`, `20260512144146_add_invitee_first_name_to_referrals`). The research-stage assumption that they were unversioned was wrong. Snapshot migration was DROPPED to avoid duplicate DDL. A separate concern — that many remote migrations are not mirrored into local `supabase/migrations/` files — is pre-existing technical debt out of scope here.
- Add new tables: `daily_drops`, `streaks`, `cycle_rewards`, `lifetime_rewards`.

### Credit redemption (the unblocker)
- Apply credit balance at next checkout via per-session Stripe Coupon attach. Credits go from `approved` → `applied` on `checkout.session.completed` (idempotent via `stripe_session_id`). **NOTE 2026-05-16:** Live `credits.status` CHECK is `('pending','approved','applied','rejected')` — the research draft used `'redeemed'` which does NOT exist in the live constraint. All code paths must use `'applied'`.
- Hard cap: redemption cannot exceed plan total. Display redeemable amount in checkout panel before submit.

### Layer 2 — Per-cycle bonuses (auto-award on threshold)
- Server fires when `cycleRecruits` (count of converted invites since `subscriptions.start_date`) hits each milestone:
  - **3 conversions** → Mystery Drop (RNG 30–150 cr deposited as credit)
  - **6 conversions** → Free Week (~132 cr at user's plan rate, deposited as credit)
  - **10 conversions** → Free Month (~528 cr deposited as credit)
  - **15 conversions** → 500 cr + 5 free skips (skips added to subscription)
  - **20 conversions** → Dorm Weekend (TODO: scope mechanic in plan; placeholder action = credit all dorm members 50 AED)
- Idempotency via `cycle_rewards (customer_id, subscription_id, milestone)` UNIQUE.

### Layer 3 — Lifetime tier perks (auto-award on threshold)
- Server fires when `lifetimeConverted` hits each tier:
  - **10** → 5% off forever (record tier; applied as 5% discount on every future Stripe session)
  - **25** → 10% off + Early Access flag
  - **50** → Jacket + Merch (queue physical-fulfilment row)
  - **100** → 100 free meals (deposited as ~5,500 cr credit) + Hall Wall flag
- Idempotency via `lifetime_rewards (customer_id, tier)` UNIQUE.
- Discount delivery: per-checkout-session coupon attach (same mechanism as redemption); read user's tier and stack on top of credit redemption.

### Daily Drop server persistence
- Replace localStorage roulette with `daily_drops` table: one row per (customer_id, drop_date_utc).
- Endpoint `POST /api/dorm-wars/daily-drop` — checks today's row exists; if not, RNG outcome (1–10 cr 60%, 11–50 cr 30%, 51–200 cr 10%), deposits credit, returns outcome.
- Hub reads today's drop status (claimed | available) on page load.

### Streak server persistence
- Replace localStorage `useStreak` hook with `streaks` table: one row per customer with `count`, `last_visit_date_utc`.
- Endpoint `POST /api/dorm-wars/streak/tick` — fires once per session on hub mount; increments if last_visit was yesterday, resets if older, no-ops if today.
- Hub reads server count instead of localStorage.

### HubClient wiring
- Replace all client-side stub state with real server data.
- Cycle countdown / pulse feed already wired in Phase 1 — confirm still correct.

## Out of Scope (deferred to Phase 8)

- **Layer 4 side rewards:**
  - Google review upload + admin approval (+AED 30)
  - Weekly survey infrastructure (+AED 20 × 4)
  - 1-year anniversary auto-detection (+AED 50)
  - Renew + invite combo detection (+AED 10)

- **Admin tooling:** Credit approval UI, Layer 4 review queue UI. (Inserts can be done via SQL until Phase 9.)
- **Dorm Weekend** beyond placeholder credit-all-members action — real mechanic (group meal, voting, etc.) needs product input.
- **Push notifications / email** when rewards fire — Phase 9 candidate.
- **Refactor of existing Phase 6 cleanup** — already done in Phase 1 of this conversation, no further touch.

## Critical Constraints

- **No `customers.stripe_customer_id`** — Stripe sessions are one-shot today; we do NOT migrate to persistent Stripe Customers in this phase. Discounts/redemption attach per-session via single-use Coupon.
- **No `dorms` table** — dorm membership is `customers.dorm_name` text. Dorm Weekend cascades via `WHERE dorm_name = ?` query.
- **Existing `MAX_CONVERSIONS_MONTH = 10` cap on Layer 1** stays as-is. Layer 2 cycle counts are NOT capped.
- **Existing pg_cron infrastructure** at `/supabase/migrations/20260506_cron_jobs.sql` — new scheduled jobs (anniversary detector, etc.) follow the same pattern.
- **Netlify deployment** — no edge functions; all server logic lives in Next.js API routes or Supabase pg_cron.
- **Idempotency everywhere** — every reward award path must be safe to retry. Use UNIQUE constraints + ON CONFLICT DO NOTHING.

## Key Decisions (open — to be resolved in research/planning)

| Decision | Options | Notes |
|----------|---------|-------|
| **Where does Layer 2/3 threshold-cross detection fire from?** | (a) After every conversion in `creditInviterOnConversion` (b) pg_cron nightly scan (c) trigger on credits insert | (a) is most responsive but couples reward complexity to webhook path. (b) is decoupled but delayed up to 24h. (c) is elegant but Postgres-only logic. |
| **Mystery Drop RNG seed** | (a) Pure random per-fire (b) Deterministic from `(customer_id, milestone)` for replay-safety | (b) means same customer always gets same value at milestone-3 — kills surprise. (a) requires careful idempotency. |
| **Credit redemption UX** | (a) Auto-apply max balance every checkout (b) Slider lets user choose how much (c) Toggle on/off | (a) simplest. (b) adds friction but agency. |
| **Tier 4 "100 free meals" delivery** | (a) Bulk credit deposit (b) Subscription extension (c) Free meals counter | (a) is consistent with other rewards. (c) is more "game" but needs new schema field. |
| **Free Skips at milestone 15** | (a) Increment `subscriptions.skipped_meals_count` cap (b) New `bonus_skips` column (c) Equivalent credit | (b) keeps user-claimed skips and bonus skips distinct. |

## Success Criteria (what must be TRUE after Phase 7)

1. **Schema is versioned** — `referrals`, `referral_gifts_claimed`, `referral_review_queue`, `credits`, `daily_drops`, `streaks`, `cycle_rewards`, `lifetime_rewards` all have migration files in `/supabase/migrations/`. `npx supabase db reset` rebuilds the full schema from scratch.
2. **Credits redeem at checkout** — A user with AED 60 credit balance who buys a 200 AED plan sees "AED 60 applied" in checkout panel, pays 140 AED, and the 60 AED credit row is marked `redeemed` after webhook completes.
3. **Layer 2 milestones fire** — When `cycleRecruits` hits 3, a Mystery Drop credit row appears within 60 seconds. When it hits 6, a Free Week credit row appears. Same for 10, 15, 20. Each milestone fires exactly once per (customer, subscription) — re-running the awarder is a no-op.
4. **Layer 3 tiers fire** — When lifetime conversions hits 10, a `lifetime_rewards` row with `tier=1` is inserted. The user's next checkout shows a 5% discount applied automatically. Same flow for tiers 2, 3, 4.
5. **Daily Drop persists server-side** — User claims drop on phone at noon → opens laptop at 1pm → drop shows as "claimed" with same outcome. New drop available next UTC midnight.
6. **Streak persists server-side** — Streak count survives logout, browser switch, device switch. Increments on first hub visit each day; resets on >24h gap.
7. **Hub displays only server-canonical values** — No `localStorage` fallback for streak or daily drop in production code path.
8. **All paths idempotent** — Replaying any webhook, re-firing any cron job, double-tapping any button does not double-award. Verified by integration test.
9. **Lint + tsc clean** — No ESLint errors (the existing `<img>` warning in Sidebar is allowed). No TypeScript errors.
10. **No regressions in existing flows** — Referral claim, conversion credit, subscription state machine, checkout, webhook all still work end-to-end.

## Plans (TBD by gsd-planner)

Plans will be written to `07-XX-PLAN.md` in this directory. Expected ~5–7 plans organized as waves:
- Wave 1: Schema foundation (versioning + new tables)
- Wave 2: Credit redemption pipeline
- Wave 3: Layer 2 cycle bonuses (auto-fire + 5 milestones)
- Wave 4: Layer 3 lifetime tier perks (auto-fire + Stripe coupon delivery)
- Wave 5: Daily Drop + Streak server persistence
- Wave 6: HubClient wire-through + integration tests

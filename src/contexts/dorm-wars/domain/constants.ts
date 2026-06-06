// Phase 7 — Dorm Wars reward constants
// Values calibrated per RESEARCH Decision #7: AED 55/meal × N meals.
//
// Used by:
//   • src/lib/dorm-wars/awarder.ts — cycle-milestone loop + side effects
//   • src/lib/dorm-wars/rng.ts     — bucket distribution lookups
//   • src/lib/dorm-wars/coupon-synth.ts (07-02) — tier discount percent
//   • future 07-04 (Layer 3 tier loop) and 07-05 (Daily Drop endpoint)

// Layer 1 — per-conversion cash ladder. The AED a referral pays SCALES with
// the inviter's lifetime paid-conversion count. Single source of truth for
// BOTH the awarder (creditInviterOnConversion in src/app/r/[cid]/actions.ts)
// and the Dorm Wars hub, which renders this as "Cash per recruit (scales
// lifetime)". `range` is the display label; `from` is the inclusive lower
// bound used to pick the rung. Keep ascending by `from`; the last rung is
// open-ended (16+) so referrers past 20 keep the top rate rather than
// dropping back down.
export const LAYER1_CASH_LADDER = [
  { range: '1–5',   from: 1,  cash: 20 },
  { range: '6–10',  from: 6,  cash: 25 },
  { range: '11–15', from: 11, cash: 30 },
  { range: '16+',   from: 16, cash: 35 },
] as const

/**
 * AED earned on a referral given the inviter's LIFETIME paid-conversion count
 * INCLUDING the conversion being credited — so the Nth conversion is priced at
 * the rung N falls into. Returns the highest rung whose `from` threshold the
 * count has reached. Mirrors the hub's "You · now" highlight, which marks the
 * rung where recruits ∈ [from, nextFrom).
 */
export function cashForLifetimeConversion(lifetimeConversions: number): number {
  let cash: number = LAYER1_CASH_LADDER[0].cash
  for (const rung of LAYER1_CASH_LADDER) {
    if (lifetimeConversions >= rung.from) cash = rung.cash
  }
  return cash
}

/**
 * Total AED a referrer has earned across their first `count` lifetime
 * conversions, pricing each conversion at the rung it fell into (conversion
 * #1..#5 at AED 20, #6..#10 at AED 25, …). Used by surfaces that only know a
 * raw converted count (e.g. the sidebar referral badge for non-Dorm-Wars
 * members) and need a wallet-accurate estimate without reading the credits
 * ledger. Kept here so it can't drift from the ladder.
 */
export function totalCashForConversions(count: number): number {
  let total = 0
  for (let n = 1; n <= count; n++) total += cashForLifetimeConversion(n)
  return total
}

export const CYCLE_MILESTONES = [
  { at: 3,  kind: 'mystery_drop',   value: null }, // RNG computed at fire-time (Mystery Cash Drop)
  { at: 6,  kind: 'free_week',      value: null }, // Phase 8D — meal-aware: pricePerMeal × mealsPerWeek
  { at: 10, kind: 'free_month',     value: null }, // Phase 8D — meal-aware: pricePerMeal × totalMealsInPlan
  { at: 15, kind: 'cash_and_skips', value: 500 },  // 500 cr + 5 bonus_skips (handled separately)
  { at: 20, kind: 'dorm_weekend',   value: null }, // placeholder action (Decision #8)
] as const

export const LIFETIME_TIERS = [
  { at: 10,  tier: 1, perk: '5_percent_off' },
  { at: 25,  tier: 2, perk: '10_percent_off_plus_early_access' },
  { at: 50,  tier: 3, perk: 'jacket_merch' },
  { at: 100, tier: 4, perk: '100_meals_credit' },
] as const

// Phase 8 note: the Mystery Cash Drop's weighted RNG buckets live inline in
// src/contexts/dorm-wars/domain/rng.ts (mysteryDropValue). A duplicate
// MYSTERY_DROP_BUCKETS constant used to sit here but was never imported —
// removed so the two can't drift.

// Phase 8E — DAILY_DROP_BUCKETS removed. Daily Drop killed; Streak Chest
// RNG lives inside the claim_streak_chest Postgres function. See
// phase_8e_streak_chest_replaces_daily_drop migration.

// Tier → discount percent. Used by 07-02 coupon-synth and 07-04 tier-loop.
// Tier 0 = no tier yet (no lifetime_rewards row).
export const TIER_DISCOUNT_PERCENT = {
  0: 0,
  1: 5,
  2: 10,
  3: 10,
  4: 10,
} as const

// Phase 8D — TIER_4_MEALS_CREDIT_AED removed. Tier 4 now computes
// pricePerMeal × 100 at fire-time via resolveMealPriceContext + tier4MealsValue
// in src/lib/dorm-wars/meal-pricing.ts. Old flat AED 5500 over-credited every
// customer (assumed AED 55/meal, far above any real per-meal price).

// Milestone 15 side effect: free skips added to subscription.bonus_skips.
export const MILESTONE_15_BONUS_SKIPS = 5

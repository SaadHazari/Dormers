// Phase 7 — Dorm Wars reward constants
// Values calibrated per RESEARCH Decision #7: AED 55/meal × N meals.
//
// Used by:
//   • src/lib/dorm-wars/awarder.ts — cycle-milestone loop + side effects
//   • src/lib/dorm-wars/rng.ts     — bucket distribution lookups
//   • src/lib/dorm-wars/coupon-synth.ts (07-02) — tier discount percent
//   • future 07-04 (Layer 3 tier loop) and 07-05 (Daily Drop endpoint)

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

// Weighted distribution buckets (per Pitfall #6 — avoid uniform feel).
// Documented as intentional so future maintainers don't "fix" the bias.
// `thresholds` are cumulative percentile boundaries; `ranges` are
// [min, maxExclusive] integer ranges for crypto.randomInt.
//
// Phase 8: Mystery Drop renamed to "Mystery Cash Drop". Range narrowed and
// rebalanced so values feel meaningful (no more AED 30 rolls — every drop
// is at least dinner money) while still preserving a rare jackpot tier.
export const MYSTERY_DROP_BUCKETS = {
  // 50% chance: 30-50 AED  (common — solid)
  // 30% chance: 50-70 AED  (uncommon — strong)
  // 15% chance: 70-80 AED  (rare — premium)
  //  5% chance: 80-90 AED  (jackpot)
  thresholds: [50, 80, 95] as const,
  ranges: [[30, 51], [50, 71], [70, 81], [80, 91]] as const,
}

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

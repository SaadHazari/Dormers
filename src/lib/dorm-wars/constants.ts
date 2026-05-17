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
  { at: 6,  kind: 'free_week',      value: 132 },  // ~AED 132 = 1 week at avg plan rate (Phase 8D: meal-type-aware)
  { at: 10, kind: 'free_month',     value: 528 },  // ~AED 528 = 1 month (Phase 8D: meal-type-aware)
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

export const DAILY_DROP_BUCKETS = {
  // 60% chance: 1-10 AED
  // 30% chance: 11-50 AED
  // 10% chance: 51-200 AED
  thresholds: [60, 90] as const,
  ranges: [[1, 11], [11, 51], [51, 201]] as const,
}

// Tier → discount percent. Used by 07-02 coupon-synth and 07-04 tier-loop.
// Tier 0 = no tier yet (no lifetime_rewards row).
export const TIER_DISCOUNT_PERCENT = {
  0: 0,
  1: 5,
  2: 10,
  3: 10,
  4: 10,
} as const

// Tier 4 perk: "100 free meals" delivered as bulk credit (Decision #7).
// AED 55/meal × 100 meals = AED 5500.
export const TIER_4_MEALS_CREDIT_AED = 5500

// Milestone 15 side effect: free skips added to subscription.bonus_skips.
export const MILESTONE_15_BONUS_SKIPS = 5

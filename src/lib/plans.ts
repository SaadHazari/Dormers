/**
 * Single source of truth for plan definitions.
 *
 * Used by:
 *   - api/checkout/route.ts   — minimum-price validation
 *   - api/webhook/route.ts    — plan resolution → meals/duration/mealsPerDay
 *   - dashboard/actions.ts    — canPause / maxSkips checks
 *   - dashboard/_shared/PlanGlyph.tsx — icon selection
 *
 * Adding a new plan should be a one-row change here. If you find yourself
 * editing plan logic in multiple files, the consolidation has regressed.
 */

export type PlanId = 'monthly-max' | 'monthly-premium' | 'weekly-flex' | 'trial'

export type PlanDefinition = {
  id: PlanId
  /** Canonical label stored in `subscriptions.plan_name`. */
  label: string
  /**
   * Substrings that resolve to this plan via `.includes()`. Includes both
   * the canonical stored label and any client-side input variants (e.g.
   * client sends "Trial" but webhook stores "One-Time Trial").
   */
  matchesAny: readonly string[]
  totalMeals: number
  durationDays: number
  mealsPerDay: number
  canPause: boolean
  maxSkips: number
  /**
   * Minimum valid checkout amount in fils (AED × 100). Used as the lower
   * bound for plan/amount validation in /api/checkout. Computed from the
   * cheapest preference (Veg) × totalMeals.
   */
  minPriceFils: number
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  'monthly-max': {
    id: 'monthly-max',
    label: 'Monthly Max',
    matchesAny: ['Monthly Max'],
    totalMeals: 48, // 24 delivery days × 2 meals
    durationDays: 28,
    mealsPerDay: 2,
    canPause: true,
    maxSkips: 3,
    minPriceFils: 17.5 * 48 * 100, // 84,000 fils — AED 840
  },
  'monthly-premium': {
    id: 'monthly-premium',
    label: 'Monthly Premium',
    matchesAny: ['Monthly Premium'],
    totalMeals: 24,
    durationDays: 28,
    mealsPerDay: 1,
    canPause: true,
    maxSkips: 3,
    minPriceFils: 18 * 24 * 100, // 43,200 fils — AED 432
  },
  'weekly-flex': {
    id: 'weekly-flex',
    label: 'Weekly Flex',
    matchesAny: ['Weekly Flex'],
    totalMeals: 6,
    durationDays: 7,
    mealsPerDay: 1,
    canPause: false,
    maxSkips: 1,
    minPriceFils: 19 * 6 * 100, // 11,400 fils — AED 114
  },
  'trial': {
    id: 'trial',
    label: 'One-Time Trial',
    // Client checkout sends "Trial"; webhook stores "One-Time Trial".
    // Both forms resolve to this definition.
    matchesAny: ['One-Time Trial', 'One-Time', 'Trial'],
    totalMeals: 1,
    durationDays: 1,
    mealsPerDay: 1,
    canPause: false,
    maxSkips: 0,
    minPriceFils: 20 * 1 * 100, // 2,000 fils — AED 20
  },
}

// Most-specific labels checked first so "Monthly Max" doesn't get shadowed
// by a future "Monthly" alias on monthly-premium.
const RESOLUTION_ORDER: PlanId[] = [
  'monthly-max',
  'monthly-premium',
  'weekly-flex',
  'trial',
]

/**
 * Resolves a free-form plan string to a PlanDefinition, or null if no
 * plan matches.
 *
 * Matches via substring so legacy `plan_name` rows that include emoji or
 * other decoration still resolve correctly. Returns null on unknown
 * input — callers should handle null explicitly for business logic, or
 * use {@link resolvePlanOrTrial} for non-critical UI paths.
 */
export function resolvePlan(planString: string | null | undefined): PlanDefinition | null {
  if (!planString) return null
  for (const id of RESOLUTION_ORDER) {
    const def = PLANS[id]
    if (def.matchesAny.some((m) => planString.includes(m))) return def
  }
  return null
}

/**
 * Like {@link resolvePlan} but falls back to the trial definition for
 * unknown input. Use only in non-critical UI paths (e.g. icon selection)
 * where an unknown plan should still render something safe.
 */
export function resolvePlanOrTrial(planString: string | null | undefined): PlanDefinition {
  return resolvePlan(planString) ?? PLANS.trial
}

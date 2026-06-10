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
 *
 * NOTE on week_type: the static `totalMeals` / `durationDays` values below
 * reflect the 6DAYS cadence (Mon–Sat). Customers can also pick 5DAYS
 * (Mon–Fri); when they do, downstream callers should use {@link dBase}
 * and {@link totalMealsFor} to get the correct count rather than reading
 * the static fields. The static values stay as the 6DAYS default for
 * legacy callers that don't yet thread week_type through.
 */

import type { WeekType } from './end-date'
import { perMealPriceBounds, PLAN_ID_BY_KEBAB } from './pricing'

export type PlanId = 'monthly-max' | 'monthly-premium' | 'weekly-flex' | 'trial' | 'welcome-gift'

export type PlanKind = 'trial' | 'weekly' | 'monthly' | 'gift'

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
  // Welcome Meal — the one free meal a referee gets after claiming via
  // /r/{cid}. Not sellable through checkout (the route resolves by plan
  // string from the customer payload, and no checkout payload sends this
  // label) — it's only ever created by claimGift. Same lifecycle as a
  // 1-meal trial; the distinguishing feature is planKind='gift' which
  // routes downstream to:
  //   • the comped_meal_ledger writer (instead of orders revenue)
  //   • a welcome-themed WhatsApp template (no email, no Zoho)
  //   • the dashboard's ActiveDashboard view (no longer a special-case banner)
  'welcome-gift': {
    id: 'welcome-gift',
    label: 'Welcome Meal',
    matchesAny: ['Welcome Meal'],
    totalMeals: 1,
    durationDays: 1,
    mealsPerDay: 1,
    canPause: false,
    maxSkips: 0,
    minPriceFils: 0, // Not buyable through checkout; never reaches the floor check.
  },
}

// Most-specific labels checked first so "Monthly Max" doesn't get shadowed
// by a future "Monthly" alias on monthly-premium.
const RESOLUTION_ORDER: PlanId[] = [
  'monthly-max',
  'monthly-premium',
  'weekly-flex',
  // welcome-gift before trial — "Welcome Meal" string could otherwise
  // never match because trial sits first in the order with its own labels.
  // (Trial doesn't accept "Welcome Meal" but explicit ordering avoids any
  // future fuzzy-match regression.)
  'welcome-gift',
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

// ── Week-type aware helpers ────────────────────────────────────────────────────
// The PLANS registry above stores the 6DAYS values for backward compat. Use
// these helpers when you need the correct count for a customer who has picked
// 5DAYS (or in future, 7DAYS).

/** Maps a PlanId to its plan-kind family used by end-date math. */
export function planKindOf(id: PlanId): PlanKind {
  if (id === 'trial') return 'trial'
  if (id === 'welcome-gift') return 'gift'
  if (id === 'weekly-flex') return 'weekly'
  return 'monthly'
}

/**
 * Number of weekly reviews a plan expects per cycle. Monthly plans cover
 * 4 calendar weeks of meals; Weekly Flex covers 1; trial/gift have none.
 *
 * Source of truth for the weekly-review threshold instead of dividing the
 * calendar span by 7 — that math undercounts for 5DAYS / 6DAYS plans
 * because end_date lands on the last delivery weekday, not Sunday.
 */
export function expectedReviewWeeks(planString: string | null | undefined): number {
  const def = resolvePlan(planString)
  if (!def) return 0
  const kind = planKindOf(def.id)
  if (kind === 'monthly') return 4
  if (kind === 'weekly') return 1
  return 0
}

/** Days-per-week count for a week_type. */
function daysPerWeek(weekType: WeekType): number {
  if (weekType === '5DAYS') return 5
  if (weekType === '6DAYS') return 6
  return 7
}

/**
 * D_base — the base number of delivery days a plan covers. Trial=1,
 * Weekly=W, Monthly=4×W. Skips and pauses do NOT enter here — they
 * extend the calendar window in {@link computeEndDate}, not the meal count.
 */
export function dBase(id: PlanId, weekType: WeekType): number {
  const kind = planKindOf(id)
  if (kind === 'trial' || kind === 'gift') return 1
  const W = daysPerWeek(weekType)
  if (kind === 'weekly') return W
  return 4 * W
}

/**
 * Total meals delivered over the cycle for a (plan, week_type) combo.
 * Equals D_base × mealsPerDay. Use this instead of `def.totalMeals` when
 * the customer's week_type is known.
 */
export function totalMealsFor(id: PlanId, weekType: WeekType): number {
  return dBase(id, weekType) * PLANS[id].mealsPerDay
}

/**
 * Minimum / maximum valid checkout amount in fils (AED × 100) for
 * (plan, week_type).
 *
 * These used to carry their own Veg/NonVeg price tables — a duplicate of
 * pricing.ts that drifted (the admin panel's copy drifted the same way).
 * They now DELEGATE to the single pricing engine so a price exists in
 * exactly one place. Note these are the CODE-DEFAULT bounds: the checkout
 * route validates against the override-aware `priceBoundsFils` directly,
 * threading in the active plan_pricing rows.
 *
 * The static `def.minPriceFils` field bakes in the 6DAYS meal count, so a
 * 5DAYS customer's legit total would fail the floor check (5×19=AED 95 vs
 * the static 6×19=AED 114 floor for Weekly Flex). Use these helpers after
 * resolving the customer's week_type so the bound matches their actual
 * cycle length.
 */
export function minPriceFilsFor(id: PlanId, weekType: WeekType): number {
  // welcome-gift: free meal, not buyable through checkout — floor 0 keeps
  // the historical behaviour (max 0 below is what rejects it).
  if (id === 'welcome-gift') return 0
  // Per-meal prices are week_type-invariant; pricing.ts doesn't model
  // 7DAYS, so map it to the 6DAYS per-meal table and let totalMealsFor
  // (which DOES understand 7DAYS) supply the meal count.
  const pricingWeekType = weekType === '5DAYS' ? '5DAYS' : '6DAYS'
  const { min } = perMealPriceBounds(PLAN_ID_BY_KEBAB[id], pricingWeekType)
  return Math.round(min * totalMealsFor(id, weekType) * 100)
}

export function maxPriceFilsFor(id: PlanId, weekType: WeekType): number {
  if (id === 'welcome-gift') return 0
  const pricingWeekType = weekType === '5DAYS' ? '5DAYS' : '6DAYS'
  const { max } = perMealPriceBounds(PLAN_ID_BY_KEBAB[id], pricingWeekType)
  return Math.round(max * totalMealsFor(id, weekType) * 100)
}

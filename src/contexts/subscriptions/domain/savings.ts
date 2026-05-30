/**
 * Savings domain — "AED saved vs takeout" math + formatting for the dashboard.
 *
 * The benchmark is customer-supplied (one slider question, AED 15–50). Per-meal
 * savings = (benchmark − per-meal cost), clamped at zero so we never display
 * negative numbers when a customer reports an unusually low takeout cost.
 *
 * Cycle-scoped savings = delivered_meals × per-meal-savings.
 * Lifetime savings = sum across every subscription the customer has had, each
 * scored against THAT subscription's per-meal cost (so plan changes are
 * accurately reflected).
 *
 * "Evenings won back" counts delivery DAYS, not meals — Monthly Max delivers
 * two meals on the same evening, and the time-saved narrative speaks to
 * evenings of not having to think about dinner, not portions.
 */

import { pricePerMeal, type PlanId, type Pref, type WeekType } from './pricing'

export interface SubscriptionForSavings {
  plan_name: string
  delivered_meals: number
  total_meals: number
  week_type?: '5DAYS' | '6DAYS' | null
  veg_days?: string[] | null
}

export interface CustomerForSavings {
  meal_preference_type?: string | null
  takeout_benchmark_aed?: number | null
}

// Map the free-form `subscriptions.plan_name` (can carry emoji) to the
// pricing PlanId. Substring match in priority order so "Monthly Max" doesn't
// get shadowed by a future "Monthly" alias.
function resolvePlanId(planName: string): PlanId | null {
  if (planName.includes('Monthly Max')) return 'Monthly Max'
  if (planName.includes('Monthly Premium')) return 'Monthly Premium'
  if (planName.includes('Weekly Flex')) return 'Weekly Flex'
  if (planName.includes('Trial') || planName.includes('One-Time')) return 'Trial'
  return null
}

// Customer pref strings stored in the DB include "Carnivore", "Non Veg",
// "Plant-Based", and "Religious Preference". Normalise to the pricing.ts
// Pref union so per-meal price math stays accurate.
function resolvePref(mealPref: string | null | undefined): Pref {
  const p = (mealPref ?? '').toLowerCase()
  if (p.includes('religious')) return 'Religious'
  if (p.includes('plant') || (p.includes('veg') && !p.includes('non'))) return 'Veg'
  return 'NonVeg'
}

// Per-meal cost the customer is actually paying on this subscription. Religious
// mix needs vegDayCount (length of veg_days) because the per-meal price is a
// weighted average of veg + non-veg days.
export function perMealCost(sub: SubscriptionForSavings, customer: CustomerForSavings): number {
  const planId = resolvePlanId(sub.plan_name)
  if (!planId) return 0
  const pref = resolvePref(customer.meal_preference_type)
  const weekType: WeekType = sub.week_type === '5DAYS' ? '5DAYS' : '6DAYS'
  const vegDayCount = sub.veg_days?.length ?? 0
  return pricePerMeal(planId, pref, vegDayCount, weekType)
}

// Delivery days for "evenings won back". Monthly Max delivers two meals per
// evening (mealsPerDay=2), so 48 delivered meals = 24 evenings. Every other
// plan is 1 meal per evening, so meal count == evening count.
function deliveryDays(sub: SubscriptionForSavings): number {
  const planId = resolvePlanId(sub.plan_name)
  if (!planId) return sub.delivered_meals
  if (planId === 'Monthly Max') return Math.floor(sub.delivered_meals / 2)
  return sub.delivered_meals
}

export interface CycleSavings {
  /** AED below takeout on this cycle. Clamped ≥ 0 — never negative. */
  saved: number
  /** Delivery days delivered on this cycle (= evenings without cooking). */
  evenings: number
  /** Per-meal saving in AED for this cycle. */
  perMeal: number
}

/**
 * Savings on the current cycle. Returns null when no benchmark is set —
 * caller renders the capture CTA instead of a number.
 *
 * Also returns null when the subscription's plan_name can't be resolved to
 * a known plan. Without this guard, `perMealCost` returns 0 for unknown
 * plans, which would make `saved = delivered_meals × benchmark` — a 2-3×
 * over-claim. Skipping the metric is honest; over-claiming destroys trust
 * in every other number on the dashboard.
 */
export function cycleSavings(
  sub: SubscriptionForSavings | null | undefined,
  customer: CustomerForSavings | null | undefined,
): CycleSavings | null {
  if (!sub || !customer) return null
  const benchmark = customer.takeout_benchmark_aed ?? null
  if (benchmark == null) return null
  if (resolvePlanId(sub.plan_name) == null) return null
  const perMeal = Math.max(0, benchmark - perMealCost(sub, customer))
  return {
    saved: Math.round(sub.delivered_meals * perMeal),
    evenings: deliveryDays(sub),
    perMeal: Math.round(perMeal * 10) / 10,
  }
}

export interface LifetimeSavings {
  /** Total AED below takeout across every sub the customer has had. */
  saved: number
  /** Total evenings won back across every sub. */
  evenings: number
}

/**
 * Lifetime savings, summed across every subscription. Each sub is scored
 * against ITS OWN per-meal cost — so a customer who upgraded from Weekly
 * Flex to Monthly Max gets the right number, not an averaged guess.
 */
export function lifetimeSavings(
  subs: SubscriptionForSavings[] | null | undefined,
  customer: CustomerForSavings | null | undefined,
): LifetimeSavings | null {
  if (!subs || !customer) return null
  const benchmark = customer.takeout_benchmark_aed ?? null
  if (benchmark == null) return null
  let saved = 0
  let evenings = 0
  for (const s of subs) {
    // Skip subs whose plan_name can't be resolved — see the rationale on
    // cycleSavings. Better to undercount lifetime than to over-claim on a
    // single corrupted row.
    if (resolvePlanId(s.plan_name) == null) continue
    const perMeal = Math.max(0, benchmark - perMealCost(s, customer))
    saved += s.delivered_meals * perMeal
    evenings += deliveryDays(s)
  }
  return { saved: Math.round(saved), evenings }
}

/**
 * Format an AED amount for display.
 *
 *   <   1000 → "168"           (exact figure with locale comma thousands)
 *   >=  1000 → "1,000+"        (floor to nearest 50 + "+" suffix)
 *
 * The 50-AED bucketing above 1k acknowledges that precision at that scale
 * isn't credible AND that "1,247" reads as a too-good-to-be-true exact
 * claim. "1,000+" is honest about being a floor estimate while keeping
 * the number big. Caller renders "AED" prefix separately so it can be
 * typographically tiered-down.
 */
export function formatSavedAmount(amount: number): string {
  if (amount < 1000) {
    return String(Math.max(0, Math.round(amount)))
  }
  const floored = Math.floor(amount / 50) * 50
  return `${floored.toLocaleString('en-US')}+`
}

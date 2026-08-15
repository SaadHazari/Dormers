import type { LucideIcon } from 'lucide-react'
import {
  ChefHat, Globe, ShieldCheck, CalendarDays, SkipForward, RefreshCw,
  Unlock, BadgePercent, Pause, Zap,
} from 'lucide-react'

// Religious-mix per-meal price table. Index = number of veg days that cycle.
// Per-meal price is INTENTIONALLY identical across week_types — only the
// total cycle cost differs (because mealsForPlan(plan, weekType) varies).
// 5DAYS customers index 1..4; 6DAYS index 1..5; index 0 = pure NonVeg path,
// index 6 = pure Veg path (both reached via the non-Religious branch below).
const MIXED_MONTHLY_PER_MEAL = [22, 22, 21, 20, 19, 18, 17]
const MIXED_WEEKLY_PER_MEAL  = [23, 21.67, 21.67, 21, 21, 20, 19]

export type Pref = 'NonVeg' | 'Veg' | 'Religious'
export type PlanId = 'Trial' | 'Weekly Flex' | 'Monthly Premium' | 'Monthly Max'

// ── DB price overrides (plan_pricing) ─────────────────────────────────────────
// The admin panel is the single source of truth for price CHANGES: rows in
// `plan_pricing` override the code defaults below. This module stays pure —
// the active rows are fetched server-side (infra/supabase/pricing-repo.ts)
// and threaded into pricePerMeal/totalPrice as a plain serializable array so
// the same engine runs identically on server (checkout validation) and
// client (plan cards, checkout panels).
//
// Row semantics:
//   • plan_id is the kebab id ('monthly-max'…) — mapped via PLAN_ID_BY_KEBAB.
//   • preference 'Veg' | 'NonVeg': flat per-meal price; veg_day_count ignored.
//   • preference 'Religious' + veg_day_count N: price for exactly N veg days.
//   • preference 'Religious' + veg_day_count NULL: flat price for ALL counts.
//   • week_type: a 6DAYS row is the base price for everyone; a 5DAYS row
//     beats it for 5DAYS customers only (per-meal prices are week_type-
//     invariant by spec, so most overrides are single 6DAYS rows).
export type PriceOverride = {
  plan_id: string
  preference: string
  week_type: string
  veg_day_count: number | null
  price_per_meal: number
}

/** Display PlanId used here → kebab plan_id (plans.ts / plan_pricing). */
export const PLAN_KEBAB: Record<PlanId, string> = {
  'Trial': 'trial',
  'Weekly Flex': 'weekly-flex',
  'Monthly Premium': 'monthly-premium',
  'Monthly Max': 'monthly-max',
}

/** Kebab plan_id (plans.ts / plan_pricing) → display PlanId used here. */
export const PLAN_ID_BY_KEBAB: Record<string, PlanId> = {
  'trial': 'Trial',
  'weekly-flex': 'Weekly Flex',
  'monthly-premium': 'Monthly Premium',
  'monthly-max': 'Monthly Max',
}

/**
 * Resolves the active override price for (plan, pref, vegDayCount, weekType),
 * or null when no row matches and the code default applies.
 *
 * Lookup priority — most specific first, 6DAYS rows act as the base that a
 * week_type-specific row can shadow:
 *   Religious: (wt, count) → (6DAYS, count) → (wt, flat) → (6DAYS, flat)
 *   Veg/NonVeg: (wt) → (6DAYS)   [veg_day_count on the row is ignored]
 */
function overridePrice(
  overrides: readonly PriceOverride[] | undefined,
  plan: PlanId,
  pref: Pref,
  vegDayCount: number,
  weekType: WeekType,
): number | null {
  if (!overrides || overrides.length === 0) return null
  const kebab = PLAN_KEBAB[plan]
  const rows = overrides.filter(o => o.plan_id === kebab && o.preference === pref)
  if (rows.length === 0) return null

  const pick = (match: (o: PriceOverride) => boolean): number | null => {
    const exact = rows.find(o => o.week_type === weekType && match(o))
    if (exact) return Number(exact.price_per_meal)
    const base = rows.find(o => o.week_type === '6DAYS' && match(o))
    return base ? Number(base.price_per_meal) : null
  }

  if (pref === 'Religious') {
    return pick(o => o.veg_day_count === vegDayCount) ?? pick(o => o.veg_day_count == null)
  }
  return pick(() => true)
}

export type Feature = { text: string; icon: LucideIcon }

export interface PlanDef {
  id: PlanId
  badge?: string
  badgeTone?: 'orange' | 'gold'
  duration: string
  meals: number
  period: '/meal' | '/week' | '/month'
  features: Feature[]
  disclaimer?: string
}

export const PLANS: PlanDef[] = [
  {
    id: 'Trial',
    badge: 'One-time trial',
    duration: 'Single delivery',
    meals: 1,
    period: '/meal',
    features: [
      { text: '1 freshly cooked meal', icon: ChefHat },
      { text: 'Any cuisine preference', icon: Globe },
      { text: 'No commitment whatsoever', icon: ShieldCheck },
    ],
  },
  {
    id: 'Weekly Flex',
    badge: 'Low commitment',
    duration: '1 week · 6 days/week',
    meals: 6,
    period: '/week',
    features: [
      { text: '6 meals per week', icon: CalendarDays },
      { text: '1 meal skip included', icon: SkipForward },
      { text: 'Renew or cancel weekly', icon: RefreshCw },
      { text: 'No long-term lock-in', icon: Unlock },
    ],
  },
  {
    id: 'Monthly Premium',
    badge: 'Best value',
    badgeTone: 'orange',
    duration: '4 weeks · 6 days/week',
    meals: 24,
    period: '/month',
    features: [
      { text: '24 meals per month', icon: CalendarDays },
      { text: 'Lowest price per meal', icon: BadgePercent },
      { text: '1 free pause (indefinite)', icon: Pause },
      { text: '3 meal skips included', icon: SkipForward },
      { text: 'Priority delivery slot', icon: Zap },
    ],
  },
  {
    id: 'Monthly Max',
    badge: 'For the hungry',
    badgeTone: 'gold',
    duration: '4 weeks · 6 days/week · 2 meals/day',
    meals: 48,
    period: '/month',
    features: [
      { text: '48 meals per month (24 days × 2)', icon: CalendarDays },
      { text: 'Lowest Price across the board', icon: BadgePercent },
      { text: '1 free pause (indefinite)', icon: Pause },
      { text: '3 meal skips included', icon: SkipForward },
      { text: 'Priority delivery slot', icon: Zap },
    ],
    disclaimer:
      'Both meals delivered together at 7:00–8:00 PM. Both meals are the same dish — not two different meals.',
  },
]

export type WeekType = '5DAYS' | '6DAYS'

/**
 * Number of meals delivered for the cycle, given (plan, week_type). The
 * per-meal price stays the same across week_types (per user spec) — total
 * price differs purely because a 5DAYS cycle has fewer meals than a 6DAYS
 * cycle.
 *
 *   Trial            : 1
 *   Weekly Flex      : 5 or 6  (= W)
 *   Monthly Premium  : 20 or 24 (= 4×W × 1 meal/day)
 *   Monthly Max      : 40 or 48 (= 4×W × 2 meals/day)
 */
export function mealsForPlan(plan: PlanId, weekType: WeekType): number {
  const W = weekType === '5DAYS' ? 5 : 6
  if (plan === 'Trial') return 1
  if (plan === 'Weekly Flex') return W
  if (plan === 'Monthly Premium') return 4 * W
  if (plan === 'Monthly Max') return 4 * W * 2
  return 0
}

// Per-meal price for a plan given preference + week_type.
//
// • Veg / NonVeg: per-meal price is constant across week_types (only meal
//   count changes — total price scales with mealsForPlan).
// • Religious mix: per-meal price IS week_type-dependent because it's a
//   weighted average (vegDayCount × veg_price + (W − vegDayCount) × nonveg_price) / W.
//   A 5DAYS customer's "3 veg days" splits 3/2 of 5; a 6DAYS customer's
//   "3 veg days" splits 3/3 of 6 — different averages, different prices.
//
// vegDayCount is clamped defensively to its valid range (1..W-1) before
// table lookup so a stale customer.week_type change can't index out of bounds.
//
// `overrides` — active plan_pricing rows (admin-set). When a matching row
// exists it wins over the code tables below; otherwise the code default
// applies. Server pages fetch these once and thread them everywhere so the
// displayed price, the POSTed amount, and the server-side validation all
// agree.
export function pricePerMeal(
  plan: PlanId,
  pref: Pref,
  vegDayCount: number,
  weekType: WeekType = '6DAYS',
  overrides?: readonly PriceOverride[],
): number {
  const o = overridePrice(overrides, plan, pref, vegDayCount, weekType)
  if (o != null) return o
  if (pref === 'Religious') {
    const W = weekType === '5DAYS' ? 5 : 6
    const safeIdx = Math.max(0, Math.min(W - 1, Math.floor(vegDayCount)))
    if (plan === 'Monthly Premium') return MIXED_MONTHLY_PER_MEAL[safeIdx] ?? 22
    if (plan === 'Weekly Flex')     return MIXED_WEEKLY_PER_MEAL[safeIdx]  ?? 23
    if (plan === 'Trial')            return 25
    if (plan === 'Monthly Max')      return Math.max(0, (MIXED_MONTHLY_PER_MEAL[safeIdx] ?? 22) - 0.5)
  }
  if (pref === 'Veg') {
    if (plan === 'Monthly Premium') return 18
    if (plan === 'Weekly Flex')     return 19
    if (plan === 'Trial')            return 20
    if (plan === 'Monthly Max')      return 17.5
  }
  if (plan === 'Monthly Premium') return 22
  if (plan === 'Weekly Flex')     return 23
  if (plan === 'Trial')            return 25
  if (plan === 'Monthly Max')      return 21.5
  return 0
}

/**
 * Total price for the cycle = pricePerMeal × mealsForPlan. Defaults to
 * 6DAYS for legacy callers that haven't yet plumbed through the customer's
 * week_type preference.
 */
export function totalPrice(
  plan: PlanId,
  pref: Pref,
  vegDayCount: number,
  weekType: WeekType = '6DAYS',
  overrides?: readonly PriceOverride[],
): number {
  // Pass weekType into pricePerMeal so religious-mix prices use the right
  // table — for Veg / NonVeg it's a no-op (per-meal stays constant).
  const p = pricePerMeal(plan, pref, vegDayCount, weekType, overrides)
  const meals = mealsForPlan(plan, weekType)
  return Math.round(p * meals * 100) / 100
}

/**
 * Min/max valid cycle total in fils (AED × 100) for (plan, week_type),
 * scanning every preference the customer could legitimately submit:
 * Veg, NonVeg, and each Religious veg-day count 1..W-1.
 *
 * This is the checkout floor/ceiling. It derives from the SAME effective
 * price engine the UI renders from (code defaults + DB overrides), so an
 * admin price change in plan_pricing moves the validation band in lockstep
 * with what customers see — no more hand-maintained floor tables drifting
 * out of sync.
 */
export function priceBoundsFils(
  plan: PlanId,
  weekType: WeekType = '6DAYS',
  overrides?: readonly PriceOverride[],
): { minFils: number; maxFils: number } {
  const { min, max } = perMealPriceBounds(plan, weekType, overrides)
  const meals = mealsForPlan(plan, weekType)
  return {
    minFils: Math.round(min * meals * 100),
    maxFils: Math.round(max * meals * 100),
  }
}

/**
 * Cheapest / priciest effective per-meal price across every preference the
 * customer could submit for (plan, week_type). Split out from
 * {@link priceBoundsFils} so plans.ts can pair these per-meal bounds with
 * its own week_type-aware meal count (which also understands 7DAYS).
 */
export function perMealPriceBounds(
  plan: PlanId,
  weekType: WeekType = '6DAYS',
  overrides?: readonly PriceOverride[],
): { min: number; max: number } {
  const W = weekType === '5DAYS' ? 5 : 6
  const candidates: number[] = [
    pricePerMeal(plan, 'Veg', 0, weekType, overrides),
    pricePerMeal(plan, 'NonVeg', 0, weekType, overrides),
  ]
  for (let count = 1; count <= W - 1; count++) {
    candidates.push(pricePerMeal(plan, 'Religious', count, weekType, overrides))
  }
  return { min: Math.min(...candidates), max: Math.max(...candidates) }
}

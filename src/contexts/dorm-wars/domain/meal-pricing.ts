// src/lib/dorm-wars/meal-pricing.ts
// Phase 8D — Meal-type-aware reward value computation.
//
// Layer 2 milestones 6 + 10 (Free Week, Free Month) and Layer 3 tier 4
// (100 free meals) used to deposit hardcoded AED values (132 / 528 / 5500).
// Those numbers assumed Monthly Premium NonVeg pricing. A Veg customer on
// Monthly Max who hit Free Week was getting AED 132 instead of 17.5 × 12 =
// AED 210 (under-credited), and a Monthly Premium NonVeg on Tier 4 was
// getting AED 5500 instead of 22 × 100 = AED 2200 (over-credited by a lot).
//
// This module resolves the customer's actual per-meal price and plan size
// from their meal_preference_type + active sub (or most-recent Premium+
// sub if lapsed), so the awarder deposits the correct amount and the hub
// can display matching expected values pre-award.
//
// SHARED contract: awarder.ts and page.tsx must call the same resolver so
// the displayed "this is what you'll get" exactly matches what eventually
// lands in the wallet. Drift here = trust break.

import { pricePerMeal, mealsForPlan, type Pref, type PlanId } from '@/contexts/subscriptions/domain/pricing'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any }

export interface MealPriceContext {
  pricePerMeal:     number       // AED per meal for this customer's (plan, pref, week_type, vegDays)
  mealsPerWeek:     number       // W or 2W depending on plan
  totalMealsInPlan: number       // mealsForPlan(planId, weekType)
  planId:           PlanId       // resolved plan
  pref:             Pref         // resolved preference
  weekType:         '5DAYS' | '6DAYS'
  source:           'active-sub' | 'last-premium-sub' | 'fallback'  // for ops traceability
}

// Resolve customer.meal_preference_type free-text → canonical Pref.
// Matches the same heuristic used by src/app/dashboard/plan/PlanClient.tsx
// (lowercased substring match) so the UI and the awarder agree.
function resolvePref(raw: string | null | undefined): Pref {
  const s = (raw ?? '').toLowerCase()
  if (s.includes('religious')) return 'Religious'
  if (s.includes('plant') || (s.includes('veg') && !s.includes('non'))) return 'Veg'
  return 'NonVeg'
}

// Resolve plan_name string → PlanId. Substring match because legacy rows
// can have decorations / emoji and "Monthly Max" must match before any
// fallback to "Monthly Premium" (Max contains Monthly too).
function resolvePlanId(name: string | null | undefined): PlanId | null {
  const s = (name ?? '')
  if (s.includes('Max')) return 'Monthly Max'
  if (s.includes('Premium')) return 'Monthly Premium'
  if (s.includes('Weekly')) return 'Weekly Flex'
  if (s.includes('Trial')) return 'Trial'
  return null
}

// Fallback price context for the worst case (no customer row, no subs at all).
// Uses Monthly Premium NonVeg — the most common combo — so Tier 4 lapsed
// customers without history still get a reasonable payout.
const FALLBACK_CONTEXT: MealPriceContext = {
  pricePerMeal:     22,                 // Monthly Premium NonVeg
  mealsPerWeek:     6,                  // 6DAYS × 1 meal/day
  totalMealsInPlan: 24,                 // 4 weeks × 6 days
  planId:           'Monthly Premium',
  pref:             'NonVeg',
  weekType:         '6DAYS',
  source:           'fallback',
}

// Build the context from a known plan/pref/week_type triple.
function buildContext(
  planId: PlanId,
  pref: Pref,
  weekType: '5DAYS' | '6DAYS',
  vegDayCount: number,
  source: MealPriceContext['source'],
): MealPriceContext {
  const W = weekType === '5DAYS' ? 5 : 6
  return {
    pricePerMeal:     pricePerMeal(planId, pref, vegDayCount, weekType),
    mealsPerWeek:     planId === 'Monthly Max' ? 2 * W : W,
    totalMealsInPlan: mealsForPlan(planId, weekType),
    planId,
    pref,
    weekType,
    source,
  }
}

/**
 * Resolve the meal-pricing context for a customer + (optional) subscription.
 *
 * Layer 2 always has a subscriptionId — the active-sub path is exact.
 * Layer 3 may not — Tier 4 fires for lapsed customers too. For the no-sub
 * case we look up the customer's most-recent Premium+ sub from history;
 * if none exists, we fall back to Monthly Premium NonVeg defaults.
 */
export async function resolveMealPriceContext(
  sb: Sb,
  customerId: string,
  subscriptionId: string | null,
): Promise<MealPriceContext> {
  // Fetch the customer's preference (one round-trip regardless of sub state).
  const { data: customer } = await sb
    .from('customers')
    .select('meal_preference_type')
    .eq('id', customerId)
    .maybeSingle()

  const pref = resolvePref(customer?.meal_preference_type ?? null)

  // Path 1: active sub provided → exact context from that sub.
  if (subscriptionId) {
    const { data: sub } = await sb
      .from('subscriptions')
      .select('plan_name, week_type, veg_days')
      .eq('id', subscriptionId)
      .maybeSingle()

    if (sub) {
      const planId = resolvePlanId(sub.plan_name as string | null) ?? 'Monthly Premium'
      const weekType: '5DAYS' | '6DAYS' = (sub.week_type as '5DAYS' | '6DAYS' | null) ?? '6DAYS'
      const vegDayCount = ((sub.veg_days as string[] | null) ?? []).length
      return buildContext(planId, pref, weekType, vegDayCount, 'active-sub')
    }
  }

  // Path 2: no active sub (Tier 4 lapsed case). Find the most recent
  // Premium+ sub the customer has ever had. We restrict to Premium+ so the
  // payout reflects the customer's "real" plan tier, not a one-off Trial.
  const { data: lastSub } = await sb
    .from('subscriptions')
    .select('plan_name, week_type, veg_days')
    .eq('customer_id', customerId)
    .or('plan_name.ilike.%Premium%,plan_name.ilike.%Max%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastSub) {
    const planId = resolvePlanId(lastSub.plan_name as string | null) ?? 'Monthly Premium'
    const weekType: '5DAYS' | '6DAYS' = (lastSub.week_type as '5DAYS' | '6DAYS' | null) ?? '6DAYS'
    const vegDayCount = ((lastSub.veg_days as string[] | null) ?? []).length
    return buildContext(planId, pref, weekType, vegDayCount, 'last-premium-sub')
  }

  // Path 3: no sub history at all → safe fallback.
  return FALLBACK_CONTEXT
}

// Convenience: compute the AED value for each meal-aware milestone.
export function freeWeekValue(ctx: MealPriceContext): number {
  return Math.round(ctx.pricePerMeal * ctx.mealsPerWeek)
}
export function freeMonthValue(ctx: MealPriceContext): number {
  return Math.round(ctx.pricePerMeal * ctx.totalMealsInPlan)
}
export function tier4MealsValue(ctx: MealPriceContext): number {
  return Math.round(ctx.pricePerMeal * 100)
}

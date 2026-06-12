/**
 * Staff Monthly — the intern remuneration plan (locked 2026-06-12).
 *
 *   • 5-day week (Mon–Fri, 20 meals): FREE — this is their pay.
 *   • 6-day week (Mon–Sat, 24 meals): the 4 Saturdays are PREPAID at a
 *     flat AED 20/meal → AED 80/cycle through the normal Stripe rail.
 *     Prepay was a deliberate call ("post-paid dilemma"): deducting from
 *     the stipend at payday stings more than paying upfront.
 *
 * The plan is NOT publicly sellable: /api/checkout only accepts it from a
 * customer with an active staff_members record, at exactly the surcharge
 * amount. It never appears on the explore-plans grid (pricing.ts PLANS is
 * untouched).
 */

import type { WeekType } from '@/contexts/subscriptions/domain/end-date'

export const STAFF_PLAN_NAME = 'Staff Monthly'

export const STAFF_SATURDAY_MEAL_AED = 20
export const SATURDAYS_PER_CYCLE = 4

/** Exact cycle charge in fils — 0 on the free 5-day week. */
export function staffSurchargeFils(weekType: WeekType): number {
  return weekType === '6DAYS' ? STAFF_SATURDAY_MEAL_AED * SATURDAYS_PER_CYCLE * 100 : 0
}

/**
 * Saturdays strictly after `afterIso` through `toIso` inclusive — the
 * "unused prepaid Saturdays" an offboarded intern gets refunded. Capped at
 * SATURDAYS_PER_CYCLE because that's all they ever paid for.
 */
export function unusedSaturdays(afterIso: string, toIso: string): number {
  const d = new Date(afterIso + 'T00:00:00Z')
  const end = new Date(toIso + 'T00:00:00Z')
  let n = 0
  d.setUTCDate(d.getUTCDate() + 1)
  while (d <= end && n < SATURDAYS_PER_CYCLE) {
    if (d.getUTCDay() === 6) n++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}

/** How close to cycle end the self-renewal window opens (days). */
export const RENEWAL_WINDOW_DAYS = 7

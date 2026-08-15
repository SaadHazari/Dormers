import type { PlanId } from './plans'

/**
 * Plans the seasonal-pause waitlist credit may be redeemed against.
 *
 * `staff-monthly` is deliberately absent: it is intern remuneration assigned
 * by an admin, not a customer purchase, and the checkout route already
 * exempts it from every discount mechanism.
 */
export const MONTHLY_PLAN_IDS: readonly PlanId[] = ['monthly-max', 'monthly-premium']

/** `credits.source` value for a credit granted by joining the early-access list. */
export const INTAKE_WAITLIST_SOURCE = 'intake_waitlist'

/**
 * May this credit be applied to this plan?
 *
 * NULL / undefined means unrestricted, which is what every credit issued
 * before this feature carries (referral, Dorm Wars, weekly review). Those
 * must keep applying everywhere, so the null case returns true.
 */
export function creditAppliesToPlan(
  eligiblePlanIds: string[] | null | undefined,
  planId: PlanId,
): boolean {
  if (eligiblePlanIds == null) return true
  return eligiblePlanIds.includes(planId)
}

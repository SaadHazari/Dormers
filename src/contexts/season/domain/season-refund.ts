/**
 * Refunds for held meals (spec §10.3, owner decisions D2, D6, D7, X4, X5, X7).
 * Pure. The SQL twin is _season_refund_facts in migration season_refunds:
 * whatever these functions offer, the database recomputes under its own lock
 * before any state changes, so the app can never promise more than SQL pays.
 */

import { formatAed } from './meal-value'

/** The hold states a refund passes through (season_holds.state). */
export type RefundHoldState = 'refund_requested' | 'refund_processing' | 'refund_failed' | 'refunded'

export const REFUND_STATES: readonly RefundHoldState[] = ['refund_requested', 'refund_processing', 'refund_failed', 'refunded']

/** Plans nobody paid cash for (SQL expense_category_for_plan): held, never refunded (X5). */
const UNPAID_PLAN_NAMES: readonly string[] = ['Welcome Meal', 'Intern Program', 'Staff Monthly']

export function isUnpaidPlanName(planName: string): boolean {
  return UNPAID_PLAN_NAMES.includes(planName)
}

export interface RefundOrderMoney {
  amountPaidFils: number | null
  creditAppliedFils: number | null
  mealsCount: number | null
  stripePaymentId: string | null
  stripeSessionId: string | null
}

export interface RefundAmounts {
  cashFils: number
  creditFils: number
}

/**
 * The order's money is usable for a refund when it was recorded, it came
 * through Stripe, and the session is not test mode (D7: test payments are
 * not money).
 */
export function refundableOrder(order: RefundOrderMoney | null | undefined): order is RefundOrderMoney & { amountPaidFils: number; creditAppliedFils: number; mealsCount: number; stripePaymentId: string } {
  if (!order) return false
  if (!order.stripePaymentId) return false
  if ((order.stripeSessionId ?? '').startsWith('cs_test_')) return false
  if (order.amountPaidFils == null || order.creditAppliedFils == null) return false
  return (order.mealsCount ?? 0) > 0
}

/** Cash and credit share for `heldMeals` of an order, before the Stripe cap. */
export function seasonRefundAmounts(heldMeals: number, order: RefundOrderMoney | null | undefined): RefundAmounts | null {
  if (!refundableOrder(order) || heldMeals <= 0) return null
  return {
    cashFils: Math.floor((heldMeals * order.amountPaidFils) / order.mealsCount),
    creditFils: Math.floor((heldMeals * order.creditAppliedFils) / order.mealsCount),
  }
}

/** The cash part never exceeds what Stripe still allows on the PaymentIntent. */
export function capRefund(amounts: RefundAmounts, refundableCapFils: number): RefundAmounts {
  return { cashFils: Math.max(0, Math.min(amounts.cashFils, refundableCapFils)), creditFils: amounts.creditFils }
}

/**
 * Whether a hold can ask for a refund right now (spec §6.3): a hold that is
 * still waiting (`held`, `paused_by_customer` or `ready`) on a paid plan whose
 * order carries real money, once the owner has turned refunds on.
 */
export function seasonRefundOffer(input: {
  refundsLive: boolean
  hold: { reason: 'season' | 'customer_pause'; state: string; heldMeals: number; mealValueFils: number | null }
  planName: string
  order: RefundOrderMoney | null | undefined
}): RefundAmounts | null {
  if (!input.refundsLive) return null
  // A pause carried into the break is refundable too (owner, 2026-09-16,
  // reversing X4): during the break that customer cannot resume even if they
  // want to, so the wait is ours, not theirs.
  if (input.hold.state !== 'held' && input.hold.state !== 'ready' && input.hold.state !== 'paused_by_customer') return null
  if (input.hold.mealValueFils == null) return null
  if (isUnpaidPlanName(input.planName)) return null
  const amounts = seasonRefundAmounts(input.hold.heldMeals, input.order)
  if (!amounts || (amounts.cashFils <= 0 && amounts.creditFils <= 0)) return null
  return amounts
}

/** "AED 162 back to your card" / "AED 150 back to your card and AED 12 to your wallet". */
export function refundAmountsPhrase(amounts: RefundAmounts): string {
  const parts: string[] = []
  if (amounts.cashFils > 0) parts.push(`${formatAed(amounts.cashFils)} back to your card`)
  if (amounts.creditFils > 0) parts.push(`${formatAed(amounts.creditFils)} ${amounts.cashFils > 0 ? 'to' : 'back to'} your wallet`)
  return parts.join(' and ')
}

/** Admin wording for a hold's refund state (break board). */
export const REFUND_STATE_LABEL: Record<RefundHoldState, string> = {
  refund_requested: 'Refund requested',
  refund_processing: 'Refund processing',
  refund_failed: 'Refund failed',
  refunded: 'Refunded',
}

export function isRefundState(state: string): state is RefundHoldState {
  return (REFUND_STATES as readonly string[]).includes(state)
}

/** Copy the customer sees on the hold card, by state. Words only, no promises beyond the spec. */
export const REFUND_COPY = {
  requested: "Refund requested. We'll confirm on WhatsApp.",
  processing: 'Your refund is on its way. We will message you when it lands.',
  ask: 'Ask for a refund',
  cancel: 'Cancel request',
  confirmTitle: 'Ask for a refund?',
  confirmKeep: 'Keep my meals',
  confirmAsk: 'Yes, ask for a refund',
  changed: 'Your plan changed. Refresh and try again.',
} as const

/** The idempotency key that makes a retried Stripe refund return the same refund (spec §10.3). */
export function seasonRefundIdempotencyKey(holdId: string): string {
  return `refund:season:${holdId}`
}

/** Friendly words for the SQL refusals (SEASON_REFUND_*). */
export function friendlyRefundError(message: string): string {
  if (message.includes('SEASON_REFUND_BAD_STATE')) return REFUND_COPY.changed
  if (message.includes('SEASON_REFUND_NOT_OFFERED')) return 'A refund is not available for this plan.'
  if (message.includes('SEASON_REFUND_NOTHING')) return 'There is nothing left to refund on this payment.'
  if (message.includes('SEASON_REFUND_NOT_HELD') || message.includes('SEASON_REFUND_NOT_FOUND')) return 'This plan is not held for next semester.'
  if (message.includes('SEASON_REFUND_BAD_INPUT')) return 'Something was missing from the request. Refresh and try again.'
  return 'Could not update the refund. Refresh and try again.'
}

/**
 * Plan refunds (owner decision 2026-09-16): the owner turns on "Allow a
 * refund" for one customer, the customer refunds the rest of their plan from
 * My Plan, and the plan ends. Pure. The SQL twin is _plan_refund_facts in
 * migration plan_refunds: the database recomputes every amount under its own
 * lock, so what this module shows is never more than what SQL pays.
 */

import { formatAed } from '@/contexts/season/domain/meal-value'

/** What plan_refund_offer returns: the refund the customer would get right now. */
export interface PlanRefundOffer {
  refundedMeals: number
  /** After the 2 PM cutoff tonight's dinner is already cooking: delivered, not refunded. */
  tonightKept: boolean
  cashFils: number
  creditFils: number
}

export type PlanRefundState = 'processing' | 'failed' | 'refunded'

/** Parse the jsonb from plan_refund_offer; null when there is no offer. */
export function parsePlanRefundOffer(raw: unknown): PlanRefundOffer | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const refundedMeals = Number(r.refunded_meals ?? 0)
  const cashFils = Number(r.cash_fils ?? 0)
  const creditFils = Number(r.credit_fils ?? 0)
  if (!(refundedMeals > 0) || (cashFils <= 0 && creditFils <= 0)) return null
  return { refundedMeals, tonightKept: r.tonight_kept === true, cashFils, creditFils }
}

function mealsWord(n: number): string {
  return n === 1 ? '1 meal' : `${n} meals`
}

/** "AED 280 back to your card and AED 14 to your wallet". */
export function planRefundMoneyPhrase(cashFils: number, creditFils: number): string {
  const parts: string[] = []
  if (cashFils > 0) parts.push(`${formatAed(cashFils)} back to your card`)
  if (creditFils > 0) parts.push(`${formatAed(creditFils)} ${cashFils > 0 ? 'to' : 'back to'} your wallet`)
  return parts.join(' and ')
}

/** Words for the My Plan button and its confirm step. No dashes, no emoji. */
export const PLAN_REFUND_COPY = {
  button: 'Refund my remaining meals',
  confirmTitle: 'Refund your remaining meals?',
  keep: 'Keep my plan',
  confirm: 'Yes, refund and end my plan',
  pending: 'Refunding',
  done: 'Your refund is on its way. We have sent the details on WhatsApp and by email.',
  cardTiming: 'Card refunds usually show on your statement within 5 to 10 working days.',
} as const

/** The lines of the confirm step, in order. */
export function planRefundConfirmLines(offer: PlanRefundOffer): string[] {
  const lines = [`We refund your ${mealsWord(offer.refundedMeals)} left: ${planRefundMoneyPhrase(offer.cashFils, offer.creditFils)}.`]
  lines.push(
    offer.tonightKept
      ? "Tonight's dinner is already being cooked, so it still arrives. Your plan ends after it."
      : 'Your plan ends now. No more dinners will be delivered.',
  )
  if (offer.cashFils > 0) lines.push(PLAN_REFUND_COPY.cardTiming)
  lines.push('This cannot be undone. To eat with us again, you buy a new plan.')
  return lines
}

/** The idempotency key that makes a retried Stripe refund return the same refund. */
export function planRefundIdempotencyKey(refundId: string): string {
  return `refund:plan:${refundId}`
}

/** Friendly words for the SQL refusals (PLAN_REFUND_*). */
export function friendlyPlanRefundError(message: string): string {
  if (message.includes('PLAN_REFUND_NOT_ALLOWED')) return 'A refund is not available for your plan right now. Message us on WhatsApp if you need help.'
  if (message.includes('PLAN_REFUND_ALREADY')) return 'This plan has already been refunded.'
  if (message.includes('PLAN_REFUND_SEASON_HOLD')) return 'Your plan is kept for next semester. Ask for a refund from your home page instead.'
  if (message.includes('PLAN_REFUND_STRIPE_CHANGED')) return 'Part of this payment was already refunded, so we will sort the rest out with you on WhatsApp.'
  if (message.includes('PLAN_REFUND_NOTHING')) return 'There is nothing left to refund on this plan.'
  if (message.includes('PLAN_REFUND_NOT_OFFERED')) return 'A refund is not available for this plan.'
  if (message.includes('PLAN_REFUND_BAD_STATE')) return 'Your plan changed. Refresh and try again.'
  if (message.includes('PLAN_REFUND_NOT_FOUND')) return 'We could not find this plan. Refresh and try again.'
  return 'Could not refund your plan. Refresh and try again.'
}

/** A refund left in processing this long is treated as stuck (SQL plan_refund_retry agrees). */
export const PLAN_REFUND_STUCK_MS = 10 * 60 * 1000

/** Admin wording for a refund row. */
export const PLAN_REFUND_STATE_LABEL: Record<PlanRefundState, string> = {
  processing: 'Refund in progress',
  failed: 'Refund failed',
  refunded: 'Refunded',
}

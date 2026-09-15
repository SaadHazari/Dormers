/**
 * One customer's held plan, for the dashboard (spec §6.3, §12.2 N8, N9, N13,
 * N13b). Pure: the dashboard page reads season_holds and passes the row in.
 */

import type { SeasonPhase } from './season-phase'
import { seasonRefundOffer, type RefundAmounts, type RefundOrderMoney } from './season-refund'

export type CustomerHoldState =
  | 'held'
  | 'paused_by_customer'
  | 'ready'
  | 'refund_requested'
  | 'refund_processing'
  | 'refund_failed'

export interface CustomerHold {
  id: string
  subscriptionId: string
  reason: 'season' | 'customer_pause'
  state: CustomerHoldState
  heldMeals: number
  /** The waitlist credit minted with this hold, in fils; null when none was. */
  waitlistCreditFils: number | null
  planName: string
  planStatus: 'Paused' | 'Scheduled'
  /** What a refund would return right now; null when none is offered (spec §10.3). */
  refundOffer: RefundAmounts | null
  /** The amounts stored on a request in flight (refund_requested, processing, failed). */
  refundRequested: RefundAmounts | null
  /** The owner's words when the last request was declined (N13b). */
  refundDeclineReason: string | null
}

export interface CustomerBreak {
  phase: SeasonPhase
  hold: CustomerHold
}

const SHOWN: readonly string[] = ['held', 'paused_by_customer', 'ready', 'refund_requested', 'refund_processing', 'refund_failed']
/** A failed refund is the owner's problem, not the customer's: they still see "requested". */
const IN_FLIGHT: readonly string[] = ['refund_requested', 'refund_processing', 'refund_failed']

export function customerHoldFrom(input: {
  hold: Record<string, unknown> | null | undefined
  sub: { id: string; plan_name: string; status: string | null; season_hold_id?: string | null } | null | undefined
  creditAmountAed: number | null
  order?: RefundOrderMoney | null
  refundsLive?: boolean
}): CustomerHold | null {
  const { hold, sub } = input
  if (!hold || !sub || !sub.season_hold_id || hold.id !== sub.season_hold_id) return null
  if (!SHOWN.includes(String(hold.state))) return null
  const status = sub.status
  if (status !== 'Paused' && status !== 'Scheduled') return null
  const state = hold.state as CustomerHoldState
  const heldMeals = Math.max(0, Number(hold.held_meals ?? 0))
  const reason = hold.reason === 'customer_pause' ? 'customer_pause' : 'season'
  const fils = (v: unknown): number | null => (v == null ? null : Math.max(0, Number(v)))
  const cash = fils(hold.cash_refund_fils)
  const credit = fils(hold.credit_share_fils)
  return {
    id: String(hold.id),
    subscriptionId: sub.id,
    reason,
    state,
    heldMeals,
    waitlistCreditFils: input.creditAmountAed == null ? null : Math.round(input.creditAmountAed * 100),
    planName: sub.plan_name,
    planStatus: status,
    refundOffer: seasonRefundOffer({
      refundsLive: input.refundsLive === true,
      hold: { reason, state, heldMeals, mealValueFils: fils(hold.meal_value_fils) },
      planName: sub.plan_name,
      order: input.order,
    }),
    refundRequested: IN_FLIGHT.includes(state) && (cash != null || credit != null) ? { cashFils: cash ?? 0, creditFils: credit ?? 0 } : null,
    refundDeclineReason: typeof hold.refund_decline_reason === 'string' && hold.refund_decline_reason.trim() ? hold.refund_decline_reason.trim() : null,
  }
}

/**
 * A hold shows during the break, and afterwards while it is ready or a refund
 * is in flight, until the customer restarts the plan or the refund lands.
 */
export function buildCustomerBreak(phase: SeasonPhase, hold: CustomerHold | null): CustomerBreak | null {
  if (!hold) return null
  if (phase !== 'break' && hold.state !== 'ready' && !IN_FLIGHT.includes(hold.state)) return null
  return { phase, hold }
}

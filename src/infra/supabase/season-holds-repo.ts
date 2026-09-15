import type { SupabaseClient } from '@supabase/supabase-js'
import { customerHoldFrom, type CustomerHold } from '@/contexts/season/domain/customer-hold'
import { SEASON_REFUNDS_LIVE } from '@/contexts/season/domain/season-release'
import type { RefundOrderMoney } from '@/contexts/season/domain/season-refund'

/**
 * The customer's own hold (spec §6.3). season_holds, credits and orders are
 * readable by the customer through RLS, so the dashboard's user client reads
 * them. A read error shows no card rather than a wrong one; an order that
 * cannot be read simply offers no refund.
 */

export type HoldsClient = Pick<SupabaseClient, 'from'>

export async function getCustomerHold(
  sb: HoldsClient,
  sub: { id: string; plan_name: string; status: string | null; season_hold_id?: string | null } | null,
  options: { refundsLive?: boolean } = {},
): Promise<CustomerHold | null> {
  if (!sub?.season_hold_id) return null
  const holdRes = await sb
    .from('season_holds')
    .select('id, reason, state, held_meals, meal_value_fils, waitlist_credit_id, order_id, cash_refund_fils, credit_share_fils, refund_decline_reason')
    .eq('id', sub.season_hold_id)
    .maybeSingle()
  if (holdRes.error || !holdRes.data) return null
  const hold = holdRes.data as Record<string, unknown>

  let creditAmountAed: number | null = null
  if (typeof hold.waitlist_credit_id === 'string') {
    const creditRes = await sb.from('credits').select('amount_aed').eq('id', hold.waitlist_credit_id).maybeSingle()
    if (!creditRes.error && creditRes.data) creditAmountAed = Number((creditRes.data as { amount_aed: number | string }).amount_aed)
  }

  const refundsLive = options.refundsLive ?? SEASON_REFUNDS_LIVE
  let order: RefundOrderMoney | null = null
  if (refundsLive && hold.reason === 'season' && typeof hold.order_id === 'string' && hold.meal_value_fils != null) {
    const orderRes = await sb
      .from('orders')
      .select('amount_paid_fils, credit_applied_fils, meals_count, stripe_payment_id, stripe_session_id')
      .eq('id', hold.order_id)
      .maybeSingle()
    if (!orderRes.error && orderRes.data) {
      const o = orderRes.data as Record<string, unknown>
      order = {
        amountPaidFils: o.amount_paid_fils == null ? null : Number(o.amount_paid_fils),
        creditAppliedFils: o.credit_applied_fils == null ? null : Number(o.credit_applied_fils),
        mealsCount: o.meals_count == null ? null : Number(o.meals_count),
        stripePaymentId: typeof o.stripe_payment_id === 'string' ? o.stripe_payment_id : null,
        stripeSessionId: typeof o.stripe_session_id === 'string' ? o.stripe_session_id : null,
      }
    }
  }
  return customerHoldFrom({ hold, sub, creditAmountAed, order, refundsLive })
}

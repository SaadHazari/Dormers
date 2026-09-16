'use server'

/**
 * The customer's side of a season refund (spec §10.3 steps 1 and the cancel
 * row of §6.3; owner decisions D2, D6). Both actions are compare-and-sets in
 * SQL (season_request_refund, season_cancel_refund_request): the app reads
 * Stripe for the cap, the database recomputes the amounts under its own lock
 * and refuses anything the hold's state does not allow. The owner hears about
 * every request and every cancellation on WhatsApp through notifyAdmin.
 */

import { withOwnedSubscription } from '@/contexts/subscriptions/usecases/with-owned-subscription'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { refundableFils } from '@/infra/stripe/refunds'
import { notifyAdmin } from '@/infra/admin-alerts/notify'
import { captureError } from '@/infra/logging/capture-error'
import { SEASON_REFUNDS_LIVE } from '../domain/season-release'
import { formatAed } from '../domain/meal-value'
import { REFUND_COPY, friendlyRefundError, seasonRefundOffer, type RefundOrderMoney } from '../domain/season-refund'

export type SeasonRefundActionResult = { success: true; message: string } | { error: string }

const NOT_OFFERED = 'A refund is not available for this plan.'
const STRIPE_UNREACHABLE = 'We could not check your payment with Stripe just now. Try again in a minute.'

type HoldFacts = {
  hold: Record<string, unknown>
  planName: string
  order: RefundOrderMoney | null
}

async function loadHoldFacts(sb: ReturnType<typeof createAdminSupabaseClient>, holdId: string, planName: string): Promise<HoldFacts | null> {
  const holdRes = await sb
    .from('season_holds')
    .select('id, reason, state, held_meals, meal_value_fils, order_id, cash_refund_fils, credit_share_fils')
    .eq('id', holdId)
    .maybeSingle()
  if (holdRes.error || !holdRes.data) return null
  const hold = holdRes.data as Record<string, unknown>
  let order: RefundOrderMoney | null = null
  if (typeof hold.order_id === 'string') {
    const orderRes = await sb
      .from('orders')
      .select('amount_paid_fils, credit_applied_fils, meals_count, stripe_payment_id, stripe_session_id')
      .eq('id', hold.order_id)
      .maybeSingle()
    if (orderRes.error) return null
    const o = (orderRes.data ?? null) as Record<string, unknown> | null
    if (o) {
      order = {
        amountPaidFils: o.amount_paid_fils == null ? null : Number(o.amount_paid_fils),
        creditAppliedFils: o.credit_applied_fils == null ? null : Number(o.credit_applied_fils),
        mealsCount: o.meals_count == null ? null : Number(o.meals_count),
        stripePaymentId: typeof o.stripe_payment_id === 'string' ? o.stripe_payment_id : null,
        stripeSessionId: typeof o.stripe_session_id === 'string' ? o.stripe_session_id : null,
      }
    }
  }
  return { hold, planName, order }
}

async function customerLabel(sb: ReturnType<typeof createAdminSupabaseClient>, customerId: string): Promise<string> {
  const { data } = await sb.from('customers').select('name, whatsapp_number').eq('id', customerId).maybeSingle()
  const row = (data ?? {}) as { name?: string | null; whatsapp_number?: string | null }
  const name = (row.name ?? '').trim() || 'A customer'
  return row.whatsapp_number ? `${name} (${row.whatsapp_number})` : name
}

export async function requestSeasonRefund(subscriptionId: string): Promise<SeasonRefundActionResult> {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
    if (!SEASON_REFUNDS_LIVE) return { error: NOT_OFFERED }
    if (!subscription.season_hold_id) return { error: 'This plan is not held for next semester.' }

    const sb = createAdminSupabaseClient()
    const facts = await loadHoldFacts(sb, subscription.season_hold_id, subscription.plan_name)
    if (!facts) return { error: 'Could not read your plan. Refresh and try again.' }
    const offer = seasonRefundOffer({
      refundsLive: true,
      hold: {
        reason: facts.hold.reason === 'customer_pause' ? 'customer_pause' : 'season',
        state: String(facts.hold.state),
        heldMeals: Number(facts.hold.held_meals ?? 0),
        mealValueFils: facts.hold.meal_value_fils == null ? null : Number(facts.hold.meal_value_fils),
      },
      planName: facts.planName,
      order: facts.order,
    })
    if (!offer || !facts.order?.stripePaymentId) return { error: NOT_OFFERED }

    let cap: number
    try {
      cap = await refundableFils(facts.order.stripePaymentId)
    } catch (err) {
      captureError(err, { area: 'season', op: 'requestSeasonRefund.refundable', subscriptionId })
      return { error: STRIPE_UNREACHABLE }
    }

    const { data, error } = await sb.rpc('season_request_refund', {
      p_customer_id: auth.user.id,
      p_subscription_id: subscriptionId,
      p_refundable_cap_fils: cap,
    })
    if (error) return { error: friendlyRefundError(error.message) }
    const row = (data ?? {}) as { held_meals?: number; cash_refund_fils?: number; credit_share_fils?: number; plan_name?: string }

    const who = await customerLabel(sb, auth.user.id)
    void notifyAdmin(
      `Refund requested: ${who}, ${row.plan_name ?? subscription.plan_name}, ${row.held_meals ?? 0} held meals. ` +
      `${formatAed(row.cash_refund_fils ?? 0)} back to the card, ${formatAed(row.credit_share_fils ?? 0)} back to the wallet. ` +
      'Approve or decline on the Season page.',
      'season_refund',
    )
    return { success: true, message: REFUND_COPY.requested }
  }, 'season.refund_requested')
}

export async function cancelSeasonRefundRequest(subscriptionId: string): Promise<SeasonRefundActionResult> {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
    if (!subscription.season_hold_id) return { error: 'This plan is not held for next semester.' }
    const sb = createAdminSupabaseClient()
    const { data, error } = await sb.rpc('season_cancel_refund_request', {
      p_customer_id: auth.user.id,
      p_subscription_id: subscriptionId,
    })
    if (error) return { error: friendlyRefundError(error.message) }
    const row = (data ?? {}) as { plan_name?: string; held_meals?: number }
    const who = await customerLabel(sb, auth.user.id)
    void notifyAdmin(
      `Refund request cancelled: ${who} keeps their ${row.held_meals ?? 0} held meals of ${row.plan_name ?? subscription.plan_name} for next semester. Nothing to do.`,
      'season_refund',
    )
    return { success: true, message: 'Request cancelled. Your meals stay kept for next semester.' }
  }, 'season.refund_cancelled')
}

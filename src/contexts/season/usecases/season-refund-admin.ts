import 'server-only'

/**
 * The owner's side of a season refund (spec §10.3 steps 2 to 5, D6).
 *
 * approve: re-read what Stripe still allows, move the hold to
 * refund_processing (SQL recomputes the amounts under its lock and marks the
 * order), call Stripe with the hold-scoped idempotency key, then finish in one
 * SQL transaction (hold refunded, plan Ended, credit share back). Any failure
 * after the hold is processing lands on refund_failed with the error, and a
 * Stripe refund that did go through is kept on the hold so Retry never pays
 * twice. A credit-only refund (cash 0) needs no Stripe call and no webhook,
 * so the customer is told from here.
 *
 * decline: back to held or ready with the owner's reason; the customer reads
 * it on the hold card and in an email (N13b).
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { refundPaymentFils, refundableFils } from '@/infra/stripe/refunds'
import { notifyAdmin } from '@/infra/admin-alerts/notify'
import { captureError } from '@/infra/logging/capture-error'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { queueCustomerNotification } from '@/contexts/notifications/usecases/queue'
import { sendAdminCustomerEmail, sendRefundProcessedEmail } from '@/infra/zeptomail/client'
import { formatAed } from '../domain/meal-value'
import { friendlyRefundError, seasonRefundIdempotencyKey } from '../domain/season-refund'

export type SeasonRefundAdminResult = { ok: true; message: string } | { error: string }

type Sb = ReturnType<typeof createAdminSupabaseClient>

type ApproveRow = {
  hold_id: string
  subscription_id: string
  customer_id: string
  order_id: string
  plan_name: string
  held_meals: number
  payment_intent: string
  cash_refund_fils: number
  credit_share_fils: number
  stripe_refund_id: string | null
}

async function paymentIntentForHold(sb: Sb, holdId: string): Promise<string | null> {
  const { data: hold } = await sb.from('season_holds').select('order_id, state').eq('id', holdId).maybeSingle()
  const orderId = (hold as { order_id?: string | null } | null)?.order_id
  if (!orderId) return null
  const { data: order } = await sb.from('orders').select('stripe_payment_id').eq('id', orderId).maybeSingle()
  return ((order as { stripe_payment_id?: string | null } | null)?.stripe_payment_id) ?? null
}

async function markFailed(sb: Sb, holdId: string, error: string, stripeRefundId: string | null): Promise<void> {
  const { error: failErr } = await sb.rpc('season_fail_refund', { p_hold_id: holdId, p_error: error, p_stripe_refund_id: stripeRefundId })
  if (failErr) captureError(new Error(failErr.message), { area: 'season', op: 'approveSeasonRefund.markFailed', holdId })
}

async function tellCustomerCreditOnly(sb: Sb, row: ApproveRow): Promise<void> {
  try {
    const { data } = await sb.from('customers').select('name, email').eq('id', row.customer_id).maybeSingle()
    const customer = (data ?? null) as { name?: string | null; email?: string | null } | null
    if (!customer) return
    const firstName = (customer.name ?? '').trim().split(/\s+/)[0] || 'there'
    const refundAed = (row.credit_share_fils / 100).toFixed(2)
    await queueCustomerNotification(row.customer_id, 'refund_processed', new Date(), { refund_aed: refundAed })
    if (customer.email) {
      await sendRefundProcessedEmail({ toEmail: customer.email, firstName, refundAed, orderNumber: row.order_id, creditsRestored: false })
    }
  } catch (err) {
    captureError(err, { area: 'season', op: 'approveSeasonRefund.tellCustomer', holdId: row.hold_id })
  }
}

export async function approveSeasonRefund(actorEmail: string, holdId: string): Promise<SeasonRefundAdminResult> {
  const sb = createAdminSupabaseClient()

  const intent = await paymentIntentForHold(sb, holdId)
  if (!intent) return { error: 'This hold has no Stripe payment behind it, so nothing can be refunded.' }
  let cap: number
  try {
    cap = await refundableFils(intent)
  } catch (err) {
    captureError(err, { area: 'season', op: 'approveSeasonRefund.refundable', holdId })
    return { error: 'Stripe could not be read just now. Nothing changed; try again in a minute.' }
  }

  const { data, error } = await sb.rpc('season_approve_refund', { p_hold_id: holdId, p_actor: actorEmail, p_refundable_cap_fils: cap })
  if (error) return { error: friendlyRefundError(error.message) }
  const row = data as ApproveRow

  let refundId: string | null = row.stripe_refund_id ?? null
  if (row.cash_refund_fils > 0 && !refundId) {
    try {
      refundId = await refundPaymentFils(row.payment_intent, row.cash_refund_fils, seasonRefundIdempotencyKey(row.hold_id))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      captureError(err, { area: 'season', op: 'approveSeasonRefund.stripe', holdId })
      await markFailed(sb, holdId, `Stripe: ${message}`, null)
      void notifyAdmin(`Season refund FAILED at Stripe for hold ${holdId} (${row.plan_name}, ${formatAed(row.cash_refund_fils)}): ${message}. Retry from the Season page.`, 'season_refund')
      return { error: `Stripe refused the refund: ${message}. The hold is marked failed; retry when Stripe is back.` }
    }
  }

  const { error: finishErr } = await sb.rpc('season_finish_refund', { p_hold_id: holdId, p_stripe_refund_id: refundId ?? '' })
  if (finishErr) {
    await markFailed(sb, holdId, `Recording failed after Stripe accepted ${refundId ?? 'no refund'}: ${finishErr.message}`, refundId)
    void notifyAdmin(`Season refund for hold ${holdId} went through at Stripe (${refundId ?? 'credit only'}) but recording it failed: ${finishErr.message}. Retry from the Season page; Stripe will not be charged twice.`, 'season_refund')
    return { error: `Stripe accepted the refund (${refundId ?? 'credit only'}) but recording it failed: ${finishErr.message}. Retry; Stripe will not pay twice.` }
  }

  if (row.cash_refund_fils === 0) await tellCustomerCreditOnly(sb, row)

  await logAdminAction(actorEmail, 'season_refund_approved', 'season_hold', holdId, {
    subscription_id: row.subscription_id,
    customer_id: row.customer_id,
    cash_refund_fils: row.cash_refund_fils,
    credit_share_fils: row.credit_share_fils,
    stripe_refund_id: refundId,
  })
  const parts = [`${formatAed(row.cash_refund_fils)} back to the card${refundId ? ` (${refundId})` : ''}`]
  if (row.credit_share_fils > 0) parts.push(`${formatAed(row.credit_share_fils)} back to the wallet`)
  return { ok: true, message: `Refunded: ${parts.join(', ')}. The plan has ended.` }
}

export async function declineSeasonRefund(actorEmail: string, holdId: string, reason: string): Promise<SeasonRefundAdminResult> {
  const clean = reason.trim()
  if (!clean) return { error: 'Give the customer a reason; they read it on their plan card.' }
  if (clean.length > 300) return { error: 'Keep the reason under 300 characters.' }

  const sb = createAdminSupabaseClient()
  const { data, error } = await sb.rpc('season_decline_refund', { p_hold_id: holdId, p_actor: actorEmail, p_reason: clean })
  if (error) return { error: friendlyRefundError(error.message) }
  const row = data as { subscription_id: string; customer_id: string; plan_name: string; held_meals: number; state: string }

  try {
    const { data: customer } = await sb.from('customers').select('name, email').eq('id', row.customer_id).maybeSingle()
    const c = (customer ?? null) as { name?: string | null; email?: string | null } | null
    if (c?.email) {
      const firstName = (c.name ?? '').trim().split(/\s+/)[0] || 'there'
      const meals = `${row.held_meals} ${row.held_meals === 1 ? 'meal' : 'meals'}`
      await sendAdminCustomerEmail({
        toEmail: c.email,
        firstName,
        subject: 'About your refund request',
        bodyText:
          `We looked at your refund request for your ${row.plan_name} and we can't process it this time.\n\n` +
          `${clean}\n\n` +
          `Your ${meals} ${row.held_meals === 1 ? 'stays' : 'stay'} kept for next semester, ` +
          (row.state === 'ready' ? 'and you can restart your plan from your home page whenever you like.' : "and you can restart your plan once we're back.") +
          ' If you want to talk it through, we are a message away on WhatsApp.',
        includeSupportBox: true,
      })
    }
  } catch (err) {
    captureError(err, { area: 'season', op: 'declineSeasonRefund.email', holdId })
  }

  await logAdminAction(actorEmail, 'season_refund_declined', 'season_hold', holdId, {
    subscription_id: row.subscription_id,
    customer_id: row.customer_id,
    reason: clean,
  })
  return { ok: true, message: 'Declined. The customer sees your reason on their plan card and by email.' }
}

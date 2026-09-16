import 'server-only'

/**
 * Plan refunds (owner decision 2026-09-16). The owner's switch lets one
 * customer refund the rest of their plan from My Plan; pressing the button
 * pays it straight away, because the switch is the owner's approval.
 *
 * start: read what Stripe still allows, then plan_refund_start rechecks the
 * switch and the plan under lock, ends the plan (or cuts it to tonight's
 * dinner after the 2 PM cutoff), turns the switch off and leaves a
 * processing row. pay: Stripe refund keyed to that row, plan_refund_finish
 * (wallet share back), then the Zoho credit note. The Stripe webhook
 * (charge.refunded) sends the customer the refund WhatsApp and email; a
 * credit-only refund has no webhook, so the customer is told from here.
 *
 * Any failure after the row exists lands on `failed` with the error and a
 * Stripe refund that did go through is kept. Every Stripe refund is tagged
 * with the row id and looked up before one is made, so the owner's Try the
 * refund again never pays twice, even after a lost response. A row left in
 * processing (a request that died) can be retried after 10 minutes.
 */

import { after } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { findRefundByMetadata, refundPaymentFils, refundableFils } from '@/infra/stripe/refunds'
import { notifyAdmin } from '@/infra/admin-alerts/notify'
import { captureError } from '@/infra/logging/capture-error'
import { queueCustomerNotification } from '@/contexts/notifications/usecases/queue'
import { sendRefundProcessedEmail } from '@/infra/zeptomail/client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { sendRefundCreditNote } from '@/contexts/payments/usecases/refund-credit-note'
import { formatAed } from '@/contexts/season/domain/meal-value'
import {
  PLAN_REFUND_COPY, friendlyPlanRefundError, parsePlanRefundOffer,
  planRefundIdempotencyKey, planRefundMoneyPhrase, type PlanRefundOffer,
} from '../domain/plan-refund'

type Sb = ReturnType<typeof createAdminSupabaseClient>

export type PlanRefundRow = {
  refund_id: string
  subscription_id: string
  customer_id: string
  order_id: string
  plan_name: string
  payment_intent: string
  refunded_meals: number
  tonight_kept: boolean
  cash_refund_fils: number
  credit_share_fils: number
  stripe_refund_id: string | null
}

export type PlanRefundResult = { ok: true; message: string } | { error: string }

const NOT_AVAILABLE = 'A refund is not available for this plan.'
const STRIPE_UNREACHABLE = 'We could not check your payment with Stripe just now. Nothing changed. Try again in a minute.'
const AFTER_START_FAILED = 'Your plan has ended and we are finishing your refund by hand. We will message you on WhatsApp.'

async function rawOffer(sb: Sb, customerId: string, subscriptionId: string): Promise<{ offer: PlanRefundOffer; paymentIntent: string } | null> {
  const { data, error } = await sb.rpc('plan_refund_offer', { p_customer_id: customerId, p_subscription_id: subscriptionId })
  if (error) {
    captureError(new Error(error.message), { area: 'refunds', op: 'planRefundOffer', subscriptionId })
    return null
  }
  const offer = parsePlanRefundOffer(data)
  const paymentIntent = (data as { payment_intent?: unknown } | null)?.payment_intent
  if (!offer || typeof paymentIntent !== 'string') return null
  return { offer, paymentIntent }
}

/**
 * What My Plan shows. Null unless the owner's switch is on and the plan
 * qualifies. Also null when Stripe allows less than the card share: money
 * already went back some other way, so the owner settles it by hand (SQL
 * refuses the same case). If Stripe cannot be read the offer is shown, and
 * the button checks again.
 */
export async function getPlanRefundOffer(customerId: string, subscriptionId: string): Promise<PlanRefundOffer | null> {
  const sb = createAdminSupabaseClient()
  const found = await rawOffer(sb, customerId, subscriptionId)
  if (!found) return null
  try {
    return (await refundableFils(found.paymentIntent)) < found.offer.cashFils ? null : found.offer
  } catch (err) {
    captureError(err, { area: 'refunds', op: 'getPlanRefundOffer.refundable', subscriptionId })
    return found.offer
  }
}

/** Everything My Plan needs about a refund of the current plan. */
export async function getPlanRefundView(customerId: string, subscription: { id: string; status: string }): Promise<{ offer: PlanRefundOffer | null; lastDinnerTonight: boolean }> {
  const sb = createAdminSupabaseClient()
  const { data } = await sb.from('plan_refunds').select('tonight_kept').eq('subscription_id', subscription.id).maybeSingle()
  if (data) {
    return { offer: null, lastDinnerTonight: (data as { tonight_kept?: boolean }).tonight_kept === true && subscription.status !== 'Ended' }
  }
  return { offer: await getPlanRefundOffer(customerId, subscription.id), lastDinnerTonight: false }
}

async function customerFacts(sb: Sb, customerId: string): Promise<{ label: string; firstName: string; email: string | null }> {
  const { data } = await sb.from('customers').select('name, whatsapp_number, email').eq('id', customerId).maybeSingle()
  const row = (data ?? {}) as { name?: string | null; whatsapp_number?: string | null; email?: string | null }
  const name = (row.name ?? '').trim() || 'A customer'
  return {
    label: row.whatsapp_number ? `${name} (${row.whatsapp_number})` : name,
    firstName: name.split(/\s+/)[0] || 'there',
    email: row.email ?? null,
  }
}

async function markFailed(sb: Sb, refundId: string, error: string, stripeRefundId: string | null): Promise<void> {
  const { error: failErr } = await sb.rpc('plan_refund_fail', { p_refund_id: refundId, p_error: error, p_stripe_refund_id: stripeRefundId })
  if (failErr) captureError(new Error(failErr.message), { area: 'refunds', op: 'planRefund.markFailed', refundId })
}

/** Stripe, then the bookkeeping, then the credit note. The row is `processing` on entry. */
async function payPlanRefund(sb: Sb, row: PlanRefundRow): Promise<PlanRefundResult> {
  const who = await customerFacts(sb, row.customer_id)
  let refundId = row.stripe_refund_id

  if (row.cash_refund_fils > 0 && !refundId) {
    try {
      refundId = await findRefundByMetadata(row.payment_intent, 'plan_refund_id', row.refund_id)
        ?? await refundPaymentFils(row.payment_intent, row.cash_refund_fils, planRefundIdempotencyKey(row.refund_id), { plan_refund_id: row.refund_id })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      captureError(err, { area: 'refunds', op: 'planRefund.stripe', refundId: row.refund_id })
      await markFailed(sb, row.refund_id, `Stripe: ${message}`, null)
      void notifyAdmin(
        `Plan refund FAILED at Stripe: ${who.label}, ${row.plan_name}, ${formatAed(row.cash_refund_fils)}: ${message}. ` +
        "The plan has already ended. Press Try the refund again on the customer's page.",
        'plan_refund',
      )
      return { error: `Stripe refused the refund: ${message}` }
    }
  }

  const { error: finishErr } = await sb.rpc('plan_refund_finish', { p_refund_id: row.refund_id, p_stripe_refund_id: refundId ?? '' })
  if (finishErr) {
    await markFailed(sb, row.refund_id, `Recording failed after Stripe accepted ${refundId ?? 'no refund'}: ${finishErr.message}`, refundId)
    void notifyAdmin(
      `Plan refund for ${who.label} went through at Stripe (${refundId ?? 'credit only'}) but recording it failed: ${finishErr.message}. ` +
      "Press Try the refund again on the customer's page; nobody is paid twice.",
      'plan_refund',
    )
    return { error: `Stripe accepted the refund (${refundId ?? 'credit only'}) but recording it failed: ${finishErr.message}` }
  }

  if (row.cash_refund_fils > 0) {
    // Seven Zoho calls: after the response, so the customer is not kept waiting
    // on them. A failure reports itself and is retried from the admin page.
    const note = {
      kind: 'plan_refund' as const,
      refundId: row.refund_id,
      orderId: row.order_id,
      customerId: row.customer_id,
      refundedMeals: row.refunded_meals,
      cashFils: row.cash_refund_fils,
      stripeRefundId: refundId,
    }
    after(async () => { await sendRefundCreditNote(note) })
  } else {
    // No Stripe refund means no charge.refunded webhook, so tell the customer here.
    try {
      const refundAed = (row.credit_share_fils / 100).toFixed(2)
      await queueCustomerNotification(row.customer_id, 'refund_processed', new Date(), { refund_aed: refundAed })
      if (who.email) {
        await sendRefundProcessedEmail({ toEmail: who.email, firstName: who.firstName, refundAed, orderNumber: row.order_id, creditsRestored: false })
      }
    } catch (err) {
      captureError(err, { area: 'refunds', op: 'planRefund.tellCustomer', refundId: row.refund_id })
    }
  }

  void notifyAdmin(
    `Plan refunded: ${who.label}, ${row.plan_name}, ${row.refunded_meals} meals. ` +
    `${formatAed(row.cash_refund_fils)} to the card${refundId ? ` (${refundId})` : ''}, ${formatAed(row.credit_share_fils)} to the wallet. ` +
    `${row.tonight_kept ? "Tonight's dinner still goes out; the plan ends after it." : 'The plan has ended.'} The refund switch is off again.`,
    'plan_refund',
  )
  return { ok: true, message: `${PLAN_REFUND_COPY.done} ${planRefundMoneyPhrase(row.cash_refund_fils, row.credit_share_fils)}.` }
}

/** The customer presses Refund my remaining meals. Ownership is checked by the caller. */
export async function startPlanRefund(customerId: string, subscriptionId: string): Promise<PlanRefundResult> {
  const sb = createAdminSupabaseClient()
  const found = await rawOffer(sb, customerId, subscriptionId)
  if (!found) return { error: NOT_AVAILABLE }

  let cap: number
  try {
    cap = await refundableFils(found.paymentIntent)
  } catch (err) {
    captureError(err, { area: 'refunds', op: 'startPlanRefund.refundable', subscriptionId })
    return { error: STRIPE_UNREACHABLE }
  }

  const { data, error } = await sb.rpc('plan_refund_start', { p_customer_id: customerId, p_subscription_id: subscriptionId, p_refundable_cap_fils: cap })
  if (error) {
    if (error.message.includes('PLAN_REFUND_STRIPE_CHANGED')) {
      const who = await customerFacts(sb, customerId)
      void notifyAdmin(
        `Plan refund REFUSED for ${who.label}: part of their payment was already refunded in Stripe, so the amounts no longer add up. ` +
        'Nothing changed and their plan is still running. Settle it by hand in Stripe and message them.',
        'plan_refund',
      )
    }
    return { error: friendlyPlanRefundError(error.message) }
  }

  const paid = await payPlanRefund(sb, data as PlanRefundRow)
  return 'error' in paid ? { error: AFTER_START_FAILED } : paid
}

/**
 * The owner's Try the refund again, on a failed refund or one stuck in
 * processing for 10 minutes. The amount never changes; payPlanRefund finds
 * an earlier Stripe refund before making one.
 */
export async function retryPlanRefund(actorEmail: string, refundId: string): Promise<PlanRefundResult> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb.rpc('plan_refund_retry', { p_refund_id: refundId, p_refundable_cap_fils: null })
  if (error) return { error: friendlyPlanRefundError(error.message) }
  const result = await payPlanRefund(sb, data as PlanRefundRow)
  await logAdminAction(actorEmail, 'plan_refund_retried', 'plan_refund', refundId, { ok: 'ok' in result })
  if ('error' in result) return result
  const r = data as PlanRefundRow
  return { ok: true, message: `Refunded: ${formatAed(r.cash_refund_fils)} to the card, ${formatAed(r.credit_share_fils)} to the wallet.` }
}

/** The owner's Allow a refund switch. */
export async function setRefundAllowed(actorEmail: string, customerId: string, allowed: boolean): Promise<PlanRefundResult> {
  const sb = createAdminSupabaseClient()
  const { error } = await sb
    .from('customers')
    .update(allowed ? { refund_allowed_at: new Date().toISOString(), refund_allowed_by: actorEmail } : { refund_allowed_at: null, refund_allowed_by: null })
    .eq('id', customerId)
  if (error) return { error: `Could not change the switch: ${error.message}` }
  await logAdminAction(actorEmail, allowed ? 'plan_refund_allowed' : 'plan_refund_disallowed', 'customer', customerId)
  return {
    ok: true,
    message: allowed
      ? 'Refund allowed. The customer now sees Refund my remaining meals on My Plan.'
      : 'Refund switched off. The button is hidden again.',
  }
}

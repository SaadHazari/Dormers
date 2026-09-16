import 'server-only'

import { stripeClient } from './client'

/**
 * Refund against a payment intent — used by the staff program (declined
 * renewals get a FULL refund; offboarding refunds the unused prepaid
 * Saturdays partially).
 *
 * Omit `amountFils` for a full refund of whatever remains refundable.
 * Throws on Stripe rejection so callers decide whether the surrounding
 * state change proceeds (offboarding does — the plan still ends and the
 * refund is retried manually; a declined renewal does NOT flip to Ended
 * until the refund succeeds).
 */
export async function refundPaymentFils(
  paymentIntentId: string,
  amountFils?: number,
  idempotencyKey?: string,
  metadata?: Record<string, string>,
): Promise<string> {
  const stripe = stripeClient()
  // Release It! L2: a DETERMINISTIC idempotency key makes a retried refund
  // (network blip, double-tap, re-run after a "failed" that actually succeeded)
  // return the SAME refund instead of paying real money twice. Callers pass an
  // operation-scoped key (refund:<kind>:<subId>); we fall back to a key derived
  // from the intent + amount so even un-keyed callers are protected.
  const key = idempotencyKey ?? `refund:${paymentIntentId}:${amountFils ?? 'full'}`
  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      ...(amountFils != null ? { amount: amountFils } : {}),
      ...(metadata ? { metadata } : {}),
    },
    { idempotencyKey: key },
  )
  return refund.id
}

/**
 * What Stripe would still refund on a PaymentIntent, in fils: the amount it
 * received less what has already been refunded (a support refund issued by
 * hand, say). Season refunds are capped at this before any state changes
 * (spec §10.3). Throws when Stripe cannot be read; callers refuse rather
 * than guess.
 */
export async function refundableFils(paymentIntentId: string): Promise<number> {
  const stripe = stripeClient()
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] })
  const charge = intent.latest_charge
  const refunded = charge && typeof charge !== 'string' ? charge.amount_refunded ?? 0 : 0
  return Math.max(0, (intent.amount_received ?? 0) - refunded)
}

/**
 * A refund made earlier on this PaymentIntent and tagged with
 * `metadata[key] = value`, if Stripe has one that did not fail. Lets a retry
 * find a refund whose response was lost (a timeout after Stripe paid), since
 * the idempotency key only protects for 24 hours and only for the same amount.
 * Throws when Stripe cannot be read; callers refuse rather than refund blind.
 */
export async function findRefundByMetadata(paymentIntentId: string, key: string, value: string): Promise<string | null> {
  const stripe = stripeClient()
  const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 })
  const match = refunds.data.find((r) => r.metadata?.[key] === value && r.status !== 'failed' && r.status !== 'canceled')
  return match?.id ?? null
}

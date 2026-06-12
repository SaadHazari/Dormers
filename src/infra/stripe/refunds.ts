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
export async function refundPaymentFils(paymentIntentId: string, amountFils?: number): Promise<string> {
  const stripe = stripeClient()
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(amountFils != null ? { amount: amountFils } : {}),
  })
  return refund.id
}

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
    },
    { idempotencyKey: key },
  )
  return refund.id
}

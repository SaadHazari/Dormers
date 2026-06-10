/**
 * Stripe webhook entry point — thin HTTP shell.
 *
 * Verifies the Stripe signature, hands the parsed event off to the payments
 * use-case, then maps its HandleResult to a NextResponse. All orchestration
 * (idempotency, subscription creation, credit flips, fanout, refunds) lives
 * in @/contexts/payments/usecases/handle-stripe-event per L1's boundary rule.
 */

import { NextResponse } from 'next/server'
import { constructWebhookEvent } from '@/infra/stripe/client'
import { handleStripeEvent } from '@/contexts/payments/usecases/handle-stripe-event'
import { notifyAdmin } from '@/infra/admin-alerts/notify'

export const maxDuration = 60

export async function POST(req: Request) {
  // We need the parsed event id in the outer catch for the admin alert
  // payload (e.g. "checkout.session.completed evt_xxx threw"). Declared
  // here so it's available in both the inner try block and the outer
  // catch handler.
  let eventId = 'unknown'
  let eventType = 'unknown'
  try {
    const bodyText = await req.text()
    const signature = req.headers.get('stripe-signature') as string

    let event
    try {
      event = constructWebhookEvent(bodyText, signature)
    } catch (err: unknown) {
      // Signature failures are noisy on staging environments where the
      // wrong secret is configured — do NOT alert on those, they'd spam
      // the admin number. Only alert post-signature.
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`❌ Webhook Error: ${errorMessage}`)
      return NextResponse.json({ error: `Webhook Error: ${errorMessage}` }, { status: 400 })
    }
    eventId = event.id
    eventType = event.type

    const result = await handleStripeEvent(event)
    if (!result.ok) {
      void notifyAdmin(
        `Stripe webhook handler returned error: ${eventType} ${eventId} → ${result.status} "${result.error}". ` +
        `Stripe will retry — check Sentry / logs.`,
        eventId.slice(0, 18),
      )
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ received: true, ...result })
  } catch (error: unknown) {
    console.error('❌ Webhook overall error:', error)
    // Throws after signature verification = real bug we can't auto-handle.
    // Always alert — every customer payment burns through this code path.
    const msg = error instanceof Error ? error.message : String(error)
    void notifyAdmin(
      `Stripe webhook CRASHED on ${eventType} ${eventId}: ${msg}. ` +
      `Stripe will retry; if the bug is deterministic the retry will also fail. Check Sentry immediately.`,
      eventId.slice(0, 18),
    )
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

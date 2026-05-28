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

export async function POST(req: Request) {
  try {
    const bodyText = await req.text()
    const signature = req.headers.get('stripe-signature') as string

    let event
    try {
      event = constructWebhookEvent(bodyText, signature)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`❌ Webhook Error: ${errorMessage}`)
      return NextResponse.json({ error: `Webhook Error: ${errorMessage}` }, { status: 400 })
    }

    const result = await handleStripeEvent(event)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ received: true, ...result })
  } catch (error: unknown) {
    console.error('❌ Webhook overall error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

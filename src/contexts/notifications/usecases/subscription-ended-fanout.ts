/**
 * Subscription-ended fan-out — two-channel orchestrator (WhatsApp + email)
 * fired when subscription_status_tick flips a sub to Ended. Mirrors the
 * renew-nudge fan-out shape: WhatsApp first (idempotency anchor), email
 * fire-and-log.
 */

import { queueCustomerNotification } from './queue'
import { sendSubscriptionEndedEmail } from '@/infra/zeptomail/client'

export interface SubscriptionEndedInput {
  customerId: string
  toEmail: string
  firstName: string
  planName: string
  mealsDelivered: number
  evenings: number
  aedSaved: number | null
  aedEarned: number
  renewLink: string
}

export interface SubscriptionEndedResult {
  customerId: string
  whatsapp: 'ok' | { error: string }
  email: 'ok' | { error: string }
}

export async function runSubscriptionEndedForCustomer(
  input: SubscriptionEndedInput,
): Promise<SubscriptionEndedResult> {
  await sendWhatsApp(input)

  try {
    await sendEmail(input)
    return { customerId: input.customerId, whatsapp: 'ok', email: 'ok' }
  } catch (err) {
    return {
      customerId: input.customerId,
      whatsapp: 'ok',
      email: { error: err instanceof Error ? err.message : String(err) },
    }
  }
}

async function sendWhatsApp(input: SubscriptionEndedInput): Promise<void> {
  await queueCustomerNotification(
    input.customerId,
    'subscription_ended',
    new Date(),
    {
      plan_name: input.planName,
      delivered_meals: String(input.mealsDelivered),
    },
  )
}

async function sendEmail(input: SubscriptionEndedInput): Promise<void> {
  await sendSubscriptionEndedEmail({
    toEmail: input.toEmail,
    firstName: input.firstName,
    planName: input.planName,
    mealsDelivered: input.mealsDelivered,
    evenings: input.evenings,
    aedSaved: input.aedSaved,
    aedEarned: input.aedEarned,
    renewLink: input.renewLink,
  })
}

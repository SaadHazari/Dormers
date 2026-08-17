/**
 * Subscription-ended fan-out — two-channel orchestrator (WhatsApp + email)
 * fired when subscription_status_tick flips a sub to Ended. Mirrors the
 * renew-nudge fan-out shape: WhatsApp first (idempotency anchor), email
 * fire-and-log.
 *
 * Seasonal pause: both channels change when intake is paused. The caller
 * resolves the notice (resolveEndedNotice in ../domain/pause-suppression) and
 * hands it in; this file only executes it. WhatsApp is closed out rather than
 * sent — no season template exists at Meta — and the email swaps to the
 * season copy, because the standard one drives at a renewal that checkout
 * will refuse.
 */

import { queueCustomerNotification, markCustomerNotificationSkipped } from './queue'
import { sendSubscriptionEndedEmail, sendSeasonPlanEndedEmail } from '@/infra/zeptomail/client'
import type { EndedNotice } from '../domain/pause-suppression'

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
  /** What to send on each channel. Defaults to the open-intake behaviour so a
   *  caller that has no IntakeState in scope keeps working unchanged. */
  notice?: EndedNotice
}

export interface SubscriptionEndedResult {
  customerId: string
  whatsapp: 'ok' | 'skipped:intake_paused' | { error: string }
  email: 'ok' | { error: string }
}

const OPEN_INTAKE_NOTICE: EndedNotice = {
  whatsapp: 'send',
  email: { variant: 'normal' },
}

export async function runSubscriptionEndedForCustomer(
  input: SubscriptionEndedInput,
): Promise<SubscriptionEndedResult> {
  const notice = input.notice ?? OPEN_INTAKE_NOTICE

  // Throws on failure either way, so the cron retries cleanly. The row this
  // writes — sent or skipped — is what the selector dedups on, so it has to
  // land before we move on to email.
  const whatsapp = await runWhatsApp(input, notice)

  try {
    await sendEmail(input, notice)
    return { customerId: input.customerId, whatsapp, email: 'ok' }
  } catch (err) {
    return {
      customerId: input.customerId,
      whatsapp,
      email: { error: err instanceof Error ? err.message : String(err) },
    }
  }
}

async function runWhatsApp(
  input: SubscriptionEndedInput,
  notice: EndedNotice,
): Promise<'ok' | 'skipped:intake_paused'> {
  const payload = {
    plan_name: input.planName,
    delivered_meals: String(input.mealsDelivered),
  }

  if (notice.whatsapp === 'skip') {
    // Closed-out row, never dispatched. Keeps the 7-day dedup anchor so the
    // cron stops re-attempting, and records that the hold-back was deliberate.
    await markCustomerNotificationSkipped(
      input.customerId,
      'subscription_ended',
      'intake_paused',
      payload,
    )
    return 'skipped:intake_paused'
  }

  await queueCustomerNotification(input.customerId, 'subscription_ended', new Date(), payload)
  return 'ok'
}

async function sendEmail(
  input: SubscriptionEndedInput,
  notice: EndedNotice,
): Promise<void> {
  if (notice.email.variant === 'season') {
    await sendSeasonPlanEndedEmail({
      toEmail: input.toEmail,
      firstName: input.firstName,
      planName: input.planName,
      mealsDelivered: input.mealsDelivered,
      evenings: input.evenings,
      block: notice.email.block,
      aed: notice.email.aed,
      ctaLabel: notice.email.ctaLabel,
      ctaUrl: notice.email.ctaUrl,
    })
    return
  }

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

/**
 * Subscription-ended fan-out — two-channel orchestrator (WhatsApp + email)
 * fired when subscription_status_tick flips a sub to Ended. Mirrors the
 * renew-nudge fan-out shape: WhatsApp first (idempotency anchor), email
 * fire-and-log.
 *
 * Seasonal pause: both channels change when intake is paused, because the
 * standard copy drives at a renewal that checkout will refuse. The caller
 * resolves the notice (resolveEndedNotice in ../domain/pause-suppression) and
 * hands it in; this file only executes it. Email swaps template. WhatsApp
 * swaps to a season template once those are live at Meta, and until then is
 * closed out rather than sent.
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
  whatsapp: 'ok' | 'ok:season' | 'skipped:intake_paused' | { error: string }
  email: 'ok' | { error: string }
}

const OPEN_INTAKE_NOTICE: EndedNotice = {
  whatsapp: { mode: 'send' },
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
): Promise<'ok' | 'ok:season' | 'skipped:intake_paused'> {
  const payload = {
    plan_name: input.planName,
    delivered_meals: String(input.mealsDelivered),
  }

  if (notice.whatsapp.mode === 'skip') {
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

  if (notice.whatsapp.mode === 'season') {
    // The amount's payload key must match the parameter_name in the
    // dispatcher's CASE branch for this kind, which in turn must match the
    // template as approved in Business Manager.
    const amountKey = notice.whatsapp.kind === 'intake_ended_credit' ? 'credit_aed' : 'offer_aed'
    await queueCustomerNotification(input.customerId, notice.whatsapp.kind, new Date(), {
      ...payload,
      [amountKey]: String(notice.whatsapp.aed),
    })
    return 'ok:season'
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

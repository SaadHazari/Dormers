/**
 * Renew-nudge fan-out — the two-channel orchestrator for the T-3 days
 * renewal reminder. Mirrors the post-payment fan-out shape: WhatsApp and
 * email run concurrently via Promise.all, one failing does not block the
 * other, failures bubble up as a structured result so the caller can log
 * per-channel outcomes.
 *
 * The caller (cron tick) is responsible for:
 *   • Selecting eligible customers (Active sub, end_date in T-3 window,
 *     no Scheduled follow-on, not nudged in last 7 days)
 *   • Computing meals_delivered, evenings, aed_saved, aed_earned via the
 *     existing savings.ts + credits aggregation
 *   • Building the renew_link (full HTTPS, e.g. https://dormers.ae/dashboard/plan?renew=1)
 *
 * This file does NOT do selection — that lands in the cron migration once
 * the architecture is finalized. Until a caller wires up, this is dead
 * code, which is the intent for phase 1.
 */

import { queueCustomerNotification } from './queue'
import { sendRenewNudgeEmail } from '@/infra/zeptomail/client'

export interface RenewNudgeInput {
  customerId: string
  toEmail: string
  firstName: string
  planName: string
  /** ISO YYYY-MM-DD — the subscription's end_date. */
  endDateIso: string
  mealsDelivered: number
  evenings: number
  /** null when no takeout benchmark set — email omits the savings bullet. */
  aedSaved: number | null
  /** 0 when no rewards earned this cycle — email omits the rewards bullet. */
  aedEarned: number
  /** Full HTTPS URL, e.g. https://dormers.ae/dashboard/plan?renew=1 */
  renewLink: string
}

export interface RenewNudgeResult {
  customerId: string
  whatsapp: 'ok' | { error: string }
  email: 'ok' | { error: string }
}

/**
 * Fires the renewal nudge for ONE customer. WhatsApp runs first; if it
 * succeeds, the inserted customer_notifications row becomes the
 * idempotency anchor — the cron's selection query skips this customer
 * on subsequent runs via the 7-day dedup window. Email then runs
 * fire-and-log: if it fails, no retry happens (we already committed to
 * "nudged" by inserting the WhatsApp row), so email is at-most-once.
 *
 * If WhatsApp fails, the row is NOT inserted, the function throws, and
 * the next cron tick will re-attempt the whole nudge for this customer
 * (since the dedup check finds no prior row). Email is skipped in this
 * branch so we never send a duplicate email on retry.
 */
export async function runRenewNudgeForCustomer(
  input: RenewNudgeInput,
): Promise<RenewNudgeResult> {
  // WhatsApp first — throws on failure so the cron retries cleanly.
  await sendWhatsApp(input)

  // Email — fire-and-log. We've committed to "nudged" via the WhatsApp
  // row, so a single email failure is not retried by the cron (avoids
  // duplicate emails on transient ZeptoMail errors).
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

async function sendWhatsApp(input: RenewNudgeInput): Promise<void> {
  // The Meta template's "Renew Now" button is a STATIC URL — every customer
  // lands on the same /dashboard/plan?renew=1, which detects their session
  // and pre-selects their last plan. So renew_link does NOT go in the
  // WhatsApp payload; the button URL is baked into the template at
  // approval time. The body uses only first_name (header), plan_name, and
  // end_date.
  await queueCustomerNotification(
    input.customerId,
    'subscription_renew_nudge',
    new Date(),
    {
      plan_name: input.planName,
      end_date: input.endDateIso,
    },
  )
}

async function sendEmail(input: RenewNudgeInput): Promise<void> {
  await sendRenewNudgeEmail({
    toEmail: input.toEmail,
    firstName: input.firstName,
    planName: input.planName,
    endDateIso: input.endDateIso,
    mealsDelivered: input.mealsDelivered,
    evenings: input.evenings,
    aedSaved: input.aedSaved,
    aedEarned: input.aedEarned,
    renewLink: input.renewLink,
  })
}

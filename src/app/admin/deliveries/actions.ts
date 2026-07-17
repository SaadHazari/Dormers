'use server'

// Admin failsafe — manually queue today's delivery WhatsApp for every active
// customer. Last resort when the rider verification flow, the owner iOS
// shortcut, and the per-dorm fanout all failed to notify customers.
// Dedup lives in the usecase: customers who already have a delivery_confirmed
// row for today are never re-messaged, so the button is safe to press even
// after a partial fanout.

import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { queueDeliveryConfirmedFailsafe } from '@/contexts/ops/usecases/queue-delivery-confirmed-notifications'
import { captureError } from '@/infra/logging/capture-error'

export type DeliveryFailsafeResult =
  | { ok: true; queued: number; alreadyNotified: number; skipped: number }
  | { ok: false; message: string }

export async function sendDeliveryMessageFailsafe(): Promise<DeliveryFailsafeResult> {
  const admin = await requireAdmin()

  // Today in UAE wall time — never trust a client-supplied date.
  const AE_OFFSET_MS = 4 * 60 * 60 * 1000
  const aeNow = new Date(Date.now() + AE_OFFSET_MS)
  const deliveryDateIso = aeNow.toISOString().slice(0, 10)
  const aeDow = aeNow.getUTCDay()

  // Sunday never delivers — a mass "your food has arrived" on Sunday would be
  // wrong for every single customer, so hard-block it.
  if (aeDow === 0) {
    return { ok: false, message: 'There are no deliveries on Sunday, so there is no delivery message to send today.' }
  }

  try {
    const result = await queueDeliveryConfirmedFailsafe(deliveryDateIso, aeDow === 6)
    await logAdminAction(admin.email, 'delivery_message_failsafe', 'customer_notifications', deliveryDateIso, {
      queued: result.queued,
      already_notified: result.alreadyNotified,
      skipped: result.skipped,
    })
    return { ok: true, ...result }
  } catch (err) {
    captureError(err, { area: 'admin', op: 'send-delivery-failsafe', date: deliveryDateIso })
    return { ok: false, message: 'Could not queue the messages, nothing was sent. Try again in a minute.' }
  }
}

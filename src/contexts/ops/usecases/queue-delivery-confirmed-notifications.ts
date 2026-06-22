/**
 * Fanout — queues delivery_confirmed WhatsApp for each eligible subscriber in
 * a dorm. Called from verify-box-count API route after triple-match
 * verification. Fire-and-log pattern — caller catches and logs any top-level
 * errors.
 *
 * Mirrors getDormCounts filter logic exactly:
 *   • 5DAYS plans skip Saturday
 *   • skipped_dates subscribers excluded for the delivery date
 *   • paused_dates subscribers excluded for the delivery date
 *   • Only subscribers whose dorm matches the verified dorm receive a notification
 *
 * This is a cross-context import (ops → notifications), which is the
 * established pattern for post-payment fanout and subscription-ended fanout.
 * ARC-04 approval: notifications context is the authoritative send path.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { queueCustomerNotification } from '@/contexts/notifications/usecases/queue'

/**
 * Queue a delivery_confirmed WhatsApp for every active, non-skipped,
 * non-paused subscriber in the given dorm.
 *
 * @param dormName         - Exact dorm name string as stored in customers.dorm_name
 * @param deliveryDateIso  - "YYYY-MM-DD" in UAE wall time
 * @param isSaturday       - true when UAE wall-clock day is Saturday (5DAYS plans skip Saturday)
 * @returns                - Count of notifications queued and subscribers skipped
 */
export async function queueDeliveryConfirmedNotifications(
  dormName: string,
  deliveryDateIso: string,
  isSaturday: boolean,
): Promise<{ queued: number; skipped: number }> {
  const sb = createAdminSupabaseClient()

  // Capacity (Phase 7 / L6): we already know the target dorm, so fetch only THIS
  // dorm's customers + their active subscriptions instead of scanning the entire
  // customers and subscriptions tables and filtering in memory. The dorm-match
  // is now enforced by the query (customerDorm !== dormName check is redundant).
  const { data: dormCustomers } = await sb
    .from('customers')
    .select('id')
    .eq('dorm_name', dormName)
  const dormCustomerIds = (dormCustomers ?? []).map((c) => (c as { id: string }).id)
  if (dormCustomerIds.length === 0) return { queued: 0, skipped: 0 }

  const subsRes = await sb
    .from('subscriptions')
    .select('id, customer_id, week_type, skipped_dates, paused_dates')
    .in('status', ['Active', 'Paused', 'Skipped'])
    .in('customer_id', dormCustomerIds)

  // Use a Set to deduplicate — one customer can theoretically have more than
  // one subscription in these statuses but should only receive one WhatsApp
  const eligibleCustomerIds = new Set<string>()
  let skipped = 0

  for (const sub of (subsRes.data ?? []) as Array<{
    id: string
    customer_id: string
    week_type: string | null
    skipped_dates: string[] | null
    paused_dates: string[] | null
  }>) {
    // 5DAYS plans do not deliver on Saturday
    if (sub.week_type === '5DAYS' && isSaturday) {
      skipped++
      continue
    }
    // Skip if today is in skipped_dates
    if ((sub.skipped_dates ?? []).includes(deliveryDateIso)) {
      skipped++
      continue
    }
    // Skip if today is in paused_dates
    if ((sub.paused_dates ?? []).includes(deliveryDateIso)) {
      skipped++
      continue
    }

    eligibleCustomerIds.add(sub.customer_id)
  }

  let queued = 0

  for (const customerId of eligibleCustomerIds) {
    try {
      await queueCustomerNotification(
        customerId,
        'delivery_confirmed',
        new Date(),
        { dorm_name: dormName },
      )
      queued++
    } catch (err) {
      // One failed queue does not block notifications for other customers
      console.error(
        `[queue-delivery-confirmed-notifications] queueCustomerNotification failed for customer=${customerId} dorm=${dormName}:`,
        err,
      )
    }
  }

  return { queued, skipped }
}

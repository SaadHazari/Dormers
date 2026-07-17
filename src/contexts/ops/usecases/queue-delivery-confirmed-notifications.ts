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

type EligibilitySub = {
  customer_id: string
  week_type: string | null
  skipped_dates: string[] | null
  paused_dates: string[] | null
}

/**
 * Shared eligibility filter for delivery notifications — mirrors getDormCounts:
 * 5DAYS plans skip Saturday; skipped_dates / paused_dates exclude the date.
 * Both the per-dorm rider fanout and the admin failsafe MUST agree on this.
 */
function isEligibleForDelivery(
  sub: EligibilitySub,
  deliveryDateIso: string,
  isSaturday: boolean,
): boolean {
  if (sub.week_type === '5DAYS' && isSaturday) return false
  if ((sub.skipped_dates ?? []).includes(deliveryDateIso)) return false
  if ((sub.paused_dates ?? []).includes(deliveryDateIso)) return false
  return true
}

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

  for (const sub of (subsRes.data ?? []) as Array<EligibilitySub & { id: string }>) {
    if (!isEligibleForDelivery(sub, deliveryDateIso, isSaturday)) {
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

/**
 * Universal admin failsafe — queue delivery_confirmed for EVERY eligible
 * subscriber across ALL dorms, skipping anyone who already has a
 * delivery_confirmed row for today. The last resort when the rider flow,
 * the owner shortcut, and the per-dorm fanout all failed.
 *
 * Differences from the per-dorm fanout above:
 *   • Not scoped to one dorm — sweeps every active subscriber.
 *   • Dedupes per customer against today's queued/sent rows, so pressing
 *     the button after a partial fanout only fills the gap (one delivery
 *     per dorm per day is the system invariant — trip_number is always 1).
 *   • Bulk INSERT + a single dispatcher kick instead of N round-trips, so
 *     the admin action stays well inside the platform timeout.
 *
 * The live delivery_confirmed template takes no variables (verified against
 * the prod dispatcher), so the payload is audit-only: `source` marks these
 * rows as failsafe sends, dorm_name is recorded when known.
 *
 * Throws on any query/insert failure — the admin is watching and needs the
 * real error, not a silent zero.
 */
export async function queueDeliveryConfirmedFailsafe(
  deliveryDateIso: string,
  isSaturday: boolean,
): Promise<{ queued: number; alreadyNotified: number; skipped: number }> {
  const sb = createAdminSupabaseClient()

  const subsRes = await sb
    .from('subscriptions')
    .select('customer_id, week_type, skipped_dates, paused_dates')
    .in('status', ['Active', 'Paused', 'Skipped'])
  if (subsRes.error) {
    throw new Error(`failsafe: subscriptions query failed: ${subsRes.error.message}`)
  }

  const eligibleCustomerIds = new Set<string>()
  let skipped = 0
  for (const sub of (subsRes.data ?? []) as EligibilitySub[]) {
    if (!isEligibleForDelivery(sub, deliveryDateIso, isSaturday)) {
      skipped++
      continue
    }
    eligibleCustomerIds.add(sub.customer_id)
  }
  if (eligibleCustomerIds.size === 0) return { queued: 0, alreadyNotified: 0, skipped }

  const customerIds = [...eligibleCustomerIds]

  // Dedup window: everything queued since AE midnight of the delivery date.
  // scheduled_for is stored in UTC; AE midnight = 20:00 UTC the day before.
  // Pending rows count too — the cron will send them within 5 minutes, so
  // re-queuing would double-message.
  const aeMidnightUtcIso = new Date(`${deliveryDateIso}T00:00:00+04:00`).toISOString()
  const notifiedRes = await sb
    .from('customer_notifications')
    .select('customer_id')
    .eq('kind', 'delivery_confirmed')
    .gte('scheduled_for', aeMidnightUtcIso)
    .in('customer_id', customerIds)
  if (notifiedRes.error) {
    throw new Error(`failsafe: dedup query failed: ${notifiedRes.error.message}`)
  }
  const alreadyNotifiedIds = new Set(
    (notifiedRes.data ?? []).map((r) => (r as { customer_id: string }).customer_id),
  )

  const customersRes = await sb
    .from('customers')
    .select('id, dorm_name')
    .in('id', customerIds)
  if (customersRes.error) {
    throw new Error(`failsafe: customers query failed: ${customersRes.error.message}`)
  }
  const dormByCustomer = new Map(
    ((customersRes.data ?? []) as Array<{ id: string; dorm_name: string | null }>).map(
      (c) => [c.id, c.dorm_name],
    ),
  )

  const nowIso = new Date().toISOString()
  const rows = customerIds
    .filter((id) => !alreadyNotifiedIds.has(id))
    .map((id) => {
      const dorm = dormByCustomer.get(id)
      return {
        customer_id: id,
        kind: 'delivery_confirmed',
        scheduled_for: nowIso,
        payload: { source: 'admin_failsafe', ...(dorm ? { dorm_name: dorm } : {}) },
      }
    })

  if (rows.length === 0) {
    return { queued: 0, alreadyNotified: alreadyNotifiedIds.size, skipped }
  }

  const { error: insertErr } = await sb.from('customer_notifications').insert(rows)
  if (insertErr) {
    throw new Error(`failsafe: insert failed (nothing queued): ${insertErr.message}`)
  }

  // One kick for the whole batch. Failure is fine — rows are durably queued
  // and the */5 min cron sweeps them.
  try {
    await sb.rpc('dispatch_customer_notifications_tick')
  } catch (err) {
    console.error('[delivery-failsafe] on-demand dispatch failed (cron will retry):', err)
  }

  return { queued: rows.length, alreadyNotified: alreadyNotifiedIds.size, skipped }
}

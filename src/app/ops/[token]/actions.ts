'use server'

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { validateOpsTokenById } from '@/contexts/ops/usecases/validate-token'
import { notifyAdmin, notifyRunUpdate } from '@/infra/admin-alerts/notify'
import { queueDeliveryConfirmedNotifications } from '@/contexts/ops/usecases/queue-delivery-confirmed-notifications'
import { captureError } from '@/infra/logging/capture-error'

// NOTE: pickup confirmation moved to /api/ops/confirm-pickup — the pickup
// photo is now the gate, and the per-dorm delivery_events upserts happen
// server-side in that route.

/**
 * Manual drop-off confirmation — used when Gemini cannot count (VER-11), or
 * when the photo budget is spent and nothing has been recorded yet.
 *
 * Sets delivered_at, which is what releases the customer WhatsApps. It does
 * NOT set verified: the counts were never checked, so the 8PM failsafe and
 * the admin Photos page still show this as unverified. A rider can always
 * record that the food arrived; they can never mark it as counted, and they
 * can never clear an escalation flag.
 */
export async function confirmDropoff(
  dormName: string,
  riderCount: number,
  opsTokenId: string,
  deliveryDateIso: string,
): Promise<{ ok: boolean; error?: string }> {
  // Auth — Server Actions are directly POST-invokable, so re-validate the
  // rider token here (the page's token gate does NOT protect this action).
  const token = await validateOpsTokenById(opsTokenId, 'rider')
  if (!token) return { ok: false, error: 'Invalid or revoked ops token' }

  const sb = createAdminSupabaseClient()

  // Read first so the fanout can be deduped on delivered_at — a rider who
  // taps Confirm twice must not send every student two WhatsApps.
  const { data: before } = await sb
    .from('delivery_events')
    .select('verified, delivered_at')
    .eq('delivery_date', deliveryDateIso)
    .eq('dorm_name', dormName)
    .eq('trip_number', 1)
    .maybeSingle()

  if (before?.verified) return { ok: true }  // idempotent no-op, skip the owner ping
  const alreadyDelivered = before?.delivered_at != null

  const nowIso = new Date().toISOString()

  // Only touch UNVERIFIED rows. A dorm that already passed the photo check
  // must not be downgraded by a manual re-confirm (happens after a PWA
  // reload if the rider re-taps a dorm they already delivered) — that would
  // erase the count of record and fire the 8PM failsafe for nothing.
  const { data, error } = await sb
    .from('delivery_events')
    .update({
      rider_count: riderCount,
      confirmed_at: nowIso,
      // Never restamp: keep the first moment the food was recorded as arrived.
      ...(alreadyDelivered ? {} : { delivered_at: nowIso }),
    })
    .eq('delivery_date', deliveryDateIso)
    .eq('dorm_name', dormName)
    .eq('trip_number', 1)
    .eq('verified', false)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    // Zero rows means pickup never created the row — a real error the rider
    // must see (the already-verified case was handled above).
    return { ok: false, error: 'No delivery event found for this dorm today' }
  }

  // ── Customer fanout — the manual path used to end here, which left a whole
  //    dorm waiting in silence whenever the counter was down. ───────────────
  if (!alreadyDelivered) {
    const isSaturday = new Date(deliveryDateIso + 'T00:00:00Z').getUTCDay() === 6
    try {
      const result = await queueDeliveryConfirmedNotifications(dormName, deliveryDateIso, isSaturday)
      console.log(`[confirmDropoff] fanout: queued=${result.queued} skipped=${result.skipped} for ${dormName}`)
    } catch (err) {
      captureError(err, { area: 'ops', op: 'confirmDropoff.fanout', dorm: dormName })
      void notifyAdmin(
        `Delivery recorded for ${dormName} by hand but customer notifications failed to queue — customers were not told their food arrived. Please notify them manually.`,
        dormName.slice(0, 20),
      )
    }
  }

  // Owner run update — manual confirms surface nowhere else until the 8PM
  // failsafe; tell the owner now. Fire and forget.
  void notifyRunUpdate(
    `Delivered to ${dormName}`,
    `Rider confirmed ${riderCount} boxes by hand, the photo could not be checked`,
    'Worth a glance in Photos.',
  )

  return { ok: true }
}

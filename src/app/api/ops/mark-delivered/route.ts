// src/app/api/ops/mark-delivered/route.ts
// Owner one-tap delivery confirmation for iOS Shortcuts (PWA-01).
// Validates a rider token then calls updateDeliveryEvent with verified: true.
// The shortcut POSTs { dorm_name, token } from the owner's iPhone.

import { NextRequest, NextResponse } from 'next/server'
import { validateOpsToken } from '@/contexts/ops/usecases/validate-token'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { updateDeliveryEvent } from '@/contexts/ops/usecases/update-delivery-event'
import { queueDeliveryConfirmedNotifications } from '@/contexts/ops/usecases/queue-delivery-confirmed-notifications'
import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { deliveryDormNames } from '@/shared/dorm-registry'
import { notifyAdmin } from '@/infra/admin-alerts/notify'
import { captureError } from '@/infra/logging/capture-error'

export const dynamic = 'force-dynamic'

// Phase 8 (L7): give the per-dorm notification fanout headroom above the ~10s
// platform default so it isn't truncated mid-loop.
export const maxDuration = 26

export async function POST(req: NextRequest) {
  let body: { dorm_name?: string; token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { dorm_name, token } = body

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  const opsToken = await validateOpsToken(token, 'rider')
  if (!opsToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const locs = await getDormLocations()
  const validNames = deliveryDormNames(locs)

  if (!dorm_name || !validNames.includes(dorm_name)) {
    return NextResponse.json(
      {
        error: `Invalid dorm_name. Must be one of: ${validNames.join(', ')}`,
      },
      { status: 400 },
    )
  }

  // Compute today's date in UAE time (UTC+4) — never trust client-supplied date
  const AE_OFFSET_MS = 4 * 60 * 60 * 1000
  const aeNow = new Date(Date.now() + AE_OFFSET_MS)
  const deliveryDateIso = aeNow.toISOString().slice(0, 10)

  // Was this dorm already recorded as delivered? A flagged photo drop-off
  // already told its customers, so the owner's one-tap confirm afterwards
  // must verify the row without sending everyone a second WhatsApp.
  const sb = createAdminSupabaseClient()
  const { data: beforeRow } = await sb
    .from('delivery_events')
    .select('delivered_at')
    .eq('delivery_date', deliveryDateIso)
    .eq('dorm_name', dorm_name)
    .eq('trip_number', 1)
    .maybeSingle()
  const alreadyDelivered = beforeRow?.delivered_at != null

  const result = await updateDeliveryEvent({
    deliveryDateIso,
    dormName: dorm_name,
    tripNumber: 1,
    riderCount: 0, // owner confirms without count — not available via shortcut
    geminiCount: null,
    geminiConfidence: null,
    photoPath: null,
    verified: true,
    geoLat: null,
    geoLng: null,
    ...(alreadyDelivered ? {} : { deliveredAt: new Date().toISOString() }),
  })

  if (!result.ok) {
    // rowsAffected === 0 means no pickup was confirmed yet for this dorm today.
    // Return 200 anyway so the shortcut doesn't show an error on the owner's phone.
    // The failsafe cron at 8 PM covers unconfirmed deliveries.
    console.warn(`[mark-delivered] updateDeliveryEvent failed: ${result.error}`)
    return NextResponse.json(
      { ok: false, message: result.error ?? 'No matching delivery event found' },
      { status: 200 },
    )
  }

  // Fire-and-log: queue customer delivery notifications for this dorm
  // deliveryDateIso is already the AE calendar date — read its weekday in UTC
  // so a UTC server doesn't roll back to Friday (getDay() bug).
  const isSaturday =
    new Date(deliveryDateIso + 'T00:00:00Z').getUTCDay() === 6
  try {
    const fanout = alreadyDelivered
      ? { queued: 0, skipped: 0 }
      : await queueDeliveryConfirmedNotifications(
          dorm_name,
          deliveryDateIso,
          isSaturday,
        )
    console.log(
      `[mark-delivered] fanout: queued=${fanout.queued} skipped=${fanout.skipped} for ${dorm_name}${alreadyDelivered ? ' (already delivered)' : ''}`,
    )
  } catch (err) {
    // Release It! L5: delivery recorded, but the customer fanout failed — they
    // were not told their food arrived. Surface it so ops can act manually.
    captureError(err, { area: 'ops', op: 'mark-delivered.fanout', dorm: dorm_name })
    void notifyAdmin(
      `Delivery marked for ${dorm_name} but customer notifications failed to queue — please notify customers manually.`,
      dorm_name,
    )
  }

  return NextResponse.json({ ok: true, dorm: dorm_name, date: deliveryDateIso })
}

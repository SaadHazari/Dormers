// src/app/api/ops/mark-delivered/route.ts
// Owner one-tap delivery confirmation for iOS Shortcuts (PWA-01).
// Validates a rider token then calls updateDeliveryEvent with verified: true.
// The shortcut POSTs { dorm_name, token } from the owner's iPhone.

import { NextRequest, NextResponse } from 'next/server'
import { validateOpsToken } from '@/contexts/ops/usecases/validate-token'
import { updateDeliveryEvent } from '@/contexts/ops/usecases/update-delivery-event'
import { queueDeliveryConfirmedNotifications } from '@/contexts/ops/usecases/queue-delivery-confirmed-notifications'

export const dynamic = 'force-dynamic'

// Canonical dorm names — must match delivery_events.dorm_name exactly
const VALID_DORM_NAMES = [
  'The Myriad',
  'KSK Homes',
  'Yugo',
  'DSOA Residence',
  'Study World',
] as const

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

  // Validate rider token — kitchen tokens are not accepted here
  const opsToken = await validateOpsToken(token, 'rider')
  if (!opsToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (
    !dorm_name ||
    !VALID_DORM_NAMES.includes(dorm_name as (typeof VALID_DORM_NAMES)[number])
  ) {
    return NextResponse.json(
      {
        error: `Invalid dorm_name. Must be one of: ${VALID_DORM_NAMES.join(', ')}`,
      },
      { status: 400 },
    )
  }

  // Compute today's date in UAE time (UTC+4) — never trust client-supplied date
  const AE_OFFSET_MS = 4 * 60 * 60 * 1000
  const aeNow = new Date(Date.now() + AE_OFFSET_MS)
  const deliveryDateIso = aeNow.toISOString().slice(0, 10)

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
  const isSaturday =
    new Date(deliveryDateIso + 'T00:00:00+04:00').getDay() === 6
  try {
    const fanout = await queueDeliveryConfirmedNotifications(
      dorm_name,
      deliveryDateIso,
      isSaturday,
    )
    console.log(
      `[mark-delivered] fanout: queued=${fanout.queued} skipped=${fanout.skipped} for ${dorm_name}`,
    )
  } catch (err) {
    console.error(
      '[mark-delivered] queueDeliveryConfirmedNotifications failed (non-fatal):',
      err,
    )
  }

  return NextResponse.json({ ok: true, dorm: dorm_name, date: deliveryDateIso })
}

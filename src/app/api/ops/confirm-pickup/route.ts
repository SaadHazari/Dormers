// src/app/api/ops/confirm-pickup/route.ts
// Rider pickup confirmation — the photo that unlocks the rider's day.
//
// Design (locked with owner):
//   - The photo is the gate: no pickup photo, no dorm list. Compliance is
//     built into the flow, not hoped for.
//   - The AI count is ADVISORY. A stacked-boxes photo counts imprecisely, so
//     a discrepancy flags the owner but NEVER blocks the rider (prime
//     directive: verification must not strand the human).
//   - The count of record comes from the kitchen packing check; this photo's
//     job is acceptance evidence.
//
// Flow:
//   1. Parse multipart form (photo + opsToken + dateIso [+ geo])
//   2. Authenticate the ops token (rider role)
//   3. Upload photo to delivery-photos/{date}/_pickup/pickup.jpg
//   4. Upsert per-dorm delivery_events rows with expected counts (moved here
//      from the old client-side confirmPickup loop)
//   5. Gemini counts the photo; mismatch vs expected total → owner alert
//   6. Upsert ops_day_events (event_date, 'rider_pickup')

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { validateOpsTokenById } from '@/contexts/ops/usecases/validate-token'
import { getDormCounts } from '@/contexts/ops/usecases/get-dorm-counts'
import { verifyBoxCount } from '@/contexts/ops/domain/box-count-verify'
import { notifyAdmin } from '@/infra/admin-alerts/notify'
import { captureError } from '@/infra/logging/capture-error'

export const maxDuration = 60
export const runtime = 'nodejs'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function POST(req: Request) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 })
  }

  const photo = formData.get('photo')
  const opsToken = formData.get('opsToken') as string | null
  const dateIso = formData.get('dateIso') as string | null

  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: 'missing_photo' }, { status: 400 })
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  }
  if (!ALLOWED_MIME.has(photo.type)) {
    return NextResponse.json({ error: 'unsupported_mime' }, { status: 415 })
  }
  if (!opsToken || !dateIso) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  const token = await validateOpsTokenById(opsToken, 'rider')
  if (!token) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }

  const dateUtc = new Date(dateIso + 'T00:00:00Z')
  const dow = dateUtc.getUTCDay()
  const dayName = DAYS_OF_WEEK[dow === 0 ? 1 : dow]
  const isSaturday = dow === 6

  const dormCounts = await getDormCounts(dateIso, dayName, isSaturday)
  const expectedTotal = Object.entries(dormCounts)
    .filter(([name]) => name !== 'Other')
    .reduce((sum, [, n]) => sum + n, 0)

  // ── Photo upload (non-fatal — evidence lost, rider's day still starts) ───
  const bytes = new Uint8Array(await photo.arrayBuffer())
  const sb = createAdminSupabaseClient()
  const photoPath = `${dateIso}/_pickup/pickup.jpg`
  const { error: uploadErr } = await sb.storage
    .from('delivery-photos')
    .upload(photoPath, bytes, { contentType: photo.type, upsert: true })
  if (uploadErr) {
    console.error('[confirm-pickup] storage upload failed:', uploadErr.message)
  }

  // ── Per-dorm delivery_events upserts — THE critical write. If any fail,
  //    return an error so the rider retries; drop-off verification depends on
  //    these rows existing with expected_count.
  //    `verified` deliberately omitted: fresh rows default false; re-taps
  //    leave an already-verified dorm untouched (drop-off owns that flag). ──
  const dormsToConfirm = Object.entries(dormCounts).filter(
    ([name, n]) => name !== 'Other' && n > 0,
  )
  const confirmedAt = new Date().toISOString()
  const results = await Promise.all(
    dormsToConfirm.map(([dormName, expectedCount]) =>
      sb.from('delivery_events').upsert(
        {
          delivery_date: dateIso,
          dorm_name: dormName,
          trip_number: 1,
          expected_count: expectedCount,
          ops_token_id: opsToken,
          confirmed_at: confirmedAt,
        },
        { onConflict: 'delivery_date,dorm_name,trip_number' },
      ),
    ),
  )
  const failed = results.filter(r => r.error).length
  if (failed > 0) {
    captureError(results.find(r => r.error)?.error, {
      area: 'ops', op: 'confirm-pickup.delivery-events', dateIso, failed,
    })
    return NextResponse.json({ error: 'save_failed', failed }, { status: 500 })
  }

  // ── Gemini count — advisory only ─────────────────────────────────────────
  let geminiCount: number | null = null
  let geminiConfidence: string | null = null
  try {
    const gemini = await verifyBoxCount(bytes, photo.type, expectedTotal)
    geminiCount = gemini.count
    geminiConfidence = gemini.confidence
  } catch (err) {
    captureError(err, { area: 'ops', op: 'confirm-pickup.gemini', dateIso })
  }

  const flagged = geminiCount !== null && geminiCount !== expectedTotal

  // ── Kitchen comparison — what did the kitchen say it packed? ─────────────
  const { data: kitchenRow } = await sb
    .from('ops_day_events')
    .select('veg_count, nonveg_count')
    .eq('event_date', dateIso)
    .eq('event_type', 'kitchen_packing')
    .maybeSingle()
  const kitchenTotal =
    kitchenRow && kitchenRow.veg_count !== null && kitchenRow.nonveg_count !== null
      ? kitchenRow.veg_count + kitchenRow.nonveg_count
      : null

  const { error: upsertErr } = await sb.from('ops_day_events').upsert(
    {
      event_date: dateIso,
      event_type: 'rider_pickup',
      ops_token_id: opsToken,
      total_count: expectedTotal,
      gemini_count: geminiCount,
      gemini_confidence: geminiConfidence,
      photo_path: uploadErr ? null : photoPath,
      matched: !flagged,
      mismatch_details: flagged
        ? `AI counted ${geminiCount}, system expects ${expectedTotal}${kitchenTotal !== null ? `, kitchen packed ${kitchenTotal}` : ''}`
        : null,
      confirmed_at: confirmedAt,
    },
    { onConflict: 'event_date,event_type' },
  )
  if (upsertErr) {
    // Audit row lost but the day is confirmed — log loudly, don't block.
    captureError(upsertErr, { area: 'ops', op: 'confirm-pickup.upsert', dateIso })
  }

  if (flagged) {
    void notifyAdmin(
      `PICKUP COUNT FLAG — AI counted ${geminiCount} boxes, system expects ${expectedTotal}${kitchenTotal !== null ? `, kitchen packed ${kitchenTotal}` : ''}. Rider was NOT blocked. Check the Photos page. Date: ${dateIso}`,
      'Pickup',
    )
  }

  return NextResponse.json({
    ok: true,
    expectedTotal,
    geminiCount,
    flagged,
  })
}

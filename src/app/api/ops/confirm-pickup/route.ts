// src/app/api/ops/confirm-pickup/route.ts
// Rider pickup confirmation — the photo that unlocks the rider's day.
//
// Design (owner decision 2026-08-19, reversing the earlier advisory rule):
//   - The photo is the gate: no pickup photo, no dorm list.
//   - The AI count now BLOCKS. A photo that does not show the expected number
//     of boxes sends the rider back to shoot it again instead of waving him
//     through. The kitchen is not a doorstep: a missing box there is fixable
//     on the spot, so the check is worth stopping for.
//   - But the budget is bounded (MAX_PICKUP_ATTEMPTS). An AI that cannot count
//     a stack must never cancel a day of deliveries, so the last attempt ends
//     in the rider personally vouching for the count — recorded and alerted,
//     never silent.
//   - The count of record comes from the kitchen packing check; this photo's
//     job is acceptance evidence.
//
// Flow:
//   1. Parse multipart form (photo + opsToken + dateIso + riderAsserted)
//   2. Authenticate the ops token (rider role)
//   3. Read the attempt budget from ops_day_events (server-authoritative)
//   4. Upload photo to its own per-attempt key — nothing is overwritten
//   5. Gemini counts the photo; decidePickup() rules on it
//   6. Record the attempt; only an ACCEPTED one writes the per-dorm
//      delivery_events rows and opens the rider's day

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { validateOpsTokenById } from '@/contexts/ops/usecases/validate-token'
import { getDormCounts } from '@/contexts/ops/usecases/get-dorm-counts'
import { verifyBoxCount } from '@/contexts/ops/domain/box-count-verify'
import { loadBoxReferenceImages } from '@/infra/ops/box-reference'
import {
  decidePickup,
  pickupPhotoPath,
  MAX_PICKUP_ATTEMPTS,
} from '@/contexts/ops/domain/pickup-decision'
import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { deliveryDormNames } from '@/shared/dorm-registry'
import { notifyAdmin, notifyRunUpdate } from '@/infra/admin-alerts/notify'
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
  // Only meaningful once the photo budget is spent: the rider tapping
  // "all N boxes are in the van" is the single way past a disagreeing photo.
  const riderAsserted = formData.get('riderAsserted') === 'true'
  // What the rider counted himself. The strongest number in the whole check:
  // it is the only one produced by someone standing next to the boxes.
  const riderCount = parseInt((formData.get('riderCount') as string | null) ?? '', 10)

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
  if (isNaN(riderCount) || riderCount < 0) {
    return NextResponse.json({ error: 'invalid_rider_count' }, { status: 400 })
  }

  const token = await validateOpsTokenById(opsToken, 'rider')
  if (!token) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }

  const dateUtc = new Date(dateIso + 'T00:00:00Z')
  const dow = dateUtc.getUTCDay()
  const dayName = DAYS_OF_WEEK[dow === 0 ? 1 : dow]
  const isSaturday = dow === 6

  // Only dorms the rider actually drives to. This used to exclude the literal
  // name 'Other', which silently disagreed with the rider header's total — a
  // cosmetic bug while the count was advisory, a retake trap now that it gates.
  const locs = await getDormLocations()
  const deliverable = new Set(deliveryDormNames(locs))
  const dormCounts = await getDormCounts(dateIso, dayName, isSaturday)
  const expectedTotal = Object.entries(dormCounts)
    .filter(([name]) => deliverable.has(name))
    .reduce((sum, [, n]) => sum + n, 0)

  const sb = createAdminSupabaseClient()

  // ── Attempt budget, held server-side so a reload cannot refill it ────────
  const { data: priorRow } = await sb
    .from('ops_day_events')
    .select('attempts, photo_paths, accepted')
    .eq('event_date', dateIso)
    .eq('event_type', 'rider_pickup')
    .maybeSingle()

  if (priorRow?.accepted === true) {
    // Day already open. Idempotent: a re-tap must not reopen the camera loop.
    return NextResponse.json({
      ok: true, outcome: 'accepted', accepted: true, alreadyOpen: true,
      expectedTotal, attemptsLeft: 0,
    })
  }

  const priorAttempts = priorRow?.attempts ?? 0
  const priorPhotoPaths: string[] = priorRow?.photo_paths ?? []
  // ── The rider's own count is checked FIRST, before a photo is uploaded or
  //    an AI call is spent. A better photo cannot conjure a missing box, so
  //    more photos are the wrong remedy and no budget is consumed. He either
  //    fixes the number, or taps confirm-by-hand and the owner hears about a
  //    genuinely short van in one tap instead of three more pictures. ───────
  if (!riderAsserted && riderCount !== expectedTotal) {
    return NextResponse.json({
      ok: true,
      outcome: 'rider_disagrees',
      accepted: false,
      allowAssert: true,
      expectedTotal,
      riderCount,
      attemptsLeft: Math.max(0, MAX_PICKUP_ATTEMPTS - priorAttempts),
    })
  }

  const attempt = priorAttempts + 1

  // ── Photo upload — its own key per attempt, so every shot is kept ────────
  const bytes = new Uint8Array(await photo.arrayBuffer())
  const photoPath = pickupPhotoPath(dateIso, attempt)
  const { error: uploadErr } = await sb.storage
    .from('delivery-photos')
    .upload(photoPath, bytes, { contentType: photo.type, upsert: true })
  if (uploadErr) {
    console.error('[confirm-pickup] storage upload failed:', uploadErr.message)
  }
  const photoPaths = uploadErr ? priorPhotoPaths : [...priorPhotoPaths, photoPath]

  // ── Gemini count — now a gate, not a note in the margin ─────────────────
  let geminiCount: number | null = null
  let geminiConfidence: string | null = null
  try {
    // Blind: never hand the model the number we are hoping to see.
    const gemini = await verifyBoxCount(bytes, photo.type, loadBoxReferenceImages())
    geminiCount = gemini.count
    geminiConfidence = gemini.confidence
  } catch (err) {
    captureError(err, { area: 'ops', op: 'confirm-pickup.gemini', dateIso })
  }

  const decision = decidePickup({ expectedTotal, riderCount, geminiCount, attempt, riderAsserted })
  const flagged = !decision.matched
  const confirmedAt = new Date().toISOString()
  console.log(
    `[confirm-pickup] attempt ${attempt}/${MAX_PICKUP_ATTEMPTS}: expected=${expectedTotal} ai=${geminiCount} -> ${decision.outcome}`,
  )

  // ── Per-dorm delivery_events upserts — THE critical write, and ONLY once
  //    the day is actually open. A rejected attempt must not leave rows
  //    implying a run that never started.
  //    `verified` deliberately omitted: fresh rows default false; re-taps
  //    leave an already-verified dorm untouched (drop-off owns that flag). ──
  if (decision.accepted) {
    const dormsToConfirm = Object.entries(dormCounts).filter(
      ([name, n]) => deliverable.has(name) && n > 0,
    )
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
  }

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
      rider_count: riderCount,
      gemini_count: geminiCount,
      gemini_confidence: geminiConfidence,
      photo_path: uploadErr ? null : photoPath,
      photo_paths: photoPaths,
      attempts: attempt,
      accepted: decision.accepted,
      matched: decision.matched,
      mismatch_details: flagged
        ? `Rider counted ${riderCount}, AI counted ${geminiCount}, system expects ${expectedTotal}${kitchenTotal !== null ? `, kitchen packed ${kitchenTotal}` : ''}${riderAsserted ? ', rider vouched for the count' : ''}`
        : null,
      confirmed_at: confirmedAt,
    },
    { onConflict: 'event_date,event_type' },
  )
  if (upsertErr) {
    captureError(upsertErr, { area: 'ops', op: 'confirm-pickup.upsert', dateIso })
    // This row IS the gate now. If it did not save on an accepted attempt the
    // rider stays locked out, so say so instead of reporting a false start.
    if (decision.accepted) {
      return NextResponse.json(
        { error: 'save_failed', reason: 'Could not open the day. Tap Confirm to retry.' },
        { status: 500 },
      )
    }
  }

  // ── Owner messages ───────────────────────────────────────────────────────
  // A retake is a normal in-flow correction, not news. Only a day that opened,
  // or one stuck on the last attempt, is worth a message.
  const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
  const hhmm = `${String(ae.getUTCHours()).padStart(2, '0')}:${String(ae.getUTCMinutes()).padStart(2, '0')}`
  const kitchenNote = kitchenTotal !== null ? `, kitchen packed ${kitchenTotal}` : ''

  if (decision.accepted) {
    void notifyRunUpdate(
      'Rider picked up',
      `${expectedTotal} boxes left the kitchen at ${hhmm}`,
      riderAsserted
        ? `Rider counted ${riderCount} against ${expectedTotal} on the list${kitchenNote}. The photo read ${geminiCount ?? 'nothing'}. He confirmed the load by hand. Open Photos to compare.`
        : 'Rider and photo both agree with the list. Nothing to do.',
    )
  } else if (decision.alert) {
    // Budget spent and still no agreement. He is held at the kitchen until he
    // vouches for the count, so this needs to reach you now, not at 8PM.
    void notifyAdmin(
      `PICKUP HELD — the photo does not match after ${attempt} tries.\n` +
        `List: ${expectedTotal} | Rider counted: ${riderCount} | Photo: ${geminiCount ?? 'unreadable'}${kitchenNote}\n` +
        `He is at the kitchen and cannot start until he confirms the load by hand.`,
      'pickup',
    )
  }

  return NextResponse.json({
    ok: true,
    outcome: decision.outcome,
    accepted: decision.accepted,
    attempt,
    attemptsLeft: decision.attemptsLeft,
    maxAttempts: MAX_PICKUP_ATTEMPTS,
    expectedTotal,
    riderCount,
    geminiCount,
    allowAssert: decision.allowAssert,
    flagged,
  })
}

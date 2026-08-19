// src/app/api/ops/confirm-packing/route.ts
// Kitchen packing confirmation — first link in the chain of custody.
//
// Flow:
//   1. Parse multipart form (photo + opsToken + dateIso + vegCount + nonvegCount + dormCounts JSON)
//   2. Authenticate the ops token (kitchen role)
//   3. Upload photo to delivery-photos/{date}/_kitchen/packing.jpg
//   4. Recompute expected counts server-side (never trust client numbers)
//   5. Gemini counts the photo (advisory only — never blocks the kitchen)
//   6. Tally entered vs expected; mismatches notify the owner but still save
//   7. Upsert ops_day_events (event_date, 'kitchen_packing')

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { validateOpsTokenById } from '@/contexts/ops/usecases/validate-token'
import { getKitchenCounts } from '@/contexts/ops/usecases/get-kitchen-counts'
import { getDormCounts } from '@/contexts/ops/usecases/get-dorm-counts'
import { verifyBoxCount } from '@/contexts/ops/domain/box-count-verify'
import { loadBoxReferenceImages } from '@/infra/ops/box-reference'
import { notifyRunUpdate } from '@/infra/admin-alerts/notify'
import { captureError } from '@/infra/logging/capture-error'

export const maxDuration = 60
export const runtime = 'nodejs'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface PackingMismatch {
  label: string
  entered: number
  expected: number
}

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
  const vegCount = parseInt((formData.get('vegCount') as string | null) ?? '', 10)
  const nonvegCount = parseInt((formData.get('nonvegCount') as string | null) ?? '', 10)
  const dormCountsRaw = formData.get('dormCounts') as string | null

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
  if (isNaN(vegCount) || vegCount < 0 || isNaN(nonvegCount) || nonvegCount < 0) {
    return NextResponse.json({ error: 'invalid_counts' }, { status: 400 })
  }

  let dormCounts: Record<string, number>
  try {
    dormCounts = JSON.parse(dormCountsRaw ?? '{}')
    if (typeof dormCounts !== 'object' || dormCounts === null || Array.isArray(dormCounts)) throw new Error()
  } catch {
    return NextResponse.json({ error: 'invalid_dorm_counts' }, { status: 400 })
  }

  const token = await validateOpsTokenById(opsToken, 'kitchen')
  if (!token) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }

  // dateIso is the AE calendar date computed by the RSC — read its weekday in
  // UTC so a UTC server doesn't roll back a day.
  const dateUtc = new Date(dateIso + 'T00:00:00Z')
  const dow = dateUtc.getUTCDay()
  const dayName = DAYS_OF_WEEK[dow === 0 ? 1 : dow]
  const isSaturday = dow === 6

  // ── Expected counts, recomputed server-side ──────────────────────────────
  const [expected, expectedDorms] = await Promise.all([
    getKitchenCounts(dateIso, dayName, isSaturday),
    getDormCounts(dateIso, dayName, isSaturday),
  ])

  // ── Photo upload (non-fatal on failure — evidence lost, flow proceeds) ───
  const bytes = new Uint8Array(await photo.arrayBuffer())
  const sb = createAdminSupabaseClient()
  const photoPath = `${dateIso}/_kitchen/packing.jpg`
  const { error: uploadErr } = await sb.storage
    .from('delivery-photos')
    .upload(photoPath, bytes, { contentType: photo.type, upsert: true })
  if (uploadErr) {
    console.error('[confirm-packing] storage upload failed:', uploadErr.message)
  }

  // ── Gemini count — advisory only, never blocks the kitchen ───────────────
  let geminiCount: number | null = null
  let geminiConfidence: string | null = null
  try {
    // Blind, like the rest of this check. Feeding the model expectedTotal
    // made its agreement meaningless — it was being told the answer.
    const gemini = await verifyBoxCount(bytes, photo.type, loadBoxReferenceImages())
    geminiCount = gemini.count
    geminiConfidence = gemini.confidence
  } catch (err) {
    captureError(err, { area: 'ops', op: 'confirm-packing.gemini', dateIso })
  }

  // ── Tally entered vs expected ────────────────────────────────────────────
  const mismatches: PackingMismatch[] = []
  if (!expected.unavailable) {
    if (vegCount !== expected.vegCount) {
      mismatches.push({ label: 'Veg', entered: vegCount, expected: expected.vegCount })
    }
    if (nonvegCount !== expected.nonVegCount) {
      mismatches.push({ label: 'Non-veg', entered: nonvegCount, expected: expected.nonVegCount })
    }
    const dormNames = new Set([...Object.keys(expectedDorms), ...Object.keys(dormCounts)])
    for (const name of dormNames) {
      if (name === 'Other') continue
      const enteredN = Number(dormCounts[name] ?? 0)
      const expectedN = expectedDorms[name] ?? 0
      if (enteredN !== expectedN) {
        mismatches.push({ label: name, entered: enteredN, expected: expectedN })
      }
    }
  }
  const matched = !expected.unavailable && mismatches.length === 0
  const mismatchDetails = mismatches.length
    ? mismatches.map(m => `${m.label}: kitchen ${m.entered}, system ${m.expected}`).join(' | ')
    : null

  // ── Persist (upsert — kitchen can redo the check, latest wins) ───────────
  const { error: upsertErr } = await sb.from('ops_day_events').upsert(
    {
      event_date: dateIso,
      event_type: 'kitchen_packing',
      ops_token_id: opsToken,
      veg_count: vegCount,
      nonveg_count: nonvegCount,
      expected_veg_count: expected.unavailable ? null : expected.vegCount,
      expected_nonveg_count: expected.unavailable ? null : expected.nonVegCount,
      dorm_counts: dormCounts,
      expected_dorm_counts: expectedDorms,
      gemini_count: geminiCount,
      gemini_confidence: geminiConfidence,
      photo_path: uploadErr ? null : photoPath,
      matched,
      mismatch_details: mismatchDetails,
      confirmed_at: new Date().toISOString(),
    },
    { onConflict: 'event_date,event_type' },
  )
  if (upsertErr) {
    captureError(upsertErr, { area: 'ops', op: 'confirm-packing.upsert', dateIso })
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }

  // ── Owner run update — one message per event, fire and forget ────────────
  if (expected.unavailable) {
    void notifyRunUpdate(
      'Kitchen packed',
      `Kitchen counted ${vegCount} veg and ${nonvegCount} non-veg boxes, photo on file`,
      'Could not check the counts, system totals were unavailable. Open Photos to review.',
    )
  } else if (matched) {
    void notifyRunUpdate(
      'Kitchen packed',
      `${vegCount} veg and ${nonvegCount} non-veg boxes are packed, photo on file`,
      'All counts match. Nothing to do.',
    )
  } else {
    const worst = mismatches
      .slice(0, 3)
      .map(m => `${m.label}: kitchen ${m.entered}, system ${m.expected}`)
      .join(', ')
    void notifyRunUpdate(
      'Kitchen packed',
      `${worst}${mismatches.length > 3 ? ` and ${mismatches.length - 3} more` : ''}`,
      'Counts do not match. Open Photos to see where.',
    )
  }

  return NextResponse.json({
    ok: true,
    matched,
    mismatches,
    geminiCount,
    countsUnavailable: expected.unavailable,
  })
}

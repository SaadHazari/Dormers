// src/app/api/ops/verify-box-count/route.ts
// Phase 5 — Delivery drop-off verification endpoint.
//
// Flow:
//   1. Parse multipart form data (photo + dormName + riderCount + opsToken + deliveryDateIso + geo + retakeCount)
//   2. Validate inputs + authenticate the ops token (rider role)
//   3. Upload photo to delivery-photos/{date}/{dorm-slug}/trip-1.jpg
//   4. Look up expected_count from the existing delivery_events row
//   5. Call Gemini Vision to count boxes in the photo
//   6. Decision logic:
//      A. Photo unclear → retake (first time) or escalate (second time)
//      B. Gemini null count → needsManualConfirm
//      C. Triple match (expected === rider === gemini) → verified: true
//      D. Mismatch → escalate owner via notifyAdmin
//   7. UPDATE delivery_events row with all results

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { verifyBoxCount } from '@/contexts/ops/domain/box-count-verify'
import { updateDeliveryEvent } from '@/contexts/ops/usecases/update-delivery-event'
import { notifyAdmin } from '@/infra/admin-alerts/notify'
import { captureError } from '@/infra/logging/capture-error'
import { queueDeliveryConfirmedNotifications } from '@/contexts/ops/usecases/queue-delivery-confirmed-notifications'

// Netlify default function timeout is 10s; Gemini Vision on a photo
// typically takes 5-15s. Without this export the function gets killed
// mid-call and the client sees an infinite spinner. 60s leaves comfortable
// headroom under the SDK's 45s timeout.
export const maxDuration = 60
export const runtime = 'nodejs'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024  // 5 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const SIGNED_URL_TTL_S = 7 * 24 * 60 * 60  // 7 days

export async function POST(req: Request) {
  const t0 = Date.now()
  const log = (msg: string) => console.log(`[verify-box-count ${Date.now() - t0}ms] ${msg}`)

  // ── 1. Parse multipart form data ──────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 })
  }

  const photo = formData.get('photo')
  const dormName = formData.get('dormName') as string | null
  const riderCountRaw = formData.get('riderCount') as string | null
  const opsToken = formData.get('opsToken') as string | null
  const deliveryDateIso = formData.get('deliveryDateIso') as string | null
  const geoLatRaw = formData.get('geoLat') as string | null
  const geoLngRaw = formData.get('geoLng') as string | null
  const retakeCountRaw = formData.get('retakeCount') as string | null

  const riderCount = parseInt(riderCountRaw ?? '', 10)

  // ── 2. Validate inputs ───────────────────────────────────────────────
  if (!(photo instanceof File)) {
    return NextResponse.json({ error: 'missing_photo' }, { status: 400 })
  }
  if (photo.size === 0) {
    return NextResponse.json({ error: 'empty_file' }, { status: 400 })
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  }
  if (!ALLOWED_MIME.has(photo.type)) {
    return NextResponse.json({ error: 'unsupported_mime' }, { status: 415 })
  }
  if (!dormName) {
    return NextResponse.json({ error: 'missing_dorm_name' }, { status: 400 })
  }
  if (isNaN(riderCount) || riderCount <= 0) {
    return NextResponse.json({ error: 'invalid_rider_count' }, { status: 400 })
  }
  if (!opsToken) {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 })
  }
  if (!deliveryDateIso) {
    return NextResponse.json({ error: 'missing_date' }, { status: 400 })
  }

  // ── 3. Auth — validate ops token by ID ───────────────────────────────
  // The client receives opsToken.id (UUID) from the RSC, not the secret
  // token string. Look up by primary key instead of by secret.
  const sb0 = createAdminSupabaseClient()
  const { data: tokenRecord, error: tokenErr } = await sb0
    .from('ops_tokens')
    .select('id, token, role, is_active, revoked_at')
    .eq('id', opsToken)
    .single()

  if (tokenErr || !tokenRecord || !tokenRecord.is_active || tokenRecord.revoked_at || tokenRecord.role !== 'rider') {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  log(`auth ok token=${tokenRecord.id}`)

  // ── 4. Read photo bytes ──────────────────────────────────────────────
  const bytes = new Uint8Array(await photo.arrayBuffer())

  // ── 5. Upload photo to delivery-photos storage ───────────────────────
  const dormSlug = dormName.toLowerCase().replace(/\s+/g, '-')
  const storagePath = `${deliveryDateIso}/${dormSlug}/trip-1.jpg`
  const sb = createAdminSupabaseClient()

  const { error: uploadErr } = await sb.storage
    .from('delivery-photos')
    .upload(storagePath, bytes, { contentType: photo.type, upsert: true })

  if (uploadErr) {
    // Non-fatal: continue to Gemini. Audit trail loses photo but delivery proceeds.
    console.error('[verify-box-count] storage upload failed:', uploadErr.message)
  } else {
    log('storage upload ok path=' + storagePath)
  }

  // ── 6. Look up expected_count from existing delivery_events row ──────
  const { data: existingRow } = await sb
    .from('delivery_events')
    .select('expected_count')
    .eq('delivery_date', deliveryDateIso)
    .eq('dorm_name', dormName)
    .eq('trip_number', 1)
    .maybeSingle()

  const expectedCount = existingRow?.expected_count ?? 0

  if (!existingRow) {
    console.warn('[verify-box-count] No delivery_events row found — rider verifying without prior pickup confirm')
  }

  // ── 7. Call Gemini box count ─────────────────────────────────────────
  log('starting Gemini verification...')
  const geminiResult = await verifyBoxCount(bytes, photo.type, expectedCount)
  log(`Gemini result: count=${geminiResult.count} confidence=${geminiResult.confidence} quality=${geminiResult.imageQuality}`)

  // ── 8. Decision logic ────────────────────────────────────────────────
  const retakeNum = parseInt(retakeCountRaw ?? '0', 10) || 0

  // Case A — Photo unclear (VER-09 / VER-10)
  if (geminiResult.imageQuality === 'unclear' || (geminiResult.confidence === 'low' && geminiResult.count === null)) {
    if (retakeNum >= 2) {
      // Second unclear photo → escalate (VER-10)
      const signedUrl = await generateSignedUrl(sb, storagePath)
      void notifyAdmin(
        `UNCLEAR PHOTO x2 — ${dormName}\nExpected: ${expectedCount} | Rider: ${riderCount}\nPhoto: ${signedUrl ?? storagePath}\nDate: ${deliveryDateIso}`,
        dormName.slice(0, 20),
      )
      await updateDeliveryEvent({
        deliveryDateIso, dormName, tripNumber: 1, riderCount,
        geminiCount: null, geminiConfidence: geminiResult.confidence,
        photoPath: storagePath, verified: false,
        geoLat: parseGeo(geoLatRaw), geoLng: parseGeo(geoLngRaw),
      })
      return NextResponse.json({
        verified: false,
        needsRetake: false,
        escalated: true,
        reason: 'Photo unclear twice — owner notified',
      })
    }
    // First unclear → retake prompt (VER-09)
    return NextResponse.json({
      verified: false,
      needsRetake: true,
      escalated: false,
      reason: geminiResult.reason,
    })
  }

  // Case B — Gemini timeout / null count (VER-11)
  if (geminiResult.count === null) {
    await updateDeliveryEvent({
      deliveryDateIso, dormName, tripNumber: 1, riderCount,
      geminiCount: null, geminiConfidence: geminiResult.confidence,
      photoPath: storagePath, verified: false,
      geoLat: parseGeo(geoLatRaw), geoLng: parseGeo(geoLngRaw),
    })
    return NextResponse.json({
      verified: false,
      needsRetake: false,
      needsManualConfirm: true,
      reason: 'Could not count boxes — please confirm manually',
    })
  }

  // Case C — Triple match (VER-07)
  const isMatch = expectedCount === riderCount && riderCount === geminiResult.count
  if (isMatch) {
    // ── Dedup guard: skip fanout if already verified (Pitfall 1) ──────
    const { data: preCheck } = await sb
      .from('delivery_events')
      .select('verified')
      .eq('delivery_date', deliveryDateIso)
      .eq('dorm_name', dormName)
      .eq('trip_number', 1)
      .maybeSingle()

    const alreadyVerified = preCheck?.verified === true

    await updateDeliveryEvent({
      deliveryDateIso, dormName, tripNumber: 1, riderCount,
      geminiCount: geminiResult.count, geminiConfidence: geminiResult.confidence,
      photoPath: storagePath, verified: true,
      geoLat: parseGeo(geoLatRaw), geoLng: parseGeo(geoLngRaw),
    })

    // Fire-and-log: queue customer notifications for this dorm (NOT-01)
    if (!alreadyVerified) {
      // deliveryDateIso is already the AE calendar date — read its weekday in
      // UTC so a UTC server doesn't roll back to Friday (getDay() bug).
      const isSaturday = new Date(deliveryDateIso + 'T00:00:00Z').getUTCDay() === 6
      try {
        const result = await queueDeliveryConfirmedNotifications(dormName, deliveryDateIso, isSaturday)
        log(`fanout: queued=${result.queued} skipped=${result.skipped} for ${dormName}`)
      } catch (err) {
        // Release It! L5: the delivery is already committed as VERIFIED, so the
        // 8PM failsafe will NOT flag it — yet customers were never told their
        // food arrived. Surface it loudly so ops can notify them manually.
        captureError(err, { area: 'ops', op: 'verify-box-count.fanout', dorm: dormName })
        void notifyAdmin(
          `Delivery VERIFIED for ${dormName} but customer notifications failed to queue — customers were not told their food arrived. Please notify them manually.`,
          dormName,
        )
      }
    } else {
      log(`fanout: skipped (already verified) for ${dormName}`)
    }

    return NextResponse.json({
      verified: true,
      needsRetake: false,
      escalated: false,
      geminiCount: geminiResult.count,
      reason: geminiResult.reason,
    })
  }

  // Case D — Count mismatch (VER-08)
  const signedUrl = await generateSignedUrl(sb, storagePath)
  void notifyAdmin(
    `DELIVERY MISMATCH — ${dormName}\nExpected: ${expectedCount} | Rider: ${riderCount} | Gemini: ${geminiResult.count}\nConfidence: ${geminiResult.confidence}\nPhoto: ${signedUrl ?? storagePath}\nDate: ${deliveryDateIso}`,
    dormName.slice(0, 20),
  )
  await updateDeliveryEvent({
    deliveryDateIso, dormName, tripNumber: 1, riderCount,
    geminiCount: geminiResult.count, geminiConfidence: geminiResult.confidence,
    photoPath: storagePath, verified: false,
    geoLat: parseGeo(geoLatRaw), geoLng: parseGeo(geoLngRaw),
  })
  return NextResponse.json({
    verified: false,
    needsRetake: false,
    escalated: true,
    geminiCount: geminiResult.count,
    reason: `Mismatch: expected ${expectedCount}, rider ${riderCount}, Gemini ${geminiResult.count}`,
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────

function parseGeo(val: string | null): number | null {
  if (!val) return null
  const n = parseFloat(val)
  return Number.isFinite(n) ? n : null
}

async function generateSignedUrl(
  sb: ReturnType<typeof createAdminSupabaseClient>,
  path: string,
): Promise<string | null> {
  try {
    const { data } = await sb.storage
      .from('delivery-photos')
      .createSignedUrl(path, SIGNED_URL_TTL_S)
    return data?.signedUrl ?? null
  } catch {
    return null
  }
}

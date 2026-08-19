// src/app/api/ops/verify-box-count/route.ts
// Phase 5 — Delivery drop-off verification endpoint.
//
// Two facts come out of this route and they are NOT the same fact:
//   delivered_at — the food is at the dorm. Releases the customer WhatsApps.
//   verified     — expected, rider and AI counts all agree. Audit only.
// A disputed count flags the owner. It no longer silences the whole dorm,
// and it no longer strands the rider: they get a second photo to settle it
// (see contexts/ops/domain/dropoff-decision.ts for the full rationale).
//
// Flow:
//   1. Parse multipart form data (photo + dormName + riderCount + opsToken + deliveryDateIso + geo)
//   2. Validate inputs + authenticate the ops token (rider role)
//   3. Read the delivery_events row — preflight before spending an upload or a Gemini call
//   4. Upload this attempt's photo to its own key (nothing is ever overwritten)
//   5. Call Gemini Vision to count boxes
//   6. decideDropoff() — pure domain decision
//   7. Persist, then fan out: customers on first delivery, owner on any flag

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { verifyBoxCount } from '@/contexts/ops/domain/box-count-verify'
import {
  decideDropoff,
  preflightDropoff,
  attemptPhotoPath,
  MAX_VERIFY_ATTEMPTS,
} from '@/contexts/ops/domain/dropoff-decision'
import { updateDeliveryEvent } from '@/contexts/ops/usecases/update-delivery-event'
import { notifyAdmin, notifyRunUpdate } from '@/infra/admin-alerts/notify'
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
  const sb = createAdminSupabaseClient()
  const { data: tokenRecord, error: tokenErr } = await sb
    .from('ops_tokens')
    .select('id, token, role, is_active, revoked_at')
    .eq('id', opsToken)
    .single()

  if (tokenErr || !tokenRecord || !tokenRecord.is_active || tokenRecord.revoked_at || tokenRecord.role !== 'rider') {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  log(`auth ok token=${tokenRecord.id}`)

  // ── 4. Read the existing row and preflight ───────────────────────────
  // Done before the upload and the Gemini call so a locked or already-done
  // dorm costs nothing. verify_attempts lives on the server precisely so a
  // PWA reload cannot hand the rider a fresh budget.
  const { data: existingRow } = await sb
    .from('delivery_events')
    .select('expected_count, verify_attempts, photo_paths, delivered_at, escalated_at, verified')
    .eq('delivery_date', deliveryDateIso)
    .eq('dorm_name', dormName)
    .eq('trip_number', 1)
    .maybeSingle()

  if (!existingRow) {
    // The row is created by pickup confirmation, and every write here is an
    // UPDATE. Without it there is nowhere to record the drop-off, so say so
    // plainly instead of silently discarding the rider's photo.
    console.warn(`[verify-box-count] no delivery_events row for ${dormName} on ${deliveryDateIso}`)
    void notifyAdmin(
      `Rider tried to deliver to ${dormName} but no pickup was confirmed for ${deliveryDateIso}, so nothing could be recorded.`,
      dormName.slice(0, 20),
    )
    return NextResponse.json({
      outcome: 'no_pickup',
      verified: false,
      needsRetake: false,
      escalated: false,
      reason: 'No pickup confirmed today. Take the pickup photo at the kitchen first.',
    })
  }

  const priorAttempts = existingRow.verify_attempts ?? 0
  const priorPhotoPaths: string[] = existingRow.photo_paths ?? []
  const expectedCount = existingRow.expected_count ?? 0
  const alreadyDelivered = existingRow.delivered_at !== null
  const wasEscalated = existingRow.escalated_at !== null

  const gate = preflightDropoff({
    verified: existingRow.verified === true,
    verifyAttempts: priorAttempts,
  })

  if (gate === 'already_verified') {
    return NextResponse.json({
      outcome: 'already_verified',
      verified: true,
      needsRetake: false,
      escalated: false,
      attemptsLeft: 0,
      reason: 'This dorm is already verified.',
    })
  }

  if (gate === 'locked') {
    // Budget spent. The owner owns this drop-off now — but if nothing has been
    // recorded as delivered yet, the rider still gets a way to say the food
    // arrived. They can close their own loop; they can never clear the flag.
    return NextResponse.json({
      outcome: 'locked',
      verified: false,
      needsRetake: false,
      needsManualConfirm: !alreadyDelivered,
      escalated: wasEscalated,
      attemptsLeft: 0,
      reason: alreadyDelivered
        ? `Both photos used. The owner has this one — nothing more to do here.`
        : `Both photos used. Tap Confirm Delivery to record the drop-off.`,
    })
  }

  const attempt = priorAttempts + 1
  log(`attempt ${attempt} of ${MAX_VERIFY_ATTEMPTS} for ${dormName}`)

  // ── 5. Read photo bytes and upload to this attempt's own key ─────────
  const bytes = new Uint8Array(await photo.arrayBuffer())
  const dormSlug = dormName.toLowerCase().replace(/\s+/g, '-')
  const storagePath = attemptPhotoPath(deliveryDateIso, dormSlug, 1, attempt)

  const { error: uploadErr } = await sb.storage
    .from('delivery-photos')
    .upload(storagePath, bytes, { contentType: photo.type, upsert: true })

  if (uploadErr) {
    // Non-fatal: continue to Gemini. Audit trail loses photo but delivery proceeds.
    console.error('[verify-box-count] storage upload failed:', uploadErr.message)
  } else {
    log('storage upload ok path=' + storagePath)
  }

  const photoPaths = uploadErr ? priorPhotoPaths : [...priorPhotoPaths, storagePath]

  // ── 6. Call Gemini box count ─────────────────────────────────────────
  log('starting Gemini verification...')
  const geminiResult = await verifyBoxCount(bytes, photo.type, expectedCount)
  log(`Gemini result: count=${geminiResult.count} confidence=${geminiResult.confidence} quality=${geminiResult.imageQuality}`)

  // ── 7. Decide (pure domain) ──────────────────────────────────────────
  const decision = decideDropoff({
    expectedCount,
    riderCount,
    geminiCount: geminiResult.count,
    imageQuality: geminiResult.imageQuality,
    confidence: geminiResult.confidence,
    attempt,
  })
  log(`decision: ${decision.outcome} (verified=${decision.verified} delivered=${decision.delivered} escalate=${decision.escalate})`)

  // ── 8. Persist ───────────────────────────────────────────────────────
  const nowIso = new Date().toISOString()
  const writeResult = await updateDeliveryEvent({
    deliveryDateIso,
    dormName,
    tripNumber: 1,
    riderCount,
    geminiCount: geminiResult.count,
    geminiConfidence: geminiResult.confidence,
    photoPath: uploadErr ? null : storagePath,
    verified: decision.verified,
    geoLat: parseGeo(geoLatRaw),
    geoLng: parseGeo(geoLngRaw),
    photoPaths,
    verifyAttempts: attempt,
    // One-way stamps: set once, never cleared by a later attempt.
    ...(decision.delivered && !alreadyDelivered ? { deliveredAt: nowIso } : {}),
    ...(decision.escalate && !wasEscalated ? { escalatedAt: nowIso } : {}),
  })

  if (!writeResult.ok) {
    // The rider's evidence is in storage but the record did not move. Never
    // report success off a failed write — the 8PM failsafe would stay quiet
    // on a "verified" dorm that was never actually marked.
    captureError(new Error(writeResult.error ?? 'delivery_events update failed'), {
      area: 'ops', op: 'verify-box-count.write', dorm: dormName,
    })
    void notifyAdmin(
      `Could not save the drop-off for ${dormName} on ${deliveryDateIso}. Photo is in Photos but the record did not update.`,
      dormName.slice(0, 20),
    )
    return NextResponse.json({
      outcome: 'write_failed',
      verified: false,
      needsRetake: false,
      escalated: false,
      attemptsLeft: decision.attemptsLeft,
      reason: 'Could not save. Try once more, then tell the owner.',
    }, { status: 500 })
  }

  // ── 9. Customer fanout — on the DELIVERED fact, not the verified one ──
  // This is the whole point of the split: a dorm full of students who got
  // their food must be told so, even when the three counts disagree.
  if (decision.delivered && !alreadyDelivered) {
    // deliveryDateIso is already the AE calendar date — read its weekday in
    // UTC so a UTC server doesn't roll back to Friday (getDay() bug).
    const isSaturday = new Date(deliveryDateIso + 'T00:00:00Z').getUTCDay() === 6
    try {
      const result = await queueDeliveryConfirmedNotifications(dormName, deliveryDateIso, isSaturday)
      log(`fanout: queued=${result.queued} skipped=${result.skipped} for ${dormName}`)
    } catch (err) {
      // Release It! L5: the drop-off is already committed as delivered, so the
      // 8PM failsafe will NOT flag it — yet customers were never told their
      // food arrived. Surface it loudly so ops can notify them manually.
      captureError(err, { area: 'ops', op: 'verify-box-count.fanout', dorm: dormName })
      void notifyAdmin(
        `Delivery recorded for ${dormName} but customer notifications failed to queue — customers were not told their food arrived. Please notify them manually.`,
        dormName,
      )
    }
  }

  // ── 10. Owner alerts ─────────────────────────────────────────────────
  const signedUrl = uploadErr ? null : await generateSignedUrl(sb, storagePath)

  if (decision.escalate) {
    void notifyAdmin(buildEscalationMessage({
      outcome: decision.outcome,
      dormName,
      expectedCount,
      riderCount,
      geminiCount: geminiResult.count,
      confidence: geminiResult.confidence,
      attempt,
      attemptsLeft: decision.attemptsLeft,
      deliveredNow: decision.delivered && !alreadyDelivered,
      photoUrl: signedUrl ?? storagePath,
      deliveryDateIso,
    }), dormName.slice(0, 20))
  }

  // A dorm that was flagged and then came good on the second photo: close the
  // loop explicitly, otherwise the owner is left holding an alert that quietly
  // stopped being true.
  if (decision.verified && wasEscalated) {
    void notifyAdmin(
      `MISMATCH RESOLVED — ${dormName}\nSecond photo agrees: ${geminiResult.count} boxes.\nDate: ${deliveryDateIso}`,
      dormName.slice(0, 20),
    )
  }

  // Owner run update with route progress — fire and forget, only on the
  // transition into verified so a re-verified dorm never double-pings.
  if (decision.verified) {
    void (async () => {
      try {
        const { data: dayRows } = await sb
          .from('delivery_events')
          .select('verified')
          .eq('delivery_date', deliveryDateIso)
          .eq('trip_number', 1)
          .gt('expected_count', 0)
        const totalDorms = dayRows?.length ?? 0
        const doneDorms = dayRows?.filter(r => r.verified).length ?? 0
        const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
        const hhmm = `${String(ae.getUTCHours()).padStart(2, '0')}:${String(ae.getUTCMinutes()).padStart(2, '0')}`
        await notifyRunUpdate(
          `Delivered to ${dormName}`,
          `${riderCount} boxes verified by photo at ${hhmm}. ${doneDorms} of ${totalDorms} dorms done`,
          'Nothing to do.',
        )
      } catch (err) {
        captureError(err, { area: 'ops', op: 'verify-box-count.run-update', dorm: dormName })
      }
    })()
  }

  // ── 11. Respond ──────────────────────────────────────────────────────
  return NextResponse.json({
    outcome: decision.outcome,
    verified: decision.verified,
    delivered: decision.delivered || alreadyDelivered,
    needsRetake: decision.allowRetake,
    needsManualConfirm: decision.outcome === 'manual',
    escalated: decision.escalate,
    attempt,
    attemptsLeft: decision.attemptsLeft,
    expectedCount,
    riderCount,
    geminiCount: geminiResult.count,
    reason: buildRiderReason(decision.outcome, {
      expectedCount, riderCount, geminiCount: geminiResult.count,
      attemptsLeft: decision.attemptsLeft, geminiReason: geminiResult.reason,
    }),
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────

function parseGeo(val: string | null): number | null {
  if (!val) return null
  const n = parseFloat(val)
  return Number.isFinite(n) ? n : null
}

/** What the rider reads on their phone. Plain, short, always says what to do next. */
function buildRiderReason(
  outcome: string,
  ctx: {
    expectedCount: number
    riderCount: number
    geminiCount: number | null
    attemptsLeft: number
    geminiReason: string
  },
): string {
  switch (outcome) {
    case 'verified':
      return ctx.geminiReason
    case 'retake':
      return `${ctx.geminiReason} Take one more, closer and with the boxes spread out.`
    case 'unclear_final':
      return 'The photo still could not be read. The owner has been told and the delivery is recorded.'
    case 'mismatch_retake':
      return `You counted ${ctx.riderCount}, the photo shows ${ctx.geminiCount}, the list says ${ctx.expectedCount}. The owner has been told. Take one more photo from a different angle.`
    case 'mismatch_final':
      return `Still ${ctx.riderCount} from you and ${ctx.geminiCount} from the photo against ${ctx.expectedCount} on the list. The owner has it from here. The delivery is recorded.`
    case 'manual':
      return 'The photo could not be counted right now. Confirm the delivery by hand.'
    default:
      return ''
  }
}

/** What lands on the owner's WhatsApp. Numbers first, then what happens next. */
function buildEscalationMessage(ctx: {
  outcome: string
  dormName: string
  expectedCount: number
  riderCount: number
  geminiCount: number | null
  confidence: string
  attempt: number
  attemptsLeft: number
  deliveredNow: boolean
  photoUrl: string
  deliveryDateIso: string
}): string {
  const head =
    ctx.outcome === 'unclear_final'
      ? `UNCLEAR PHOTO x${ctx.attempt} — ${ctx.dormName}`
      : ctx.outcome === 'mismatch_final'
        ? `DELIVERY MISMATCH, STILL OPEN — ${ctx.dormName}`
        : `DELIVERY MISMATCH — ${ctx.dormName}`

  const counts =
    ctx.outcome === 'unclear_final'
      ? `Expected: ${ctx.expectedCount} | Rider: ${ctx.riderCount}`
      : `Expected: ${ctx.expectedCount} | Rider: ${ctx.riderCount} | Photo: ${ctx.geminiCount}\nConfidence: ${ctx.confidence}`

  const next =
    ctx.attemptsLeft > 0
      ? `Rider has 1 more photo to settle it. You will get another message either way.`
      : `Photo budget used up. The rider cannot clear this, only you can.`

  const customers = ctx.deliveredNow
    ? `Customers at this dorm have been told their food arrived.`
    : `Customers at this dorm were already told earlier.`

  return `${head}\nAttempt ${ctx.attempt} of 2\n${counts}\n${next}\n${customers}\nPhoto: ${ctx.photoUrl}\nDate: ${ctx.deliveryDateIso}`
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

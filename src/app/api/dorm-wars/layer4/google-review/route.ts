// src/app/api/dorm-wars/layer4/google-review/route.ts
// Phase 8K — Google review screenshot upload + Gemini Vision verification.
//
// Replaces the Phase 8G self-attest endpoint. Flow:
//   1. POST multipart/form-data with `screenshot` file field.
//   2. We resolve the user's active subscription (Premium+ gate already
//      filters non-Monthly users from the hub UI, but we re-check here
//      defense-in-depth so a direct API call from a Weekly/Trial user
//      can't manufacture a layer4 row).
//   3. Insert layer4_rewards row (status='pending', period_key=sub.id).
//      The UNIQUE(customer_id, 'google_review', sub.id) gives us once-
//      per-subscription idempotency for free.
//   4. Upload the screenshot to the `review-screenshots` bucket under
//      `{customer_id}/{layer4_row_id}.{ext}` for audit / manual review.
//   5. Call Gemini Vision (verifyReviewScreenshot) on the bytes.
//   6. Decide: auto_approve / auto_reject / manual_review (see decideFromVerdict).
//   7. Respond with the verdict so the UI can render appropriate copy.
//
// Runtime: Node.js (Gemini SDK uses node fetch; multipart parsing via
// Web FormData which Next.js exposes natively).

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import {
  claimGoogleReview,
  autoApproveLayer4Reward,
  autoRejectLayer4Reward,
  findDuplicateClaim,
  LAYER4_VALUE_AED,
} from '@/contexts/dorm-wars/domain/layer4'
import {
  verifyReviewScreenshot,
  decideFromVerdict,
  hashReviewText,
  MIN_DEDUP_TEXT_LENGTH,
  type VerifyResult,
} from '@/contexts/dorm-wars/domain/google-review-verify'
import { resolvePlan } from '@/contexts/subscriptions/domain/plans'

// Netlify default function timeout is 10s; Gemini Vision on a screenshot
// typically takes 5-15s. Without this export the function gets killed
// mid-call and the client sees an infinite spinner. 60s leaves comfortable
// headroom under the SDK's 45s timeout (set in verifyReviewScreenshot).
export const maxDuration = 60

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024 // 5 MB — mirrors bucket limit
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])

export async function POST(req: Request) {
  const t0 = Date.now()
  const log = (msg: string) => console.log(`[google-review-verify ${Date.now() - t0}ms] ${msg}`)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })
  log(`auth ok customer=${user.id}`)

  const admin = createAdminSupabaseClient()

  // ── Parse the multipart body ─────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 })
  }
  const file = formData.get('screenshot')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_screenshot' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'empty_file' }, { status: 400 })
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return NextResponse.json({ error: 'file_too_large', maxBytes: MAX_SCREENSHOT_BYTES }, { status: 413 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'unsupported_mime', got: file.type }, { status: 415 })
  }
  log(`file ok type=${file.type} bytes=${file.size}`)

  // ── Premium+ gate (backend defense — hub UI already blocks non-Monthly) ──
  // Match the SSR resolver (utils/supabase/queries.ts → getActiveSubscription):
  // include 'Scheduled' so a customer who paid but whose sub starts later today
  // can still claim. Without Scheduled the hub renders the Google review tile
  // (SSR sees Scheduled as eligible) but this endpoint 403s them — misleading
  // "ineligible plan" error for a paying Monthly Max user. Ordering ascending
  // by start_date matches getActiveSubscription, so a renewing user with both
  // an Active and a Scheduled sub claims against their current Active cycle.
  const { data: activeSub } = await admin
    .from('subscriptions')
    .select('id, plan_name')
    .eq('customer_id', user.id)
    .in('status', ['Active', 'Paused', 'Skipped', 'Scheduled'])
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!activeSub) {
    return NextResponse.json({ error: 'no_active_sub' }, { status: 403 })
  }
  const planId = resolvePlan(activeSub.plan_name as string | null)?.id ?? null
  if (planId !== 'monthly-premium' && planId !== 'monthly-max') {
    return NextResponse.json({ error: 'plan_not_eligible' }, { status: 403 })
  }
  log(`plan eligible sub=${activeSub.id} plan=${planId}`)

  // ── Fetch customer name (used as a soft hint to Gemini) ──
  const { data: customer } = await admin
    .from('customers')
    .select('name')
    .eq('id', user.id)
    .maybeSingle()

  // ── Insert (or fetch existing) layer4 row for this sub ──
  let claim: Awaited<ReturnType<typeof claimGoogleReview>>
  try {
    claim = await claimGoogleReview(admin, user.id, activeSub.id as string)
  } catch (err) {
    console.error('claimGoogleReview insert failed:', err)
    return NextResponse.json({ error: 'claim_insert_failed' }, { status: 500 })
  }

  // If already auto_approved/approved in this sub, short-circuit with the
  // existing result. (A 'pending' row gets re-verified — user can retry
  // with a better screenshot on a previously failed/queued claim.)
  if (claim.alreadyClaimed && (claim.row.status === 'auto_approved' || claim.row.status === 'approved')) {
    return NextResponse.json({
      claimed: true,
      decision: 'already_credited',
      row: { id: claim.row.id, status: claim.row.status, value_aed: claim.row.value_aed },
    })
  }

  // ── Upload screenshot to storage (for audit + manual queue access) ──
  const ext = file.type === 'image/png' ? 'png'
    : file.type === 'image/webp' ? 'webp'
    : file.type === 'image/heic' ? 'heic'
    : 'jpg'
  const path = `${user.id}/${claim.row.id}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: uploadErr } = await admin.storage
    .from('review-screenshots')
    .upload(path, bytes, { contentType: file.type, upsert: true })
  if (uploadErr) {
    // Storage failure is non-fatal for verification (we still have the
    // bytes in memory). Log + continue. The user gets a verdict; ops
    // loses the audit trail for this one claim.
    console.error('review-screenshot storage upload failed:', uploadErr)
  } else {
    log(`storage upload ok path=${path}`)
  }
  log(`starting Gemini verification…`)

  // ── Run Gemini verification ──
  let verdict: VerifyResult
  try {
    verdict = await verifyReviewScreenshot(bytes, file.type, (customer?.name as string | null) ?? null)
  } catch (err) {
    console.error('verifyReviewScreenshot threw:', err)
    return NextResponse.json({
      claimed: true,
      decision: 'manual_review',
      reason:   'Verification service unavailable',
      row:      { id: claim.row.id, status: 'pending', value_aed: claim.row.value_aed },
    })
  }

  // ── Duplicate detection (cross-user fraud guard) ──
  // Hash the extracted text if long enough, then check for collisions
  // against any prior approved/auto_approved google_review row. Match
  // forces manual_review regardless of Gemini confidence — ops decides
  // whether it's a real fraud case or a legit retry/household situation.
  const extractedText = verdict.extractedReviewText
  const textHash = extractedText && extractedText.length >= MIN_DEDUP_TEXT_LENGTH
    ? await hashReviewText(extractedText)
    : null
  const reviewerName = verdict.reviewerNameVisible
  let duplicate: Awaited<ReturnType<typeof findDuplicateClaim>> = null
  if (textHash || reviewerName) {
    try {
      duplicate = await findDuplicateClaim(admin, textHash, reviewerName, user.id)
      if (duplicate) {
        log(`duplicate detected match=${duplicate.matched_on} colliding_row=${duplicate.id}`)
      }
    } catch (err) {
      // Dedup query failure is non-fatal — we just lose the fraud signal
      // for this one claim. Log + proceed.
      console.error('findDuplicateClaim failed:', err)
    }
  }

  const baseDecision = decideFromVerdict(verdict)
  // If a duplicate was found, override to manual_review. Never auto-reject
  // on duplicate (legit retry / household / Gemini misread = wallet loss).
  const decision = duplicate ? 'manual_review' : baseDecision
  log(`Gemini verdict decision=${decision} (base=${baseDecision}) confidence=${verdict.confidence} dup=${duplicate?.id ?? 'none'}`)

  const verdictNote =
    `Gemini: ${decision} (confidence=${verdict.confidence}, isGoogleReview=${verdict.isGoogleReviewScreenshot}, ` +
    `isDormers=${verdict.businessMatchesDormers}, hasRating=${verdict.hasVisibleRating}, ` +
    `reviewer="${verdict.reviewerNameVisible ?? ''}"). ${verdict.reason}` +
    (duplicate
      ? `\n[DUPLICATE] Matched ${duplicate.matched_on} of row ${duplicate.id} (customer ${duplicate.customer_id}).`
      : '')

  // Persist the extracted fields on every verified row (auto_approved,
  // pending → manual_review). Skipped for auto_reject which deletes the row.
  const extractedColumns = {
    extracted_review_text:   extractedText,
    extracted_text_hash:     textHash,
    extracted_reviewer_name: reviewerName,
  }

  if (decision === 'auto_approve') {
    // Write the extracted columns BEFORE auto-approving so the next
    // upload by a different user can see this row's hash for dedup.
    await admin
      .from('layer4_rewards')
      .update(extractedColumns)
      .eq('id', claim.row.id)
    try {
      await autoApproveLayer4Reward(
        admin,
        claim.row.id,
        user.id,
        LAYER4_VALUE_AED.google_review,
        'layer4_google_review',
        verdictNote,
      )
    } catch (err) {
      console.error('autoApprove failed after auto_approve verdict:', err)
      return NextResponse.json({
        claimed:  true,
        decision: 'manual_review',
        reason:   'Auto-approve hit a snag — queued for manual review',
        row:      { id: claim.row.id, status: 'pending', value_aed: claim.row.value_aed },
      })
    }
    return NextResponse.json({
      claimed:  true,
      decision: 'auto_approved',
      reason:   verdict.reason,
      row:      { id: claim.row.id, status: 'auto_approved', value_aed: claim.row.value_aed },
    })
  }

  if (decision === 'auto_reject') {
    // Delete the pending row so the user can re-claim within the same sub
    // with a better screenshot — without bumping into the UNIQUE constraint.
    await autoRejectLayer4Reward(admin, claim.row.id, verdict.reason)
    return NextResponse.json({
      claimed:  false,
      decision: 'auto_rejected',
      reason:   verdict.reason,
    })
  }

  // manual_review — leave status='pending', stamp the verdict + extracted
  // columns so ops can see what was parsed and the dedup hash is available
  // for future uploads.
  await admin
    .from('layer4_rewards')
    .update({ ...extractedColumns, notes: verdictNote })
    .eq('id', claim.row.id)

  return NextResponse.json({
    claimed:     true,
    decision:    'manual_review',
    reason:      verdict.reason,
    duplicateOf: duplicate?.id ?? null,
    row:         { id: claim.row.id, status: 'pending', value_aed: claim.row.value_aed },
  })
}

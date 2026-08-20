// src/app/api/ops/pickup-stack/route.ts
// Pile-by-pile pickup, for loads too big to photograph in one frame.
//
// One photo of thirty boxes cannot be counted by anything: boxes hide behind
// boxes and no model sees through cardboard. Splitting the load turns one
// impossible count into several easy ones. The reconciliation rules and the
// reason the overview counts PILES rather than boxes live in
// contexts/ops/domain/stack-pickup.ts — read that first.
//
// Deliberately a separate route from confirm-pickup: the single-photo flow
// works and is in daily use, and this is not worth risking it for.
//
// Phases, each its own request so no call carries more than one vision round
// trip and the rider sees progress as he goes:
//   count    — no photo. Checks his blind count against the kitchen's, and
//              says whether this load needs splitting at all.
//   stack    — one pile. Counts its boxes, appends to the running list.
//   overview — the wide shot. Counts PILES, reconciles everything, and only
//              then opens the day and writes the per-dorm rows.
//   reset    — throw the piles away and start again.

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { validateOpsTokenById } from '@/contexts/ops/usecases/validate-token'
import { getDormCounts } from '@/contexts/ops/usecases/get-dorm-counts'
import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { deliveryDormNames } from '@/shared/dorm-registry'
import {
  verifyBoxCount,
  verifyStackCount,
  DEEP_BOX_COUNT_MODEL,
} from '@/contexts/ops/domain/box-count-verify'
import { loadBoxReferenceImages } from '@/infra/ops/box-reference'
import { pickupTarget } from '@/contexts/ops/domain/pickup-decision'
import {
  reconcileStacks,
  needsStackMode,
  stackPhotoPath,
  MAX_BOXES_PER_STACK,
} from '@/contexts/ops/domain/stack-pickup'
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

  const phase = formData.get('phase') as string | null
  const opsToken = formData.get('opsToken') as string | null
  const dateIso = formData.get('dateIso') as string | null
  const riderCount = parseInt((formData.get('riderCount') as string | null) ?? '', 10)

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

  const sb = createAdminSupabaseClient()

  // ── What the load should be ─────────────────────────────────────────────
  const dateUtc = new Date(dateIso + 'T00:00:00Z')
  const dow = dateUtc.getUTCDay()
  const dayName = DAYS_OF_WEEK[dow === 0 ? 1 : dow]
  const isSaturday = dow === 6

  const locs = await getDormLocations()
  const deliverable = new Set(deliveryDormNames(locs))
  const dormCounts = await getDormCounts(dateIso, dayName, isSaturday)
  const expectedTotal = Object.entries(dormCounts)
    .filter(([name]) => deliverable.has(name))
    .reduce((sum, [, n]) => sum + n, 0)

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
  const target = pickupTarget({ expectedTotal, kitchenTotal })

  const { data: priorRow } = await sb
    .from('ops_day_events')
    .select('accepted, attempts, stack_counts, stack_photo_paths')
    .eq('event_date', dateIso)
    .eq('event_type', 'rider_pickup')
    .maybeSingle()

  if (priorRow?.accepted === true) {
    return NextResponse.json({ ok: true, phase: 'done', accepted: true, alreadyOpen: true })
  }

  const stackCounts: number[] = priorRow?.stack_counts ?? []
  const stackPaths: string[] = priorRow?.stack_photo_paths ?? []
  const attempts = priorRow?.attempts ?? 0

  // ── Phase: count ────────────────────────────────────────────────────────
  // No photo. His number against the kitchen's, before he spends any effort
  // on cameras. A better photo cannot conjure a missing box.
  if (phase === 'count') {
    if (riderCount !== target) {
      return NextResponse.json({
        ok: true, phase: 'count', accepted: false, outcome: 'rider_disagrees',
        target, kitchenTotal, expectedTotal, riderCount, allowAssert: true,
      })
    }
    return NextResponse.json({
      ok: true, phase: 'count', outcome: 'ok',
      mode: needsStackMode(riderCount) ? 'stack' : 'single',
      maxPerStack: MAX_BOXES_PER_STACK,
      target, riderCount,
    })
  }

  // ── Phase: reset ────────────────────────────────────────────────────────
  if (phase === 'reset') {
    await sb.from('ops_day_events').upsert(
      {
        event_date: dateIso,
        event_type: 'rider_pickup',
        ops_token_id: opsToken,
        stack_mode: true,
        accepted: false,
        stack_counts: [],
        stack_photo_paths: [],
        overview_stack_count: null,
        attempts: attempts + 1,
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: 'event_date,event_type' },
    )
    void notifyAdmin(
      `Rider restarted the pile count at pickup for ${dateIso}. Attempt ${attempts + 2}.`,
      'pickup',
    )
    return NextResponse.json({ ok: true, phase: 'reset', stackCounts: [] })
  }

  // ── Photo phases share the same guards the other ops routes apply ───────
  const photo = formData.get('photo')
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: 'missing_photo' }, { status: 400 })
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  }
  if (!ALLOWED_MIME.has(photo.type)) {
    return NextResponse.json({ error: 'unsupported_mime' }, { status: 415 })
  }
  const bytes = new Uint8Array(await photo.arrayBuffer())
  const references = loadBoxReferenceImages()

  // ── Phase: stack ────────────────────────────────────────────────────────
  if (phase === 'stack') {
    // 1-based and always the next one: the client cannot renumber piles or
    // overwrite an earlier one by lying about the index.
    const stackIndex = stackCounts.length + 1
    const path = stackPhotoPath(dateIso, stackIndex, attempts + 1)

    const { error: upErr } = await sb.storage
      .from('delivery-photos')
      .upload(path, bytes, { contentType: photo.type, upsert: true })
    if (upErr) console.error('[pickup-stack] upload failed:', upErr.message)

    const result = await verifyBoxCount(bytes, photo.type, references, DEEP_BOX_COUNT_MODEL)

    // A pile it cannot read is reshot, never recorded. That keeps stack_counts
    // free of nulls, so the sum is always meaningful.
    if (result.count === null) {
      return NextResponse.json({
        ok: true, phase: 'stack', outcome: 'stack_unreadable',
        stackIndex, reason: result.reason,
      })
    }

    const { error: writeErr } = await sb.from('ops_day_events').upsert(
      {
        event_date: dateIso,
        event_type: 'rider_pickup',
        ops_token_id: opsToken,
        stack_mode: true,
        accepted: false,
        total_count: expectedTotal,
        rider_count: riderCount,
        stack_counts: [...stackCounts, result.count],
        stack_photo_paths: upErr ? stackPaths : [...stackPaths, path],
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: 'event_date,event_type' },
    )
    if (writeErr) {
      captureError(writeErr, { area: 'ops', op: 'pickup-stack.write', dateIso })
      return NextResponse.json({ error: 'save_failed' }, { status: 500 })
    }

    const runningTotal = [...stackCounts, result.count].reduce((a, b) => a + b, 0)
    return NextResponse.json({
      ok: true, phase: 'stack', outcome: 'counted',
      stackIndex, count: result.count, confidence: result.confidence,
      reason: result.reason, stacksSoFar: stackCounts.length + 1, runningTotal,
    })
  }

  // ── Phase: overview ─────────────────────────────────────────────────────
  if (phase === 'overview') {
    if (stackCounts.length === 0) {
      return NextResponse.json({
        ok: true, phase: 'overview', outcome: 'no_stacks',
        reason: 'Photograph the piles first.',
      })
    }

    const path = stackPhotoPath(dateIso, null, attempts + 1)
    const { error: upErr } = await sb.storage
      .from('delivery-photos')
      .upload(path, bytes, { contentType: photo.type, upsert: true })
    if (upErr) console.error('[pickup-stack] overview upload failed:', upErr.message)

    // Counts PILES, not boxes. This is what makes the split safe from double
    // counting: the two kinds of photo answer different questions.
    const overview = await verifyStackCount(bytes, photo.type, references, DEEP_BOX_COUNT_MODEL)
    const reconcile = reconcileStacks({
      target,
      stackCounts,
      overviewStackCount: overview.count,
    })

    await sb.from('ops_day_events').upsert(
      {
        event_date: dateIso,
        event_type: 'rider_pickup',
        ops_token_id: opsToken,
        stack_mode: true,
        accepted: reconcile.accepted,
        matched: reconcile.accepted,
        total_count: expectedTotal,
        rider_count: riderCount,
        gemini_count: reconcile.total,
        gemini_confidence: overview.confidence,
        overview_photo_path: upErr ? null : path,
        overview_stack_count: overview.count,
        photo_path: upErr ? null : path,
        attempts: attempts + 1,
        mismatch_details: reconcile.accepted
          ? null
          : `${reconcile.outcome}: piles ${stackCounts.join('+')} = ${reconcile.total ?? '?'}, overview saw ${overview.count ?? 'unreadable'} piles, target ${target}`,
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: 'event_date,event_type' },
    )

    if (!reconcile.accepted) {
      return NextResponse.json({
        ok: true, phase: 'overview', accepted: false,
        outcome: reconcile.outcome,
        total: reconcile.total,
        stacksPhotographed: stackCounts.length,
        overviewStackCount: overview.count,
        stackCounts, target, reason: overview.reason,
      })
    }

    // ── Accepted: only now do the per-dorm rows exist ─────────────────────
    const dormsToConfirm = Object.entries(dormCounts).filter(
      ([name, n]) => deliverable.has(name) && n > 0,
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
        area: 'ops', op: 'pickup-stack.delivery-events', dateIso, failed,
      })
      return NextResponse.json({ error: 'save_failed', failed }, { status: 500 })
    }

    const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const hhmm = `${String(ae.getUTCHours()).padStart(2, '0')}:${String(ae.getUTCMinutes()).padStart(2, '0')}`
    void notifyRunUpdate(
      'Rider picked up',
      `${reconcile.total} boxes left the kitchen at ${hhmm}, counted as ${stackCounts.length} piles`,
      'Rider, piles and the list all agree. Nothing to do.',
    )

    return NextResponse.json({
      ok: true, phase: 'overview', accepted: true, outcome: 'accepted',
      total: reconcile.total, stackCounts, overviewStackCount: overview.count,
    })
  }

  return NextResponse.json({ error: 'unknown_phase' }, { status: 400 })
}

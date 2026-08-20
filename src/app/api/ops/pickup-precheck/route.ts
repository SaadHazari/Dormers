// src/app/api/ops/pickup-precheck/route.ts
// Answers ONE question before the rider takes any pickup photo: does the
// number he counted match the number he is measured against?
//
// The server has always checked the rider's count first (confirm-pickup
// returns `rider_disagrees` before it uploads anything), but the old UI asked
// for the photo before the count, so a short van cost the rider a wasted
// photo before he heard about it. This route lets the count-first UI surface
// the disagreement at the moment the count is typed.
//
// Read-only: no uploads, no attempt spent, no rows written, no alerts. The
// day can only be opened by confirm-pickup or pickup-stack, both of which
// re-run this same comparison server-side and take no client word for it.

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { validateOpsTokenById } from '@/contexts/ops/usecases/validate-token'
import { getDormCounts } from '@/contexts/ops/usecases/get-dorm-counts'
import { pickupTarget } from '@/contexts/ops/domain/pickup-decision'
import { needsStackMode, MAX_BOXES_PER_STACK } from '@/contexts/ops/domain/stack-pickup'
import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { deliveryDormNames } from '@/shared/dorm-registry'

export const runtime = 'nodejs'

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function POST(req: Request) {
  let body: { opsToken?: string; dateIso?: string; riderCount?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { opsToken, dateIso } = body
  const riderCount = Number(body.riderCount)
  if (!opsToken || !dateIso || !Number.isInteger(riderCount) || riderCount < 0) {
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

  const sb = createAdminSupabaseClient()

  // Day already open (e.g. the PWA reloaded mid-flow) — nothing to precheck.
  const { data: priorRow } = await sb
    .from('ops_day_events')
    .select('accepted')
    .eq('event_date', dateIso)
    .eq('event_type', 'rider_pickup')
    .maybeSingle()
  if (priorRow?.accepted === true) {
    return NextResponse.json({ ok: true, alreadyOpen: true })
  }

  // Same target computation as confirm-pickup: delivery dorms only, kitchen
  // count outranks the subscription estimate when the packing check was done.
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

  return NextResponse.json({
    ok: true,
    alreadyOpen: false,
    match: riderCount === target,
    target,
    kitchenTotal,
    expectedTotal,
    riderCount,
    needsStacks: needsStackMode(riderCount),
    maxPerStack: MAX_BOXES_PER_STACK,
  })
}

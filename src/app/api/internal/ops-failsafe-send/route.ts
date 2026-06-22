/**
 * 8 PM UAE Failsafe — internal endpoint hit by the ops_failsafe_20_ae cron.
 *
 * Finds dorms with active subscriptions today that have no verified
 * delivery_events row, then WhatsApps the owner via notifyAdmin.
 *
 * Idempotency: delivery_failsafe_alerts table with UNIQUE(alert_date).
 * A second call on the same date skips the alert.
 *
 * Auth: INTERNAL_RETRY_SECRET bearer token (same as all internal routes).
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { notifyAdmin } from '@/infra/admin-alerts/notify'
import { timingSafeCompare } from '@/shared/crypto'
import { getDormCounts } from '@/contexts/ops/usecases/get-dorm-counts'

// Phase 8 (L7): bound wall-clock so the failsafe fails fast in our control
// instead of being truncated at the platform's ~10s default.
export const maxDuration = 15

export async function POST(req: Request) {
  // ── Auth guard ──────────────────────────────────────────────────────
  const expected = process.env.INTERNAL_RETRY_SECRET
  if (!expected) {
    console.error('INTERNAL_RETRY_SECRET not set; refusing ops-failsafe')
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!presented || !timingSafeCompare(presented, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── UAE date computation ────────────────────────────────────────────
  const nowUAE = new Date(Date.now() + 4 * 60 * 60 * 1000)
  const todayIso = nowUAE.toISOString().slice(0, 10) // "YYYY-MM-DD"
  const dayName = nowUAE.toLocaleString('en-AE', {
    weekday: 'long',
    timeZone: 'Asia/Dubai',
  })
  const isSaturday = nowUAE.getDay() === 6

  // ── Find dorms with active subscriptions today ──────────────────────
  const dormCounts = await getDormCounts(todayIso, dayName, isSaturday)
  const dormsWithSubs = Object.keys(dormCounts).filter(
    (d) => dormCounts[d] > 0,
  )

  if (dormsWithSubs.length === 0) {
    return NextResponse.json({
      ok: true,
      pendingDorms: [],
      sent: false,
      reason: 'no_deliveries_expected',
    })
  }

  // ── Find already-verified dorms for today ───────────────────────────
  const sb = createAdminSupabaseClient()
  const { data: verifiedRows } = await sb
    .from('delivery_events')
    .select('dorm_name')
    .eq('delivery_date', todayIso)
    .eq('verified', true)

  const verifiedDorms = new Set(
    (verifiedRows ?? []).map((r: { dorm_name: string }) => r.dorm_name),
  )
  const pendingDorms = dormsWithSubs.filter((d) => !verifiedDorms.has(d))

  // ── Early exit if all confirmed ─────────────────────────────────────
  if (pendingDorms.length === 0) {
    return NextResponse.json({ ok: true, pendingDorms: [], sent: false })
  }

  // ── Idempotency guard ──────────────────────────────────────────────
  // INSERT with ON CONFLICT DO NOTHING — if a row for today already
  // exists, the insert is a no-op and we skip the alert.
  const { data: insertedRows, error: insertError } = await sb
    .from('delivery_failsafe_alerts')
    .insert({ alert_date: todayIso, pending_dorms: pendingDorms })
    .select('id')

  // Unique violation (23505) means already sent today
  if (insertError?.code === '23505') {
    return NextResponse.json({ ok: true, skipped: 'already_sent_today' })
  }

  // Unexpected insert error — log but don't block
  if (insertError) {
    console.error('delivery_failsafe_alerts insert error:', insertError.message)
    return NextResponse.json({ ok: true, skipped: 'already_sent_today' })
  }

  // If no row was returned, treat as already-sent (defensive)
  if (!insertedRows || insertedRows.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'already_sent_today' })
  }

  // ── Send the alert ──────────────────────────────────────────────────
  const pendingList = pendingDorms.join(', ')
  const quickLink = 'https://dormers.ae/admin/deliveries'
  void notifyAdmin(
    `8PM FAILSAFE: Unverified deliveries for ${todayIso}. ` +
      `Pending dorms: ${pendingList}. ` +
      `Verify manually: ${quickLink}`,
    'deliveries',
  )

  return NextResponse.json({ ok: true, pendingDorms, sent: true })
}

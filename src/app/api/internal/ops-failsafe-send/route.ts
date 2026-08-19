/**
 * 8 PM UAE Failsafe — internal endpoint hit by the ops_failsafe_20_ae cron.
 *
 * Finds dorms with active subscriptions today that have no record of the food
 * arriving, then WhatsApps the owner via notifyAdmin.
 *
 * "No record" means delivered_at is null, NOT verified = false. Those are
 * different alarms: a dorm whose counts were disputed was already escalated in
 * real time and its customers were already told, so repeating it at 8PM as
 * "pending" would be false. It is reported separately as still-open instead.
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
// instead of being truncated at the platform's ~10s default. 26 covers the
// awaited alert send + Meta-acceptance poll on top of the dorm-count query.
export const maxDuration = 26

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

  // ── What actually happened at each dorm today ───────────────────────
  const sb = createAdminSupabaseClient()
  const { data: eventRows } = await sb
    .from('delivery_events')
    .select('dorm_name, verified, delivered_at, escalated_at')
    .eq('delivery_date', todayIso)

  const deliveredDorms = new Set<string>()
  const openDorms = new Set<string>()  // delivered, but the count is still disputed
  for (const r of (eventRows ?? []) as {
    dorm_name: string
    verified: boolean | null
    delivered_at: string | null
    escalated_at: string | null
  }[]) {
    if (r.delivered_at !== null || r.verified === true) deliveredDorms.add(r.dorm_name)
    if (r.verified !== true && r.escalated_at !== null) openDorms.add(r.dorm_name)
  }

  // The real alarm: food with no record of arriving anywhere.
  const pendingDorms = dormsWithSubs.filter((d) => !deliveredDorms.has(d))
  const flaggedDorms = dormsWithSubs.filter((d) => openDorms.has(d))

  // ── Early exit when nothing needs the owner ─────────────────────────
  if (pendingDorms.length === 0 && flaggedDorms.length === 0) {
    return NextResponse.json({ ok: true, pendingDorms: [], flaggedDorms: [], sent: false })
  }

  // ── Idempotency guard ──────────────────────────────────────────────
  // INSERT with ON CONFLICT DO NOTHING — if a row for today already
  // exists, the insert is a no-op and we skip the alert.
  const { data: insertedRows, error: insertError } = await sb
    .from('delivery_failsafe_alerts')
    .insert({
      alert_date: todayIso,
      pending_dorms: pendingDorms.length > 0 ? pendingDorms : flaggedDorms,
    })
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
  const quickLink = 'https://dormers.ae/admin/deliveries'

  // Two different things, said as two different things. Nothing recorded is
  // urgent; a disputed count you were already messaged about is not.
  const parts: string[] = [`8PM FAILSAFE for ${todayIso}.`]
  if (pendingDorms.length > 0) {
    parts.push(`No delivery recorded: ${pendingDorms.join(', ')}.`)
  }
  if (flaggedDorms.length > 0) {
    parts.push(
      `Delivered but the count is still open: ${flaggedDorms.join(', ')}. ` +
        `Customers there were already told their food arrived.`,
    )
  }
  parts.push(`Confirm manually: ${quickLink}`)

  // Awaited, not fire-and-forget: this is a cron route with no caller to
  // protect, and a voided promise gets frozen with the lambda after the
  // response returns (the 2026-07-13 phantom 15s RPC timeout).
  await notifyAdmin(parts.join(' '), 'deliveries')

  return NextResponse.json({ ok: true, pendingDorms, flaggedDorms, sent: true })
}

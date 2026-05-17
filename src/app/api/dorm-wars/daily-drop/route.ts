// src/app/api/dorm-wars/daily-drop/route.ts
// Phase 7-05 — Daily Drop claim endpoint.
//
// Claims today's Daily Drop for the authenticated user. Idempotent via the
// `daily_drops` table's UNIQUE(customer_id, drop_date_utc) constraint — calling
// this twice on the same UTC day returns the same value both times.
//
// On the FIRST successful claim of the day, a corresponding `credits` row is
// inserted with source='daily_drop', status='approved'. Subsequent same-day
// calls do NOT deposit additional credit (the insert short-circuits when the
// daily_drops INSERT conflicts).
//
// Runtime: Node.js (required — dailyDropValue() uses node:crypto.randomInt).
// Do NOT add `export const runtime = 'edge'`.

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { dailyDropValue } from '@/lib/dorm-wars/rng'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const today = new Date().toISOString().slice(0, 10) // UTC YYYY-MM-DD

  // 20-hour cooldown guard — kills the UTC-midnight double-claim loophole.
  // Without this, a UAE user (UTC+4) could claim at 03:59 AE (23:59 UTC)
  // and again at 04:01 AE (00:01 UTC) — two distinct drop_date_utc rows,
  // two payouts in 2 minutes. The UNIQUE constraint alone doesn't catch
  // this; we also enforce a minimum interval between consecutive claims.
  const COOLDOWN_HOURS = 20
  const { data: lastDrop } = await admin
    .from('daily_drops')
    .select('created_at, value_aed, rng_bucket')
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastDrop) {
    const elapsedMs = Date.now() - new Date(lastDrop.created_at).getTime()
    const elapsedHours = elapsedMs / 3_600_000
    if (elapsedHours < COOLDOWN_HOURS) {
      // Still within the cooldown — return the most recent claim payload so
      // the UI shows the locked-in value (same shape as alreadyClaimed).
      return NextResponse.json({
        alreadyClaimed: true,
        value_aed:  lastDrop.value_aed,
        rng_bucket: lastDrop.rng_bucket,
        cooldownHoursLeft: Math.max(0, Math.ceil(COOLDOWN_HOURS - elapsedHours)),
      })
    }
  }

  // Compute candidate outcome BEFORE the insert. Bucket boundaries mirror the
  // `daily_drops.rng_bucket` CHECK constraint and the weighted distribution in
  // dailyDropValue() (1..10 common, 11..50 rare, 51..200 epic).
  const value = dailyDropValue()
  const bucket: 'common' | 'rare' | 'epic' =
    value <= 10 ? 'common' : value <= 50 ? 'rare' : 'epic'

  // Try to insert today's row. UNIQUE conflict on (customer_id, drop_date_utc)
  // is now a redundant defense (the cooldown above catches the more common
  // case), but still protects against clock-drift / parallel-request races.
  const { data: inserted, error: insertErr } = await admin
    .from('daily_drops')
    .insert({
      customer_id: user.id,
      drop_date_utc: today,
      value_aed: value,
      rng_bucket: bucket,
    })
    .select('value_aed, rng_bucket')
    .maybeSingle()

  if (!inserted) {
    // Already claimed today — return the existing record so both browsers
    // see the same value. Admin client bypasses RLS for the read.
    const { data: existing } = await admin
      .from('daily_drops')
      .select('value_aed, rng_bucket')
      .eq('customer_id', user.id)
      .eq('drop_date_utc', today)
      .maybeSingle()

    if (!existing) {
      // Insert failed AND no existing row — true error, surface it.
      console.error('daily-drop: insert failed and no existing row', insertErr)
      return NextResponse.json({ error: 'unknown' }, { status: 500 })
    }
    return NextResponse.json({ alreadyClaimed: true, ...existing })
  }

  // First claim of the day — deposit the credit. We do this AFTER the
  // daily_drops insert so that a credit row only ever exists when a
  // corresponding daily_drops row also exists. CRITICAL: surface insert
  // errors. The daily_drops row is already committed and its UNIQUE
  // constraint blocks tomorrow-of-today's retry, so a silent failure here
  // means the user permanently loses today's drop value (up to AED 200).
  const { error: creditErr } = await admin.from('credits').insert({
    customer_id: user.id,
    amount_aed: inserted.value_aed,
    source: 'daily_drop',
    status: 'approved',
  })
  if (creditErr) {
    console.error(
      `❌ daily-drop credit insert failed — customer=${user.id} value=${inserted.value_aed}:`,
      creditErr,
    )
    // 500 so the client surfaces an error toast AND the daily_drops row is
    // visible for ops reconciliation (insert a credit manually with this
    // value_aed + source='daily_drop').
    return NextResponse.json(
      { error: 'credit_deposit_failed', value_aed: inserted.value_aed },
      { status: 500 },
    )
  }

  return NextResponse.json({ claimed: true, ...inserted })
}

/**
 * GET — read today's drop status WITHOUT claiming. Useful as a fallback for
 * the HubClient if the page-level SSR helper isn't wired (it is, via
 * `getDailyDrop` in queries.ts). Returns `{ claimed: boolean, value_aed?,
 * rng_bucket? }`.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Mirror the POST cooldown semantics so client polling can't see "not
  // claimed" while the POST refuses to issue a new claim.
  const COOLDOWN_HOURS = 20
  const { data } = await admin
    .from('daily_drops')
    .select('value_aed, rng_bucket, created_at')
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return NextResponse.json({ claimed: false })
  const elapsedHours =
    (Date.now() - new Date(data.created_at).getTime()) / 3_600_000
  if (elapsedHours >= COOLDOWN_HOURS) return NextResponse.json({ claimed: false })
  return NextResponse.json({
    claimed: true,
    value_aed: data.value_aed,
    rng_bucket: data.rng_bucket,
    cooldownHoursLeft: Math.max(0, Math.ceil(COOLDOWN_HOURS - elapsedHours)),
  })
}

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

  // Compute candidate outcome BEFORE the insert. Bucket boundaries mirror the
  // `daily_drops.rng_bucket` CHECK constraint and the weighted distribution in
  // dailyDropValue() (1..10 common, 11..50 rare, 51..200 epic).
  const value = dailyDropValue()
  const bucket: 'common' | 'rare' | 'epic' =
    value <= 10 ? 'common' : value <= 50 ? 'rare' : 'epic'

  // Try to insert today's row. UNIQUE conflict on (customer_id, drop_date_utc)
  // means the user has already claimed today — we fall through to the
  // alreadyClaimed branch below. The wasted RNG roll is harmless.
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
  // corresponding daily_drops row also exists.
  await admin.from('credits').insert({
    customer_id: user.id,
    amount_aed: inserted.value_aed,
    source: 'daily_drop',
    status: 'approved',
  })

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
  const today = new Date().toISOString().slice(0, 10)

  const { data } = await admin
    .from('daily_drops')
    .select('value_aed, rng_bucket')
    .eq('customer_id', user.id)
    .eq('drop_date_utc', today)
    .maybeSingle()

  if (!data) return NextResponse.json({ claimed: false })
  return NextResponse.json({ claimed: true, ...data })
}

// src/app/api/dorm-wars/streak/tick/route.ts
// Phase 7-05 — Daily streak tick endpoint.
//
// Called once per session on hub mount by HubClient. Logic:
//   • No row yet → insert {count:1, last_visit:today}
//   • last_visit === today → no-op (return current count)
//   • last_visit === yesterday → increment + update last_visit
//   • last_visit older than yesterday → reset to 1
//
// Race condition note: Two concurrent ticks from the same user (rare — hub
// mount happens once per page load) could both read "no row" and both try to
// INSERT. The `streaks` PK on customer_id makes the second INSERT fail with a
// duplicate-key error, which we catch + recover from by re-reading the row.
// A separate TOCTOU race exists for the increment path (two browsers tabbing
// in within the same millisecond could each read count=5 and both write 6
// instead of 7). Acceptable for Phase 7 — worst case is a single off-by-one
// once per device-switch moment, never duplicating the actual streak meaning.
//
// Runtime: Node.js. No edge runtime export.

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  const { data: row } = await admin
    .from('streaks')
    .select('count, last_visit_date_utc')
    .eq('customer_id', user.id)
    .maybeSingle()

  let newCount: number
  if (!row) {
    // First-ever tick for this user. Race-tolerant via try/catch — if a
    // concurrent request inserted first, our INSERT errors and we recover
    // by reading the winning row.
    try {
      newCount = 1
      await admin.from('streaks').insert({
        customer_id: user.id,
        count: 1,
        last_visit_date_utc: today,
      })
    } catch {
      const { data: row2 } = await admin
        .from('streaks')
        .select('count')
        .eq('customer_id', user.id)
        .maybeSingle()
      newCount = row2?.count ?? 1
    }
  } else if (row.last_visit_date_utc === today) {
    newCount = row.count // already ticked today — pure no-op
  } else if (row.last_visit_date_utc === yesterday) {
    newCount = row.count + 1
    // Postgres does NOT auto-update `updated_at` on UPDATE (no trigger in the
    // schema), so we set it explicitly here. The INSERT path lets the DEFAULT
    // now() fire.
    await admin
      .from('streaks')
      .update({
        count: newCount,
        last_visit_date_utc: today,
        updated_at: new Date().toISOString(),
      })
      .eq('customer_id', user.id)
  } else {
    newCount = 1 // gap > 1 day — reset
    await admin
      .from('streaks')
      .update({
        count: 1,
        last_visit_date_utc: today,
        updated_at: new Date().toISOString(),
      })
      .eq('customer_id', user.id)
  }

  return NextResponse.json({ count: newCount })
}

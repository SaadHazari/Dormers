// src/app/api/dorm-wars/streak/tick/route.ts
// Phase 7-05 — Daily streak tick endpoint.
//
// Delegates the entire read-modify-write to a Postgres RPC (`tick_streak`)
// so the day-boundary logic happens inside a single atomic SQL statement.
// The previous JS implementation had a TOCTOU race where two parallel ticks
// could double-increment OR wipe the streak. The RPC's INSERT ... ON CONFLICT
// DO UPDATE + CASE locks the row at COMMIT time, so concurrent requests
// converge to the correct count.
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

  // Atomic increment/reset/no-op. The RPC returns the new count.
  const { data, error } = await admin.rpc('tick_streak', { p_customer_id: user.id })
  if (error) {
    console.error('streak tick rpc failed:', error)
    return NextResponse.json({ error: 'tick_failed' }, { status: 500 })
  }

  // RPC returns a single integer. Supabase wraps scalar returns as the data field.
  const newCount = typeof data === 'number' ? data : Number(data ?? 0)
  return NextResponse.json({ count: newCount })
}

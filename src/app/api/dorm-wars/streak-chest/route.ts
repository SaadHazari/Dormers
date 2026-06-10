// src/app/api/dorm-wars/streak-chest/route.ts
// Phase 8E — Streak Chest claim endpoint. Replaces the killed Daily Drop.
//
// The chest unlocks every 8 unbroken streak days. The RNG + insert +
// last_chest_day advance all happen inside a single Postgres function
// (claim_streak_chest) so concurrent claims cannot double-deposit.
// The credit row is inserted AFTER the chest insert succeeds — the chest
// row is the canonical source of truth for "did this happen".
//
// Runtime: Node.js (admin client uses node fetch). No edge runtime.

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

interface ChestRow {
  chest_id:           string
  rng_bucket:         'cash_5_8' | 'cash_8_10' | 'cash_10_12' | 'doubler'
  value_aed:          number | null
  doubler_expires_at: string | null
  streak_day:         number
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Atomic claim. The RPC handles the eligibility check, RNG roll, insert,
  // and last_chest_day update inside a single transaction with a row lock
  // on the streaks row. Returns an empty result set when not eligible
  // (cooldown, no streak row, or UNIQUE conflict on parallel-request race).
  const { data, error } = await admin.rpc('claim_streak_chest', { p_customer_id: user.id })
  if (error) {
    console.error('claim_streak_chest rpc failed:', error)
    return NextResponse.json({ error: 'claim_failed' }, { status: 500 })
  }

  const rows = (data ?? []) as ChestRow[]
  if (rows.length === 0) {
    // Not eligible — either cooldown (gap < 8) or no streak row.
    return NextResponse.json({ claimed: false, reason: 'not_eligible' }, { status: 409 })
  }

  const chest = rows[0]

  // Deposit the credit (cash buckets only — doubler has no immediate AED).
  // CRITICAL: the chest row is already committed and its UNIQUE constraint
  // on (customer_id, streak_day) prevents retry. If this insert fails
  // silently the user loses the credit forever, so we surface a 500.
  if (chest.rng_bucket !== 'doubler' && chest.value_aed !== null) {
    const { error: creditErr } = await admin.from('credits').insert({
      customer_id: user.id,
      amount_aed: chest.value_aed,
      source: 'streak_chest',
      status: 'approved',
    })
    if (creditErr) {
      console.error(
        `❌ streak-chest credit insert failed — customer=${user.id} value=${chest.value_aed} chest_id=${chest.chest_id}:`,
        creditErr,
      )
      const { notifyAdmin } = await import('@/infra/admin-alerts/notify')
      void notifyAdmin(
        `Streak chest credit INSERT FAILED — customer ${user.id} won AED ${chest.value_aed} ` +
        `(chest ${chest.chest_id}) but credit was not deposited. UNIQUE prevents retry — manual credit needed.`,
      )
      return NextResponse.json(
        { error: 'credit_deposit_failed', value_aed: chest.value_aed, chest_id: chest.chest_id },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({
    claimed: true,
    chest_id:           chest.chest_id,
    rng_bucket:         chest.rng_bucket,
    value_aed:          chest.value_aed,
    doubler_expires_at: chest.doubler_expires_at,
    streak_day:         chest.streak_day,
  })
}

/**
 * GET — read chest eligibility WITHOUT claiming. Mirrors the SSR getter
 * (getStreakChestState in queries.ts) so client polling can't see a state
 * the server-side claim refuses.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data } = await admin
    .from('streaks')
    .select('count, last_chest_day')
    .eq('customer_id', user.id)
    .maybeSingle()

  const count = data ? Number(data.count) : 0
  const lastChestDay = data ? Number(data.last_chest_day) : 0
  const gap = Math.max(0, count - lastChestDay)
  return NextResponse.json({
    count,
    lastChestDay,
    chestReady:    gap >= 7,
    daysUntilNext: gap >= 7 ? 0 : Math.max(0, 7 - gap),
  })
}

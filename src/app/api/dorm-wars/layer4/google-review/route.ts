// src/app/api/dorm-wars/layer4/google-review/route.ts
// Phase 8G — Google review self-attest endpoint.
//
// Flow:
//   1. User taps "I've left a review" in the hub.
//   2. POST this endpoint → insert layer4_rewards row with status='pending'.
//   3. Admin checks the Dormers Google business page for the review.
//   4. Admin flips status='approved' in Supabase → triggers credit insert
//      (manual SQL today; Phase-9 ops tooling will automate).
//
// Self-attest is intentional. Google's API for review attribution is
// expensive to wire and gates on a Place ID + business verification we
// don't have. The ops queue handles ~10-20 review claims/week comfortably.

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { claimGoogleReview } from '@/lib/dorm-wars/layer4'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    const { row, alreadyClaimed } = await claimGoogleReview(admin, user.id)
    return NextResponse.json({
      claimed: !alreadyClaimed,
      alreadyClaimed,
      row: {
        id:         row.id,
        kind:       row.kind,
        status:     row.status,
        value_aed:  row.value_aed,
        claimed_at: row.claimed_at,
      },
    })
  } catch (err) {
    console.error('google-review claim failed:', err)
    return NextResponse.json({ error: 'claim_failed' }, { status: 500 })
  }
}

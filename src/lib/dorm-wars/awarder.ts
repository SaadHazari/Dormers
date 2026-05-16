// src/lib/dorm-wars/awarder.ts
// Phase 7 — Layer 2 + Layer 3 reward awarder. Called inline from
// creditInviterOnConversion (src/app/r/[cid]/actions.ts) AND from the
// monthly-cap early-return — Layer 3 tiers fire on lifetime count regardless
// of the Layer 1 monthly cap. (RESEARCH Decision #2.)
//
// Idempotency: cycle_rewards(customer_id, subscription_id, milestone) UNIQUE
// and lifetime_rewards(customer_id, tier) UNIQUE mean re-fires are safe.
// The .insert(...).select('id').maybeSingle() pattern returns null on
// UNIQUE conflict — that's what gates the side effects to first-award only.
//
// This plan (07-03) implements ONLY the Layer 2 cycle half. The Layer 3
// tier loop is appended in 07-04 at the marked placeholder below.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mysteryDropValue } from './rng'
import { CYCLE_MILESTONES, MILESTONE_15_BONUS_SKIPS } from './constants'
import { getCycleRecruits } from '@/utils/supabase/queries'

// Use the wide-generic form so this matches the type returned by bare
// createClient(url, key) — which is SupabaseClient<any, "public", "public", any, any>.
// Bare `SupabaseClient` (no generics) means schema=never and silently rejects
// our admin client at the call site. `any` triple is a known supabase-js typing
// escape hatch — same approach the rest of the repo uses for admin clients.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>

function admin(): AdminClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Deposit a credit row. Status='approved' — immediately spendable per the
 * live credits.status CHECK ('pending','approved','applied','rejected').
 * There's no FK on credits → cycle_rewards in the Phase 7 schema (the
 * cycle_rewards row id is logged at the call site for ops traceability).
 * Add a link in Phase 8 admin tooling if needed.
 */
async function depositCredit(
  sb: AdminClient,
  customerId: string,
  amountAed: number,
  source: string,
): Promise<void> {
  await sb.from('credits').insert({
    customer_id: customerId,
    amount_aed: amountAed,
    source,
    status: 'approved',
  })
}

export async function awardCycleAndTierRewards(
  customerId: string,
  subscriptionId: string | null,
): Promise<void> {
  const sb = admin()

  // ── Layer 2: cycle milestones ──
  // Per Decision #9: skip Layer 2 entirely when no active sub.
  // Per Pitfall #7: Layer 2 ticks regardless of Layer 1 monthly cap — INTENTIONAL.
  if (subscriptionId) {
    const cycleRecruits = await getCycleRecruits(sb, customerId, subscriptionId)

    for (const m of CYCLE_MILESTONES) {
      if (cycleRecruits < m.at) break // ascending — short-circuit
      const value = m.kind === 'mystery_drop' ? mysteryDropValue() : m.value

      const { data: inserted } = await sb
        .from('cycle_rewards')
        .insert({
          customer_id: customerId,
          subscription_id: subscriptionId,
          milestone: m.at,
          kind: m.kind,
          value_aed: value,
        })
        .select('id')
        .maybeSingle() // null on UNIQUE conflict

      if (!inserted) continue // already awarded — idempotent

      // Side effects on first-award only:
      if (m.kind === 'mystery_drop' || m.kind === 'free_week' || m.kind === 'free_month') {
        // value is non-null at this point: mystery resolved via RNG,
        // free_week/month carry numeric constants from CYCLE_MILESTONES.
        await depositCredit(sb, customerId, value!, `cycle_milestone_${m.at}`)
      }
      if (m.kind === 'cash_and_skips') {
        await depositCredit(sb, customerId, 500, 'cycle_milestone_15')
        await sb.rpc('increment_bonus_skips', {
          p_sub_id: subscriptionId,
          p_amount: MILESTONE_15_BONUS_SKIPS,
        })
      }
      if (m.kind === 'dorm_weekend') {
        // Decision #8: stub — row written, no credit, ops-visible log.
        console.log(
          `🏆 DORM WEEKEND unlocked for customer ${customerId} — manual fulfilment needed (cycle_rewards.id=${inserted.id as string})`,
        )
      }
    }
  }

  // LAYER 3 TIER LOOP APPENDED IN 07-04
}

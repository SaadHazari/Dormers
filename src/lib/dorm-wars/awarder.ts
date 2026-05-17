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
import { CYCLE_MILESTONES, LIFETIME_TIERS, MILESTONE_15_BONUS_SKIPS, TIER_4_MEALS_CREDIT_AED } from './constants'
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
  // The cycle_rewards / lifetime_rewards marker row that triggered this call
  // is ALREADY inserted by the caller — its UNIQUE constraint blocks retry.
  // If this credit insert silently fails we permanently lose the deposit.
  // Throw so the caller's try/catch surfaces the failure to logs (and to the
  // outer webhook telemetry) instead of leaking money.
  const { error } = await sb.from('credits').insert({
    customer_id: customerId,
    amount_aed: amountAed,
    source,
    status: 'approved',
  })
  if (error) {
    console.error(
      `❌ depositCredit failed — customer=${customerId} amount=${amountAed} source=${source}:`,
      error,
    )
    throw new Error(`depositCredit failed: ${error.message}`)
  }
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

    // Defensive sort — CYCLE_MILESTONES is currently ascending but we don't
    // want a future reorder of the constant to silently stop awards. Use
    // `continue` instead of `break` so a non-monotonic threshold also works.
    const sortedMilestones = [...CYCLE_MILESTONES].sort((a, b) => a.at - b.at)
    for (const m of sortedMilestones) {
      if (cycleRecruits < m.at) continue // not reached yet — skip, keep looking
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

  // ── Layer 3: lifetime tiers ──
  // Per Decision #2 / #9: tiers fire on lifetime conversion count regardless
  // of the Layer 1 monthly cap AND regardless of whether the inviter has an
  // active subscription. This block sits OUTSIDE the `if (subscriptionId)`
  // guard above on purpose — a lapsed customer can still cross tier
  // thresholds via lifetime referrals and we want the perks (esp. the 5%/10%
  // off coupon path) to land so the next checkout picks them up.
  //
  // `lifetimeConverted` is unbounded — NO date filter — and idempotency is
  // enforced by lifetime_rewards(customer_id, tier) UNIQUE: the
  // .insert(...).select('id').maybeSingle() returns null on conflict, which
  // gates the per-tier side effects to first-award only.
  const { count: lifetimeConverted } = await sb
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('inviter_user_id', customerId)
    .eq('status', 'converted')

  // Defensive sort for the same reason as Layer 2 — never let constant
  // reordering silently stop tier awards.
  const sortedTiers = [...LIFETIME_TIERS].sort((a, b) => a.at - b.at)
  const lifetimeCount = lifetimeConverted ?? 0
  for (const t of sortedTiers) {
    if (lifetimeCount < t.at) continue // not reached yet — skip, keep looking

    const { data: inserted } = await sb
      .from('lifetime_rewards')
      .insert({
        customer_id: customerId,
        tier: t.tier,
        perk: t.perk,
      })
      .select('id')
      .maybeSingle() // null on UNIQUE(customer_id, tier) conflict

    if (!inserted) continue // already awarded — idempotent

    // Side effects on first-award only:
    if (t.tier === 2) {
      // Tier 2 perk = 10% off forever + Early Access flag.
      // (Discount % itself lands at checkout time via
      // getActiveLifetimeTierPercent → synthesizePerSessionCoupon, no action here.)
      await sb.from('customers').update({ early_access: true }).eq('id', customerId)
    }
    if (t.tier === 3) {
      // Jacket + merch fulfilment is manual in Phase 7 (no fulfilment-queue
      // table). The lifetime_rewards row itself is the ops trail; admin
      // tooling for the physical-ship queue arrives in Phase 8 (Decision #8).
      console.log(
        `🧥 TIER 3 (jacket_merch) unlocked for customer ${customerId} — physical fulfilment needed (lifetime_rewards.id=${inserted.id as string})`,
      )
    }
    if (t.tier === 4) {
      // 100 free meals delivered as a 5500 AED bulk credit (Decision #7,
      // calibrated at AED 55/meal). Partial-redeems across many future
      // checkouts via the existing per-session synth + clamp.
      await depositCredit(sb, customerId, TIER_4_MEALS_CREDIT_AED, 'tier_4_meals')
      await sb.from('customers').update({ hall_wall: true }).eq('id', customerId)
    }
    // Tier 1 (5% off) has no immediate side effect — the discount applies at
    // next checkout via getActiveLifetimeTierPercent + synthesizePerSessionCoupon
    // (wired in 07-02). Same is true for the % component of tier 2/3/4 —
    // only the FLAG and CREDIT side effects need imperative action here.
  }
}

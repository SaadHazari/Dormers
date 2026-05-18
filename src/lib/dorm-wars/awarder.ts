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
import { CYCLE_MILESTONES, LIFETIME_TIERS, MILESTONE_15_BONUS_SKIPS } from './constants'
import { getCycleRecruits } from '@/utils/supabase/queries'
import { resolveMealPriceContext, freeWeekValue, freeMonthValue, tier4MealsValue } from './meal-pricing'
import { isDoublerActive, applyDoubler } from './doubler'

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

  // Phase 8D — meal-aware price context. Free Week / Free Month / Tier 4
  // payouts now scale to the customer's actual plan + meal preference
  // instead of using hardcoded AED 132 / 528 / 5500. Computed once here
  // and reused for both Layer 2 and Layer 3 so any Veg customer who hits
  // multiple milestones in the same call gets consistent valuations.
  const priceCtx = await resolveMealPriceContext(sb, customerId, subscriptionId)

  // Phase 8F — week-long doubler. Active if the customer has an unexpired
  // doubler chest outcome. Doubles Layer 2 milestone payouts (mystery,
  // free_week, free_month, cash_and_skips). Layer 3 lifetime tiers are
  // NOT doubled — that's by design per user spec.
  const doublerActive = await isDoublerActive(sb, customerId)

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

      // Phase 8D — meal-type-aware value resolution. mystery_drop still RNG.
      // free_week / free_month read priceCtx; everything else uses m.value.
      let value: number | null
      if (m.kind === 'mystery_drop') value = mysteryDropValue()
      else if (m.kind === 'free_week') value = freeWeekValue(priceCtx)
      else if (m.kind === 'free_month') value = freeMonthValue(priceCtx)
      else value = m.value

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

      // Side effects on first-award only. Phase 8F: applyDoubler tags the
      // source with '_2x' and doubles the AED when the doubler is active,
      // so analytics can attribute the boosted payout to the chest.
      if (m.kind === 'mystery_drop' || m.kind === 'free_week' || m.kind === 'free_month') {
        const { value: paid, source } = applyDoubler(value!, `cycle_milestone_${m.at}`, doublerActive)
        await depositCredit(sb, customerId, paid, source)
      }
      if (m.kind === 'cash_and_skips') {
        const { value: paid, source } = applyDoubler(500, 'cycle_milestone_15', doublerActive)
        await depositCredit(sb, customerId, paid, source)
        // Bonus skips are NOT doubled — operational kitchen impact would
        // double too, which we don't want. Only the AED component scales.
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
      // Jacket + merch fulfilment is manual + handled entirely over WhatsApp
      // per user spec ("any details of the jacket merch will be discussed
      // over whatsapp"). No in-app sizing / address capture. Enrich the ops
      // log with the customer's WhatsApp number + name so the fulfilment
      // team can reach out without a second lookup.
      const { data: contact } = await sb
        .from('customers')
        .select('name, whatsapp_number')
        .eq('id', customerId)
        .maybeSingle()
      console.log(
        `🧥 TIER 3 (jacket_merch) unlocked — reach out on WhatsApp to confirm size + delivery.`,
        `\n   customer_id=${customerId}`,
        `\n   name=${(contact?.name as string | null) ?? '(unknown)'}`,
        `\n   whatsapp=${(contact?.whatsapp_number as string | null) ?? '(missing)'}`,
        `\n   lifetime_rewards.id=${inserted.id as string}`,
      )
    }
    if (t.tier === 4) {
      // Phase 8D — "100 free meals" now scales to the customer's actual
      // plan + meal preference instead of the old flat AED 5500 (which
      // assumed AED 55/meal, far above any real per-meal price). Typical
      // payouts: AED 1750 (Monthly Max Veg) → AED 2200 (Monthly Premium
      // NonVeg). Partial-redeems across many future checkouts via the
      // existing per-session synth + clamp.
      //
      // priceCtx for a lapsed customer (no active sub) falls back to the
      // most recent Premium+ sub they ever had, then to Monthly Premium
      // NonVeg if there's no Premium+ history. See meal-pricing.ts.
      await depositCredit(sb, customerId, tier4MealsValue(priceCtx), 'tier_4_meals')
      await sb.from('customers').update({ hall_wall: true }).eq('id', customerId)
    }
    // Tier 1 (5% off) has no immediate side effect — the discount applies at
    // next checkout via getActiveLifetimeTierPercent + synthesizePerSessionCoupon
    // (wired in 07-02). Same is true for the % component of tier 2/3/4 —
    // only the FLAG and CREDIT side effects need imperative action here.
  }
}

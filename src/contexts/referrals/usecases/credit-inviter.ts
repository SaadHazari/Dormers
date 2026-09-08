/**
 * creditInviterOnConversion — pays the inviter when their invitee first pays.
 *
 * WHY THIS FILE EXISTS, AND WHY IT MUST NOT MOVE BACK
 * ---------------------------------------------------
 * This function used to live in `src/app/r/[cid]/actions.ts`. That file opens
 * with `'use server'`, which makes EVERY function it exports a publicly
 * callable HTTP endpoint with a stable action id — not just the ones the
 * referral page invokes. This one is server-to-server only (Stripe webhook and
 * free-checkout), it runs on the SERVICE-ROLE client, it takes a user id
 * straight from its caller, and it moves real money: Layer 1 cash credit plus
 * the Dorm Wars cycle and lifetime awards.
 *
 * So it was an unauthenticated payout endpoint on the public internet. The
 * production build confirmed it: all seven exports of that module were
 * registered in `server-reference-manifest.json`. An attacker who claimed a
 * free welcome gift on a second account could POST this action id with that
 * account's user id and collect the referral reward without a payment ever
 * being taken. The `status='gift_claimed'` CAS guard bounds the replay to one
 * payout per referral; it does not require the payment to have happened.
 *
 * A plain module has no action id, so there is nothing to call. That is the
 * entire fix. Do not re-export this from any `'use server'` file, and do not
 * add `'use server'` to the top of this one.
 *
 * See also: `no-unauthenticated-service-role-actions.test.ts`, which fails the
 * build if any `'use server'` export reaches for the admin client without an
 * auth check.
 */

import { type SupabaseClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { awardCycleAndTierRewards } from '@/contexts/dorm-wars/usecases/awarder'
import { isDoublerActive, applyDoubler } from '@/contexts/dorm-wars/domain/doubler'
import { cashForLifetimeConversion } from '@/contexts/dorm-wars/domain/constants'
import { queueCustomerNotification } from '@/contexts/notifications/usecases/queue'

/** Inviter earns credit on at most this many paid conversions per month. */
const MAX_CONVERSIONS_MONTH = 10

// ── Conversion credit — called from the Stripe webhook ────────────────────
// Awards the inviter credit when their invitee makes their first paid order.
// Idempotent: safe to call more than once (referral status gate prevents dup credits).
export async function creditInviterOnConversion(inviteeUserId: string): Promise<void> {
  const supabaseAdmin = createAdminSupabaseClient()

  // Find a gift_claimed referral for this invitee that hasn't converted yet.
  const { data: referral } = await supabaseAdmin
    .from('referrals')
    .select('id, inviter_cid, inviter_user_id')
    .eq('invitee_user_id', inviteeUserId)
    .eq('status', 'gift_claimed')
    .maybeSingle()

  if (!referral) return  // no referral, or already converted

  // Mark converted. CAS guard on status='gift_claimed' prevents a concurrent
  // webhook retry from double-converting the same referral and awarding
  // duplicate Layer 1 credit.
  const { count: flipped } = await supabaseAdmin
    .from('referrals')
    .update(
      { status: 'converted', converted_at: new Date().toISOString() },
      { count: 'exact' },
    )
    .eq('id', referral.id)
    .eq('status', 'gift_claimed')
  if ((flipped ?? 0) === 0) return

  if (!referral.inviter_user_id) return

  // Count this inviter's total paid conversions this calendar month.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { count: monthCount } = await supabaseAdmin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('inviter_user_id', referral.inviter_user_id)
    .eq('status', 'converted')
    .gte('converted_at', monthStart)

  // Hard cap: no credit beyond MAX_CONVERSIONS_MONTH per calendar month.
  if ((monthCount ?? 0) > MAX_CONVERSIONS_MONTH) {
    console.log(`ℹ️  Inviter ${referral.inviter_cid} over monthly cap — no credit issued`)
    // Layer 2/3 still fire — cycle counts and lifetime tiers are NOT capped
    // (CONTEXT.md "Critical Constraints", RESEARCH Pitfall #7). Awarder no-ops
    // Layer 2 when activeSub is null; Layer 3 (07-04) will fire either way.
    const activeSub = await fetchActiveSubForAwarder(supabaseAdmin, referral.inviter_user_id)
    await awardCycleAndTierRewards(referral.inviter_user_id, activeSub?.id ?? null)
    return
  }

  // Check if soft flags warrant a hold.
  const { data: reviewItem } = await supabaseAdmin
    .from('referral_review_queue')
    .select('id')
    .eq('referral_id', referral.id)
    .maybeSingle()

  const creditStatus = reviewItem ? 'pending' : 'approved'

  // Layer 1 cash scales with the inviter's lifetime paid conversions. We
  // already marked THIS referral 'converted' above, so this count includes
  // it — i.e. it's the inviter's Nth conversion, priced at the Nth rung. Must
  // stay in sync with LAYER1_CASH_LADDER, which the Dorm Wars hub renders as
  // "Cash per recruit (scales lifetime)". Unbounded (no date filter): the
  // ladder is a lifetime-count scale, distinct from the monthly-cap count above.
  const { count: lifetimeConversions } = await supabaseAdmin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('inviter_user_id', referral.inviter_user_id)
    .eq('status', 'converted')
  const baseCash = cashForLifetimeConversion(lifetimeConversions ?? 1)

  // Phase 8F — week-long doubler. If the inviter has an active doubler
  // chest outcome (rolled the 5% bucket in the last 7 days), Layer 1 cash
  // doubles. Source string carries the '_2x' suffix so ops analytics can
  // measure how much extra AED the doubler distributes.
  const doublerActive = await isDoublerActive(supabaseAdmin, referral.inviter_user_id)
  const { value: cashAmount, source: cashSource } = applyDoubler(baseCash, 'referral_conversion', doublerActive)

  const { error: creditErr } = await supabaseAdmin
    .from('credits')
    .insert({
      customer_id: referral.inviter_user_id,
      amount_aed:  cashAmount,
      source:      cashSource,
      referral_id: referral.id,
      status:      creditStatus,
    })
  if (creditErr) {
    console.error(`❌ Layer 1 credit insert failed for inviter ${referral.inviter_cid}:`, creditErr)
    const { notifyAdmin } = await import('@/infra/admin-alerts/notify')
    void notifyAdmin(
      `Referral Layer 1 credit INSERT FAILED for inviter ${referral.inviter_cid} (referral ${referral.id}). ` +
      `AED ${cashAmount} lost. Referral already marked converted — manual credit needed. Error: ${creditErr.message}`,
      referral.id.slice(0, 18),
    )
  }

  console.log(`✅ Credit AED ${cashAmount} → inviter ${referral.inviter_cid} (status: ${creditStatus}${doublerActive ? ', 2x doubler' : ''})`)

  // WhatsApp: tell the inviter their friend converted + how much they earned.
  if (!creditErr && creditStatus === 'approved') {
    const { data: invitee } = await supabaseAdmin
      .from('customers')
      .select('name')
      .eq('id', inviteeUserId)
      .maybeSingle()
    const inviteeName = (invitee?.name ?? '').trim().split(/\s+/)[0] || 'Your friend'
    try {
      await queueCustomerNotification(
        referral.inviter_user_id,
        'referral_converted',
        new Date(),
        { referral: inviteeName, credit_aed: String(cashAmount) },
      )
    } catch (err) {
      console.error('⚠️  referral_converted notification failed (non-fatal):', err)
    }
  }

  // Layer 2/3 reward fire — runs AFTER the Layer 1 credit insert so the
  // cycle/lifetime counts (which both filter on referrals.status='converted')
  // include the conversion we just recorded above.
  const activeSub = await fetchActiveSubForAwarder(supabaseAdmin, referral.inviter_user_id)
  await awardCycleAndTierRewards(referral.inviter_user_id, activeSub?.id ?? null)
}

// ── Helper: locate the inviter's currently-active subscription for cycle context ──
// Per Decision #9, no active sub → Layer 2 awarder no-ops; Layer 3 (07-04) still fires.
// Statuses chosen: Active | Paused | Skipped — these are the live cycle-bearing states.
// Scheduled is intentionally excluded — a not-yet-started sub has no cycle window.
//
// Param typed with explicit generics matching what the service-role admin
// client returns (`SupabaseClient<any, "public", "public", any, any>`). A bare
// `ReturnType<typeof createAdminSupabaseClient>` would narrow schema to `never` and
// reject the call site's wider client (TS overload-resolution oddity).
async function fetchActiveSubForAwarder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>,
  customerId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('customer_id', customerId)
    .in('status', ['Active', 'Paused', 'Skipped'])
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as { id: string } | null
}

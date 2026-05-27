import type { SupabaseClient } from '@supabase/supabase-js'

// ── Subscriptions queries — moved to contexts/subscriptions/domain/repo.ts ─
// Re-exported as a compatibility shim during the layered refactor (Phase 8).
// New consumers should import directly from @/contexts/subscriptions/domain/repo.
// Shim removed in Phase 11 cleanup.
export {
  getCustomer,
  getActiveSubscription,
  getQueuedSubscription,
  getAllSubscriptions,
  getMostRecentOrder,
} from '@/contexts/subscriptions/domain/repo'

// ── Referrals queries — moved to contexts/referrals/domain/repo.ts ───────
// Re-exported as a compatibility shim during the layered refactor (Phase 6).
// New consumers should import directly from @/contexts/referrals/domain/repo.
// Shim removed in Phase 11 cleanup.
export {
  getReferralData,
  getReferralCount,
  getRecentInvites,
  getCrossDormRecent,
  type ReferralData,
  type InviteRow,
  type CrossDormRecentSub,
} from '@/contexts/referrals/domain/repo'

// ── Dorm Wars: credit redemption helpers (Phase 7-02) ─────────────────────
// Shared between the checkout API route (compute coupon discount) and the
// checkout panel SSR page (display "AED X applied" before submit). Both call
// sites MUST read the same status filter ('approved' only — NOT 'pending')
// so the displayed amount and the actually-redeemed amount stay in lockstep.
//
// Note on `status`: the live `credits.status` CHECK constraint is
//   ('pending','approved','applied','rejected')
// The redemption flow flips 'approved' → 'applied' on webhook completion.
// Only 'approved' rows count toward the redeemable balance.
//
// TODO Phase 11: move to a context (referrals or subscriptions) once the
// owner is decided — credits are populated by both referrals and dorm-wars
// rewards but spent on subscription checkouts.

export interface RedeemableCreditRow {
  id:         string
  amount_aed: number
}

export interface RedeemableCredit {
  rows:        RedeemableCreditRow[]
  /** Sum of `amount_aed × 100`, rounded — i.e. the redeemable balance in fils. */
  balanceFils: number
}

/**
 * Returns approved credit rows + their summed balance in fils for redemption.
 * Accepts a caller-supplied Supabase client so it can run from API routes
 * (server client) or RSC pages (server client) without instantiating its own.
 *
 * Used by:
 *   • src/app/api/checkout/route.ts — compute coupon discount + record applied_credit_ids
 *   • src/app/dashboard/plan/page.tsx — pass creditBalanceAed prop to CheckoutPanel
 */
export async function getRedeemableCredit(
  sb: SupabaseClient,
  userId: string,
): Promise<RedeemableCredit> {
  const { data } = await sb
    .from('credits')
    .select('id, amount_aed')
    .eq('customer_id', userId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true })

  const rows: RedeemableCreditRow[] = (data ?? []).map(r => ({
    id:         r.id as string,
    amount_aed: Number(r.amount_aed),
  }))
  const balanceFils = rows.reduce(
    (sum, r) => sum + Math.round(r.amount_aed * 100),
    0,
  )
  return { rows, balanceFils }
}

// ── Dorm Wars queries — moved to contexts/dorm-wars/domain/repo.ts ────────
// Re-exported as a compatibility shim during the layered refactor.
// New consumers should import directly from @/contexts/dorm-wars/domain/repo.
// Shim removed in Phase 11 cleanup.
export {
  getActiveLifetimeTierPercent,
  getCycleRecruits,
  getCycleChainStart,
  getCycleChainSubIds,
  getStreakChestState,
  getRecentRewardEvents,
  getStreak,
  type StreakChestBucket,
  type ActiveDoubler,
  type StreakChestState,
  type RewardEvent,
} from '@/contexts/dorm-wars/domain/repo'

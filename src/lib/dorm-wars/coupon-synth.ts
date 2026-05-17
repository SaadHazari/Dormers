// ============================================================================
// Per-session Stripe Coupon synthesis for Dorm Wars credit redemption + tier %.
//
// Stripe Checkout Sessions accept exactly ONE coupon per session (verified via
// https://docs.stripe.com/payments/advanced/discounts). We can't stack a credit
// coupon + a lifetime-tier % coupon — so we synthesize a single fresh
// `amount_off` coupon per checkout that mathematically combines both effects.
//
// Order of operations (REVISED 2026-05-17 — see audit P0-12):
//   1. Apply lifetime-tier % to the gross plan total first:
//        `tierApplied = floor(amount * pct / 100)`
//   2. Apply credit to the remainder, capped at the post-tier amount:
//        `creditApplied = min(balance, amount - tierApplied)`
//   3. Total discount: `tierApplied + creditApplied`
//
// Why this order: applying credit first defeats the tier % whenever the
// credit balance already covers the plan (postCredit = 0 → tier × 0 = 0).
// A tier-4 user with a 5500 AED wallet buying a 5000 AED plan would lose
// the 10% lifetime perk entirely under the old "credit first" rule. With
// tier-first, the tier always lands (saving real cash even when credit
// covers the rest) and credit only fills what's still owed.
//
// Partial-row redemption: when balance > plan total, we walk credit rows in
// FIFO (created_at ASC) order. Rows that fully fit go in `appliedCreditIdsFull`
// — webhook flips them to status='applied'. If the cap falls mid-row, that
// boundary row becomes the `splitCredit`: webhook flips the original row AND
// inserts a fresh status='approved' row for the unused remainder so the user
// keeps the leftover. Without this, a 6800 AED balance against a 1024 AED plan
// would burn the whole 6800 instead of 1024.
//
// The coupon is single-use (`max_redemptions: 1`) and expires in 24 hours
// (`redeem_by`) so abandoned-checkout coupons auto-purge from Stripe (Pitfall #1).
// ============================================================================

import type Stripe from 'stripe'

export interface CreditRowForSynth {
  id: string
  /** AED amount (e.g. 196.00). Will be ×100 internally to fils. */
  amount_aed: number
}

export interface CouponSynthInput {
  /** Stripe instance from the caller — reuses the same `apiVersion` pin. */
  stripe: Stripe
  /** Customer's Supabase auth user id — stamped on coupon metadata for audit. */
  userId: string
  /** Plan total the user is paying, in fils (AED × 100). */
  amountFils: number
  /** Lifetime-tier discount: 0 (no tier), 5 (tier 1), or 10 (tier 2+). */
  tierPercent: 0 | 5 | 10
  /**
   * Approved credit rows in FIFO order (oldest first). The synth walks them
   * in order to compute which rows fully redeem vs which one splits.
   */
  creditRows: CreditRowForSynth[]
}

export interface CouponSynthResult {
  /** Stripe Coupon ID to attach via `discounts: [{ coupon: id }]`. Null = no discount. */
  couponId: string | null
  /** Total discount in fils (creditApplied + tierApplied). */
  discountFils: number
  /** Portion of discount attributable to credit redemption (cap-clamped). */
  creditAppliedFils: number
  /** Portion of discount attributable to lifetime-tier %. */
  tierAppliedFils: number
  /** Credit row IDs that should flip status='applied' wholesale on webhook. */
  appliedCreditIdsFull: string[]
  /**
   * Boundary credit row that should be flipped to 'applied' AND have a fresh
   * 'approved' row inserted for the unused remainder. Null when no split is
   * needed (cap aligned with row sum or balance fully consumed).
   */
  splitCredit: { id: string; useFils: number } | null
}

export async function synthesizePerSessionCoupon(
  input: CouponSynthInput,
): Promise<CouponSynthResult> {
  const { stripe, userId, amountFils, tierPercent, creditRows } = input

  // Tier discount FIRST against the gross plan total — this preserves the
  // lifetime perk even when credit covers the rest. See order-of-operations
  // comment above.
  const tierAppliedFils = Math.floor((amountFils * tierPercent) / 100)

  // Credit fills the remaining balance owed after the tier discount, capped
  // at the post-tier amount so the total discount never exceeds plan total
  // (REDEEM-03 — Stripe rejects coupon_amount_off_too_large).
  const balanceFils = creditRows.reduce(
    (s, r) => s + Math.round(r.amount_aed * 100),
    0,
  )
  const postTierFils      = amountFils - tierAppliedFils
  const creditAppliedFils = Math.min(balanceFils, postTierFils)

  // Walk credits FIFO and partition into full-redeem vs split.
  const appliedCreditIdsFull: string[] = []
  let splitCredit: { id: string; useFils: number } | null = null
  let consumedFils = 0
  for (const row of creditRows) {
    const rowFils = Math.round(row.amount_aed * 100)
    if (consumedFils + rowFils <= creditAppliedFils) {
      appliedCreditIdsFull.push(row.id)
      consumedFils += rowFils
      if (consumedFils === creditAppliedFils) break
    } else {
      // This row straddles the cap. Use only what's needed and split the rest.
      const useFils = creditAppliedFils - consumedFils
      if (useFils > 0) splitCredit = { id: row.id, useFils }
      break
    }
  }

  const discountFils = creditAppliedFils + tierAppliedFils

  // Stripe rejects zero-amount coupons. Short-circuit before the API call so
  // checkout for users with no balance + no tier stays a single Stripe round-trip.
  if (discountFils <= 0) {
    return {
      couponId: null,
      discountFils: 0,
      creditAppliedFils: 0,
      tierAppliedFils: 0,
      appliedCreditIdsFull: [],
      splitCredit: null,
    }
  }

  const coupon = await stripe.coupons.create({
    amount_off: discountFils,
    currency: 'aed',
    duration: 'once',
    max_redemptions: 1,
    // Auto-purge abandoned-checkout coupons after 24h (RESEARCH Pitfall #1).
    redeem_by: Math.floor(Date.now() / 1000) + 86400,
    // Stripe caps coupon name at 40 chars. Worst-case "Dorm Wars: 9999 AED + 10% off" = 29.
    name: tierPercent > 0 && creditAppliedFils > 0
      ? `Dorm Wars: ${creditAppliedFils / 100} AED + ${tierPercent}% off`
      : tierPercent > 0
      ? `Dorm Wars: ${tierPercent}% tier discount`
      : `Dorm Wars: ${creditAppliedFils / 100} AED credit`,
    metadata: {
      user_id: userId,
      credit_applied_fils: String(creditAppliedFils),
      tier_percent: String(tierPercent),
      tier_applied_fils: String(tierAppliedFils),
      applied_credit_ids: appliedCreditIdsFull.join(','),
      split_credit_id: splitCredit?.id ?? '',
      split_credit_use_fils: splitCredit ? String(splitCredit.useFils) : '0',
    },
  })

  return {
    couponId: coupon.id,
    discountFils,
    creditAppliedFils,
    tierAppliedFils,
    appliedCreditIdsFull,
    splitCredit,
  }
}

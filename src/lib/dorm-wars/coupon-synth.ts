// ============================================================================
// Per-session Stripe Coupon synthesis for Dorm Wars credit redemption + tier %.
//
// Stripe Checkout Sessions accept exactly ONE coupon per session (verified via
// https://docs.stripe.com/payments/advanced/discounts). We can't stack a credit
// coupon + a lifetime-tier % coupon — so we synthesize a single fresh
// `amount_off` coupon per checkout that mathematically combines both effects.
//
// Order of operations (matters — see RESEARCH Pitfall #4):
//   1. Apply credit, capped at the plan total: `creditApplied = min(balance, amount)`
//   2. Apply tier % to the post-credit remainder: `tierApplied = floor((amount - creditApplied) * pct / 100)`
//   3. Total discount: `creditApplied + tierApplied`
//
// The coupon is single-use (`max_redemptions: 1`) and expires in 24 hours
// (`redeem_by`) so abandoned-checkout coupons auto-purge from Stripe (Pitfall #1).
// ============================================================================

import type Stripe from 'stripe'

export interface CouponSynthInput {
  /** Stripe instance from the caller — reuses the same `apiVersion` pin. */
  stripe: Stripe
  /** Customer's Supabase auth user id — stamped on coupon metadata for audit. */
  userId: string
  /** Plan total the user is paying, in fils (AED × 100). */
  amountFils: number
  /** Sum of redeemable (status='approved') credit rows × 100, in fils. */
  creditBalanceFils: number
  /** Lifetime-tier discount: 0 (no tier), 5 (tier 1), or 10 (tier 2+). */
  tierPercent: 0 | 5 | 10
  /** Credit row IDs that will flip to status='applied' on webhook success. */
  appliedCreditIds: string[]
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
}

export async function synthesizePerSessionCoupon(
  input: CouponSynthInput,
): Promise<CouponSynthResult> {
  const {
    stripe,
    userId,
    amountFils,
    creditBalanceFils,
    tierPercent,
    appliedCreditIds,
  } = input

  // Credit applied = min(balance, plan total). Hard cap per REDEEM-03 — Stripe
  // rejects coupons larger than the session amount (`coupon_amount_off_too_large`).
  const creditAppliedFils = Math.min(creditBalanceFils, amountFils)

  // Tier discount applies to the post-credit remainder so the user gets the
  // full tier % off what they would otherwise pay, not off the gross amount.
  const postCreditFils = amountFils - creditAppliedFils
  const tierAppliedFils = Math.floor((postCreditFils * tierPercent) / 100)

  const discountFils = creditAppliedFils + tierAppliedFils

  // Stripe rejects zero-amount coupons. Short-circuit before the API call so
  // checkout for users with no balance + no tier stays a single Stripe round-trip.
  if (discountFils <= 0) {
    return {
      couponId: null,
      discountFils: 0,
      creditAppliedFils: 0,
      tierAppliedFils: 0,
    }
  }

  const coupon = await stripe.coupons.create({
    amount_off: discountFils,
    currency: 'aed',
    duration: 'once',
    max_redemptions: 1,
    // Auto-purge abandoned-checkout coupons after 24h (RESEARCH Pitfall #1).
    redeem_by: Math.floor(Date.now() / 1000) + 86400,
    name: `Dorm Wars rewards (${creditAppliedFils / 100} AED credit + ${tierPercent}% tier)`,
    metadata: {
      user_id: userId,
      credit_applied_fils: String(creditAppliedFils),
      tier_percent: String(tierPercent),
      tier_applied_fils: String(tierAppliedFils),
      applied_credit_ids: appliedCreditIds.join(','),
    },
  })

  return {
    couponId: coupon.id,
    discountFils,
    creditAppliedFils,
    tierAppliedFils,
  }
}

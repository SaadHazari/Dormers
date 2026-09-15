/**
 * What an order was actually paid with (season spec §10.1, D7): the card
 * charge and the wallet credit it really consumed. A season skip credit is
 * worth exactly (card charge + credit used) ÷ meals in the order, so the
 * webhook, free checkout and the backfill script must count credit the same
 * way; all three read the rows through loadCreditUsedFils
 * (src/infra/supabase/credit-usage-repo.ts), which sums them here. Pure.
 *
 * Credit consumed = every row redeemed in full + the used part of the one
 * boundary row that was split. The split row is flipped to 'applied' with its
 * ORIGINAL amount and the unused part is re-deposited as a new
 * `<source>_split_remainder` row, so summing credits by applied_to over-counts.
 */

export interface CreditRedemption {
  /** amount_aed of each row redeemed in full (PostgREST numerics may be strings). */
  fullRowAmountsAed: ReadonlyArray<number | string>
  /** Fils used from the split boundary row, or null when nothing was split. */
  splitUseFils: number | null
}

export function creditUsedFils(r: CreditRedemption): number {
  const full = r.fullRowAmountsAed.reduce<number>((sum, amount) => sum + Math.round(Number(amount) * 100), 0)
  return full + Math.max(0, r.splitUseFils ?? 0)
}

export interface OrderMoneyColumns {
  amount_paid_fils: number
  credit_applied_fils: number
}

/** The two orders columns, or null when the card charge is unknown (write nothing). */
export function orderMoneyColumns(input: { cardChargeFils: number | null | undefined; creditUsedFils: number }): OrderMoneyColumns | null {
  if (input.cardChargeFils == null) return null
  return {
    amount_paid_fils: Math.max(0, Math.round(input.cardChargeFils)),
    credit_applied_fils: Math.max(0, Math.round(input.creditUsedFils)),
  }
}

// ── Backfill decisions (scripts/backfill-order-money.ts) ────────────────

/** The redemption /api/checkout stamped on a Checkout Session. */
export function redemptionFromMetadata(metadata: Record<string, string> | null | undefined): {
  fullRowIds: string[]
  splitUseFils: number | null
  hasCreditMetadata: boolean
} {
  const m = metadata ?? {}
  const fullRowIds = (m.applied_credit_ids ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const split = Number(m.split_credit_use_fils ?? '0') || 0
  return {
    fullRowIds,
    splitUseFils: m.split_credit_id && split > 0 ? split : null,
    hasCreditMetadata: m.credit_applied_fils != null,
  }
}

export type OrderBackfillPlan =
  | { kind: 'skip'; reason: string }
  | { kind: 'unresolvable'; reason: string }
  | { kind: 'credit_only' }
  | { kind: 'stripe_live'; sessionId: string | null; paymentIntentId: string | null }

/**
 * Where an order's money can come from. Stripe runs in test mode for the
 * pilot and test payments are not money (decided 2026-09-15), so test-mode
 * and id-less card orders stay unresolved and use the 90% fallback.
 */
export function planOrderBackfill(order: {
  paymentMethod: string | null
  stripeSessionId: string | null
  stripePaymentId: string | null
  amountPaidFils: number | null
  creditAppliedFils: number | null
}): OrderBackfillPlan {
  if (order.amountPaidFils != null && order.creditAppliedFils != null) return { kind: 'skip', reason: 'already recorded' }
  const session = order.stripeSessionId ?? ''
  if (order.paymentMethod === 'credit' || session.startsWith('free:')) return { kind: 'credit_only' }
  if (session.startsWith('cs_test_')) return { kind: 'unresolvable', reason: 'Stripe test mode: test payments are not money' }
  if (session.startsWith('cs_live_')) return { kind: 'stripe_live', sessionId: session, paymentIntentId: order.stripePaymentId }
  if (order.stripePaymentId) return { kind: 'stripe_live', sessionId: null, paymentIntentId: order.stripePaymentId }
  return { kind: 'unresolvable', reason: 'no Stripe session or payment id' }
}

/**
 * A credit-only order: no card charge, and the credit its applied rows add up
 * to (loadCreditUsedFils). Null when a split remainder hides how much of a row
 * was used, or when the rows could not be read.
 */
export function creditOnlyMoney(input: {
  creditUsedFils: number | null
  splitRemainderNearby: boolean
}): OrderMoneyColumns | null {
  if (input.splitRemainderNearby || input.creditUsedFils == null) return null
  return orderMoneyColumns({ cardChargeFils: 0, creditUsedFils: input.creditUsedFils })
}

export function stripeOrderMoney(input: {
  amountReceivedFils: number | null
  sessionAmountTotalFils: number | null
  hasCreditMetadata: boolean
  /** From loadCreditUsedFils over the metadata's rows; only read when hasCreditMetadata. */
  creditUsedFils: number | null
  creditsAppliedToOrder: number
}): OrderMoneyColumns | { unresolvable: string } {
  // Refunds are never subtracted: they are handled by the refund flow.
  const card = input.amountReceivedFils ?? input.sessionAmountTotalFils
  if (card == null) return { unresolvable: 'Stripe has no amount for this order' }
  let credit = 0
  if (input.hasCreditMetadata) {
    if (input.creditUsedFils == null) return { unresolvable: 'the credit rows this order used could not be read' }
    credit = input.creditUsedFils
  } else if (input.creditsAppliedToOrder > 0) {
    return { unresolvable: 'credit was used but the session has no credit metadata' }
  }
  return orderMoneyColumns({ cardChargeFils: card, creditUsedFils: credit }) ?? { unresolvable: 'Stripe has no amount for this order' }
}

export function isLiveStripeKey(key: string | undefined): boolean {
  return !!key && /^(sk|rk)_live_/.test(key)
}

/**
 * True when an env file assigns STRIPE_LIVE_SECRET_KEY. npm run loads
 * .env.local into the process, so a live key written there would reach the
 * backfill without anyone passing it; the script refuses instead. Matches the
 * variable name only.
 */
export function envFileDefinesLiveKey(envFileText: string | null): boolean {
  if (!envFileText) return false
  return envFileText.split(/\r?\n/).some((line) => /^\s*(export\s+)?STRIPE_LIVE_SECRET_KEY\s*=/.test(line))
}

/**
 * A Stripe failure reduced to its type and code. The message is never used:
 * Stripe's invalid-key message repeats part of the key.
 */
export function stripeErrorSummary(err: unknown): string {
  const e = (err ?? {}) as { type?: unknown; code?: unknown }
  const type = typeof e.type === 'string' ? e.type : 'unknown'
  const code = typeof e.code === 'string' ? e.code : 'none'
  return `Stripe read failed (type ${type}, code ${code})`
}

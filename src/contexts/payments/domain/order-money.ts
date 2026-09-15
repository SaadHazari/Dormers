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

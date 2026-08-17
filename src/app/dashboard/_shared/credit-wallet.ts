/**
 * What the sidebar Credit Wallet shows.
 *
 * Pure so the money rules are testable without a DOM — this repo's vitest runs
 * in the node environment with no React Testing Library. Same reasoning as
 * intake-join-outcome.ts.
 *
 * `note` is not decoration. A credit the customer holds but cannot spend on
 * every plan has to say so wherever the balance appears, or the balance is a
 * promise the checkout will quietly break.
 */
export interface WalletSummary {
  totalAed: number
  /** Portion of the total that is restricted rather than freely spendable.
   *  Any row with a non-null `eligible_plan_ids` counts here — not just rows
   *  restricted to a monthly plan — so a credit restricted to some other
   *  plan can never be silently counted as freely spendable. Today every
   *  restriction in this system happens to be monthly-only, which is why the
   *  note below can still name the monthly plan specifically. */
  monthlyOnlyAed: number
  hasCredit: boolean
  note: string | null
}

export interface WalletRow {
  amount_aed: number
  eligible_plan_ids: string[] | null
}

export function walletSummary(rows: WalletRow[]): WalletSummary {
  let totalAed = 0
  let monthlyOnlyAed = 0

  for (const r of rows) {
    // PostgREST hands numerics back as strings; coerce or this concatenates.
    const amount = Number(r.amount_aed)
    totalAed += amount
    const ids = r.eligible_plan_ids
    // ANY non-null eligible_plan_ids is a restriction, not just one that
    // happens to list a monthly id — testing for the monthly id specifically
    // would let a future credit restricted to some non-monthly plan slip
    // through and get counted as freely spendable.
    if (ids != null) {
      monthlyOnlyAed += amount
    }
  }

  return {
    totalAed,
    monthlyOnlyAed,
    hasCredit: totalAed > 0,
    note: monthlyOnlyAed > 0 ? `AED ${monthlyOnlyAed} of this unlocks on a monthly plan.` : null,
  }
}

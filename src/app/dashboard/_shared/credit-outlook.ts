/**
 * What the credit chip says.
 *
 * Credit is never a balance the customer holds — it is a discount on their
 * NEXT purchase, and part of it may only fire if that purchase is a specific
 * plan. The chip therefore speaks future tense and shows exactly one
 * unconditional sentence:
 *
 *   • any universal credit  → "AED X off your next plan"
 *   • only restricted credit → "AED Y off your next monthly plan"
 *     (generic wording when the restriction is not the monthly plans)
 *   • nothing               → no chip at all
 *
 * Restricted credit is deliberately NOT blended into the universal number —
 * the plan cards and the Plan & billing statement carry that story, where
 * the condition can sit next to the amount. Pure for the same reason as
 * intake-join-outcome.ts: the money rules stay testable without a DOM.
 */

import { MONTHLY_PLAN_IDS } from '@/contexts/subscriptions/domain/credit-eligibility'

export interface CreditRow {
  amount_aed: number
  eligible_plan_ids: string[] | null
}

export interface CreditOutlook {
  /** Applies to any next plan. */
  universalAed: number
  /** Applies only to some plans — the sum across every restricted row. */
  restrictedAed: number
  /** True when every restricted row can unlock on a monthly plan. */
  restrictedIsMonthly: boolean
  hasCredit: boolean
  /** The one sentence the chip shows, or null to render nothing. */
  chip: { amountAed: number; sentence: string } | null
}

export function creditOutlook(rows: CreditRow[]): CreditOutlook {
  let universalAed = 0
  let restrictedAed = 0
  let restrictedRows = 0
  let monthlyRestrictedRows = 0

  for (const r of rows) {
    // PostgREST hands numerics back as strings; coerce or this concatenates.
    const amount = Number(r.amount_aed)
    // ANY non-null list is a restriction — an empty list applies to nothing,
    // which is the same rule creditAppliesToPlan enforces at checkout.
    if (r.eligible_plan_ids == null) {
      universalAed += amount
    } else {
      restrictedAed += amount
      restrictedRows += 1
      if (r.eligible_plan_ids.some(p => (MONTHLY_PLAN_IDS as readonly string[]).includes(p))) {
        monthlyRestrictedRows += 1
      }
    }
  }

  const restrictedIsMonthly = restrictedRows > 0 && monthlyRestrictedRows === restrictedRows
  const hasCredit = universalAed > 0 || restrictedAed > 0

  const chip =
    universalAed > 0
      ? { amountAed: universalAed, sentence: `AED ${universalAed} off your next plan` }
      : restrictedAed > 0
        ? {
            amountAed: restrictedAed,
            // "Monthly plan" capitalized as a plan-family name, matching the
            // owner-locked waitlist copy ("your next Monthly plan").
            sentence: restrictedIsMonthly
              ? `AED ${restrictedAed} off your next Monthly plan`
              : `AED ${restrictedAed} off select plans`,
          }
        : null

  return { universalAed, restrictedAed, restrictedIsMonthly, hasCredit, chip }
}

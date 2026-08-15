/**
 * Pure helpers shared by IntakePausedGate and PlanEndingPausedBanner for
 * turning a `joinIntakeWaitlist()` server-action result into what the UI
 * should show. Extracted so the money-correctness rules are unit-testable
 * without a DOM — this repo's vitest config runs in the `node` environment
 * with no React Testing Library, so a component render test isn't
 * available; these functions carry the actual logic instead of leaving it
 * inline in JSX, where it silently regressed once already (see the
 * seasonal-intake-pause final review, Critical 2: the UI ignored
 * `result.creditAed` / `result.message` and always rendered the
 * prospective `creditAed` PROP, which can promise money that was never
 * minted when the credit insert fails server-side).
 */

import type { JoinWaitlistResult } from '@/contexts/subscriptions/usecases/join-intake-waitlist'
import { SPOT_SAVED_NO_CREDIT_YET_MESSAGE } from '@/contexts/subscriptions/domain/credit-eligibility'

export interface JoinOutcome {
  /** Only true when the action reports ok:true — a failed tap must never
   *  flip the UI into the confirmed "you are on the list" state. */
  joined: boolean
  /** The ACTUAL minted amount from the action's own response. Null when
   *  the tap failed outright (nothing to display for confirmed state). */
  creditAed: number | null
  /** The action's own message — always used verbatim over any prop-derived
   *  copy once a result exists. */
  message: string | null
  /** Set on ok:false so the caller can surface it and re-enable the button.
   *  A failed tap must never resolve to silence. */
  error: string | null
}

/**
 * Turn a `joinIntakeWaitlist()` result into UI state. The critical rule:
 * every field comes from `result`, never from the caller's prospective
 * `creditAed` prop — that prop is a promise computed from the CURRENT
 * intake_settings row, not a balance.
 */
export function deriveJoinOutcome(result: JoinWaitlistResult): JoinOutcome {
  if (result.ok) {
    return { joined: true, creditAed: result.creditAed, message: result.message, error: null }
  }
  return { joined: false, creditAed: null, message: null, error: result.message }
}

export interface IntakeCreditDisplay {
  /** true = render "AED {creditAed} is waiting…"; false = render `text` as
   *  plain reassurance copy instead — a customer must never be told an
   *  amount is waiting when the real balance is zero. */
  hasCredit: boolean
  creditAed: number
  text: string
}

/**
 * What the CONFIRMED (already-joined) state should show. `creditAed` here
 * must always be an ACTUAL minted amount — either the server-computed
 * ledger value (IntakeGateState.waitlistCreditAed, for a customer who was
 * already joined before this render) or a fresh join result's own
 * `creditAed` (for a customer who just tapped). Never the prospective
 * per-preference amount, which can differ from what was actually minted if
 * an admin changed the credit amounts after this customer joined, or can be
 * flatly wrong if the mint failed and nothing was minted at all.
 */
export function intakeCreditDisplay(creditAed: number, message: string | null): IntakeCreditDisplay {
  if (creditAed > 0) {
    return { hasCredit: true, creditAed, text: `AED ${creditAed} is waiting in your account` }
  }
  return { hasCredit: false, creditAed: 0, text: message ?? SPOT_SAVED_NO_CREDIT_YET_MESSAGE }
}

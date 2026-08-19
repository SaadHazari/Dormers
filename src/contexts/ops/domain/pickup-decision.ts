// src/contexts/ops/domain/pickup-decision.ts
// Whether a pickup photo is allowed to open the rider's day.
//
// Owner decision (2026-08-19), reversing the earlier advisory-only rule: if
// the photo does not show the right number of boxes, the rider is asked to
// shoot it again rather than waved through. The kitchen is not a doorstep —
// a missing box there is fixable in thirty seconds, so the check is worth
// stopping for.
//
// The one thing this must never do is strand the run. A photo of a stack is
// the least reliable count in the system, so an AI that simply cannot see six
// boxes must not be able to cancel a day of deliveries. Hence a bounded
// budget: retake, retake, and on the last attempt the rider passes only by
// personally asserting the count, which is recorded and alerted.
//
// Zero imports — pure domain per L1-BOUNDARIES.

export const MAX_PICKUP_ATTEMPTS = 3

export type PickupOutcome =
  | 'accepted'         // rider and photo both agree with the manifest
  | 'rider_disagrees'  // the RIDER's own count is not the manifest count
  | 'retake'           // photo count is off, budget remains — shoot it again
  | 'needs_assertion'  // budget spent, rider must personally vouch for the count
  | 'uncountable'      // AI could not read the photo at all on the last attempt

export interface PickupInput {
  expectedTotal: number
  /**
   * What the rider counted with his own eyes. Added 2026-08-19: until then
   * the ONLY number checked against the manifest at pickup was a machine
   * guess, and the machine approved five boxes as six. A person typing 5 is
   * worth more than any vision model, and it costs one field.
   */
  riderCount: number
  geminiCount: number | null
  /** 1-based, read from the server row so a reload cannot reset it. */
  attempt: number
  /** The rider tapped the confirm-by-hand button. */
  riderAsserted: boolean
}

export interface PickupDecision {
  outcome: PickupOutcome
  /** Open the rider's day. */
  accepted: boolean
  /** All three counts agreed on their own, with no human override. */
  matched: boolean
  /** Tell the owner. */
  alert: boolean
  /** Offer the confirm-by-hand button. */
  allowAssert: boolean
  attemptsLeft: number
}

export function decidePickup(input: PickupInput): PickupDecision {
  const isLastAttempt = input.attempt >= MAX_PICKUP_ATTEMPTS
  const attemptsLeft = Math.max(0, MAX_PICKUP_ATTEMPTS - input.attempt)

  // The rider vouching for the count outranks the camera. Recorded and
  // alerted, never silent — this is the only way past a disagreement.
  if (input.riderAsserted) {
    return { outcome: 'accepted', accepted: true, matched: false, alert: true, allowAssert: false, attemptsLeft }
  }

  // ── The rider's own count disagrees with the manifest ───────────────────
  // Checked BEFORE the photo, because this is the stronger signal and it has
  // a different remedy. A better photo cannot conjure a missing box. Either
  // he mistyped, or the van really is short — and if it is short, one tap
  // should tell the owner rather than three more photos. So no budget is
  // spent here and the confirm-by-hand path is offered immediately.
  if (input.riderCount !== input.expectedTotal) {
    return {
      outcome: 'rider_disagrees',
      accepted: false, matched: false, alert: false, allowAssert: true, attemptsLeft,
    }
  }

  // ── Rider agrees with the manifest; now the photo is the third voice ────
  if (input.geminiCount !== null && input.geminiCount === input.expectedTotal) {
    return { outcome: 'accepted', accepted: true, matched: true, alert: false, allowAssert: false, attemptsLeft }
  }

  // AI returned nothing usable. Same budget as a wrong count: ask again, and
  // on the last attempt fall through to the rider's own word rather than
  // holding the whole run hostage to an unreadable photo.
  if (input.geminiCount === null) {
    return isLastAttempt
      ? { outcome: 'uncountable', accepted: false, matched: false, alert: true, allowAssert: true, attemptsLeft: 0 }
      : { outcome: 'retake', accepted: false, matched: false, alert: false, allowAssert: false, attemptsLeft }
  }

  // The photo disagrees with two humans who agree with each other.
  return isLastAttempt
    ? { outcome: 'needs_assertion', accepted: false, matched: false, alert: true, allowAssert: true, attemptsLeft: 0 }
    : { outcome: 'retake', accepted: false, matched: false, alert: false, allowAssert: false, attemptsLeft }
}

/** Storage key for one pickup attempt. Distinct per attempt so nothing is overwritten. */
export function pickupPhotoPath(dateIso: string, attempt: number): string {
  return `${dateIso}/_pickup/pickup-a${attempt}.jpg`
}

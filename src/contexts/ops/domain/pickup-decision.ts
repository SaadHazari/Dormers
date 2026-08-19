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
  | 'accepted'        // photo agrees with the expected count
  | 'retake'          // count is off, budget remains — shoot it again
  | 'needs_assertion' // budget spent, rider must personally vouch for the count
  | 'uncountable'     // AI could not read the photo at all on the last attempt

export interface PickupInput {
  expectedTotal: number
  geminiCount: number | null
  /** 1-based, read from the server row so a reload cannot reset it. */
  attempt: number
  /** The rider tapped "all N boxes are in the van" on the final attempt. */
  riderAsserted: boolean
}

export interface PickupDecision {
  outcome: PickupOutcome
  /** Open the rider's day. */
  accepted: boolean
  /** Counts agreed on their own, with no human override. */
  matched: boolean
  /** Tell the owner. */
  alert: boolean
  attemptsLeft: number
}

export function decidePickup(input: PickupInput): PickupDecision {
  const isLastAttempt = input.attempt >= MAX_PICKUP_ATTEMPTS
  const attemptsLeft = Math.max(0, MAX_PICKUP_ATTEMPTS - input.attempt)

  // The rider vouching for the count outranks the camera. Recorded and
  // alerted, never silent — this is the only way past a disagreeing photo.
  if (input.riderAsserted) {
    return { outcome: 'accepted', accepted: true, matched: false, alert: true, attemptsLeft }
  }

  // Counts agree — the normal path, no alert, day opens.
  if (input.geminiCount !== null && input.geminiCount === input.expectedTotal) {
    return { outcome: 'accepted', accepted: true, matched: true, alert: false, attemptsLeft }
  }

  // AI returned nothing usable. Same budget as a wrong count: ask again, and
  // on the last attempt fall through to the rider's own word rather than
  // holding the whole run hostage to an unreadable photo.
  if (input.geminiCount === null) {
    return isLastAttempt
      ? { outcome: 'uncountable', accepted: false, matched: false, alert: true, attemptsLeft: 0 }
      : { outcome: 'retake', accepted: false, matched: false, alert: false, attemptsLeft }
  }

  // Wrong number of boxes.
  return isLastAttempt
    ? { outcome: 'needs_assertion', accepted: false, matched: false, alert: true, attemptsLeft: 0 }
    : { outcome: 'retake', accepted: false, matched: false, alert: false, attemptsLeft }
}

/** Storage key for one pickup attempt. Distinct per attempt so nothing is overwritten. */
export function pickupPhotoPath(dateIso: string, attempt: number): string {
  return `${dateIso}/_pickup/pickup-a${attempt}.jpg`
}

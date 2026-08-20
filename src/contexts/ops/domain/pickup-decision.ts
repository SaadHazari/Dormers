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
  /** What subscriptions imply should go out today. */
  expectedTotal: number
  /**
   * What the kitchen said it actually packed, if the packing check was done.
   * This OUTRANKS expectedTotal as the number the rider must match: the
   * kitchen is the count of record, and a legitimate late addition shows up
   * here before it shows up in the subscription maths. A kitchen-vs-system
   * disagreement is already flagged at the kitchen step, not re-litigated here.
   */
  kitchenTotal: number | null
  /**
   * What the rider counted with his own eyes. Added 2026-08-19: until then
   * the ONLY number checked against the manifest at pickup was a machine
   * guess, and the machine approved five boxes as six. A person typing 5 is
   * worth more than any vision model, and it costs one field.
   *
   * It only counts for anything if he types it BLIND. The first build showed
   * him "Total: 6 boxes" directly above the input, which made his 6 a reading
   * of our number rather than a count of the van — the same anchoring bug we
   * had just removed from the AI prompt. The rider app now hides every total
   * until this has been submitted.
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

/** The number the rider is measured against. Kitchen first, system as fallback. */
export function pickupTarget(input: Pick<PickupInput, 'expectedTotal' | 'kitchenTotal'>): number {
  return input.kitchenTotal ?? input.expectedTotal
}

export function decidePickup(input: PickupInput): PickupDecision {
  const isLastAttempt = input.attempt >= MAX_PICKUP_ATTEMPTS
  const attemptsLeft = Math.max(0, MAX_PICKUP_ATTEMPTS - input.attempt)
  const target = pickupTarget(input)

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
  if (input.riderCount !== target) {
    return {
      outcome: 'rider_disagrees',
      accepted: false, matched: false, alert: false, allowAssert: true, attemptsLeft,
    }
  }

  // ── Rider agrees with the manifest; now the photo is the third voice ────
  if (input.geminiCount !== null && input.geminiCount === target) {
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

// src/contexts/ops/domain/dropoff-decision.ts
// What happens when a rider submits a drop-off photo.
//
// Two facts come out of a drop-off and they are NOT the same fact:
//
//   delivered — the food is at the dorm. This is what releases the customer
//               WhatsApps. A disputed count must never silence a whole dorm;
//               the students got their food either way.
//   verified  — expected, rider and AI counts all agree. This is the audit
//               fact. Only a clean triple match sets it, and nothing the
//               rider can do turns a flagged drop-off back into a clean one.
//
// The rider gets a budget of MAX_VERIFY_ATTEMPTS photos per dorm. A retake
// lets them ADD evidence (a second angle on a stack), which is the honest way
// to settle a miscount. It never lets them erase the first alert: every
// attempt is stored, and the owner is pinged on each flagged one.
//
// Zero imports — pure domain per L1-BOUNDARIES.

export const MAX_VERIFY_ATTEMPTS = 2

export type DropoffOutcome =
  | 'verified'         // triple match
  | 'retake'           // photo unreadable, budget remains
  | 'unclear_final'    // photo unreadable on the last attempt
  | 'mismatch_retake'  // counts disagree, owner flagged, one more photo allowed
  | 'mismatch_final'   // counts still disagree on the last attempt
  | 'manual'           // the counter itself failed, so the rider decides

export type DropoffPreflight = 'ok' | 'already_verified' | 'locked'

export interface DropoffInput {
  expectedCount: number
  riderCount: number
  geminiCount: number | null
  imageQuality: 'clear' | 'unclear'
  confidence: 'high' | 'medium' | 'low'
  /** 1-based, read from the server row so a PWA reload cannot reset it. */
  attempt: number
}

export interface DropoffDecision {
  outcome: DropoffOutcome
  /** Counts agree. Audit fact — the rider can never set this by retrying. */
  verified: boolean
  /** Food is at the dorm. Releases the customer WhatsApp fanout. */
  delivered: boolean
  /** Ping the owner: unresolved count dispute. */
  escalate: boolean
  /** The rider may submit one more photo for this dorm. */
  allowRetake: boolean
  attemptsLeft: number
}

/**
 * Decide before spending a Gemini call and a photo upload.
 *
 * `locked` still leaves the rider a way out: the caller offers manual confirm
 * when the drop-off has no delivered stamp yet, so a stranded rider can always
 * record that the food arrived. What they can never do is clear the flag.
 */
export function preflightDropoff(row: {
  verified: boolean
  verifyAttempts: number
}): DropoffPreflight {
  if (row.verified) return 'already_verified'
  if (row.verifyAttempts >= MAX_VERIFY_ATTEMPTS) return 'locked'
  return 'ok'
}

export function decideDropoff(input: DropoffInput): DropoffDecision {
  const isLastAttempt = input.attempt >= MAX_VERIFY_ATTEMPTS
  const attemptsLeft = Math.max(0, MAX_VERIFY_ATTEMPTS - input.attempt)

  // ── A. Photo unreadable ────────────────────────────────────────────────
  // Not a count dispute, just a bad picture. Ask for another one while the
  // budget lasts. On the last attempt the owner takes it over — and the dorm
  // still counts as delivered, because a dark photo is not evidence that the
  // food is missing.
  const unreadable =
    input.imageQuality === 'unclear' ||
    (input.confidence === 'low' && input.geminiCount === null)

  if (unreadable) {
    return isLastAttempt
      ? { outcome: 'unclear_final', verified: false, delivered: true, escalate: true, allowRetake: false, attemptsLeft: 0 }
      : { outcome: 'retake', verified: false, delivered: false, escalate: false, allowRetake: true, attemptsLeft }
  }

  // ── B. The counter itself failed ───────────────────────────────────────
  // Gemini timed out or returned nothing usable. There is no evidence either
  // way, so the rider's word stands — but never automatically (VER-11).
  if (input.geminiCount === null) {
    return { outcome: 'manual', verified: false, delivered: false, escalate: false, allowRetake: false, attemptsLeft }
  }

  // ── C. Triple match ────────────────────────────────────────────────────
  const isMatch =
    input.expectedCount === input.riderCount &&
    input.riderCount === input.geminiCount
  if (isMatch) {
    return { outcome: 'verified', verified: true, delivered: true, escalate: false, allowRetake: false, attemptsLeft: 0 }
  }

  // ── D. Counts disagree ─────────────────────────────────────────────────
  // The owner is told immediately, every time, and the food is recorded as
  // delivered so the dorm is not left in silence over an arithmetic dispute.
  return isLastAttempt
    ? { outcome: 'mismatch_final', verified: false, delivered: true, escalate: true, allowRetake: false, attemptsLeft: 0 }
    : { outcome: 'mismatch_retake', verified: false, delivered: true, escalate: true, allowRetake: true, attemptsLeft }
}

/** Storage key for one attempt. Distinct per attempt so nothing is overwritten. */
export function attemptPhotoPath(
  deliveryDateIso: string,
  dormSlug: string,
  tripNumber: number,
  attempt: number,
): string {
  return `${deliveryDateIso}/${dormSlug}/trip-${tripNumber}-a${attempt}.jpg`
}

// ─── Big drop-offs: stacks at the door ──────────────────────────────────────
//
// One photo is trustworthy up to two doorstep stacks of five side by side.
// Beyond that the rider has to stand so far back that box edges stop being
// readable — so above the threshold the drop-off borrows the pickup's trick:
// one close photo per stack (box counting) plus one wide shot (stack counting
// ONLY), submitted together as ONE attempt of the same two-attempt budget.
// The far photo is never asked to count boxes, so distance cannot corrupt
// the count; the server does the addition. Owner's numbers, 2026-08-20.

/** A drop-off above this many boxes must be photographed stack by stack. */
export const DROPOFF_STACK_THRESHOLD = 10

/** Boxes per doorstep stack the rider is asked not to exceed. Lower than the
 *  pickup's pile limit: a kitchen pile lies on the floor, a doorstep stack
 *  stands five high before it stops being stable or readable. */
export const MAX_BOXES_PER_DROPOFF_STACK = 5

/** Storage key for one stack photo of a drop-off attempt, or the wide shot
 *  when stackIndex is null. Distinct per attempt and per stack. */
export function dropoffStackPhotoPath(
  deliveryDateIso: string,
  dormSlug: string,
  tripNumber: number,
  attempt: number,
  stackIndex: number | null,
): string {
  return stackIndex === null
    ? `${deliveryDateIso}/${dormSlug}/trip-${tripNumber}-a${attempt}-wide.jpg`
    : `${deliveryDateIso}/${dormSlug}/trip-${tripNumber}-a${attempt}-s${stackIndex}.jpg`
}

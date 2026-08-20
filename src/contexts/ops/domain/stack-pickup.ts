// src/contexts/ops/domain/stack-pickup.ts
// Counting a big pickup by stacks instead of in one frame.
//
// Why this exists: one photo of thirty boxes cannot be counted by anything,
// because boxes hide behind other boxes and no model can see through cardboard.
// Splitting the load into stacks turns one impossible count into several easy
// ones — but only if the photos never overlap. Two angles of the SAME pile is
// the wrong idea: it asks the model to work out which box in photo A is which
// box in photo B, which is a harder problem than the counting was.
//
// So the two kinds of photo answer DIFFERENT questions, and that is the whole
// trick:
//   - each stack photo answers "how many boxes in THIS stack"
//   - the overview answers "how many stacks are there", NOT how many boxes
//
// The total is the sum of the stack photos. The overview exists purely to
// prove none were forgotten or shot twice. Nothing is ever counted in two
// places, so nothing can be double counted.
//
// Zero imports — pure domain per L1-BOUNDARIES.

/**
 * Above this many boxes, one flat layout stops being photographable and the
 * rider is asked to split the load.
 *
 * Set to 10 by the owner on 2026-08-20 after testing on real boxes, replacing
 * the 8 I had guessed. A load of 10 or fewer stays a single photo.
 */
export const STACK_MODE_THRESHOLD = 10

/**
 * Boxes per pile the rider is asked not to exceed.
 *
 * Deliberately the same number as the threshold: a pile photo is just a photo
 * of N boxes, so whatever one frame can handle is also what one pile can be.
 * If these two ever drift apart, the app is telling him to build piles it does
 * not trust itself to count.
 */
export const MAX_BOXES_PER_STACK = STACK_MODE_THRESHOLD

export type StackOutcome =
  | 'accepted'
  | 'stack_unreadable'    // at least one stack photo could not be counted
  | 'stack_missing'       // the overview shows more stacks than were photographed
  | 'stack_extra'         // more stack photos than the overview shows stacks
  | 'overview_unreadable' // could not tell how many stacks there are
  | 'total_mismatch'      // the stacks add up, but not to the number expected

export interface StackReconcileInput {
  /** Kitchen count if there is one, otherwise the subscription estimate. */
  target: number
  /** One entry per stack photo, in the order taken. null = model refused. */
  stackCounts: (number | null)[]
  /** How many STACKS the overview photo showed. null = model refused. */
  overviewStackCount: number | null
}

export interface StackReconcile {
  outcome: StackOutcome
  /** Sum of the stack photos, or null while any stack is uncounted. */
  total: number | null
  /** 1-based indexes of stacks that need reshooting. */
  unreadableStacks: number[]
  accepted: boolean
}

export function reconcileStacks(input: StackReconcileInput): StackReconcile {
  const unreadableStacks = input.stackCounts
    .map((c, i) => (c === null ? i + 1 : 0))
    .filter(Boolean)

  // A refused stack is the safe failure: reshoot that one stack, not the load.
  if (unreadableStacks.length > 0) {
    return { outcome: 'stack_unreadable', total: null, unreadableStacks, accepted: false }
  }

  const total = (input.stackCounts as number[]).reduce((a, b) => a + b, 0)

  if (input.overviewStackCount === null) {
    return { outcome: 'overview_unreadable', total, unreadableStacks: [], accepted: false }
  }

  // The overview's only job. Photograph a stack twice and this catches it;
  // forget one and this catches that too.
  if (input.overviewStackCount > input.stackCounts.length) {
    return { outcome: 'stack_missing', total, unreadableStacks: [], accepted: false }
  }
  if (input.overviewStackCount < input.stackCounts.length) {
    return { outcome: 'stack_extra', total, unreadableStacks: [], accepted: false }
  }

  if (total !== input.target) {
    return { outcome: 'total_mismatch', total, unreadableStacks: [], accepted: false }
  }

  return { outcome: 'accepted', total, unreadableStacks: [], accepted: true }
}

/** Whether a load of this size should be split into stacks at all. */
export function needsStackMode(riderCount: number): boolean {
  return riderCount > STACK_MODE_THRESHOLD
}

/** Storage key for one stack photo, or the overview when index is null. */
export function stackPhotoPath(
  dateIso: string,
  stackIndex: number | null,
  attempt: number,
): string {
  return stackIndex === null
    ? `${dateIso}/_pickup/overview-a${attempt}.jpg`
    : `${dateIso}/_pickup/stack-${stackIndex}-a${attempt}.jpg`
}

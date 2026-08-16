/**
 * Which controls the seasonal takeover shows.
 *
 * Pure because this repo's vitest runs in the node environment with no React
 * Testing Library, so the only way to test takeover behaviour is to keep the
 * rules out of JSX. Same reasoning as intake-join-outcome.ts.
 *
 * The rule that matters: whenever a join is offered, a decline is offered
 * beside it. A takeover that can only be accepted is a trap, so the dismiss
 * is never removed, only reworded.
 */
export interface PauseTakeoverCta {
  showJoin: boolean
  joinLabel: string
  dismissLabel: string
}

export function pauseTakeoverCta(input: {
  variant: 'pausing' | 'reopened'
  alreadyJoined: boolean
  justJoined: boolean
}): PauseTakeoverCta {
  if (input.variant === 'reopened') {
    return { showJoin: false, joinLabel: '', dismissLabel: 'See your plan options' }
  }
  if (input.alreadyJoined || input.justJoined) {
    return { showJoin: false, joinLabel: '', dismissLabel: 'Got it' }
  }
  return { showJoin: true, joinLabel: 'Save my spot', dismissLabel: 'Not now' }
}

/**
 * Which controls the seasonal takeover shows.
 *
 * Pure because this repo's vitest runs in the node environment with no React
 * Testing Library, so the only way to test takeover behaviour is to keep the
 * rules out of JSX. Same reasoning as intake-join-outcome.ts.
 *
 * The rule that matters: whenever a join is offered, a decline is offered
 * beside it. A takeover that can only be accepted is a trap, so the dismiss
 * is never removed, only reworded. The reopened variant's dismiss doubles as
 * a navigation to the plan page, so it carries a second, stay-put close —
 * a screen whose only exit moves you somewhere else is a softer trap, but
 * still a trap.
 */
export interface PauseTakeoverCta {
  showJoin: boolean
  joinLabel: string
  dismissLabel: string
  /** Quiet close that marks the takeover seen without leaving the page. */
  showLater: boolean
  laterLabel: string
}

export function pauseTakeoverCta(input: {
  variant: 'pausing' | 'reopened'
  alreadyJoined: boolean
  justJoined: boolean
}): PauseTakeoverCta {
  if (input.variant === 'reopened') {
    return { showJoin: false, joinLabel: '', dismissLabel: 'See your plan options', showLater: true, laterLabel: 'Maybe later' }
  }
  if (input.alreadyJoined || input.justJoined) {
    return { showJoin: false, joinLabel: '', dismissLabel: 'Got it', showLater: false, laterLabel: '' }
  }
  return { showJoin: true, joinLabel: 'Save my spot', dismissLabel: 'Not now', showLater: false, laterLabel: '' }
}

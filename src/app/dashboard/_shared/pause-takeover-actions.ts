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
import { prettySeasonDate } from '@/contexts/subscriptions/domain/season-horizon'
import { REOPEN_MESSAGE_PROMISE } from './intake-join-outcome'

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

export interface PausingTakeoverCopy {
  headline: string
  body: string
  /** REOPEN_MESSAGE_PROMISE verbatim. Rendered as its own emphasized block,
   *  never folded into `body` — the promise is the release condition for the
   *  whole pause and must not read as a body-text aside. */
  promise: string
}

/**
 * The pausing takeover's message (owner-directed rewrite, 2026-08-19).
 *
 * The original headline was "Your plan is safe." — reassurance-first. That
 * framing instantiates the threat it denies: a customer who opened the app
 * to check today's meal has no pause in their head until a full-screen
 * "safe" implies one. The rewrite affirms continuity instead of denying
 * danger: headline answers the question they arrived with (is my food
 * coming?), body names the event and makes it concrete with THEIR last
 * delivery day, and the reopen promise stands alone above the buttons.
 *
 * `lastDeliveryDay` is the customer's own subscription end date, not the
 * season's `pause_scheduled_for` — overhang plans run past the season date
 * by design, and the date shown must be the one their food actually rides
 * to. Null (defensive; the takeover only mounts with a live sub) drops the
 * clause rather than inventing a date.
 */
export function pausingTakeoverCopy(lastDeliveryDay: string | null): PausingTakeoverCopy {
  const dateClause = lastDeliveryDay ? `, through ${prettySeasonDate(lastDeliveryDay)}` : ''
  return {
    headline: 'Your meals keep coming.',
    body: `We are between semesters, so new plan purchases are paused. Every delivery you have paid for arrives as scheduled${dateClause}.`,
    promise: REOPEN_MESSAGE_PROMISE,
  }
}

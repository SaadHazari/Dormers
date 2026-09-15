/**
 * Customer words for the season end on the dashboard (spec N1, N3, §7.3).
 * Pure so the copy is testable in vitest's node environment, and so no hold
 * or refund is ever promised before the break exists (SEASON_BREAK_RELEASE_LIVE).
 */

import { formatShortDay } from '@/contexts/season/domain/season-dates'
import { formatAed } from '@/contexts/season/domain/meal-value'
import type { SeasonNoticeKind } from '@/contexts/season/domain/customer-season'

/** The quiet chip left on home once the notice is dismissed. */
export function seasonChipLabel(wrapUpDay: string): string {
  return `Semester wraps up ${formatShortDay(wrapUpDay)}`
}

/**
 * The line every pause sheet adds while the season winds down (spec §7.3).
 * The promise that the plan waits only appears once the break is live; before
 * that a pause past the wrap-up day simply carries on, so it is not said.
 */
export function seasonPauseLine(wrapUpDay: string, breakLive: boolean): string {
  const wraps = `The semester wraps up on ${formatShortDay(wrapUpDay)}.`
  return breakLive ? `${wraps} If you're still paused then, your plan waits for you until we're back.` : wraps
}

export interface SeasonNoticeCopy {
  headline: string
  body: string
}

/** N1 (plans that finish) and N3 (customer pause), spec §12.2. */
export function seasonNoticeCopy(input: { kind: SeasonNoticeKind; wrapUpDay: string; lastDinner: string | null; breakLive: boolean }): SeasonNoticeCopy {
  const wrapUp = formatShortDay(input.wrapUpDay)
  if (input.kind === 'finishes') {
    const through = input.lastDinner ? `, through ${formatShortDay(input.lastDinner)}` : ''
    return {
      headline: 'Your meals keep coming.',
      body: `Every delivery you've paid for arrives${through}. The semester wraps up on ${wrapUp}.`,
    }
  }
  return {
    headline: `The semester wraps up on ${wrapUp}.`,
    body: input.breakLive ? "Still paused then? Your plan waits for you until we're back." : 'Your plan stays paused until you resume it.',
  }
}

/** Once per season and wrap-up day: moving W shows the notice again. */
export function seasonNoticeSeenKey(cycleStartedAt: string | null, wrapUpDay: string): string {
  return `dormers:season-notice-ack:${cycleStartedAt ?? 'none'}:${wrapUpDay}`
}

export function seasonJoinLine(creditAed: number): string | null {
  return creditAed > 0 ? `Save your spot for next semester and ${formatAed(Math.round(creditAed * 100))} goes to your wallet.` : null
}

/**
 * Customer words for the season end on the dashboard (spec N1, N3, §7.3).
 * Pure so the copy is testable in vitest's node environment, and so no hold
 * or refund is ever promised before the break exists (SEASON_BREAK_RELEASE_LIVE).
 */

import { formatShortDay } from '@/contexts/season/domain/season-dates'

/** The quiet chip left on home once the notice is dismissed. */
export function seasonChipLabel(wrapUpDay: string): string {
  return `Semester wraps up ${formatShortDay(wrapUpDay)}`
}

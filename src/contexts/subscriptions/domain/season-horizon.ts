/**
 * Season-horizon domain — pure checks for whether a plan journey fits
 * before a season's last delivery day. Used by scheduled-pause-with-taper
 * to decide whether a new/resumed subscription can still run to completion
 * before the season ends.
 *
 * Pure and client-importable: only imports from ./end-date and ./plans, no
 * server-only modules, no process.env.
 */

import { computeEndDate, isoDate, type WeekType } from './end-date'
import { planKindOf, type PlanId } from './plans'

export interface JourneyFitsInput {
  planId: PlanId
  weekType: WeekType
  /** ISO date (YYYY-MM-DD) the journey would start on. */
  startDate: string
  /** ISO date (YYYY-MM-DD) of the season's last delivery day. */
  lastDeliveryDay: string
}

/**
 * True when a journey starting on `startDate` projects to end on or before
 * `lastDeliveryDay`. ISO date strings compare lexicographically, so no date
 * parsing is needed for the comparison itself.
 */
export function journeyFits(input: JourneyFitsInput): boolean {
  const end = computeEndDate({
    startDate: input.startDate,
    planKind: planKindOf(input.planId),
    weekType: input.weekType,
    skipCount: 0,
    pauseDays: 0,
  })
  return isoDate(end) <= input.lastDeliveryDay
}

export interface LatestViableStartInput {
  planId: PlanId
  weekType: WeekType
  /** ISO date (YYYY-MM-DD) — earliest allowed start of the window. */
  minStart: string
  /** ISO date (YYYY-MM-DD) — latest allowed start of the window. */
  maxStart: string
  /** ISO date (YYYY-MM-DD) of the season's last delivery day. */
  lastDeliveryDay: string
}

/**
 * The latest ISO date in `[minStart, maxStart]` whose journey fits before
 * `lastDeliveryDay`, or null when none does (the plan is done for the
 * term). Scans backward from `maxStart` — the window is at most ~32 days
 * for this feature's callers, so a linear scan is fine.
 */
export function latestViableStart(input: LatestViableStartInput): string | null {
  if (input.minStart > input.maxStart) return null

  const cursor = new Date(`${input.maxStart}T00:00:00Z`)
  const floor = new Date(`${input.minStart}T00:00:00Z`)

  while (cursor >= floor) {
    const candidate = isoDate(cursor)
    if (journeyFits({ planId: input.planId, weekType: input.weekType, startDate: candidate, lastDeliveryDay: input.lastDeliveryDay })) {
      return candidate
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return null
}

/**
 * Asia/Dubai calendar-day helpers — pure functions shared across contexts.
 *
 * Dubai is UTC+4 with NO daylight saving, which is what makes these helpers
 * trivially safe: every AE wall date maps to a fixed UTC offset year-round.
 *
 * Used by subscriptions (skip/pause notifications), referrals (trial delivery
 * scheduling), and notifications (dispatcher tick). Lives in shared/ because
 * none of those contexts owns the calendar — it's a cross-cutting primitive.
 *
 * Extracted from src/lib/customer-notifications.ts in Phase 2 of the layered
 * refactor. See .planning/refactor/L1-BOUNDARIES.md (shared kernel) and
 * .planning/refactor/L2-MODULE-SHAPES.md (#4 Notifications — pass-throughs killed).
 */

/**
 * Convert an AE wall date (YYYY-MM-DD) to a UTC timestamp at 9 AM Dubai.
 * Dubai is UTC+4 with no DST, so 9 AM AE = 5 AM UTC every day of the year.
 */
export function ae9amUtcOnDate(aeDateIso: string): Date {
  return new Date(aeDateIso + 'T05:00:00Z')
}

/**
 * Find the next eligible delivery day after `fromAeDateIso` for a sub
 * with the given week_type, skipped_dates, paused_dates, and end_date.
 *
 * Eligible = a day that:
 *   • Is after `fromAeDateIso`
 *   • Is a working day for the week_type (5DAYS = Mon-Fri, 6DAYS = Mon-Sat, 7DAYS = every day)
 *   • Is NOT in skipped_dates
 *   • Is NOT in paused_dates
 *   • Is on or before end_date
 *
 * Returns the ISO date string of the first match, or null if no eligible
 * day exists between `fromAeDateIso` and end_date.
 */
export function nextEligibleDeliveryDay(opts: {
  fromAeDateIso: string
  weekType: '5DAYS' | '6DAYS' | '7DAYS'
  skippedDates: string[]
  pausedDates: string[]
  subEndDateIso: string
}): string | null {
  const { fromAeDateIso, weekType, skippedDates, pausedDates, subEndDateIso } = opts
  const skipped = new Set(skippedDates)
  const paused = new Set(pausedDates)

  // Walk day by day from fromAeDateIso + 1. Cap loop at 40 iterations
  // — longest plausible search window (5-day cycle with weekends + a
  // few skips inside) is well under that.
  const start = new Date(fromAeDateIso + 'T00:00:00Z')
  for (let i = 1; i <= 40; i++) {
    const candidate = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
    const candidateIso = candidate.toISOString().slice(0, 10)

    // Past sub end_date → no eligible day inside the cycle.
    if (candidateIso > subEndDateIso) return null

    // Working day check. ISO dow: 1=Mon..7=Sun (computed from UTC
    // since we built the date at T00:00:00Z).
    const isoDow = ((candidate.getUTCDay() + 6) % 7) + 1
    const isWorkingDay =
      weekType === '7DAYS' ? true :
      weekType === '6DAYS' ? isoDow !== 7 :
      /* 5DAYS */            isoDow !== 6 && isoDow !== 7
    if (!isWorkingDay) continue

    // Skip if customer-skipped or system-paused.
    if (skipped.has(candidateIso)) continue
    if (paused.has(candidateIso)) continue

    return candidateIso
  }
  return null
}

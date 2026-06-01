// Trial-meal delivery scheduling — shared between the referral success modal
// (/r/[cid]/page.tsx) and the dashboard trial-arriving banner.
//
// Rules (mirror the live ops constraints):
//   • Asia/Dubai wall time (UTC+4) drives the calendar day, not the server's UTC.
//   • Kitchen cutoff is 14:00 AE — claims after that go to the NEXT calendar day.
//   • Trial gifts ship on the 6-day cadence (Mon–Sat) by default; Sunday is
//     non-operational. If the next "earliest" day is a Sunday, push to Monday.
//   • Returns BOTH a machine-readable Date (for callers that need the timestamp)
//     AND a human-friendly label ("Tonight", "Tomorrow", "Monday").

export type WeekType = '5DAYS' | '6DAYS' | '7DAYS'

const AE_OFFSET_MS = 4 * 60 * 60 * 1000
const CUTOFF_HOUR_AE = 14

function isDeliveryDow(jsDow: number, weekType: WeekType): boolean {
  // JS dow: 0=Sun, 1=Mon, ..., 6=Sat
  if (weekType === '7DAYS') return true
  if (weekType === '6DAYS') return jsDow !== 0           // no Sunday
  return jsDow !== 0 && jsDow !== 6                       // no Saturday or Sunday
}

/**
 * Compute the AE date a trial meal will land on, given right-now + weekType.
 * Returns null if something is bizarrely off (unreachable in practice).
 */
export function computeTrialDeliveryDate(
  now: Date = new Date(),
  weekType: WeekType = '6DAYS',
): Date {
  // Shift UTC → AE wall time so getUTC* gives AE date components.
  const ae = new Date(now.getTime() + AE_OFFSET_MS)
  const afterCutoff = ae.getUTCHours() >= CUTOFF_HOUR_AE

  // Start at AE today (or tomorrow if past cutoff), then walk forward until
  // we hit a delivery day. We work entirely in AE wall-date components.
  const start = new Date(ae)
  start.setUTCHours(0, 0, 0, 0)
  if (afterCutoff) start.setUTCDate(start.getUTCDate() + 1)
  while (!isDeliveryDow(start.getUTCDay(), weekType)) {
    start.setUTCDate(start.getUTCDate() + 1)
  }
  return start
}

/**
 * Human-friendly label for a trial delivery date relative to AE today.
 *   • Same AE-day as now → "Tonight"
 *   • Next AE-day        → "Tomorrow"
 *   • Anything further   → weekday name ("Monday", "Tuesday", …)
 */
export function trialDeliveryLabel(deliveryDate: Date, now: Date = new Date()): string {
  // Compare AE wall-dates, not UTC midnight.
  const ae       = new Date(now.getTime() + AE_OFFSET_MS)
  const aeToday  = new Date(ae); aeToday.setUTCHours(0, 0, 0, 0)
  const aeTomorrow = new Date(aeToday); aeTomorrow.setUTCDate(aeTomorrow.getUTCDate() + 1)

  if (deliveryDate.getTime() === aeToday.getTime())    return 'Tonight'
  if (deliveryDate.getTime() === aeTomorrow.getTime()) return 'Tomorrow'
  return deliveryDate.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
}

/**
 * Convenience helper — returns the label directly. Use this when you only
 * need the display string and don't care about the underlying Date.
 */
export function nextTrialDeliveryLabel(
  now: Date = new Date(),
  weekType: WeekType = '6DAYS',
): string {
  return trialDeliveryLabel(computeTrialDeliveryDate(now, weekType), now)
}

/**
 * Format an AE wall-date as ISO yyyy-mm-dd. The Dates returned by
 * computeTrialDeliveryDate / eligibleTrialDeliveryDates are constructed in
 * AE wall-date space (their getUTC* fields are the AE calendar components),
 * so we read with getUTC* here to avoid a server-locale double-shift.
 */
export function trialDateIso(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Returns the next `limit` eligible trial delivery dates starting from the
 * soonest one (cutoff + Sunday-skip honoured). Used by the referral page's
 * date chip selector so the user can pick from a handful of upcoming days
 * instead of having the server silently auto-pick.
 */
export function eligibleTrialDeliveryDates(
  now: Date = new Date(),
  weekType: WeekType = '6DAYS',
  limit = 5,
): Date[] {
  const out: Date[] = []
  const cursor = computeTrialDeliveryDate(now, weekType)
  while (out.length < limit) {
    out.push(new Date(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    while (!isDeliveryDow(cursor.getUTCDay(), weekType)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }
  return out
}

/**
 * Season dates: pure date arithmetic for the season wind-down.
 *
 * Spec: docs/superpowers/specs/2026-09-14-season-wind-down-design.md §3 and §5.
 * Dates are YYYY-MM-DD on the Asia/Dubai calendar. Everything parses with a
 * trailing Z and uses UTC getters, so the host timezone can never shift a day.
 */

export type SeasonWeekType = '5DAYS' | '6DAYS'

export const MAX_SCHEDULE_DAYS_AHEAD = 370
export const MAX_BUFFER_DAYS = 3
export const DEFAULT_BUFFER_DAYS = 1

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 1 = Monday … 7 = Sunday, the same convention as Postgres isodow. */
export function isoDow(iso: string): number {
  const js = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return js === 0 ? 7 : js
}

export function isDeliveryDayIso(iso: string, weekType: SeasonWeekType): boolean {
  const dow = isoDow(iso)
  return weekType === '5DAYS' ? dow <= 5 : dow <= 6
}

/**
 * K: the wrap-up day moved forward by `bufferDays` Monday-to-Saturday delivery
 * days. The buffer only ever cooks make-up meals from skips (spec §6.2).
 */
export function closeDayFor(wrapUpDay: string, bufferDays: number): string {
  let day = wrapUpDay
  let left = Math.max(0, Math.floor(bufferDays))
  while (left > 0) {
    day = addDaysIso(day, 1)
    if (isDeliveryDayIso(day, '6DAYS')) left--
  }
  return day
}

/** Returns the admin-facing reason the chosen dates cannot be scheduled, or null. */
export function validateSeasonEnd(input: { wrapUpDay: string; bufferDays: number; todayAe: string }): string | null {
  const { wrapUpDay, bufferDays, todayAe } = input
  if (!ISO_DATE.test(wrapUpDay)) return 'Pick a wrap-up day first.'
  const parsed = new Date(`${wrapUpDay}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== wrapUpDay) {
    return 'That date does not exist. Check the day and month.'
  }
  if (wrapUpDay <= todayAe) return 'The wrap-up day has to be tomorrow or later.'
  if (wrapUpDay > addDaysIso(todayAe, MAX_SCHEDULE_DAYS_AHEAD)) return 'Pick a wrap-up day within the next year.'
  if (!isDeliveryDayIso(wrapUpDay, '6DAYS')) return 'Pick a delivery day. Sunday is not one.'
  if (!Number.isInteger(bufferDays) || bufferDays < 0 || bufferDays > MAX_BUFFER_DAYS) {
    return `The buffer must be 0 to ${MAX_BUFFER_DAYS} delivery days.`
  }
  return null
}

export function todayAeIso(nowMs: number = Date.now()): string {
  return new Date(nowMs + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const SHORT_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A stable "Sat 3 Oct" label built from fixed tables, never
 * `toLocaleDateString` — that reads the host's ICU locale data, which can
 * differ (or be missing) between a developer's machine, CI and production.
 */
export function formatShortDay(iso: string): string {
  const [, monthStr, dayStr] = iso.split('-')
  const weekday = SHORT_WEEKDAYS[isoDow(iso) - 1]
  const month = SHORT_MONTHS[Number(monthStr) - 1]
  return `${weekday} ${Number(dayStr)} ${month}`
}

/**
 * The first day the kitchen will actually deliver on or after a date:
 * skips the cadence's rest days AND company closure days. Checkout, the
 * start-date reschedule and the admin holiday screen all use it so a plan
 * never "starts" on a night nothing is cooked — the start-day email would
 * fire into a closed kitchen and the dashboard would open on "Kitchen
 * closed today" as day one.
 *
 * Dates are UTC-midnight Dates (the convention the payment use cases use);
 * closure dates are YYYY-MM-DD strings as stored in company_closures.
 */

export type DeliveryWeekType = '5DAYS' | '6DAYS' | '7DAYS'

export function isDeliveryDayUtc(d: Date, weekType: DeliveryWeekType): boolean {
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay() // 1=Mon..7=Sun
  if (weekType === '7DAYS') return true
  if (weekType === '6DAYS') return dow !== 7
  return dow !== 6 && dow !== 7
}

export function isoOfUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function firstOpenDeliveryDay(
  from: Date,
  weekType: DeliveryWeekType,
  closureIsos: ReadonlySet<string>,
): Date {
  const r = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  // Bounded: a closure list can never legitimately shut the kitchen for two
  // months straight, so 60 steps is a guard against a runaway loop, not a
  // business rule.
  for (let i = 0; i < 60; i++) {
    if (isDeliveryDayUtc(r, weekType) && !closureIsos.has(isoOfUtc(r))) return r
    r.setUTCDate(r.getUTCDate() + 1)
  }
  return r
}

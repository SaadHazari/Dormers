/**
 * Staff Monthly — the intern remuneration plan (locked 2026-06-12).
 *
 *   • 5-day week (Mon–Fri, 20 meals): FREE — this is their pay.
 *   • 6-day week (Mon–Sat, 24 meals): the 4 Saturdays are PREPAID at a
 *     flat AED 20/meal → AED 80/cycle through the normal Stripe rail.
 *     Prepay was a deliberate call ("post-paid dilemma"): deducting from
 *     the stipend at payday stings more than paying upfront.
 *
 * The plan is NOT publicly sellable: /api/checkout only accepts it from a
 * customer with an active staff_members record, at exactly the surcharge
 * amount. It never appears on the explore-plans grid (pricing.ts PLANS is
 * untouched).
 */

import type { WeekType } from '@/contexts/subscriptions/domain/end-date'

export const STAFF_PLAN_NAME = 'Staff Monthly'

export const STAFF_SATURDAY_MEAL_AED = 20
export const SATURDAYS_PER_CYCLE = 4

/** Exact cycle charge in fils — 0 on the free 5-day week. */
export function staffSurchargeFils(weekType: WeekType): number {
  return weekType === '6DAYS' ? STAFF_SATURDAY_MEAL_AED * SATURDAYS_PER_CYCLE * 100 : 0
}

/**
 * Saturdays strictly after `afterIso` through `toIso` inclusive — the
 * "unused prepaid Saturdays" an offboarded intern gets refunded. Capped at
 * SATURDAYS_PER_CYCLE because that's all they ever paid for.
 */
export function unusedSaturdays(afterIso: string, toIso: string): number {
  const d = new Date(afterIso + 'T00:00:00Z')
  const end = new Date(toIso + 'T00:00:00Z')
  let n = 0
  d.setUTCDate(d.getUTCDate() + 1)
  while (d <= end && n < SATURDAYS_PER_CYCLE) {
    if (d.getUTCDay() === 6) n++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}

/** How close to cycle end the self-renewal window opens (days). */
export const RENEWAL_WINDOW_DAYS = 7

// ── When a renewal actually begins ────────────────────────────────────────

/** The two cadences a staff cycle can run on. */
export type StaffWeekType = '5DAYS' | '6DAYS'

/** Next working day for this cadence, strictly after `afterIso`. */
export function nextWorkingDayAfter(afterIso: string, weekType: StaffWeekType): string {
  const d = new Date(afterIso + 'T00:00:00Z')
  for (let i = 0; i < 7; i++) {
    d.setUTCDate(d.getUTCDate() + 1)
    const isoDow = ((d.getUTCDay() + 6) % 7) + 1
    if (weekType === '5DAYS' ? isoDow <= 5 : isoDow <= 6) break
  }
  return d.toISOString().slice(0, 10)
}

/**
 * The first delivery day of a renewal the admin has just approved.
 *
 * A pending renewal has no real start date — the approval creates it. The
 * date it carried while it waited was only ever a guess about when the
 * admin would get to it, and quoting that guess back is how a renewal
 * approved three weeks late used to activate retroactively, its end_date
 * computed from a day that had already passed.
 *
 *   first delivery = LATER OF
 *       next working day after the approval
 *       next working day after the current cycle's end date
 *
 * The renew button opens RENEWAL_WINDOW_DAYS before a cycle ends, so the
 * usual case is an approval while the old plan is still running: the cycle
 * end wins and the new one queues behind it with no gap. Once the old cycle
 * is over the approval wins, and the intern eats the next working day.
 *
 * `currentCycleEndIso` is null for an intern with nothing running — a
 * lapsed renewal, where only the approval date matters.
 */
export function approvedRenewalStartDate({
  approvedOnIso,
  weekType,
  currentCycleEndIso,
}: {
  approvedOnIso: string
  weekType: StaffWeekType
  currentCycleEndIso: string | null
}): string {
  const afterApproval = nextWorkingDayAfter(approvedOnIso, weekType)
  if (!currentCycleEndIso) return afterApproval
  const afterCycle = nextWorkingDayAfter(currentCycleEndIso, weekType)
  // ISO dates compare chronologically as strings.
  return afterCycle > afterApproval ? afterCycle : afterApproval
}

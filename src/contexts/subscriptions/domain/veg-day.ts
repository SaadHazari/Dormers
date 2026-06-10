/**
 * Veg-day mapping — single source of truth for "is day i a veg day for
 * this customer?" Used by every menu renderer (dashboard hero, /menu page,
 * future kitchen-ops views) so a religious-mix customer's chosen Tuesday
 * shows the veg dish there and the non-veg dish on Monday/Wednesday/etc.
 *
 * Day-of-week convention matches src/lib/menuData.ts: 0 = Monday … 5 = Saturday.
 * (No 6 here — Sunday is never a delivery day for any week_type.)
 */

export type WeekType = '5DAYS' | '6DAYS'

// Order matches DAYS_OF_WEEK in src/app/onboarding/data.ts and the
// dayOfWeek field in src/lib/menuData.ts (0=Mon, 5=Sat).
export const WORKING_DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const
export type WorkingDayName = (typeof WORKING_DAY_NAMES)[number]

/**
 * Days the customer is delivered for, expressed as 0..5 indices.
 *   • 6DAYS → {0,1,2,3,4,5}
 *   • 5DAYS → {0,1,2,3,4}    (Saturday excluded)
 */
export function workingDayNumbers(weekType: WeekType): Set<number> {
  const W = weekType === '5DAYS' ? 5 : 6
  return new Set(Array.from({ length: W }, (_, i) => i))
}

/**
 * Day-NAME resolution for kitchen-ops surfaces (labels, delivery queue):
 * is this customer eating veg on the given day? Religious mix resolves via
 * their chosen veg_days; veg always true; non-veg always false. Day names
 * compare case-insensitively ('Monday' … 'Saturday').
 */
export function isVegOnDayName(
  mealPref: string | null | undefined,
  vegDays: string[] | null | undefined,
  dayName: string,
): boolean {
  const pref = (mealPref ?? '').toLowerCase()
  if (pref.includes('religious')) {
    const day = dayName.toLowerCase()
    return (vegDays ?? []).some(d => d.toLowerCase() === day)
  }
  return pref.includes('plant') || (pref.includes('veg') && !pref.includes('non'))
}

/**
 * Of the working days, which are veg for this customer?
 *
 *   • Veg preference                      → all working days
 *   • NonVeg preference                   → none
 *   • Religious mix                       → exactly the customer's chosen
 *                                           subscription.veg_days, mapped
 *                                           to indices and intersected with
 *                                           the working set.
 *
 * Anything stale (e.g. saved 'Saturday' on a sub that's now 5DAYS) gets
 * dropped silently rather than rendering an off-day dish.
 */
export function vegDayNumbersFor(
  mealPref: string | null | undefined,
  vegDays: string[] | null | undefined,
  weekType: WeekType,
): Set<number> {
  const working = workingDayNumbers(weekType)
  const pref = (mealPref ?? '').toLowerCase()
  if (pref.includes('plant') || pref.includes('veg') && !pref.includes('non')) {
    return working
  }
  if (!pref.includes('religious')) {
    return new Set()                    // pure non-veg
  }
  // Religious — map names to indices, drop unknown / non-working entries
  const result = new Set<number>()
  for (const name of vegDays ?? []) {
    const i = WORKING_DAY_NAMES.indexOf(name as WorkingDayName)
    if (i >= 0 && working.has(i)) result.add(i)
  }
  return result
}

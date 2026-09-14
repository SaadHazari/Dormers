/**
 * Veg-day mapping — the one answer to "is day i a veg day for this customer?"
 * The menu page, dashboard hero, weekly review, support bot, kitchen labels,
 * delivery queue and kitchen counts all ask here, so a religious-mix
 * customer's chosen Tuesday shows (and is cooked as) the veg dish, and
 * Monday/Wednesday/etc. the non-veg one. veg-day-coverage.test.ts fails the
 * build when a screen picks a dish by veg flag without this module.
 *
 * Day-of-week convention matches catalog-data.ts: 0 = Monday … 5 = Saturday.
 * (No 6 here — Sunday is never a delivery day for any week_type.)
 */

export type WeekType = '5DAYS' | '6DAYS'

// Order matches DAYS_OF_WEEK in src/app/onboarding/data.ts and the
// dayOfWeek field in catalog-data.ts (0=Mon, 5=Sat).
export const WORKING_DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const
export type WorkingDayName = (typeof WORKING_DAY_NAMES)[number]

/**
 * The rows that decide a customer's veg days. Callers hand over whole rows,
 * never a bare veg_days array, so the plan-or-saved fallback can't be skipped.
 * `subscription` is the plan being delivered — null before the first purchase.
 */
export interface VegDaySources {
  customer: { meal_preference_type?: string | null; veg_days?: string[] | null } | null | undefined
  /** `meal_preference_type` is the plan's own diet, written at purchase (2026-09-14). */
  subscription: { veg_days?: string[] | null; meal_preference_type?: string | null } | null | undefined
}

/**
 * Days the customer is delivered for, expressed as 0..5 indices.
 *   • 6DAYS → {0,1,2,3,4,5}
 *   • 5DAYS → {0,1,2,3,4}    (Saturday excluded)
 */
export function workingDayNumbers(weekType: WeekType): Set<number> {
  const W = weekType === '5DAYS' ? 5 : 6
  return new Set(Array.from({ length: W }, (_, i) => i))
}

function preferenceKind(mealPref: string | null | undefined): 'religious' | 'veg' | 'nonveg' {
  const pref = (mealPref ?? '').toLowerCase()
  if (pref.includes('religious')) return 'religious'
  if (pref.includes('plant') || (pref.includes('veg') && !pref.includes('non'))) return 'veg'
  return 'nonveg'
}

/**
 * The diet in force: the plan's own, else the customer's. A renewal checkout
 * rewrites customers.meal_preference_type to the NEXT plan's diet the moment
 * it is paid, while this plan still has dinners left — so once a plan carries
 * a diet, that one wins. Same rule as the veg days below.
 */
export function preferenceKindFor({ customer, subscription }: VegDaySources): 'religious' | 'veg' | 'nonveg' {
  return preferenceKind(subscription?.meal_preference_type ?? customer?.meal_preference_type)
}

/**
 * Religious-mix veg day names in force: the plan's snapshot, else the days the
 * customer saved at signup or in their profile. A signup who hasn't bought a
 * plan only has the saved days. A renewal checkout rewrites customers.veg_days
 * to the NEXT plan's picks while this plan still runs, so once a plan carries
 * days, those win.
 */
export function resolveVegDayNames({ customer, subscription }: VegDaySources): string[] {
  const planDays = subscription?.veg_days ?? []
  return planDays.length > 0 ? planDays : customer?.veg_days ?? []
}

/**
 * Day-NAME resolution for kitchen-ops surfaces (labels, delivery queue,
 * kitchen counts, support bot): is this customer eating veg on the given day?
 * Veg always true; non-veg always false; religious mix via resolveVegDayNames.
 * Day names compare case-insensitively ('Monday' … 'Saturday').
 */
export function isVegOnDayName(sources: VegDaySources, dayName: string): boolean {
  const kind = preferenceKindFor(sources)
  if (kind !== 'religious') return kind === 'veg'
  const day = dayName.toLowerCase()
  return resolveVegDayNames(sources).some(d => d.toLowerCase() === day)
}

/**
 * Of the working days, which are veg for this customer?
 *
 *   • Veg preference                      → all working days
 *   • NonVeg preference                   → none
 *   • Religious mix                       → resolveVegDayNames, mapped to
 *                                           indices and intersected with
 *                                           the working set.
 *
 * Anything stale (e.g. saved 'Saturday' on a sub that's now 5DAYS) gets
 * dropped silently rather than rendering an off-day dish.
 */
export function vegDayNumbersFor(sources: VegDaySources, weekType: WeekType): Set<number> {
  const working = workingDayNumbers(weekType)
  const kind = preferenceKindFor(sources)
  if (kind === 'veg') return working
  if (kind === 'nonveg') return new Set()
  const result = new Set<number>()
  for (const name of resolveVegDayNames(sources)) {
    const i = WORKING_DAY_NAMES.findIndex(d => d.toLowerCase() === name.toLowerCase())
    if (i >= 0 && working.has(i)) result.add(i)
  }
  return result
}

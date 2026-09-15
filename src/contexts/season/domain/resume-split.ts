/**
 * What resuming now means while the season winds down (spec §7.4, N7).
 *
 * Pure. Projects the paused plan as if it resumed now (a resume after 2 PM on
 * a delivery day does not cook tonight) and, when dinners would run past the
 * wrap-up day, returns the split the sheet shows. Nothing is stored: the hold
 * is created when the break starts, from the projection at that moment.
 */

import { isDeliveryDayIso } from './season-dates'
import { projectPlan, type ProjectionPlan } from './season-projection'

export interface ResumeSplit {
  /** First dinner before the wrap-up day, or null when none is left. */
  firstDinner: string | null
  wrapUpDay: string
  /** Meals the break will keep for next semester. */
  heldMeals: number
  /** The waitlist credit the break will add, in AED; null when it will add none. */
  creditAed: number | null
}

export function resumeSplitFor(input: {
  plan: ProjectionPlan | null
  wrapUpDay: string
  closeDay: string
  todayAe: string
  aeHour: number
  closureDates: readonly string[]
  creditAed: number
  alreadyJoined: boolean
  paidInCash: boolean
}): ResumeSplit | null {
  const { plan } = input
  if (!plan || plan.status !== 'Paused') return null

  const afterCutoff = input.aeHour >= 14 && isDeliveryDayIso(input.todayAe, plan.weekType)
  const resumed: ProjectionPlan = {
    ...plan,
    status: 'Active',
    plannedPauseStart: null,
    resumeCutoffDate: afterCutoff ? input.todayAe : plan.resumeCutoffDate ?? null,
  }
  const projection = projectPlan(resumed, {
    todayAe: input.todayAe,
    closureDates: new Set(input.closureDates),
    wrapUpDay: input.wrapUpDay,
    closeDay: input.closeDay,
  })
  if (projection.disposition !== 'runs_past') return null

  return {
    firstDinner: projection.cookDates[0] ?? null,
    wrapUpDay: input.wrapUpDay,
    heldMeals: Math.max(0, projection.mealsLeft - projection.cookDates.length * plan.mealsPerDay),
    creditAed: input.paidInCash && !input.alreadyJoined && input.creditAed > 0 ? input.creditAed : null,
  }
}

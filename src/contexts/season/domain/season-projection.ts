/**
 * Season projection: what the end of the season does to every live plan.
 *
 * Spec §6.1 (dispositions) and §6.2 (the buffer only cooks make-up meals that
 * hold a grant). Pure: the Season page feeds it live rows, and the SQL twin in
 * plan C must return the same answers for the same inputs.
 */

import { addDaysIso, isDeliveryDayIso, type SeasonWeekType } from './season-dates'

export type Disposition = 'finishes' | 'customer_paused' | 'runs_past' | 'starts_after' | 'staff_pending'
export type ProjectionStatus = 'Active' | 'Skipped' | 'Paused' | 'Scheduled'

export interface ProjectionPlan {
  id: string
  customerId: string
  planName: string
  status: ProjectionStatus
  startDate: string
  endDate: string
  weekType: SeasonWeekType
  mealsPerDay: number
  totalMeals: number
  deliveredMeals: number
  creditedSkipDays: number
  bufferGrants: number
  skippedDates: readonly string[]
  plannedPauseStart: string | null
  staffApproval: string | null
  lastDeliveryTickDate: string | null
}

export interface ProjectionContext {
  todayAe: string
  closureDates: ReadonlySet<string>
  wrapUpDay: string | null
  closeDay: string | null
}

export interface PlanProjection {
  planId: string
  disposition: Disposition
  /** Dates the kitchen will still cook for this plan under the season rules. */
  cookDates: string[]
  lastDinner: string | null
  /** Delivery days due after the wrap-up day that no buffer grant covers. */
  deliveriesAfterWrapUp: number
  mealsAfterWrapUp: number
  /** total − delivered − credited skip days × meals per day. */
  mealsLeft: number
}

export interface KitchenDay {
  date: string
  meals: number
  lastDinners: number
}

export interface SeasonSummary {
  byDisposition: Record<Disposition, number>
  kitchenDays: number
  kitchenCostAed: number
  mealsAfterWrapUp: number
  lastKitchenDay: string | null
}

// A plan cannot legitimately run longer than this; it bounds the walk, it is not a rule.
const MAX_WALK_DAYS = 400

export function remainingDeliveryDates(
  plan: ProjectionPlan,
  ctx: Pick<ProjectionContext, 'todayAe' | 'closureDates'>,
): string[] {
  let from = plan.startDate > ctx.todayAe ? plan.startDate : ctx.todayAe
  // Tonight's delivery already recorded: today is no longer remaining.
  if (plan.lastDeliveryTickDate && plan.lastDeliveryTickDate >= from) {
    from = addDaysIso(plan.lastDeliveryTickDate, 1)
  }
  const skipped = new Set(plan.skippedDates)
  const out: string[] = []
  let day = from
  for (let i = 0; i < MAX_WALK_DAYS && day <= plan.endDate; i++, day = addDaysIso(day, 1)) {
    if (!isDeliveryDayIso(day, plan.weekType)) continue
    if (ctx.closureDates.has(day) || skipped.has(day)) continue
    out.push(day)
  }
  return out
}

export function projectPlan(plan: ProjectionPlan, ctx: ProjectionContext): PlanProjection {
  const mealsLeft = Math.max(0, plan.totalMeals - plan.deliveredMeals - plan.creditedSkipDays * plan.mealsPerDay)
  const result = (
    disposition: Disposition,
    cookDates: string[],
    deliveriesAfterWrapUp: number,
    mealsAfterWrapUp: number,
  ): PlanProjection => ({
    planId: plan.id,
    disposition,
    cookDates,
    lastDinner: cookDates.length > 0 ? cookDates[cookDates.length - 1] : null,
    deliveriesAfterWrapUp,
    mealsAfterWrapUp,
    mealsLeft,
  })

  if (plan.status === 'Scheduled' && plan.staffApproval === 'pending') return result('staff_pending', [], 0, 0)
  if (plan.status === 'Paused') return result('customer_paused', [], 0, 0)

  const wrapUp = ctx.wrapUpDay
  const all = remainingDeliveryDates(plan, ctx)

  if (plan.plannedPauseStart && (!wrapUp || plan.plannedPauseStart <= wrapUp)) {
    const pauseStart = plan.plannedPauseStart
    return result('customer_paused', all.filter((d) => d < pauseStart && (!wrapUp || d <= wrapUp)), 0, 0)
  }

  if (!wrapUp) return result('finishes', all, 0, 0)

  const close = ctx.closeDay && ctx.closeDay > wrapUp ? ctx.closeDay : wrapUp
  const regular = all.filter((d) => d <= wrapUp)
  const afterWrapUp = all.filter((d) => d > wrapUp)
  const granted = afterWrapUp.filter((d) => d <= close).slice(0, Math.max(0, plan.bufferGrants))
  const notCooked = afterWrapUp.length - granted.length

  if (plan.status === 'Scheduled' && plan.startDate > wrapUp && granted.length === 0) {
    return result('starts_after', [], afterWrapUp.length, mealsLeft)
  }
  if (notCooked > 0) {
    return result('runs_past', [...regular, ...granted], notCooked, notCooked * plan.mealsPerDay)
  }
  return result('finishes', [...regular, ...granted], 0, 0)
}

export function lastMealOnTheBooks(projections: readonly PlanProjection[]): { date: string; planIds: string[] } | null {
  let date: string | null = null
  for (const p of projections) {
    if (p.lastDinner && (date === null || p.lastDinner > date)) date = p.lastDinner
  }
  if (date === null) return null
  const last = date
  return { date: last, planIds: projections.filter((p) => p.lastDinner === last).map((p) => p.planId) }
}

export function kitchenCalendar(plans: readonly ProjectionPlan[], projections: readonly PlanProjection[]): KitchenDay[] {
  const mealsPerDay = new Map(plans.map((p) => [p.id, p.mealsPerDay]))
  const days = new Map<string, KitchenDay>()
  for (const projection of projections) {
    const perDay = mealsPerDay.get(projection.planId)
    if (perDay === undefined) continue
    for (const date of projection.cookDates) {
      const row = days.get(date) ?? { date, meals: 0, lastDinners: 0 }
      row.meals += perDay
      if (date === projection.lastDinner) row.lastDinners += 1
      days.set(date, row)
    }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function summarizeSeason(
  projections: readonly PlanProjection[],
  calendar: readonly KitchenDay[],
  kitchenDailyCostAed: number,
): SeasonSummary {
  const byDisposition: Record<Disposition, number> = {
    finishes: 0, customer_paused: 0, runs_past: 0, starts_after: 0, staff_pending: 0,
  }
  let mealsAfterWrapUp = 0
  for (const p of projections) {
    byDisposition[p.disposition] += 1
    mealsAfterWrapUp += p.mealsAfterWrapUp
  }
  return {
    byDisposition,
    kitchenDays: calendar.length,
    kitchenCostAed: calendar.length * kitchenDailyCostAed,
    mealsAfterWrapUp,
    lastKitchenDay: calendar.length > 0 ? calendar[calendar.length - 1].date : null,
  }
}

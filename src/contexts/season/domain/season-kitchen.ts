/**
 * The kitchen during the season end (spec §6.2, §9 G1, G5, G6).
 *
 * Pure and client-importable. Mirrors what the nightly SQL runs:
 * _season_buffer_slots_used and _season_buffer_cooks
 * (supabase/migrations/20260916_season_project_plans.sql) and the delivery
 * tick's own conditions (20260916_season_kitchen_guards.sql). "Does this plan
 * cook on day D" is never decided by status alone: a plan whose last meal was
 * credited today still reads Skipped or Active for a night.
 */

import { addDaysIso, effectiveCloseDay, isDeliveryDayIso, type SeasonWeekType } from './season-dates'
import type { SeasonPhase } from './season-phase'

export type SeasonKitchenGate = 'normal' | 'buffer_only' | 'closed_for_break'

export function seasonKitchenGate(input: { phase: SeasonPhase; wrapUpDay: string | null; closeDay: string | null; todayAe: string }): SeasonKitchenGate {
  if (input.phase === 'break') return 'closed_for_break'
  if (input.phase !== 'winding_down' || !input.wrapUpDay) return 'normal'
  const close = effectiveCloseDay(input.wrapUpDay, input.closeDay)
  if (input.todayAe > close) return 'closed_for_break'
  if (input.todayAe > input.wrapUpDay) return 'buffer_only'
  return 'normal'
}

/** Buffer delivery days after the wrap-up day and before `beforeDay`: each one used a grant slot. */
export function bufferSlotsUsed(input: {
  wrapUpDay: string
  beforeDay: string
  weekType: SeasonWeekType
  skippedDates: readonly string[]
  closureDates: ReadonlySet<string>
}): number {
  const skipped = new Set(input.skippedDates)
  let used = 0
  for (let day = addDaysIso(input.wrapUpDay, 1); day < input.beforeDay; day = addDaysIso(day, 1)) {
    if (!isDeliveryDayIso(day, input.weekType) || input.closureDates.has(day) || skipped.has(day)) continue
    used++
  }
  return used
}

/** A buffer day cooks for a plan only on its first `bufferGrants` buffer delivery days. */
export function bufferCooksOn(input: {
  day: string
  wrapUpDay: string
  closeDay: string | null
  weekType: SeasonWeekType
  skippedDates: readonly string[]
  bufferGrants: number
  closureDates: ReadonlySet<string>
}): boolean {
  const close = effectiveCloseDay(input.wrapUpDay, input.closeDay)
  if (input.day <= input.wrapUpDay || input.day > close || input.bufferGrants <= 0) return false
  if (!isDeliveryDayIso(input.day, input.weekType) || input.closureDates.has(input.day) || input.skippedDates.includes(input.day)) return false
  return bufferSlotsUsed({
    wrapUpDay: input.wrapUpDay,
    beforeDay: input.day,
    weekType: input.weekType,
    skippedDates: input.skippedDates,
    closureDates: input.closureDates,
  }) < input.bufferGrants
}

export interface KitchenPlanFacts {
  status: string | null
  seasonHoldId: string | null
  weekType: SeasonWeekType
  mealsPerDay: number
  totalMeals: number
  deliveredMeals: number
  creditedSkipDays: number
  skippedDates: readonly string[]
  bufferGrants: number
  resumeCutoffDate: string | null
  lastDeliveryTickDate: string | null
}

/** The delivery tick's own conditions for day `day`, plus the season hold (spec G1). */
export function deliveryTickCooks(plan: KitchenPlanFacts, day: string, closureDates: ReadonlySet<string>): boolean {
  if (plan.status !== 'Active' || plan.seasonHoldId) return false
  if (!isDeliveryDayIso(day, plan.weekType) || closureDates.has(day) || plan.skippedDates.includes(day)) return false
  if (plan.resumeCutoffDate && plan.resumeCutoffDate >= day) return false
  const cap = plan.totalMeals - plan.creditedSkipDays * plan.mealsPerDay
  // Tonight's delivery already recorded: judge the plan as it stood before it,
  // so the kitchen screen reads the same before and after 20:00.
  const deliveredBefore = plan.lastDeliveryTickDate === day ? plan.deliveredMeals - plan.mealsPerDay : plan.deliveredMeals
  return deliveredBefore < cap
}

/** Whether the kitchen and rider counts include this plan on `day` (spec G5). */
export function kitchenCountsPlan(input: {
  gate: SeasonKitchenGate
  day: string
  wrapUpDay: string | null
  closeDay: string | null
  closureDates: ReadonlySet<string>
  plan: KitchenPlanFacts
}): boolean {
  if (input.gate === 'closed_for_break') return false
  if (!deliveryTickCooks(input.plan, input.day, input.closureDates)) return false
  if (input.gate === 'normal') return true
  if (!input.wrapUpDay) return false
  return bufferCooksOn({
    day: input.day,
    wrapUpDay: input.wrapUpDay,
    closeDay: input.closeDay,
    weekType: input.plan.weekType,
    skippedDates: input.plan.skippedDates,
    bufferGrants: input.plan.bufferGrants,
    closureDates: input.closureDates,
  })
}

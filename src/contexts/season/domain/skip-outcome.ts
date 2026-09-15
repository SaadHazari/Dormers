/**
 * Skip outcome during the season wind-down (spec §7.2).
 *
 * A skip normally adds a make-up day at the end of the plan. While the season
 * winds down that day may land after the wrap-up day W:
 *   on or before W                          normal skip
 *   after W, on or before K, grant left     normal skip plus a buffer grant
 *   anywhere else                           credited skip (meal value to the wallet)
 *
 * Pure and client-importable. The skip sheets word the outcome before the tap,
 * the server action decides again on fresh data, and SQL season_skip recomputes
 * it under a row lock. projectedEndDate / makeUpDayFor mirror
 * season_projected_end / season_make_up_day in
 * supabase/migrations/20260915_season_skip_functions.sql.
 */

import { addDaysIso, effectiveCloseDay, isDeliveryDayIso, type SeasonWeekType } from './season-dates'
import type { SeasonPhase } from './season-phase'
import { mealValueOf, type OrderMoney } from './meal-value'
import { resolvePlan } from '@/contexts/subscriptions/domain/plans'

/** Share of the list price credited only when an order recorded no money (spec D7 fallback). */
export const SEASON_ESTIMATE_SHARE_PCT = 90

export interface SkipSeason {
  phase: SeasonPhase
  wrapUpDay: string | null
  closeDay: string | null
  bufferDays: number
}

export interface SkipPlanFacts {
  endDate: string
  weekType: SeasonWeekType
  skippedDates: readonly string[]
  bufferGrants: number
}

export type SkipOutcomeKind = 'normal' | 'grant' | 'credited'

export type SkipOutcome =
  | { kind: 'normal' }
  | { kind: 'grant'; makeUpDay: string }
  | { kind: 'credited'; makeUpDay: string; creditFils: number | null }

/** What the customer's sheet showed when they confirmed. */
export interface SkipSeen {
  outcome: SkipOutcomeKind
  creditFils: number | null
}

/** Returned by the skip actions so the dashboard can say what happened. */
export interface SeasonSkipNotice {
  outcome: 'credited'
  creditFils: number
  creditStatus: 'approved' | 'pending' | 'none'
  mealDate: string
}

interface WalkInput {
  endDate: string
  weekType: SeasonWeekType
  todayAe: string
  closureDates: ReadonlySet<string>
  skippedDates: readonly string[]
}

// Bounds the walk; a plan never needs more than a few extra delivery days.
const MAX_WALK_DAYS = 60

/**
 * The end date the plan will really have: subscription_closure_tick pushes it
 * one delivery day for every closure it meets from today to the end, except on
 * a day the customer already skipped.
 */
export function projectedEndDate(input: WalkInput): string {
  const skipped = new Set(input.skippedDates)
  let owed = 0
  for (const d of input.closureDates) {
    if (d >= input.todayAe && d <= input.endDate && isDeliveryDayIso(d, input.weekType) && !skipped.has(d)) owed++
  }
  let day = input.endDate
  for (let i = 0; owed > 0 && i < MAX_WALK_DAYS; i++) {
    day = addDaysIso(day, 1)
    if (!isDeliveryDayIso(day, input.weekType) || input.closureDates.has(day)) continue
    owed--
  }
  return day
}

/** The delivery day one more skip would add to the plan. */
export function makeUpDayFor(input: WalkInput): string {
  let day = projectedEndDate(input)
  for (let i = 0; i < MAX_WALK_DAYS; i++) {
    day = addDaysIso(day, 1)
    if (isDeliveryDayIso(day, input.weekType) && !input.closureDates.has(day)) return day
  }
  return day
}

export function decideSkipOutcome(input: {
  season: SkipSeason
  plan: SkipPlanFacts
  todayAe: string
  closureDates: ReadonlySet<string>
  creditFils: number | null
}): SkipOutcome {
  const { season, plan } = input
  if (season.phase !== 'winding_down' || !season.wrapUpDay) return { kind: 'normal' }
  const wrapUp = season.wrapUpDay
  const close = effectiveCloseDay(wrapUp, season.closeDay)
  const makeUpDay = makeUpDayFor({
    endDate: plan.endDate,
    weekType: plan.weekType,
    todayAe: input.todayAe,
    closureDates: input.closureDates,
    skippedDates: plan.skippedDates,
  })
  if (makeUpDay <= wrapUp) return { kind: 'normal' }
  if (makeUpDay <= close && plan.bufferGrants < season.bufferDays) return { kind: 'grant', makeUpDay }
  return { kind: 'credited', makeUpDay, creditFils: input.creditFils }
}

/**
 * Wallet credit for one skipped delivery day, in fils: what the customer paid
 * for that meal, (card charge + wallet credit used) ÷ meals in the order, × the
 * day's meals (spec D7). An order with no recorded money (Stripe test mode
 * during the pilot, or unresolvable) falls back to 90% of its list price.
 * 0 for plans not paid in cash (spec X5); null when there is nothing to go on.
 */
export function skipCreditFilsFor(input: { planName: string; mealsPerDay: number | null; order: OrderMoney | null }): number | null {
  const id = resolvePlan(input.planName)?.id
  // SQL season_skip_credit_fils exempts by name with ILIKE; match it whatever the casing.
  const lower = input.planName.toLowerCase()
  if (id === 'staff-monthly' || id === 'welcome-gift' || lower.includes('staff monthly') || lower.includes('welcome meal')) return 0
  if (!input.order) return 0
  const value = mealValueOf(input.order)
  if (!value) return null
  const perMeal = value.exact ? value.fils : Math.floor((value.fils * SEASON_ESTIMATE_SHARE_PCT) / 100)
  return perMeal * Math.max(1, input.mealsPerDay ?? 1)
}

/**
 * May a message promise the customer a meal on this date?
 * `bufferGrants` is the number of buffer grants this plan currently holds, not the season's buffer cap.
 */
export function mayPromiseMealOn(dateIso: string, season: SkipSeason, bufferGrants: number): boolean {
  if (season.phase !== 'winding_down' || !season.wrapUpDay) return true
  if (dateIso <= season.wrapUpDay) return true
  return bufferGrants > 0 && season.closeDay != null && dateIso <= season.closeDay
}

/**
 * True when the server's outcome is not the one the customer confirmed. A
 * credited skip always needs a matching confirmation, because it moves money.
 */
export function skipSeenMismatch(outcome: SkipOutcome, seen: SkipSeen | undefined): boolean {
  if (!seen) return outcome.kind === 'credited'
  if (seen.outcome !== outcome.kind) return true
  return outcome.kind === 'credited' && seen.creditFils !== outcome.creditFils
}

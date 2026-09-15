/**
 * One customer's view of the season end, for the dashboard (spec §7.2, N1, N3).
 *
 * Pure: the dashboard page feeds it the customer's live plan rows and the
 * season; the skip sheets, the home chip and the full-screen notice read the
 * result. Null whenever the season is not winding down to a wrap-up day, so
 * every surface stays exactly as it is today.
 */

import { projectPlan, type Disposition, type ProjectionPlan, type ProjectionStatus } from './season-projection'
import { refundableOrder, type RefundOrderMoney } from './season-refund'
import type { SeasonPhase } from './season-phase'

export type SeasonNoticeKind = 'finishes' | 'paused'

export interface CustomerSeason {
  phase: 'winding_down'
  wrapUpDay: string
  closeDay: string
  bufferDays: number
  cycleStartedAt: string | null
  /** N1 for plans that finish, N3 for a customer pause, null for no notice. */
  notice: SeasonNoticeKind | null
  /** Last dinner on the books across the customer's live plans. */
  lastDinner: string | null
  /** Credit one skipped delivery day of the primary plan would mint; 0 = not paid in cash, null = unknown. */
  skipCreditFils: number | null
  /** The primary plan's order money when a refund could be built from it (spec §10.3), else null. */
  refundOrder: RefundOrderMoney | null
  closureDates: string[]
}

const LIVE: readonly ProjectionStatus[] = ['Active', 'Skipped', 'Paused', 'Scheduled']

export function projectionPlanFromRow(row: Record<string, unknown> | null | undefined): ProjectionPlan | null {
  if (!row) return null
  const status = row.status as ProjectionStatus
  if (!LIVE.includes(status)) return null
  const day = (v: unknown): string | null => (v == null ? null : String(v).slice(0, 10))
  const startDate = day(row.start_date)
  const endDate = day(row.end_date)
  if (!startDate || !endDate) return null
  return {
    id: String(row.id),
    customerId: String(row.customer_id ?? ''),
    planName: String(row.plan_name ?? ''),
    status,
    startDate,
    endDate,
    weekType: row.week_type === '5DAYS' ? '5DAYS' : '6DAYS',
    mealsPerDay: Number(row.meals_per_day ?? 1),
    totalMeals: Number(row.total_meals ?? 0),
    deliveredMeals: Number(row.delivered_meals ?? 0),
    creditedSkipDays: Number(row.credited_skip_days ?? 0),
    bufferGrants: Number(row.season_buffer_grants ?? 0),
    skippedDates: Array.isArray(row.skipped_dates) ? row.skipped_dates.map(String) : [],
    plannedPauseStart: day(row.planned_pause_start),
    staffApproval: row.staff_approval == null ? null : String(row.staff_approval),
    lastDeliveryTickDate: day(row.last_delivery_tick_date),
    resumeCutoffDate: day(row.resume_cutoff_date),
  }
}

export function noticeFor(dispositions: readonly Disposition[]): SeasonNoticeKind | null {
  if (dispositions.length === 0) return null
  if (dispositions.includes('customer_paused')) return 'paused'
  if (dispositions.every((d) => d === 'finishes')) return 'finishes'
  return null
}

export function buildCustomerSeason(input: {
  intake: { phase: SeasonPhase; wrapUpDay: string | null; closeDay: string | null; bufferDays: number; cycleStartedAt: string | null }
  plans: readonly ProjectionPlan[]
  skipCreditFils: number | null
  refundOrder?: RefundOrderMoney | null
  todayAe: string
  closureDates: readonly string[]
}): CustomerSeason | null {
  const { intake } = input
  if (intake.phase !== 'winding_down' || !intake.wrapUpDay || !intake.closeDay) return null
  const ctx = {
    todayAe: input.todayAe,
    closureDates: new Set(input.closureDates),
    wrapUpDay: intake.wrapUpDay,
    closeDay: intake.closeDay,
  }
  const projections = input.plans.map((p) => projectPlan(p, ctx))
  let lastDinner: string | null = null
  for (const p of projections) {
    if (p.lastDinner && (lastDinner === null || p.lastDinner > lastDinner)) lastDinner = p.lastDinner
  }
  return {
    phase: 'winding_down',
    wrapUpDay: intake.wrapUpDay,
    closeDay: intake.closeDay,
    bufferDays: intake.bufferDays,
    cycleStartedAt: intake.cycleStartedAt,
    notice: noticeFor(projections.map((p) => p.disposition)),
    lastDinner,
    skipCreditFils: input.skipCreditFils,
    refundOrder: input.refundOrder && refundableOrder(input.refundOrder) ? input.refundOrder : null,
    closureDates: [...input.closureDates],
  }
}

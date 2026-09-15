import 'server-only'

/**
 * Everything the Season page needs to plan the end of a season, read live.
 *
 * Only facts are gathered here. The projection runs in the browser
 * (SeasonPlanner) so the owner can try wrap-up days without a round trip.
 * Any read error throws: a planner built from half the plans would show a
 * last meal that is not the last meal.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import type { SeasonPhase, SeasonSnapshot } from '@/contexts/season/domain/season-phase'
import type { ProjectionPlan, ProjectionStatus } from '@/contexts/season/domain/season-projection'
import { mealValueOf, type MealValue } from '@/contexts/season/domain/meal-value'

export type SeasonDataClient = Pick<ReturnType<typeof createAdminSupabaseClient>, 'from'>

export interface SeasonPlanRow extends ProjectionPlan {
  customerName: string
  dormName: string | null
  mealValue: MealValue
}

export interface SeasonPageData {
  snapshot: SeasonSnapshot
  /** intake_settings.paused, read separately from the phase/salesStopped snapshot
   *  so the planner can warn when the two disagree (season-phase.ts's
   *  seasonDriftMessage) instead of silently trusting one of them. */
  paused: boolean
  salesStoppedAt: string | null
  kitchenDailyCostAed: number
  todayAe: string
  closureDates: string[]
  plans: SeasonPlanRow[]
}

const LIVE_STATUSES: ProjectionStatus[] = ['Active', 'Skipped', 'Paused', 'Scheduled']
// .in() with an empty list is a PostgREST syntax error; this id matches nothing.
const NO_ID = '00000000-0000-0000-0000-000000000000'

type SubRow = {
  id: string
  customer_id: string
  plan_name: string
  status: string
  start_date: string
  end_date: string
  week_type: string | null
  meals_per_day: number | null
  total_meals: number
  delivered_meals: number | null
  credited_skip_days: number | null
  season_buffer_grants: number | null
  skipped_dates: string[] | null
  planned_pause_start: string | null
  staff_approval: string | null
  last_delivery_tick_date: string | null
  resume_cutoff_date?: string | null
}

type OrderRow = {
  subscription_id: string | null
  amount_paid_fils: number | null
  credit_applied_fils: number | null
  meals_count: number | null
  price_per_meal: number | string | null
  stripe_session_id: string | null
  created_at: string
}

export async function loadSeasonPageData(todayAe: string, sb: SeasonDataClient = createAdminSupabaseClient()): Promise<SeasonPageData> {
  const [settingsRes, subsRes, closuresRes] = await Promise.all([
    sb.from('intake_settings')
      .select('season_phase, wrap_up_day, buffer_delivery_days, close_day, sales_stopped_at, kitchen_daily_cost_aed, paused')
      .maybeSingle(),
    sb.from('subscriptions')
      .select('id, customer_id, plan_name, status, start_date, end_date, week_type, meals_per_day, total_meals, delivered_meals, credited_skip_days, season_buffer_grants, skipped_dates, planned_pause_start, staff_approval, last_delivery_tick_date, resume_cutoff_date')
      .in('status', LIVE_STATUSES),
    sb.from('company_closures').select('closure_date').gte('closure_date', todayAe),
  ])
  if (settingsRes.error) throw new Error(`Season settings read failed: ${settingsRes.error.message}`)
  if (subsRes.error) throw new Error(`Season plans read failed: ${subsRes.error.message}`)
  if (closuresRes.error) throw new Error(`Closures read failed: ${closuresRes.error.message}`)

  const settings = (settingsRes.data ?? {}) as Record<string, unknown>
  const phase: SeasonPhase =
    settings.season_phase === 'winding_down' || settings.season_phase === 'break' ? settings.season_phase : 'open'
  const snapshot: SeasonSnapshot = {
    phase,
    wrapUpDay: settings.wrap_up_day == null ? null : String(settings.wrap_up_day),
    closeDay: settings.close_day == null ? null : String(settings.close_day),
    bufferDays: settings.buffer_delivery_days == null ? 1 : Number(settings.buffer_delivery_days),
    salesStopped: settings.sales_stopped_at != null,
  }

  const subs = (subsRes.data ?? []) as SubRow[]
  const customerIds = [...new Set(subs.map((r) => r.customer_id))]
  const subIds = subs.map((r) => r.id)

  const [customersRes, ordersRes] = await Promise.all([
    sb.from('customers').select('id, name, dorm_name').in('id', customerIds.length ? customerIds : [NO_ID]),
    sb.from('orders')
      .select('subscription_id, amount_paid_fils, credit_applied_fils, meals_count, price_per_meal, stripe_session_id, created_at')
      .in('subscription_id', subIds.length ? subIds : [NO_ID])
      .order('created_at', { ascending: false }),
  ])
  if (customersRes.error) throw new Error(`Season customers read failed: ${customersRes.error.message}`)
  if (ordersRes.error) throw new Error(`Season orders read failed: ${ordersRes.error.message}`)

  const customers = new Map(
    ((customersRes.data ?? []) as Array<{ id: string; name: string | null; dorm_name: string | null }>).map((c) => [c.id, c]),
  )
  // Newest first, so the first order seen for a plan is the one that bought it.
  const orderByPlan = new Map<string, OrderRow>()
  for (const order of (ordersRes.data ?? []) as OrderRow[]) {
    if (order.subscription_id && !orderByPlan.has(order.subscription_id)) orderByPlan.set(order.subscription_id, order)
  }

  const plans: SeasonPlanRow[] = subs.map((r) => {
    const customer = customers.get(r.customer_id)
    const order = orderByPlan.get(r.id)
    return {
      id: r.id,
      customerId: r.customer_id,
      planName: r.plan_name,
      status: r.status as ProjectionStatus,
      startDate: r.start_date,
      endDate: r.end_date,
      weekType: r.week_type === '5DAYS' ? '5DAYS' : '6DAYS',
      mealsPerDay: r.meals_per_day ?? 1,
      totalMeals: r.total_meals,
      deliveredMeals: r.delivered_meals ?? 0,
      creditedSkipDays: r.credited_skip_days ?? 0,
      bufferGrants: r.season_buffer_grants ?? 0,
      skippedDates: r.skipped_dates ?? [],
      plannedPauseStart: r.planned_pause_start,
      staffApproval: r.staff_approval,
      lastDeliveryTickDate: r.last_delivery_tick_date,
      resumeCutoffDate: r.resume_cutoff_date ?? null,
      customerName: customer?.name?.trim() || 'Unnamed',
      dormName: customer?.dorm_name ?? null,
      mealValue: order
        ? mealValueOf({
            amountPaidFils: order.amount_paid_fils,
            creditAppliedFils: order.credit_applied_fils,
            mealsCount: order.meals_count,
            pricePerMealAed: order.price_per_meal == null ? null : Number(order.price_per_meal),
            stripeSessionId: order.stripe_session_id,
          })
        : null,
    }
  })

  return {
    snapshot,
    paused: settings.paused === true,
    salesStoppedAt: settings.sales_stopped_at == null ? null : String(settings.sales_stopped_at),
    kitchenDailyCostAed: settings.kitchen_daily_cost_aed == null ? 500 : Number(settings.kitchen_daily_cost_aed),
    todayAe,
    closureDates: ((closuresRes.data ?? []) as Array<{ closure_date: string }>).map((r) => r.closure_date),
    plans,
  }
}

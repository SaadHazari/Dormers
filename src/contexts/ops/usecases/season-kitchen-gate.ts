import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { captureError } from '@/infra/logging/capture-error'
import { addDaysIso } from '@/contexts/season/domain/season-dates'
import type { SeasonPhase } from '@/contexts/season/domain/season-phase'
import { kitchenCountsPlan, seasonKitchenGate, type KitchenPlanFacts, type SeasonKitchenGate } from '@/contexts/season/domain/season-kitchen'

/**
 * The season, as the kitchen and the rider see it today (spec G5).
 *
 * Read on every render, never from the 30-second intake cache: after the close
 * day a stale "open" would put held plans back on the prep screen.
 */

export const KITCHEN_CLOSED_FOR_BREAK = 'Kitchen closed for the semester break'

export type SeasonKitchenRead =
  | { ok: true; gate: SeasonKitchenGate; wrapUpDay: string | null; closeDay: string | null; closureDates: ReadonlySet<string> }
  | { ok: false }

export type SeasonKitchenFacts = Extract<SeasonKitchenRead, { ok: true }>

/** The subscriptions columns the delivery tick's conditions need. */
export const KITCHEN_SUB_COLUMNS =
  'status, week_type, skipped_dates, total_meals, delivered_meals, meals_per_day, credited_skip_days, season_buffer_grants, season_hold_id, resume_cutoff_date, last_delivery_tick_date'

export interface KitchenSubRow {
  status: string | null
  season_hold_id?: string | null
  week_type: string | null
  meals_per_day?: number | null
  total_meals: number
  delivered_meals?: number | null
  credited_skip_days?: number | null
  skipped_dates: string[] | null
  paused_dates?: string[] | null
  season_buffer_grants?: number | null
  resume_cutoff_date?: string | null
  last_delivery_tick_date?: string | null
}

/** Row to facts, with the delivery tick's COALESCE defaults. */
export function kitchenFactsFor(row: KitchenSubRow): KitchenPlanFacts {
  return {
    status: row.status,
    seasonHoldId: row.season_hold_id ?? null,
    weekType: row.week_type === '5DAYS' ? '5DAYS' : '6DAYS',
    mealsPerDay: row.meals_per_day ?? 1,
    totalMeals: row.total_meals,
    deliveredMeals: row.delivered_meals ?? 0,
    creditedSkipDays: row.credited_skip_days ?? 0,
    skippedDates: row.skipped_dates ?? [],
    bufferGrants: row.season_buffer_grants ?? 0,
    resumeCutoffDate: row.resume_cutoff_date ? String(row.resume_cutoff_date).slice(0, 10) : null,
    lastDeliveryTickDate: row.last_delivery_tick_date ? String(row.last_delivery_tick_date).slice(0, 10) : null,
  }
}

/**
 * The plans the kitchen cooks today: the delivery tick's own conditions plus
 * the season gate (spec G5), and the screens' own two filters (a 5DAYS plan on
 * Saturday, a day listed as paused). Shared by the kitchen and rider counts.
 */
export function plansCookingToday<T extends KitchenSubRow>(subs: readonly T[], season: SeasonKitchenFacts, todayIso: string, isSaturday: boolean): T[] {
  return subs.filter((sub) => {
    if (sub.week_type === '5DAYS' && isSaturday) return false
    if ((sub.paused_dates ?? []).includes(todayIso)) return false
    return kitchenCountsPlan({
      gate: season.gate,
      day: todayIso,
      wrapUpDay: season.wrapUpDay,
      closeDay: season.closeDay,
      closureDates: season.closureDates,
      plan: kitchenFactsFor(sub),
    })
  })
}

export async function loadSeasonKitchenGate(todayIso: string): Promise<SeasonKitchenRead> {
  const sb = createAdminSupabaseClient()
  const settings = await sb.from('intake_settings').select('season_phase, wrap_up_day, close_day').maybeSingle()
  if (settings.error) {
    captureError(settings.error, { area: 'kitchen', op: 'loadSeasonKitchenGate', todayIso })
    return { ok: false }
  }
  const row = (settings.data ?? {}) as { season_phase?: string | null; wrap_up_day?: string | null; close_day?: string | null }
  const phase: SeasonPhase = row.season_phase === 'winding_down' || row.season_phase === 'break' ? row.season_phase : 'open'
  const wrapUpDay = row.wrap_up_day ?? null
  const closeDay = row.close_day ?? null
  const gate = seasonKitchenGate({ phase, wrapUpDay, closeDay, todayAe: todayIso })
  if (gate === 'closed_for_break') return { ok: true, gate, wrapUpDay, closeDay, closureDates: new Set() }

  // Today's closure, and on a buffer day every closure since the wrap-up day
  // (a closed buffer day does not use a grant).
  const from = gate === 'buffer_only' && wrapUpDay ? addDaysIso(wrapUpDay, 1) : todayIso
  const closures = await sb.from('company_closures').select('closure_date').gte('closure_date', from).lte('closure_date', todayIso)
  if (closures.error) {
    captureError(closures.error, { area: 'kitchen', op: 'loadSeasonKitchenGate', todayIso })
    return { ok: false }
  }
  const closureDates = new Set(((closures.data ?? []) as Array<{ closure_date: string }>).map((r) => String(r.closure_date).slice(0, 10)))
  return { ok: true, gate, wrapUpDay, closeDay, closureDates }
}

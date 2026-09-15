import 'server-only'

/**
 * The season side of the customer skip actions (spec §7.2).
 *
 * Reads the season fresh (a skip moves money, so a 30-second-old cache is not
 * good enough), the company closures and the order's money, and calls the SQL
 * functions that own every credited-skip and buffer-grant write. The customer's
 * id always comes from withOwnedSubscription, never from the client.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { getIntakeState } from '@/infra/config/intake'
import { getCompanyClosureDates } from '@/infra/supabase/subscriptions-repo'
import type { OrderMoney } from '../domain/meal-value'
import { skipCreditFilsFor, type SkipSeason } from '../domain/skip-outcome'
import { friendlySkipError } from '../domain/season-skip-errors'

export type OrderMoneyRead = { ok: true; order: OrderMoney | null } | { ok: false }

/** The order that bought this plan, newest first (the same pick as the Season page). */
export async function loadOrderMoney(subscriptionId: string): Promise<OrderMoneyRead> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb
    .from('orders')
    .select('amount_paid_fils, credit_applied_fils, meals_count, price_per_meal, stripe_session_id')
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false }
  if (!data) return { ok: true, order: null }
  const row = data as {
    amount_paid_fils: number | null
    credit_applied_fils: number | null
    meals_count: number | null
    price_per_meal: number | string | null
    stripe_session_id: string | null
  }
  return {
    ok: true,
    order: {
      amountPaidFils: row.amount_paid_fils,
      creditAppliedFils: row.credit_applied_fils,
      mealsCount: row.meals_count,
      pricePerMealAed: row.price_per_meal == null ? null : Number(row.price_per_meal),
      stripeSessionId: row.stripe_session_id,
    },
  }
}

export interface SkipSeasonContext {
  season: SkipSeason
  closureDates: ReadonlySet<string>
  /** Credit for one skipped delivery day; null when unknown or not winding down. */
  creditFils: number | null
}

export async function loadSkipSeasonContext(sub: { id: string; plan_name: string; meals_per_day: number | null }): Promise<SkipSeasonContext> {
  const intake = await getIntakeState({ fresh: true })
  const season: SkipSeason = {
    phase: intake.phase,
    wrapUpDay: intake.wrapUpDay,
    closeDay: intake.closeDay,
    bufferDays: intake.bufferDays,
  }
  if (season.phase !== 'winding_down' || !season.wrapUpDay) {
    return { season, closureDates: new Set(), creditFils: null }
  }
  const [closures, money] = await Promise.all([getCompanyClosureDates(), loadOrderMoney(sub.id)])
  return {
    season,
    closureDates: new Set(closures),
    creditFils: money.ok ? skipCreditFilsFor({ planName: sub.plan_name, mealsPerDay: sub.meals_per_day, order: money.order }) : null,
  }
}

export type SeasonSkipApplied =
  | { ok: true; outcome: 'grant'; makeUpDay: string }
  | { ok: true; outcome: 'credited'; creditFils: number; creditStatus: 'approved' | 'pending' | 'none' }
  | { ok: false; error: string }

export async function applySeasonSkip(input: {
  customerId: string
  subscriptionId: string
  mealDate: string
  sameDay: boolean
  outcome: 'grant' | 'credited'
  season: SkipSeason
  skipCap: number
  expectedCreditFils: number | null
}): Promise<SeasonSkipApplied> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb.rpc('season_skip', {
    p_customer_id: input.customerId,
    p_subscription_id: input.subscriptionId,
    p_meal_date: input.mealDate,
    p_same_day: input.sameDay,
    p_outcome: input.outcome,
    p_wrap_up: input.season.wrapUpDay,
    p_close: input.season.closeDay,
    p_skip_cap: input.skipCap,
    p_expected_credit_fils: input.expectedCreditFils,
  })
  if (error) return { ok: false, error: friendlySkipError(error.message) }
  const row = (data ?? {}) as { outcome?: string; make_up_day?: string; credit_fils?: number; credit_status?: string }
  if (row.outcome === 'grant') return { ok: true, outcome: 'grant', makeUpDay: String(row.make_up_day) }
  const status = row.credit_status === 'approved' || row.credit_status === 'pending' ? row.credit_status : 'none'
  return { ok: true, outcome: 'credited', creditFils: Number(row.credit_fils ?? 0), creditStatus: status }
}

export async function applySeasonUnskip(input: {
  customerId: string
  subscriptionId: string
  mealDate: string
}): Promise<{ ok: true; kind: 'credited' | 'normal' } | { ok: false; error: string }> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb.rpc('season_unskip', {
    p_customer_id: input.customerId,
    p_subscription_id: input.subscriptionId,
    p_meal_date: input.mealDate,
  })
  if (error) return { ok: false, error: friendlySkipError(error.message) }
  return { ok: true, kind: (data as { kind?: string } | null)?.kind === 'credited' ? 'credited' : 'normal' }
}

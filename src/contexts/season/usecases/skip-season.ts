import 'server-only'

/**
 * The season side of the customer skip actions (spec §7.2).
 *
 * Reads the season fresh and strictly (a skip moves money, so neither a
 * 30-second-old cache nor a fail-open default is good enough), the company
 * closures and the order's money, and calls the SQL
 * functions that own every credited-skip and buffer-grant write. The customer's
 * id always comes from withOwnedSubscription, never from the client.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import type { OrderMoney } from '../domain/meal-value'
import { skipCreditFilsFor, type SkipSeason } from '../domain/skip-outcome'
import { friendlySkipError } from '../domain/season-skip-errors'

export type OrderMoneyRead = { ok: true; order: OrderMoney | null } | { ok: false }

/** The order that bought this plan, newest first (the same pick as the Season page). */
export async function loadOrderMoney(subscriptionId: string): Promise<OrderMoneyRead> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb
    .from('orders')
    .select('amount_paid_fils, credit_applied_fils, meals_count, price_per_meal, stripe_session_id, stripe_payment_id')
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
    stripe_payment_id?: string | null
  }
  return {
    ok: true,
    order: {
      amountPaidFils: row.amount_paid_fils,
      creditAppliedFils: row.credit_applied_fils,
      mealsCount: row.meals_count,
      pricePerMealAed: row.price_per_meal == null ? null : Number(row.price_per_meal),
      stripeSessionId: row.stripe_session_id,
      stripePaymentId: row.stripe_payment_id ?? null,
    },
  }
}

export interface SkipSeasonContext {
  season: SkipSeason
  closureDates: ReadonlySet<string>
  /** Credit for one skipped delivery day; null when unknown or not winding down. */
  creditFils: number | null
  /** The order could not be read: a credited skip is refused, never treated as worth nothing. */
  creditReadFailed: boolean
}

export type SkipSeasonContextRead = { ok: true; context: SkipSeasonContext } | { ok: false }

/**
 * The season row, read strictly. getIntakeState fails open so a settings blip
 * never blocks a sale; a skip moves money and kitchen days, so here a failed
 * read is a failed read (spec §5.1). Not exported: only the skip step needs it.
 */
async function readSeasonStrict(): Promise<SkipSeason | null> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb
    .from('intake_settings')
    .select('season_phase, wrap_up_day, close_day, buffer_delivery_days')
    .maybeSingle()
  if (error || !data) return null
  const row = data as Record<string, unknown>
  return {
    phase: row.season_phase === 'winding_down' || row.season_phase === 'break' ? row.season_phase : 'open',
    wrapUpDay: row.wrap_up_day == null ? null : String(row.wrap_up_day),
    closeDay: row.close_day == null ? null : String(row.close_day),
    bufferDays: row.buffer_delivery_days == null ? 1 : Number(row.buffer_delivery_days),
  }
}

/** Every company closure, read strictly (getCompanyClosureDates returns [] on error). */
async function readClosuresStrict(): Promise<string[] | null> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb.from('company_closures').select('closure_date')
  if (error) return null
  return ((data ?? []) as Array<{ closure_date: unknown }>).map((r) => String(r.closure_date).slice(0, 10))
}

/**
 * Everything the skip step needs, or `{ ok: false }` when the season or the
 * closures could not be read. A failed read refuses the skip whatever the
 * season turns out to be: a wind-down skip that fell back to a plain skip
 * would cost the customer a paid meal and promise a make-up day the kitchen
 * will not cook.
 */
export async function loadSkipSeasonContext(sub: { id: string; plan_name: string; meals_per_day: number | null }): Promise<SkipSeasonContextRead> {
  const season = await readSeasonStrict()
  if (!season) return { ok: false }
  if (season.phase !== 'winding_down' || !season.wrapUpDay) {
    return { ok: true, context: { season, closureDates: new Set(), creditFils: null, creditReadFailed: false } }
  }
  const [closures, money] = await Promise.all([readClosuresStrict(), loadOrderMoney(sub.id)])
  if (!closures) return { ok: false }
  return {
    ok: true,
    context: {
      season,
      closureDates: new Set(closures),
      creditFils: money.ok ? skipCreditFilsFor({ planName: sub.plan_name, mealsPerDay: sub.meals_per_day, order: money.order }) : null,
      creditReadFailed: !money.ok,
    },
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

/**
 * Drop buffer grants whose skip is gone (review fix A3). planPause cancels the
 * future skips inside the pause window through the user client; when one of
 * them was the skip that used the buffer, its grant would otherwise keep a
 * buffer day cooking for a meal the plan no longer owes there. Runs after the
 * pause is committed, so a failure here leaves the pause in place and only
 * the trim to redo; the RPC is idempotent.
 */
export async function trimSeasonBufferGrants(input: { subscriptionId: string }): Promise<{ ok: true; grants: number } | { ok: false; error: string }> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb.rpc('season_trim_buffer_grants', { p_subscription_id: input.subscriptionId })
  if (error) return { ok: false, error: error.message }
  return { ok: true, grants: Number(data ?? 0) }
}

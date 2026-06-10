/**
 * plan_pricing reader — the DB half of "the admin panel is the single source
 * of truth for prices".
 *
 * Admins insert rows via /admin/pricing; this repo resolves which rows are
 * ACTIVE today (Asia/Dubai calendar) and hands them to the pure pricing
 * engine (contexts/subscriptions/domain/pricing.ts) as plain serializable
 * objects, so server pages can thread them into client components untouched.
 *
 * plan_pricing has RLS enabled with no policies — only the service-role
 * client can read it, which is fine: every consumer is server-side (plan /
 * explore-plans page SSR, /api/checkout validation, /admin/pricing).
 *
 * Fail-open: on any fetch error we return [] so customers fall back to the
 * code-default prices rather than hitting a broken plan page. The error is
 * logged — a missing override surfaces as "price reverted to code default",
 * never as a crash.
 */

import { createAdminSupabaseClient } from './admin-client'
import type { PriceOverride } from '@/contexts/subscriptions/domain/pricing'

/** Today's date in Asia/Dubai (UTC+4 year-round, no DST). */
function todayAE(): string {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function fetchActivePriceOverrides(): Promise<PriceOverride[]> {
  const sb = createAdminSupabaseClient()
  const today = todayAE()

  // Active window: started on/before today, and either open-ended or ending
  // AFTER today (effective_to is exclusive — setting it to today retires the
  // row immediately; the admin "End" action relies on this).
  const { data, error } = await sb
    .from('plan_pricing')
    .select('plan_id, preference, week_type, veg_day_count, price_per_meal, effective_from, created_at')
    .lte('effective_from', today)
    .or(`effective_to.is.null,effective_to.gt.${today}`)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('fetchActivePriceOverrides failed — falling back to code prices:', error.message)
    return []
  }

  // Several rows can target the same (plan, pref, week_type, veg_day_count)
  // key — e.g. a price raised twice. The sort above puts the most recent
  // effective_from (then created_at) first; keep only that one per key.
  const seen = new Set<string>()
  const active: PriceOverride[] = []
  for (const r of data ?? []) {
    const key = `${r.plan_id}|${r.preference}|${r.week_type}|${r.veg_day_count ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    active.push({
      plan_id: r.plan_id,
      preference: r.preference,
      week_type: r.week_type,
      veg_day_count: r.veg_day_count,
      price_per_meal: Number(r.price_per_meal),
    })
  }
  return active
}

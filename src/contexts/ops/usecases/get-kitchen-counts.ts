import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { isVegOnDayName } from '@/contexts/subscriptions/domain/veg-day'
import { captureError } from '@/infra/logging/capture-error'
import { KITCHEN_SUB_COLUMNS, loadSeasonKitchenGate, plansCookingToday, type KitchenSubRow } from './season-kitchen-gate'

/**
 * Counts veg and non-veg meals for today's kitchen prep.
 *
 * A plan counts only when the delivery tick will cook it tonight (spec G5):
 * Active, not held for next semester, a delivery day, not a closure, not
 * skipped, below the credited cap, no resume after the cutoff, and after the
 * wrap-up day only with a buffer grant for today. Never by status alone.
 * During the break, and after the close day, the kitchen reads zero with
 * `closedForBreak: true`. The caller (RSC) owns all UAE time computation.
 *
 * @param todayIso  - "YYYY-MM-DD" in UAE wall time
 * @param dayName   - "Monday"…"Saturday" in UAE wall time (used for isVegOnDayName)
 * @param isSaturday - true when UAE wall-clock day is Saturday (5DAYS plans skip Saturday)
 */
export interface KitchenCounts {
  vegCount: number
  nonVegCount: number
  unavailable: boolean
  closedForBreak: boolean
}

type SubRow = KitchenSubRow & {
  id: string
  customer_id: string
  paused_dates: string[] | null
  veg_days: string[] | null
  meal_preference_type: string | null
}

export async function getKitchenCounts(
  todayIso: string,
  dayName: string,
  isSaturday: boolean,
): Promise<KitchenCounts> {
  const none = { vegCount: 0, nonVegCount: 0 }

  // Release It! L5 (Phase 3): fail LOUD, not silent. A season read error must
  // surface as unavailable, never as a believable count.
  const season = await loadSeasonKitchenGate(todayIso)
  if (!season.ok) return { ...none, unavailable: true, closedForBreak: false }
  if (season.gate === 'closed_for_break') return { ...none, unavailable: false, closedForBreak: true }

  const sb = createAdminSupabaseClient()
  const subsRes = await sb
    .from('subscriptions')
    .select(`id, customer_id, paused_dates, veg_days, meal_preference_type, ${KITCHEN_SUB_COLUMNS}`)
    .in('status', ['Active'])
  if (subsRes.error) {
    captureError(subsRes.error, { area: 'kitchen', op: 'getKitchenCounts', todayIso })
    return { ...none, unavailable: true, closedForBreak: false }
  }

  const subs = plansCookingToday((subsRes.data ?? []) as SubRow[], season, todayIso, isSaturday)

  // Capacity (Phase 7 / L6): fetch only the customers who actually have an
  // active subscription, not the entire (ever-growing) customers table.
  const customerIds = [...new Set(subs.map((s) => s.customer_id))]
  const customersRes = customerIds.length
    ? await sb.from('customers').select('id, meal_preference_type, veg_days, is_demo').in('id', customerIds)
    : { data: [] as Array<{ id: string; meal_preference_type: string | null; veg_days: string[] | null; is_demo: boolean | null }>, error: null }
  if (customersRes.error) {
    captureError(customersRes.error, { area: 'kitchen', op: 'getKitchenCounts', todayIso })
    return { ...none, unavailable: true, closedForBreak: false }
  }

  const customerMap = new Map<string, { meal_preference_type: string | null; veg_days: string[] | null }>()
  for (const c of (customersRes.data ?? []) as Array<{ id: string; meal_preference_type: string | null; veg_days: string[] | null; is_demo: boolean | null }>) {
    // Investor demo accounts never reach the kitchen.
    if (c.is_demo) continue
    customerMap.set(c.id, c)
  }

  let vegCount = 0
  let nonVegCount = 0

  for (const sub of subs) {
    const cust = customerMap.get(sub.customer_id)
    if (!cust) continue

    if (isVegOnDayName({ customer: cust, subscription: sub }, dayName)) {
      vegCount++
    } else {
      nonVegCount++
    }
  }

  return { vegCount, nonVegCount, unavailable: false, closedForBreak: false }
}

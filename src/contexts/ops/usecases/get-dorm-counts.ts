import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { KITCHEN_SUB_COLUMNS, loadSeasonKitchenGate, plansCookingToday, type KitchenSubRow, type SeasonKitchenFacts } from './season-kitchen-gate'

/**
 * Per-dorm meal count for today's rider pickup.
 *
 * Same rule as getKitchenCounts (spec G5): a plan counts only when the
 * delivery tick will cook it tonight, and nothing counts during the break or
 * after the close day. Grouped by customers.dorm_name: the rider carries every
 * box (veg and non-veg) to the same dorm, one box per plan.
 *
 * When the season cannot be read the rider keeps working on the normal rule:
 * during the break no Active plan with meals left exists, so nothing extra is
 * counted.
 *
 * Returns a plain Record (not a Map) so it can be passed across the
 * RSC/client boundary without serialization issues.
 */
export type DormCountsRecord = Record<string, number>

type SubRow = KitchenSubRow & { id: string; customer_id: string; paused_dates: string[] | null }

export async function getDormCounts(
  todayIso: string,
  dayName: string,
  isSaturday: boolean,
): Promise<DormCountsRecord> {
  // dayName is accepted for API symmetry with getKitchenCounts (caller passes it)
  // but the rider count is veg-blind, so no isVegOnDayName call is needed.
  void dayName

  const read = await loadSeasonKitchenGate(todayIso)
  const season: SeasonKitchenFacts = read.ok ? read : { ok: true, gate: 'normal', wrapUpDay: null, closeDay: null, closureDates: new Set<string>() }
  if (season.gate === 'closed_for_break') return {}

  const sb = createAdminSupabaseClient()
  const subsRes = await sb
    .from('subscriptions')
    .select(`id, customer_id, paused_dates, ${KITCHEN_SUB_COLUMNS}`)
    .in('status', ['Active'])

  const subs = plansCookingToday((subsRes.data ?? []) as SubRow[], season, todayIso, isSaturday)

  // Capacity (Phase 7 / L6): fetch only the customers who actually have an
  // active subscription, not the entire (ever-growing) customers table.
  const customerIds = [...new Set(subs.map((s) => s.customer_id))]
  const customersRes = customerIds.length
    ? await sb.from('customers').select('id, dorm_name').in('id', customerIds)
    : { data: [] as Array<{ id: string; dorm_name: string | null }> }

  const customerMap = new Map<string, string | null>()
  for (const c of (customersRes.data ?? []) as Array<{ id: string; dorm_name: string | null }>) {
    customerMap.set(c.id, c.dorm_name)
  }

  const counts: DormCountsRecord = {}

  for (const sub of subs) {
    const dormName = customerMap.get(sub.customer_id)
    // Customers without a known dorm have no delivery stop, so skip them
    if (!dormName) continue

    counts[dormName] = (counts[dormName] ?? 0) + 1
  }

  return counts
}

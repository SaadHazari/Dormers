import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'

/**
 * Per-dorm meal count for today's rider pickup.
 *
 * Mirrors getKitchenCounts exactly — same parallel fetch, same filters
 * (5DAYS Saturday skip, skipped_dates, paused_dates) — but groups by
 * customers.dorm_name instead of summing veg/non-veg.
 *
 * The rider carries all boxes (veg + non-veg) to the same dorm — each
 * active subscription = 1 box regardless of meal preference.
 *
 * Returns a plain Record (not a Map) so it can be passed across the
 * RSC/client boundary without serialization issues.
 *
 * @param todayIso  - "YYYY-MM-DD" in UAE wall time
 * @param dayName   - "Monday"…"Saturday" in UAE wall time
 * @param isSaturday - true when UAE wall-clock day is Saturday (5DAYS plans skip Saturday)
 */
export type DormCountsRecord = Record<string, number>

export async function getDormCounts(
  todayIso: string,
  dayName: string,
  isSaturday: boolean,
): Promise<DormCountsRecord> {
  // dayName is accepted for API symmetry with getKitchenCounts (caller passes it)
  // but the rider count is veg-blind — no isVegOnDayName call needed
  void dayName

  const sb = createAdminSupabaseClient()

  const subsRes = await sb
    .from('subscriptions')
    .select('id, customer_id, week_type, skipped_dates, paused_dates')
    .in('status', ['Active', 'Paused', 'Skipped'])

  const subs = (subsRes.data ?? []) as Array<{
    id: string
    customer_id: string
    week_type: string | null
    skipped_dates: string[] | null
    paused_dates: string[] | null
  }>

  // Capacity (Phase 7 / L6): fetch only the customers who actually have an
  // active subscription, not the entire (ever-growing) customers table.
  const customerIds = [...new Set(subs.map((s) => s.customer_id))]
  const customersRes = customerIds.length
    ? await sb.from('customers').select('id, dorm_name').in('id', customerIds)
    : { data: [] as Array<{ id: string; dorm_name: string | null }> }

  const customerMap = new Map<string, string | null>()
  for (const c of (customersRes.data ?? []) as Array<{
    id: string
    dorm_name: string | null
  }>) {
    customerMap.set(c.id, c.dorm_name)
  }

  const counts: DormCountsRecord = {}

  for (const sub of subs) {
    // 5DAYS plans do not deliver on Saturday
    if (sub.week_type === '5DAYS' && isSaturday) continue
    // Skip if today is in skipped_dates
    if ((sub.skipped_dates ?? []).includes(todayIso)) continue
    // Skip if today is in paused_dates
    if ((sub.paused_dates ?? []).includes(todayIso)) continue

    const dormName = customerMap.get(sub.customer_id)
    // Customers without a known dorm have no delivery stop — skip them
    if (!dormName) continue

    counts[dormName] = (counts[dormName] ?? 0) + 1
  }

  return counts
}

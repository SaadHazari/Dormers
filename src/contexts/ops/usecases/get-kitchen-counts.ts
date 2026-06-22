import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { isVegOnDayName } from '@/contexts/subscriptions/domain/veg-day'
import { captureError } from '@/infra/logging/capture-error'

/**
 * Counts veg and non-veg meals for today's kitchen prep.
 *
 * Mirrors the admin deliveries page query exactly so the kitchen display
 * shows the same totals the admin sees. The caller (RSC) owns all UAE time
 * computation and passes pre-computed values here to keep this function pure.
 *
 * @param todayIso  - "YYYY-MM-DD" in UAE wall time (used to filter skipped/paused dates)
 * @param dayName   - "Monday"…"Saturday" in UAE wall time (used for isVegOnDayName)
 * @param isSaturday - true when UAE wall-clock day is Saturday (5DAYS plans skip Saturday)
 */
export async function getKitchenCounts(
  todayIso: string,
  dayName: string,
  isSaturday: boolean,
): Promise<{ vegCount: number; nonVegCount: number; unavailable: boolean }> {
  const sb = createAdminSupabaseClient()

  const [subsRes, customersRes] = await Promise.all([
    sb
      .from('subscriptions')
      .select('id, customer_id, week_type, skipped_dates, paused_dates')
      .in('status', ['Active', 'Paused', 'Skipped']),
    sb
      .from('customers')
      .select('id, meal_preference_type, veg_days'),
  ])

  // Release It! L5 (Phase 3): fail LOUD, not silent. Previously a read error
  // coalesced to empty arrays and returned 0/0 — a believable-but-wrong count
  // that could make the kitchen under-cook (or skip) an entire service with no
  // warning. Now a DB error is surfaced to Sentry and flagged so the display
  // renders "counts unavailable" instead of a fake zero.
  if (subsRes.error || customersRes.error) {
    captureError(subsRes.error ?? customersRes.error, {
      area: 'kitchen',
      op: 'getKitchenCounts',
      todayIso,
    })
    return { vegCount: 0, nonVegCount: 0, unavailable: true }
  }

  const customerMap = new Map<
    string,
    { pref: string | null; vegDays: string[] | null }
  >()
  for (const c of (customersRes.data ?? []) as Array<{
    id: string
    meal_preference_type: string | null
    veg_days: string[] | null
  }>) {
    customerMap.set(c.id, { pref: c.meal_preference_type, vegDays: c.veg_days })
  }

  let vegCount = 0
  let nonVegCount = 0

  for (const sub of (subsRes.data ?? []) as Array<{
    id: string
    customer_id: string
    week_type: string | null
    skipped_dates: string[] | null
    paused_dates: string[] | null
  }>) {
    // 5DAYS plans do not deliver on Saturday
    if (sub.week_type === '5DAYS' && isSaturday) continue
    // Skip if today is in skipped_dates
    if ((sub.skipped_dates ?? []).includes(todayIso)) continue
    // Skip if today is in paused_dates
    if ((sub.paused_dates ?? []).includes(todayIso)) continue

    const cust = customerMap.get(sub.customer_id)
    if (!cust) continue

    if (isVegOnDayName(cust.pref, cust.vegDays, dayName)) {
      vegCount++
    } else {
      nonVegCount++
    }
  }

  return { vegCount, nonVegCount, unavailable: false }
}

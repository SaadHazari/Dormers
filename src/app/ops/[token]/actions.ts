'use server'

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'

/**
 * Log a rider pickup confirmation to delivery_events.
 *
 * Upsert (not insert) so the rider can re-tap "Confirm Pickup" without
 * hitting the UNIQUE(delivery_date, dorm_name, trip_number) constraint.
 *
 * deliveryDateIso is computed in the RSC with UAE UTC+4 offset — never
 * computed here, where Node.js runs in UTC.
 */
export async function confirmPickup(
  dormName: string,
  expectedCount: number,
  opsTokenId: string,
  deliveryDateIso: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = createAdminSupabaseClient()

  const { error } = await sb.from('delivery_events').upsert(
    {
      delivery_date: deliveryDateIso,
      dorm_name: dormName,
      trip_number: 1,
      expected_count: expectedCount,
      ops_token_id: opsTokenId,
      confirmed_at: new Date().toISOString(),
      verified: false,
    },
    { onConflict: 'delivery_date,dorm_name,trip_number' },
  )

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

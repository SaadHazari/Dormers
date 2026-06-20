'use server'

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { validateOpsTokenById } from '@/contexts/ops/usecases/validate-token'

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
  // Auth — Server Actions are directly POST-invokable, so re-validate the
  // rider token here (the page's token gate does NOT protect this action).
  const token = await validateOpsTokenById(opsTokenId, 'rider')
  if (!token) return { ok: false, error: 'Invalid or revoked ops token' }

  const sb = createAdminSupabaseClient()

  // NOTE: `verified` is deliberately omitted. On a fresh insert the column
  // defaults to false; on conflict (a re-tapped "Confirm Pickup", e.g. after a
  // PWA reload) it is left untouched, so a dorm that was already delivered and
  // verified is NOT reset to verified=false (which would re-trigger the 8PM
  // failsafe). The drop-off path owns the verified flag.
  const { error } = await sb.from('delivery_events').upsert(
    {
      delivery_date: deliveryDateIso,
      dorm_name: dormName,
      trip_number: 1,
      expected_count: expectedCount,
      ops_token_id: opsTokenId,
      confirmed_at: new Date().toISOString(),
    },
    { onConflict: 'delivery_date,dorm_name,trip_number' },
  )

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Manual drop-off confirmation — used when Gemini cannot verify (VER-11).
 * Updates the existing delivery_events row with rider_count only.
 * Does NOT set verified=true — the 8PM failsafe cron catches unverified rows.
 */
export async function confirmDropoff(
  dormName: string,
  riderCount: number,
  opsTokenId: string,
  deliveryDateIso: string,
): Promise<{ ok: boolean; error?: string }> {
  // Auth — Server Actions are directly POST-invokable, so re-validate the
  // rider token here (the page's token gate does NOT protect this action).
  const token = await validateOpsTokenById(opsTokenId, 'rider')
  if (!token) return { ok: false, error: 'Invalid or revoked ops token' }

  const sb = createAdminSupabaseClient()

  const { data, error } = await sb
    .from('delivery_events')
    .update({
      rider_count: riderCount,
      verified: false,
      confirmed_at: new Date().toISOString(),
    })
    .eq('delivery_date', deliveryDateIso)
    .eq('dorm_name', dormName)
    .eq('trip_number', 1)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'No delivery event found for this dorm today' }
  return { ok: true }
}

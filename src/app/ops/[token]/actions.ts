'use server'

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { validateOpsTokenById } from '@/contexts/ops/usecases/validate-token'
import { notifyRunUpdate } from '@/infra/admin-alerts/notify'

// NOTE: pickup confirmation moved to /api/ops/confirm-pickup — the pickup
// photo is now the gate, and the per-dorm delivery_events upserts happen
// server-side in that route.

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

  // Owner run update — manual confirms currently surface nowhere until the
  // 8PM failsafe; tell the owner now. Fire and forget.
  void notifyRunUpdate(
    `Delivered to ${dormName}`,
    `Rider confirmed ${riderCount} boxes by hand, the photo could not be checked`,
    'Worth a glance in Photos.',
  )

  return { ok: true }
}

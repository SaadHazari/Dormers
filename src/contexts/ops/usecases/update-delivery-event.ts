// src/contexts/ops/usecases/update-delivery-event.ts
// Phase 5: UPDATE delivery_events row with drop-off verification data.
//
// Phase 4's confirmPickup already created the row (verified: false).
// This use-case updates that existing row — never inserts a new one.
// Caller detects zero-row updates via rowsAffected to surface the
// "pickup not confirmed" edge case (VER — Pitfall 5).

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'

export interface UpdateDeliveryPayload {
  deliveryDateIso: string
  dormName: string
  tripNumber: number
  riderCount: number
  geminiCount: number | null
  geminiConfidence: 'high' | 'medium' | 'low' | null
  photoPath: string | null
  verified: boolean
  geoLat: number | null
  geoLng: number | null
}

export interface UpdateDeliveryResult {
  ok: boolean
  rowsAffected: number
  error?: string
}

/**
 * UPDATE the existing delivery_events row for (deliveryDateIso, dormName, tripNumber)
 * with the rider/Gemini counts, photo path, geolocation, and verified flag.
 *
 * Returns rowsAffected so callers can detect the "no matching row" edge case
 * (Phase 4 confirmPickup must have run before Phase 5 drop-off verification).
 *
 * Sets confirmed_at to the current ISO timestamp only when verified is true;
 * null otherwise (keeps the column null for manual-confirm and mismatch cases).
 */
export async function updateDeliveryEvent(
  payload: UpdateDeliveryPayload,
): Promise<UpdateDeliveryResult> {
  const sb = createAdminSupabaseClient()

  const updateData = {
    rider_count: payload.riderCount,
    gemini_count: payload.geminiCount,
    gemini_confidence: payload.geminiConfidence,
    photo_path: payload.photoPath,
    verified: payload.verified,
    confirmed_at: payload.verified ? new Date().toISOString() : null,
    geo_lat: payload.geoLat,
    geo_lng: payload.geoLng,
  }

  const { data, error } = await sb
    .from('delivery_events')
    .update(updateData)
    .eq('delivery_date', payload.deliveryDateIso)
    .eq('dorm_name', payload.dormName)
    .eq('trip_number', payload.tripNumber)
    .select('id')

  console.log(
    `[update-delivery-event] UPDATE delivery_events for ${payload.dormName} on ${payload.deliveryDateIso}: verified=${payload.verified}, rows=${data?.length ?? 0}`,
  )

  if (error) {
    return { ok: false, rowsAffected: 0, error: error.message }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      rowsAffected: 0,
      error: 'No matching delivery_events row found (pickup may not have been confirmed)',
    }
  }

  return { ok: true, rowsAffected: data.length }
}

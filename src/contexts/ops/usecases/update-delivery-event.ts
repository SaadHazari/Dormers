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
  /** Every attempt photo, oldest first. Omit to leave the history untouched. */
  photoPaths?: string[]
  /** Server-authoritative photo budget spent so far. Omit to leave untouched. */
  verifyAttempts?: number
  /**
   * When the food was recorded as at the dorm. This is the customer-facing
   * fact and is deliberately NOT the same as `verified` — a disputed count
   * must never leave a dorm without its delivery WhatsApps. Omit to leave
   * untouched (never clear an earlier stamp on a later attempt).
   */
  deliveredAt?: string
  /** When the owner was flagged about this drop-off. Omit to leave untouched. */
  escalatedAt?: string
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
 * confirmed_at is always restamped — it reads as "last updated" on the admin
 * Photos page. It used to be nulled on every unverified write, which quietly
 * erased the pickup timestamp the moment a count was disputed.
 */
export async function updateDeliveryEvent(
  payload: UpdateDeliveryPayload,
): Promise<UpdateDeliveryResult> {
  const sb = createAdminSupabaseClient()

  const updateData: Record<string, unknown> = {
    rider_count: payload.riderCount,
    gemini_count: payload.geminiCount,
    gemini_confidence: payload.geminiConfidence,
    photo_path: payload.photoPath,
    verified: payload.verified,
    confirmed_at: new Date().toISOString(),
    geo_lat: payload.geoLat,
    geo_lng: payload.geoLng,
  }

  // Omitted fields stay untouched. Attempt 2 must never wipe what attempt 1
  // recorded — especially delivered_at and escalated_at, which are one-way.
  if (payload.photoPaths !== undefined) updateData.photo_paths = payload.photoPaths
  if (payload.verifyAttempts !== undefined) updateData.verify_attempts = payload.verifyAttempts
  if (payload.deliveredAt !== undefined) updateData.delivered_at = payload.deliveredAt
  if (payload.escalatedAt !== undefined) updateData.escalated_at = payload.escalatedAt

  const { data, error } = await sb
    .from('delivery_events')
    .update(updateData)
    .eq('delivery_date', payload.deliveryDateIso)
    .eq('dorm_name', payload.dormName)
    .eq('trip_number', payload.tripNumber)
    .select('id')

  console.log(
    `[update-delivery-event] UPDATE delivery_events for ${payload.dormName} on ${payload.deliveryDateIso}: verified=${payload.verified}, delivered=${payload.deliveredAt !== undefined}, rows=${data?.length ?? 0}`,
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

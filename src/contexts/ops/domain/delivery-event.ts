export type GeminiConfidence = 'high' | 'medium' | 'low'

export interface DeliveryEvent {
  id: string
  delivery_date: string
  dorm_name: string
  trip_number: number
  expected_count: number
  rider_count: number | null
  gemini_count: number | null
  gemini_confidence: GeminiConfidence | null
  /** Counts agree. Audit fact only — see delivered_at for the customer fact. */
  verified: boolean
  /** Food recorded as at the dorm. Drives the customer WhatsApp fanout. */
  delivered_at: string | null
  /** Owner flagged about an unresolved count dispute. */
  escalated_at: string | null
  /** Photo submissions spent, server-authoritative, capped at MAX_VERIFY_ATTEMPTS. */
  verify_attempts: number
  photo_path: string | null
  /** Every attempt photo, oldest first. photo_path mirrors the latest. */
  photo_paths: string[]
  ops_token_id: string | null
  confirmed_at: string | null
  created_at: string
}

export function isTripleMatch(event: DeliveryEvent): boolean {
  return (
    event.rider_count !== null &&
    event.gemini_count !== null &&
    event.expected_count === event.rider_count &&
    event.rider_count === event.gemini_count
  )
}

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
  verified: boolean
  photo_path: string | null
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

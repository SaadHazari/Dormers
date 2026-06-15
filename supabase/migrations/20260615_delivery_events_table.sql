-- ============================================================================
-- Delivery events — one row per dorm per delivery day per trip.
--
-- Tracks the chain of custody for each delivery:
--   1. Kitchen sets expected_count when meals are packed
--   2. Rider enters rider_count at delivery point
--   3. Gemini Vision processes the photo → gemini_count + gemini_confidence
--   4. Triple-match check: verified = (expected === rider === gemini)
--   5. confirmed_at timestamp set when verified flips to true
--
-- trip_number defaults to 1 for single-trip days. Future multi-trip
-- scenarios (e.g., split deliveries) increment per dorm per day.
--
-- photo_path stores the Supabase Storage key within the delivery-photos
-- bucket (e.g., "2026-06-15/dorm-a/trip-1.jpg").
--
-- The UNIQUE constraint on (delivery_date, dorm_name, trip_number) prevents
-- duplicate events for the same delivery slot.
--
-- RLS enabled with no policies — service-role access only, same posture as
-- ops_tokens. All reads/writes go through API routes using service-role.
-- ============================================================================

CREATE TABLE public.delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_date date NOT NULL DEFAULT CURRENT_DATE,
  dorm_name text NOT NULL,
  trip_number int NOT NULL DEFAULT 1,
  expected_count int NOT NULL,
  rider_count int,
  gemini_count int,
  gemini_confidence text,
  verified boolean NOT NULL DEFAULT false,
  photo_path text,
  ops_token_id uuid REFERENCES public.ops_tokens(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_date, dorm_name, trip_number)
);

COMMENT ON TABLE public.delivery_events IS
  'Chain-of-custody records for meal deliveries. One row per dorm per day per trip. verified=true when expected/rider/gemini counts triple-match.';

ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;

-- Explicit grants — PostgREST only exposes tables its roles can touch.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_events TO service_role;

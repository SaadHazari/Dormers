-- Phase 5: Add geolocation columns for rider drop-off audit trail (VER-13)
ALTER TABLE public.delivery_events
  ADD COLUMN IF NOT EXISTS geo_lat  double precision,
  ADD COLUMN IF NOT EXISTS geo_lng  double precision;

COMMENT ON COLUMN public.delivery_events.geo_lat IS
  'Rider GPS latitude at drop-off (nullable — may be denied/unavailable)';
COMMENT ON COLUMN public.delivery_events.geo_lng IS
  'Rider GPS longitude at drop-off (nullable — may be denied/unavailable)';

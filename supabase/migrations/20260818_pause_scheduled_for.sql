-- ============================================================================
-- pause_scheduled_for — the LAST DELIVERY DAY of the term (AE calendar date).
-- Null means no pause is scheduled. Semantics decided 2026-08-18:
--   * checkout refuses any plan whose projected end_date lands AFTER this day
--     (the sales taper: monthly naturally stops selling ~4 weeks out, weekly
--     ~1 week out, trial until the day itself),
--   * the daily tick flips paused=true the first AE day after it passes,
--   * deliveries ON the day still happen; existing journeys are never touched.
-- The RESUME side stays manual forever — no scheduled reopen, by locked
-- owner decision. This column schedules only the stop.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-18. This file is the source-control mirror.
-- ============================================================================

alter table public.intake_settings
  add column if not exists pause_scheduled_for date;

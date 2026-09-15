-- ============================================================================
-- Season wind-down, plan C: the break goes live (spec
-- docs/superpowers/specs/2026-09-14-season-wind-down-design.md §8, §11.6,
-- §13.1 item 11). season_break_tick replaces intake_scheduled_pause_tick (it
-- keeps both of that tick's paths) at 00:20 AE, retries at 00:50 and 01:20 AE,
-- and season_invariants_tick runs hourly (01:30 AE is 21:30 UTC). The minutes
-- avoid the closure tick at 20:15 UTC, which updates the same rows.
--
-- Applied on the day plan C deploys, immediately before the deploy, and never
-- after the close day. Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz)
-- through the Management API as migration `season_break_cron`. This file is
-- the mirror.
-- ============================================================================

BEGIN;

SELECT cron.unschedule('intake_scheduled_pause_00_15_ae');
SELECT cron.schedule('season_break_tick', '20,50 20 * * *', 'SELECT public.season_break_tick();');
SELECT cron.schedule('season_break_tick_last_retry', '20 21 * * *', 'SELECT public.season_break_tick();');
SELECT cron.schedule('season_invariants_tick', '30 * * * *', 'SELECT public.season_invariants_tick();');

COMMIT;

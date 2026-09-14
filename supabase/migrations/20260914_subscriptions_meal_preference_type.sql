-- ============================================================================
-- 2026-09-14 — every plan carries its own diet.
-- (Applied to the live DB via MCP the same day; this file is the repo record.)
--
-- Both checkout paths (the Stripe webhook and free-checkout) rewrite
-- customers.meal_preference_type to the NEW plan's diet the moment a renewal
-- is paid. The plan still running keeps delivering for days or weeks after
-- that, and every screen that decides veg or non-veg — the menu, dashboard
-- hero, weekly review, support bot, kitchen labels, delivery queue and kitchen
-- counts — read the customer's diet. A religious customer who renewed as
-- Non Veg therefore lost their veg days on the plan they had already paid for.
-- veg_days was copied onto the plan for this reason in 2026-05; the diet itself
-- never was. veg-day.ts now prefers subscriptions.meal_preference_type and
-- falls back to the customer's when a row has none.
--
-- 1. subscriptions.meal_preference_type, nullable (rows that predate it, and
--    any writer that forgets it, fall back to the customer's diet).
--    Grants: authenticated/anon hold table-level SELECT and INSERT, so
--    select('*') keeps working; UPDATE stays column-scoped and does not
--    include this column, so a customer cannot change a paid plan's diet.
-- 2. Backfill plans that are still running or queued from the customer's
--    current diet. On 2026-09-14 no customer had a queued renewal, so no running
--    plan's diet had drifted yet. Ended plans stay NULL — their historic diet
--    is unknown, and nothing reads it (the menu shows a returning customer the
--    diet they would renew with).
--    Neither end-date trigger fires on this column (UPDATE OF lists), so the
--    backfill moves no dates.
-- ============================================================================

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS meal_preference_type text;

UPDATE public.subscriptions s
SET meal_preference_type = c.meal_preference_type
FROM public.customers c
WHERE c.id = s.customer_id
  AND s.meal_preference_type IS NULL
  AND s.status IN ('Active', 'Paused', 'Skipped', 'Scheduled');

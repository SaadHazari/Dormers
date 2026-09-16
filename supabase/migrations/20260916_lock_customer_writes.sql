-- ============================================================================
-- Customers read their own rows and write nothing (security fix, 2026-09-16).
--
-- What was open, through the REST API with a customer's own login:
--   * subscriptions: status, start_date, skip and pause columns of their own
--     plans (set a plan back to Active, reset skips, move a start date past
--     every rule the app enforces).
--   * customers: meal type, week type and veg days of their own row, skipping
--     the "applies from your next plan" rule.
--   * weekly_reviews / monthly_reviews: insert rows for any subscription id.
--   * intake_waitlist: read every customer's waitlist row (a policy named
--     service_role_full_access was granted to PUBLIC with USING true).
--   * storage dish-photos: anyone, signed in or not, could upload, overwrite
--     or delete menu photos (same mistake on a storage policy).
-- And anon/authenticated held INSERT, UPDATE, DELETE and TRUNCATE on most
-- tables, closed only by row-level security (TRUNCATE ignores it).
--
-- The app now writes all of these with the service role after checking who
-- is calling (subscription-mutations, preferences, profile, savings, tour and
-- review actions). So customers keep SELECT (row-level security still limits
-- them to their own rows) and lose every write privilege, now and for tables
-- created later.
--
-- Applied live through the Management API as migration
-- `lock_customer_writes`. This file is the mirror.
-- ============================================================================

BEGIN;

-- Every write privilege, table and column level, on every public table.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM PUBLIC, anon, authenticated', t.relname);
  END LOOP;
END;
$$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM PUBLIC, anon, authenticated;

-- The write policies those privileges were for.
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update own customer record" ON public.customers;
DROP POLICY IF EXISTS "customers insert own weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "customers insert own monthly reviews" ON public.monthly_reviews;

-- Policies named for the service role but granted to everyone.
ALTER POLICY service_role_full_access ON public.intake_waitlist TO service_role;
ALTER POLICY service_role_full_access ON public.contacts TO service_role;
ALTER POLICY service_role_full_access ON public.contact_imports TO service_role;
ALTER POLICY service_role_full_access ON public.broadcasts TO service_role;
ALTER POLICY service_role_full_access ON public.broadcast_sends TO service_role;
ALTER POLICY service_role_full_access ON public.whatsapp_templates TO service_role;
ALTER POLICY "Service role full access for dish photos" ON storage.objects TO service_role;

-- A trigger function has no business being callable.
REVOKE EXECUTE ON FUNCTION public.tg_sync_customer_contact() FROM PUBLIC, anon, authenticated;

COMMIT;

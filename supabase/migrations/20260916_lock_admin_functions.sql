-- ============================================================================
-- Lock the admin functions (security fix, 2026-09-16).
--
-- Seven SECURITY DEFINER functions from the contact book and deletion work
-- kept Postgres's default EXECUTE for PUBLIC, so anyone holding the public
-- website key could call them through the REST API without signing in:
-- admin_delete_customer deleted a customer and their login, and the two
-- search functions returned names, phones and emails. Confirmed reachable
-- (HTTP 200 as anon) before this fix.
--
-- The app only calls them with the service role, and the one trigger that
-- calls upsert_customer_contact (tg_sync_customer_contact) is itself
-- SECURITY DEFINER owned by postgres, so nothing legitimate loses access.
--
-- Also: new functions in public no longer get EXECUTE for PUBLIC, anon or
-- authenticated by default. A function customers should call must be
-- granted explicitly.
--
-- Applied live through the Management API as migration
-- `lock_admin_functions`. This file is the mirror.
-- ============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.admin_contact_search(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_customer_delete_impact(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_customer_search(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_customer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_audience(text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_customer_contact(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.whatsapp_sent_last_24h() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_contact_search(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_customer_delete_impact(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_customer_search(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_customer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.broadcast_audience(text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_customer_contact(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_sent_last_24h() TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMIT;

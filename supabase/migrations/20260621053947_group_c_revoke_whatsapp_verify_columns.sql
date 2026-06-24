-- ============================================================
-- Group C — close the last hole from the 2026-06-19 security audit.
-- Revokes client (authenticated) UPDATE on the verified-phone columns.
-- Safe because the deployed markWhatsappVerified now writes these via the
-- service_role admin client, so no user-JWT path needs them. service_role
-- keeps full access. Applied to live via MCP; this file mirrors it.
-- ============================================================
REVOKE UPDATE (whatsapp_number, whatsapp_verified, whatsapp_verified_at)
  ON public.customers FROM authenticated;

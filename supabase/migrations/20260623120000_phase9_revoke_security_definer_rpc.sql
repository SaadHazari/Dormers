-- Release It! Phase 9 (DB hardening): these 3 SECURITY DEFINER functions are
-- trigger/helper functions, never meant to be called directly via the REST API.
-- Revoke EXECUTE from public/anon/authenticated to close the RPC surface
-- (advisor 0028/0029). SAFE: trigger invocation does NOT depend on the EXECUTE
-- grant of the triggering role, so signups (handle_new_user trigger), the
-- referral-review-queue alert trigger, and rls_auto_enable keep working.
-- service_role + owner retain EXECUTE.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-06-23 and verified (anon/auth: false, service_role: true, triggers intact).
-- This file is the source-control mirror.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.trg_referral_review_queue_alert() from public, anon, authenticated;

-- ============================================================
-- Group A — security lockdown (database-sentinel audit, 2026-06-19)
-- Applied to live (Dormers-Ohio) via MCP; this file mirrors it for the repo.
--
-- Revokes PUBLIC/anon/authenticated access to server-only RPCs, enables RLS
-- on 4 exposed tables, and restricts company_closures to service_role.
-- service_role (app, BYPASSRLS) and postgres (cron owner) retain all access.
-- Verified: every call site uses the service_role admin client; all 19 cron
-- jobs run as postgres; no Realtime; no browser client touches these.
-- ============================================================

-- 1) Revoke EXECUTE on server-only functions from untrusted roles
REVOKE EXECUTE ON FUNCTION public.admin_customer_search(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_kpi_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_cron_health() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_cron_job_history(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_cogs_aed_per_meal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_admin_whatsapp_alert(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_otp_attempt(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.append_post_payment_error(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_customer_notifications_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_renew_nudges_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_start_day_emails_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_subscription_ended_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_zoho_due_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.retry_post_payment_fanout_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ops_failsafe_send_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_stale_fraud_queue_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.alert_failed_notifications_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_orphan_subscriptions_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_notification_meta_responses_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.review_credit_cleanup_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_status_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_delivery_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_pause_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscription_closure_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_cron_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_otps() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_bonus_skips(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tick_streak(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_streak_chest(uuid) FROM PUBLIC, anon, authenticated;

-- 2) Enable RLS on the 4 exposed tables + revoke default DML from untrusted roles
ALTER TABLE public.whatsapp_rider_allowlist   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_inbound_processed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_failsafe_alerts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dorm_locations             ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.whatsapp_rider_allowlist   FROM anon, authenticated;
REVOKE ALL ON public.whatsapp_inbound_processed FROM anon, authenticated;
REVOKE ALL ON public.delivery_failsafe_alerts   FROM anon, authenticated;
REVOKE ALL ON public.dorm_locations             FROM anon, authenticated;

-- 3) Restrict company_closures to service_role + revoke untrusted DML
DROP POLICY IF EXISTS "service_role_full_access" ON public.company_closures;
CREATE POLICY "service_role_full_access" ON public.company_closures
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.company_closures FROM anon, authenticated;

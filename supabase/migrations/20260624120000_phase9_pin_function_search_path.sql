-- Release It! Phase 9 (DB hardening): pin search_path on the flagged functions
-- (advisor 0011) to close the search_path-injection vector. Verified per function
-- (pg_get_functiondef schema scan): only admin_cron_health / admin_cron_job_history
-- / cleanup_cron_history touch the `cron` schema; the rest use only `public`.
-- `extensions` included defensively. ALTER ... SET search_path changes NO behavior.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-06-24 and verified (functions still execute; advisor warnings cleared).
-- This file is the source-control mirror.

-- cron-using functions
alter function public.admin_cron_health()                           set search_path = public, extensions, cron, pg_temp;
alter function public.admin_cron_job_history(p_jobname text, p_limit integer) set search_path = public, extensions, cron, pg_temp;
alter function public.cleanup_cron_history()                        set search_path = public, extensions, cron, pg_temp;

-- public-only functions
alter function public._subscriptions_recompute_end_date()          set search_path = public, extensions, pg_temp;
alter function public._subscriptions_set_original_start_date()      set search_path = public, extensions, pg_temp;
alter function public._subscriptions_shift_queued_scheduled()       set search_path = public, extensions, pg_temp;
alter function public._subscriptions_stamp_staff_approval()         set search_path = public, extensions, pg_temp;
alter function public.admin_customer_search(p_query text, p_limit integer, p_offset integer) set search_path = public, extensions, pg_temp;
alter function public.admin_kpi_snapshot()                          set search_path = public, extensions, pg_temp;
alter function public.ae_today()                                    set search_path = public, extensions, pg_temp;
alter function public.cleanup_expired_otps()                        set search_path = public, extensions, pg_temp;
alter function public.cleanup_old_notifications()                   set search_path = public, extensions, pg_temp;
alter function public.compute_subscription_end_date(p_start_date date, p_plan_kind text, p_week_type text, p_skip_count integer, p_pause_days integer) set search_path = public, extensions, pg_temp;
alter function public.expense_category_for_plan(p_plan_name text)   set search_path = public, extensions, pg_temp;
alter function public.handle_new_user()                             set search_path = public, extensions, pg_temp;
alter function public.is_company_closure(p_date date)               set search_path = public, extensions, pg_temp;
alter function public.is_delivery_day(p_date date, p_week_type text) set search_path = public, extensions, pg_temp;
alter function public.subscription_closure_tick()                   set search_path = public, extensions, pg_temp;
alter function public.subscription_delivery_tick()                  set search_path = public, extensions, pg_temp;
alter function public.subscription_pause_tick()                     set search_path = public, extensions, pg_temp;
alter function public.subscription_status_tick()                    set search_path = public, extensions, pg_temp;
alter function public.verify_otp_attempt(p_phone text, p_max_attempts integer) set search_path = public, extensions, pg_temp;

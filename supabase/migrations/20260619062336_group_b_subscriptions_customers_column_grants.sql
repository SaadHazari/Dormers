-- ============================================================
-- Group B — column-level lockdown for subscriptions + customers
-- (database-sentinel audit, 2026-06-19). Applied to live via MCP; this file
-- mirrors it for the repo.
--
-- Closes:
--   * subscriptions: a logged-in customer rewriting money/entitlement columns
--     (total_meals, delivered_meals, end_date, plan_name, bonus_meals,
--     bonus_skips, ...) via direct PostgREST UPDATE on their own row.
--   * customers: a logged-in customer self-setting identity/perk/zone columns
--     (id, cid, email, early_access, hall_wall, out_of_zone, created_at).
-- Keeps EVERY legitimate user-JWT write working (verified against the code):
--   subscriptions -> 11 columns written by subscription-mutations.ts
--   customers     -> all columns EXCEPT the 7 dangerous ones above.
-- service_role BYPASSES these grants, so admin/cron/webhook paths are unaffected.
--
-- NOTE: whatsapp_number / whatsapp_verified / whatsapp_verified_at are still
-- grantable to `authenticated` here ON PURPOSE — production still writes them
-- via the user-JWT client in markWhatsappVerified. Their revoke is a SEPARATE
-- follow-up (see 20260619_group_c_*, run AFTER the security-actions.ts deploy).
-- ============================================================

-- ── subscriptions: table-level UPDATE -> column-level allowlist ──
REVOKE UPDATE ON public.subscriptions FROM anon, authenticated;
GRANT UPDATE (
  status, pause_date, has_paused_before, planned_pause_start, resume_cutoff_date,
  paused_dates, start_date, start_date_changed_at, skipped_meals_count,
  last_skipped_date, skipped_dates
) ON public.subscriptions TO authenticated;

-- ── customers: table-level UPDATE -> column-level allowlist (all except the 7 dangerous) ──
REVOKE UPDATE ON public.customers FROM anon, authenticated;
GRANT UPDATE (
  name, dorm_name, allergens, meal_preference_type, spice_level_preference, veg_days, week_type,
  pending_meal_preference_type, pending_week_type, pending_allergens,
  pending_spice_level_preference, pending_veg_days, preferences_promoted_at,
  takeout_benchmark_aed, dorm_wars_tour_completed_at,
  whatsapp_number, whatsapp_verified, whatsapp_verified_at
) ON public.customers TO authenticated;

-- ── customers: add the missing WITH CHECK so a row can't be repointed to another uid ──
ALTER POLICY "Users can update own customer record" ON public.customers
  WITH CHECK (auth.uid() = id);

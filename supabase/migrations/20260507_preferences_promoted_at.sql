-- ════════════════════════════════════════════════════════════════════
--  Auto-promotion timestamp for pending preferences
-- ════════════════════════════════════════════════════════════════════
--  Companion to 20260507_pending_preferences.sql. When a customer's
--  subscription ENDS without a renewal, the dashboard layout auto-
--  promotes their pending_* columns into the canonical customer.*
--  fields (so the next sub they buy uses the queued prefs, and the
--  read-only "Meal preferences" snapshot reflects what's now in
--  effect). This timestamp records the moment of that promotion so
--  the dashboard can surface a "New meal preferences applied" banner
--  in place of the now-stale "queued for next subscription" banner.
--
--  Cleared semantics: the banner naturally hides once a new live
--  sub exists (gated on hasActiveSub at render time), so the column
--  is left in place as audit. A subsequent drain just overwrites it.
-- ════════════════════════════════════════════════════════════════════

alter table public.customers
  add column if not exists preferences_promoted_at timestamptz;

comment on column public.customers.preferences_promoted_at is
  'Timestamp of the last auto-promotion of pending_* preferences into the canonical fields, triggered when a subscription ends without a renewal. Drives the post-end "preferences applied" banner. Null until the first promotion.';

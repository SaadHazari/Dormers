-- ════════════════════════════════════════════════════════════════════
--  Dorm out-of-zone flag
-- ════════════════════════════════════════════════════════════════════
--  Set true at onboarding when the customer picks "Other" for their
--  dorm (i.e. their address is outside our listed delivery radius).
--  When true:
--    • dashboard renders a banner with a WhatsApp CTA
--    • "Pick a plan" / "Renew" CTAs are disabled
--    • POST /api/checkout rejects with 409 OUT_OF_ZONE
--  Customer-service can clear the flag manually after confirming
--  delivery is feasible (no UI for this — Supabase admin only for now).
-- ════════════════════════════════════════════════════════════════════

alter table public.customers
  add column if not exists out_of_zone boolean not null default false;

comment on column public.customers.out_of_zone is
  'True when customer picked "Other" dorm at onboarding (outside listed delivery radius). Blocks plan purchase until customer-service confirms coverage.';

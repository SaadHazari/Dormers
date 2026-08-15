-- Plan-restricted credits, for the seasonal intake pause.
--
-- BACKWARDS COMPATIBILITY IS THE POINT: the column is nullable and every
-- existing row stays NULL, which the eligibility predicate
-- (src/contexts/subscriptions/domain/credit-eligibility.ts) reads as
-- "redeemable anywhere". Referral, Dorm Wars and weekly-review credits are
-- completely unaffected.
--
-- Only the seasonal-pause waitlist credit sets a value, and it sets
-- ['monthly-max','monthly-premium'] — deliberately NOT staff-monthly, which
-- is intern remuneration and already exempt from every discount mechanism.
--
-- Verified at apply time: 40 existing credit rows, 0 with a restriction.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-15. This file is the source-control mirror.

alter table public.credits
  add column if not exists eligible_plan_ids text[];

comment on column public.credits.eligible_plan_ids is
  'NULL = redeemable against any plan (the default, and what every credit issued before the seasonal intake pause carries). A non-null array restricts redemption to those plan ids.';

-- Owner switch: show or hide plan prices on the MOBILE customer dashboard
-- (Explore plans). Flipped from /admin/pricing. Hidden = the plan cards show
-- no numbers and cannot be picked, so the checkout sheet (which prints the
-- total) never opens. Fails OPEN: a missing row or a read error shows prices.
--
-- The admin toggle upserts this row, so the app works before this file is
-- applied. This file is the source-control mirror.
insert into public.feature_flags (key, enabled, description) values
  ('mobile_dashboard_prices', true, 'Plan prices on the mobile customer dashboard (Explore plans) — toggle in /admin/pricing')
on conflict (key) do nothing;

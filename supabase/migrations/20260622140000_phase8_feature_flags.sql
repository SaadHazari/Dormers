-- Release It! L7 (Phase 8): instant feature kill-switches. Flip `enabled` to
-- false to pause a runaway/abused feature WITHOUT a redeploy (the app reads
-- this at runtime with a short cache). Service-role only.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-06-22. This file is the source-control mirror.
create table if not exists public.feature_flags (
  key         text primary key,
  enabled     boolean not null default true,
  description text,
  updated_at  timestamptz not null default now()
);

alter table public.feature_flags enable row level security;
revoke all on public.feature_flags from anon, authenticated;

insert into public.feature_flags (key, enabled, description) values
  ('chat',           true, 'Homepage AI concierge (/api/chat) — pause to stop Gemini spend'),
  ('staff_program',  true, 'Staff/intern claim + provisioning'),
  ('referral_claims', true, 'Referral gift claims (/r/[cid])')
on conflict (key) do nothing;

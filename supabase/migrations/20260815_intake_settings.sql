-- Seasonal intake pause — operator switch that stops all new plan purchases.
--
-- Single row enforced by the `id boolean primary key default true` + check
-- trick, so there is never a "which row is live" question.
--
-- The customer-facing copy and the three credit amounts live here rather than
-- in code so the operator can edit them without a redeploy. Read through
-- src/infra/config/intake.ts, which caches for 30s and FAILS OPEN — a read
-- failure resolves to "not paused" because a settings-table problem must
-- never block a sale.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-15. This file is the source-control mirror.

create table if not exists public.intake_settings (
  id                   boolean primary key default true,
  paused               boolean not null default false,
  headline             text    not null default 'We are between semesters.',
  body                 text    not null default 'Dormers cooks when the dorms are full. We have paused new plans until enough of you are back on campus.',
  credit_nonveg_aed    numeric not null default 20,
  credit_veg_aed       numeric not null default 15,
  credit_religious_aed numeric not null default 20,
  paused_at            timestamptz,
  paused_by            text,
  updated_at           timestamptz not null default now(),
  constraint intake_settings_singleton check (id)
);

alter table public.intake_settings enable row level security;
revoke all on public.intake_settings from anon, authenticated;
grant all on public.intake_settings to service_role;

insert into public.intake_settings (id) values (true) on conflict (id) do nothing;

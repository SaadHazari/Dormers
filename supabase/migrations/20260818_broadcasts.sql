-- ============================================================================
-- Broadcast composer storage. Two tables:
--   broadcasts       — one row per broadcast; the status machine and audit.
--   broadcast_sends  — the queue. One row per recipient, written at confirm
--                      time in one transaction (broadcast_confirm). sent_at
--                      IS NULL means pending; attempts >= 3 means given up
--                      until an admin retries. The snapshot IS the audience:
--                      the confirmation count and the sent set can never
--                      disagree, and a crashed dispatcher resumes for free.
--
-- status: 'sending' → 'done' (dispatcher finds no pending rows)
--         'sending' → 'cancelled' (admin kill switch; already-sent rows stay)
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-18. This file is the source-control mirror.
-- ============================================================================

create table if not exists public.broadcasts (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null default 'custom'
                    check (kind in ('custom', 'season_reopen')),
  subject         text not null,
  heading         text not null default '',
  body            text not null default '',
  cta_label       text,
  cta_url         text,
  audience        text not null
                    check (audience in ('everyone', 'active_plans', 'early_access',
                                        'ended_not_renewed', 'dorm', 'reopen')),
  dorm_name       text,
  status          text not null default 'sending'
                    check (status in ('sending', 'done', 'cancelled')),
  recipient_count int not null default 0,
  created_by      text not null,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz,
  constraint dorm_requires_name check (audience <> 'dorm' or dorm_name is not null),
  constraint cta_pairs check ((cta_label is null) = (cta_url is null))
);

create table if not exists public.broadcast_sends (
  id           uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  email        text not null,
  first_name   text not null,
  sent_at      timestamptz,
  attempts     int not null default 0,
  last_error   text,
  unique (broadcast_id, customer_id)
);

-- What the dispatcher scans every tick.
create index if not exists broadcast_sends_pending_idx
  on public.broadcast_sends (broadcast_id)
  where sent_at is null;

alter table public.broadcasts enable row level security;
alter table public.broadcast_sends enable row level security;
revoke all on public.broadcasts from anon, authenticated;
revoke all on public.broadcast_sends from anon, authenticated;
grant all on public.broadcasts to service_role;
grant all on public.broadcast_sends to service_role;

drop policy if exists "service_role_full_access" on public.broadcasts;
create policy "service_role_full_access" on public.broadcasts
  for all using (true) with check (true);
drop policy if exists "service_role_full_access" on public.broadcast_sends;
create policy "service_role_full_access" on public.broadcast_sends
  for all using (true) with check (true);

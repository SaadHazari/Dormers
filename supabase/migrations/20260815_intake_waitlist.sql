-- Early-access list for the seasonal intake pause.
--
-- The UNIQUE on customer_id is load-bearing: it is what makes the opt-in
-- idempotent, so a double tap can never grant two credits. The server action
-- (src/contexts/subscriptions/usecases/join-intake-waitlist.ts) inserts HERE
-- first and only mints the credit once this insert succeeds — doing it the
-- other way round would mint a second credit before discovering the
-- duplicate. Do not relax the constraint.
--
-- RLS: a customer may read their own row (so the dashboard can show "you are
-- on the list") and nothing else. All writes are service-role.
--
-- notified_at stays NULL until the reopening broadcast reaches them; the
-- partial index is what that fan-out will scan.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-15. This file is the source-control mirror.

create table if not exists public.intake_waitlist (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  credit_id   uuid references public.credits(id),
  notified_at timestamptz
);

create index if not exists intake_waitlist_pending_idx
  on public.intake_waitlist (joined_at)
  where notified_at is null;

alter table public.intake_waitlist enable row level security;
revoke all on public.intake_waitlist from anon, authenticated;
grant select on public.intake_waitlist to authenticated;
grant all on public.intake_waitlist to service_role;

drop policy if exists "own_row_read" on public.intake_waitlist;
create policy "own_row_read" on public.intake_waitlist
  for select to authenticated using (customer_id = auth.uid());

drop policy if exists "service_role_full_access" on public.intake_waitlist;
create policy "service_role_full_access" on public.intake_waitlist
  for all using (true) with check (true);

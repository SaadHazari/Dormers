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

-- 2026-08-15 follow-up: makes minting the waitlist credit idempotent at the
-- database level too, not just by insert ordering. Without this, a customer
-- whose first tap saved the waitlist row but failed to mint a credit could
-- retry, and a second concurrent retry could then mint two credits for the
-- same customer. The server action (join-intake-waitlist.ts) still inserts
-- the waitlist row first, then relies on this index to make its own credit
-- mint safe to retry: a duplicate insert now fails with 23505 the same way
-- the waitlist insert does, so the action can read back the real amount
-- instead of reporting one that was never granted.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-15. This addition is the source-control mirror.
create unique index if not exists credits_one_intake_waitlist_per_customer
  on public.credits (customer_id)
  where source = 'intake_waitlist';

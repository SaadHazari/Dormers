-- Lease-based claiming for broadcast_sends.
--
-- Task review finding: the dispatcher's original select-then-send pattern
-- assumed pg_cron ticks are serialized. They are not — dispatch_broadcast_tick
-- fires the route via pg_net's http_post, which is fire-and-forget. If one
-- tick's batch runs long (up to maxDuration=60s per row-timeout budget), the
-- next minute's tick can start before it finishes, both select the same
-- unsent rows, and both send — a double-send.
--
-- Fix: claim rows atomically with `for update skip locked` inside a single
-- statement, stamping `claimed_at`. Two concurrent claims can never select
-- the same row (skip locked makes the claim sets disjoint). The lease window
-- is 2 minutes — comfortably longer than the route's 60s maxDuration — so a
-- row claimed by a tick that then crashes or times out self-releases after
-- 2 minutes and becomes claimable again, without needing any cleanup job.
--
-- security definer + revoke from public/anon/authenticated: only the
-- service-role-backed dispatcher route may claim broadcast rows. service_role
-- keeps EXECUTE via this project's schema-level default privilege grant (not
-- touched by this revoke), matching every other internal-only RPC in this
-- codebase.

alter table public.broadcast_sends add column if not exists claimed_at timestamptz;

create or replace function public.broadcast_claim_batch(p_broadcast_id uuid, p_limit int)
returns setof public.broadcast_sends
language sql
security definer
set search_path = public
as $$
  update public.broadcast_sends s
  set claimed_at = now()
  where s.id in (
    select id from public.broadcast_sends
    where broadcast_id = p_broadcast_id
      and sent_at is null
      and attempts < 3
      and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by id
    limit p_limit
    for update skip locked
  )
  returning s.*;
$$;

revoke execute on function public.broadcast_claim_batch(uuid, int) from public, anon, authenticated;

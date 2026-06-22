-- Release It! L3 (Phase 4): durable, cross-instance rate-limit store.
-- Fixed-window counter keyed by an opaque string (limiter name + hashed
-- identity). Service-role only: the app calls rate_limit_hit() via the admin
-- client; anon/authenticated get NOTHING (RLS deny-all + revoked grants).
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-06-22. This file is the source-control mirror.

create table if not exists public.rate_limit_buckets (
  bucket_key   text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (bucket_key, window_start)
);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;

-- Atomic fixed-window increment. Returns the running count for the current
-- window + when it resets. OUT params are NOT named `count` to avoid colliding
-- with the table column inside the ON CONFLICT clause.
create or replace function public.rate_limit_hit(
  p_key text,
  p_window_seconds integer
)
returns table (hit_count integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_buckets (bucket_key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set count = rate_limit_buckets.count + 1
  returning rate_limit_buckets.count into v_count;

  hit_count := v_count;
  reset_at  := v_window_start + make_interval(secs => p_window_seconds);
  return next;
end;
$fn$;

revoke all on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer) to service_role;

-- Steady-state cleanup (Release It!): drop windows older than 2h every 30 min.
do $gc$
begin
  if exists (select 1 from cron.job where jobname = 'rate-limit-gc') then
    perform cron.unschedule('rate-limit-gc');
  end if;
end
$gc$;
select cron.schedule(
  'rate-limit-gc',
  '*/30 * * * *',
  $cmd$delete from public.rate_limit_buckets where window_start < now() - interval '2 hours'$cmd$
);

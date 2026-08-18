-- ============================================================================
-- Audience resolution + the confirm transaction for the broadcast composer.
--
-- broadcast_audience is the single source of truth for who each audience is.
-- The composer's live count and broadcast_confirm's snapshot both call it, so
-- the number the admin confirmed is exactly the set that gets queued.
--
-- 'reopen' = the early-access list UNION ended-and-not-renewed: the two
-- honest audiences for "we are back" (spec §7 promised the list they would
-- hear first; lapsed customers get the no-credit variant of the template).
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-18. This file is the source-control mirror.
-- ============================================================================

create or replace function public.broadcast_audience(p_audience text, p_dorm text default null)
returns table(customer_id uuid, email text, first_name text)
language sql
security definer
set search_path = public
as $$
  select c.id,
         c.email,
         coalesce(nullif(split_part(btrim(c.name), ' ', 1), ''), 'there')
  from public.customers c
  where c.email is not null
    and case p_audience
      when 'everyone' then true
      -- 'Active','Paused','Skipped','Scheduled' are all plans still in force
      -- (see LIVE_STATUSES in src/app/admin/customers/priority.ts); a Paused
      -- customer must still receive plan-holder broadcasts, not be dropped.
      when 'active_plans' then exists (
        select 1 from public.subscriptions s
        where s.customer_id = c.id and s.status = any (array['Active','Paused','Skipped','Scheduled']))
      when 'early_access' then exists (
        select 1 from public.intake_waitlist w where w.customer_id = c.id)
      when 'ended_not_renewed' then
        exists (select 1 from public.subscriptions s
                where s.customer_id = c.id and s.status = 'Ended')
        and not exists (select 1 from public.subscriptions s
                        where s.customer_id = c.id and s.status = any (array['Active','Paused','Skipped','Scheduled']))
      when 'dorm' then c.dorm_name = p_dorm
      when 'reopen' then
        exists (select 1 from public.intake_waitlist w where w.customer_id = c.id)
        or (exists (select 1 from public.subscriptions s
                    where s.customer_id = c.id and s.status = 'Ended')
            and not exists (select 1 from public.subscriptions s
                            where s.customer_id = c.id and s.status = any (array['Active','Paused','Skipped','Scheduled'])))
      else false
    end
$$;

create or replace function public.broadcast_confirm(p_broadcast_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.broadcasts%rowtype;
  n int;
begin
  select * into b from public.broadcasts
    where id = p_broadcast_id and status = 'sending'
    for update;
  if not found then
    raise exception 'broadcast % not found or not in sending state', p_broadcast_id;
  end if;

  -- Idempotent: a retried confirm must not double the queue.
  if b.recipient_count > 0 then
    return b.recipient_count;
  end if;

  insert into public.broadcast_sends (broadcast_id, customer_id, email, first_name)
  select p_broadcast_id, a.customer_id, a.email, a.first_name
  from public.broadcast_audience(b.audience, b.dorm_name) a
  on conflict (broadcast_id, customer_id) do nothing;

  get diagnostics n = row_count;
  update public.broadcasts set recipient_count = n where id = p_broadcast_id;
  return n;
end
$$;

revoke execute on function public.broadcast_audience(text, text) from public, anon, authenticated;
revoke execute on function public.broadcast_confirm(uuid) from public, anon, authenticated;

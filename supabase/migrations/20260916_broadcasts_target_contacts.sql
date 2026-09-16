-- ============================================================================
-- The contact book, phase C: broadcasts speak to contacts.
--
-- Design: docs/superpowers/specs/2026-09-16-contact-book-design.md §5
--
-- The composer, the live audience count, the snapshot-on-confirm, the
-- dispatcher with its claim lease and parking, cancel and retry — all of it
-- already worked. The only thing standing between it and the whole contact
-- book was `broadcast_sends.customer_id not null references customers`.
--
-- Doing this now is cheap on purpose: broadcast_sends is empty in production,
-- so there is no history to migrate.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via the Supabase
-- Management API on 2026-09-16. This file is the source-control mirror.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. broadcast_sends addresses a contact, not an account.
-- ---------------------------------------------------------------------------
alter table public.broadcast_sends
  add column if not exists contact_id uuid references public.contacts(id) on delete cascade,
  add column if not exists phone_e164 text;

alter table public.broadcast_sends alter column customer_id drop not null;
-- A WhatsApp send has a phone and may have no email at all.
alter table public.broadcast_sends alter column email drop not null;
alter table public.broadcast_sends alter column first_name drop not null;

-- Uniqueness is per contact now. The old pair could not express "one send per
-- person" for someone with no account.
alter table public.broadcast_sends
  drop constraint if exists broadcast_sends_broadcast_id_customer_id_key;
create unique index if not exists broadcast_sends_broadcast_contact_key
  on public.broadcast_sends (broadcast_id, contact_id);

-- customer_id stays as a denormalised convenience: the dispatcher's
-- season-reopen path reads intake_waitlist by customer, and that audience is
-- account-holders by definition. Null for everyone else.

-- ---------------------------------------------------------------------------
-- 2. A broadcast has a channel.
-- ---------------------------------------------------------------------------
alter table public.broadcasts
  add column if not exists channel text not null default 'email';

alter table public.broadcasts drop constraint if exists broadcasts_channel_check;
alter table public.broadcasts add constraint broadcasts_channel_check
  check (channel in ('email', 'whatsapp'));

-- The audience list grows with the contact book. Kept as a check constraint
-- rather than an enum so adding one is a single ALTER.
alter table public.broadcasts drop constraint if exists broadcasts_audience_check;
alter table public.broadcasts add constraint broadcasts_audience_check
  check (audience in ('everyone', 'active_plans', 'early_access', 'ended_not_renewed',
                      'dorm', 'reopen',
                      'customers', 'never_customers', 'imported',
                      'waitlist_all', 'early_signup'));

-- ---------------------------------------------------------------------------
-- 3. broadcast_audience resolves contacts, and filters by channel.
--
-- The channel filter lives HERE rather than in the caller, because the
-- composer's live count and the confirm snapshot both read this function. If
-- the filter lived in the caller, the number an admin confirmed would include
-- people the send then silently skipped.
-- ---------------------------------------------------------------------------
drop function if exists public.broadcast_audience(text, text);

create or replace function public.broadcast_audience(
  p_audience text,
  p_dorm text default null,
  p_channel text default 'email'
)
returns table(contact_id uuid, customer_id uuid, email text, phone_e164 text, first_name text)
language sql
stable
security definer
set search_path = public
as $$
  select ct.id,
         ct.customer_id,
         ct.email,
         ct.phone_e164,
         coalesce(nullif(split_part(btrim(ct.name), ' ', 1), ''), 'there')
  from public.contacts ct
  where
    -- Reachable on the channel we are actually sending, and not opted out of
    -- it. 'unknown' WhatsApp consent is excluded here; phase D adds the
    -- explicit, audited opt to include it.
    case p_channel
      when 'email' then ct.email is not null and ct.email_status = 'subscribed'
      when 'whatsapp' then ct.phone_e164 is not null and ct.whatsapp_status = 'opted_in'
      else false
    end
    and case p_audience
      when 'everyone' then true
      when 'customers' then ct.customer_id is not null
      when 'never_customers' then ct.customer_id is null
      when 'imported' then ct.source = 'zoho_import'

      -- 'Active','Paused','Skipped','Scheduled' are all plans still in force
      -- (see LIVE_STATUSES in src/app/admin/customers/priority.ts); a Paused
      -- customer must still receive plan-holder broadcasts, not be dropped.
      when 'active_plans' then exists (
        select 1 from public.subscriptions s
        where s.customer_id = ct.customer_id and s.status = any (array['Active','Paused','Skipped','Scheduled']))

      -- Scoped to the CURRENT pause cycle: this audience decides who gets the
      -- "you asked to hear first" footer, and the reopen send path only stamps
      -- notified_at for current-cycle rows.
      when 'early_access' then exists (
        select 1 from public.intake_waitlist w
        where w.customer_id = ct.customer_id
          and w.cycle_started_at = (select cycle_started_at from public.intake_settings))

      -- Every cycle, deliberately, and only while nothing is running: this is
      -- the Waitlist chip on the customers list, rule for rule. Someone who
      -- joined the list and has since resumed a plan is a plan-holder now, and
      -- hearing "your spot is waiting" would read as a mistake. Verified
      -- against the chip on live data: both say 15.
      when 'waitlist_all' then
        exists (select 1 from public.intake_waitlist w where w.customer_id = ct.customer_id)
        and not exists (select 1 from public.subscriptions s
                        where s.customer_id = ct.customer_id
                          and s.status = any (array['Active','Paused','Skipped','Scheduled']))

      -- Made an account, never bought anything, never joined the list. Mirrors
      -- the Early signup chip.
      when 'early_signup' then
        ct.customer_id is not null
        and not exists (select 1 from public.subscriptions s where s.customer_id = ct.customer_id)
        and not exists (select 1 from public.intake_waitlist w where w.customer_id = ct.customer_id)

      when 'ended_not_renewed' then
        exists (select 1 from public.subscriptions s
                where s.customer_id = ct.customer_id and s.status = 'Ended')
        and not exists (select 1 from public.subscriptions s
                        where s.customer_id = ct.customer_id and s.status = any (array['Active','Paused','Skipped','Scheduled']))

      when 'dorm' then exists (
        select 1 from public.customers c where c.id = ct.customer_id and c.dorm_name = p_dorm)

      when 'reopen' then
        exists (select 1 from public.intake_waitlist w
                where w.customer_id = ct.customer_id
                  and w.cycle_started_at = (select cycle_started_at from public.intake_settings))
        or (exists (select 1 from public.subscriptions s
                    where s.customer_id = ct.customer_id and s.status = 'Ended')
            and not exists (select 1 from public.subscriptions s
                            where s.customer_id = ct.customer_id and s.status = any (array['Active','Paused','Skipped','Scheduled'])))
      else false
    end
$$;

grant execute on function public.broadcast_audience(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. broadcast_confirm snapshots contacts.
-- ---------------------------------------------------------------------------
create or replace function public.broadcast_confirm(p_broadcast_id uuid)
returns integer
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

  insert into public.broadcast_sends (broadcast_id, contact_id, customer_id, email, phone_e164, first_name)
  select p_broadcast_id, a.contact_id, a.customer_id, a.email, a.phone_e164, a.first_name
  from public.broadcast_audience(b.audience, b.dorm_name, b.channel) a
  on conflict (broadcast_id, contact_id) do nothing;

  get diagnostics n = row_count;
  update public.broadcasts set recipient_count = n where id = p_broadcast_id;
  return n;
end
$$;

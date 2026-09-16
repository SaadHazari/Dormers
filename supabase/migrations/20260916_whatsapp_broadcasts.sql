-- ============================================================================
-- The contact book, phase D: WhatsApp as a second channel.
--
-- Design: docs/superpowers/specs/2026-09-16-contact-book-design.md §6
--
-- Marketing goes out from the same Meta number that carries OTP. That is an
-- accepted decision (Saad, 2026-09-16) and the risk it carries is concrete:
-- blocks and reports drop the number's quality rating, and a rating drop
-- throttles the number new signups depend on. Nothing in this migration can
-- prevent that outright; what it does is make it hard to reach by accident.
--
-- Two of the five guardrails live here:
--   * `whatsapp_status = 'unknown'` is excluded from a WhatsApp audience
--     unless the caller explicitly passes p_include_unknown. The composer
--     only passes it when a person ticks a box, and the tick is audited.
--   * A template that Meta has not approved cannot be launched: approved_at
--     is null until the sync sees APPROVED, and the composer filters on it.
--
-- The other three (quality preflight, daily cap, cost before confirm) are in
-- the application because they read Meta at launch time.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via the Supabase
-- Management API on 2026-09-16. This file is the source-control mirror.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The approved-template registry, mirrored from Meta.
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  language      text not null default 'en',
  category      text not null,
  -- Meta's own status. Only 'APPROVED' ever gets approved_at set.
  status        text not null,
  approved_at   timestamptz,
  -- Ordered placeholders in the body. Named templates carry their names here;
  -- positional ones carry '1','2',… Meta rejects positional parameters on a
  -- named template and vice versa, so the shape has to travel with the row.
  variables     text[] not null default '{}',
  named_params  boolean not null default false,
  body_preview  text not null default '',
  synced_at     timestamptz not null default now(),
  unique (name, language)
);

alter table public.whatsapp_templates enable row level security;
revoke all on public.whatsapp_templates from anon, authenticated;
grant all on public.whatsapp_templates to service_role;
drop policy if exists "service_role_full_access" on public.whatsapp_templates;
create policy "service_role_full_access" on public.whatsapp_templates
  for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 2. What a WhatsApp broadcast carries instead of a subject and a body.
-- ---------------------------------------------------------------------------
alter table public.broadcasts
  add column if not exists template_name text,
  add column if not exists template_language text,
  add column if not exists template_variables jsonb not null default '[]'::jsonb,
  -- Recorded on the row, not just in the audit log, so the reason an audience
  -- was larger than the opted-in count is legible forever after.
  add column if not exists included_unknown_consent boolean not null default false;

alter table public.broadcasts drop constraint if exists broadcasts_whatsapp_needs_template;
alter table public.broadcasts add constraint broadcasts_whatsapp_needs_template
  check (channel <> 'whatsapp' or (template_name is not null and template_language is not null));

-- ---------------------------------------------------------------------------
-- 3. The consent gate.
--
-- Adding a parameter with a default keeps every existing caller working:
-- previewAudience, broadcast_confirm and the email path all omit it and get
-- the safe answer.
--
-- The phase-C three-argument version MUST be dropped rather than left beside
-- this one. `create or replace` with a new signature creates a second
-- function, and Postgres then cannot choose between them: every existing
-- three-argument call fails with "function is not unique" — including the
-- composer's own live audience count, which calls it by name with three
-- named parameters.
-- ---------------------------------------------------------------------------
drop function if exists public.broadcast_audience(text, text, text);

create or replace function public.broadcast_audience(
  p_audience text,
  p_dorm text default null,
  p_channel text default 'email',
  p_include_unknown boolean default false
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
    case p_channel
      when 'email' then ct.email is not null and ct.email_status = 'subscribed'
      -- 'opted_out' is never included, whatever the caller asks for: someone
      -- who replied STOP has said so, and no tick box overrides that.
      when 'whatsapp' then ct.phone_e164 is not null
        and (ct.whatsapp_status = 'opted_in'
             or (p_include_unknown and ct.whatsapp_status = 'unknown'))
      else false
    end
    and case p_audience
      when 'everyone' then true
      when 'customers' then ct.customer_id is not null
      when 'never_customers' then ct.customer_id is null
      when 'imported' then ct.source = 'zoho_import'

      when 'active_plans' then exists (
        select 1 from public.subscriptions s
        where s.customer_id = ct.customer_id and s.status = any (array['Active','Paused','Skipped','Scheduled']))

      when 'early_access' then exists (
        select 1 from public.intake_waitlist w
        where w.customer_id = ct.customer_id
          and w.cycle_started_at = (select cycle_started_at from public.intake_settings))

      when 'waitlist_all' then
        exists (select 1 from public.intake_waitlist w where w.customer_id = ct.customer_id)
        and not exists (select 1 from public.subscriptions s
                        where s.customer_id = ct.customer_id
                          and s.status = any (array['Active','Paused','Skipped','Scheduled']))

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

grant execute on function public.broadcast_audience(text, text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 4. broadcast_confirm passes the broadcast's own consent decision through.
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

  if b.recipient_count > 0 then
    return b.recipient_count;
  end if;

  insert into public.broadcast_sends (broadcast_id, contact_id, customer_id, email, phone_e164, first_name)
  select p_broadcast_id, a.contact_id, a.customer_id, a.email, a.phone_e164, a.first_name
  from public.broadcast_audience(b.audience, b.dorm_name, b.channel, b.included_unknown_consent) a
  on conflict (broadcast_id, contact_id) do nothing;

  get diagnostics n = row_count;
  update public.broadcasts set recipient_count = n where id = p_broadcast_id;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. What the number has already sent in the last rolling 24 hours.
--
-- Meta's messaging limit is per unique recipient per rolling 24h, so this
-- counts DISTINCT contacts rather than sends. No new table: broadcast_sends
-- already records every send with a timestamp.
-- ---------------------------------------------------------------------------
create or replace function public.whatsapp_sent_last_24h()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(distinct s.contact_id), 0)::int
  from public.broadcast_sends s
  join public.broadcasts b on b.id = s.broadcast_id
  where b.channel = 'whatsapp'
    and s.sent_at is not null
    and s.sent_at > now() - interval '24 hours'
$$;

grant execute on function public.whatsapp_sent_last_24h() to service_role;

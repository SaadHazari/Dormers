-- ============================================================================
-- The contact book, phase A: the spine.
--
-- Design: docs/superpowers/specs/2026-09-16-contact-book-design.md
--
-- `customers` holds people who made an account. Dormers knows about far more
-- people than that — two years of email signups, website visitors, referrals
-- and free signups — and none of them were reachable from the admin panel.
-- `contacts` is the table that owns PEOPLE; `customers` becomes one source
-- feeding it rather than the only one.
--
-- Nothing here touches the broadcast subsystem. Retargeting broadcasts at
-- contacts is phase C and needs its own migration.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via the Supabase
-- Management API on 2026-09-16. This file is the source-control mirror.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Import batches. Declared first so contacts.import_id can reference it.
-- ---------------------------------------------------------------------------
create table if not exists public.contact_imports (
  id          uuid primary key default gen_random_uuid(),
  filename    text not null,
  uploaded_by text not null,
  source      text not null,
  total_rows  int  not null default 0,
  created     int  not null default 0,
  matched     int  not null default 0,
  skipped     int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- The spine.
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id                 uuid primary key default gen_random_uuid(),
  -- Stored lowercased and trimmed. One live customer email is neither, which
  -- is exactly why normalising happens here and not at the call site.
  email              text,
  phone_e164         text,
  name               text,

  -- Where we FIRST met them. Never rewritten by a later import or by the
  -- customers trigger: it is what makes "how many of the old list converted"
  -- answerable a year from now.
  source             text not null
                       check (source in ('customer','zoho_import','website',
                                         'referral','free_signup','waitlist','manual')),
  source_detail      text,

  -- Set when this person also has an account. Null for everyone else.
  customer_id        uuid unique references public.customers(id) on delete set null,
  tags               text[] not null default '{}',
  notes              text,

  email_status       text not null default 'subscribed'
                       check (email_status in ('subscribed','unsubscribed','bounced','complained')),
  -- Deliberately NOT 'subscribed' by default: an imported contact has not
  -- consented to WhatsApp marketing, and Meta counts that against the number
  -- the OTP flow depends on. Phase D makes including 'unknown' an explicit,
  -- audited choice rather than a silent default.
  whatsapp_status    text not null default 'unknown'
                       check (whatsapp_status in ('unknown','opted_in','opted_out','failed')),
  unsubscribed_at    timestamptz,
  last_emailed_at    timestamptz,
  last_whatsapped_at timestamptz,

  import_id          uuid references public.contact_imports(id) on delete set null,
  first_seen_at      timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint contacts_reachable check (email is not null or phone_e164 is not null)
);

-- Email is the identity key and is uniquely indexed; phone deliberately is
-- NOT. The live data settles it: four customers share +971545766707 and four
-- more share +966552426072 — students lend each other phones, and families
-- share one. A unique index on phone_e164 silently dropped 21 of 73 people on
-- the first backfill. Email held at 73 of 73.
--
-- The partial unique on email is still what makes re-running an import a
-- no-op. A phone-only contact (a referral with no address) is deduped on
-- phone instead, and only when exactly one existing contact holds that number
-- — the same narrow rule upsert_customer_contact() applies below.
create unique index if not exists contacts_email_key
  on public.contacts (email) where email is not null;
create index if not exists contacts_phone_idx
  on public.contacts (phone_e164) where phone_e164 is not null;

create index if not exists contacts_source_idx on public.contacts (source);
create index if not exists contacts_import_idx on public.contacts (import_id)
  where import_id is not null;

alter table public.contacts        enable row level security;
alter table public.contact_imports enable row level security;
revoke all on public.contacts        from anon, authenticated;
revoke all on public.contact_imports from anon, authenticated;
grant all on public.contacts        to service_role;
grant all on public.contact_imports to service_role;

drop policy if exists "service_role_full_access" on public.contacts;
create policy "service_role_full_access" on public.contacts
  for all using (true) with check (true);
drop policy if exists "service_role_full_access" on public.contact_imports;
create policy "service_role_full_access" on public.contact_imports
  for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Customers mirror into contacts.
--
-- Factored as a callable function rather than living inside the trigger so
-- the one-time backfill and the trigger run the SAME code — a backfill that
-- drifts from the trigger is how a contact book quietly goes wrong.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_customer_contact(p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c        record;
  v_email  text;
  v_phone  text;
  v_name   text;
  v_id     uuid;
begin
  select id, email, whatsapp_number, name, created_at into c
    from customers where id = p_customer_id;
  if not found then return null; end if;

  v_email := nullif(lower(btrim(coalesce(c.email, ''))), '');
  v_phone := nullif(btrim(coalesce(c.whatsapp_number, '')), '');
  v_name  := nullif(btrim(coalesce(c.name, '')), '');

  -- contacts_reachable would reject this row, and a customer with neither an
  -- email nor a phone is nobody we can message anyway.
  if v_email is null and v_phone is null then return null; end if;

  select id into v_id from contacts where customer_id = c.id;

  -- Adopt a contact we already know by the same address — an import, a
  -- referral, a manual add — rather than creating a second row for one person.
  -- Only unlinked contacts are adoptable: one already bound to a different
  -- customer belongs to someone else.
  if v_id is null and v_email is not null then
    select id into v_id from contacts
     where email = v_email and customer_id is null
     order by created_at limit 1;
  end if;

  -- Phone adoption is deliberately narrow. A shared number is common here, so
  -- it only identifies a person when the candidate has no email of its own to
  -- contradict this customer's, and no second contact holds the same number.
  if v_id is null and v_phone is not null then
    select id into v_id from contacts
     where phone_e164 = v_phone and customer_id is null and email is null
     order by created_at limit 1;
    if v_id is not null
       and (select count(*) from contacts where phone_e164 = v_phone) > 1 then
      v_id := null;
    end if;
  end if;

  if v_id is null then
    begin
      insert into contacts (email, phone_e164, name, source, customer_id, first_seen_at)
      values (v_email, v_phone, v_name, 'customer', c.id, c.created_at)
      returning id into v_id;
      return v_id;
    exception when unique_violation then
      -- Raced with a concurrent insert on contacts_email_key. Re-read and fall
      -- through to the update below rather than failing the customer write
      -- that triggered us.
      select id into v_id from contacts where v_email is not null and email = v_email limit 1;
      if v_id is null then return null; end if;
    end;
  end if;

  -- Keep the linked contact current, but never steal an email another contact
  -- already holds: contacts_email_key would reject it and take the customer's
  -- own write down with it. Phone has no such index, so it just follows.
  update contacts set
    customer_id = c.id,
    email = case
              when v_email is not null
               and not exists (select 1 from contacts o where o.email = v_email and o.id <> v_id)
              then v_email else email end,
    phone_e164 = coalesce(v_phone, phone_e164),
    name = coalesce(v_name, name),
    first_seen_at = least(first_seen_at, c.created_at),
    updated_at = now()
  where id = v_id;

  return v_id;
end;
$$;

create or replace function public.tg_sync_customer_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.upsert_customer_contact(new.id);
  return new;
end;
$$;

drop trigger if exists sync_customer_contact on public.customers;
create trigger sync_customer_contact
  after insert or update of email, whatsapp_number, name on public.customers
  for each row execute function public.tg_sync_customer_contact();

-- One-time backfill. Ordered oldest first so the earliest account wins any
-- address collision, matching the trigger's own `order by created_at`.
-- Idempotent: re-running it re-links rather than duplicating.
do $$
declare r record;
begin
  for r in select id from customers order by created_at loop
    perform public.upsert_customer_contact(r.id);
  end loop;
end $$;

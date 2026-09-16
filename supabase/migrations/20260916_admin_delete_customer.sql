-- ============================================================================
-- Deleting people, on purpose and with the receipts shown first.
--
-- A season of building left seeded test accounts behind — "Active Andy",
-- "Paused Pat", a dozen +tag signups — and there was no way to remove one.
-- Doing it by hand in SQL is how a real customer gets deleted by accident, so
-- this is the supported path instead: see exactly what would go, then say yes.
--
-- Two functions, and the important thing is where they get their facts:
--
--   admin_customer_delete_impact() counts children by reading pg_constraint at
--   run time, so the preview covers EVERY table pointing at customers, today
--   and after the next migration. It cannot silently under-report.
--
--   admin_delete_customer() deletes in a hand-written order, because the
--   order is not derivable from the graph alone: credits must go before the
--   orders they were applied to, the waitlist row before the credit it minted,
--   orders before the subscription they belong to. If a future table is added
--   and not handled here, the delete FAILS with a foreign-key error rather
--   than half-finishing — a loud failure, which is the right one.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via the Supabase
-- Management API on 2026-09-16. This file is the source-control mirror.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- What deleting these people would take with them.
-- ---------------------------------------------------------------------------
create or replace function public.admin_customer_delete_impact(p_ids uuid[])
returns table(
  customer_id         uuid,
  name                text,
  email               text,
  cid                 text,
  impact              jsonb,
  total_rows          int,
  on_waitlist         boolean,
  waitlist_credit_aed double precision,
  is_staff            boolean,
  delivered_meals     int,
  has_live_stripe     boolean,
  blocked_reason      text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  c       record;
  fk      record;
  v_n     bigint;
  v_impact jsonb;
  v_total  int;
begin
  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    select cu.id, cu.name, cu.email, cu.cid into c from customers cu where cu.id = v_id;
    continue when c.id is null;

    v_impact := '{}'::jsonb;
    v_total  := 0;

    -- Every table with a foreign key into customers, read from the catalogue
    -- rather than from a list someone has to remember to update.
    for fk in
      -- relname, not conrelid::regclass::text: regclass renders WITHOUT the
      -- schema when it is on the search_path, so split_part(…, '.', 2) came
      -- back empty and every table collapsed into one blank key.
      select cl.relname as tbl, att.attname as col
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
      where con.contype = 'f'
        and con.confrelid = 'public.customers'::regclass
        and att.atttypid = 'uuid'::regtype   -- skip the cid text key; same rows
    loop
      execute format('select count(*) from public.%I where %I = $1', fk.tbl, fk.col)
        into v_n using v_id;
      if v_n > 0 then
        -- Summed per table: referrals points at customers three times, and a
        -- reader wants "referrals: 2", not three separate lines.
        v_impact := jsonb_set(
          v_impact,
          array[fk.tbl],
          to_jsonb(coalesce((v_impact ->> fk.tbl)::bigint, 0) + v_n)
        );
        v_total := v_total + v_n::int;
      end if;
    end loop;

    customer_id := c.id;
    name        := c.name;
    email       := c.email;
    cid         := c.cid;
    impact      := v_impact;
    total_rows  := v_total;

    on_waitlist := exists (select 1 from intake_waitlist w where w.customer_id = v_id);
    select coalesce(sum(cr.amount_aed), 0)::float8 into waitlist_credit_aed
      from credits cr
     where cr.customer_id = v_id and cr.source = 'intake_waitlist' and cr.status <> 'applied';
    is_staff    := exists (select 1 from staff_members s where s.customer_id = v_id);
    select coalesce(max(s.delivered_meals), 0)::int into delivered_meals
      from subscriptions s where s.customer_id = v_id;

    -- The one absolute refusal. Test-mode sessions are 'cs_test_…', so this
    -- matches nothing today and everything that matters later.
    has_live_stripe := exists (
      select 1 from orders o
      where o.customer_id = v_id and o.stripe_session_id like 'cs_live_%');

    blocked_reason := case
      when has_live_stripe then 'Has a real Stripe payment'
      else null
    end;

    return next;
  end loop;
end;
$$;

grant execute on function public.admin_customer_delete_impact(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- Delete one person, everything of theirs, and their login.
--
-- Returns the snapshot the caller writes to the audit log. Raises rather than
-- returning a failure code: every caller is inside a transaction that should
-- not half-commit.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_customer(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_snapshot jsonb;
  v_cid      text;
begin
  select to_jsonb(c) into v_snapshot from customers c where c.id = p_customer_id;
  if v_snapshot is null then
    raise exception 'No customer %', p_customer_id using errcode = 'no_data_found';
  end if;
  v_cid := v_snapshot ->> 'cid';

  if exists (select 1 from orders o
             where o.customer_id = p_customer_id and o.stripe_session_id like 'cs_live_%') then
    raise exception 'Refused: this customer has a real Stripe payment' using errcode = 'raise_exception';
  end if;

  -- Order matters, and it is the reverse of how the rows depend on each other.

  -- 1. Things hanging off this customer's referrals, including credits that
  --    belong to the OTHER side of the referral and would otherwise pin it.
  delete from referral_review_queue q
   where q.referral_id in (select r.id from referrals r
                            where r.inviter_user_id = p_customer_id
                               or r.invitee_user_id = p_customer_id
                               or r.inviter_cid = v_cid);
  delete from credits cr
   where cr.referral_id in (select r.id from referrals r
                             where r.inviter_user_id = p_customer_id
                                or r.invitee_user_id = p_customer_id
                                or r.inviter_cid = v_cid);

  -- 2. The waitlist row points at the credit it minted, so it goes first.
  delete from intake_waitlist where customer_id = p_customer_id;
  delete from season_holds     where customer_id = p_customer_id;

  -- 3. Credits point at orders (applied_to) and referrals, so they precede both.
  delete from credits where customer_id = p_customer_id;

  -- 4. Orders point at subscriptions.
  delete from orders where customer_id = p_customer_id;

  -- 5. Now the things that only the customer holds.
  delete from comped_meal_ledger     where customer_id = p_customer_id;
  delete from referral_gifts_claimed where user_id = p_customer_id;
  delete from referrals where inviter_user_id = p_customer_id
                           or invitee_user_id = p_customer_id
                           or inviter_cid = v_cid;
  delete from staff_members where customer_id = p_customer_id;
  delete from subscriptions where customer_id = p_customer_id;

  -- 6. The contact book entry. contacts.customer_id is SET NULL, so without
  --    this the person survives as an orphan contact and a later broadcast
  --    would email a deleted account.
  delete from contacts where customer_id = p_customer_id;

  -- 7. Everything still pointing at customers is ON DELETE CASCADE and goes
  --    with this row: notifications, streaks, rewards, reviews, daily drops.
  delete from customers where id = p_customer_id;

  -- 8. The login last. Without it, on_auth_user_created recreates a blank
  --    customer row the next time this person signs in, and the cleanup
  --    quietly undoes itself.
  delete from auth.users where id = p_customer_id;

  return v_snapshot;
end;
$$;

grant execute on function public.admin_delete_customer(uuid) to service_role;

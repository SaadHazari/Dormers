-- ============================================================================
-- Make a deletion undoable, by keeping what it destroyed.
--
-- On 2026-09-16 a cleanup pass removed 54 customers, 17 of whom were not test
-- accounts, including two admin logins and six waitlist members holding AED
-- 130 of pause credit between them. None of it could be restored: the audit
-- log had recorded a SUMMARY — name, email, cid, counts — and the project has
-- no point-in-time recovery.
--
-- The function already built a full customer snapshot and handed it back; the
-- caller simply logged a handful of fields from it. So the fix is to widen the
-- snapshot to everything that is about to be destroyed and to log the lot.
--
-- This does not make deletion reversible by itself — restoring is still a
-- deliberate act by a person reading the audit row. It makes it POSSIBLE,
-- which it was not.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via the Supabase
-- Management API on 2026-09-16. This file is the source-control mirror.
-- ============================================================================

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
  select cu.cid into v_cid from customers cu where cu.id = p_customer_id;
  if not found then
    raise exception 'No customer %', p_customer_id using errcode = 'no_data_found';
  end if;

  if exists (select 1 from orders o
             where o.customer_id = p_customer_id and o.stripe_session_id like 'cs_live_%') then
    raise exception 'Refused: this customer has a real Stripe payment' using errcode = 'raise_exception';
  end if;

  -- Everything worth putting back, captured BEFORE anything is deleted.
  -- The child tables are the ones a person would actually need to reconstruct
  -- someone: what they bought, what they paid, what credit they held, whether
  -- they were waiting for a spot.
  v_snapshot := jsonb_build_object(
    'snapshot_version', 2,
    'captured_at', now(),
    'customer', (select to_jsonb(cu) from customers cu where cu.id = p_customer_id),
    'contact', (select to_jsonb(ct) from contacts ct where ct.customer_id = p_customer_id),
    'auth_email', (select u.email from auth.users u where u.id = p_customer_id),
    'subscriptions', coalesce((select jsonb_agg(to_jsonb(s)) from subscriptions s where s.customer_id = p_customer_id), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(o)) from orders o where o.customer_id = p_customer_id), '[]'::jsonb),
    'credits', coalesce((select jsonb_agg(to_jsonb(cr)) from credits cr where cr.customer_id = p_customer_id), '[]'::jsonb),
    'intake_waitlist', coalesce((select jsonb_agg(to_jsonb(w)) from intake_waitlist w where w.customer_id = p_customer_id), '[]'::jsonb),
    'season_holds', coalesce((select jsonb_agg(to_jsonb(h)) from season_holds h where h.customer_id = p_customer_id), '[]'::jsonb),
    'referrals', coalesce((select jsonb_agg(to_jsonb(r)) from referrals r
                            where r.inviter_user_id = p_customer_id
                               or r.invitee_user_id = p_customer_id
                               or r.inviter_cid = v_cid), '[]'::jsonb),
    'staff_members', coalesce((select jsonb_agg(to_jsonb(sm)) from staff_members sm where sm.customer_id = p_customer_id), '[]'::jsonb),
    'comped_meal_ledger', coalesce((select jsonb_agg(to_jsonb(m)) from comped_meal_ledger m where m.customer_id = p_customer_id), '[]'::jsonb)
  );

  -- Deletion order is unchanged and still hand-written: credits before the
  -- orders they were applied to, the waitlist row before the credit it minted,
  -- orders before their subscription.
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

  delete from intake_waitlist where customer_id = p_customer_id;
  delete from season_holds     where customer_id = p_customer_id;
  delete from credits          where customer_id = p_customer_id;
  delete from orders           where customer_id = p_customer_id;

  delete from comped_meal_ledger     where customer_id = p_customer_id;
  delete from referral_gifts_claimed where user_id = p_customer_id;
  delete from referrals where inviter_user_id = p_customer_id
                           or invitee_user_id = p_customer_id
                           or inviter_cid = v_cid;
  delete from staff_members where customer_id = p_customer_id;
  delete from subscriptions where customer_id = p_customer_id;
  delete from contacts      where customer_id = p_customer_id;
  delete from customers     where id = p_customer_id;

  -- The login last: without it on_auth_user_created rebuilds a blank customer
  -- the next time this person signs in, undoing the cleanup silently.
  delete from auth.users where id = p_customer_id;

  return v_snapshot;
end;
$$;

grant execute on function public.admin_delete_customer(uuid) to service_role;

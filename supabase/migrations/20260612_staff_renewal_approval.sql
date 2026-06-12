-- ============================================================================
-- Staff renewal approval — the admin's "final green check".
-- (Applied to Dormers-Ohio via MCP on 2026-06-12; tracked here for the repo.)
--
-- An intern self-renews (5-day free or 6-day prepaid) and the new cycle
-- queues as Scheduled, but it must NOT activate until the admin approves it
-- from /admin/staff. Mechanics:
--
--   • subscriptions.staff_approval: NULL for every non-staff sub and for an
--     intern's FIRST plan (the invite itself was the approval). 'pending'
--     on staff RENEWALS (stamped automatically by trigger, so both the
--     free-renewal insert and the Stripe-webhook insert get it without
--     touching either code path). 'approved' after the admin clicks.
--   • subscription_status_tick step 2 skips Scheduled subs while
--     staff_approval = 'pending' — they wait at the gate even past their
--     start_date, and activate on the first tick after approval.
-- ============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS staff_approval text
  CHECK (staff_approval IN ('pending', 'approved'));

CREATE OR REPLACE FUNCTION public._subscriptions_stamp_staff_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Renewal = the customer already has an earlier Staff Monthly sub. The
  -- first staff plan sails through (invite was the approval).
  IF NEW.plan_name = 'Staff Monthly'
     AND NEW.status = 'Scheduled'
     AND NEW.staff_approval IS NULL
     AND EXISTS (
       SELECT 1 FROM public.subscriptions s
       WHERE s.customer_id = NEW.customer_id
         AND s.plan_name = 'Staff Monthly'
     )
  THEN
    NEW.staff_approval := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_subscriptions_staff_approval ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_staff_approval
  BEFORE INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._subscriptions_stamp_staff_approval();

-- status_tick step 2 gains: AND (staff_approval IS DISTINCT FROM 'pending')
-- (full function body lives in the live DB; see the applied migration)

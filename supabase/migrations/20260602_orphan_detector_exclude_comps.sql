-- ============================================================================
-- Orphan detector: exclude comped subscriptions.
--
-- The orphan detector (20260531_orphan_subscription_detector.sql) flags any
-- subscription with no matching `orders` row, on the assumption every live sub
-- is backed by a paid/credit-redeemed order. Comped meals break that
-- assumption by design — referee welcome gifts and (future) intern compensation
-- never produce an orders row; their financial trail lives in
-- `comped_meal_ledger` instead. The detector had no awareness of this, so every
-- comped sub sitting in a live status (e.g. a Welcome Meal scheduled days out)
-- got false-flagged as an orphan and paged the admin.
--
-- Fix: skip any plan that maps to a comp expense category. We reuse the same
-- central `expense_category_for_plan()` mapping the ledger uses, so welcome
-- meals and any future comped plan are excluded automatically — one source of
-- truth, no second list to keep in sync.
--
-- Only the WHERE clause gains one line; everything else is byte-identical to
-- the original definition.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.detect_orphan_subscriptions_tick()
RETURNS TABLE(alerted_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  total_alerted int := 0;
  orphan_row    RECORD;
  alert_msg     text;
  http_req_id   bigint;
BEGIN
  FOR orphan_row IN
    SELECT s.id, s.customer_id, s.plan_name, s.status, s.start_date, s.created_at
    FROM public.subscriptions s
    LEFT JOIN public.orders o ON o.subscription_id = s.id
    WHERE o.id IS NULL
      AND s.created_at < now() - interval '15 minutes'
      AND s.orphan_alerted_at IS NULL
      -- Exclude historical backfill / test rows. The active-flow rows are
      -- all newer than the cutover commit on 2026-05-20; if you imported
      -- legacy data after that date you'll want to bump this filter.
      AND s.created_at > timestamp '2026-05-25'
      AND s.status IN ('Active', 'Paused', 'Skipped', 'Scheduled')
      -- Comped subs (welcome gifts, intern comp, …) are EXPECTED to have no
      -- orders row — their trail is comped_meal_ledger, not orders. Skip any
      -- plan that maps to a comp expense category.
      AND public.expense_category_for_plan(s.plan_name) IS NULL
    ORDER BY s.created_at ASC
    LIMIT 20
  LOOP
    alert_msg := format(
      'Orphan subscription detected: id=%s customer=%s plan=%s status=%s start=%s. ' ||
      'Created %s ago with NO matching orders row — likely a concurrent-webhook race ' ||
      'where the sub-rollback also failed. Inspect and DELETE the sub if confirmed orphan.',
      orphan_row.id,
      orphan_row.customer_id,
      orphan_row.plan_name,
      orphan_row.status,
      orphan_row.start_date,
      age(now(), orphan_row.created_at)
    );

    SELECT public.send_admin_whatsapp_alert(alert_msg, orphan_row.id::text) INTO http_req_id;

    UPDATE public.subscriptions
       SET orphan_alerted_at = now()
     WHERE id = orphan_row.id;

    total_alerted := total_alerted + 1;
  END LOOP;

  alerted_count := total_alerted;
  RETURN NEXT;
END;
$$;

COMMIT;

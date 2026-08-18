-- ============================================================================
-- Season WhatsApp templates + two dispatcher hardening fixes.
-- Applied live to Ohio (yjjayivwfqjfppawgyaz) via Supabase MCP on 2026-08-17.
--
-- ⚠ READ BEFORE RUNNING. This file is a MIRROR, not a replay.
--
-- The dispatcher body is ~15k characters and this repo's migrations are known
-- to drift from live (see the header of 20260817_pause_suppress_renew_nudges).
-- Retyping the body here would risk a mirror that silently disagrees with
-- production, so instead this file reproduces the exact TRANSFORMATION that
-- was applied: it reads the live definition, rewrites anchored fragments, and
-- re-executes the result. Postgres does the surgery; nothing is transcribed.
--
-- It is NOT idempotent. Running it twice re-adds the declarations and fails.
-- Every anchor is guarded, and the whole thing is one transaction, so a
-- missing anchor aborts without applying anything.
--
-- LIVE IS THE SOURCE OF TRUTH. To read the current body:
--   SELECT pg_get_functiondef('public.dispatch_customer_notifications_tick'::regproc);
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
--
-- 1. Season WhatsApp. The seasonal pause already swaps the plan-ended EMAIL to
--    season copy; the WhatsApp side was silence, only because no Meta template
--    existed. Two now do. A WhatsApp template cannot carry the email's
--    either/or block, so there is one per audience:
--      intake_ended_credit — they already hold the credit
--      intake_ended_offer  — empty wallet, we are offering it
--    Both MARKETING. Both use a STATIC url button (button parameters are
--    rejected by Meta with error 132018).
--
-- 2. The silent-loss trap. The components CASE has no ELSE, so a kind with a
--    Vault entry but no branch produced components = NULL. The old code posted
--    that to Meta as "components": null and then stamped sent_at, so the
--    message vanished while the row claimed success — and a malformed request
--    risks the number's quality rating, which degrades EVERY template we send.
--    Now: post nothing, close the row as 'skipped:no_component_branch'.
--
-- 3. The forever-jam trap. A kind with no tpl_<kind> Vault entry warned and
--    CONTINUEd without setting sent_at, so it returned every tick forever and
--    sat at the head of the oldest-first LIMIT 100 batch, crowding out real
--    sends. Now: six-hour grace (long enough to add a forgotten secret), then
--    close the row as 'skipped:no_template'.
--    This is what made the old build order a landmine. It is now a preference.
--    It also defuses delivery_unconfirmed_8pm, an allowed kind that has never
--    fired and has neither a Vault entry nor a branch.
--
-- 4. Ended-cron dedup. The fan-out queues a season kind INSTEAD of
--    subscription_ended during a pause, so a dedup matching only the latter
--    would see an un-notified customer and re-dispatch the next night,
--    duplicating the season email.
--
-- ── BUILD ORDER (matters) ────────────────────────────────────────────────────
--   1. Meta approves the template
--   2. dispatcher CASE branch   (harmless dead code until a row exists)
--   3. tpl_<kind> secret in Vault
--   4. kind allowed by the check constraint
--   5. app starts queueing  ← WHATSAPP_SEASON_ENDED_ENABLED=true, last
-- Steps 2-4 are in this file. Step 5 is an env var so it needs no deploy, and
-- resolveEndedNotice fails CLOSED: unset means stay silent, never send.
-- ============================================================================

BEGIN;

-- ── 1. Allow the two new kinds ───────────────────────────────────────────────
ALTER TABLE public.customer_notifications
  DROP CONSTRAINT customer_notifications_kind_check;

ALTER TABLE public.customer_notifications
  ADD CONSTRAINT customer_notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'meal_skipped_confirm','meal_resumed_confirm','meal_skip_scheduled_confirm','meal_skip_cancelled_confirm',
    'plan_paused_confirm','plan_pause_scheduled_confirm','plan_pause_cancelled_confirm','plan_resumed_confirm',
    'plan_start_date_changed_confirm','payment_order_confirmed','welcome_meal_confirmed','subscription_renew_nudge',
    'meals_gifted_confirm','referral_converted','refund_processed','subscription_ended','delivery_confirmed',
    'delivery_unconfirmed_8pm','intake_ended_credit','intake_ended_offer'
  ]::text[]));

-- ── 2. Rewrite the dispatcher in place ───────────────────────────────────────
DO $surgery$
DECLARE
  d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dispatch_customer_notifications_tick';

  -- 2a. variable for the offer amount
  IF position($a1$  credit_aed_str      text;$a1$ IN d) = 0 THEN RAISE EXCEPTION 'anchor 1 missing'; END IF;
  d := replace(d,
    $a1$  credit_aed_str      text;$a1$,
    $a1n$  credit_aed_str      text;
  offer_aed_str       text;$a1n$);

  -- 2b. carry scheduled_for so the no-template path can bound itself by age
  IF position($a2$    SELECT n.id AS notif_id, n.customer_id, n.kind, n.payload,$a2$ IN d) = 0 THEN RAISE EXCEPTION 'anchor 2 missing'; END IF;
  d := replace(d,
    $a2$    SELECT n.id AS notif_id, n.customer_id, n.kind, n.payload,$a2$,
    $a2n$    SELECT n.id AS notif_id, n.customer_id, n.kind, n.payload, n.scheduled_for,$a2n$);

  -- 2c. extract the offer amount from the payload
  IF position($a3$    credit_aed_str      := NULLIF(notif_row.payload ->> 'credit_aed', '');$a3$ IN d) = 0 THEN RAISE EXCEPTION 'anchor 3 missing'; END IF;
  d := replace(d,
    $a3$    credit_aed_str      := NULLIF(notif_row.payload ->> 'credit_aed', '');$a3$,
    $a3n$    credit_aed_str      := NULLIF(notif_row.payload ->> 'credit_aed', '');
    offer_aed_str       := NULLIF(notif_row.payload ->> 'offer_aed', '');$a3n$);

  -- 2d. stop the missing-Vault-entry case retrying forever (see WHY 3)
  IF position($a4$      RAISE WARNING 'dispatch_customer_notifications_tick: no template for kind=%', notif_row.kind;
      no_template_total := no_template_total + 1;
      CONTINUE;$a4$ IN d) = 0 THEN RAISE EXCEPTION 'anchor 4 missing'; END IF;
  d := replace(d,
    $a4$      RAISE WARNING 'dispatch_customer_notifications_tick: no template for kind=%', notif_row.kind;
      no_template_total := no_template_total + 1;
      CONTINUE;$a4$,
    $a4n$      -- Grace window, then give up. A missing vault entry used to leave the
      -- row unsent forever: it came back every tick and sat at the front of the
      -- oldest-first batch, crowding out real sends. Six hours is long enough to
      -- add a secret someone forgot, short enough that a genuinely absent
      -- template cannot jam the queue.
      IF notif_row.scheduled_for < now() - interval '6 hours' THEN
        UPDATE public.customer_notifications
           SET sent_at = now(), wamid = 'skipped:no_template'
         WHERE id = notif_row.notif_id;
        RAISE WARNING 'dispatch_customer_notifications_tick: giving up after 6h, no template for kind=%', notif_row.kind;
      ELSE
        RAISE WARNING 'dispatch_customer_notifications_tick: no template for kind=%', notif_row.kind;
      END IF;
      no_template_total := no_template_total + 1;
      CONTINUE;$a4n$);

  -- 2e. the two seasonal-pause branches.
  -- parameter_name values MUST match the templates as approved in Business
  -- Manager, and the payload keys the fan-out sends. Verified against the real
  -- outgoing Meta payload before shipping.
  IF position($a5$      WHEN 'delivery_confirmed' THEN$a5$ IN d) = 0 THEN RAISE EXCEPTION 'anchor 5 missing'; END IF;
  d := replace(d,
    $a5$      WHEN 'delivery_confirmed' THEN$a5$,
    $a5n$      WHEN 'intake_ended_credit' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name',       'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'delivered_meals', 'text', delivered_meals_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed',      'text', credit_aed_str))))

      WHEN 'intake_ended_offer' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name',       'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'delivered_meals', 'text', delivered_meals_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'offer_aed',       'text', offer_aed_str))))

      WHEN 'delivery_confirmed' THEN$a5n$);

  -- 2f. never post a payload we know is malformed (see WHY 2)
  IF position($a6$    END;

    meta_payload := jsonb_build_object($a6$ IN d) = 0 THEN RAISE EXCEPTION 'anchor 6 missing'; END IF;
  d := replace(d,
    $a6$    END;

    meta_payload := jsonb_build_object($a6$,
    $a6n$    END;

    -- The CASE above has no ELSE, so a kind with a vault entry but no branch
    -- lands here as NULL. The old code posted that to Meta as
    -- "components": null and then stamped sent_at, so the message was silently
    -- lost while the row claimed success — and a malformed request risks the
    -- number's quality rating, which affects every template we send. Close it
    -- out honestly and post nothing.
    IF components IS NULL THEN
      RAISE WARNING 'dispatch_customer_notifications_tick: no component branch for kind=%', notif_row.kind;
      UPDATE public.customer_notifications
         SET sent_at = now(), wamid = 'skipped:no_component_branch'
       WHERE id = notif_row.notif_id;
      no_template_total := no_template_total + 1;
      CONTINUE;
    END IF;

    meta_payload := jsonb_build_object($a6n$);

  EXECUTE d;
END $surgery$;

-- ── 3. Teach the ended cron that a season kind means "already handled" ────────
DO $fix$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='dispatch_subscription_ended_tick';

  IF position($o$          AND cn.kind = 'subscription_ended'$o$ IN d) = 0 THEN
    RAISE EXCEPTION 'dedup anchor missing';
  END IF;

  d := replace(d,
    $o$          AND cn.kind = 'subscription_ended'$o$,
    $n$          -- Season kinds count as "already handled". During a pause the
          -- fan-out queues intake_ended_credit / intake_ended_offer INSTEAD of
          -- subscription_ended, so matching only the latter would leave this
          -- customer looking un-notified and re-dispatch them the next night,
          -- duplicating the season email.
          AND cn.kind IN ('subscription_ended', 'intake_ended_credit', 'intake_ended_offer')$n$);

  EXECUTE d;
END $fix$;

COMMIT;

-- ── Verified on 2026-08-17, all inside self-aborting DO blocks so production
--    was never left changed ────────────────────────────────────────────────────
--  • Temporary Vault secrets + queued rows of both new kinds produced exactly
--    the right Meta payload: locale 'en', named parameters, header first_name,
--    body plan_name / delivered_meals / credit_aed | offer_aed.
--  • A fresh row with no Vault entry correctly stayed unsent (grace window).
--  • A 7-hour-old row with no Vault entry was closed as 'skipped:no_template'
--    instead of jamming.
--  • Rollback confirmed: no leftover secrets, rows, or queued requests.

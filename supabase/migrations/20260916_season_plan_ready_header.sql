-- ============================================================================
-- season_plan_ready has no header variable.
--
-- Read back from Meta on 2026-09-16 against the approved templates: this one
-- has a fixed header, "Dormers' is back !", and takes first_name in the body
-- alongside held_meals and plan_name. The dispatcher was sending a header
-- parameter, which Meta rejects outright, so the message would have failed
-- every time the season reopened. Caught before it ever fired.
--
-- The body was copied from the applied intake_back_open_plan_name migration;
-- only the marked branch differs.
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_plan_ready_header`. This file is the mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_customer_notifications_tick()
 RETURNS TABLE(sent_count integer, skipped_unverified_count integer, skipped_no_template_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  sent_total          int := 0;
  unverified_total    int := 0;
  no_template_total   int := 0;
  notif_row           RECORD;
  whatsapp_token      text;
  phone_number_id     text;
  template_name       text;
  template_lang       text;
  first_name          text;
  to_phone            text;
  meta_url            text;
  meta_payload        jsonb;
  components          jsonb;
  meal_date_str       text;
  start_date_str      text;
  end_date_str        text;
  plan_name_str       text;
  total_aed_str       text;
  meals_gifted_str    text;
  referral_str        text;
  credit_aed_str      text;
  offer_aed_str       text;
  refund_aed_str      text;
  delivered_meals_str text;
  wrap_up_day_str     text;  -- Plan E
  last_dinner_str     text;  -- Plan E
  held_meals_str      text;  -- Plan E
  http_req_id         bigint;
BEGIN
  SELECT decrypted_secret INTO whatsapp_token
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_access_token' LIMIT 1;
  SELECT decrypted_secret INTO phone_number_id
    FROM vault.decrypted_secrets WHERE name = 'whatsapp_phone_number_id' LIMIT 1;

  IF whatsapp_token IS NULL OR phone_number_id IS NULL THEN
    RAISE WARNING 'dispatch_customer_notifications_tick: shared Meta secrets missing';
    sent_count := 0;
    skipped_unverified_count := 0;
    skipped_no_template_count := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  meta_url := format('https://graph.facebook.com/v22.0/%s/messages', phone_number_id);

  FOR notif_row IN
    SELECT n.id AS notif_id, n.customer_id, n.kind, n.payload, n.scheduled_for,
           c.whatsapp_number, c.whatsapp_verified, c.name AS customer_name
    FROM public.customer_notifications n
    JOIN public.customers c ON c.id = n.customer_id
    WHERE n.scheduled_for <= now() AND n.sent_at IS NULL
    ORDER BY n.scheduled_for ASC
    LIMIT 100
    FOR UPDATE OF n SKIP LOCKED
  LOOP
    IF notif_row.whatsapp_number IS NULL OR notif_row.whatsapp_verified IS NOT TRUE THEN
      UPDATE public.customer_notifications
         SET sent_at = now(), wamid = 'skipped:unverified'
       WHERE id = notif_row.notif_id;
      unverified_total := unverified_total + 1;
      CONTINUE;
    END IF;

    template_name := NULL;
    SELECT decrypted_secret INTO template_name
      FROM vault.decrypted_secrets
      WHERE name = 'tpl_' || notif_row.kind LIMIT 1;
    IF template_name IS NULL THEN
      -- Grace window, then give up. A missing vault entry used to leave the
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
      CONTINUE;
    END IF;

    template_lang := CASE notif_row.kind
      WHEN 'meal_resumed_confirm'      THEN 'en_AE'
      ELSE 'en'
    END;

    first_name := COALESCE(NULLIF(split_part(notif_row.customer_name, ' ', 1), ''), 'there');
    to_phone := regexp_replace(notif_row.whatsapp_number, '^\+', '');

    meal_date_str := NULL;
    IF notif_row.payload ? 'meal_date' THEN
      meal_date_str := to_char((notif_row.payload ->> 'meal_date')::date, 'FMDDth FMMonth');
    END IF;
    start_date_str := NULL;
    IF notif_row.payload ? 'start_date' THEN
      start_date_str := to_char((notif_row.payload ->> 'start_date')::date, 'FMDDth FMMonth');
    END IF;
    end_date_str := NULL;
    IF notif_row.payload ? 'end_date' THEN
      end_date_str := to_char((notif_row.payload ->> 'end_date')::date, 'FMDDth FMMonth');
    END IF;
    plan_name_str := NULLIF(notif_row.payload ->> 'plan_name', '');
    total_aed_str := NULLIF(notif_row.payload ->> 'total_aed', '');
    meals_gifted_str := NULLIF(notif_row.payload ->> 'meals_gifted', '');

    referral_str        := NULLIF(notif_row.payload ->> 'referral', '');
    credit_aed_str      := NULLIF(notif_row.payload ->> 'credit_aed', '');
    offer_aed_str       := NULLIF(notif_row.payload ->> 'offer_aed', '');
    refund_aed_str      := NULLIF(notif_row.payload ->> 'refund_aed', '');
    delivered_meals_str := NULLIF(notif_row.payload ->> 'delivered_meals', '');
    -- Plan E: season kinds (spec §12.4)
    wrap_up_day_str := NULL;
    IF notif_row.payload ? 'wrap_up_day' THEN
      wrap_up_day_str := to_char((notif_row.payload ->> 'wrap_up_day')::date, 'FMDay FMDDth FMMonth');
    END IF;
    last_dinner_str := NULL;
    IF notif_row.payload ? 'last_dinner' THEN
      last_dinner_str := to_char((notif_row.payload ->> 'last_dinner')::date, 'FMDay FMDDth FMMonth');
    END IF;
    held_meals_str := NULLIF(notif_row.payload ->> 'held_meals', '');

    components := CASE notif_row.kind

      WHEN 'meal_skipped_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'meal_date', 'text', meal_date_str))))

      WHEN 'payment_order_confirmed' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'total_aed', 'text', total_aed_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'start_date', 'text', start_date_str))))

      WHEN 'welcome_meal_confirmed' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'start_date', 'text', start_date_str))))

      WHEN 'meal_resumed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))

      WHEN 'plan_paused_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))

      WHEN 'plan_pause_scheduled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'start_date', 'text', start_date_str))))

      WHEN 'plan_resumed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))

      WHEN 'meal_skip_scheduled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'meal_date', 'text', meal_date_str))))

      WHEN 'meal_skip_cancelled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'meal_date', 'text', meal_date_str))))

      WHEN 'plan_pause_cancelled_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))

      WHEN 'plan_start_date_changed_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'start_date', 'text', start_date_str))))

      WHEN 'subscription_renew_nudge' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'end_date',  'text', end_date_str))))

      WHEN 'meals_gifted_confirm' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'meals_gifted', 'text', meals_gifted_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'end_date',     'text', end_date_str))))

      WHEN 'referral_converted' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'referral', 'text', referral_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'x',        'text', credit_aed_str))))

      WHEN 'refund_processed' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'x', 'text', refund_aed_str))))

      WHEN 'subscription_ended' THEN
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'x',         'text', delivered_meals_str))))

      -- v7: no-variable template — send empty components array
      WHEN 'intake_ended_credit' THEN
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

      WHEN 'season_plan_runs_past' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'wrap_up_day', 'text', wrap_up_day_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'held_meals', 'text', held_meals_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed', 'text', credit_aed_str))))

      WHEN 'season_last_dinners' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'last_dinner', 'text', last_dinner_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'wrap_up_day', 'text', wrap_up_day_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'offer_aed', 'text', offer_aed_str))))

      WHEN 'season_skip_credited' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'wrap_up_day', 'text', wrap_up_day_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed', 'text', credit_aed_str))))

      WHEN 'season_plan_held' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'held_meals', 'text', held_meals_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed', 'text', credit_aed_str))))

      WHEN 'season_pause_carries' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'offer_aed', 'text', offer_aed_str))))

      WHEN 'season_spot_saved' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed', 'text', credit_aed_str))))

      -- The approved template carries a fixed header, "Dormers' is back !",
      -- and takes first_name in the body. Read from Meta 2026-09-16; sending a
      -- header parameter to it is a 400 on every message.
      WHEN 'season_plan_ready' THEN  -- Plan E, corrected against Meta
        jsonb_build_array(
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name),
            jsonb_build_object('type', 'text', 'parameter_name', 'held_meals', 'text', held_meals_str),
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str))))

      WHEN 'season_credit_waiting' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed', 'text', credit_aed_str))))

      -- Plan F (spec N15, N16). Parameter names assumed from the dispatcher
      -- convention (header first_name, body credit_aed); the templates were
      -- approved at Meta before this code and their copy is not in the repo.
      -- Confirm the names in Meta before adding tpl_intake_reopened and
      -- tpl_intake_back_open to Vault; a mismatch is a Meta 400, never a send.
      WHEN 'intake_reopened' THEN  -- Plan F
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'credit_aed', 'text', credit_aed_str))))

      WHEN 'intake_back_open' THEN  -- Plan F; plan_name confirmed by the owner 2026-09-16
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'plan_name', 'text', plan_name_str))))

      WHEN 'delivery_confirmed' THEN
        jsonb_build_array()

    END;

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

    meta_payload := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'to', to_phone,
      'type', 'template',
      'template', jsonb_build_object(
        'name', template_name,
        'language', jsonb_build_object('code', template_lang),
        'components', components
      )
    );

    SELECT net.http_post(
      url := meta_url,
      headers := jsonb_build_object('Authorization', 'Bearer ' || whatsapp_token, 'Content-Type', 'application/json'),
      body := meta_payload
    ) INTO http_req_id;

    UPDATE public.customer_notifications
       SET sent_at = now(),
           meta_request_id = http_req_id
     WHERE id = notif_row.notif_id;
    sent_total := sent_total + 1;
  END LOOP;

  sent_count := sent_total;
  skipped_unverified_count := unverified_total;
  skipped_no_template_count := no_template_total;
  RETURN NEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dispatch_customer_notifications_tick() FROM public, anon, authenticated;

COMMIT;

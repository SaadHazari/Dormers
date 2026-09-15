-- ============================================================================
-- Season wind-down, plan F: reopening (spec §5 "Admin reopens", §11.7
-- "Reopened" and "7 days after reopening", §12.2 N15 to N18).
--
-- The reopening notice stays a human action (the broadcast composer, kind
-- season_reopen). This migration widens its audience to every season's
-- credit holders and carves out held plans, which hear "your meals are
-- ready" (N17) through the season outbox when the notice is launched; queues
-- the credit-waiting nudge (N18) five days after reopening; tells the owner
-- two hours after reopening if the notice has not gone out, and seven days
-- after about plans not restarted and credit still unspent.
--
-- Copied from live and changed only on the lines marked "Plan F":
-- broadcast_audience, dispatch_customer_notifications_tick (intake_reopened,
-- intake_back_open) and season_invariants_tick (the two-hour reminder).
--
-- Applied live to Dormers-Ohio (yjjayivwfqjfppawgyaz) through the Management
-- API as migration `season_reopen_notices`. This file is the mirror.
-- ============================================================================

BEGIN;

ALTER TABLE public.intake_settings ADD COLUMN IF NOT EXISTS reopen_notice_sent_at timestamptz;

ALTER TABLE public.customer_notifications DROP CONSTRAINT IF EXISTS customer_notifications_kind_check;
ALTER TABLE public.customer_notifications ADD CONSTRAINT customer_notifications_kind_check CHECK (kind = ANY (ARRAY[
  'meal_skipped_confirm', 'meal_resumed_confirm', 'meal_skip_scheduled_confirm', 'meal_skip_cancelled_confirm',
  'plan_paused_confirm', 'plan_pause_scheduled_confirm', 'plan_pause_cancelled_confirm', 'plan_resumed_confirm',
  'plan_start_date_changed_confirm', 'payment_order_confirmed', 'welcome_meal_confirmed', 'subscription_renew_nudge',
  'meals_gifted_confirm', 'referral_converted', 'refund_processed', 'subscription_ended', 'delivery_confirmed',
  'delivery_unconfirmed_8pm', 'intake_ended_credit', 'intake_ended_offer',
  'season_plan_runs_past', 'season_last_dinners', 'season_skip_credited', 'season_plan_held',
  'season_pause_carries', 'season_spot_saved', 'season_plan_ready', 'season_credit_waiting',
  'intake_reopened', 'intake_back_open'
]::text[]));

-- N17: every ready hold hears "your meals are ready" the moment the owner
-- launches the reopening notice; the launch is stamped so the two-hour
-- reminder stays quiet.
CREATE OR REPLACE FUNCTION public.season_queue_reopen_notices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        public.intake_settings;
  h        record;
  v_queued integer := 0;
BEGIN
  SELECT * INTO r FROM public.intake_settings FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('queued', 0); END IF;
  UPDATE public.intake_settings SET reopen_notice_sent_at = COALESCE(reopen_notice_sent_at, now()) WHERE id = r.id;
  FOR h IN
    SELECT sh.id, sh.customer_id, sh.held_meals, sh.cycle_started_at, s.plan_name,
           (SELECT COALESCE(sum(cr.amount_aed), 0) FROM public.credits cr
             WHERE cr.customer_id = sh.customer_id AND cr.source = 'intake_waitlist' AND cr.status = 'approved') AS credit_aed
    FROM public.season_holds sh
    JOIN public.subscriptions s ON s.id = sh.subscription_id
    WHERE sh.state = 'ready'
  LOOP
    IF public.season_queue_notice(
      'season_plan_ready', h.customer_id, h.id, h.cycle_started_at, '', now(),
      jsonb_build_object('plan_name', h.plan_name, 'held_meals', h.held_meals, 'credit_aed', h.credit_aed))
    THEN v_queued := v_queued + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('queued', v_queued);
END;
$$;

-- 10:00 AE daily. Five days after reopening: credit holders without a plan
-- are nudged once (N18). Seven days after: the owner hears what is still
-- waiting (§11.7). Quiet in every other state.
CREATE OR REPLACE FUNCTION public.season_reopen_followups_tick(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r         public.intake_settings;
  v_today   date := (p_now AT TIME ZONE 'Asia/Dubai')::date;
  v_reopen  date;
  c         record;
  v_queued  integer := 0;
  v_ready   integer;
  v_unspent numeric;
  v_holders integer;
  v_sent    text[] := '{}';
BEGIN
  SELECT * INTO r FROM public.intake_settings;
  IF NOT FOUND OR r.season_phase <> 'open' OR r.cycle_ended_at IS NULL THEN
    RETURN jsonb_build_object('queued', 0, 'sent', to_jsonb(v_sent), 'reason', 'not_reopened');
  END IF;
  v_reopen := (r.cycle_ended_at AT TIME ZONE 'Asia/Dubai')::date;

  IF v_today = v_reopen + 5 THEN
    FOR c IN
      SELECT cr.customer_id, min(cr.id::text)::uuid AS credit_id, sum(cr.amount_aed) AS credit_aed
      FROM public.credits cr
      WHERE cr.source = 'intake_waitlist' AND cr.status = 'approved'
        AND NOT EXISTS (SELECT 1 FROM public.subscriptions s
                        WHERE s.customer_id = cr.customer_id AND s.status = ANY (ARRAY['Active','Paused','Skipped','Scheduled']))
      GROUP BY cr.customer_id
    LOOP
      IF public.season_queue_notice(
        'season_credit_waiting', c.customer_id, c.credit_id, COALESCE(r.cycle_started_at, r.cycle_ended_at), '', p_now,
        jsonb_build_object('credit_aed', c.credit_aed))
      THEN v_queued := v_queued + 1; END IF;
    END LOOP;
    IF v_queued > 0 THEN v_sent := v_sent || 'credit_waiting'::text; END IF;
  END IF;

  IF v_today = v_reopen + 7 THEN
    SELECT count(*) INTO v_ready FROM public.season_holds WHERE state = 'ready';
    SELECT COALESCE(sum(cr.amount_aed), 0), count(DISTINCT cr.customer_id) INTO v_unspent, v_holders
    FROM public.credits cr WHERE cr.source = 'intake_waitlist' AND cr.status = 'approved';
    BEGIN
      PERFORM public.send_admin_whatsapp_alert(
        format('A week since reopening: %s held plans have not been restarted, and %s customers still hold AED %s of waitlist credit. The credit nudge went out on day five.',
          v_ready, v_holders, trim(to_char(v_unspent, 'FM999990.99'), '.')),
        'season_reopen');
      v_sent := v_sent || 'week_after'::text;
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'season reopen follow-up alert failed: %', SQLERRM; END;
  END IF;

  RETURN jsonb_build_object('queued', v_queued, 'sent', to_jsonb(v_sent));
END;
$$;

CREATE OR REPLACE FUNCTION public.season_invariants_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          public.intake_settings;
  v_today    date := public.ae_today();
  v_now_ae   timestamp := now() AT TIME ZONE 'Asia/Dubai';
  v_active   integer;
  v_list     text;
  v_breaches text[] := '{}';
  v_stuck    integer;  -- Plan D
  v_waiting  record;   -- Plan D
BEGIN
  SELECT * INTO r FROM public.intake_settings;
  IF NOT FOUND THEN  -- Plan D: the refund checks below run in every phase
    RETURN jsonb_build_object('checked', false);
  END IF;

  -- An Active plan the delivery tick would cook, during the break.
  IF r.season_phase = 'break' THEN
    WITH cooking AS (
      SELECT id, plan_name, created_at FROM public.subscriptions
      WHERE status = 'Active'
        AND COALESCE(delivered_meals, 0) < total_meals - COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1)
    )
    SELECT count(*), string_agg(x.plan_name || ' ' || x.id::text, ', ' ORDER BY x.created_at)
      INTO v_active, v_list
    FROM (SELECT * FROM cooking ORDER BY created_at LIMIT 5) x;
    SELECT count(*) INTO v_active FROM public.subscriptions
    WHERE status = 'Active'
      AND COALESCE(delivered_meals, 0) < total_meals - COALESCE(credited_skip_days, 0) * COALESCE(meals_per_day, 1);
    IF v_active > 0 THEN
      v_breaches := v_breaches || 'active_during_break'::text;
      BEGIN
        PERFORM public.send_admin_whatsapp_alert(
          format('URGENT: %s plans are Active during the semester break, so they could be counted for cooking: %s. Pause each one from its customer page and check the Season page.', v_active, v_list),
          'season_invariant');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'season invariant alert failed: %', SQLERRM;
      END;
    END IF;
  END IF;

  -- The break has not started although the close day has passed (01:30 AE).
  IF r.season_phase = 'winding_down' AND r.close_day IS NOT NULL AND r.close_day < v_today
     AND (v_now_ae::time >= time '01:30' OR r.close_day < v_today - 1) THEN
    v_breaches := v_breaches || 'break_not_started'::text;
    BEGIN
      PERFORM public.send_admin_whatsapp_alert(
        format('URGENT: the semester break has not started. The close day was %s and it is past 01:30 in Dubai, so plans with meals left are not held and nothing stops a restart. Check the semester break starter on the Scheduled Jobs page.', to_char(r.close_day, 'Dy DD Mon')),
        'season_invariant');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'season invariant alert failed: %', SQLERRM;
    END;
  END IF;

  -- Plan F (spec §11.7 "Reopened"): reopened two hours ago and the reopening
  -- notice has not gone out. Said once per reopening.
  IF r.season_phase = 'open' AND r.cycle_ended_at IS NOT NULL AND r.reopen_notice_sent_at IS NULL
     AND r.cycle_ended_at < now() - interval '2 hours' AND r.cycle_ended_at > now() - interval '48 hours'
     AND COALESCE(r.season_digest_state->>'reopen_reminded_for', '') <> r.cycle_ended_at::text THEN
    v_breaches := v_breaches || 'reopen_notice_not_sent'::text;
    BEGIN
      PERFORM public.send_admin_whatsapp_alert(
        'You reopened over two hours ago and the reopening notice has not gone out. Held plans are ready, but nobody has been told. Send it from the Season page.',
        'season_reopen');
      UPDATE public.intake_settings
      SET season_digest_state = COALESCE(season_digest_state, '{}'::jsonb) || jsonb_build_object('reopen_reminded_for', r.cycle_ended_at::text)
      WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'season reopen reminder failed: %', SQLERRM;
    END;
  END IF;

  -- Plan D (spec G10): a refund Stripe may have taken but we never recorded.
  SELECT count(*), string_agg(id::text, ', ') INTO v_stuck, v_list
  FROM public.season_holds
  WHERE state = 'refund_processing' AND updated_at < now() - interval '30 minutes';
  IF v_stuck > 0 THEN
    v_breaches := v_breaches || 'refund_processing_stuck'::text;
    BEGIN
      PERFORM public.send_admin_whatsapp_alert(
        format('URGENT: %s season refund(s) have been processing for over 30 minutes: %s. Check Stripe for the refund, then use Retry on the Season page or settle by hand.', v_stuck, v_list),
        'season_invariant');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'season invariant alert failed: %', SQLERRM;
    END;
  END IF;

  -- Plan D (spec §10.3 step 6): a request the owner has not answered in 24 hours, reminded once.
  FOR v_waiting IN
    SELECT h.id, h.held_meals, h.cash_refund_fils, h.credit_share_fils, c.name AS customer_name, s.plan_name
    FROM public.season_holds h
    JOIN public.subscriptions s ON s.id = h.subscription_id
    JOIN public.customers c ON c.id = h.customer_id
    WHERE h.state = 'refund_requested'
      AND h.refund_requested_at < now() - interval '24 hours'
      AND h.refund_reminded_at IS NULL
    ORDER BY h.refund_requested_at
  LOOP
    v_breaches := v_breaches || 'refund_request_waiting'::text;
    BEGIN
      PERFORM public.send_admin_whatsapp_alert(
        format('Reminder: %s asked for a refund on their %s a day ago and is still waiting. %s held meals, AED %s back to the card and AED %s back to the wallet. Approve or decline on the Season page.',
          v_waiting.customer_name, v_waiting.plan_name, v_waiting.held_meals,
          to_char(COALESCE(v_waiting.cash_refund_fils, 0) / 100.0, 'FM999990.00'),
          to_char(COALESCE(v_waiting.credit_share_fils, 0) / 100.0, 'FM999990.00')),
        'season_refund');
      UPDATE public.season_holds SET refund_reminded_at = now() WHERE id = v_waiting.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'season refund reminder failed: %', SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('checked', r.season_phase <> 'open' OR v_stuck > 0 OR v_breaches <> '{}', 'breaches', to_jsonb(v_breaches));
END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_audience(p_audience text, p_dorm text DEFAULT NULL::text)
 RETURNS TABLE(customer_id uuid, email text, first_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        select 1 from public.intake_waitlist w
        where w.customer_id = c.id
          and w.cycle_started_at = (select cycle_started_at from public.intake_settings))
      when 'ended_not_renewed' then
        exists (select 1 from public.subscriptions s
                where s.customer_id = c.id and s.status = 'Ended')
        and not exists (select 1 from public.subscriptions s
                        where s.customer_id = c.id and s.status = any (array['Active','Paused','Skipped','Scheduled']))
      when 'dorm' then c.dorm_name = p_dorm
      -- Plan F (spec §12.2 N15, N16): everyone holding unspent waitlist credit
      -- from any season, everyone who saved a spot in any season, and past
      -- customers without a live plan. A customer whose plan is held and ready
      -- gets "your meals are ready" (N17) through the season outbox instead,
      -- so they are left out here.
      when 'reopen' then
        (
          exists (select 1 from public.intake_waitlist w where w.customer_id = c.id)
          or exists (select 1 from public.credits cr
                     where cr.customer_id = c.id and cr.source = 'intake_waitlist' and cr.status = 'approved')
          or (exists (select 1 from public.subscriptions s
                      where s.customer_id = c.id and s.status = 'Ended')
              and not exists (select 1 from public.subscriptions s
                              where s.customer_id = c.id and s.status = any (array['Active','Paused','Skipped','Scheduled'])))
        )
        and not exists (select 1 from public.season_holds h
                        where h.customer_id = c.id and h.state = 'ready')
      else false
    end
$function$;

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

      WHEN 'season_plan_ready' THEN  -- Plan E
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))),
          jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
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

      WHEN 'intake_back_open' THEN  -- Plan F
        jsonb_build_array(
          jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))

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

SELECT cron.schedule('season_reopen_followups_tick', '0 6 * * *', 'SELECT public.season_reopen_followups_tick();');

REVOKE EXECUTE ON FUNCTION public.season_queue_reopen_notices() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_reopen_followups_tick(timestamptz) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_invariants_tick() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_customer_notifications_tick() FROM public, anon, authenticated;

COMMIT;

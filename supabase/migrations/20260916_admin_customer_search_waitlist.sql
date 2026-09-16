-- ============================================================================
-- admin_customer_search: surface the early-access list on the customers page.
--
-- The admin list could only group people by subscription status, so everyone
-- who had not bought yet arrived as one undifferentiated "No plan" bucket —
-- the 12 people holding a season-pause credit were indistinguishable from the
-- 24 who had only ever made an account. Two extra columns let the page split
-- that bucket into a "Waitlist" chip and an "Early signup" chip.
--
-- waitlist_joined_at is the customer's MOST RECENT intake_waitlist row across
-- every pause cycle, not just the current one: a past member who sat out an
-- earlier pause is still someone who asked to hear first, and the chip is
-- about the person, not the cycle. (broadcast_audience scopes to the current
-- cycle for the opposite reason — it decides who gets emailed.)
--
-- The credit is read through credits.intake_waitlist_id rather than
-- intake_waitlist.credit_id because that is the column the mint writes first;
-- the back-reference is set afterwards and can lag a retry. It is cast to
-- double precision so PostgREST returns a JSON number — numeric arrives as a
-- string and would silently fail Number.isInteger in waitlistNote().
--
-- The return type changes, so the old signature has to be dropped first.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via the Supabase
-- Management API on 2026-09-16. This file is the source-control mirror.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_customer_search(text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_customer_search(
  p_query text DEFAULT '',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, cid text, name text, email text, whatsapp_number text,
  dorm_name text, meal_preference_type text, week_type text,
  created_at timestamp with time zone,
  active_plan text, sub_status text,
  delivered_meals integer, total_meals integer, sub_id uuid,
  sub_start_date date, sub_end_date date,
  waitlist_joined_at timestamp with time zone,
  waitlist_credit_aed double precision
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT c.id, c.cid, c.name, c.email, c.whatsapp_number,
         c.dorm_name, c.meal_preference_type, c.week_type,
         c.created_at,
         s.plan_name AS active_plan,
         s.status AS sub_status,
         s.delivered_meals::int,
         s.total_meals::int,
         s.id AS sub_id,
         s.start_date AS sub_start_date,
         s.end_date AS sub_end_date,
         w.joined_at AS waitlist_joined_at,
         w.credit_aed AS waitlist_credit_aed
  FROM customers c
  LEFT JOIN LATERAL (
    SELECT sub.id, sub.plan_name, sub.status, sub.delivered_meals, sub.total_meals, sub.start_date, sub.end_date
    FROM subscriptions sub
    WHERE sub.customer_id = c.id
    ORDER BY
      CASE sub.status
        WHEN 'Active' THEN 1
        WHEN 'Paused' THEN 2
        WHEN 'Skipped' THEN 3
        WHEN 'Scheduled' THEN 4
        ELSE 5
      END,
      sub.created_at DESC
    LIMIT 1
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT iw.joined_at,
           (SELECT cr.amount_aed::float8
              FROM credits cr
             WHERE cr.intake_waitlist_id = iw.id
             LIMIT 1) AS credit_aed
    FROM intake_waitlist iw
    WHERE iw.customer_id = c.id
    ORDER BY iw.joined_at DESC
    LIMIT 1
  ) w ON true
  WHERE p_query = '' OR (
    c.name ILIKE '%' || p_query || '%' OR
    c.email ILIKE '%' || p_query || '%' OR
    c.whatsapp_number ILIKE '%' || p_query || '%' OR
    c.cid ILIKE '%' || p_query || '%' OR
    c.dorm_name ILIKE '%' || p_query || '%'
  )
  ORDER BY c.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

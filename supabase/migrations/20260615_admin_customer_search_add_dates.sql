-- Add sub_start_date and sub_end_date to admin_customer_search RPC
-- so the customer table can show First day / Last day badges at a glance.

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
  sub_start_date date, sub_end_date date
)
LANGUAGE plpgsql SECURITY DEFINER
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
         s.end_date AS sub_end_date
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

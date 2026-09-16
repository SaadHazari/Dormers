-- ============================================================================
-- admin_contact_search: the read side of the contact book.
--
-- Mirrors admin_customer_search deliberately — same argument shape, same
-- paging, same ordering contract — so /admin/contacts and /admin/customers
-- stay one idiom rather than two.
--
-- on_waitlist is resolved HERE rather than in the page, because the chip it
-- feeds has to agree with the Waitlist chip on the customers list and, later,
-- with the `waitlist_all` broadcast audience. All three should be reading the
-- same rule from the same place. It spans every pause cycle for the same
-- reason the customers chip does: the chip is about the person, not the cycle.
--
-- Ordered by first_seen_at, not created_at: an imported contact we met two
-- years ago should sort by when we met them, not by when the CSV landed.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via the Supabase
-- Management API on 2026-09-16. This file is the source-control mirror.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_contact_search(text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_contact_search(
  p_query text DEFAULT '',
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  email text,
  phone_e164 text,
  name text,
  source text,
  source_detail text,
  customer_id uuid,
  tags text[],
  email_status text,
  whatsapp_status text,
  last_emailed_at timestamptz,
  on_waitlist boolean,
  first_seen_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  SELECT ct.id, ct.email, ct.phone_e164, ct.name,
         ct.source, ct.source_detail, ct.customer_id, ct.tags,
         ct.email_status, ct.whatsapp_status, ct.last_emailed_at,
         ct.customer_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM intake_waitlist w WHERE w.customer_id = ct.customer_id
         ) AS on_waitlist,
         ct.first_seen_at, ct.created_at
  FROM contacts ct
  WHERE p_query = '' OR (
    ct.name       ILIKE '%' || p_query || '%' OR
    ct.email      ILIKE '%' || p_query || '%' OR
    ct.phone_e164 ILIKE '%' || p_query || '%' OR
    EXISTS (SELECT 1 FROM unnest(ct.tags) tag WHERE tag ILIKE '%' || p_query || '%')
  )
  ORDER BY ct.first_seen_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.admin_contact_search(text, integer, integer) TO service_role;

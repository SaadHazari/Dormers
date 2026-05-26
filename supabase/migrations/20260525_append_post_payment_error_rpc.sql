-- ============================================================================
-- append_post_payment_error — atomic jsonb append for the post-payment fan-out.
--
-- Concurrent channel handlers in the same webhook (WhatsApp / email / Zoho
-- run via Promise.all) may all fail at once. A naive read-modify-write of
-- orders.post_payment_errors would have the last-writer's append clobber
-- the first-writer's. This RPC uses jsonb_path_query_array / || on a row
-- locked FOR UPDATE so all appends survive.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.append_post_payment_error(
  p_order_id uuid,
  p_entry    jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
     SET post_payment_errors = COALESCE(post_payment_errors, '[]'::jsonb) || jsonb_build_array(p_entry)
   WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.append_post_payment_error(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_post_payment_error(uuid, jsonb) TO service_role;

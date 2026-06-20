-- cid_code is the 3-letter prefix for every customer ID generated at a dorm
-- (see src/shared/cid.ts -> generateCid). Two dorms sharing a code silently
-- collide customer-ID prefixes, so the value must be unique at the DB level.
--
-- The admin create/update actions (src/app/admin/dorms/actions.ts) already
-- pre-check for clashes, but that check-then-act is not concurrency-safe; this
-- index is the real backstop.
--
-- PRECONDITION: there must be NO existing duplicate cid_code values, or this
-- index creation fails. Verify against the LIVE (Ohio) database before applying:
--   SELECT cid_code, COUNT(*) FROM public.dorm_locations
--   GROUP BY cid_code HAVING COUNT(*) > 1;
-- Resolve any duplicates first, then apply via the Supabase MCP.

CREATE UNIQUE INDEX IF NOT EXISTS dorm_locations_cid_code_unique
  ON public.dorm_locations (cid_code);

-- ============================================================================
-- Ops link sharing — last-used tracking + crew teams
--
-- Two additions, both additive and safe to run against a live table:
--
--   1. ops_tokens.last_used_at — stamped by validateOpsToken() when a kitchen
--      or rider page is actually opened, throttled to at most one write per
--      10 minutes per token so a tablet left refreshing on a kitchen counter
--      does not turn into a write storm. Purely advisory: it answers "is this
--      link live, or a leftover nobody uses?" and nothing gates on it.
--
--   2. whatsapp_rider_allowlist.team — the crew list is now the single
--      directory of people who receive access links, so it holds kitchen staff
--      as well as riders. `team` decides which link type they are offered by
--      default in the share panel.
--
--      NOTE the deliberate separation: `is_active` still means "may confirm a
--      delivery by texting the Dormers WhatsApp number". Adding a kitchen PIC
--      here so you can send them a link must NOT hand them that power, so new
--      kitchen rows are created with is_active = false by the server action.
--      The inbound webhook is unchanged and still filters on is_active.
-- ============================================================================

ALTER TABLE public.ops_tokens
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

COMMENT ON COLUMN public.ops_tokens.last_used_at IS
  'Last time this token was used to open its page. Written throttled (max once per 10 min) by validateOpsToken; advisory only, nothing authorises against it.';

ALTER TABLE public.whatsapp_rider_allowlist
  ADD COLUMN IF NOT EXISTS team text NOT NULL DEFAULT 'rider';

-- Idempotent CHECK — ADD CONSTRAINT has no IF NOT EXISTS in Postgres.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.whatsapp_rider_allowlist'::regclass
      AND conname  = 'whatsapp_rider_allowlist_team_check'
  ) THEN
    ALTER TABLE public.whatsapp_rider_allowlist
      ADD CONSTRAINT whatsapp_rider_allowlist_team_check
      CHECK (team IN ('kitchen', 'rider'));
  END IF;
END $$;

COMMENT ON COLUMN public.whatsapp_rider_allowlist.team IS
  'kitchen | rider — which access link this person is offered by default. Existing rows default to rider, which is what they were. Does not affect the inbound delivery-confirmation allowlist, that is still is_active.';

COMMENT ON COLUMN public.whatsapp_rider_allowlist.is_active IS
  'May this number confirm a delivery by texting the Dormers WhatsApp number. Independent of team — kitchen crew are added with this false.';

-- The original table was granted SELECT/INSERT/UPDATE only, so removing a crew
-- member who left was impossible. Grants still apply to service_role (it
-- bypasses RLS, not privileges).
GRANT DELETE ON public.whatsapp_rider_allowlist TO service_role;

-- Phase 8 Plan 01: WhatsApp Inbound Trigger — Foundation Tables
-- Created: 2026-06-16
-- Requirements: WAI-04 (dedup), WAI-07 (rider allowlist)

-- ============================================================
-- Table 1: Deduplication log for processed inbound WhatsApp messages.
-- INSERT ON CONFLICT DO NOTHING prevents the same wamid from being handled twice
-- even if Meta's retry fires after we returned 200.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_processed (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    text        NOT NULL,    -- wamid e.g. "wamid.HBgL..."
  sender_phone  text        NOT NULL,    -- digits-only, no + (as received from Meta)
  raw_text      text,                    -- normalised rider input for audit
  matched_dorm  text,                    -- null if no/ambiguous match
  processed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id)
);

GRANT SELECT, INSERT ON public.whatsapp_inbound_processed TO service_role;

-- ============================================================
-- Table 2: Allowlist of rider phone numbers permitted to trigger
-- inbound delivery confirmations.
-- DB-backed (not env var) so riders can be added/removed without a redeploy.
-- phone_digits stores the number exactly as Meta sends it: digits-only, no + prefix.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_rider_allowlist (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_digits text        NOT NULL,  -- E.164 digits without +, e.g. "971504619384"
  label        text,                  -- rider name for audit
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone_digits)
);

GRANT SELECT, INSERT, UPDATE ON public.whatsapp_rider_allowlist TO service_role;

-- Single-use OTP support. A verified whatsapp_otps row must be usable by exactly
-- one downstream action — onboarding createAccount, referral claimGift, profile
-- markWhatsappVerified. consumed_at is stamped on first successful use; every
-- consumer filters `consumed_at IS NULL`, so a verified row cannot be replayed
-- across flows within its 30-minute window.
--
-- Nullable + additive: existing rows are unaffected. whatsapp_otps is a
-- service-role-only table (admin client), so the new column inherits the
-- table's existing grants — no GRANT needed.
--
-- Applied to the live Ohio DB via Supabase MCP (migration whatsapp_otps_consumed_at).
ALTER TABLE public.whatsapp_otps
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

-- FLOW-3: the per-IP referral velocity cap had nowhere to store an IP, so it
-- silently keyed on device_fp (bypassable by rotating the fp). Add a nullable
-- hashed-IP column (we never store the raw IP) so the 24h cap can key on it.
-- Applied to the live Ohio DB via MCP on 2026-06-20.
ALTER TABLE public.referral_gifts_claimed
  ADD COLUMN IF NOT EXISTS ip_hash text;

CREATE INDEX IF NOT EXISTS referral_gifts_claimed_ip_hash_claimed_at_idx
  ON public.referral_gifts_claimed (ip_hash, claimed_at);

-- ============================================================================
-- Credit reservation system — kills the two-tab double-spend race.
--
-- Without this: user opens checkout in two tabs, both tabs synthesize
-- coupons against the same approved credit rows, user completes both Stripe
-- sessions within 24h, and Stripe applies both discounts. Webhook flips the
-- rows once (CAS guard catches the second pass) but the user got two
-- discounts for one credit balance — Dormers eats the difference.
--
-- With this: checkout flips credit rows to status='reserved' atomically
-- BEFORE the Stripe coupon is created. The second tab's reservation CAS
-- fails on those rows (status is no longer 'approved'), the second coupon
-- has nothing to apply, and Stripe sees a normal full-price session.
--
-- Reservations expire after 24h (matches the Stripe coupon redeem_by) and
-- are released lazily at the start of the next checkout for that customer.
-- ============================================================================

BEGIN;

-- Allow 'reserved' as a transient status between 'approved' and 'applied'.
ALTER TABLE public.credits
  DROP CONSTRAINT IF EXISTS credits_status_check;
ALTER TABLE public.credits
  ADD CONSTRAINT credits_status_check
  CHECK (status IN ('pending','approved','reserved','applied','rejected'));

-- Reservation metadata. `reserved_token` ties the rows to a specific Stripe
-- checkout session so the webhook can flip exactly the right ones.
ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS reserved_token text,
  ADD COLUMN IF NOT EXISTS reserved_until timestamptz;

-- Fast lookup for webhook flip + lazy release.
CREATE INDEX IF NOT EXISTS credits_reserved_token_idx
  ON public.credits (reserved_token)
  WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS credits_reserved_until_idx
  ON public.credits (reserved_until)
  WHERE status = 'reserved';

COMMIT;

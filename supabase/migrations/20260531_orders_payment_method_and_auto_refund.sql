-- ============================================================================
-- Payment method + auto-refund tracking on orders.
--
-- Phase 6 introduces two new payment shapes:
--
-- 1. Free checkout (non-trial, 100% covered by Dorm Wars credit + tier):
--    no Stripe call, no Stripe IDs on the order. payment_method='credit'.
--    Zoho is skipped — no cash transaction to invoice for.
--
-- 2. Trial + 100% covered: Stripe still charges AED 1 (so the customer
--    has a card on file + we mint a real FTA invoice), then we
--    auto-refund the AED 1 immediately after the webhook completes.
--    payment_method='stripe', auto_refund_applied_at stamped after the
--    refund clears. The Zoho invoice gets a discount line so the
--    customer-facing PDF shows "Trial: AED 25, Credit Discount: AED 24,
--    Paid: AED 1".
--
-- payment_method default = 'stripe' so every existing row is correct
-- without backfill.
-- ============================================================================

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method         text NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS auto_refund_applied_at timestamptz;

-- Enum-ish guard: only allow known values. Cheaper than a pg enum because we
-- can add new values with an ALTER without rewriting check constraint logic.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('stripe', 'credit'));

COMMENT ON COLUMN public.orders.payment_method IS
  'How the customer settled this order. "stripe" = real Stripe charge (incl. trial+auto-refund). "credit" = 100% covered by Dorm Wars credit (no Stripe session at all).';
COMMENT ON COLUMN public.orders.auto_refund_applied_at IS
  'When the AED 1 trial auto-refund was issued. NULL on every non-trial path. Used by reports + by the refund handler to distinguish auto-refunds from real refunds.';

COMMIT;

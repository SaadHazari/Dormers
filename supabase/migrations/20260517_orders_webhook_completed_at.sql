-- ============================================================================
-- Webhook checkpointing — fixes audit P0-2.
--
-- Without this: if Stripe webhook attempt #1 succeeds at the order insert
-- but fails on credit flip / awarder / etc., retries find the existing
-- order and early-exit with deduped:true — leaving credits stuck in
-- reserved/approved state and the inviter's milestone unfired forever.
--
-- With this: the duplicate check distinguishes "order saved AND downstream
-- complete" (skip everything) from "order saved BUT downstream incomplete"
-- (resume the idempotent downstream steps).
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS webhook_completed_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_webhook_completed_idx
  ON public.orders (webhook_completed_at)
  WHERE webhook_completed_at IS NULL;

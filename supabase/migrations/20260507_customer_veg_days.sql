-- ════════════════════════════════════════════════════════════════════
--  Canonical customer.veg_days — persistent religious-mix preference
-- ════════════════════════════════════════════════════════════════════
--  Companion to pending_veg_days. Until now, religious-mix veg-day
--  picks only existed on the per-cycle subscription snapshot
--  (subscriptions.veg_days) and on the queued pending_veg_days. There
--  was no canonical home on the customer row, which meant:
--
--    1. Profile-side veg-day saves with no live sub silently dropped
--       the picks (no column to write to)
--    2. promotePendingPreferencesIfStale (sub ended without renewal)
--       had to null out pending_veg_days into the void
--    3. Checkout couldn't pre-fill the religious-mix day picker from
--       a stable user preference — every checkout started blank
--
--  This column closes the gap. The pending → canonical flow now
--  symmetrically applies to veg_days: profile saves with no live sub
--  write here, the promotion drain copies pending_veg_days here when
--  a sub ends, and checkout pre-fills from here on next purchase.
--  The kitchen still reads per-cycle from subscriptions.veg_days; this
--  is purely the customer's "preferred days" memory.
-- ════════════════════════════════════════════════════════════════════

alter table public.customers
  add column if not exists veg_days text[];

comment on column public.customers.veg_days is
  'Customer''s preferred religious-mix veg-day picks (text[] of working day names like {"Monday","Wednesday"}). Survives across subscriptions; pre-fills the religious-mix day picker at checkout. Kitchen still snapshots per-cycle into subscriptions.veg_days; this is the canonical user preference, not the kitchen contract.';

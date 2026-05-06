-- ════════════════════════════════════════════════════════════════════
--  Pending preferences (apply-from-next-subscription)
-- ════════════════════════════════════════════════════════════════════
--  A customer can change meal preference / delivery week / allergens /
--  spice / religious-mix veg-days while a sub is live, but the change
--  must NOT affect the current cycle (kitchen-ops is already cooking
--  per the sub snapshot). Writes go to these pending_* columns; the
--  webhook consumes them at the next sub creation and resets them.
--
--  Each column is nullable — null means "no pending change for this
--  field". The dashboard renders a sticky diff banner whenever any
--  pending column is non-null.
-- ════════════════════════════════════════════════════════════════════

alter table public.customers
  add column if not exists pending_meal_preference_type text,
  add column if not exists pending_week_type            text,
  add column if not exists pending_allergens            text,
  add column if not exists pending_spice_level_preference text,
  -- Religious-mix only — the days the customer wants veg deliveries.
  -- Stored as text[] to mirror subscriptions.veg_days. Cleared (set to
  -- null) when the customer's pending meal_preference_type isn't
  -- religious so we don't carry stale day picks across pref changes.
  add column if not exists pending_veg_days             text[],
  -- Constraint check: pending_week_type must be one of the valid values
  -- (or NULL). Mirrors the unstated invariant on the live week_type.
  add constraint customers_pending_week_type_chk
    check (pending_week_type is null or pending_week_type in ('5DAYS', '6DAYS'));

comment on column public.customers.pending_meal_preference_type is
  'Meal preference to apply at next subscription. Null = no pending change.';
comment on column public.customers.pending_week_type is
  'Delivery week to apply at next subscription. Null = no pending change.';
comment on column public.customers.pending_allergens is
  'Allergens list to apply at next subscription. Null = no pending change.';
comment on column public.customers.pending_spice_level_preference is
  'Spice level to apply at next subscription. Null = no pending change.';
comment on column public.customers.pending_veg_days is
  'Religious-mix veg-day picks to apply at next subscription (text[] of working day names). Null = no pending change.';

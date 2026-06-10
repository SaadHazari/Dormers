-- Stable daily label order IDs. (Applied to live DB via MCP on 2026-06-10.)
-- One row per (delivery day, subscription). order_no is a global identity so
-- "DM-{order_no}" is unique forever; re-generating a day's labels (reprints,
-- new signups mid-day) never renumbers already-assigned boxes.
create table public.label_orders (
  order_no bigint generated always as identity (start with 1042) primary key,
  delivery_date date not null,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (delivery_date, subscription_id)
);

comment on table public.label_orders is
  'Daily meal-label order numbers. Label prints DM-{order_no}; QR payload is https://dormers.ae/o/DM-{order_no}. Written only by the admin labels generator (service role).';

-- Service-role only: RLS on, no policies.
alter table public.label_orders enable row level security;

-- Already applied live via Supabase MCP (Ohio project) on 2026-06-25; tracked
-- here so the repo migration history records it.
--
-- Admin triage metadata for customer reviews: an "addressed" flag + an
-- internal note. Kept in a SEPARATE side-table keyed polymorphically to
-- weekly_reviews / monthly_reviews so the customer's own submission stays
-- append-only (reviews are never mutated by the admin).
--
-- Security: mirrors public.admin_audit_log — RLS enabled with NO policies,
-- which default-denies anon/authenticated. The service-role admin client
-- (createAdminSupabaseClient) bypasses RLS, so only admin code can read/write.
create table if not exists public.review_admin_meta (
    id           uuid primary key default gen_random_uuid(),
    review_type  text not null check (review_type in ('weekly','monthly')),
    review_id    uuid not null,
    status       text not null default 'open' check (status in ('open','addressed')),
    note         text,
    addressed_by text,
    addressed_at timestamptz,
    updated_at   timestamptz not null default now(),
    unique (review_type, review_id)
);

alter table public.review_admin_meta enable row level security;

comment on table public.review_admin_meta is
    'Admin triage metadata (addressed flag + internal note) for customer reviews. Polymorphic ref to weekly_reviews/monthly_reviews. Service-role only: RLS enabled, no policies (mirrors admin_audit_log).';

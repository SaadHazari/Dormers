-- Already applied live via Supabase MCP (Ohio project) on 2026-06-25; tracked
-- here so the repo migration history records it.
--
-- Log of admin-composed, on-brand emails sent to a customer from the admin
-- panel. Powers the "Messages sent" history on the customer page and records
-- failed sends (circuit-breaker open / ZeptoMail error) for visibility.
--
-- Security: mirrors public.admin_audit_log — RLS enabled with NO policies
-- (default-denies anon/authenticated); the service-role admin client bypasses
-- RLS, so only admin code can read/write.
create table if not exists public.admin_customer_emails (
    id                  uuid primary key default gen_random_uuid(),
    customer_id         uuid not null,
    to_email            text not null,
    subject             text not null,
    body                text not null,
    include_support_box boolean not null default true,
    sent_by             text not null,
    status              text not null default 'sent' check (status in ('sent','failed')),
    error               text,
    created_at          timestamptz not null default now()
);

create index if not exists admin_customer_emails_customer_idx
    on public.admin_customer_emails (customer_id, created_at desc);

alter table public.admin_customer_emails enable row level security;

comment on table public.admin_customer_emails is
    'Log of admin-composed on-brand emails sent to customers from the admin panel (incl. failed sends). Service-role only: RLS enabled, no policies (mirrors admin_audit_log).';

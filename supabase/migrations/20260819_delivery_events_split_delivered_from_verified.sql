-- Split the customer-facing "the food arrived" fact away from the
-- "the counts agree" audit fact, and make the photo-attempt budget
-- server-authoritative so a page reload cannot reset it.
--
-- Applied to Dormers-Ohio (yjjayivwfqjfppawgyaz) on 2026-08-19.

alter table public.delivery_events
  add column if not exists delivered_at    timestamptz,
  add column if not exists escalated_at    timestamptz,
  add column if not exists verify_attempts integer not null default 0,
  add column if not exists photo_paths     text[] not null default '{}';

comment on column public.delivery_events.delivered_at is
  'When the food was recorded as dropped at the dorm. Customer-facing fact: drives the delivery_confirmed WhatsApp fanout. Deliberately independent of verified, which is the count-audit fact — a disputed count must never silence a dorm.';
comment on column public.delivery_events.escalated_at is
  'When this drop-off was flagged to the owner (count mismatch or unreadable photo twice). Non-null means an unresolved dispute.';
comment on column public.delivery_events.verify_attempts is
  'Server-authoritative count of photo submissions for this drop-off. Capped at 2 by the verify route; a PWA reload cannot reset it.';
comment on column public.delivery_events.photo_paths is
  'Every attempt photo, oldest first. photo_path mirrors the latest attempt for older consumers.';

-- Backfill: a verified row was, by definition, delivered.
update public.delivery_events
   set delivered_at = coalesce(confirmed_at, created_at)
 where verified = true
   and delivered_at is null;

-- Backfill: a row carrying a rider count already consumed one photo attempt.
update public.delivery_events
   set verify_attempts = 1
 where rider_count is not null
   and verify_attempts = 0;

update public.delivery_events
   set photo_paths = array[photo_path]
 where photo_path is not null
   and photo_paths = '{}';

create index if not exists delivery_events_date_delivered_idx
  on public.delivery_events (delivery_date, delivered_at);

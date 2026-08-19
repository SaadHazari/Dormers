-- The pickup photo now has to agree with the box count before it opens the
-- rider's day. That needs a server-held attempt budget and an explicit
-- accepted flag, because "a row exists" is no longer the same as "the gate
-- is open" — a rejected attempt writes a row too.
--
-- Applied to Dormers-Ohio (yjjayivwfqjfppawgyaz) on 2026-08-19.

alter table public.ops_day_events
  add column if not exists attempts    integer not null default 0,
  add column if not exists accepted    boolean not null default true,
  add column if not exists photo_paths text[]  not null default '{}';

comment on column public.ops_day_events.attempts is
  'Photo submissions spent on this event. Server-authoritative; a PWA reload cannot reset it.';
comment on column public.ops_day_events.accepted is
  'For rider_pickup: whether this photo opened the rider''s day. A rejected count-mismatch attempt is recorded with accepted=false and does NOT open the gate. Defaults true so kitchen_packing and historical rows are unaffected.';
comment on column public.ops_day_events.photo_paths is
  'Every attempt photo, oldest first. photo_path mirrors the latest attempt.';

-- Backfill: any existing row was, by definition, an accepted single attempt.
update public.ops_day_events
   set attempts = 1
 where photo_path is not null
   and attempts = 0;

update public.ops_day_events
   set photo_paths = array[photo_path]
 where photo_path is not null
   and photo_paths = '{}';

-- Stack-based pickup: a load too big to photograph in one frame is split into
-- separate piles. Each stack photo answers "how many boxes in this pile"; the
-- overview answers "how many piles", never how many boxes. Nothing is counted
-- in two places, so nothing can be double counted.
--
-- Also adds rider_count (2026-08-19) for the blind driver entry at pickup.
-- Applied to Dormers-Ohio (yjjayivwfqjfppawgyaz) on 2026-08-20.

alter table public.ops_day_events
  add column if not exists stack_counts          integer[] not null default '{}',
  add column if not exists stack_photo_paths     text[]    not null default '{}',
  add column if not exists overview_photo_path   text,
  add column if not exists overview_stack_count  integer,
  add column if not exists stack_mode            boolean   not null default false;

comment on column public.ops_day_events.stack_counts is
  'Boxes counted in each stack photo, in the order taken. An unreadable pile is reshot rather than recorded, so a value present means it was counted. Sum of this is the load total.';
comment on column public.ops_day_events.stack_photo_paths is
  'One photo per stack, index-aligned with stack_counts.';
comment on column public.ops_day_events.overview_photo_path is
  'The wide shot used ONLY to count how many piles there are, never how many boxes.';
comment on column public.ops_day_events.overview_stack_count is
  'How many piles the overview showed. Must equal cardinality(stack_counts) or a pile was forgotten or shot twice.';
comment on column public.ops_day_events.stack_mode is
  'True when this pickup was captured pile-by-pile rather than in a single frame.';

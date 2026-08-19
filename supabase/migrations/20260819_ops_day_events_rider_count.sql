-- What the rider counted with his own eyes at pickup.
-- Until now the only number checked against the manifest at pickup was the
-- vision model's guess, and on 2026-08-19 it approved a van of five boxes as
-- six. A person typing 5 outranks any camera.
--
-- Applied to Dormers-Ohio (yjjayivwfqjfppawgyaz) on 2026-08-19.

alter table public.ops_day_events
  add column if not exists rider_count integer;

comment on column public.ops_day_events.rider_count is
  'For rider_pickup: the count the rider entered by hand. Compared against total_count (the manifest) BEFORE the photo is even judged — a better photo cannot conjure a missing box.';

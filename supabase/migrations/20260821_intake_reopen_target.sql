-- Mirror of the live migration `intake_reopen_target`, applied to Ohio
-- (yjjayivwfqjfppawgyaz) on 2026-08-21. Idempotent and safe to replay.
--
-- The number of saved spots the owner is waiting for before restarting the
-- kitchen. Purely informational: nothing in the product reads it to make a
-- decision, and reaching it does NOT reopen intake automatically. Reopening
-- stays a deliberate human action on /admin/season, same as it has always
-- been. This column only lets the admin page render progress ("9 of 15")
-- instead of a bare count, so the owner can see how close the restart is.
--
-- Nullable on purpose: null means "no target set", and the page falls back to
-- showing the plain count. Never defaulted to a number, because a target the
-- owner did not choose is a target they would be measured against by accident.
alter table public.intake_settings
  add column if not exists reopen_target integer;

alter table public.intake_settings
  drop constraint if exists intake_settings_reopen_target_sane;

alter table public.intake_settings
  add constraint intake_settings_reopen_target_sane
  check (reopen_target is null or (reopen_target > 0 and reopen_target <= 1000));

comment on column public.intake_settings.reopen_target is
  'Saved-spot target the owner is waiting for before restarting the kitchen. Informational only - reaching it never reopens intake automatically. Null means no target set.';

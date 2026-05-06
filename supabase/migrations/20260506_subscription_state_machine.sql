-- ============================================================================
-- Subscription state machine — Phase 1 foundation
--
-- 1. Add 'Skipped' to subscriptions.status check constraint (newly promoted
--    from a UI-derived state to a real DB status).
-- 2. Add customers.week_type ('5DAYS' | '6DAYS') — set during onboarding,
--    editable from /profile, snapshotted onto each new sub at checkout.
-- 3. Add subscriptions.week_type — snapshot of the customer's week_type at
--    sub creation time. Never auto-rewritten; changes to customer prefs
--    only affect future subs.
-- 4. Add subscriptions.start_date_changed_at — null until the user uses
--    their one-time start-date change on a Scheduled sub.
-- 5. Create compute_subscription_end_date() — Postgres port of the Notion
--    formula. Same math as src/lib/end-date.ts (kept in lockstep).
-- 6. Create trigger to auto-recompute end_date when any input changes.
--
-- Idempotent: each step uses IF NOT EXISTS / DROP IF EXISTS so the
-- migration can be re-run without harm.
-- ============================================================================

BEGIN;

-- ── 1. Add 'Skipped' to status enum check ──────────────────────────────────
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status = ANY (ARRAY['Active'::text, 'Paused'::text, 'Scheduled'::text, 'Ended'::text, 'Skipped'::text]));

-- ── 2. customers.week_type ─────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS week_type text NOT NULL DEFAULT '6DAYS';

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_week_type_check;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_week_type_check
  CHECK (week_type = ANY (ARRAY['5DAYS'::text, '6DAYS'::text]));

-- ── 3. subscriptions.week_type (snapshot at checkout) ──────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS week_type text NOT NULL DEFAULT '6DAYS';

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_week_type_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_week_type_check
  CHECK (week_type = ANY (ARRAY['5DAYS'::text, '6DAYS'::text]));

-- ── 4. subscriptions.start_date_changed_at ────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS start_date_changed_at timestamptz;

-- ── 5. compute_subscription_end_date() ─────────────────────────────────────
-- Direct port of the Notion formula. Stays in lockstep with the TS mirror
-- at src/lib/end-date.ts. Day-of-week convention: ISO (1=Mon … 7=Sun) so
-- the math reads identically to the source formula.

CREATE OR REPLACE FUNCTION public.compute_subscription_end_date(
  p_start_date  date,
  p_plan_kind   text,    -- 'trial' | 'weekly' | 'monthly'
  p_week_type   text,    -- '5DAYS' | '6DAYS' | '7DAYS'
  p_skip_count  integer,
  p_pause_days  integer
) RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_w           integer;
  v_d_base      integer;
  v_d           integer;
  v_skip        integer := GREATEST(0, COALESCE(p_skip_count, 0));
  v_pause       integer := GREATEST(0, COALESCE(p_pause_days, 0));
  v_wd_start    integer;
  v_shift       integer;
  v_s2          date;
  v_wd2         integer;
  v_x           integer;
  v_penalty     integer;
  v_total_days  integer;
  v_calc        date;
  v_end_dow     integer;
  v_end_shift   integer;
BEGIN
  -- W = days/week
  v_w := CASE p_week_type
           WHEN '5DAYS' THEN 5
           WHEN '6DAYS' THEN 6
           WHEN '7DAYS' THEN 7
           ELSE 6
         END;

  -- D_base by plan
  v_d_base := CASE lower(p_plan_kind)
                WHEN 'trial'   THEN 1
                WHEN 'weekly'  THEN v_w
                WHEN 'monthly' THEN 4 * v_w
                ELSE 0
              END;

  IF v_d_base = 0 THEN
    RETURN NULL;
  END IF;

  v_d := v_d_base + v_skip;

  -- ISO dow: 1=Mon, 7=Sun
  v_wd_start := EXTRACT(isodow FROM p_start_date)::integer;

  -- Start-shift if start lands on a non-delivery day
  v_shift := CASE
    WHEN p_week_type = '7DAYS' THEN 0
    WHEN p_week_type = '6DAYS' AND v_wd_start = 7 THEN 1
    WHEN p_week_type = '5DAYS' AND v_wd_start = 6 THEN 2
    WHEN p_week_type = '5DAYS' AND v_wd_start = 7 THEN 1
    ELSE 0
  END;

  v_s2 := p_start_date + v_shift;
  v_wd2 := EXTRACT(isodow FROM v_s2)::integer;
  v_x := v_d - 1;

  -- Calendar-day penalty for non-delivery days mid-cycle
  v_penalty := CASE
    WHEN p_week_type = '7DAYS' THEN 0
    WHEN p_week_type = '6DAYS' THEN floor(((v_wd2 - 1) + v_x) / 6.0)::integer
    WHEN p_week_type = '5DAYS' THEN 2 * floor(((v_wd2 - 1) + v_x) / 5.0)::integer
    ELSE 0
  END;

  v_total_days := v_x + v_penalty;
  v_calc := v_s2 + (v_total_days + v_pause);

  -- If end lands on non-delivery day, push forward
  v_end_dow := EXTRACT(isodow FROM v_calc)::integer;
  v_end_shift := CASE
    WHEN p_week_type = '7DAYS' THEN 0
    WHEN p_week_type = '6DAYS' AND v_end_dow = 7 THEN 1
    WHEN p_week_type = '5DAYS' AND v_end_dow = 6 THEN 2
    WHEN p_week_type = '5DAYS' AND v_end_dow = 7 THEN 1
    ELSE 0
  END;

  RETURN v_calc + v_end_shift;
END;
$$;

-- ── 6. Trigger to auto-recompute end_date ─────────────────────────────────
-- Fires on INSERT and on UPDATE OF the inputs. Uses the plan_name to
-- derive plan_kind via simple lower-case substring matching (mirrors the
-- TS planKindFromName helper).

CREATE OR REPLACE FUNCTION public._subscriptions_recompute_end_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_kind text;
BEGIN
  v_kind := CASE
    WHEN lower(NEW.plan_name) LIKE '%monthly%' THEN 'monthly'
    WHEN lower(NEW.plan_name) LIKE '%weekly%'  THEN 'weekly'
    WHEN lower(NEW.plan_name) LIKE '%trial%'   THEN 'trial'
    ELSE NULL
  END;

  IF v_kind IS NULL OR NEW.start_date IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.end_date := public.compute_subscription_end_date(
    NEW.start_date,
    v_kind,
    NEW.week_type,
    COALESCE(NEW.skipped_meals_count, 0),
    COALESCE(NEW.paused_days, 0)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_recompute_end_date ON public.subscriptions;

CREATE TRIGGER trg_subscriptions_recompute_end_date
  BEFORE INSERT OR UPDATE OF
    start_date, plan_name, week_type, skipped_meals_count, paused_days
  ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public._subscriptions_recompute_end_date();

COMMIT;

-- ============================================================================
-- IMPORTANT: This migration does NOT backfill existing rows. The trigger
-- only fires on INSERT or on the listed UPDATEs. Existing end_dates remain
-- whatever they currently are.
--
-- To backfill (recommended after reviewing diffs first), run:
--
--   UPDATE public.subscriptions SET start_date = start_date;
--
-- That no-op UPDATE re-fires the trigger on every row and writes the
-- canonical end_date. Diff first against current values to catch surprises:
--
--   SELECT id, plan_name, status, start_date, end_date AS current_end,
--          public.compute_subscription_end_date(
--            start_date,
--            CASE
--              WHEN lower(plan_name) LIKE '%monthly%' THEN 'monthly'
--              WHEN lower(plan_name) LIKE '%weekly%'  THEN 'weekly'
--              WHEN lower(plan_name) LIKE '%trial%'   THEN 'trial'
--            END,
--            week_type, COALESCE(skipped_meals_count, 0), COALESCE(paused_days, 0)
--          ) AS computed_end
--   FROM public.subscriptions
--   WHERE status IN ('Active','Paused','Scheduled','Skipped');
-- ============================================================================

-- ============================================================================
-- Phase 7 — Dorm Wars reward backend tables
--
-- Four new tables back the reward economy:
--   daily_drops      one row per (customer, drop_date_utc) — locks in outcome
--   streaks          one row per customer — server-canonical visit count
--   cycle_rewards    one row per (customer, sub, milestone) — Layer 2 idempotency
--   lifetime_rewards one row per (customer, tier) — Layer 3 idempotency
--
-- All four enable RLS with read-own + service-role-full policies. The awarder
-- + daily-drop/streak API routes use the service-role key to write.
-- ============================================================================

BEGIN;

-- ── daily_drops ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_drops (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  drop_date_utc   date NOT NULL,
  value_aed       integer NOT NULL CHECK (value_aed > 0 AND value_aed <= 200),
  rng_bucket      text NOT NULL CHECK (rng_bucket IN ('common','rare','epic')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, drop_date_utc)
);

CREATE INDEX IF NOT EXISTS daily_drops_customer_idx
  ON public.daily_drops (customer_id, drop_date_utc DESC);

ALTER TABLE public.daily_drops ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "customers see own daily drops"
    ON public.daily_drops FOR SELECT USING (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service role full access daily drops"
    ON public.daily_drops FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── streaks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.streaks (
  customer_id          uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  count                integer NOT NULL DEFAULT 0,
  last_visit_date_utc  date,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "customers see own streak"
    ON public.streaks FOR SELECT USING (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service role full access streaks"
    ON public.streaks FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── cycle_rewards ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cycle_rewards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  milestone       integer NOT NULL CHECK (milestone IN (3,6,10,15,20)),
  kind            text NOT NULL CHECK (kind IN
                    ('mystery_drop','free_week','free_month','cash_and_skips','dorm_weekend')),
  value_aed       integer,  -- nullable: dorm_weekend has no AED value per row
  awarded_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, subscription_id, milestone)
);

CREATE INDEX IF NOT EXISTS cycle_rewards_customer_idx
  ON public.cycle_rewards (customer_id, awarded_at DESC);

ALTER TABLE public.cycle_rewards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "customers see own cycle rewards"
    ON public.cycle_rewards FOR SELECT USING (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service role full access cycle rewards"
    ON public.cycle_rewards FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── lifetime_rewards ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lifetime_rewards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tier            integer NOT NULL CHECK (tier IN (1,2,3,4)),
  perk            text NOT NULL,
  stripe_coupon_id text,  -- nullable: reserved for future pre-allocation; null in Phase 7
  awarded_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, tier)
);

CREATE INDEX IF NOT EXISTS lifetime_rewards_customer_idx
  ON public.lifetime_rewards (customer_id, tier);

ALTER TABLE public.lifetime_rewards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "customers see own lifetime rewards"
    ON public.lifetime_rewards FOR SELECT USING (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service role full access lifetime rewards"
    ON public.lifetime_rewards FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

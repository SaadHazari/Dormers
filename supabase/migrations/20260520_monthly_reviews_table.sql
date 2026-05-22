-- ============================================================================
-- Monthly reviews — end-of-cycle reflection survey (the "monthly wrap").
--
-- One row per (customer, subscription) — unique constraint enforces that a
-- subscription gets exactly one monthly review across its lifetime, no matter
-- how many times the takeover is opened. Append-only by design.
--
-- This is the 5th milestone on the cycle journey — weekly reviews 1-4 plus
-- the monthly wrap. Reward decay follows the same 100%-within-7-days / 50%-
-- after pattern that weekly reviews use, so the customer's mental model is
-- consistent across both surfaces.
--
-- Schema mirrors weekly_reviews where it can but adds end-of-cycle-specific
-- fields: signup triggers (Big Hire reconstruction), job dimensions (JTBD),
-- counterfactual + price (Mom Test alternative anchoring), renewal intent
-- (the commitment question), recommend (advocacy proof).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.monthly_reviews (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  subscription_id       uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,

  -- Q1: signup triggers (multi-select chip + optional "other" text)
  signup_triggers       text[] NOT NULL DEFAULT '{}',
  signup_triggers_other text NOT NULL DEFAULT '',

  -- Q2: job dimensions — what Dormers did for them this cycle
  jobs                  text[] NOT NULL DEFAULT '{}',
  jobs_other            text NOT NULL DEFAULT '',

  -- Q3 + Q4: open-text story prompts (both optional)
  best_moment           text NOT NULL DEFAULT '',
  friction_moment       text NOT NULL DEFAULT '',

  -- Q5: counterfactual + price anchoring
  alternative           text NOT NULL,
  alternative_other     text NOT NULL DEFAULT '',
  alternative_cost_aed  text NOT NULL CHECK (alternative_cost_aed IN ('under-15', '15-25', '25-40', '40-plus')),

  -- Q6: renewal intent + conditional reason
  renewal_intent        text NOT NULL CHECK (renewal_intent IN ('definitely', 'probably', 'probably_not', 'no')),
  renewal_reason        text NOT NULL DEFAULT '',

  -- Q7: recommend + open-mic
  recommend             text NOT NULL CHECK (recommend IN ('yes_specific', 'yes_general', 'maybe', 'no')),
  recommend_text        text NOT NULL DEFAULT '',

  -- Reward window outcome (100 = within 7 days of cycle end, 50 = late)
  reward_pct            integer NOT NULL CHECK (reward_pct IN (50, 100)),

  submitted_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (customer_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS monthly_reviews_customer_idx
  ON public.monthly_reviews (customer_id, submitted_at DESC);

ALTER TABLE public.monthly_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "customers see own monthly reviews"
    ON public.monthly_reviews FOR SELECT USING (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "customers insert own monthly reviews"
    ON public.monthly_reviews FOR INSERT WITH CHECK (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service role full access monthly reviews"
    ON public.monthly_reviews FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

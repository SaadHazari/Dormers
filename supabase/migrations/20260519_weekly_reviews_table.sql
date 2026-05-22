-- ============================================================================
-- Weekly reviews — backend table for the post-week feedback flow.
--
-- One row per (customer, subscription, week_number) — unique constraint
-- ensures idempotency: re-submission attempts hit the unique violation and
-- are rejected at the DB layer regardless of any client-side state.
--
-- Rewards (Dorm Wars layer 4): `reward_pct` captures whether the user hit
-- the 7-day full-reward window (100) or submitted late (50). Aggregated
-- on-the-fly by `getWeeklyReviewState` — no separate rewards table needed.
--
-- RLS: customers can read + insert their own rows. Updates and deletes are
-- intentionally blocked at the policy level — reviews are append-only by
-- design (no edits). Service role retains full access for admin tooling.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.weekly_reviews (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  subscription_id       uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  week_number           integer NOT NULL CHECK (week_number >= 1),
  week_start_date       date NOT NULL,
  week_end_date         date NOT NULL,

  -- Screen 1 — overall rating
  rating                integer NOT NULL CHECK (rating BETWEEN 1 AND 5),

  -- Screens 2 & 3 — meal-level picks (meal ids referenced by string for
  -- now; a real meals table FK can be added later without schema churn).
  favorites             text[] NOT NULL DEFAULT '{}',
  misses                text[] NOT NULL DEFAULT '{}',
  miss_reasons          jsonb  NOT NULL DEFAULT '{}'::jsonb,

  -- Screen 4 — operational thumbs + conditional reason chips
  delivery_thumbs       text NOT NULL CHECK (delivery_thumbs IN ('up','down')),
  delivery_reasons      text[] NOT NULL DEFAULT '{}',
  packaging_thumbs      text NOT NULL CHECK (packaging_thumbs IN ('up','down')),
  packaging_reasons     text[] NOT NULL DEFAULT '{}',

  -- Screen 5 — optional open text
  kitchen_note          text NOT NULL DEFAULT '',

  -- Reward window outcome (100 = within 7 days, 50 = late)
  reward_pct            integer NOT NULL CHECK (reward_pct IN (50, 100)),

  submitted_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (customer_id, subscription_id, week_number)
);

-- Fast lookup for the Plan-page card / dashboard nudge / sidebar badge:
-- queries fetch all reviews for a customer's current subscription in one
-- round-trip, ordered by submission recency.
CREATE INDEX IF NOT EXISTS weekly_reviews_customer_sub_idx
  ON public.weekly_reviews (customer_id, subscription_id, submitted_at DESC);

ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

-- Customers can SELECT their own reviews
DO $$ BEGIN
  CREATE POLICY "customers see own weekly reviews"
    ON public.weekly_reviews FOR SELECT USING (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Customers can INSERT only rows scoped to themselves. Combined with the
-- unique constraint above, this prevents both spoofing and double-submission.
DO $$ BEGIN
  CREATE POLICY "customers insert own weekly reviews"
    ON public.weekly_reviews FOR INSERT WITH CHECK (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- No UPDATE / DELETE policy for customers — reviews are append-only.
-- Service role retains full access for admin moderation.
DO $$ BEGIN
  CREATE POLICY "service role full access weekly reviews"
    ON public.weekly_reviews FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

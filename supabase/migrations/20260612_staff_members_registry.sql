-- ============================================================================
-- Staff registry — interns paid in meals (content-for-meals program).
-- (Applied to the live DB via MCP on 2026-06-12; tracked here for the repo.)
--
-- Lifecycle: admin pre-registers (status 'invited', single-use claim code)
-- → intern claims via /staff/claim + normal onboarding (status 'active',
-- customer_id linked) → offboarding sets 'ended' (plan terminated, unused
-- prepaid Saturdays refunded).
--
-- The claim code is stored as a sha256 hash — the plaintext is shown to the
-- admin exactly once at creation and sent to the intern over WhatsApp by
-- the admin personally. The code is bound to BOTH this row's email and
-- whatsapp_number: the claim screen checks email+code, and the onboarding
-- OTP step proves possession of the registered phone.
--
-- RLS on with no policies — service-role access only, same posture as
-- plan_pricing. All reads/writes go through admin server actions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.staff_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  email            text NOT NULL,
  whatsapp_number  text NOT NULL,           -- E.164, with leading +
  status           text NOT NULL DEFAULT 'invited'
                     CHECK (status IN ('invited', 'active', 'ended')),
  claim_code_hash  text NOT NULL,
  code_expires_at  timestamptz NOT NULL,
  claimed_at       timestamptz,
  -- Set when the intern passes the /staff/claim email+code check. Opens a
  -- 60-minute window during which the normal onboarding (matching email +
  -- OTP-verified phone) links the account. Cleared on claim completion.
  code_verified_at timestamptz,
  customer_id      uuid REFERENCES public.customers(id),
  created_by       text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  ended_by         text
);

COMMENT ON TABLE public.staff_members IS
  'Intern/staff registry for the meals-as-remuneration program. invited = code issued not yet claimed; active = claimed and employed; ended = offboarded or invite revoked (claimed_at NULL on an ended row means the invite was revoked unused).';

-- One live (non-ended) record per email — re-inviting after offboarding is
-- allowed, double-inviting is not.
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_members_live_email
  ON public.staff_members (lower(email)) WHERE status <> 'ended';

-- Claim lookups arrive as (email, code); the hash check happens in code.
CREATE INDEX IF NOT EXISTS idx_staff_members_email ON public.staff_members (lower(email));

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- Explicit grants — PostgREST only exposes tables its roles can touch.
GRANT ALL ON public.staff_members TO postgres, service_role;
GRANT SELECT ON public.staff_members TO authenticated, anon;

-- 'Staff Monthly' → intern_compensation expense line (the delivery tick
-- writes one ledger row per delivered staff meal automatically).
CREATE OR REPLACE FUNCTION public.expense_category_for_plan(p_plan_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_plan_name = 'Welcome Meal'    THEN 'referee_acquisition'
    WHEN p_plan_name = 'Intern Program'  THEN 'intern_compensation'
    WHEN p_plan_name = 'Staff Monthly'   THEN 'intern_compensation'
    ELSE NULL
  END;
$function$;

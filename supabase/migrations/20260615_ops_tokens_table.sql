-- ============================================================================
-- Ops tokens — bearer tokens for ungated kitchen and rider interfaces.
--
-- Each row is one URL-embeddable token granting access to either:
--   /kitchen/[token]  (role = 'kitchen')  — kitchen display
--   /ops/[token]      (role = 'rider')    — rider delivery flow
--
-- Token lifecycle:
--   • Token is NOT hashed — it is a high-entropy random hex string, not a
--     password. Treat it like an API key: rotate by setting is_active=false
--     (and optionally revoked_at = now()) then inserting a fresh row.
--   • Kitchen tokens are semi-permanent (one per kitchen station).
--   • Rider tokens may rotate more frequently (per rider or per shift).
--
-- RLS enabled with no policies — service-role access only, same posture as
-- plan_pricing and staff_members. All reads/writes go through server actions
-- or API routes that use the service-role client.
-- ============================================================================

CREATE TABLE public.ops_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text        NOT NULL UNIQUE,
  role        text        NOT NULL CHECK (role IN ('kitchen', 'rider')),
  label       text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

COMMENT ON TABLE public.ops_tokens IS
  'Bearer tokens for ungated kitchen display and rider delivery interfaces. Rotate by deactivating (is_active=false, revoked_at=now()) and inserting a new row.';

ALTER TABLE public.ops_tokens ENABLE ROW LEVEL SECURITY;

-- Explicit grants — PostgREST only exposes tables its roles can touch.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ops_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ops_tokens TO service_role;

-- Dev seed tokens (deterministic hex for local/staging use).
INSERT INTO public.ops_tokens (token, role, label) VALUES
  ('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', 'kitchen', 'Dev Kitchen'),
  ('f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1', 'rider',   'Dev Rider 1');

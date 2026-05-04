-- WhatsApp OTP verification — apply once via Supabase SQL editor or `supabase db push`.

-- 1. OTP store. Hashed code, attempt counter, TTL via expires_at.
--    No user-facing reads ever — only the service role touches this table.
CREATE TABLE IF NOT EXISTS public.whatsapp_otps (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       TEXT        NOT NULL,                          -- E.164, e.g. "+971504619384"
    code_hash   TEXT        NOT NULL,                          -- SHA-256 of the 6-digit code
    attempts    INT         NOT NULL DEFAULT 0,
    verified_at TIMESTAMPTZ,                                   -- set once on successful check
    expires_at  TIMESTAMPTZ NOT NULL,                          -- created_at + 10 min
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookups always filter by phone + recency, ordered by created_at desc.
CREATE INDEX IF NOT EXISTS idx_whatsapp_otps_phone_created
    ON public.whatsapp_otps (phone, created_at DESC);

-- 2. Customer verification flag. Mirrored from a verified OTP at signup time.
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS whatsapp_verified    BOOLEAN     DEFAULT false,
    ADD COLUMN IF NOT EXISTS whatsapp_verified_at TIMESTAMPTZ;

-- 3. Lock down the OTP table. RLS on with no policies = denied for everyone
--    except the service role (which bypasses RLS). End-users cannot read codes,
--    list other phones' OTPs, or write to this table directly.
ALTER TABLE public.whatsapp_otps ENABLE ROW LEVEL SECURITY;

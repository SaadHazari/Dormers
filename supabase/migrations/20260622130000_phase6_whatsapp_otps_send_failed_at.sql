-- Release It! L8 (Phase 6): record when a WhatsApp OTP send actually FAILED for
-- a phone, so onboarding's email fallback can verify WhatsApp was genuinely
-- unavailable (DB-backed, cross-instance) before relaxing the phone gate.
-- Additive + nullable; whatsapp_otps already has RLS (service-role only).
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-06-22. This file is the source-control mirror.
alter table public.whatsapp_otps add column if not exists send_failed_at timestamptz;

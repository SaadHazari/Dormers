# Phase 6 — Acquisition fallback (email-OTP) (L8) ✅

Branch: `release-it/phase-6-email-otp-fallback` (stacked on Phase 4)

A Meta/WhatsApp outage no longer halts 100% of new-customer signups. Decided by the owner:
**email fallback, verify phone later** (acquire now; phone is re-verified before any delivery).

## The key simplification (from the architecture-mapping workflow)
The onboarding flow ALREADY verifies the email via Supabase Auth at Step 7 (`signUp` +
`verifyOtp` email). So NO new email-OTP table / endpoints / ZeptoMail code were needed — the
synthesis's heavier design was unnecessary. The only thing blocking signup during an outage is
the `findVerifiedOtpId(phone)` gate in `createAccount`. Phase 6 just relaxes that gate safely.

And the "verify phone before delivery" loop ALREADY EXISTS: `whatsapp_verified` is a required
profile field (`profile-completion.ts`), and checkout returns a hard 409 `PROFILE_INCOMPLETE`
when it's missing — so an email-fallback customer literally cannot buy a subscription until they
verify their phone via the existing profile WhatsApp-verification flow (`markWhatsappVerified`).
No new dashboard prompt needed.

## Changes (all additive; locked onboarding UI untouched)
- **Migration** (LIVE on Ohio via MCP; mirrored to `supabase/migrations/20260622130000_…`):
  `whatsapp_otps.send_failed_at timestamptz` — the DB-backed, cross-instance signal that
  WhatsApp genuinely failed for a phone (more reliable than the per-process circuit breaker).
- **`/api/whatsapp/start`**: on send failure, stamp `send_failed_at` and return
  `{ error:'send_failed', fallbackAvailable:true }`.
- **`createAccount`**: new `emailFallback` payload flag + `findRecentSendFailure(phone)`. The
  phone gate now: verified OTP → proceed (whatsapp_verified=true, unchanged) ELSE if
  `emailFallback && a real recent send failure for this phone` → proceed with
  **whatsapp_verified=FALSE** ELSE the existing error. Email is still verified by the normal
  Supabase flow. Forging the flag on a healthy system fails (no `send_failed_at`).
- **PhoneStep**: after a send failure, an additive orange link "Can't get the WhatsApp code?
  Continue with email — you'll confirm WhatsApp later" sets `emailFallback` and advances to the
  (unchanged) email step. Only renders when a send actually failed.
- **OnboardingClient / data.ts**: `emailFallback` FormState field, reset on draft restore/persist
  so a stale draft can't arm it on a healthy system.

## Why it's safe (Prime Directive)
- Happy WhatsApp path is byte-for-byte unchanged (whatsapp_verified=true, OTP consumed, etc.).
- The fallback only appears after a real send failure and is server-re-confirmed.
- Worst case (even abuse): an account with whatsapp_verified=FALSE — which checkout HARD-BLOCKS
  until phone re-verification. No delivery can ever reach an unverified phone.
- Scope held to main onboarding: referral + staff claims stay phone-mandatory by design (their
  fraud/identity model is phone-keyed).

## Verification
- tsc clean; lint clean; 330 tests pass; build green (`/onboarding` still prerenders); runtime
  smoke `/onboarding` → 200, no hydration errors. Live column verified via MCP.

## Customer impact
Positive: signups survive a WhatsApp outage. None on the happy path.

## Not verified live (Phase 9 / chaos)
The end-to-end fallback (force a Meta send failure → email link → signup → whatsapp_verified=false
→ checkout re-verify) needs a forced-outage chaos test. Logic verified by build + reasoning.

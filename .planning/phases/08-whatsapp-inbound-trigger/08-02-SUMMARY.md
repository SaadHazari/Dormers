---
phase: 08-whatsapp-inbound-trigger
plan: 02
subsystem: api
tags: [whatsapp, webhook, hmac, meta-cloud-api, next-api-route, fire-and-forget]

# Dependency graph
requires:
  - phase: 08-whatsapp-inbound-trigger
    provides: whatsapp_inbound_processed + whatsapp_rider_allowlist tables, matchDormName fuzzy utility
  - phase: 05-rider-page-dropoff-verification
    provides: updateDeliveryEvent use-case
  - phase: 06-delivery-notification-fanout
    provides: queueDeliveryConfirmedNotifications use-case
provides:
  - GET /api/ops/whatsapp-inbound — Meta webhook verification handshake
  - POST /api/ops/whatsapp-inbound — HMAC-verified inbound message handler with dedup, allowlist, fuzzy match, delivery confirmation
affects: [09-ios-shortcuts-pwa-polish, admin-panel (rider allowlist management)]

# Tech tracking
tech-stack:
  added: []
  patterns: [raw-body-first-then-hmac, fire-and-forget-void-async, meta-whatsapp-webhook-handshake]

key-files:
  created:
    - src/app/api/ops/whatsapp-inbound/route.ts
  modified: []

key-decisions:
  - "void processAsync(payload) fire-and-forget pattern — returns 200 before any DB or WhatsApp API work; prevents Meta 36h retry backoff"
  - "Non-allowlisted senders silently ignored (no reply) — prevents enumeration and keeps the bot quiet to strangers"
  - "Reply failures wrapped in try/catch at every call site — delivery verification succeeds even if WhatsApp reply API is down"
  - "riderCount set to expectedCount from getDormCounts — rider texting the dorm name is an assertion that delivery happened; no photo/Gemini in this fallback path"
  - "Dedup row updated with matched_dorm after successful delivery verification — audit trail for which dorm was matched"

patterns-established:
  - "Meta HMAC verification: req.text() first, createHmac + timingSafeEqual, sha256= prefix comparison"
  - "Meta GET handshake: hub.mode === subscribe check, plain-text challenge response (not JSON)"
  - "Fire-and-forget IIFE for webhook async processing: void processAsync() before return"

requirements-completed: [WAI-01, WAI-02, WAI-03, WAI-04, WAI-05, WAI-06, WAI-07, WAI-08]

# Metrics
duration: 2min
completed: 2026-06-16
---

# Phase 8 Plan 02: WhatsApp Inbound Trigger — API Route Summary

**Secure Meta webhook route with HMAC verification, fire-and-forget async processing, dedup + allowlist + fuzzy match wired to existing delivery confirmation usecases**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-16T12:00:14Z
- **Completed:** 2026-06-16T12:02:40Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments
- Complete WhatsApp inbound webhook at `/api/ops/whatsapp-inbound` with GET handshake and POST HMAC verification
- Fire-and-forget async processing: 200 returned before any DB writes or WhatsApp replies (prevents Meta retry storm)
- Full processing pipeline: allowlist check, non-text message handling, dedup via whatsapp_inbound_processed, fuzzy match via matchDormName, delivery verification via updateDeliveryEvent, customer notification fanout via queueDeliveryConfirmedNotifications
- All 8 WAI requirements implemented in a single 318-line route file
- `npx tsc --noEmit` and `npm run lint` both pass clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement whatsapp-inbound route (GET + POST)** - `7342c62` (feat)
2. **Task 2: Compile and lint check** - verification only, no code changes needed

## Files Created/Modified
- `src/app/api/ops/whatsapp-inbound/route.ts` — GET verification handshake + POST HMAC-verified inbound message handler with dedup, allowlist, fuzzy match, and delivery confirmation wiring

## Decisions Made
- **Fire-and-forget via void processAsync():** Not IIFE — cleaner to name the function and call it with `void`. Same semantic: returns 200 before any async work.
- **riderCount = expectedCount on clean match:** Rider texting a dorm name is a manual assertion that delivery happened. The WhatsApp path trusts this (no photo verification).
- **matched_dorm update after delivery confirmation:** Updates the dedup row with the resolved dorm name for audit trail visibility.
- **No maxDuration export:** Route returns 200 synchronously after only req.text() + HMAC check. Netlify's default 10s is sufficient. Async work runs in background.

## Deviations from Plan

None -- plan executed exactly as written.

## WAI Requirement Traceability

| Requirement | Implementation | Code Location |
|-------------|---------------|---------------|
| WAI-01 | GET handler checks hub.mode=subscribe + verify_token, returns challenge as plain text | Lines 60-77 |
| WAI-02 | verifyHmac() with createHmac('sha256') + timingSafeEqual on raw body | Lines 99-113 |
| WAI-03 | void processAsync(payload) fires before return NextResponse.json | Lines 91-92 |
| WAI-04 | INSERT into whatsapp_inbound_processed with ON CONFLICT DO NOTHING via .select('id') | Lines 185-193 |
| WAI-05 | matchDormName(msgText) for fuzzy matching + updateDeliveryEvent on clean match | Lines 196-258 |
| WAI-06 | matchResult.match === null + candidates.length > 0 triggers "Did you mean X?" reply | Lines 218-230 |
| WAI-07 | whatsapp_rider_allowlist query: .eq('phone_digits', senderPhone).eq('is_active', true) | Lines 151-161 |
| WAI-08 | msgType !== 'text' triggers "Please send the dorm name as text" reply | Lines 163-173 |

## Issues Encountered
None.

## User Setup Required

Before the webhook can go live, the owner needs to:

1. **Add two env vars** (Netlify + .env.local):
   - `WHATSAPP_APP_SECRET` — from Meta App Dashboard > App Settings > Basic > App Secret
   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — any random string (e.g. `openssl rand -hex 16`)

2. **Register the webhook in Meta Dashboard:**
   - Meta App Dashboard > WhatsApp > Configuration > Webhooks > Add Callback URL
   - URL: `https://dormers.ae/api/ops/whatsapp-inbound`
   - Verify Token: same value as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to the `messages` field

3. **Apply Plan 01 migration** to live DB (if not already done):
   - `supabase/migrations/20260616_whatsapp_inbound_tables.sql` via Supabase MCP execute_sql
   - Seed rider phone: INSERT INTO whatsapp_rider_allowlist (phone_digits, label) VALUES ('971504619384', 'Dormers Rider')

## Known Stubs
None -- all code is functional and wired to real usecases.

## Next Phase Readiness
- Phase 8 is fully complete (2/2 plans). All WAI requirements implemented.
- Phase 9 (iOS Shortcuts + PWA + Polish) can proceed.
- The route is deploy-ready pending the env var setup and Meta webhook registration.

## Self-Check: PASSED

- FOUND: src/app/api/ops/whatsapp-inbound/route.ts
- FOUND: commit 7342c62
- npx tsc --noEmit: exit 0
- npm run lint: exit 0 (no errors; 2 pre-existing warnings in unrelated files)

---
*Phase: 08-whatsapp-inbound-trigger*
*Completed: 2026-06-16*

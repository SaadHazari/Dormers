# Requirements: Ops Interfaces — Kitchen Display + Delivery Chain of Custody

**Defined:** 2026-06-14
**Core Value:** Meals delivered correctly, provably, every time — with the kitchen and rider workflows as frictionless as opening WhatsApp.

## v1 Requirements

### Database & Schema

- [x] **DB-01**: `recipe` JSONB column added to `dishes` table with structure `{ sections: [{ heading, items }], method: string[], notes: string }`
- [x] **DB-02**: All 48+ recipes from Dormers_cook_book_Golden.pdf seeded into the `dishes` table with correct dish code mapping
- [x] **DB-03**: `ops_tokens` table created with token, role (kitchen/rider), label, is_active, revoked_at
- [x] **DB-04**: `delivery_events` table created with delivery_date, dorm_name, expected/rider/gemini counts, photo_path, verified flag, UNIQUE(delivery_date, dorm_name, trip_number)
- [x] **DB-05**: `delivery_confirmed` and `delivery_unconfirmed_8pm` kinds added to `customer_notifications` CHECK constraint
- [ ] **DB-06**: `delivery_confirmed` CASE branch added to `dispatch_customer_notifications_tick` dispatcher
- [x] **DB-07**: Explicit GRANTs on new tables for `authenticated` and `service_role`

### Token Auth

- [x] **TOK-01**: Secret tokens are random 32-char hex strings stored in `ops_tokens` table
- [x] **TOK-02**: Token validated server-side on every page load — invalid/revoked token returns 404
- [x] **TOK-03**: `<meta name="referrer" content="no-referrer">` on both kitchen and ops pages
- [ ] **TOK-04**: Token rotation via admin panel without requiring a deploy

### Kitchen Display

- [x] **KIT-01**: `/kitchen/[token]` page shows today's veg and non-veg dish with photo and name
- [x] **KIT-02**: Tap-to-expand recipe view with tabbed section navigator per component (ingredients + method per tab)
- [x] **KIT-03**: Before 2 PM UAE — shows estimated approximate veg/non-veg counts derived from active subscriptions (clearly labeled "Estimated")
- [x] **KIT-04**: After 2 PM UAE, confirmed total veg and non-veg counts displayed (accounts for skips/pauses; labeled "Confirmed")
- [x] **KIT-05**: 2 PM cutoff evaluated server-side in RSC, never client-side
- [x] **KIT-06**: Light cream/beige background (owner override from dark spec), 18px+ body text, 32px+ dish names
- [x] **KIT-07**: Works at 375px mobile and desktop — no login, no app install — owner verified
- [x] **KIT-08**: 60-second auto-refresh with "last updated HH:MM" timestamp
- [x] **KIT-09**: Veg = emerald green, non-veg = brand orange `#f57f20` color coding

### Rider — Pickup

- [x] **RID-01**: `/ops/[token]` page shows dorm buttons with label shapes (Myriad=circle, KSK=square, Yugo=triangle, DSOA=hexagon, Study World=star)
- [x] **RID-02**: Dorm buttons are 80×80px minimum tap targets in a 2-column grid with shape SVG + name label
- [x] **RID-03**: At kitchen, rider sees expected meal count per dorm
- [x] **RID-04**: Rider confirms pickup with timestamp logged to `delivery_events`

### Rider — Drop-off & Verification

- [x] **VER-01**: At dorm, rider taps dorm button → camera opens → takes photo of boxes
- [x] **VER-02**: Camera uses `getUserMedia` as primary with `<input capture>` fallback for cross-platform support
- [x] **VER-03**: Photo resized client-side to max 1600px / JPEG 85 before upload
- [ ] **VER-04**: Photo uploaded to private `delivery-photos` Supabase storage bucket via server-side API route
- [x] **VER-05**: Rider enters box count manually
- [ ] **VER-06**: Gemini `gemini-2.5-flash` counts boxes independently from photo, returning `{ count, confidence, reason, imageQuality }`
- [ ] **VER-07**: Triple match: expected === rider === Gemini → large green tick (1.5–2s) → auto-confirm
- [ ] **VER-08**: Any count mismatch → escalates to owner via `notifyAdmin` with photo + all three numbers
- [ ] **VER-09**: Photo unclear (Gemini confidence low / imageQuality not clear) → "Retake photo" prompt
- [ ] **VER-10**: Second unclear photo → escalates to owner
- [ ] **VER-11**: Gemini timeout (`null` count) → requires manual rider confirmation, never auto-completes
- [x] **VER-12**: Submit button disabled until photo taken + non-zero count entered
- [ ] **VER-13**: Delivery event data trail: who (token_id), when (timestamp), geolocation, expected_count, rider_count, gemini_count, photo_path

### Delivery Notifications

- [ ] **NOT-01**: On verified delivery (green tick), customer WhatsApp queued via `queueCustomerNotification` with kind `delivery_confirmed`
- [ ] **NOT-02**: Notifications sent only to active, non-skipped, non-paused subscribers for that dorm on that day
- [ ] **NOT-03**: Uses existing dispatcher pipeline (pg_cron + `FOR UPDATE SKIP LOCKED`)
- [ ] **NOT-04**: `delivery_confirmed` Meta template registered as UTILITY category before dispatch code ships

### Failsafe

- [ ] **FAIL-01**: pg_cron at 8 PM UAE (`0 16 * * *` UTC) checks for dorms with active subs but no verified delivery event today
- [ ] **FAIL-02**: Sends owner WhatsApp alert via `notifyAdmin` with list of pending dorms + quick actions link
- [ ] **FAIL-03**: Failsafe function is idempotent — calling twice in same window does not send duplicate alerts
- [ ] **FAIL-04**: Internal API route authenticated with `INTERNAL_RETRY_SECRET` bearer token

### WhatsApp Inbound

- [ ] **WAI-01**: `/api/ops/whatsapp-inbound` route handles Meta GET verification handshake
- [ ] **WAI-02**: POST handler verifies `X-Hub-Signature-256` HMAC before processing
- [ ] **WAI-03**: Returns HTTP 200 before any async processing (prevents Meta retry)
- [ ] **WAI-04**: Deduplicates on WhatsApp message ID with unique constraint
- [ ] **WAI-05**: Fuzzy matches rider's text to dorm name with conservative threshold
- [ ] **WAI-06**: Ambiguous match → replies asking rider to confirm ("Did you mean X?")
- [ ] **WAI-07**: Only processes text messages from allowlisted sender phone numbers
- [ ] **WAI-08**: Non-text messages (images, voice, reactions) ignored or replied with "Send dorm name as text"

### iOS Shortcuts & PWA

- [ ] **PWA-01**: iOS Shortcut file generated for each dorm — one-tap delivery confirmation for owner
- [ ] **PWA-02**: PWA manifest for `/kitchen` and `/ops` routes enabling add-to-home-screen
- [ ] **PWA-03**: iOS meta tags for standalone display (apple-mobile-web-app-capable, status-bar-style, title)

### Architecture

- [x] **ARC-01**: New `ops` bounded context at `src/contexts/ops/` with domain/ and usecases/ layers
- [x] **ARC-02**: `dorm-shapes.ts` moved from `src/app/admin/labels/` to `src/shared/`
- [ ] **ARC-03**: Gemini box count verification in API route with `maxDuration = 60` (not server action)
- [ ] **ARC-04**: Cross-context notification queueing via `queueCustomerNotification` import
- [x] **ARC-05**: All ops page loads force-dynamic (no caching — token validation + time-gated counts)

## v2 Requirements

### Enhanced Verification

- **VER2-01**: Admin panel delivery audit log showing all three counts + photos per dorm per day
- **VER2-02**: Admin panel token rotation UI with activity log
- **VER2-03**: Rider-specific tokens for per-rider audit trail (vs single shared rider token)

### Offline & Performance

- **PERF-01**: Service worker for offline recipe caching on kitchen display
- **PERF-02**: Background sync for delivery photos when connectivity drops

### Analytics

- **ANA-01**: Delivery success rate dashboard (matches vs mismatches over time)
- **ANA-02**: Gemini accuracy tracking (how often AI count differs from rider count)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Customer-side pickup confirmation (QR/PIN) | Adds friction to every meal; not needed if dorm-side delivery is provable |
| Full delivery route optimization | Rider determines their own route |
| Real-time GPS tracking of rider | Privacy concerns, overkill for current scale |
| Kitchen inventory/procurement management | Separate concern |
| Modifying existing admin labels pipeline | Kitchen can link to it, not replace it |
| Native mobile app for rider | PWA + WhatsApp covers the use case; native is high-maintenance |
| Customer WhatsApp for unconfirmed deliveries | v1 failsafe alerts owner only — customer-facing needs more thought |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 1 | Complete |
| DB-02 | Phase 1 | Complete |
| DB-03 | Phase 2 | Complete |
| DB-04 | Phase 2 | Complete |
| DB-05 | Phase 2 | Complete |
| DB-06 | Phase 6 | Pending |
| DB-07 | Phase 2 | Complete |
| TOK-01 | Phase 2 | Complete |
| TOK-02 | Phase 2 | Complete |
| TOK-03 | Phase 3 | Complete |
| TOK-04 | Phase 9 | Pending |
| KIT-01 | Phase 3 | Complete |
| KIT-02 | Phase 3 | Complete |
| KIT-03 | Phase 3 | Complete |
| KIT-04 | Phase 3 | Complete |
| KIT-05 | Phase 3 | Complete |
| KIT-06 | Phase 3 | Complete |
| KIT-07 | Phase 3 | Complete |
| KIT-08 | Phase 3 | Complete |
| KIT-09 | Phase 3 | Complete |
| RID-01 | Phase 4 | Complete |
| RID-02 | Phase 4 | Complete |
| RID-03 | Phase 4 | Complete |
| RID-04 | Phase 4 | Complete |
| VER-01 | Phase 5 | Complete |
| VER-02 | Phase 5 | Complete |
| VER-03 | Phase 5 | Complete |
| VER-04 | Phase 5 | Pending |
| VER-05 | Phase 5 | Complete |
| VER-06 | Phase 5 | Pending |
| VER-07 | Phase 5 | Pending |
| VER-08 | Phase 5 | Pending |
| VER-09 | Phase 5 | Pending |
| VER-10 | Phase 5 | Pending |
| VER-11 | Phase 5 | Pending |
| VER-12 | Phase 5 | Complete |
| VER-13 | Phase 5 | Pending |
| NOT-01 | Phase 6 | Pending |
| NOT-02 | Phase 6 | Pending |
| NOT-03 | Phase 6 | Pending |
| NOT-04 | Phase 6 | Pending |
| FAIL-01 | Phase 7 | Pending |
| FAIL-02 | Phase 7 | Pending |
| FAIL-03 | Phase 7 | Pending |
| FAIL-04 | Phase 7 | Pending |
| WAI-01 | Phase 8 | Pending |
| WAI-02 | Phase 8 | Pending |
| WAI-03 | Phase 8 | Pending |
| WAI-04 | Phase 8 | Pending |
| WAI-05 | Phase 8 | Pending |
| WAI-06 | Phase 8 | Pending |
| WAI-07 | Phase 8 | Pending |
| WAI-08 | Phase 8 | Pending |
| PWA-01 | Phase 9 | Pending |
| PWA-02 | Phase 9 | Pending |
| PWA-03 | Phase 9 | Pending |
| ARC-01 | Phase 2 | Complete |
| ARC-02 | Phase 2 | Complete |
| ARC-03 | Phase 5 | Pending |
| ARC-04 | Phase 6 | Pending |
| ARC-05 | Phase 3 | Complete |



**Coverage:**
- v1 requirements: 58 total
- Mapped to phases: 58
- Unmapped: 0

---
*Requirements defined: 2026-06-14*
*Last updated: 2026-06-15 — Phase 4 requirements complete (RID-01–04)*

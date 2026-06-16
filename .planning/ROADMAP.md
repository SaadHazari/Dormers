# Dormer's Ops Interfaces — Roadmap

**Project:** Dormer's — Ops Interfaces & Delivery Chain of Custody
**Core Value:** Meals delivered correctly, provably, every time — with the kitchen and rider workflows as frictionless as opening WhatsApp.
**Milestone:** v2.0 (58 requirements across 9 phases)
**Granularity:** Standard
**Created:** 2026-06-14

---

## Phases

- [x] **Phase 1: Recipe Seeding** — Add recipe JSONB column to dishes table, parse cookbook PDF, seed all 48+ recipes (completed 2026-06-14)
- [x] **Phase 2: Schema & Context Foundation** — ops_tokens + delivery_events tables, ops context scaffold, dorm-shapes move, notification kind registration (completed 2026-06-15)
- [x] **Phase 3: Kitchen Display** — `/kitchen/[token]` with today's dishes, recipes, 2 PM count gate, light mobile-first UI (completed 2026-06-15)
- [x] **Phase 4: Rider Page — Pickup** — `/ops/[token]` with dorm shape buttons, expected counts per dorm, pickup confirmation (completed 2026-06-15)
- [ ] **Phase 5: Rider Page — Drop-off & Verification** — Photo capture, Gemini box counting, triple-match verification, escalation flow
- [ ] **Phase 6: Delivery Notification Fanout** — Auto-queue customer WhatsApp on verified delivery via existing dispatcher pipeline
- [x] **Phase 7: Failsafe Cron** — 8 PM UAE cron checks unconfirmed dorms, WhatsApps owner with pending list (completed 2026-06-16)
- [ ] **Phase 8: WhatsApp Inbound Trigger** — Rider texts dorm name, fuzzy match, HMAC verification, message-ID dedup
- [ ] **Phase 9: iOS Shortcuts + PWA + Polish** — Shortcut files per dorm, PWA manifest, token rotation UI, mobile testing at 375px

---

## Phase Details

### Phase 1: Recipe Seeding
**Goal:** Every dish in the database has a structured recipe from the cookbook PDF, ready for the kitchen display to render
**Depends on:** Nothing (first phase)
**Requirements:** DB-01, DB-02
**Success Criteria:**
  1. `dishes` table has a `recipe` JSONB column — confirmed via `SELECT column_name FROM information_schema.columns WHERE table_name = 'dishes' AND column_name = 'recipe'`
  2. All 48+ recipes from Dormers_cook_book_Golden.pdf are seeded with correct dish code mapping (CRNC01, RCVV01, etc.)
  3. Every seeded recipe has the structure `{ sections: [{ heading, items }], method: string[], notes: string }` — no null sections or empty method arrays
  4. Recipe data round-trips correctly: `SELECT name, recipe FROM dishes WHERE recipe IS NOT NULL` returns parseable JSONB for every row
**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Add recipe JSONB column to dishes via migration (DB-01)
- [x] 01-02-PLAN.md — Extract recipes from cookbook PDF with Gemini, seed all dishes rows (DB-02)

**UI hint:** no

### Phase 2: Schema & Context Foundation
**Goal:** All new tables, the ops bounded context, and shared code moves are in place — no UI yet, just the foundation everything else builds on
**Depends on:** Phase 1
**Requirements:** DB-03, DB-04, DB-05, DB-07, TOK-01, TOK-02, ARC-01, ARC-02
**Success Criteria:**
  1. `ops_tokens` table exists with columns: id (uuid), token (text unique), role (check kitchen/rider), label, is_active, revoked_at, created_at
  2. `delivery_events` table exists with: delivery_date, dorm_name, expected_count, rider_count, gemini_count, photo_path, verified, confirmed_at, UNIQUE(delivery_date, dorm_name, trip_number)
  3. `delivery_confirmed` and `delivery_unconfirmed_8pm` are valid values in the `customer_notifications.kind` CHECK constraint
  4. GRANTs on both new tables allow `authenticated` and `service_role` access
  5. `src/contexts/ops/` exists with `domain/` and `usecases/` subdirectories containing token validation and delivery event types
  6. `src/shared/dorm-shapes.ts` exists and the old `src/app/admin/labels/dorm-shapes.ts` imports from it (no duplicate)
  7. At least one kitchen and one rider token are seeded for development/testing
**Plans:** 2/2 plans complete

Plans:
- [x] 02-01-PLAN.md — SQL migrations: ops_tokens + delivery_events tables, kind CHECK extension, GRANTs, dev seed tokens (DB-03, DB-04, DB-05, DB-07, TOK-01)
- [x] 02-02-PLAN.md — Ops context scaffold, dorm-shapes move to shared, notification kind type extension (ARC-01, ARC-02, TOK-02)
**UI hint:** no

### Phase 3: Kitchen Display
**Goal:** Kitchen staff can open a URL on any phone/tablet and see today's dishes with recipes — estimated counts before 2 PM UAE, confirmed counts after 2 PM
**Depends on:** Phase 2
**Requirements:** TOK-03, KIT-01, KIT-02, KIT-03, KIT-04, KIT-05, KIT-06, KIT-07, KIT-08, KIT-09, ARC-05
**Success Criteria:**
  1. `/kitchen/[valid-token]` renders today's veg and non-veg dish with photo, name, and veg/non-veg badge
  2. Tapping a dish card opens a full-screen recipe modal with sticky Ingredients / Method / Notes tabs
  3. Before 2 PM UAE: page shows estimated approximate veg/non-veg counts derived from active subscriptions, clearly labeled "Estimated ~X" — kitchen can start prepping
  4. After 2 PM UAE: confirmed total veg and non-veg counts displayed prominently, labeled "Confirmed" — numbers match the admin deliveries page for the same day
  5. Invalid or revoked token returns a 404 page — no redirect, no error detail
  6. Page works at 375px (iPhone SE) with dark background, Montserrat font, minimum 18px body text
  7. "Last updated" timestamp visible, page auto-refreshes every 60 seconds
  8. `<meta name="referrer" content="no-referrer">` present in page head
  9. `export const dynamic = 'force-dynamic'` on the page route
**Plans:** 3/3 plans complete

Plans:
- [x] 03-01-PLAN.md — Count query use-case + RSC page with token gate, dish/recipe fetch, 2PM estimated/confirmed logic (TOK-03, KIT-01, KIT-03, KIT-04, KIT-05, ARC-05)
- [x] 03-02-PLAN.md — Light mobile-first KitchenClient: styled dish cards, tabbed recipe view with per-component method splitting, color coding (KIT-02, KIT-06, KIT-07, KIT-08, KIT-09)
- [x] 03-03-PLAN.md — Visual verification checkpoint — owner approved (KIT-07)
**UI hint:** yes

### Phase 4: Rider Page — Pickup
**Goal:** Rider opens the ops URL and sees exactly how many boxes to pick up for each dorm, with the familiar dorm shapes from the labels
**Depends on:** Phase 2
**Requirements:** RID-01, RID-02, RID-03, RID-04
**Success Criteria:**
  1. `/ops/[valid-token]` renders dorm buttons: Myriad (circle), KSK (square), Yugo (triangle), DSOA (hexagon), Study World (star)
  2. Each button is >=80x80px with the SVG shape and dorm name label, arranged in a 2-column grid
  3. Expected meal count per dorm is displayed on each button (derived fresh from active subscriptions for today)
  4. Rider can tap "Confirm Pickup" which logs a timestamp to `delivery_events` with the expected count
  5. After pickup confirmation, dorm buttons transition to "drop-off" state (ready for photo verification in Phase 5)
  6. Works at 375px mobile — primary use case is phone in hand
**Plans:** 2/2 plans complete

Plans:
- [x] 04-01-PLAN.md — getDormCounts use-case, confirmPickup server action, RSC page, RiderClient with dorm shape buttons (RID-01, RID-02, RID-03, RID-04)
- [x] 04-02-PLAN.md — Visual verification checkpoint — owner approved with shape fixes (RID-01, RID-02, RID-03, RID-04)

**UI hint:** yes

### Phase 5: Rider Page — Drop-off & Verification
**Goal:** At each dorm, rider takes a photo, enters count, Gemini verifies — triple match = green tick, mismatch = owner escalation
**Depends on:** Phase 4
**Requirements:** VER-01, VER-02, VER-03, VER-04, VER-05, VER-06, VER-07, VER-08, VER-09, VER-10, VER-11, VER-12, VER-13, ARC-03
**Success Criteria:**
  1. Tapping a dorm button in drop-off state opens the camera via `getUserMedia` (fallback to `<input capture>`)
  2. Photo is resized client-side to max 1600px / JPEG 85 before upload
  3. Photo uploads to `delivery-photos` Supabase storage bucket via `/api/ops/verify-box-count` route
  4. Rider enters box count — submit button stays disabled until photo + non-zero count
  5. Gemini `gemini-2.5-flash` returns `{ count, confidence, reason, imageQuality }` independently from the photo
  6. All three match (expected === rider === Gemini) → large green tick animation for 1.5-2s
  7. Count mismatch → owner gets WhatsApp via `notifyAdmin` with photo URL + all three numbers
  8. Gemini says photo unclear (low confidence / bad quality) → "Retake photo" prompt; second fail → escalate
  9. Gemini timeout (null count) → manual confirmation flow, never auto-completes
  10. `delivery_events` row records: token_id, timestamp, geolocation, expected_count, rider_count, gemini_count, gemini_confidence, photo_path
  11. API route has `export const maxDuration = 60` for Netlify
**Plans:** 4 plans

Plans:
- [ ] 05-01-PLAN.md — Infrastructure + domain: geo migration, delivery-photos bucket, box-count-verify Gemini function, update-delivery-event use-case (VER-06, VER-13, ARC-03)
- [ ] 05-02-PLAN.md — API route: /api/ops/verify-box-count with multipart handling, Gemini call, triple-match logic, notifyAdmin escalation (VER-04, VER-06–11, ARC-03)
- [ ] 05-03-PLAN.md — Client UI: camera capture (getUserMedia + fallback), image resize, count input, drop-off modal, per-dorm status tracking (VER-01–03, VER-05, VER-12)
- [ ] 05-04-PLAN.md — Compile/lint check + visual verification checkpoint (all VER + ARC-03)

**UI hint:** yes

### Phase 6: Delivery Notification Fanout
**Goal:** When a delivery is verified (green tick), every active subscriber in that dorm gets a WhatsApp — fully automatic, using the existing dispatcher
**Depends on:** Phase 5
**Requirements:** NOT-01, NOT-02, NOT-03, NOT-04, DB-06, ARC-04
**Success Criteria:**
  1. On verified delivery, `queueCustomerNotification` is called with kind `delivery_confirmed` for each active, non-skipped, non-paused subscriber in that dorm
  2. `dispatch_customer_notifications_tick` has a `delivery_confirmed` CASE branch that sends via the correct Meta template
  3. `tpl_delivery_confirmed` Vault secret points to the registered UTILITY template name
  4. Notifications flow through the existing `FOR UPDATE SKIP LOCKED` dispatcher — no direct WhatsApp calls from ops code
  5. Customer receives the WhatsApp within the dispatcher's 5-minute tick window
  6. No notification is sent for skipped, paused, or ended subscriptions
**Plans:** 1 plan (plan 01 complete 2026-06-16)

Plans:
- [x] 06-01-PLAN.md — Fanout use-case, dispatcher v7 migration, API route trigger with dedup guard (NOT-01, NOT-02, NOT-03, NOT-04, DB-06, ARC-04)

**UI hint:** no

### Phase 7: Failsafe Cron
**Goal:** If any dorm's delivery isn't confirmed by 8 PM UAE, the owner gets a WhatsApp alert so nothing slips through the cracks
**Depends on:** Phase 6
**Requirements:** FAIL-01, FAIL-02, FAIL-03, FAIL-04
**Success Criteria:**
  1. pg_cron job `ops_failsafe_20_ae` scheduled at `0 16 * * *` (8 PM UAE) — verified via `SELECT * FROM cron.job WHERE jobname = 'ops_failsafe_20_ae'`
  2. Cron calls `/api/internal/ops-failsafe-send` with bearer auth (`INTERNAL_RETRY_SECRET`)
  3. Route finds dorms with active subscriptions today but no verified `delivery_events` row
  4. Owner receives WhatsApp via `notifyAdmin` listing pending dorms + a quick-actions link
  5. Calling the failsafe twice in the same window does not send duplicate alerts (idempotent)
  6. If all dorms are already confirmed, the cron fires but sends nothing
**Plans:** 1 plan

Plans:
- [x] 07-01-PLAN.md — SQL migration (dedup table + tick function + cron schedule) + API route (auth, dorm lookup, idempotency, notifyAdmin) (FAIL-01, FAIL-02, FAIL-03, FAIL-04)

**UI hint:** no

### Phase 8: WhatsApp Inbound Trigger
**Goal:** Rider can text a dorm name to the Dormer's WhatsApp number as a fallback delivery confirmation — fuzzy matched, deduplicated, secure
**Depends on:** Phase 6
**Requirements:** WAI-01, WAI-02, WAI-03, WAI-04, WAI-05, WAI-06, WAI-07, WAI-08
**Success Criteria:**
  1. `GET /api/ops/whatsapp-inbound` handles Meta's verification handshake correctly
  2. `POST /api/ops/whatsapp-inbound` verifies `X-Hub-Signature-256` HMAC — rejects unsigned or tampered payloads
  3. Handler returns 200 before any async processing (Gemini, DB writes, WhatsApp replies)
  4. Duplicate messages (same WhatsApp message ID) are not processed twice — unique constraint on processed IDs
  5. "yugo", "YUGO", "yug" all fuzzy-match to Yugo (triangle) — conservative threshold, no false positives
  6. Ambiguous match → WhatsApp reply to rider: "Did you mean X?" with confirmation options
  7. Only text messages from allowlisted phone numbers are processed — all others silently ignored
  8. Non-text messages (images, voice, reactions) get a reply: "Please send the dorm name as text"
**Plans:** 2 plans

Plans:
- [x] 08-01-PLAN.md — SQL migration (whatsapp_inbound_processed + whatsapp_rider_allowlist) + fuzzy match domain utility (WAI-04, WAI-05, WAI-06, WAI-07)
- [x] 08-02-PLAN.md — API route: GET handshake + POST HMAC + fire-and-forget processing + compile/lint check (WAI-01, WAI-02, WAI-03, WAI-04, WAI-05, WAI-06, WAI-07, WAI-08)

**UI hint:** no

### Phase 9: iOS Shortcuts + PWA + Polish
**Goal:** Owner has one-tap iPhone shortcuts for each dorm, both pages are add-to-home-screen ready, tokens are rotatable, and everything works at 375px
**Depends on:** Phase 8
**Requirements:** PWA-01, PWA-02, PWA-03, TOK-04
**Success Criteria:**
  1. iOS Shortcut `.shortcut` files generated for each dorm — tapping fires the delivery confirmation API
  2. `src/app/manifest.ts` serves a valid PWA manifest with correct icons, display: standalone, theme_color
  3. iOS meta tags (apple-mobile-web-app-capable, status-bar-style, title) present on kitchen and ops layouts
  4. Admin panel has a token rotation UI — new token generated, old token revoked, no deploy needed
  5. Both pages tested and verified at 375px on iOS Safari and Android Chrome
  6. End-to-end flow tested: kitchen sees dishes → rider picks up → rider drops off → photo verified → customer gets WhatsApp
**Plans:** 3 plans

Plans:
- [ ] 09-01-PLAN.md — PWA manifest (src/app/manifest.ts), icon resizing (icon-192/512/180.png), iOS meta tags on kitchen + ops page.tsx (PWA-02, PWA-03)
- [ ] 09-02-PLAN.md — Token rotation admin page (/admin/ops-tokens RSC + client + server action + sidebar/Cmd+K) (TOK-04)
- [ ] 09-03-PLAN.md — /api/ops/mark-delivered endpoint, iOS Shortcuts guide (public/shortcuts/README.md), compile/lint gate, visual verification checkpoint (PWA-01)

**UI hint:** yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Recipe Seeding | 2/2 | Complete   | 2026-06-15 |
| 2. Schema & Context Foundation | 2/2 | Complete   | 2026-06-15 |
| 3. Kitchen Display | 3/3 | Complete   | 2026-06-15 |
| 4. Rider Page — Pickup | 2/2 | Complete   | 2026-06-15 |
| 5. Rider Page — Drop-off & Verification | 0/4 | Planning complete | — |
| 6. Delivery Notification Fanout | 1/1 | Complete | 2026-06-16 |
| 7. Failsafe Cron | 1/1 | Complete | 2026-06-16 |
| 8. WhatsApp Inbound Trigger | 2/2 | Complete | 2026-06-16 |
| 9. iOS Shortcuts + PWA + Polish | 0/3 | Planning complete | — |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 1 | Complete |
| DB-02 | Phase 1 | Complete |
| DB-03 | Phase 2 | Complete |
| DB-04 | Phase 2 | Complete |
| DB-05 | Phase 2 | Complete |
| DB-06 | Phase 6 | Complete |
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
| VER-01 | Phase 5 | Pending |
| VER-02 | Phase 5 | Pending |
| VER-03 | Phase 5 | Pending |
| VER-04 | Phase 5 | Pending |
| VER-05 | Phase 5 | Pending |
| VER-06 | Phase 5 | Pending |
| VER-07 | Phase 5 | Pending |
| VER-08 | Phase 5 | Pending |
| VER-09 | Phase 5 | Pending |
| VER-10 | Phase 5 | Pending |
| VER-11 | Phase 5 | Pending |
| VER-12 | Phase 5 | Pending |
| VER-13 | Phase 5 | Pending |
| NOT-01 | Phase 6 | Complete |
| NOT-02 | Phase 6 | Complete |
| NOT-03 | Phase 6 | Complete |
| NOT-04 | Phase 6 | Complete |
| FAIL-01 | Phase 7 | Complete |
| FAIL-02 | Phase 7 | Complete |
| FAIL-03 | Phase 7 | Complete |
| FAIL-04 | Phase 7 | Complete |
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
| ARC-04 | Phase 6 | Complete |
| ARC-05 | Phase 3 | Complete |

**v1 requirements mapped:** 58/58
**Orphaned requirements:** 0

---

*Roadmap created: 2026-06-14*
*Last updated: 2026-06-16 — Phase 9 planning complete (3 plans)*

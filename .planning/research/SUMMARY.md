# Research Summary — Ops Interfaces v2.0

## One-Paragraph Overview

Every technical capability this milestone needs already exists in the codebase. Gemini Vision (`@ai-sdk/google` v3.0.80 with `gemini-2.5-flash`) is live and proven. The Meta WhatsApp outbound client is in `infra/meta-whatsapp/client.ts`. Supabase Storage has an established upload pattern. The notification queue and pg_cron dispatcher handle async sends. The Dubai timezone helpers handle the 2 PM cutoff. Zero new npm packages are required. The build is extension, not invention — a 10th bounded context (`ops`) sits cleanly inside the existing 9-context layered architecture. The one meaningful architectural decision is treating delivery verification as a triple-witness system (expected count from DB + rider count entered on phone + Gemini count from photo), where no single source is ground truth and all three are logged every time for audit.

---

## Key Decisions to Lock

1. **Camera API:** Use `getUserMedia` as the primary camera path, `<input type="file" capture="environment">` as fallback. On iOS PWA home-screen installs, `<input capture>` opens the photo library instead of the camera. `getUserMedia` works in both browser and home-screen contexts. Catch `NotAllowedError` and show iOS Settings instructions. Always stop all tracks on component unmount.

2. **Triple-match logic:** expected === rider === Gemini → auto-confirm + WhatsApp. Any mismatch → log all three, flag for review, do not block the rider. Gemini timeout returns `null` — always require manual confirmation in that case, never auto-complete.

3. **2 PM gate is server-side only.** Evaluate the cutoff in the RSC page component using `shared/time/dubai-day.ts`. Never pass a client-side boolean. `AE_2PM_UTC_HOUR = 10` as a named constant wherever the cutoff is checked.

4. **Token storage:** random 32-char hex strings in the `ops_tokens` table, queried on every page load. Not in env vars (env vars appear in build logs). Not hashed (high-entropy tokens are fine plaintext). Rotatable from admin panel without a deploy.

5. **WhatsApp webhook returns 200 before any async work.** Deduplicate on `messages[0].id` from the start. Meta retries on >20s responses and a Gemini call can easily exceed that.

6. **`delivery_confirmed` WhatsApp template must be UTILITY category, not MARKETING.** File with Meta before writing dispatch code. Template approval takes 24–72 hours and can block the whole delivery confirmation flow.

7. **`dorm-shapes.ts` moves to `src/shared/dorm-shapes.ts`** before building the ops context. Currently at `src/app/admin/labels/dorm-shapes.ts` — importing from there into `src/contexts/ops/` violates L1-BOUNDARIES.

8. **Photo upload path through server-side API route, not client-side direct-to-Supabase.** The `delivery-photos` bucket is private and uses the service-role client in `infra/supabase/admin-client.ts`. Client PWA POSTs to `/api/ops/verify-box-count`, which handles the storage upload server-side.

9. **Gemini receives image bytes, not a Supabase signed URL.** Upload to storage first, get the storage path, then pass the raw image bytes to `generateText`. Signed URLs that require auth do not work as Gemini image input.

10. **`delivery_events` UNIQUE on `(delivery_date, dorm_name, trip_number DEFAULT 1)`.** Trip number defaults to 1 (the happy path today) but allows multi-trip extension without a schema rewrite.

---

## Stack Additions

None. All capabilities are covered by existing packages:

| Capability | Covered By |
|---|---|
| Gemini Vision box counting | `@ai-sdk/google` v3.0.80, `gemini-2.5-flash`, same pattern as `google-review-verify.ts` |
| PWA manifest | Next.js 15 native `src/app/manifest.ts` — no package |
| Camera capture | `navigator.mediaDevices.getUserMedia` — browser built-in |
| GPS coordinates | `navigator.geolocation` — browser built-in |
| Photo storage | Existing Supabase Storage pattern from `dish-photos` bucket |
| Inbound webhook HMAC | `crypto.createHmac` (Node 20 built-in) + existing `timingSafeCompare` in `shared/crypto.ts` |
| Notification dispatch | Existing `queueCustomerNotification` + pg_cron dispatcher |
| 8 PM failsafe cron | pg_cron `0 16 * * *` following `dispatch_renew_nudges_18_ae` pattern |

---

## Architecture

**New routes (outside all auth route groups):**
- `src/app/kitchen/[token]/page.tsx` — RSC, `force-dynamic`, validates token, time-gates counts, read-only
- `src/app/ops/[token]/page.tsx` — RSC shell + single `'use client'` component for interactive rider flow
- `src/app/api/ops/verify-box-count/route.ts` — multipart POST, token validate → upload photo → Gemini → return triple-match; `maxDuration = 60`
- `src/app/api/ops/confirm-delivery/route.ts` — writes `delivery_events`, calls `queueCustomerNotification`
- `src/app/api/ops/whatsapp-inbound/route.ts` — GET for Meta handshake + POST with HMAC verify, message-ID dedup, fuzzy dorm match, 200-before-async
- `src/app/api/internal/ops-failsafe-send/route.ts` — bearer-auth internal cron route, 8 PM UAE

**New 10th context:**
```
src/contexts/ops/
  domain/
    delivery-event.ts   — types + verification logic (pure)
    ops-token.ts        — token validation rules (pure)
    box-count.ts        — triple-match rule (pure)
    time-gate.ts        — 2 PM UAE gate (pure, uses shared/time/)
  usecases/
    validate-token.ts
    get-kitchen-view.ts
    get-dorm-delivery-state.ts
    confirm-delivery.ts — writes event, calls notifications queue
    run-failsafe.ts     — 8 PM sweep
```

**New DB tables:** `ops_tokens` and `delivery_events`. Add `recipe` JSONB column to existing `dishes` table. Add `delivery_confirmed` and `delivery_unconfirmed_8pm` to `customer_notifications.kind` CHECK constraint.

**New Supabase storage bucket:** `delivery-photos` — private, path `{delivery_date}/{dorm_name}/{delivery_event_id}.jpg`, 5 MB server-side cap, 24-hour signed URLs for admin panel.

**pg_cron addition:** `0 16 * * *` (= 8 PM UAE) → `dispatch_ops_failsafe_tick()`.

**Cross-context integration:** `confirm-delivery.ts` (ops use-case) imports `queueCustomerNotification` from `contexts/notifications/usecases/queue.ts`.

---

## Feature Patterns

**KDS (kitchen display):**
- Dark background, Montserrat 18px minimum / 32px+ for dish names
- Recipe modal: sticky section navigator (Ingredients / Method / Notes tabs), scroll within section
- Two states separated by server-side 2 PM gate: recipe-only before / counts + recipes after
- 60-second auto-refresh with "last updated HH:MM" timestamp
- Color: `text-emerald-500` veg, `#f57f20` non-veg

**POD (rider interface):**
- 4-tap flow: select dorm → take photo → enter count → confirm
- Dorm shape buttons: 2-column grid, 80×80px minimum tap targets, SVG shape + name label
- Client-side canvas resize to max 1600px / JPEG 85 before upload
- Disabled submit until photo + non-zero count present
- Large green tick confirmation (1.5–2 seconds) — not a toast

**Gemini counting prompt shape:**
```json
{ "count": number | null, "confidence": "high"|"medium"|"low", "reason": string, "imageQuality": "clear"|"blurry"|"dark"|"partial" }
```

---

## Critical Risks (Top 5)

1. **iOS PWA home-screen breaks camera** — `<input capture>` opens photo library instead of camera. Likelihood: HIGH. Impact: HIGH.
2. **WhatsApp webhook double-processes deliveries** — Meta retries if >20s. Likelihood: HIGH. Impact: HIGH.
3. **pg_cron failsafe fires at wrong UAE time** — `0 20 * * *` vs correct `0 16 * * *`. Likelihood: MEDIUM. Impact: HIGH.
4. **Gemini count passes triple-match but is wrong** — stacked boxes in poor lighting. Likelihood: MEDIUM. Impact: MEDIUM.
5. **Secret token in Netlify logs** — URL path tokens appear in request logs. Likelihood: HIGH. Impact: MEDIUM.

## Mitigations

| Risk | Mitigation |
|---|---|
| iOS camera | `getUserMedia` primary, `<input capture>` fallback; catch `NotAllowedError`; `visibilitychange` stream restart; stop tracks on unmount |
| WhatsApp double-send | 200 before async; upsert dedup on `messages[0].id` with unique constraint |
| UTC/UAE cron confusion | `AE_2PM_UTC_HOUR = 10` constant; `0 16 * * *` commented as "8 PM UAE"; MCP verify after creation |
| Gemini wrong count | Log expected/rider/gemini on every record; admin audit view; in-app photo tips; `null` = manual confirm |
| Token in logs | `no-referrer` meta; rotation UI in admin; rotate after testing |

---

## Open Questions

1. **8 PM failsafe action — alert owner or notify customers?** Owner-only via `notifyAdmin` is safer for launch (no new template needed).
2. **Photo retention policy.** Storage costs are minimal (5–10 MB/day). Decide before creating bucket.
3. **Shared WhatsApp phone number.** Inspect existing inbound webhook setup before adding a second handler.

---

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack | HIGH | Package.json audited; existing Gemini and WhatsApp code verified; browser APIs stable |
| Features | HIGH | KDS and POD UX from codebase reads + consistent industry patterns |
| Architecture | HIGH | Based on live codebase reading; 10th context fits existing pattern |
| Pitfalls | HIGH | From existing patterns, project memory, and stable browser API behaviour |

**Overall: HIGH.** Open questions are operational decisions, not technical unknowns.

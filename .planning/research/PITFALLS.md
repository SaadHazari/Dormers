# Pitfalls Research — Ops Interfaces v2.0

**Domain:** Kitchen display + rider PWA + delivery chain of custody
**Researched:** 2026-06-14
**Confidence:** HIGH — drawn from existing codebase patterns, the project's own Gemini Vision implementation in `google-review-verify.ts`, the live WhatsApp client in `infra/meta-whatsapp/client.ts`, the pg_cron dispatcher patterns in `supabase/migrations/`, and the Dubai time helpers in `shared/time/dubai-day.ts`.

---

## Summary

The triple-match verification flow (expected count vs rider count vs Gemini count) is the most architecturally fragile piece in this milestone — any one of the three sources can produce wrong or missing data, and the fallback path (8 PM cron alert) only fires hours later. iOS Safari's camera and permission model is the biggest front-end risk: it diverges from Android Chrome in ways that silently break the photo capture flow. UAE timezone handling looks simple because Dubai has no DST, but the 2 PM cutoff specifically straddles a UTC day boundary in ways that have already burned this codebase once (the `ae_today()` drift in live vs repo migrations).

---

## Findings

### AI Vision Counting Pitfalls

**The core accuracy problem with Gemini and object counting:**
Gemini Vision (Flash or Pro) is trained on diverse images. Counting identical food containers in a delivery bag is one of the harder tasks because the boxes overlap, lighting in a rider's bag is poor, and the model has no spatial anchor. This codebase already uses Gemini Flash for review screenshot analysis (`google-review-verify.ts`) and the existing code is well-designed — it strips JSON fences defensively, has a `normaliseVerdict` fallback, and times out at 45s. Apply those same patterns to box counting, but be aware of these specific failure modes:

- **Occlusion errors.** Boxes stacked in a bag are partially hidden. Gemini may count 3 when 5 are present because only 3 tops are visible. Instruct the rider to fan boxes out before photographing. Put this in the prompt: "boxes may be partially stacked; count ALL boxes visible including those underneath others."
- **Reflection and lid shine.** Foil lids or shiny containers in direct sunlight produce specular highlights that Gemini treats as visual noise, dropping count accuracy. No technical fix — protocol fix: instruct riders to photograph in shade.
- **JSON fence wrapping despite instructions.** The existing `google-review-verify.ts` already handles this: strip ` ```json ` fences before parsing. Copy that pattern exactly.
- **Integer drift.** Gemini sometimes returns `"count": "5"` (string) rather than `"count": 5` (integer) when parsing JSON output. Always coerce with `parseInt()` and validate the result is a finite positive number before using it.
- **Confidence hallucination.** The model may return `"confidence": "high"` even when the photo is blurry or partially cropped. Do not rely on self-reported confidence alone — if `rider_count !== gemini_count`, always flag for manual review regardless of confidence.
- **Timeout budget.** The existing implementation uses a 45s abort with `AbortSignal.timeout(45_000)`. On Netlify's free tier, the max function duration is 10s (Netlify Functions v1) or 26s (background functions). Gemini Flash typically responds in 2–6s for a single image, but can spike to 20s+ under load. Use a 20s abort signal and make the fallback behavior explicit: if Gemini times out, record `gemini_count = null` and treat the delivery as "needs manual confirmation" rather than blocking the rider.
- **Image size limits.** Gemini Flash accepts up to 20MB inline images. A modern phone photo is 3–8MB — safe. But if the PWA compresses or resizes before upload, a blurry compressed image reduces count accuracy. Compress to a maximum of 1600px on the long edge (JPEG quality 85) before sending to Gemini. This is also storage-friendly.

**Prompt engineering for counting specifically:**
The existing review-verify prompt is excellent as a template. For box counting, the key additions are: (1) provide the expected count as context so the model can sanity-check itself, (2) ask for a `raw_count` field (what Gemini literally counted) AND a `verified_count` (its best guess after reasoning) separately, (3) ask it to return `null` explicitly if the image is too dark/blurry to count, rather than guessing. Never ask it to "verify the delivery" — keep the prompt strictly about counting visible boxes.

---

### Mobile Camera Capture Pitfalls

This is the highest-friction area because iOS Safari and Android Chrome behave very differently, and the rider uses whatever phone they have.

**`getUserMedia` vs `<input type="file" capture="environment">`:**
These are two fundamentally different APIs with different behaviors:

- `<input type="file" capture="environment">` opens the native camera app, hands the resulting photo back as a File object. Works everywhere including iOS Safari. Cannot stream live preview. Simpler but you lose control over the photo before it is taken.
- `getUserMedia({ video: { facingMode: 'environment' } })` streams the rear camera into a `<video>` element, letting you show a live preview and capture frames. This is the better UX (rider sees what they're photographing) but has iOS caveats.

**iOS Safari `getUserMedia` issues (HIGH confidence from known browser behavior):**

1. **HTTPS is mandatory.** `getUserMedia` returns a `NotAllowedError` immediately on HTTP, even localhost. The `/ops/[token]` page must be served over HTTPS. Netlify handles this automatically for the production domain — but test this explicitly.
2. **Permission prompt timing.** iOS Safari only shows the camera permission prompt in response to a user gesture (a tap). Calling `getUserMedia` on page load silently fails. Always trigger camera access from a button tap.
3. **Background tab kills the stream.** If the rider switches apps or the screen locks, iOS terminates the `getUserMedia` stream. The video element goes black. You must listen for `visibilitychange` and re-call `getUserMedia` when the tab becomes visible again.
4. **Safari 15 and earlier have broken `ImageCapture` API.** Do not use `ImageCapture.takePhoto()`. Use `canvas.drawImage(videoElement, ...)` + `canvas.toBlob()` to capture a frame. This works on all current Safari versions.
5. **Memory leak with `srcObject`.** Always call `stream.getTracks().forEach(t => t.stop())` when the component unmounts. Un-stopped tracks hold the camera hardware, drain battery, and show the green camera indicator indefinitely.
6. **PWA fullscreen + camera.** On iOS, PWA home-screen apps run in a pseudo-browser context that does support `getUserMedia` but does NOT support the `capture` attribute on file inputs (it opens the photo library chooser instead of the camera). If the rider adds the PWA to their home screen, `<input capture>` breaks. Use `getUserMedia` as the primary path with `<input>` as fallback.

**Android Chrome:**
Android Chrome is well-behaved with `getUserMedia`. The main gotcha is `facingMode: 'environment'` is a hint, not a guarantee — on some dual-rear-camera phones, it picks the wrong lens. Accept this; it does not meaningfully affect photo quality for box counting.

**File size before upload:**
Resize to max 1600px (long edge) and encode at JPEG 85 client-side before uploading to Supabase Storage and sending to Gemini. Use a canvas resize: draw the `<img>` (from the captured blob) onto a canvas at target dimensions, then `canvas.toBlob('image/jpeg', 0.85)`. This cuts a 8MB phone photo to ~400KB, which is safe for Gemini's inline image API and keeps Supabase storage costs low.

---

### Secret-Token URL Authentication Pitfalls

The `/kitchen/[token]` and `/ops/[token]` pages are intentionally ungated — no login — but the token IS the authentication.

**Token generation:**
Use `crypto.randomBytes(32).toString('hex')` (64 hex chars) in Node.js, or `crypto.getRandomValues` in the browser. Do NOT use `Math.random()`, UUIDs (v4 UUIDs are 122 bits of entropy — acceptable, but only if generated server-side), or sequential integers. Store a bcrypt hash in the DB (or the raw token, since these are high-entropy single-use-ish tokens) and compare on each request.

**Token exposure in server logs:**
Next.js, Netlify, and Vercel log the full request URL. If the token is in the path (`/ops/abc123`), it will appear in every request log entry. Anyone with access to Netlify logs can extract valid tokens. Mitigations: (a) put the token in a query param that you explicitly exclude from logging, (b) rotate tokens periodically (weekly), (c) restrict Netlify log access.

**Token in browser history:**
The rider visits `/ops/[token]`. The URL lives in their browser history. If they share a phone or use a public phone, the token is exposed. Mitigation: after the rider completes a delivery session, redirect to a blank completion screen that clears the history entry using `history.replaceState`. This does not fully solve it but reduces casual exposure.

**Referrer header leakage:**
If the ops page links to any third-party resource (analytics, CDN), the full URL including token will be sent as the `Referer` header. Add `<meta name="referrer" content="no-referrer">` to the `/ops/[token]` and `/kitchen/[token]` pages. In Next.js, set this in the `<head>` via `metadata.referrer = 'no-referrer'` or a `<meta>` tag in the layout.

**Brute force:**
64 hex chars = 2^256 possibilities. Brute force is not a practical threat. Rate limiting is not needed for the token validation itself. However, if you add an endpoint like `GET /api/verify-token?t=[token]` for client-side checks, rate-limit that endpoint.

**Token rotation:**
The kitchen token and ops token should be different, and both should be rotatable from the admin panel without requiring a code deploy. Store them in the Supabase `vault` (already used for other secrets in this project) or in a `settings` table. Never hardcode them in source code or env vars (env vars appear in Netlify build logs).

---

### WhatsApp Webhook Pitfalls

The existing codebase has a mature WhatsApp client (`infra/meta-whatsapp/client.ts`) and a working dispatcher cron. The inbound webhook (for rider texting dorm names) is new territory.

**Webhook verification (GET challenge):**
Meta requires a GET endpoint that responds to the `hub.challenge` parameter during webhook registration. If this step fails, Meta will not send any messages. The verification logic must be separate from the POST message handler. The `WEBHOOK_VERIFY_TOKEN` must be set in vault before attempting registration. Do NOT put this in source code.

**Message payload structure (HIGH fragility area):**
Meta's inbound webhook payload is deeply nested JSON. The actual message text is at `body.entry[0].changes[0].value.messages[0].body`. Any of these levels can be absent: an outbound message status update (delivered, read, failed) arrives at the same endpoint but `messages` is absent — `statuses` is present instead. Without a guard, `body.entry[0].changes[0].value.messages[0].body` throws a TypeError. Always check `value.messages && value.messages.length > 0` before accessing message content.

**Message types you must ignore:**
Riders may accidentally send images, voice notes, or reaction emojis instead of text. The webhook fires for all of these. Check `messages[0].type === 'text'` before attempting fuzzy dorm name matching. For non-text messages, either reply with a "Please send the dorm name as text" message or silently no-op.

**Duplicate delivery:**
Meta retries webhook delivery if your endpoint returns anything other than HTTP 200 within 20 seconds. If your handler takes 21 seconds (e.g., Gemini is slow), Meta will retry, and you process the same message twice. Return HTTP 200 immediately, then process asynchronously. In Next.js, this means returning `NextResponse.json({ ok: true })` before awaiting any downstream work. Use an idempotency key (the WhatsApp message ID, available as `messages[0].id`) to deduplicate.

**Rate limits:**
The WhatsApp Cloud API imposes per-phone-number rate limits on OUTBOUND messages. Sending the auto-WhatsApp delivery confirmation to every customer at 6–7 PM (end of delivery window) means a burst of messages. The current notification dispatcher cron handles this via `FOR UPDATE SKIP LOCKED` and a 5-minute tick, which naturally throttles sends. Apply the same pattern for delivery confirmations — queue them in `customer_notifications` rather than firing them directly from the webhook handler.

**Template approval delay:**
If you need a new WhatsApp template (e.g., "Your delivery has been confirmed, photo attached") it needs Meta approval, which takes 24–72 hours and sometimes gets rejected. The existing codebase handles this by checking for template name in vault and gracefully skipping if not found. Apply the same pattern. Design the delivery confirmation message to reuse an already-approved template if possible.

**Fuzzy dorm name matching:**
Riders will text "silicon gate" not "Silicon Gate Tower B". Use a fuzzy matching library (`fuse.js` is already a reasonable choice — it is lightweight and has no native deps). Set the threshold conservatively (0.4 or below on Fuse's scale, which is a HIGHER match requirement) and always return the top match's score alongside the matched dorm. If the score is below threshold, reply asking the rider to confirm: "Did you mean Silicon Gate Tower B?" with a yes/no button (quick reply). Do not auto-proceed on ambiguous matches — a wrong dorm confirmation sends WhatsApp messages to the wrong customers.

---

### Geolocation Pitfalls

**iOS permission model:**
On iOS, geolocation requires HTTPS (same as camera). The permission prompt fires on the first call to `navigator.geolocation.getCurrentPosition()`. Unlike Android, iOS does not have a "deny forever" state in the browser — users can revoke at any time from Settings. If permission is denied, `error.code === 1` (PERMISSION_DENIED). The ops PWA must handle this gracefully: show a human-readable message ("Please enable location in your phone's Settings > Safari > Location") and allow the delivery to proceed without geolocation data. Geolocation is a nice-to-have audit trail, not a blocker.

**Accuracy:**
`getCurrentPosition` with default options can return a cached location that is minutes old and hundreds of meters off. Pass `{ maximumAge: 0, timeout: 10000, enableHighAccuracy: true }`. Even with `enableHighAccuracy: true`, indoor accuracy in a building lobby is typically 20–50m — enough to confirm "near the dorm" but not enough to verify "in front of Unit 4B." Do not make operational decisions based on geolocation precision; use it as an audit log only.

**Battery drain:**
Calling `watchPosition` (continuous) rather than `getCurrentPosition` (one-shot) drains battery fast on mobile. Use `getCurrentPosition` at the moment of delivery confirmation, not a continuous watch.

**No GPS in some environments:**
UAE apartment blocks often have poor GPS. Riders inside a lobby or elevator will get no fix or a stale cell-tower fix. Always set a timeout (`timeout: 10000`) so the Promise resolves in under 10s rather than hanging. Treat a timeout as "location unavailable" — store `null` in the delivery record, not a failure.

---

### pg_cron Pitfalls

The project already has 16 active cron jobs on the Ohio project. The 8 PM failsafe for unconfirmed deliveries will become the 17th. Based on existing migration patterns, there are known issues to avoid:

**Timezone in cron schedule:**
pg_cron schedules are in UTC. 8 PM UAE (UTC+4) = 4 PM UTC = `0 16 * * *` in cron syntax. This is SAFE as long as the schedule is written in UTC deliberately. The common mistake is writing `0 20 * * *` thinking "8 PM" and actually firing at midnight UAE. Comment every cron schedule with its UAE wall time equivalent. Example: `-- 8 PM UAE (UTC+4) -- '0 16 * * *'`.

**Repo migrations are stale vs live DB:**
The project memory explicitly notes that `subscription_status_tick`, `ae_today()`, and cron times differ between repo migrations and production. Do NOT reference or copy existing migration files for cron schedules — verify the live schedule via Supabase MCP before writing the new one. The new delivery-failsafe cron should be documented in a new migration file but deployed via MCP directly to verify it took.

**pg_cron does not retry on failure:**
If the failsafe function throws an exception, pg_cron logs the error in `cron.job_run_details` and moves on. There is no automatic retry. The existing dispatcher uses `FOR UPDATE SKIP LOCKED` to be re-entrant — the failsafe function should follow the same pattern. If it checks "dorms not confirmed by 8 PM" and sends an admin alert, that alert must be idempotent (sending it twice should be harmless — either include a timestamp in the message or deduplicate in the function body).

**Monitoring pg_cron jobs:**
`SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20` is how you check if crons are firing. Add this to the admin panel's health section. The existing 16 crons were verified post-migration by checking this view — do the same after adding the new one.

**pg_net and the http extension:**
The existing dispatcher uses `pg_net` to fire HTTP requests from inside Postgres (to the Meta WhatsApp API). If the failsafe cron needs to send a WhatsApp alert to the owner, it can reuse the same `pg_net.http_post()` pattern already used in `dispatch_customer_notifications_tick`. Do not create a new extension dependency.

**Function execution time:**
pg_cron functions that take longer than the cron interval can overlap. The failsafe fires at 8 PM (once a day) so overlap is not a real concern. But if it queries a large table without an index, it can time out. Ensure the delivery records table has an index on `(delivery_date, confirmed_at)` or equivalent.

---

### Supabase Storage Pitfalls

**RLS on storage buckets:**
Supabase Storage RLS is configured per-bucket in `storage.objects`. For delivery photos, the bucket should be private (no public URL access) because photos may contain riders' faces or identifiable building interiors. The insert policy should allow only authenticated service-role requests (from the Next.js server), not the anon key (which is what the client-side PWA uses). This means the photo upload must go through a server-side route (`/api/ops/upload-photo`) that uses the service-role client, not a direct client-side upload. The existing codebase has this pattern — the Supabase clients are initialized server-side in `infra/supabase/`.

**File size limits:**
Supabase Storage free tier allows 50MB per file and 1GB total storage. A delivery photo compressed to JPEG at 1600px/85% is roughly 300–600KB. With 10–20 deliveries per day, you will accumulate ~5–10MB per day, staying well within free tier for a long time. Still, implement a max file size check server-side (reject anything over 5MB with HTTP 413) to prevent abuse.

**CDN caching of private objects:**
Private bucket objects are served via signed URLs that expire. The default signed URL expiry in Supabase is 1 hour. If the admin panel shows delivery photos and the URL has expired, the image shows as broken. Either (a) generate a fresh signed URL on each admin panel load, or (b) make the bucket public with security-through-obscurity (random path segments) — which is simpler but less secure for face-containing photos. Recommendation: private bucket, generate signed URLs server-side with a 24-hour expiry for admin review purposes.

**RLS grants on new tables:**
The project memory notes that new tables need explicit GRANTs. A delivery_records table (or whatever you call the box-count audit table) will need `GRANT SELECT, INSERT, UPDATE ON public.delivery_records TO authenticated, service_role;` explicitly, otherwise the service-role client gets permission denied. This has burned the project before (noted in memory).

**Storage object paths and the old project URL:**
The migration doc notes that the old Tokyo project's storage URLs were stored in DB text columns. When building the delivery photo system, store the Supabase storage PATH (not the full URL) in the DB. Generate the full URL at read time using the current project's URL. This makes a future region migration trivial.

---

### Real-time Count Update Pitfalls

The kitchen display shows today's expected delivery count per dorm. This count changes when customers skip (before 2 PM). Two sources of staleness:

**The 2 PM cutoff race:**
A customer skips at 1:59 PM UAE. The kitchen display, loaded at 1:55 PM, shows N boxes for their dorm. At 2:00 PM the skip takes effect. The rider picks up N boxes but only N-1 are needed. The count on the kitchen screen is now wrong. This is not a technical bug — it is an operational reality. Mitigate with a prominent "last updated at HH:MM" timestamp on the kitchen display, auto-refreshing every 60 seconds (a simple `setInterval` + refetch, not necessarily a WebSocket).

**Supabase Realtime subscriptions and connection drops:**
If you use Supabase Realtime to push count updates to the kitchen display, be aware that Realtime connections drop on network hiccups. The kitchen display is on a tablet that may have spotty WiFi. Supabase Realtime reconnects automatically in most cases, but there is a window where changes are missed. Add a "last synced" indicator and a manual refresh button. Do not rely on Realtime as the sole source of truth for count data.

**Count derivation logic:**
The count of "active subscriptions for dorm X on date Y" is a non-trivial query. It must exclude paused, skipped, and ended subscriptions. The existing `subscriptions` table + `skipped_dates` / `paused_dates` arrays encode this correctly (the state machine migration is solid). But the query that materializes "today's count per dorm" must join correctly — especially the `7DAYS` vs `6DAYS` vs `5DAYS` week type logic. A customer with a `5DAYS` subscription does not get Saturday delivery. The kitchen count for Saturday must exclude them. Test this on a Saturday in staging explicitly before launch.

**Count mismatch between kitchen and rider:**
The kitchen display counts expected deliveries at prep time (e.g., 10 AM). The rider's count is expected deliveries at pickup time (e.g., 5 PM). If any skips happen between 10 AM and 2 PM, these numbers diverge. The triple-match should use the SAME count source at BOTH steps: derive "expected count for dorm X on date Y" fresh at the moment the rider marks pickup, not from a pre-baked kitchen display value.

---

### UAE Timezone Pitfalls

Dubai is UTC+4, no DST, forever. This makes it safer than most timezones, but there are still failure modes:

**The 2 PM cutoff in UTC:**
2 PM UAE = 10:00 UTC. A cron job or server check for "has the 2 PM cutoff passed?" must compare against UTC 10:00. The existing `dubai-day.ts` encodes `9 AM AE = 5 AM UTC`. Follow the same pattern: define `AE_2PM_UTC_HOUR = 10` as a named constant and use it everywhere the cutoff is evaluated. Do NOT inline `new Date().getHours() < 14` — `getHours()` returns local time on the server, which is UTC on Netlify, not UTC+4.

**Date boundary confusion:**
The most common UAE timezone bug: a customer skips a meal at 11:30 PM UAE on Sunday (= 7:30 PM UTC on Sunday). The `subscription_status_tick` cron may process this on "Monday UTC" but "Sunday AE". Determine once which date system the system uses as the canonical "delivery date" — AE wall date — and convert all server-side timestamps to AE before comparing. The `dubai-day.ts` helper does this correctly via `T05:00:00Z` encoding. Use it, don't reinvent.

**pg_cron and ae_today():**
The live DB has a custom `ae_today()` function (noted in project memory as drifted from repo). Before building the failsafe cron, verify what `ae_today()` actually returns in production via MCP: `SELECT ae_today(), now(), now() AT TIME ZONE 'Asia/Dubai'`. These should all agree on the current AE date. If the function is stale (the memory warns it may be), rewrite it in the new migration rather than calling the old one.

**"Tomorrow" and "yesterday" in server actions:**
Server actions (Next.js) run in UTC. When a customer's dashboard shows "skip tomorrow", the Next.js action computes "tomorrow's AE date" by adding 1 day to `ae_today_offset()`. This is already handled correctly in existing code. For the kitchen/ops context: if a delivery is scheduled for "today AE" and you evaluate it at 1 AM UTC (= 5 AM AE), you are one day behind in UTC. Always compute AE date by adding 4 hours to UTC before extracting the date component: `new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)`. This exact pattern appears in `src/app/api/chat/route.ts` — copy it.

**The 8 PM failsafe fires at 4 PM UTC:**
Double-check that the pg_cron schedule `0 16 * * *` is actually what gets inserted. pg_cron itself does not enforce timezone; it fires at UTC times. Verify the job with `SELECT * FROM cron.job WHERE jobname = 'delivery_failsafe'` after insertion.

---

## Critical Risks

These are the five things most likely to cause a real operational failure on the first day of use:

**1. Gemini returns wrong box count, nobody notices until a customer complains.**
The triple-match logic can pass with Gemini off-by-one if rider and Gemini both count incorrectly in the same direction. This is not detectable in real time. Mitigation: log all three counts (expected, rider, gemini) to the delivery record regardless of whether they match. Build an admin view of these logs so you can spot systematic errors (e.g., Gemini always undercounts by 1 for a specific dorm).

**2. iOS camera permission denied silently breaks the photo flow.**
If a rider taps "allow" once then revokes permission from Settings, the `getUserMedia` call throws `NotAllowedError` with no UI explanation. The rider has no idea why the camera isn't working. Always catch `NotAllowedError` and show a specific instruction screen: "Camera access was denied. Go to Settings > Safari > Camera > Allow for dormers.ae."

**3. WhatsApp inbound webhook processes the same message twice (retry).**
Meta retries if the endpoint takes >20 seconds. A fuzzy match + Gemini call can easily exceed that. The result: the delivery is marked confirmed twice, sending two WhatsApp messages to the customer. Implement message-ID-based deduplication in the webhook handler immediately — this is critical from day one.

**4. pg_cron failsafe fires at the wrong time due to UTC/UAE confusion.**
A `0 20 * * *` schedule (wrong: 8 PM UTC = midnight UAE) vs `0 16 * * *` (correct: 8 PM UAE) is an easy typo. Verify via MCP: `SELECT jobname, schedule FROM cron.job WHERE jobname = 'delivery_failsafe'` after creating the job, and manually confirm the next scheduled run time.

**5. Secret token appears in Netlify server logs.**
Tokens in the URL path appear in access logs that Netlify retains. On the free tier, these logs are accessible to anyone with deploy access. Rotate tokens after testing and before inviting any kitchen staff or riders. Add a token rotation button to the admin panel in the first iteration.

---

## Mitigation Strategies

**For AI Vision counting:**
- Compress and resize photos client-side before sending (max 1600px, JPEG 85)
- Instruct riders in-app to lay boxes flat and spread them before photographing
- Store `{ expected_count, rider_count, gemini_count, gemini_raw_response }` in every delivery record — treat the log as source of truth for auditing
- Never auto-complete a delivery if `gemini_count` is `null` (timeout) — require rider to manually confirm
- Use the same defensive JSON parse + fence-strip pattern from `google-review-verify.ts`

**For mobile camera:**
- Use `getUserMedia` as the primary capture path (not `<input capture>`) to handle PWA home-screen installs correctly
- Catch `NotAllowedError` and show iOS-specific Settings instructions
- Listen for `visibilitychange` and restart the stream when the tab returns to foreground
- Call `stream.getTracks().forEach(t => t.stop())` on unmount — always

**For secret tokens:**
- Generate tokens server-side with `crypto.randomBytes(32).toString('hex')`
- Add `<meta name="referrer" content="no-referrer">` to ops/kitchen page layouts
- Add token rotation to admin panel from day one
- Store tokens in Supabase vault, not env vars

**For WhatsApp webhooks:**
- Return HTTP 200 before any async processing
- Deduplicate on WhatsApp message ID (`messages[0].id`) using a `processed_message_ids` table or an `upsert` with a unique constraint
- Use conservative fuzzy match threshold and always confirm ambiguous dorm names before proceeding

**For UAE timezone:**
- Copy the `new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)` pattern from `chat/route.ts` for all AE date computation in server code
- Define `AE_2PM_UTC_HOUR = 10` as a named constant
- Comment every pg_cron schedule with its AE equivalent
- Verify `ae_today()` in production via MCP before using it in new functions

**For pg_cron:**
- After inserting the failsafe cron, immediately verify with `SELECT * FROM cron.job WHERE jobname = 'delivery_failsafe'`
- Check `cron.job_run_details` after the first scheduled run
- Make the failsafe function idempotent — calling it twice in the same window must not send duplicate alerts

---

## Sources

- `/Users/SaadHazari/1Projects/developr/Dormers-Production/src/contexts/dorm-wars/domain/google-review-verify.ts` — existing Gemini Vision usage patterns, defensive JSON parse, timeout handling, confidence model
- `/Users/SaadHazari/1Projects/developr/Dormers-Production/src/infra/meta-whatsapp/client.ts` — WhatsApp template sending, locale pitfalls (`en` vs `en_AE`), template category rules
- `/Users/SaadHazari/1Projects/developr/Dormers-Production/src/shared/time/dubai-day.ts` — UAE timezone helpers, `T05:00:00Z` encoding convention
- `/Users/SaadHazari/1Projects/developr/Dormers-Production/src/app/api/chat/route.ts` — `Date.now() + 4 * 60 * 60 * 1000` pattern for server-side AE time
- `/Users/SaadHazari/1Projects/developr/Dormers-Production/supabase/migrations/20260525_customer_notifications_dispatcher.sql` — `FOR UPDATE SKIP LOCKED`, pg_net HTTP calls, vault secret reads from pg_cron functions
- `/Users/SaadHazari/1Projects/developr/Dormers-Production/.planning/supabase-region-migration.md` — pg_cron jobs NOT in dump, 16 existing crons, `ae_today()` drift warning, explicit GRANTs requirement
- Project memory: `[Repo SQL migrations are STALE vs the live DB]`, `[Use Supabase MCP for everything Supabase]`, `[Live Supabase = Dormers-Ohio]`
- MDN Web Docs (training knowledge): `getUserMedia` iOS constraints, `ImageCapture` API browser support, geolocation API accuracy options, `visibilitychange` event
- Meta WhatsApp Cloud API docs (training knowledge): webhook verification flow, payload structure, retry behavior, message type enumeration

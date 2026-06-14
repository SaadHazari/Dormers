# Stack Research — Ops Interfaces v2.0

**Researched:** 2026-06-14
**Confidence:** HIGH for Gemini/SDK (verified against installed packages); HIGH for browser APIs (stable web platform specs); MEDIUM for PWA/Next.js 15 (no web access, cross-referenced against known Next.js 15 App Router patterns); MEDIUM for WhatsApp inbound webhook (existing outbound client verified, inbound documented by Meta but not yet implemented in this repo).

---

## Summary

The existing stack already contains `@ai-sdk/google` v3.0.80 and `ai` v6.0.191, with a proven multimodal Gemini Vision pipeline (`google-review-verify.ts`) and a Supabase Storage upload pattern (`review-screenshots` bucket). The only genuinely new surface is PWA manifest/service-worker plumbing, a WhatsApp inbound webhook handler, and two new DB tables. No new core runtime dependencies are required — every capability can be composed from what is already installed.

---

## Findings

### PWA Setup

**Goal:** Allow the kitchen display and rider PWA to be "Add to Home Screen" on iOS Safari and Android Chrome so they behave like native apps (full-screen, no browser chrome).

**What Next.js 15 App Router provides natively:**

Next.js 15 supports a `manifest.ts` (or `manifest.json`) file placed at `src/app/manifest.ts`. This is a Route Handler that returns a `MetadataRoute.Manifest` object, which Next.js automatically serves at `/manifest.webmanifest`. No package is needed.

```ts
// src/app/manifest.ts (new file)
import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dormers Ops',
    short_name: 'Dormers Ops',
    description: 'Kitchen display and rider delivery tool',
    start_url: '/',
    display: 'standalone',
    background_color: '#091825',
    theme_color: '#091825',
    icons: [
      { src: '/icon.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
```

The `/icon.png` already exists in `public/`. A 512x512 maskable variant is the only missing asset.

**Service worker:**

For these ops pages, a service worker is NOT required for the core use case. "Add to Home Screen" (A2HS) works with just the manifest + HTTPS — no service worker is mandatory for standalone display mode on Android. On iOS Safari, A2HS also works without a service worker.

A service worker would only add value for offline caching (recipe PDFs) or background sync. That is a Phase 2 concern. Recommend skipping it in v2.0 to avoid the complexity of Workbox integration with Next.js 15's App Router.

**`<link rel="manifest">` injection:**

Next.js auto-injects the manifest link tag when `src/app/manifest.ts` exists. No manual head tag needed.

**iOS-specific meta tags:**

iOS Safari requires specific meta tags for full-screen behaviour. These go in the layout for the `/kitchen` and `/ops` routes:

```tsx
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Dormers Ops" />
```

**Confidence:** MEDIUM — Next.js 15 manifest API verified from TypeScript types; iOS meta tag requirements are stable web platform behaviour.

---

### Gemini Vision API

**Installed SDK:** `@ai-sdk/google` v3.0.80 with Vercel AI SDK `ai` v6.0.191. The `google()` provider factory and `generateText` are what this repo already uses.

**Available models (from installed TypeScript types `GoogleGenerativeAIModelId`):**

The installed version exposes these stable multimodal models:
- `gemini-2.5-flash` — best cost/speed tradeoff for vision tasks, HIGH multimodal capability
- `gemini-2.5-pro` — slower and more expensive, not needed for box counting
- `gemini-2.0-flash` — older generation, still capable
- `gemini-3.5-flash` — newest generation listed (use with caution — verify availability in Google AI Studio before shipping)

**Recommendation: use `gemini-2.5-flash`** for box counting. This is the same generation as what the repo's existing code targets (the codebase uses `gemini-3.1-flash-lite` string literals in the chat route, which resolves to flash-lite via the SDK's model alias system). For image analysis where accuracy matters, `gemini-2.5-flash` is the right tier — flash-lite is lower quality.

Note: the existing `google-review-verify.ts` file calls `google('gemini-3.1-flash-lite')` — this is a string alias that resolves to a real model through `@ai-sdk/google`. The SDK accepts both the canonical `gemini-2.x-flash` names and `(string & {})` passthrough aliases.

**Calling pattern — already proven in this codebase:**

```ts
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

const result = await generateText({
  model: google('gemini-2.5-flash'),
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image', image: imageBytes, mediaType: 'image/jpeg' },
    ],
  }],
  abortSignal: AbortSignal.timeout(45_000),
})
```

**Prompt engineering for box counting:**

The key insight from the existing `google-review-verify.ts` is: ask for JSON-only output, be explicit about the output schema, and use a defensive parse with a safe default. For box counting:

```
You are counting meal boxes in a delivery photo.
Output ONLY a JSON object with no commentary:
{
  "box_count": number,
  "confidence": "high" | "medium" | "low",
  "notes": string
}

Count visible delivery boxes/bags. If boxes overlap, count each stack as one.
If you cannot clearly see boxes, return confidence: "low" and box_count: 0.
Output JSON only. No code fences. No extra text.
```

**Image input:** The rider will capture via `<input type="file" accept="image/*" capture="environment">` (see Camera section). The file arrives as a FormData upload; convert to `Uint8Array` via `file.arrayBuffer()`. The existing `review-screenshots` upload code demonstrates this pattern exactly.

**maxDuration:** Set `export const maxDuration = 60` on the route handler, same as the existing Google review route.

**Confidence:** HIGH — SDK version, model IDs, and calling pattern verified against installed package types and existing codebase usage.

---

### Camera Capture

**Goal:** Rider takes a photo of the delivered boxes; the image is sent to the Gemini Vision API for box counting.

**Two browser options:**

**Option A — `<input type="file" accept="image/*" capture="environment">` (recommended)**

This is the simplest approach and the most reliable on iOS. The `capture="environment"` attribute opens the rear camera directly on mobile without requiring any JS camera API. The file lands as a `File` object in the input's `change` event.

```tsx
<input
  type="file"
  accept="image/jpeg,image/png,image/webp"
  capture="environment"
  onChange={(e) => {
    const file = e.target.files?.[0]
    if (file) handlePhoto(file)
  }}
/>
```

Advantages: works on iOS Safari without any permissions prompt flow; no JS MediaDevices API needed; images are JPEG from the camera, which Gemini handles natively; consistent with how the Dorm Wars Google review screenshot upload works.

Disadvantages: cannot show a camera preview before capture; cannot add an overlay/crosshair UI.

**Option B — `navigator.mediaDevices.getUserMedia`**

Allows a live viewfinder with a capture button overlay. Requires explicit permission grant on every session (no persistent grant on iOS). More code, more failure modes, worse UX on low-end Android. Avoid unless the product needs a live preview.

**Recommendation: Option A (file input with `capture="environment"`)** for v2.0. The rider flow is "tap, shoot, confirm" — a live viewfinder adds no value and significant complexity.

**HEIC on iOS:** iOS saves camera photos as HEIC by default. When using `<input capture>`, iOS converts to JPEG before handing the File object to the browser, so HEIC never reaches the app. This is handled transparently.

**Confidence:** HIGH — file input `capture` attribute is a stable HTML spec; iOS JPEG conversion behaviour is documented and well-established.

---

### WhatsApp Inbound Webhook

**Goal:** Rider texts the dorm name via WhatsApp; the system interprets the message and queues a pickup action.

**What already exists:** `src/infra/meta-whatsapp/client.ts` handles outbound messages. `src/app/api/webhook/route.ts` exists for Stripe. The WhatsApp API routes (`/api/whatsapp/check`, `/api/whatsapp/start`) handle OTP flows. There is no existing inbound WhatsApp handler.

**What needs to be built:**

A new route at `/api/whatsapp/inbound/route.ts` that handles both:
1. `GET` — Meta webhook verification (one-time setup handshake)
2. `POST` — Incoming message events

**GET verification:**
Meta sends a `hub.mode=subscribe`, `hub.challenge`, and `hub.verify_token` query parameter. The handler must return the `hub.challenge` value as a plain text response when `hub.verify_token` matches a secret stored in env vars (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`).

```ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}
```

**POST message parsing:**
Meta sends a JSON body. The structure is `body.entry[0].changes[0].value.messages[0]` for a text message. The payload includes the sender's phone number, message type, and text body.

```ts
// Typical inbound message shape (text)
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "971504619384",   // sender phone, no +
          "type": "text",
          "text": { "body": "Yugo" }
        }],
        "contacts": [{ "wa_id": "971504619384", "profile": { "name": "Ahmed" } }]
      }
    }]
  }]
}
```

**Security:** Meta signs the POST body with HMAC-SHA256 using the App Secret. The signature is in the `X-Hub-Signature-256` header as `sha256=<hex>`. Verify before processing. Pattern:

```ts
const sig = req.headers.get('x-hub-signature-256')?.replace('sha256=', '') ?? ''
const body = await req.text()
const expected = createHmac('sha256', process.env.WHATSAPP_APP_SECRET!).update(body).digest('hex')
if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return 401
```

Node's `crypto.createHmac` is available in Next.js server runtime (Node 20). The existing `timingSafeCompare` utility in `src/shared/crypto.ts` can be reused.

**Required new env vars:**
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — a random string you set; also configured in Meta App Dashboard
- `WHATSAPP_APP_SECRET` — from Meta App Dashboard > App Settings > Basic > App Secret

**Meta App Dashboard setup:**
In the Meta for Developers console, under WhatsApp > Configuration > Webhooks, set the Callback URL to `https://dormers.ae/api/whatsapp/inbound` and the Verify Token to the env value. Subscribe to the `messages` field.

**Status 200 contract:** Meta requires a 200 response within 20 seconds, or it retries. Keep the handler lean — queue the message to a DB table and respond 200 immediately; process async.

**Confidence:** MEDIUM — Meta webhook structure is documented and stable; the HMAC verification pattern is standard. Not verified against current Meta documentation due to web access restrictions.

---

### Geolocation API

**Goal:** Capture rider's GPS coordinates at pickup and drop-off for chain-of-custody logging.

**Browser API:**

```ts
navigator.geolocation.getCurrentPosition(
  (pos) => {
    const { latitude, longitude, accuracy } = pos.coords
    // accuracy in metres; log if > 50m (GPS unreliable indoors)
  },
  (err) => {
    // err.code: 1=PERMISSION_DENIED, 2=UNAVAILABLE, 3=TIMEOUT
    // Treat as non-blocking — log "location unavailable", don't block the action
  },
  { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
)
```

**iOS behaviour:** iOS Safari requires HTTPS (already satisfied by Netlify). The permission prompt fires on first use. On subsequent visits to the same origin, the browser remembers the grant. Inside a PWA (standalone display mode), the permission persists across sessions — this is a key reason to use A2HS.

**Important:** geolocation must be called from a user gesture context on iOS 17+ (tap, not automatically on page load). Trigger it when the rider taps "Confirm Pickup" or "Confirm Drop-off".

**Accuracy in UAE dorms:** Indoor accuracy varies 10–50m. Log the `accuracy` value. Do not block the flow on inaccurate readings — the photo is the primary verification mechanism; GPS is supplementary audit data.

**No package needed.** `navigator.geolocation` is a browser built-in.

**Confidence:** HIGH — stable web platform API, iOS/Android behaviour well-documented.

---

### New Dependencies

| Package | Version | Purpose | Status |
|---------|---------|---------|--------|
| none needed | — | All capabilities covered by existing `@ai-sdk/google`, `ai`, `@supabase/supabase-js`, and browser built-ins | — |

**What you do NOT need to install:**
- `next-pwa` or `@ducanh2912/next-pwa` — Next.js 15 handles manifest natively; no service worker needed for v2.0
- `workbox-*` — no offline caching needed for v2.0
- `@google-cloud/vision` — redundant with the Vercel AI SDK already installed
- Any camera library — `<input capture>` is sufficient

**One optional package worth evaluating (not required):**
- `idb` (IndexedDB wrapper) — only if you want to queue failed uploads locally and retry when online. Skip for v2.0.

**Confidence:** HIGH — package.json fully audited; all needed APIs verified present.

---

### Supabase Storage

**What already exists:** The `review-screenshots` bucket is live. The upload pattern in `/api/dorm-wars/layer4/google-review/route.ts` is the exact template to reuse:

```ts
const bytes = new Uint8Array(await file.arrayBuffer())
const { error: uploadErr } = await admin.storage
  .from('delivery-photos')  // new bucket — needs to be created
  .upload(`${orderId}/${timestamp}.jpg`, bytes, {
    contentType: 'image/jpeg',
    upsert: false,  // never overwrite; each delivery event is unique
  })
```

**New bucket needed:** `delivery-photos` — stores rider drop-off photos keyed by `{order_id}/{timestamp}.jpg` or `{subscription_id}/{date}/{rider_id}.jpg`. Must be private (no public access). Admin panel and the Gemini call both read via the service-role client.

**Bucket creation:** via Supabase MCP, not migration SQL (per project convention). Set `public: false`, file size limit 5 MB (same as review-screenshots), allowed MIME types: `image/jpeg,image/png,image/webp`.

**Photo lifecycle:** Photos are audit records. Retain indefinitely (or 90 days — decide before building). Do not add lifecycle/expiry in v2.0.

**Path convention:**

```
delivery-photos/
  {subscription_id}/
    {date_ae}/          e.g. 2026-06-14
      pickup.jpg
      dropoff.jpg
```

Using `subscription_id/date_ae/` makes it easy to pull all photos for a given delivery day from the admin panel.

**Public URL:** Not needed. The admin panel reads via signed URLs or the service-role client's `storage.from().download()`. Do not make this bucket public.

**Confidence:** HIGH — bucket upload pattern verified from existing codebase; path convention is a design decision, not a technical unknown.

---

## Recommendations

**1. Model choice for box counting:** Use `gemini-2.5-flash` — it is the stable, non-preview multimodal model in the installed SDK. Avoid `gemini-2.5-flash-image` (image generation, not analysis) and the `gemini-3.x` preview aliases until Google makes them GA.

**2. PWA approach:** A `manifest.ts` file + iOS meta tags in a shared layout for `/kitchen/[token]` and `/ops/[token]`. No service worker. No new package. This gives "Add to Home Screen" on both platforms with zero bundle impact.

**3. WhatsApp inbound webhook:** Build a new `/api/whatsapp/inbound` route. Keep it thin — validate HMAC, extract the message text and sender phone, insert a row to a `rider_messages` table, return 200 within 5 seconds. A separate background process or the existing pg_cron pattern handles the actual dorm-name parsing and order lookup.

**4. Camera capture:** Use `<input type="file" capture="environment">` only. No getUserMedia. Wrap it in a styled button ("Take Photo") so the file input is hidden. The `onChange` handler converts to `Uint8Array` and POSTs to the verification API.

**5. Supabase Storage:** Create one new `delivery-photos` bucket (private). Reuse the exact upload pattern from the Google review route. Path: `{subscription_id}/{date_ae}/dropoff.jpg`.

**6. Geolocation:** Non-blocking. Capture on the user gesture that confirms drop-off. Log to the delivery_events table alongside the photo path and Gemini box count. Never block the rider action on a GPS failure.

**7. New env vars needed:**
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — a random 32-character string you generate
- `WHATSAPP_APP_SECRET` — from Meta App Dashboard

**8. Netlify function timeout:** All routes that call Gemini Vision need `export const maxDuration = 60`. The existing Google review route already uses this. Apply the same to the drop-off verification route.

---

## Sources

All findings verified from local codebase analysis:

- Installed package types: `/node_modules/@ai-sdk/google/dist/index.d.ts` — confirms model IDs including `gemini-2.5-flash`
- Installed package README: `/node_modules/@ai-sdk/google/README.md` — confirms SDK usage pattern
- Existing Gemini Vision pipeline: `src/contexts/dorm-wars/domain/google-review-verify.ts`
- Existing Supabase Storage upload: `src/app/api/dorm-wars/layer4/google-review/route.ts`
- Existing WhatsApp outbound client: `src/infra/meta-whatsapp/client.ts`
- Existing internal webhook auth pattern: `src/app/api/internal/start-day-email-send/route.ts`
- Existing notification queue: `src/contexts/notifications/usecases/queue.ts`
- Dorm shape map (for rider buttons): `src/app/admin/labels/dorm-shapes.ts`
- Next.js 15 config: `next.config.ts`, `package.json`
- Netlify config: `netlify.toml`
- Meta WhatsApp Cloud API inbound webhook structure: training data (MEDIUM confidence — verify against Meta docs before shipping the HMAC verification code)

# Phase 5: Rider Page — Drop-off & Verification — Research

**Researched:** 2026-06-15
**Domain:** Mobile camera capture, Gemini Vision box counting, Supabase Storage, triple-match verification flow, WhatsApp admin escalation
**Confidence:** HIGH — all key findings verified directly from the live codebase, installed packages, and existing migration SQL

---

## Summary

Phase 5 adds the drop-off flow inside the existing `RiderClient.tsx`. After "Confirm Pickup" transitions buttons to "Ready for drop-off" state, tapping a dorm button opens a camera view, the rider takes a photo and enters a count, and the app hits `/api/ops/verify-box-count` which: uploads the photo to the `delivery-photos` Supabase Storage bucket, calls Gemini to count boxes independently, then runs the triple-match check. On match, a large green tick shows for 1.5–2s. On mismatch, `notifyAdmin` fires with all three counts and the photo path. All outcomes UPDATE the existing `delivery_events` row (created by Phase 4's `confirmPickup`).

The biggest cross-cutting concern is the camera path on iOS. The `delivery_events` table also needs one new migration: adding `geo_lat` and `geo_lng` columns to satisfy VER-13's geolocation requirement (the Phase 2 migration did not include them). Everything else — the Gemini SDK, the Supabase admin client, the `notifyAdmin` helper — is already wired and proven in this codebase.

**Primary recommendation:** Extend `RiderClient.tsx` with a per-dorm modal flow using `getUserMedia` as the primary camera path (with `<input capture>` fallback), POST multipart to a new API route at `/api/ops/verify-box-count`, and use the `verifyReviewScreenshot` architecture from `google-review-verify.ts` as the exact template for the Gemini box-count call.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VER-01 | At dorm, rider taps dorm button → camera opens → takes photo of boxes | getUserMedia primary path; <input capture> fallback; trigger from button tap per iOS requirement |
| VER-02 | Camera uses getUserMedia as primary with <input capture> fallback | Confirmed: STATE.md locked decision; PITFALLS.md explains iOS PWA breakage with capture-only |
| VER-03 | Photo resized client-side to max 1600px / JPEG 85 before upload | Canvas resize pattern; no library needed; draw into offscreen canvas + toBlob |
| VER-04 | Photo uploaded to private delivery-photos Supabase bucket via server-side API route | Bucket needs creation; upload pattern from google-review route is exact template |
| VER-05 | Rider enters box count manually | Number input, disabled until photo taken |
| VER-06 | Gemini gemini-2.5-flash returns { count, confidence, reason, imageQuality } | SDK v3.0.80 has gemini-2.5-flash in type defs; generateText pattern proven; prompt engineering researched |
| VER-07 | Triple match → large green tick animation 1.5–2s → auto-confirm | UPDATE delivery_events verified=true; UI animation with CSS keyframes |
| VER-08 | Count mismatch → owner WhatsApp via notifyAdmin | notifyAdmin at src/infra/admin-alerts/notify.ts; 950-char body cap; include photo path in message |
| VER-09 | Low Gemini confidence / bad imageQuality → "Retake photo" prompt | retakeCount state, second fail escalates |
| VER-10 | Second unclear photo → escalates to owner | Same notifyAdmin path as VER-08 |
| VER-11 | Gemini timeout (null count) → manual confirmation, never auto-completes | AbortSignal.timeout(45_000); null count → manual confirm button instead of auto-verify |
| VER-12 | Submit disabled until photo + non-zero count | UI state: photo !== null && count > 0 |
| VER-13 | Data trail: who, when, geolocation, expected_count, rider_count, gemini_count, photo_path | delivery_events needs geo_lat + geo_lng migration; navigator.geolocation is browser built-in |
| ARC-03 | Gemini box count verification in API route with maxDuration = 60 (not server action) | Confirmed: server actions have no timeout control; API route + maxDuration = 60 is the pattern |

</phase_requirements>

---

## Standard Stack

### Core — All Already Installed

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@ai-sdk/google` | 3.0.80 (installed) | Gemini Vision for box counting | Already powers google-review-verify.ts; gemini-2.5-flash in type defs |
| `ai` | 6.0.191 (installed) | `generateText` function | Already used for all AI calls in this repo |
| `@supabase/supabase-js` | ^2.103.3 | Storage upload + delivery_events UPDATE | Already used; admin-client.ts is the pattern |
| `navigator.mediaDevices.getUserMedia` | Browser built-in | Primary camera path | No package; works in both browser + iOS PWA home-screen |
| `navigator.geolocation` | Browser built-in | GPS coords for audit trail | No package; standard web API |
| Canvas API | Browser built-in | Client-side image resize to 1600px / JPEG 85 | No package; draw + toBlob pattern |

### No New npm Packages Required

The entire phase can be built from existing installed packages and browser built-ins. Confirmed by auditing `package.json` against all phase requirements.

---

## Architecture Patterns

### Recommended Structure

New files for Phase 5:

```
src/
├── app/
│   ├── ops/[token]/
│   │   ├── RiderClient.tsx          ← EXTEND: add drop-off modal flow
│   │   └── actions.ts               ← EXTEND: add confirmDropoff (for manual path only)
│   └── api/ops/
│       └── verify-box-count/
│           └── route.ts             ← NEW: multipart handler; Gemini + storage + DB UPDATE
├── contexts/ops/
│   ├── domain/
│   │   └── box-count-verify.ts      ← NEW: Gemini box-count call (pure domain, same pattern as google-review-verify.ts)
│   └── usecases/
│       └── update-delivery-event.ts ← NEW: UPDATE delivery_events with rider+gemini counts + verified flag
```

Migration needed (one new file):

```
supabase/migrations/
└── 20260615_delivery_events_geolocation.sql  ← NEW: ADD COLUMN geo_lat, geo_lng
```

Supabase bucket needed (via MCP, not migration):

```
delivery-photos  (private, 5MB limit, jpeg/png/webp)
```

### Pattern 1: Gemini Box Count Domain Function

Exact same structure as `src/contexts/dorm-wars/domain/google-review-verify.ts`:

```typescript
// src/contexts/ops/domain/box-count-verify.ts
// Zero imports from infra/supabase — pure domain function
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

export interface BoxCountResult {
  count: number | null      // null = could not count (timeout or image unclear)
  confidence: 'high' | 'medium' | 'low'
  reason: string
  imageQuality: 'clear' | 'unclear'
}

export async function verifyBoxCount(
  imageBytes: Uint8Array,
  mimeType: string,
  expectedCount: number,
): Promise<BoxCountResult> {
  // ...
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: buildPrompt(expectedCount) },
        { type: 'image', image: imageBytes, mediaType: mimeType },
      ],
    }],
    abortSignal: AbortSignal.timeout(45_000),
  })
  // defensive parse — same fence-strip pattern as google-review-verify.ts
}
```

Key prompt elements (do not simplify):
- Ask for JSON-only output with explicit schema: `{ "count": number | null, "confidence": "high"|"medium"|"low", "reason": string, "imageQuality": "clear"|"unclear" }`
- Provide the expected count as context: "The rider says there should be N boxes"
- Instruct: "return count: null if the image is too dark, blurry, or obscured to count confidently"
- Ask it to count ALL visible boxes including partially hidden ones
- Defensive parse: strip ``` fences, parseInt the count, coerce confidence to union

### Pattern 2: API Route Structure

```typescript
// src/app/api/ops/verify-box-count/route.ts
export const maxDuration = 60    // ARC-03 requirement
export const runtime = 'nodejs'  // Gemini SDK needs Node

export async function POST(req: Request) {
  // 1. Parse multipart: photo (File) + dormName (string) + riderCount (number)
  //    + opsToken (string for auth) + deliveryDateIso
  // 2. Validate opsToken via validateOpsToken (same as page.tsx)
  // 3. Resize check: image should already be ≤1600px from client — trust but log size
  // 4. Upload to delivery-photos bucket: path = {date}/{dormName}/trip-1.jpg
  // 5. Call verifyBoxCount with imageBytes
  // 6. Look up expected_count from existing delivery_events row
  // 7. Run triple-match logic
  // 8. UPDATE delivery_events: rider_count, gemini_count, gemini_confidence,
  //    photo_path, verified, confirmed_at, geo_lat, geo_lng
  // 9. If mismatch or Gemini unclear → notifyAdmin
  // 10. Return { verified, geminiCount, needsRetake, needsManualConfirm }
}
```

### Pattern 3: Client-Side Image Resize

```typescript
// Inside RiderClient.tsx — resize before upload, no library needed
async function resizeToJpeg(file: File, maxPx = 1600, quality = 0.85): Promise<Blob> {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = new OffscreenCanvas(w, h)
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return canvas.convertToBlob({ type: 'image/jpeg', quality })
}
```

Note: `OffscreenCanvas` is available in all modern mobile browsers and is the recommended approach for off-thread image processing. Falls back to regular `<canvas>` if needed.

### Pattern 4: Camera Flow in RiderClient

```typescript
// getUserMedia primary, input capture fallback
async function openCamera(dormKey: string) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    })
    // show <video> element with stream; provide shutter button
    // on shutter: draw video frame to canvas, capture blob
    setActiveCamera({ dormKey, stream })
  } catch (err) {
    // NotAllowedError or API unavailable → fall back to file input
    fileInputRef.current?.click()
  }
}

// Always stop tracks on modal close/unmount
function stopCamera() {
  activeCamera?.stream.getTracks().forEach(t => t.stop())
  setActiveCamera(null)
}
```

Critical: listen for `visibilitychange` to restart the stream if iOS kills it when the screen locks.

### Pattern 5: Delivery Event UPDATE

The Phase 4 `confirmPickup` action already created the row with `verified: false`. Phase 5 UPDATES it (never inserts a new row):

```typescript
await sb.from('delivery_events').update({
  rider_count:        riderCount,
  gemini_count:       geminiResult.count,
  gemini_confidence:  geminiResult.confidence,
  photo_path:         storagePath,
  verified:           isTripleMatch,
  confirmed_at:       isTripleMatch ? new Date().toISOString() : null,
  geo_lat:            geo?.lat ?? null,
  geo_lng:            geo?.lng ?? null,
}).eq('delivery_date', deliveryDateIso)
  .eq('dorm_name', dormName)
  .eq('trip_number', 1)
```

The `isTripleMatch` helper already exists in `src/contexts/ops/domain/delivery-event.ts`.

### Pattern 6: notifyAdmin Escalation

`notifyAdmin` accepts up to 950 chars. For a mismatch alert, pack everything into the message body since the button text is limited to a short anchor:

```typescript
// Count mismatch or second unclear photo
void notifyAdmin(
  `⚠️ DELIVERY MISMATCH — ${dormName}\n` +
  `Expected: ${expectedCount} | Rider: ${riderCount} | Gemini: ${geminiCount ?? '?'}\n` +
  `Photo: ${photoPath}\n` +
  `Date: ${deliveryDateIso}`,
  dormName.slice(0, 20),  // button_text cap
)
```

The RPC template body is "Boss, Check this out: {{escalation}}" — the `p_message` fills `{{escalation}}`. The photo path is not a clickable link in the template but the owner can look it up in Supabase Storage. Alternatively, the planner may choose to include a signed URL — the `createSignedUrl` pattern is in `src/app/api/admin/labels/share/route.ts`.

### UI State Machine for Drop-off Modal

Each dorm button in drop-off state has its own state. One modal handles one dorm at a time:

```
IDLE (ready for drop-off)
  → tap dorm button
CAMERA_OPEN (getUserMedia stream active)
  → shutter tap
PHOTO_TAKEN (blob captured, showing preview)
  → rider enters count (>0)
READY_TO_SUBMIT (photo + count both set)
  → tap Submit
SUBMITTING (POST in flight)
  → success + triple match
VERIFIED (green tick, 1.5–2s)
  → auto-dismiss
  → dorm button shows ✓ in "Delivered" state
SUBMITTING
  → Gemini says unclear (imageQuality = 'unclear')
RETAKE_1 (first retake prompt)
  → rider retakes photo
  → still unclear
RETAKE_ESCALATED (second fail → notifyAdmin fired)
  → dorm button shows ⚠ "Escalated"
SUBMITTING
  → count mismatch
MISMATCH_ESCALATED (notifyAdmin fired with counts)
  → dorm button shows ⚠ "Mismatch"
SUBMITTING
  → Gemini returns null count (timeout)
MANUAL_CONFIRM (rider manually confirms delivery)
  → tap "Confirm Delivery"
  → UPDATE delivery_events with rider_count, gemini_count=null, verified=false
  → dorm shows ⚋ "Manually confirmed"
```

### Anti-Patterns to Avoid

- **Never use a Server Action for the Gemini call.** Server actions have no `maxDuration` control — the Netlify default 10s limit kills the call before Gemini responds. API routes with `export const maxDuration = 60` are the correct path (ARC-03).
- **Never auto-confirm on Gemini timeout.** Requirements say null count must never auto-complete (VER-11). The rider must tap a manual confirm button.
- **Never resize server-side.** Image resize must happen client-side before upload (VER-03). The server receives the already-resized bytes.
- **Never block the delivery on GPS failure.** Geolocation is non-blocking audit data. If `navigator.geolocation` is denied, store `geo_lat: null, geo_lng: null` and proceed.
- **Never insert a second delivery_events row.** Phase 4's `confirmPickup` already created the row. Phase 5 UPDATEs it. Use `.update()` with `eq` filters matching the unique key.
- **Never mix background/backgroundImage shorthand in inline styles** (project memory rule). Use longhand pair `backgroundImage` / `backgroundColor` separately.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gemini Vision API client | Custom fetch to Google API | `generateText` from `ai` + `google()` from `@ai-sdk/google` | SDK handles auth, retry, streaming, abort |
| Image resize | Custom pixel-by-pixel JS | `OffscreenCanvas.convertToBlob()` | Browser-native, off-main-thread, zero deps |
| Admin WhatsApp alert | Direct Meta API call | `notifyAdmin()` from `@/infra/admin-alerts/notify` | Already routes through `send_admin_whatsapp_alert` RPC; handles vault secrets, 950-char cap |
| JSON parse from Gemini | Trust raw output | Defensive parse (strip fences, try/catch, normalise shape) | Gemini wraps JSON in fences despite instructions; integer vs string types drift |
| Triple-match check | Inline === comparison | `isTripleMatch()` from `@/contexts/ops/domain/delivery-event.ts` | Already defined and tested |
| Supabase upload | Custom S3 client | `adminClient.storage.from('delivery-photos').upload()` | Same pattern as review-screenshots bucket |

---

## Critical Schema Gap: Geolocation Columns Missing

The Phase 2 migration (`20260615_delivery_events_table.sql`) does NOT include `geo_lat` or `geo_lng` columns. VER-13 requires geolocation in the data trail. Phase 5 must include a migration to add these:

```sql
-- supabase/migrations/20260615_delivery_events_geolocation.sql
ALTER TABLE public.delivery_events
  ADD COLUMN IF NOT EXISTS geo_lat  double precision,
  ADD COLUMN IF NOT EXISTS geo_lng  double precision;

COMMENT ON COLUMN public.delivery_events.geo_lat IS
  'Rider GPS latitude at drop-off (nullable — may be denied/unavailable)';
COMMENT ON COLUMN public.delivery_events.geo_lng IS
  'Rider GPS longitude at drop-off (nullable — may be denied/unavailable)';
```

This is not in any existing migration. Verify live DB with MCP before assuming it exists.

---

## Critical Infrastructure: delivery-photos Bucket

The `delivery-photos` Supabase Storage bucket does NOT exist yet (not referenced anywhere in the codebase). Phase 5 must create it via MCP before the upload code can run:

- **Access:** Private (no public access)
- **File size limit:** 5 MB (matches review-screenshots)
- **Allowed MIME:** `image/jpeg, image/png, image/webp`
- **Path convention:** `{deliveryDateIso}/{dormName}/trip-1.jpg`
  - Example: `2026-06-15/KSK Homes/trip-1.jpg`
  - Rationale: makes it easy to pull all photos for a given day from admin audit panel in Phase 9

Storage upsert requires INSERT + SELECT + UPDATE policies (per Supabase skill note). Since `delivery-photos` uses service-role only, RLS can be enabled with no customer-facing policies — access only via `createAdminSupabaseClient()`.

---

## Common Pitfalls

### Pitfall 1: iOS PWA + <input capture> Opens Photo Library Instead of Camera

**What goes wrong:** If the rider has added the ops URL to their iPhone home screen (iOS PWA mode), `<input type="file" capture="environment">` opens the photo library chooser instead of the camera. The rider cannot take a live photo.

**Why it happens:** iOS PWA home-screen apps run in a pseudo-browser context that does not implement the `capture` attribute the same way as Safari browser tabs.

**How to avoid:** Use `getUserMedia` as primary. The flow: tap dorm button → call `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })` → show `<video>` element → shutter button captures via `canvas.drawImage(video)` → `canvas.toBlob()`. Only fall back to `<input capture>` if `getUserMedia` throws `NotAllowedError` or `NotFoundError`.

**Warning signs:** Testing only in Safari browser tab passes; testing from home-screen shortcut fails.

### Pitfall 2: iOS Kills getUserMedia Stream When Screen Locks

**What goes wrong:** Rider takes phone out of pocket, screen lock has killed the `getUserMedia` stream. Video element goes black. No automatic recovery.

**Why it happens:** iOS terminates media streams when the app goes to background.

**How to avoid:** Add a `visibilitychange` listener in the camera component. When `document.visibilityState === 'visible'`, re-call `getUserMedia` to restart the stream. Clean up the listener on component unmount.

### Pitfall 3: Gemini Returns String Integer or Null

**What goes wrong:** `gemini_count = "5"` (string) or `gemini_count = undefined` breaks the triple-match comparison.

**Why it happens:** LLM JSON output is not type-safe. Despite the prompt saying `"count": number`, the model sometimes outputs strings or omits the field.

**How to avoid:** In the normalise function: `const count = typeof raw.count === 'number' ? raw.count : typeof raw.count === 'string' ? parseInt(raw.count, 10) : null`. Check `isFinite(count)` before using.

### Pitfall 4: Memory Leak from Unstopped Camera Tracks

**What goes wrong:** Rider closes the modal or navigates away. The green camera indicator stays on. Battery drains. The next `getUserMedia` call may fail because the track is still held.

**Why it happens:** `MediaStreamTrack` holds camera hardware until explicitly stopped.

**How to avoid:** In a `useEffect` cleanup: `return () => stream?.getTracks().forEach(t => t.stop())`. Also call `stopCamera()` when the modal closes.

### Pitfall 5: UPDATE Hits Zero Rows (Row Not Found)

**What goes wrong:** The delivery_events UPDATE returns 0 rows affected silently. No error thrown, but the data is never written.

**Why it happens:** Phase 4's `confirmPickup` may not have run (rider refreshed page), or the dorm key doesn't match exactly (case sensitivity).

**How to avoid:** After the UPDATE, check `count` from Supabase response. If 0 rows affected, either the pickup was not confirmed (edge case — fall back to an INSERT), or there's a key mismatch. Log and alert via `notifyAdmin`.

### Pitfall 6: Geolocation Permission Required from User Gesture

**What goes wrong:** Calling `navigator.geolocation.getCurrentPosition()` on page load silently fails on iOS 17+.

**Why it happens:** iOS requires geolocation permission to be triggered from a user gesture (tap).

**How to avoid:** Call geolocation only when the rider taps "Submit" on the drop-off modal. Run it in parallel with the photo upload (don't await it before posting). If it resolves before the POST completes, include the coords. If not, post with `geo_lat: null`.

### Pitfall 7: notifyAdmin Message Exceeds 950 Chars

**What goes wrong:** Very long dorm names or photo paths truncate the message mid-sentence.

**Why it happens:** `notifyAdmin` has a 950-char cap (enforced in the helper). The Meta template body field itself is 1024 chars.

**How to avoid:** The helper auto-truncates. Keep the escalation message under 500 chars to leave headroom for "Boss, Check this out: " prefix from the template. Abbreviate photo paths in the message body.

---

## Code Examples

### Gemini Box Count Prompt

```typescript
// Source: architecture based on src/contexts/dorm-wars/domain/google-review-verify.ts
function buildBoxCountPrompt(expectedCount: number): string {
  return `You are counting meal delivery boxes in a photo taken by a delivery rider.

The rider says there should be ${expectedCount} box${expectedCount === 1 ? '' : 'es'} for this delivery stop.

Count the delivery boxes visible in the image. Include boxes that are partially hidden or stacked.

Output ONLY a JSON object with no commentary, no code fences:
{
  "count": number | null,
  "confidence": "high" | "medium" | "low",
  "reason": string,
  "imageQuality": "clear" | "unclear"
}

Field meanings:
- count: the number of delivery boxes you can count. Return null ONLY if the image is too dark, blurry, or obscured to count at all.
- confidence: "high" if you can clearly see and count all boxes; "medium" if some boxes are partially obscured; "low" if significant portions are hidden.
- reason: one short sentence (max 150 chars) describing what you see.
- imageQuality: "clear" if the image is usable for counting; "unclear" if too dark, blurry, or not showing boxes.

Output JSON only. No explanation. No code fences.`
}
```

### Canvas Resize (Client-Side)

```typescript
// Source: MDN OffscreenCanvas API — no library needed
async function resizeToJpeg(file: File, maxPx = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  const scale = Math.min(1, maxPx / Math.max(width, height))
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/jpeg', quality })
}
```

### Supabase Storage Upload Pattern

```typescript
// Source: src/app/api/dorm-wars/layer4/google-review/route.ts (exact template)
const storagePath = `${deliveryDateIso}/${dormName}/trip-1.jpg`
const { error: uploadErr } = await adminSb.storage
  .from('delivery-photos')
  .upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: true,  // rider can retake → same path, overwrite
  })
if (uploadErr) {
  // Non-fatal: log, continue to Gemini. Audit trail loses photo but delivery proceeds.
  console.error('[verify-box-count] storage upload failed:', uploadErr.message)
}
```

### getUserMedia + Canvas Capture

```typescript
// Primary camera path — works in both browser and iOS PWA home-screen
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'environment' }
})
videoRef.current!.srcObject = stream

// On shutter button tap:
function captureFrame(): Promise<Blob> {
  const video = videoRef.current!
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.9))
}

// Cleanup on unmount:
stream.getTracks().forEach(t => t.stop())
```

### Geolocation Capture (Non-Blocking)

```typescript
// Source: navigator.geolocation browser API — no package
function captureGeo(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),  // denied or unavailable → non-blocking null
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    )
    // Fallback if GPS times out (indoor accuracy — resolve null after 8s)
    setTimeout(() => resolve(null), 8_000)
  })
}
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@ai-sdk/google` | Gemini Vision (VER-06) | ✓ | 3.0.80 | — |
| `ai` generateText | Gemini call | ✓ | 6.0.191 | — |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini call | ✓ | (in .env.local) | — |
| Supabase `delivery-photos` bucket | Photo upload (VER-04) | ✗ | Does not exist yet | Must create via MCP |
| `geo_lat` / `geo_lng` columns | Geolocation (VER-13) | ✗ | Not in delivery_events table | Migration required |
| `getUserMedia` (browser) | Camera (VER-01) | ✓ | Standard Web API on iOS 17+, Android Chrome | `<input capture>` fallback |
| `navigator.geolocation` (browser) | Location (VER-13) | ✓ | Standard Web API, HTTPS required | Store null, non-blocking |
| `notifyAdmin` | Escalation (VER-08, VER-10) | ✓ | src/infra/admin-alerts/notify.ts | — |
| `createAdminSupabaseClient` | DB writes | ✓ | src/infra/supabase/admin-client.ts | — |

**Missing dependencies that need action before Wave 1:**

1. `delivery-photos` Supabase Storage bucket — create via MCP at start of Wave 0 / Plan 1
2. `geo_lat` / `geo_lng` columns on `delivery_events` — add via migration in Plan 1

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `<input capture>` only for camera | `getUserMedia` primary + `<input>` fallback | iOS PWA home-screen correctly opens live camera |
| `gemini-3.1-flash-lite` (used in chat) | `gemini-2.5-flash` for box counting | Higher multimodal accuracy; same SDK; slightly higher cost |
| Server actions for all async ops | API route with `maxDuration = 60` for Gemini calls | Prevents Netlify 10s default timeout from killing vision calls |

---

## Open Questions

1. **Signed URL vs path in notifyAdmin escalation**
   - What we know: `notifyAdmin` body can include any text including paths
   - What's unclear: Should the escalation message include a signed URL to the photo (so owner can view it directly from WhatsApp) or just the path?
   - Recommendation: Include a 7-day signed URL (same as `kitchen-labels` bucket pattern in `src/app/api/admin/labels/share/route.ts`). More useful than a raw path. Add ~2 seconds to the API route timing but still within the 60s budget.

2. **Manual confirmation flow after Gemini timeout**
   - What we know: VER-11 says Gemini timeout → manual rider confirmation, never auto-complete
   - What's unclear: Should the manual confirm flow UPDATE `delivery_events` with `verified: false` and the rider count only, or skip DB write entirely until Phase 7 failsafe handles it?
   - Recommendation: UPDATE with `rider_count`, `gemini_count: null`, `verified: false`. The Phase 7 failsafe at 8 PM then catches any unverified rows and alerts the owner.

3. **Per-dorm vs per-trip storage path**
   - What we know: path convention `{date}/{dormName}/trip-1.jpg` proposed
   - What's unclear: dorm names contain spaces ("KSK Homes") — storage path may need URL encoding or slug conversion
   - Recommendation: Slugify the dorm name: `dormName.toLowerCase().replace(/\s+/g, '-')` in the path. Example: `2026-06-15/ksk-homes/trip-1.jpg`.

---

## Sources

### Primary (HIGH confidence)
- Live codebase: `src/contexts/dorm-wars/domain/google-review-verify.ts` — exact Gemini Vision pattern to replicate
- Live codebase: `src/app/api/dorm-wars/layer4/google-review/route.ts` — multipart upload + Gemini + storage pattern
- Live codebase: `src/infra/admin-alerts/notify.ts` — notifyAdmin signature and 950-char cap
- Live codebase: `src/app/ops/[token]/RiderClient.tsx` — Phase 4 existing UI to extend
- Live codebase: `src/app/ops/[token]/actions.ts` — confirmPickup upsert pattern (Phase 5 does UPDATE not upsert)
- Live codebase: `src/contexts/ops/domain/delivery-event.ts` — isTripleMatch helper + DeliveryEvent type
- Migration: `supabase/migrations/20260615_delivery_events_table.sql` — confirms geo columns are absent
- Package types: `node_modules/@ai-sdk/google/dist/index.d.ts` — confirms `gemini-2.5-flash` is a valid model ID
- Project memory: `project_delivery_chain_of_custody.md` — architecture decisions locked
- Existing research: `.planning/research/PITFALLS.md` — getUserMedia iOS quirks (HIGH confidence)
- Existing research: `.planning/research/STACK.md` — Gemini SDK usage pattern
- `.planning/STATE.md` — locked decision: getUserMedia primary (not input capture alone)

### Secondary (MEDIUM confidence)
- `supabase/migrations/20260531_send_admin_whatsapp_alert_rpc.sql` — RPC template shape verified; Meta template body format may have drifted from current registration
- `.planning/research/SUMMARY.md` — geolocation API usage notes (training knowledge cross-referenced)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from installed node_modules + existing usage
- Architecture: HIGH — direct extension of Phase 4 pattern, no new infra
- Camera path: HIGH — STATE.md locked decision clarifies getUserMedia primary; pitfalls documented from research
- Gemini integration: HIGH — model ID verified from package types; call pattern is proven in codebase
- DB schema gap (geolocation): HIGH — confirmed absence by reading migration SQL
- Bucket existence: HIGH — confirmed absent (no reference in codebase)

**Research date:** 2026-06-15
**Valid until:** 2026-08-15 (stable stack; Gemini model availability is the only moving target)

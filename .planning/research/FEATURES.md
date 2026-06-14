# Features Research — Ops Interfaces v2.0

## Summary

Kitchen Display Systems (KDS) and Proof-of-Delivery (POD) tools are well-understood domains with clear UX conventions that this codebase can implement directly with existing infrastructure: the Vercel AI SDK (already wired for `gemini-2.5-flash` vision), Meta WhatsApp Cloud API (already in `src/infra/meta-whatsapp/client.ts`), and Supabase Storage (already used for dish images). The biggest implementation risk is camera/geolocation on mobile Web: native apps own this problem completely; PWAs have platform quirks that need explicit handling. Secret-token URL auth is a standard low-auth pattern with well-known tradeoffs that exactly fits ungated ops tools.

---

## Findings

### Kitchen Display Systems

**What production KDS tools look like (Toast, Square KDS, Lightspeed):**

- The entire UI is designed to be read from 3–5 feet away on a tablet in a noisy, humid, bright environment. Minimum 28px body text, 48px+ for dish names. Black or very dark background is preferred because kitchen lighting washes out light UIs.
- Information hierarchy is strict: dish name is the hero (full-width, top, large), then meal type badge (VEG / NON-VEG), then quantity count, then any notes or modifiers.
- Counts are the single most important number. Every KDS puts the count in the largest possible font, often the entire bottom half of the card.
- Recipe / instruction drill-down is a tap-to-expand pattern. The default view never shows full recipes — too much visual noise. Expand on demand. A full-screen modal over a dark backdrop works well here.
- Recipe structure best practice (confidence HIGH — from cooking and restaurant domain norms): break into `Ingredients → Method steps (numbered) → Notes`. The JSONB structure `{ sections: [{ heading, items }], method: string[], notes: string }` already matches this exactly.
- Two-state layout for counts: before cutoff = "Counts locked until 2 PM" placeholder that is large and obvious (not a tiny footnote); after cutoff = counts revealed with veg and non-veg side by side.
- No real-time push is needed here. The count at 2 PM is deterministic from the DB. A simple page load / manual refresh is sufficient. Real-time websocket subscriptions add complexity with no real-world benefit for a kitchen that has 1–5 people.
- Color coding matters: green for veg (already the project convention — `text-emerald-500`), orange for non-veg (already `#f57f20`).

**Confidence: HIGH** — these patterns are consistent across every major KDS vendor.

---

### Proof-of-Delivery Systems

**How logistics companies handle POD (FedEx, UPS, DHL, Deliveroo, Getir):**

- The canonical flow is: arrive at location → open app → tap location → camera opens → photo taken → count entered → submit. This is a 4-tap flow and that is the target. Every additional tap costs rider compliance.
- Photo-first, then count. Photo gives the record; count gives the verification. Doing them in the opposite order (count first) makes riders impatient with the photo step and they skip or rush it.
- The submit button must only become enabled when all three conditions are met: photo taken, count entered, and count is a non-zero number. A disabled-state submit with a brief label ("Enter count to continue") prevents confusion.
- Confirmation feedback must be instant and satisfying: a large green tick / checkmark for 1.5–2 seconds before returning to the dorm list. Riders need to know unambiguously that the action landed. A toast notification is too small for gloved hands in the dark.
- Retry on photo failure: one retry, then manual escalation. This is exactly the right call for this domain. Production POD apps (e.g., DHL Express app) follow the same pattern. Infinite retries create gaming opportunities; zero retries kill legitimate edge cases.
- Count mismatch escalation: the right approach is capture everything (photo, expected, rider count, AI count) and alert the owner. Never block the rider at the dorm door — that costs real time. The data trail is the product.
- Dorm shape buttons (circle, square, triangle, hexagon, star) are a strong UX idea for a small fixed-set location selector. Shapes are faster to scan than text lists, especially on a phone in one hand. Shape buttons should be large (minimum 80x80px tap target), labeled below with the dorm name, and arranged in a grid — not a dropdown or list.

**Confidence: HIGH** for the flow; MEDIUM for shape button specifics (this is a bespoke pattern with no direct precedent in public tools, but the underlying principle — icon > text for fast selection from a small fixed set — is well-established).

---

### AI Vision for Package/Box Counting

**How companies use vision AI for counting (from deployed systems and Gemini documentation):**

- Google Gemini Flash (the model already in production at `gemini-2.5-flash` and referenced as `gemini-3.1-flash-lite` in the review verification code) handles object counting in photos with reasonable accuracy for boxes, bags, and trays in structured environments.
- Expected accuracy range for counting identical objects in a photo: approximately 80–95% on a clear, well-lit photo. Degraded lighting, blurry photos, or stacked/overlapping boxes push accuracy toward the lower end or produce a conservative undercount.
- The existing `verifyReviewScreenshot` implementation in `src/contexts/dorm-wars/domain/google-review-verify.ts` is the direct template for this use case. The same pattern applies: structured JSON prompt → defensive parse → confidence tier → decision routing.
- For box/bag counting, the prompt needs to be extremely literal: "count the number of distinct meal boxes visible in this photo" rather than asking it to verify a number. Let the model count independently; compare the model count against the rider's count in application logic.
- Key insight: the AI count is NOT the ground truth — it is a third witness. The triple match (expected, rider, AI) is what builds confidence. A mismatch between any two is an escalation signal. This is the correct architecture.
- Recommended JSON shape for the Gemini counting call:
  ```json
  {
    "count": number | null,
    "confidence": "high" | "medium" | "low",
    "reason": string,
    "imageQuality": "clear" | "blurry" | "dark" | "partial"
  }
  ```
- Fallback rule: if `imageQuality` is not `clear` and confidence is `low`, prompt a retake. Don't try to use a bad count.
- Latency: the existing review verification code uses a 45-second AbortSignal timeout. For counting, 30 seconds is more appropriate — it is a simpler task than full text extraction. Set `abortSignal: AbortSignal.timeout(30_000)`.

**Confidence: MEDIUM** — the general approach is well-established; specific accuracy numbers for this exact use case (meal boxes at a dorm door) cannot be verified without testing.

---

### WhatsApp Delivery Notifications

**What the existing codebase already does (HIGH confidence — read from source):**

The project already has a production WhatsApp client at `src/infra/meta-whatsapp/client.ts` using the Graph API v22.0. The `notifyAdmin` function at `src/infra/admin-alerts/notify.ts` wraps a Supabase RPC that sends a WhatsApp alert to the owner's number. The inbound WhatsApp route does not yet exist in the codebase — this is new.

**Best practices for delivery notification templates:**

- Meta templates for delivery confirmation need to be category UTILITY (not MARKETING). Delivery confirmations are transactional. Using MARKETING category risks lower deliverability and may require opt-in flows.
- For owner escalation alerts: the existing `send_admin_whatsapp_alert` RPC pattern is exactly right — a short text body + a URL button that deep-links to the admin panel. No new template plumbing needed for owner notifications; reuse what exists.
- For per-dorm delivery confirmation (the "green tick auto-WhatsApp" on success): this needs a new UTILITY template. Suggested structure: header = dorm name, body = "Delivered: {count} meals to {dorm} at {time}. Photo on file.", button = "View Delivery" linking to a receipt URL or omit button entirely.
- Inbound WhatsApp (rider texts dorm name → triggers flow): Meta's Cloud API sends a webhook POST to your endpoint. The payload contains `entry[0].changes[0].value.messages[0].text.body` for text messages. Fuzzy matching on the dorm name can use simple Levenshtein distance or a pre-built map of known aliases. A dedicated `/api/whatsapp/inbound` route handler is the right pattern — separate from the existing Stripe webhook handler.
- The 8 PM failsafe cron is exactly how production delivery systems handle this: query for unconfirmed deliveries + send owner alert + optionally auto-mark as delivered. Supabase `pg_cron` (already used in this project for streak ticks, etc.) is the right place for this.

**Known constraints from the existing client.ts:**
- Template names and locale must match Business Manager exactly (the `en` vs `en_AE` lesson from staff invite templates applies here too).
- Named parameters need `parameter_name` in the payload — check Business Manager template definition before wiring up.
- Timeout at 8 seconds (SEND_TIMEOUT_MS). Fine for async fire-and-forget; needs try/catch with logging if called from a cron.

**Confidence: HIGH** — all based on reading the live production code.

---

### PWA for Field Workers

**Patterns for camera and geolocation on mobile Web:**

- Camera on mobile Web is handled via `<input type="file" accept="image/*" capture="environment">`. The `capture="environment"` attribute opens the rear camera directly on iOS Safari and Android Chrome — skipping the file picker. This is the correct pattern for a rider app where you always want the camera, never the gallery.
- `capture="environment"` does NOT work on desktop (no camera) — the `ops` route should detect mobile and conditionally apply it. This is fine since riders will be on phones.
- `getUserMedia` (the stream-based camera API) is an alternative that gives more control (preview, custom shutter) but requires HTTPS and explicit permission handling. For this use case, the `<input capture>` pattern is simpler, more reliable across iOS versions, and requires less code. Recommended: use `<input capture>` not `getUserMedia`.
- iOS Safari quirk: `accept="image/*"` with `capture="environment"` opens the camera correctly on iOS 14+. Older iOS may open the photo library instead. Since this is a UAE student rental context, all iPhones in the wild are likely recent. Flag as known limitation, not a blocker.
- Geolocation: `navigator.geolocation.getCurrentPosition()` works on mobile Web with HTTPS. The rider PWA should request location only at the moment of delivery confirmation (not on page load) — this minimizes the permission prompt friction and is consistent with how native apps handle it. Store `{ lat, lng, accuracy }` in the delivery record for the audit trail.
- iOS geolocation quirk: iOS requires a user gesture to trigger the permission prompt. Tying the geolocation request to the submit button tap satisfies this requirement.
- Offline capability: the ops route should work offline for the core flow if the data is cached. However, photo upload and Gemini verification require connectivity. The pragmatic approach: require connectivity, but show a clear error ("No connection — try again in a moment") rather than a crash. Full offline-first with service worker background sync is overkill for this use case.
- PWA manifest (`/public/manifest.json`): the project does not currently have one. Adding a minimal manifest (`name`, `short_name`, `icons`, `start_url`, `display: standalone`, `theme_color`) would let riders "Add to Home Screen" on iOS/Android. This is low-effort and gives the app a native feel with a custom icon. The `/ops/[token]` URL would need to be the start_url or the manifest linked from the ops pages specifically.
- Service worker: not required for this milestone. Skip it. A service worker for offline caching adds meaningful complexity and the delivery flow requires network anyway.

**Confidence: HIGH** for `<input capture>` pattern; MEDIUM for iOS PWA nuances (iOS PWA support has historically been spotty; current iOS 17+ is much better but edge cases exist).

---

### Secret-Token URL Auth

**The pattern and its security profile:**

Secret-token URLs (`/kitchen/abc123xyz` or `/ops/def456uvw`) are a standard low-friction access pattern used by Calendly, Notion share links, Google Docs edit links, and dozens of other products. The security model is "security through obscurity at the URL level" — possession of the URL = access.

**What this is suitable for:**
- Internal tools with a small, known user population (kitchen staff, one or two riders)
- Operations where the cost of login friction is high relative to the sensitivity of the data
- Situations where the owner controls who gets the URL and can revoke/rotate it by generating a new token

**What it is NOT suitable for:**
- Any surface where the user can take actions that have financial or customer-facing consequences (e.g., triggering refunds, changing meal plans) — those need the full Supabase auth session
- Anything where an accidental leak would be catastrophic — delivery counts and recipe data are low sensitivity

**Implementation:**
- Token stored in the DB as a bcrypt hash or simply as a plaintext UUID in a `kitchen_tokens` / `ops_tokens` table. Plain UUID is sufficient since UUIDs have 122 bits of entropy — a brute-force attack is infeasible.
- Middleware validates: `SELECT * FROM kitchen_tokens WHERE token = $1 AND revoked_at IS NULL LIMIT 1`. If not found, return 404 (not 401 — never confirm the token format exists).
- Token rotation: one active token per role (kitchen, rider per dorm or one shared rider token). Owner regenerates via admin panel. Old token row gets `revoked_at = now()`.
- HTTPS is the only transport requirement. Netlify enforces HTTPS by default — this is already satisfied.
- Link sharing risk: if a rider shares the URL, anyone with it gets access. Mitigated by making the ops page show no sensitive customer PII — only counts and dorm shapes.
- Log every page load with `{ token_id, user_agent, ip, timestamp }` for basic audit trail.

**Confidence: HIGH** — this is a well-understood pattern with clear tradeoffs.

---

### Recipe Display UX

**What works in kitchen environments:**

- Largest possible text size. Cooks are often at arm's length from a tablet, hands may be wet or gloved, and kitchen lighting is mixed. 18–20px minimum for body text, 28–32px for section headings.
- Dark background is essential. Light backgrounds glare in commercial kitchens. Use the dark theme pattern (the project's `dark` theme default is appropriate).
- Two-tap recipe access: tap the dish card → tap "View Recipe" → full-screen recipe modal. Never show recipe on the default view — it adds scroll complexity and competes with the count display.
- Step-by-step vs full text: the JSONB structure `{ sections: [{ heading, items }], method: string[], notes: string }` maps naturally to:
  - `sections` = ingredient groups (render as bullet lists under bold headings)
  - `method` = numbered steps (render as `1. Step text`, large tap targets between steps)
  - `notes` = bottom callout box with distinct background
- Ingredient grouping (e.g., "For the marinade:", "For the sauce:") is especially important for complex recipes. The `sections[].heading` field handles this — render each heading as a colored pill or section divider.
- Font: Montserrat (already the project font, already self-hosted in `/public/fonts/`) works well for kitchen display. Its geometric clarity reads well in degraded lighting.
- Scroll vs pagination for long recipes: scroll wins in this context. Pagination requires precise taps and users lose their place. A sticky section navigator (like a tab bar at the top: Ingredients | Method | Notes) lets cooks jump to the section they need without scrolling through the other.
- The "expand on tap" pattern from the KDS section applies: the collapsed dish card shows name + photo only. Recipe is always behind a tap.

**Confidence: HIGH** — these patterns are consistent with cooking app UX research and kitchen display literature.

---

## Recommendations

These are the key decisions the roadmap should lock in, based on all findings above:

1. **Camera via `<input type="file" accept="image/*" capture="environment">`**, not getUserMedia. Simpler, more reliable on iOS, zero permission flow to manage. The image becomes a File object that you upload to Supabase Storage the same way dish images are uploaded in `uploadDishImage` — no new infrastructure.

2. **Gemini counting prompt outputs an independent count — never ask it to verify a number.** The prompt should be "count the meal boxes in this image and return JSON". The rider's count and the expected count are compared in application logic, not inside the prompt. This prevents the model from being anchored to the rider's input.

3. **Triple match logic lives server-side** in a Next.js route handler, not client-side. The rider app POSTs `{ dormId, riderCount, photoStorageUrl }` to `/api/ops/confirm-delivery`. The route handler calls Gemini, computes the triple match, inserts the delivery record, and triggers WhatsApp. This keeps the AI call off the client and keeps the audit trail atomic.

4. **Reuse `notifyAdmin` for escalations.** Don't build a separate escalation pathway. The existing `send_admin_whatsapp_alert` RPC + `notifyAdmin` wrapper is already proven in production. For escalation, call `notifyAdmin("Delivery mismatch: {dorm} — expected {n}, rider {r}, AI {a}. Photo: {url}", dormId)`.

5. **Token validation in Next.js middleware** (`middleware.ts`), not in individual route handlers. Matcher pattern `['/kitchen/:path*', '/ops/:path*']` — check token against DB, attach token metadata to request headers, then page components trust headers. This is how the admin RBAC is already structured.

6. **No service worker for this milestone.** The ops flow requires connectivity for photo upload and AI verification. A service worker adds complexity without delivering the offline use case. Connectivity error states are the right investment instead.

7. **Counts displayed after 2 PM UAE time** — use the same `aeNow()` helper already in `HeroToday.tsx` (which is the production-correct UTC+4 calculation). Import or copy this function into the kitchen route; don't reinvent the timezone math.

8. **Dorm buttons as a grid of shape+label pairs, minimum 80x80px tap target.** Five dorms fit comfortably in a 2-column grid on a 375px phone. Each button: large shape icon (SVG, ~48px), dorm name below, full-width tap zone with `min-h-20`. No dropdown. No list.

9. **WhatsApp delivery confirmation template needs UTILITY category, not MARKETING.** File this before any code ships. Template approval takes 24–72 hours. Block the milestone on this.

10. **Recipe display: sticky section navigator (Ingredients / Method / Notes tabs) at the top of the full-screen modal**, scroll within the selected section. Dark background, Montserrat font, 18px minimum body text.

---

## Sources

All findings are from:
- Direct codebase reading (high confidence): `src/infra/meta-whatsapp/client.ts`, `src/infra/admin-alerts/notify.ts`, `src/contexts/dorm-wars/domain/google-review-verify.ts`, `src/app/api/chat/route.ts`, `src/app/admin/deliveries/DeliveriesClient.tsx`, `src/app/admin/menu/actions.ts`, `src/app/dashboard/HeroToday.tsx`, `src/contexts/menu/domain/catalog-data.ts`
- Training knowledge on KDS UX (Toast KDS, Square KDS, Lightspeed — patterns consistent as of training cutoff August 2025)
- Training knowledge on POD systems (DHL Express, FedEx Delivery Manager, Getir, Deliveroo Editions ops)
- Training knowledge on PWA camera/geolocation APIs (MDN Web Docs conventions, iOS Safari compatibility)
- Training knowledge on Meta WhatsApp Cloud API template categories and webhook payload shapes
- Training knowledge on secret-token URL auth patterns (Calendly, Notion, Google Docs precedents)
- Note: WebSearch was not available in this research session. All claims marked MEDIUM or HIGH confidence are grounded in direct code reading or well-established industry patterns. Claims specific to Gemini accuracy percentages are LOW confidence without live testing.

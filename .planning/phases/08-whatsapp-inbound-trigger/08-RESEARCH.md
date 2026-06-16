# Phase 8: WhatsApp Inbound Trigger — Research

**Researched:** 2026-06-16
**Domain:** Meta WhatsApp Cloud API webhooks, HMAC verification, fuzzy string matching
**Confidence:** HIGH

---

## Summary

Phase 8 wires up a single Next.js route (`/api/ops/whatsapp-inbound`) that receives inbound
WhatsApp messages from Meta, verifies their authenticity with HMAC-SHA256, fuzzy-matches the
rider's text to a dorm name, deduplicates on the wamid, and — on a clean match — marks the
delivery event verified and queues the customer notification fanout. It also handles the
one-time Meta GET handshake during webhook registration.

The Stripe webhook in `src/app/api/webhook/route.ts` provides the exact structural precedent:
raw-body read → HMAC check → synchronous 200 → async processing. The same `node:crypto`
`createHmac` + `timingSafeEqual` pattern applies here, with the Meta App Secret replacing the
Stripe webhook secret. The existing `timingSafeCompare` helper in `src/shared/crypto.ts` is
for simple string comparison; HMAC computation itself needs `createHmac` from `node:crypto`
directly (no new utility needed — the Stripe webhook already does it, but that code lives
inside the Stripe SDK rather than in a shared helper).

Fuzzy matching for five known dorm names is simple enough to hand-implement with Levenshtein
distance on the normalised (lowercase, trimmed) input — no npm package needed. The threshold
test is: normalised edit distance ≤ 2 against the canonical name, plus an explicit alias
table ("yugo" → "Yugo", "myriad" → "The Myriad", etc.) evaluated before the distance
computation.

**Primary recommendation:** One route file, one dedup table, one fuzzy-match utility, two new
env vars (`WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`). The inbound trigger
connects to the existing `updateDeliveryEvent` + `queueDeliveryConfirmedNotifications`
usecases already used by the Phase 5 verify-box-count route.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WAI-01 | `/api/ops/whatsapp-inbound` route handles Meta GET verification handshake | GET handler: check `hub.mode=subscribe`, compare `hub.verify_token`, return `hub.challenge` as plain text |
| WAI-02 | POST handler verifies `X-Hub-Signature-256` HMAC before processing | `createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')` compared with `timingSafeEqual` |
| WAI-03 | Returns HTTP 200 before any async processing (prevents Meta retry) | Fire-and-forget IIFE pattern — same as the pons.chat Next.js reference implementation |
| WAI-04 | Deduplicates on WhatsApp message ID with unique constraint | New `whatsapp_inbound_processed` table with `UNIQUE(message_id)` — INSERT ON CONFLICT DO NOTHING |
| WAI-05 | Fuzzy matches rider's text to dorm name with conservative threshold | Levenshtein distance ≤ 2 on normalised strings + alias table; no npm library needed |
| WAI-06 | Ambiguous match → WhatsApp reply to rider: "Did you mean X?" | Free-text reply via `POST /v22.0/{phoneNumberId}/messages` with `type: "text"` |
| WAI-07 | Only processes text messages from allowlisted sender phone numbers | `rider_phone_allowlist` column on `ops_tokens` table (or a new `whatsapp_rider_allowlist` table) |
| WAI-08 | Non-text messages (images, voice, reactions) get a reply: "Please send the dorm name as text" | Check `messages[0].type !== 'text'` and reply via free-text API |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` (built-in) | Node 20 | HMAC-SHA256 for X-Hub-Signature-256 | Already used for Stripe webhook; zero install cost |
| Meta Graph API v22.0 | — | Outbound text replies to rider | Same version already used in `src/infra/meta-whatsapp/client.ts` |
| Supabase JS admin client | 2.103.x | Dedup table reads/writes, delivery_events update | Same `createAdminSupabaseClient()` used throughout ops context |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Hand-rolled Levenshtein | — | Fuzzy dorm name matching | ≤ 60 lines; domain is tiny (5 names); external library overkill |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled Levenshtein | `fast-fuzzy` npm (0.6 KB) | Faster for large lists; unnecessary for 5 dorm names |
| Hand-rolled Levenshtein | `natural` npm | Huge package; overkill |
| IIFE fire-and-forget | `waitUntil` (Vercel edge) | We're on Node runtime + Netlify, not edge; IIFE is fine |

**No installation needed.** All required tools are already in the project.

---

## Architecture Patterns

### Route File Location
```
src/app/api/ops/whatsapp-inbound/route.ts
```
Mirrors `src/app/api/ops/verify-box-count/route.ts` in the same `ops/` subdirectory.

### Fuzzy Match Utility
```
src/contexts/ops/domain/dorm-name-fuzzy-match.ts
```
Lives alongside the other ops domain modules (`box-count-verify.ts`, `delivery-event.ts`).

### DB Migration
```
supabase/migrations/20260616_whatsapp_inbound_processed.sql
```
Creates `whatsapp_inbound_processed` dedup table.

### Pattern 1: Immediate-200 with IIFE Async Processing (WAI-03)

**What:** Return `NextResponse.json({ status: 'ok' })` synchronously after HMAC check, then
run all async work (DB writes, WhatsApp replies) inside a fire-and-forget IIFE.

**Why:** Meta retries on non-200 with exponential backoff for up to 36 hours. Any Gemini call,
DB write, or WhatsApp reply that takes more than ~5s will cause Meta to retry, producing
duplicate processing.

**Example:**
```typescript
// Source: pons.chat/blog/whatsapp-cloud-api-webhook-nextjs (verified pattern)
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  if (!verifyHmac(rawBody, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 })
  }
  const payload = JSON.parse(rawBody)
  // Return 200 BEFORE any async work
  void processAsync(payload)
  return NextResponse.json({ status: 'ok' })
}
```

### Pattern 2: HMAC Verification with Raw Body (WAI-02)

**What:** Call `req.text()` first, verify HMAC, then `JSON.parse()` the raw string.

**Critical:** Never call `req.json()` before HMAC verification — JSON parsing can alter
whitespace/encoding and break the signature comparison.

```typescript
// Source: verified from chatarmin.com + pons.chat + Meta official docs
import { createHmac, timingSafeEqual } from 'node:crypto'

function verifyHmac(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) return false
  const expected = 'sha256=' + createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))
  } catch {
    return false
  }
}
```

### Pattern 3: GET Verification Handshake (WAI-01)

```typescript
// Source: pons.chat/blog/whatsapp-cloud-api-webhook-nextjs
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const mode      = p.get('hub.mode')
  const token     = p.get('hub.verify_token')
  const challenge = p.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}
```

### Pattern 4: Dedup Table (WAI-04)

```sql
-- whatsapp_inbound_processed dedup table
CREATE TABLE public.whatsapp_inbound_processed (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  text        NOT NULL,          -- wamid value e.g. "wamid.HBgL..."
  sender_phone text       NOT NULL,
  raw_text    text,                          -- normalised rider input for audit
  matched_dorm text,                         -- null if no match
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id)
);
GRANT SELECT, INSERT ON public.whatsapp_inbound_processed TO service_role;
```

The flow: `INSERT ... ON CONFLICT (message_id) DO NOTHING` — if `rowsAffected = 0` the
message was already processed; skip and return silently.

### Pattern 5: Fuzzy Dorm Match (WAI-05, WAI-06)

**What:** Two-stage match — alias table first, Levenshtein second.

```typescript
// Source: src/shared/dorm-shapes.ts (canonical dorm name list from project)
// Dorm names: "The Myriad", "KSK Homes", "Yugo", "DSOA Residence", "Study World"

const ALIASES: Record<string, string> = {
  // exact aliases (normalised lowercase)
  'myriad': 'The Myriad',
  'the myriad': 'The Myriad',
  'ksk': 'KSK Homes',
  'ksk homes': 'KSK Homes',
  'yugo': 'Yugo',
  'dsoa': 'DSOA Residence',
  'dsoa residence': 'DSOA Residence',
  'study world': 'Study World',
}

// Conservative threshold: ≤ 2 edits on normalised string
const MAX_DISTANCE = 2

type FuzzyResult =
  | { match: string; confidence: 'exact' | 'alias' | 'fuzzy' }
  | { match: null; candidates: string[] }  // ambiguous if >1 dorm within threshold
  | { match: null; candidates: [] }        // no match

export function matchDormName(input: string): FuzzyResult {
  const normalised = input.trim().toLowerCase()
  // Stage 1: alias table
  if (ALIASES[normalised]) return { match: ALIASES[normalised], confidence: 'alias' }
  // Stage 2: Levenshtein against all canonical names (normalised)
  const CANONICAL = Object.values(DORM_SHAPE_MAP)
    .filter(d => d.displayName !== 'OTHER')
    .map(d => /* original key */ ...)
  // find all within MAX_DISTANCE
  // if exactly 1 → fuzzy match
  // if 0 → no match
  // if >1 at same minimum distance → ambiguous (WAI-06)
}
```

### Pattern 6: Send Free-Text WhatsApp Reply (WAI-06, WAI-08)

Non-template messages ("text" type) can be sent only within a 24-hour customer service
window after the user messages you first. Since the rider texted us, we are within that
window and can reply without a template.

```typescript
// Source: Meta Graph API v22.0 — same version as client.ts
async function replyToRider(senderPhone: string, text: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN
  await fetch(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: senderPhone,   // digits-only, no + prefix (as received in messages[0].from)
        type: 'text',
        text: { body: text },
      }),
    },
  )
}
```

### Pattern 7: Allowlist Check (WAI-07)

The allowlist is rider phone numbers that are permitted to trigger inbound confirmations.
Phone numbers arrive from Meta as digits-only (no `+`), e.g. `971504619384`.

**Storage option A (recommended):** A new `whatsapp_rider_allowlist` table with `phone_e164_digits text UNIQUE`.
**Storage option B:** A `WHATSAPP_RIDER_ALLOWLIST` env var with comma-separated digits.

Option A is preferred — it is rotatable without a deploy and auditable. Option B is simpler
but requires a Netlify env var change + deploy for every rider addition.

```sql
-- If Option A chosen:
CREATE TABLE public.whatsapp_rider_allowlist (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_digits text NOT NULL,  -- E.164 digits, no + (e.g. "971504619384")
  label        text,           -- rider name for audit
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone_digits)
);
GRANT SELECT ON public.whatsapp_rider_allowlist TO service_role;
```

For v1 of this phase, seeding the allowlist with the actual rider's number is a manual
step (same as seeding ops_tokens in Phase 2).

### Pattern 8: Connecting to Existing Delivery Flow (WAI-05)

On a confirmed dorm match, the handler:
1. Calls `updateDeliveryEvent` with `verified: true` (same usecase as verify-box-count)
2. Calls `queueDeliveryConfirmedNotifications` for the customer fanout
3. Does NOT re-run Gemini (this is the fallback path — rider is confirming manually)

The rider_count is set to the expected_count (we trust the rider's intent when they text
the dorm name — they wouldn't text if delivery wasn't made).

### Anti-Patterns to Avoid

- **Calling req.json() before HMAC check:** Breaks signature verification. Always `req.text()` first.
- **Awaiting async work before returning 200:** Causes Meta retries. Use IIFE or `void promise`.
- **Using template messages for the reply:** Free-text replies are allowed within 24h of
  the rider's inbound message. Templates are not needed and would require a separate registered
  template for the "Did you mean X?" flow.
- **Storing E.164 with `+` prefix in allowlist when comparing to `messages[0].from`:**
  Meta sends phone without `+`. Either strip on comparison or store without `+`.
- **Setting `verified: true` on `delivery_events` without a matching row:** The WhatsApp
  trigger should upsert or gracefully handle the case where no pickup row exists yet (rider
  texted before confirming pickup). Either create the row with expected_count from
  `getDormCounts`, or return a helpful reply to the rider.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC signature | Custom hash comparison | `node:crypto createHmac` + `timingSafeEqual` | Timing attack surface; already pattern-established by Stripe webhook |
| WhatsApp reply client | New HTTP helper | Reuse `postTemplate` pattern from `src/infra/meta-whatsapp/client.ts` | Same credentials, same version, same error handling |
| Delivery verification logic | New verified=true logic | `updateDeliveryEvent` use-case | Already handles the DB update correctly |
| Customer notification fanout | New queue logic | `queueDeliveryConfirmedNotifications` use-case | Already exists, already deduped |
| Dorm name canonical list | Hardcoded strings | Import from `src/shared/dorm-shapes.ts` (`DORM_SHAPE_MAP` keys) | Single source of truth for dorm names |

**Key insight:** The ops context already has every building block. Phase 8 is primarily a
wire-up layer — webhook ingress, auth check, dedup, and routing to existing usecases.

---

## Webhook Payload — Authoritative Field Map

**Source:** Meta official docs (confirmed via chatarmin.com + hookdeck.com + verified JSON examples)
**Confidence:** HIGH

### Inbound Text Message
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "971XXXXXXXXX",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{ "profile": { "name": "Rider Name" }, "wa_id": "971XXXXXXXXX" }],
        "messages": [{
          "from": "971XXXXXXXXX",       // digits-only, no + prefix
          "id": "wamid.HBgL...",         // unique message ID for dedup
          "timestamp": "1749416383",
          "type": "text",
          "text": { "body": "yugo" }
        }]
      }
    }]
  }]
}
```

### Non-Text Message Types
```json
// Image:    { "type": "image",    "image":    { "id": "...", "mime_type": "..." } }
// Audio:    { "type": "audio",    "audio":    { "id": "...", "mime_type": "..." } }
// Reaction: { "type": "reaction", "reaction": { "message_id": "...", "emoji": "👍" } }
// Voice:    { "type": "audio" }  (voice notes are type=audio, mime=audio/ogg)
```

### Status Updates (Delivery Receipts)
Status updates arrive in `value.statuses[]` (NOT `value.messages[]`). The handler should
ignore these silently — no processing needed, return 200.

```json
{ "statuses": [{ "id": "wamid...", "status": "delivered", "recipient_id": "..." }] }
```

### Access Pattern
```typescript
const entry   = payload.entry?.[0]
const change  = entry?.changes?.[0]
const value   = change?.value
const msgs    = value?.messages ?? []   // absent on status-only payloads
const message = msgs[0]                 // process first; Meta can batch but rarely does

const wamid       = message?.id          // "wamid.HBgL..."
const senderPhone = message?.from        // "971XXXXXXXXX" — no +
const msgType     = message?.type        // "text" | "image" | "audio" | "reaction" | ...
const msgText     = message?.text?.body  // present only when type === "text"
```

---

## Common Pitfalls

### Pitfall 1: Parsing Body Before HMAC Check
**What goes wrong:** `req.json()` re-serialises the body, which can change whitespace or
encoding. The resulting string no longer matches what Meta signed, so `timingSafeEqual`
fails for every valid message.
**Why it happens:** Developers reach for `req.json()` by habit.
**How to avoid:** Always `const rawBody = await req.text()` as the very first line. Parse
with `JSON.parse(rawBody)` only after HMAC passes.
**Warning signs:** HMAC check fails for all messages including test ones sent from Meta's
developer console.

### Pitfall 2: Blocking on Async Work Before Returning 200 (WAI-03)
**What goes wrong:** Any `await` before the `return NextResponse.json({ status: 'ok' })`
risks exceeding Meta's timeout (~5-10s). Meta marks the delivery failed and retries, causing
the same message to be processed 2–N times.
**How to avoid:** Fire-and-forget IIFE pattern. Only `req.text()` and HMAC check happen
synchronously; everything else is inside `void (async () => { ... })()`
**Warning signs:** Duplicate delivery events, double customer WhatsApps.

### Pitfall 3: Missing `value.statuses` Branch
**What goes wrong:** Every outbound WhatsApp message you send generates a delivery receipt
(status: sent → delivered → read). These arrive at the same webhook endpoint. If your handler
expects `value.messages` to always be present and throws when it's absent, you'll return 500
and Meta will retry the status update infinitely.
**How to avoid:** Check `if (!value.messages || value.messages.length === 0) return` early.
**Warning signs:** 500 errors in Netlify logs every few seconds after outbound messages.

### Pitfall 4: Phone Number `+` Mismatch
**What goes wrong:** Meta sends `from` as digits-only (`971504619384`), but your allowlist
might store E.164 with `+` (`+971504619384`). String equality fails, every message is
silently dropped.
**How to avoid:** Normalize at read time: strip `+` from stored values on comparison, or
store without `+` as the canonical form.
**Warning signs:** Valid rider messages silently ignored with no reply.

### Pitfall 5: No `delivery_events` Row for the Dorm
**What goes wrong:** Rider texts dorm name before confirming pickup on the ops page, so there
is no `delivery_events` row to `UPDATE`. The `updateDeliveryEvent` use-case returns
`rowsAffected: 0` and the delivery is not verified.
**How to avoid:** When `rowsAffected === 0`, either (a) INSERT a new row using `getDormCounts`
to obtain the expected count, or (b) reply to the rider "No pickup confirmed for [Dorm] today
— please use the ops link first."
**Warning signs:** `updateDeliveryEvent` logs "No matching delivery_events row found."

### Pitfall 6: Fuzzy Match False Positive Between Close Dorm Names
**What goes wrong:** "ksk" (edit distance 0 from KSK normalised) could theoretically fuzzy-
match something else if threshold is too loose. More concretely: short inputs like "s" or "k"
might land within distance 2 of multiple names.
**How to avoid:** Apply a minimum input length gate (reject inputs shorter than 3 chars).
Run the alias table lookup first — alias matches are exact by design and bypass distance
computation. Only invoke Levenshtein for inputs that didn't alias-match.
**Warning signs:** Wrong dorm gets confirmed.

### Pitfall 7: Free-Text Reply Not Allowed (24h Window)
**What goes wrong:** The rider texts you, you successfully process their message, but when you
try to reply (WAI-06, WAI-08), Meta returns a 131047 error because more than 24 hours have
elapsed since their last message (very unlikely for a same-day delivery flow, but possible in
staging/testing with old test messages).
**How to avoid:** Treat reply failure as non-fatal: `try { await replyToRider(...) } catch`.
The delivery verification itself already succeeded. Log the reply failure but don't fail the
handler.
**Warning signs:** `131047` errors in logs, but delivery_events shows verified=true correctly.

---

## Code Examples

### HMAC Verification (complete, production-ready)
```typescript
// Source: verified pattern from pons.chat + chatarmin.com + Meta official behavior
import { createHmac, timingSafeEqual } from 'node:crypto'

function verifyHmac(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret || !signatureHeader) return false
  const expected = 'sha256=' + createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex')
  if (expected.length !== signatureHeader.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader))
}
```

### Levenshtein Distance (hand-rolled, 20 lines)
```typescript
// No npm package needed — 5 known dorm names, conservative threshold
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}
```

### Dedup Insert Pattern
```typescript
// INSERT ON CONFLICT DO NOTHING — if 0 rows inserted, already processed
const { data, error } = await sb
  .from('whatsapp_inbound_processed')
  .insert({ message_id: wamid, sender_phone: senderPhone, raw_text: normalisedText })
  .select('id')
if (error?.code === '23505' || !data?.length) {
  // Already processed — no-op
  return
}
```

### Allowlist Check
```typescript
// Query the DB allowlist — faster than env var parsing for >1 rider
const { data: allowRow } = await sb
  .from('whatsapp_rider_allowlist')
  .select('id')
  .eq('phone_digits', senderPhone)     // senderPhone = digits-only, no +
  .eq('is_active', true)
  .maybeSingle()
if (!allowRow) return // silently ignore — WAI-07
```

---

## Environment Variables Needed

Two new env vars are required. Everything else (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`)
already exists and is used by `src/infra/meta-whatsapp/client.ts`.

| Env Var | Where Set | How to Get |
|---------|-----------|------------|
| `WHATSAPP_APP_SECRET` | Netlify env + `.env.local` | Meta App Dashboard → App Settings → Basic → App Secret |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Netlify env + `.env.local` | Choose any random string; enter same value in Meta's Webhook config |

The App Secret is **not** the same as the WhatsApp access token. It is the per-app credential
in App Settings > Basic on the Meta for Developers portal.

**Vault:** These do NOT need to go into Supabase Vault — they are used by the Next.js route
at runtime, not by any PL/pgSQL function. Add to Netlify environment variables directly.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Verify token in `hub_verify_token` query param | `hub.verify_token` (dot notation) | Meta Cloud API v1+ | Parameter name uses dot, not underscore |
| Template messages only for inbound replies | Free-text replies allowed within 24h window | Meta policy | No template registration needed for "Did you mean X?" |
| HMAC uses Facebook App secret | HMAC uses same App Secret | Always true for Cloud API | Not a separate "webhook secret" — it is the App Secret |

**Deprecated/outdated:**
- On-premises BSP HMAC: Different process for legacy BSPs; Cloud API uses App Secret only.

---

## Open Questions

1. **Allowlist location: DB table vs env var**
   - What we know: DB table (`whatsapp_rider_allowlist`) allows runtime changes without
     deploys; env var is simpler but requires a Netlify env change + redeploy per rider.
   - What's unclear: How many riders will need adding over time?
   - Recommendation: DB table for Phase 8. One migration, one seed row. Admin panel UI to
     manage it is a Phase 9+ concern.

2. **What to do when no `delivery_events` row exists for the dorm**
   - What we know: `updateDeliveryEvent` returns `rowsAffected: 0` and the verification
     silently fails if rider texts without completing the pickup flow.
   - What's unclear: Is this an expected scenario (rider skips ops page) or a bug?
   - Recommendation: Reply to the rider "No pickup confirmed for [Dorm] today — please use
     the ops link first." Don't auto-create a row (avoids phantom delivery events with
     wrong expected_count).

3. **App Secret storage: Netlify env vs Supabase Vault**
   - What we know: `WHATSAPP_APP_SECRET` is only needed at the Next.js route level
     (not in any PL/pgSQL function).
   - What's unclear: Whether the owner wants to centralise all credentials in Vault.
   - Recommendation: Netlify env var (same as `WHATSAPP_ACCESS_TOKEN` and
     `WHATSAPP_PHONE_NUMBER_ID`). Consistent with existing pattern.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `WHATSAPP_ACCESS_TOKEN` | Outbound replies to rider | ✓ (existing) | — | — |
| `WHATSAPP_PHONE_NUMBER_ID` | Outbound replies to rider | ✓ (existing) | — | — |
| `WHATSAPP_APP_SECRET` | HMAC verification (WAI-02) | ✗ (new) | — | Must be added |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | GET handshake (WAI-01) | ✗ (new) | — | Must be added |
| Meta webhook registration | WAI-01 through WAI-08 | Requires manual Meta portal step | — | Phase cannot go live without it |

**Missing dependencies with no fallback:**
- `WHATSAPP_APP_SECRET` — must be added to Netlify env + `.env.local` before deployment
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — must be added before registering the webhook in Meta
- **Meta webhook registration** — owner must visit Meta App Dashboard → WhatsApp →
  Configuration → Webhooks, enter the route URL and verify token, subscribe to `messages` field

**Missing dependencies with fallback:**
- None (all existing credentials are already live)

---

## Sources

### Primary (HIGH confidence)
- Meta WhatsApp Cloud API Webhook documentation (via chatarmin.com mirror) — GET handshake params, payload structure, HMAC algorithm
- pons.chat/blog/whatsapp-cloud-api-webhook-nextjs — Next.js App Router implementation pattern, raw body handling, IIFE async pattern
- hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks — retry behavior (36h backoff), payload structure, status updates

### Secondary (MEDIUM confidence)
- WhatsApp JSON payload examples verified against multiple sources (chatarmin.com + hookdeck.com + web search results showing official Meta JSON examples)
- Meta retry behavior: "up to 36 hours exponential backoff" — consistent across multiple sources

### Tertiary (LOW confidence)
- None. All critical claims are verified against at least two independent sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — uses only existing project dependencies (node:crypto, Supabase, Meta Graph API)
- Architecture: HIGH — directly extends established patterns (Stripe webhook, verify-box-count route, updateDeliveryEvent usecase)
- Pitfalls: HIGH — HMAC raw-body issue and 200-before-async are universally documented and match the existing Stripe webhook pattern
- Fuzzy matching: HIGH — Levenshtein is well-understood; only 5 dorm names; no library risk

**Research date:** 2026-06-16
**Valid until:** 2026-09-16 (Meta API versioning is stable; v22.0 already in production use)

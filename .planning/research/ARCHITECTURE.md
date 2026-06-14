# Architecture Research — Ops Interfaces v2.0

**Researched:** 2026-06-14
**Confidence:** HIGH — based entirely on reading the live codebase, not assumptions

---

## Summary

Both ops pages (`/kitchen/[token]` and `/ops/[token]`) should live as ungated Next.js App Router routes outside all existing route groups, token-validated in the RSC page itself rather than middleware. A new `ops` bounded context fits cleanly inside the existing 9-context layered architecture, keeping kitchen/delivery domain logic out of the `admin` context which is already doing enough. The existing notification queue, Gemini pipeline, Supabase storage pattern, and pg_cron cron setup all have proven patterns to follow exactly — this milestone extends rather than invents.

---

## Current Architecture

### Layered Boundaries

From `src/.planning/refactor/L1-BOUNDARIES.md`:

Nine bounded contexts under `src/contexts/`:
`identity`, `subscriptions`, `payments`, `notifications`, `dorm-wars`, `referrals`, `menu`, `chatbot`, `admin`

The strict dependency rule — arrows always point inward:

```
app/              → contexts/*/ui, contexts/*/usecases, infra/*, shared/*
contexts/<X>/ui   → same context usecases, shared/*, ui-system/*
contexts/<X>/usecases → same context domain, infra/*, shared/*
contexts/<X>/domain   → shared/* ONLY
infra/*           → shared/* ONLY
```

Hard constraints:
- Stripe SDK, Supabase client, WhatsApp Cloud API client appear ONLY in `infra/`
- Two contexts never import each other directly — they communicate via the use-case layer
- `domain/` files are pure (no I/O, no infra imports)

The `admin` context is intentionally one context covering all internal queues — growth is additive.

### Existing Data Flow

**Notification pipeline (fully understood):**
1. Server action or use-case calls `queueCustomerNotification(customerId, kind, scheduledFor, payload)` from `src/contexts/notifications/usecases/queue.ts`
2. That inserts a row into `customer_notifications` table via the admin (service-role) Supabase client
3. If the row is due within 60 seconds, it also calls `dispatch_customer_notifications_tick()` RPC directly (on-demand kick)
4. The pg_cron job runs every 5 minutes, sweeping `customer_notifications` rows where `scheduled_for <= now() AND sent_at IS NULL`
5. The dispatcher function (PL/pgSQL) reads template names from Vault secrets (`tpl_<kind>`), builds the Meta JSON payload, calls `net.http_post` to the WhatsApp Cloud API, and marks `sent_at`
6. The `FOR UPDATE SKIP LOCKED` guard prevents double-sends between the on-demand kick and the cron tick

**Menu catalog data flow:**
- `src/infra/supabase/menu-catalog.ts` reads `menu_weeks` → `week_meal_slots` → `dishes` in three flat queries joined in JS
- Falls back to the static `MENU_DATA` array in `src/contexts/menu/domain/catalog-data` if DB is unseeded
- Wrapped in React `cache()` for RSC deduplication within a render

**Subscription queries:**
- `src/infra/supabase/subscriptions-repo.ts` provides `getActiveSubscription`, `getCustomer`, etc., all wrapped in React `cache()`
- The admin deliveries page (`src/app/admin/deliveries/page.tsx`) queries directly via `createAdminSupabaseClient()` — parallel `Promise.all` for subscriptions + customers, joined in JS

**Gemini Vision (already live):**
- `@ai-sdk/google` + `@ai-sdk/react` already installed (v3.0.80)
- `src/contexts/dorm-wars/domain/google-review-verify.ts` uses `generateText` with a `content` array containing image bytes + prompt
- Model: `google('gemini-3.1-flash-lite')` with a 45-second AbortSignal timeout
- Called from an API route that handles the multipart upload

**Supabase storage (already live):**
- Two existing buckets in use: `dish-photos` (menu CMS images) and a bucket for Google review screenshots (layer4-queue)
- Pattern: `createAdminSupabaseClient().storage.from('bucket-name').upload(path, file, { upsert, contentType })`
- Public URLs via `.getPublicUrl(path)`

**Admin auth gate:**
- `src/contexts/admin/usecases/require-admin.ts` — reads `x-user-email` header set by middleware, checks against `ADMIN_EMAILS` env var allowlist, redirects if not in list
- Called at the top of `src/app/admin/layout.tsx`

**Internal cron routes:**
- Pattern: `src/app/api/internal/<name>/route.ts`
- Auth: `Authorization: Bearer <INTERNAL_RETRY_SECRET>` with `timingSafeCompare` from `src/shared/crypto.ts`
- Called from pg_cron via `net.http_post` using the `admin_base_url` + `internal_retry_secret` Vault secrets
- Thin controllers: validate auth, load data, call a context use-case, return JSON

**Dorm shapes:**
- `src/app/admin/labels/dorm-shapes.ts` — `DORM_SHAPE_MAP` keyed on dorm display name, exports `getDormMapping(dormName)` and `dormShapeSvg(shape, number, size, variant)`
- Currently lives in the labels admin path — will need to move or be imported cross-directory

### File Structure Patterns

**Ungated top-level routes** (no auth group wrapper):
- `src/app/r/` — referral landing, checks its own token logic in the RSC
- `src/app/staff/claim/` — claim page, checks Supabase session inside the RSC, redirects if not found

**Context structure** (from the `staff` context, the most recently added):
```
src/contexts/staff/
  domain/
    staff-plan.ts    (pure domain constants + functions, no I/O)
    claim-code.ts    (pure, hash comparison)
  usecases/
    renewal.ts       (DB reads via infra/supabase/admin-client)
    provision-plan.ts
```

**Migration pattern** (from `20260612_staff_members_registry.sql`):
- RLS enabled with no public policies (service-role only)
- UUID primary keys with `gen_random_uuid()`
- `created_at timestamptz NOT NULL DEFAULT now()`
- Inline comments explaining the lifecycle
- Cron jobs use `cron.unschedule` in a `DO $$ BEGIN/EXCEPTION/END $$` block before re-creating

---

## Integration Analysis

### New Page Routes

**Kitchen display:**
```
src/app/kitchen/[token]/page.tsx
```
- RSC (server component) — reads token from `params`, validates against `ops_tokens` table via `createAdminSupabaseClient()`
- If token invalid or expired → 404 (never redirect to login — these are ops staff, not customers)
- If before 2 PM UAE → renders recipe/dish view only, no counts
- If after 2 PM UAE → renders recipe/dish view + today's meal counts
- No layout.tsx wrapper — standalone page, no admin shell, no dashboard shell
- `export const dynamic = 'force-dynamic'` (token validation + time-gated counts must not cache)

**Rider/ops interface:**
```
src/app/ops/[token]/page.tsx
```
- Same token validation pattern as kitchen
- Renders dorm shape buttons for pickup/drop-off selection
- Client component for interactive state (photo upload, count entry, submission)
- Dorm shape buttons use `getDormMapping` from `dorm-shapes.ts`

**Why not inside `(dashboard)` or `admin/`:**
- No Supabase auth session — ungated
- Kitchen/rider are not admin users and never go through the admin shell
- Must be outside all route groups so the URL is simply `/kitchen/abc123` and `/ops/abc123`

### New API Routes

**Gemini box count verification:**
```
src/app/api/ops/verify-box-count/route.ts
```
- `POST` — accepts multipart form with `photo` file, `token` (ops token), `dorm_name`, `expected_count`
- Validates ops token first
- Resizes image if needed, calls Gemini Vision via `@ai-sdk/google`'s `generateText` (same as `google-review-verify.ts`)
- Returns `{ geminiCount: number, confidence: 'high' | 'medium' | 'low', pass: boolean }`
- Triple match logic: `expected === riderCount === geminiCount` → auto-confirm; mismatch → flag for retake
- Max 60s Netlify function timeout; use 45s AbortSignal (same pattern as review verify)

**Delivery confirmation:**
```
src/app/api/ops/confirm-delivery/route.ts
```
- `POST` — accepts `{ token, dorm_name, delivery_event_id, rider_count, photo_path }`
- Validates token, writes to `delivery_events` table, queues customer WhatsApp notifications
- Uses `queueCustomerNotification` from `src/contexts/notifications/usecases/queue.ts` — this is the right integration point, not a direct WhatsApp call

**WhatsApp inbound webhook:**
```
src/app/api/ops/whatsapp-inbound/route.ts
```
- `POST` — Meta sends inbound messages here
- Verifies `X-Hub-Signature-256` against `WHATSAPP_WEBHOOK_VERIFY_TOKEN` env var (same Meta verification as the existing `/api/whatsapp/` route which handles the verification handshake)
- Rider texts a dorm name → route finds the active delivery session for that rider's token → triggers delivery confirmation flow
- This is a new inbound webhook, separate from the existing `/api/whatsapp/` route which handles Meta's GET verification challenge

**8 PM failsafe (internal cron route):**
```
src/app/api/internal/ops-failsafe-send/route.ts
```
- Same auth pattern as other internal routes: `Authorization: Bearer INTERNAL_RETRY_SECRET`
- Called by pg_cron at 20:00 UAE (16:00 UTC)
- Finds dorms with no verified delivery event for today, loads their customers, calls `queueCustomerNotification` with a new kind (e.g. `delivery_unconfirmed_8pm`)
- Or alerts admin rather than customer (decision to lock in requirements phase)

### New Database Tables

**`ops_tokens` table:**
```sql
CREATE TABLE public.ops_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text NOT NULL UNIQUE,          -- the secret in the URL
  role        text NOT NULL CHECK (role IN ('kitchen', 'rider')),
  label       text NOT NULL,                 -- "Main Kitchen", "Rider 1"
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
-- RLS on, no policies. Service-role only.
-- Token is NOT hashed — it's a random 32-char string, and the page
-- doing the lookup needs to query it directly. Low sensitivity: reveals
-- dish names and counts, not customer PII. Rotate by setting is_active=false.
```

**`delivery_events` table:**
```sql
CREATE TABLE public.delivery_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_date     date NOT NULL DEFAULT CURRENT_DATE,
  dorm_name         text NOT NULL,
  subscription_ids  uuid[] NOT NULL,          -- which customers got this delivery
  expected_count    int NOT NULL,
  rider_count       int,
  gemini_count      int,
  gemini_confidence text,                     -- 'high' | 'medium' | 'low'
  verified          boolean NOT NULL DEFAULT false,
  photo_path        text,                     -- Supabase storage path
  ops_token_id      uuid REFERENCES public.ops_tokens(id),
  whatsapp_sent_at  timestamptz,             -- when customer notifications fired
  failsafe_fired    boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  confirmed_at      timestamptz,
  UNIQUE (delivery_date, dorm_name)           -- one event per dorm per day
);
-- RLS on, no policies.
```

**`dishes` table extension (recipes):**
Add a `recipe_jsonb` column (JSONB) to the existing `dishes` table — no new table needed per the locked decision. Shape:
```json
{
  "code": "CRNC01",
  "ingredients": [{ "item": "chicken", "quantity": "500g" }],
  "method": ["step 1", "step 2"],
  "allergen_notes": "Contains gluten"
}
```

**New `customer_notifications` kind:**
Add `delivery_confirmed` (and optionally `delivery_unconfirmed_8pm` for failsafe) to the `kind` CHECK constraint via migration.

### New Context Boundaries

**Recommendation: add a 10th context — `ops`.**

Rationale:
- Kitchen display + delivery chain-of-custody is a distinct operational domain with its own language: `delivery_event`, `ops_token`, `box_count`, `verification`, `failsafe`
- It does not belong in `admin` — admin is for internal queues, customer management, and business metrics. The kitchen staff and rider are not admins; they have no admin auth
- It does not belong in `notifications` — this context sends notifications as a consequence of delivery, but the delivery domain logic (triple match, photo upload, 2PM gate) is not notifications concern
- It does not belong in `subscriptions` — subscriptions tell us *who* to deliver to, but the delivery event itself is ops

**Proposed `ops` context structure:**
```
src/contexts/ops/
  domain/
    delivery-event.ts     -- DeliveryEvent type, verification logic (pure)
    ops-token.ts          -- token validation rules (pure)
    box-count.ts          -- triple-match rule: expected === rider === gemini (pure)
    time-gate.ts          -- 2 PM UAE gate logic (pure, imports shared/time/)
  usecases/
    validate-token.ts     -- queries ops_tokens via infra/supabase/admin-client
    get-kitchen-view.ts   -- loads today's menu + counts (after 2PM)
    get-dorm-delivery-state.ts -- which dorms have confirmed/pending events
    confirm-delivery.ts   -- writes delivery_events, calls notifications queue
    run-failsafe.ts       -- 8PM sweep for unconfirmed dorms
```

The `ops` context imports from `infra/supabase/` and `shared/`. It calls `queueCustomerNotification` from `contexts/notifications/usecases/queue.ts` — this is a cross-context call, which L1-BOUNDARIES.md flags as requiring care. The correct pattern here is that `confirm-delivery.ts` (an ops use-case) imports `queueCustomerNotification` directly — L1 says contexts communicate via use-case layer, and `queueCustomerNotification` is exactly that (it's a public use-case function, not a domain file). This is the same pattern used by `payments/usecases/handle-stripe-event.ts` today.

**What to NOT do:** do not add ops logic into `admin/usecases/` — that context is already sizeable and ops pages are accessed by non-admin users.

### Shared Code Reuse

| Existing artifact | How ops uses it | Notes |
|---|---|---|
| `src/contexts/notifications/usecases/queue.ts` → `queueCustomerNotification` | `confirm-delivery` use-case queues `delivery_confirmed` kind after triple-match passes | Import directly from the notifications use-case layer — this is the allowed cross-context path |
| `src/infra/supabase/admin-client.ts` → `createAdminSupabaseClient` | All ops use-cases need service-role access (ops_tokens RLS has no public policy) | No change needed |
| `src/infra/meta-whatsapp/client.ts` | Do NOT import this directly from ops — use `queueCustomerNotification` instead so the dispatcher pipeline handles delivery | Direct WhatsApp calls from ops would bypass the audit trail in `customer_notifications` |
| `src/app/admin/labels/dorm-shapes.ts` → `DORM_SHAPE_MAP`, `getDormMapping`, `dormShapeSvg` | Rider ops page uses dorm shapes for the pickup/drop-off UI | This file currently lives in `app/admin/labels/` — for ops to import it without violating the dependency rule, it should move to `src/shared/dorm-shapes.ts` (it has no I/O, no business rules — pure data + SVG generator). Alternatively import it directly since `app/` can import from other `app/` directories today |
| `src/infra/supabase/menu-catalog.ts` | Kitchen display reads today's dishes + recipes | Import in `get-kitchen-view.ts` use-case |
| `src/infra/supabase/subscriptions-repo.ts` or direct query | `get-dorm-delivery-state.ts` needs today's active subscriptions per dorm for counts | The admin deliveries page (`src/app/admin/deliveries/page.tsx`) does this same query — extract a shared helper or query directly |
| `src/shared/time/` (Asia/Dubai day boundaries) | `time-gate.ts` — 2 PM cutoff check | Already in shared kernel |
| `src/shared/crypto.ts` → `timingSafeCompare` | Internal route auth check (`ops-failsafe-send/route.ts`) | Unchanged |
| `@ai-sdk/google` + `generateText` | Gemini box count verification API route | Already installed, same pattern as `google-review-verify.ts` |

### Photo Storage

**New Supabase storage bucket: `delivery-photos`**

Pattern follows `dish-photos` bucket exactly:
```typescript
const { error } = await createAdminSupabaseClient()
  .storage
  .from('delivery-photos')
  .upload(`${deliveryDate}/${dormName}/${eventId}.jpg`, imageBytes, {
    contentType: 'image/jpeg',
    upsert: false,  // one photo per event; error on duplicate = good guard
  })
```

Storage path structure: `{delivery_date}/{dorm_name}/{delivery_event_id}.jpg`
- `delivery_date` in ISO format (2026-06-14) for easy date-based listing
- `dorm_name` slug (e.g. `the-myriad`, `ksk-homes`) for human readability
- `delivery_event_id` (UUID) as the filename — unique forever

**RLS:** bucket should be private (no public URL). Ops pages render the photo via a signed URL (`createSignedUrl`) rather than public access — these are internal verification photos, not customer-facing.

**Upload flow in the API route:**
1. Receive multipart form in `verify-box-count/route.ts`
2. Validate ops token
3. Upload to storage, get the storage path
4. Pass image bytes directly to Gemini (do NOT pass the public URL — Gemini Vision takes image bytes or a data URL, not a Supabase signed URL that requires auth)
5. Store `photo_path` in `delivery_events` row when confirming

### Cron Integration

**8 PM failsafe cron — follows the exact pattern of `dispatch_renew_nudges_18_ae`:**

```sql
-- In a new migration: 20260614_ops_failsafe_cron.sql

CREATE OR REPLACE FUNCTION public.dispatch_ops_failsafe_tick()
RETURNS TABLE(dispatched_count int, skipped_no_config int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  base_url     text;
  retry_secret text;
  http_req_id  bigint;
  dispatched_total int := 0;
BEGIN
  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'dispatch_ops_failsafe_tick: vault secrets missing';
    dispatched_count := 0; skipped_no_config := 1;
    RETURN NEXT; RETURN;
  END IF;

  -- Find dorms with active subscriptions today but no verified delivery_event
  -- ... selection query here ...

  SELECT net.http_post(
    url     := base_url || '/api/internal/ops-failsafe-send',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || retry_secret,
      'Content-Type', 'application/json'
    ),
    body    := jsonb_build_object('delivery_date', CURRENT_DATE::text, 'dorm_name', ...)
  ) INTO http_req_id;
  dispatched_total := dispatched_total + 1;

  dispatched_count := dispatched_total;
  skipped_no_config := 0;
  RETURN NEXT;
END;
$$;

-- 16:00 UTC = 20:00 UAE (UTC+4)
SELECT cron.schedule(
  'ops_failsafe_20_ae',
  '0 16 * * *',
  $cron$ SELECT public.dispatch_ops_failsafe_tick(); $cron$
);
```

**Existing cron job inventory (from migrations):**
- `*/5 * * * *` — `dispatch_customer_notifications_tick` (every 5 min)
- `0 14 * * *` — `dispatch_renew_nudges_18_ae` (18:00 UAE)
- `0 <time> * * *` — `dispatch_subscription_ended_cron` (from 20260613 migration)

The ops failsafe at `0 16 * * *` (20:00 UAE) does not conflict with any existing cron.

**The `/api/internal/ops-failsafe-send/route.ts` internal route** follows the exact structure of `renew-nudge-send/route.ts`:
- Auth: `timingSafeCompare(presented, process.env.INTERNAL_RETRY_SECRET!)`
- Body: `{ delivery_date, dorm_name }`
- Logic: loads active subscriptions for that dorm + day, calls `queueCustomerNotification` for each customer with kind `delivery_unconfirmed_8pm` (or sends admin WhatsApp alert — lock this in requirements)
- Returns `{ ok: true, dispatched: number }`

---

## Recommendations

**1. Token strategy: random string in DB, not env var.**
Store ops tokens in the `ops_tokens` table (queried on every page load) rather than hardcoded env vars. This lets you rotate tokens without a deploy, revoke individual rider tokens without killing the kitchen token, and audit who accessed what. The query is one indexed lookup — negligible cost.

**2. `dorm-shapes.ts` should move to `src/shared/`.**
It's pure data + SVG generation with zero I/O and no business rules — exactly what the shared kernel is for. Currently in `src/app/admin/labels/` which makes it awkward to import from ops pages. Move it to `src/shared/dorm-shapes.ts` once. Admin labels and ops pages both import from there.

**3. Add `delivery_confirmed` as a new notification kind before writing the dispatch logic.**
The kind-check constraint in `customer_notifications` is a DB-level guard. Add the new kind(s) via migration before writing any code that queues them — same pattern as v6 migration (`20260613_customer_notifications_dispatcher_v6_new_kinds.sql`). Add the `CASE` branch to `dispatch_customer_notifications_tick` at the same time. The Meta template must be registered in Business Manager before the cron can send it.

**4. Kitchen page: RSC-only, no client components for the display layer.**
Counts and dish info are server-rendered. The only client interaction is navigation between sections (which React Server Components handle via links). This keeps the kitchen page fast on slow kitchen Wi-Fi and avoids hydration cost on a display device.

**5. Ops/rider page: single client component for the interactive flow.**
Photo capture, count entry, and submission state are inherently interactive. Use one `'use client'` component for the whole rider flow, with server actions for the actual DB writes (same pattern as how the dashboard handles skip/pause today).

**6. Gemini call belongs in an API route, not a server action.**
Reasons: (a) server actions have a 10s soft limit in Next.js, Gemini Vision can take 15-45s; (b) multipart file upload to server actions is awkward; (c) the API route can set `export const maxDuration = 60` on Netlify. Pattern already proven by the `layer4-queue` photo verification flow.

**7. Do not add a new infra adapter for Gemini.**
The `@ai-sdk/google` SDK is already in use in `dorm-wars/domain/google-review-verify.ts`. The box count verification can live in `src/contexts/ops/domain/box-count-verify.ts` using the same import pattern. There is no `infra/gemini/` adapter today and we don't need one — the AI SDK abstracts the transport.

**8. The `ops` context is context 10, not a subdomain of `admin`.**
Admin auth (env-var allowlist + Supabase session) does not apply to kitchen/rider. They are different actors with different access patterns. Folding ops into admin would require either giving kitchen staff admin credentials (wrong) or complicating the auth logic in `require-admin.ts` (also wrong).

---

## Risks

**R1: Meta WhatsApp template registration lag.**
New notification kinds (`delivery_confirmed`) require a new approved Meta template. Template review takes 24-48 hours minimum. The dispatcher will silently skip rows with no template (`skipped_no_template_count`). Plan: register the template early in the build phase, before wiring the dispatch. The `tpl_delivery_confirmed` Vault secret is what gates the live send.

**R2: Gemini Vision timeout on Netlify.**
Netlify functions default to 10s. The existing review verify flow sets `AbortSignal.timeout(45_000)` and requires `export const maxDuration = 60` on the route. The ops verify-box-count route needs the same. Miss this and Netlify kills the function mid-Gemini-call, leaving the delivery event in a limbo state. Mitigation: make the delivery event creation a two-step (create event row first, then call Gemini, then update verified flag) so a timeout doesn't leave orphaned data.

**R3: `dorm-shapes.ts` import path coupling.**
Currently at `src/app/admin/labels/dorm-shapes.ts`. Importing it from `src/app/ops/[token]/page.tsx` or `src/contexts/ops/` is technically possible but creates a cross-`app/` dependency that violates the spirit of L1-BOUNDARIES (domain/use-case code importing from an app page directory). Move the file to `src/shared/dorm-shapes.ts` before building the ops context.

**R4: `delivery_events` UNIQUE constraint on (delivery_date, dorm_name).**
One delivery event per dorm per day assumes a single rider visits each dorm once. If the operational reality becomes "multiple trips to the same dorm" (e.g. morning + evening delivery), this constraint breaks. The schema should be designed defensively — consider `UNIQUE (delivery_date, dorm_name, trip_number)` with `trip_number DEFAULT 1` so the happy path is simple but multi-trip is addable later without a schema rewrite.

**R5: 2 PM gate relies on server clock, not client.**
The kitchen page must evaluate the 2 PM cutoff server-side in the RSC. If counts were gated client-side (JS `new Date()`), a kitchen staff member could spoof the time. The RSC evaluation is safe because the server is UTC-synced and the Asia/Dubai offset is computed from `shared/time/`. Do not pass a boolean `showCounts` prop from client state.

**R6: The WhatsApp inbound webhook shares a phone number with outbound.**
The existing `dispatch_customer_notifications_tick` sends outbound WhatsApp from the same phone number ID. The inbound webhook will receive ALL messages to that number — customer replies, unsubscribe requests, anything. The `ops/whatsapp-inbound` route needs to filter for rider-originated messages specifically (match against known rider phone numbers or require a specific prefix/keyword), otherwise it will mis-process customer replies as delivery confirmations. The existing `/api/whatsapp/` route may already handle some inbound — inspect it before adding a second inbound handler on the same webhook endpoint.

**R7: Token expiry and rotation.**
The `ops_tokens` table design above uses `is_active` boolean. For kitchen tokens (semi-permanent — the display tablet), this is fine. For rider tokens (may change frequently), consider adding `expires_at` as an optional column so time-limited tokens can auto-expire without an admin action to revoke.

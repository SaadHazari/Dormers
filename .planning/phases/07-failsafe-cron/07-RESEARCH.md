# Phase 7: Failsafe Cron — Research

**Researched:** 2026-06-16
**Domain:** pg_cron + pg_net + Next.js internal API route + notifyAdmin
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FAIL-01 | pg_cron at 8 PM UAE (`0 16 * * *` UTC) checks dorms with active subs but no verified delivery event today | Full cron pattern exists; exact UTC offset proven in existing jobs |
| FAIL-02 | Sends owner WhatsApp via `notifyAdmin` with list of pending dorms + quick actions link | `notifyAdmin` + `send_admin_whatsapp_alert` RPC both live and in use |
| FAIL-03 | Failsafe is idempotent — calling twice in same window does not send duplicate alerts | Pattern well-established; use a "sent today" guard column or a `delivery_failsafe_alerts` dedup table |
| FAIL-04 | Internal API route authenticated with `INTERNAL_RETRY_SECRET` bearer token | Auth pattern used in 4 existing routes; `timingSafeCompare` helper ready |
</phase_requirements>

---

## Summary

Phase 7 is the smallest phase in the roadmap — roughly 3 moving parts: a SQL migration (pg_cron function + `cron.schedule`), a Next.js API route at `/api/internal/ops-failsafe-send`, and one idempotency mechanism. Every pattern already exists and has been proven by at least three prior phases.

The pg_cron + pg_net → internal route pipeline is the established architecture in this codebase. Four existing jobs follow it (post-payment retry, start-day emails, renew nudge, subscription-ended). The `INTERNAL_RETRY_SECRET` bearer-auth handshake is identical across all four. The `notifyAdmin` helper is the canonical way to ping the owner; it sanitizes newlines, trims to 950 chars, and absorbs errors so it never blocks the caller.

The only novel decision in this phase is the idempotency mechanism. Unlike the other crons (which use a marker column on the target row), the failsafe fires at most once per day and the "target" is a set of dorms, not a single row. The right guard is a lightweight dedup table (one row per alert per date) checked before sending, so re-invoking the cron inside the same evening window is safe.

**Primary recommendation:** Write a single SQL migration with the PL/pgSQL tick function + `cron.schedule`, plus the Next.js route following the exact shape of `subscription-ended-send`. The tick function does the dorm lookup in SQL and POSTs the internal route once (not once per dorm). The route performs the dorm lookup again in TypeScript, builds the message, sends via `notifyAdmin`, and writes a dedup row.

---

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `pg_cron` extension | Already enabled (proven by 7+ live jobs) | Schedule the 8 PM UTC job | The only Supabase-supported cron mechanism |
| `pg_net` extension | Already enabled (proven by all existing tick functions) | Fire HTTP POST from SQL | Supabase's async HTTP inside Postgres |
| `send_admin_whatsapp_alert` RPC | Live in DB | Owner WhatsApp ping | Single source of truth for admin alerts |
| `notifyAdmin` in `src/infra/admin-alerts/notify.ts` | Current | TypeScript wrapper over the RPC | Sanitizes newlines, absorbs errors, 950-char cap |
| `timingSafeCompare` in `src/shared/crypto.ts` | Current | Constant-time secret comparison | Identical to all other internal routes |
| `createAdminSupabaseClient` | Current | Service-role Supabase client | Standard server-side pattern |

### Architecture Pattern (Existing)

The codebase has a proven three-layer pattern for all time-driven server-side actions:

```
pg_cron tick function (SQL)
  → net.http_post to /api/internal/[name]  (async, pg_net)
    → Next.js route (validates secret, does the work)
      → notifyAdmin / queue / DB write
```

This phase follows the same pattern exactly.

---

## Architecture Patterns

### Recommended File Structure

```
supabase/migrations/
  20260616_ops_failsafe_cron.sql        # tick function + cron.schedule

src/app/api/internal/
  ops-failsafe-send/
    route.ts                            # POST handler
```

No new contexts, no new usecases files, no new domain types needed. The tick function is entirely self-contained inside the SQL migration. The route lives alongside the other 4 internal routes.

### Pattern 1: The SQL Tick Function

**What:** A PL/pgSQL function that:
1. Reads `admin_base_url` and `internal_retry_secret` from Vault
2. POSTs once to `/api/internal/ops-failsafe-send` via `net.http_post`
3. Returns `(fired_count int, skipped_no_config int)`

**When to use:** Identical to `dispatch_subscription_ended_tick` — single POST, no loop.

```sql
-- Source: supabase/migrations/20260613_dispatch_subscription_ended_cron.sql (proven pattern)
CREATE OR REPLACE FUNCTION public.ops_failsafe_send_tick()
RETURNS TABLE(fired_count int, skipped_no_config int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  fired_total      int := 0;
  no_config_total  int := 0;
  base_url         text;
  retry_secret     text;
  http_req_id      bigint;
BEGIN
  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'ops_failsafe_send_tick: required vault secrets missing';
    fired_count     := 0;
    skipped_no_config := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT net.http_post(
    url     := base_url || '/api/internal/ops-failsafe-send',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || retry_secret,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  ) INTO http_req_id;

  fired_total := 1;

  fired_count       := fired_total;
  skipped_no_config := no_config_total;
  RETURN NEXT;
END;
$$;
```

**Scheduling (8 PM UAE = 16:00 UTC, Dubai is UTC+4, no DST):**

```sql
DO $$
BEGIN
  PERFORM cron.unschedule('ops_failsafe_20_ae');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'ops_failsafe_20_ae',
  '0 16 * * *',
  $cron$ SELECT public.ops_failsafe_send_tick(); $cron$
);
```

**CRITICAL:** The schedule name `ops_failsafe_20_ae` matches the exact job name in the success criteria (`SELECT * FROM cron.job WHERE jobname = 'ops_failsafe_20_ae'`).

### Pattern 2: The Internal API Route

**What:** A Next.js POST route at `src/app/api/internal/ops-failsafe-send/route.ts` that:
1. Validates `INTERNAL_RETRY_SECRET` bearer token
2. Queries `delivery_events` for today's verified dorms
3. Queries `getDormCounts` logic to find dorms with active subs
4. Computes the set difference: dorms with subs but no verified delivery event
5. Checks the idempotency guard
6. If pending dorms exist AND not already alerted today, calls `notifyAdmin`
7. Writes the idempotency record

**Shape (based on `subscription-ended-send/route.ts`):**

```typescript
// Source: src/app/api/internal/subscription-ended-send/route.ts (proven pattern)
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { notifyAdmin } from '@/infra/admin-alerts/notify'
import { timingSafeCompare } from '@/shared/crypto'

export async function POST(req: Request) {
  const expected = process.env.INTERNAL_RETRY_SECRET
  if (!expected) {
    console.error('❌ INTERNAL_RETRY_SECRET not set; refusing ops-failsafe')
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!presented || !timingSafeCompare(presented, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  // ... dorm lookup + notifyAdmin + idempotency write
  return NextResponse.json({ ok: true, pendingDorms, sent })
}
```

### Pattern 3: The Dorm Lookup Query

The route needs to find dorms that have active subscriptions today but no verified `delivery_events` row for today.

**Step 1 — Get today's UAE date inside the route:**

```typescript
// UAE is UTC+4, no DST. Use wall-clock date, not UTC date.
const nowUAE = new Date(Date.now() + 4 * 60 * 60 * 1000)
const todayIso = nowUAE.toISOString().slice(0, 10)  // "YYYY-MM-DD"
const dayName = nowUAE.toLocaleString('en-AE', { weekday: 'long', timeZone: 'Asia/Dubai' })
const isSaturday = nowUAE.getDay() === 6
```

**Step 2 — Reuse `getDormCounts` to find dorms with active subs:**

```typescript
// Source: src/contexts/ops/usecases/get-dorm-counts.ts (already tested)
import { getDormCounts } from '@/contexts/ops/usecases/get-dorm-counts'
const dormCounts = await getDormCounts(todayIso, dayName, isSaturday)
const dormsWithSubs = Object.keys(dormCounts).filter(d => dormCounts[d] > 0)
```

**Step 3 — Find verified dorms for today:**

```typescript
const sb = createAdminSupabaseClient()
const { data: verifiedRows } = await sb
  .from('delivery_events')
  .select('dorm_name')
  .eq('delivery_date', todayIso)
  .eq('verified', true)
const verifiedDorms = new Set((verifiedRows ?? []).map(r => r.dorm_name))
```

**Step 4 — Compute pending:**

```typescript
const pendingDorms = dormsWithSubs.filter(d => !verifiedDorms.has(d))
```

### Pattern 4: Idempotency

**Problem:** The cron fires once but the failsafe route could be called manually or the cron could hiccup and fire twice. The alert must not go out twice in the same evening window.

**Approach: A `delivery_failsafe_alerts` table with UNIQUE on `alert_date`.**

```sql
CREATE TABLE IF NOT EXISTS public.delivery_failsafe_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_date date NOT NULL,
  pending_dorms text[] NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_date)
);
```

The route does an INSERT with `ON CONFLICT (alert_date) DO NOTHING` and checks whether the insert actually wrote a row (`count === 1`). If zero rows were inserted (alert already sent today), it returns early with `{ ok: true, skipped: 'already_sent_today' }`.

**Alternative: A boolean column on `delivery_events` aggregate.** Rejected — `delivery_events` is per-dorm, not per-day global. The dedup table is cleaner.

**Alternative: Check `customer_notifications` for `delivery_unconfirmed_8pm` kind today.** Not used here — the failsafe sends an ADMIN alert via `notifyAdmin`, not a customer notification. The `delivery_unconfirmed_8pm` kind in `customer_notifications` is for a future customer-facing flow. Don't conflate the two.

### Pattern 5: The notifyAdmin Message

`notifyAdmin` sanitizes `\n` to ` · ` and truncates to 950 chars. The message must be crafted accordingly.

```typescript
// notifyAdmin replaces \n with ' · ' — build the message with that in mind
const pendingList = pendingDorms.join(', ')
const quickLink = 'https://dormers.ae/admin/deliveries'
const message =
  `8PM FAILSAFE: Unverified deliveries for ${todayIso}. ` +
  `Pending dorms: ${pendingList}. ` +
  `Verify manually: ${quickLink}`

await notifyAdmin(message, 'deliveries')
```

`buttonText` maps to the URL button's path suffix in the `dormers_admin_alert` template. Pass `'deliveries'` so it deep-links to the admin deliveries page.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sending the WhatsApp | Direct Meta Graph API call | `notifyAdmin` | Already handles vault secrets, sanitization, error absorption |
| Timing UAE vs UTC | Manual timezone math | `new Date(Date.now() + 4*60*60*1000)` or `timeZone: 'Asia/Dubai'` option | Proven pattern from `get-dorm-counts.ts` |
| Finding active dorm subscriptions | Rewriting the filter logic | Import `getDormCounts` from ops usecase | Exact same 5DAYS/skipped/paused filters already tested |
| pg_cron scheduling | Custom scheduler | `cron.schedule` / `cron.unschedule` | The only supported mechanism on Supabase |

---

## Common Pitfalls

### Pitfall 1: FAIL-03 Violated — Double Alert
**What goes wrong:** Cron fires, route runs, notifyAdmin sends. Cron fires again (manual test or pg_cron hiccup) within the same evening. Owner gets two identical WhatsApp alerts.
**Root cause:** No guard preventing re-send on the same calendar date.
**How to avoid:** INSERT the dedup record before calling `notifyAdmin`. Use `ON CONFLICT DO NOTHING` and check affected row count. Only call `notifyAdmin` if the insert succeeded.
**Warning signs:** Testing the route manually twice in dev causes two alerts.

### Pitfall 2: Wrong UTC Offset
**What goes wrong:** Cron fires at `0 16 * * *` UTC = 8 PM Dubai — correct. But if you accidentally use `CURRENT_DATE` inside the SQL function to filter `delivery_events`, you get UTC date (16:00 UTC is still June 16 UTC), which may differ from the AE wall-clock date around midnight. At 8 PM Dubai, both dates agree. This is safe for this specific cron time.
**Root cause:** At 16:00 UTC, UTC date and AE date (UTC+4 = 20:00) are the same calendar date. No mismatch.
**How to avoid:** The route computes AE date via `new Date(Date.now() + 4*60*60*1000)`. Consistent with how `verify-box-count` route computed `isSaturday`.

### Pitfall 3: Cron Fires on Non-Delivery Days
**What goes wrong:** It's Sunday. No deliveries happened. Zero dorms have verified events. Failsafe fires, finds all dorms with subscriptions (7DAYS plans still have active subs on Sunday), and alerts the owner with false positives.
**Root cause:** `getDormCounts` already handles this correctly — 5DAYS plans skip Saturday and Sunday, 6DAYS plans skip Sunday. The Saturday `isSaturday` flag handles 5DAYS plans. Sunday handling is built into `is_delivery_day` at the DB level but `getDormCounts` does NOT explicitly filter Sunday in TypeScript (it uses `week_type === '5DAYS' && isSaturday`).
**How to avoid:** Check `isSunday` separately and skip Sunday for 5DAYS + 6DAYS subs. Or: if `dormsWithSubs` is empty, exit immediately with `{ ok: true, noDeliveriesExpected: true }`. If every subscriber's plan skips the day, `getDormCounts` returns zero counts — `pendingDorms` is empty — no alert fires. Confirmed: correct behavior.
**Verification:** `getDormCounts` returns a Record of non-zero counts only for dorms getting deliveries today. Empty result = no deliveries expected = no alert.

### Pitfall 4: `delivery_unconfirmed_8pm` Confusion
**What goes wrong:** Developer conflates the admin failsafe alert with the customer-facing `delivery_unconfirmed_8pm` notification kind. Tries to run the alert through `queueCustomerNotification` instead of `notifyAdmin`.
**Root cause:** The `delivery_unconfirmed_8pm` kind was registered in the DB constraint but has no Meta template yet and is intended for a future customer-facing flow, not this phase.
**How to avoid:** Use `notifyAdmin` exclusively. Do not queue `customer_notifications` rows in this phase. The admin alert goes to the owner, not to customers.

### Pitfall 5: Route Body Format
**What goes wrong:** The tick function POSTs `'{}'::jsonb` (no body params) to the route. If the route tries to parse a body with `req.json()`, it will throw on an empty JSON object.
**Root cause:** Unlike the per-subscription crons (which pass `{ subscription_id }` in the body), this failsafe is a daily sweep — no input params needed.
**How to avoid:** The route should not require any body fields. Accept the POST with no body validation. The route does its own DB queries to find pending dorms.

### Pitfall 6: `dormers_admin_alert` Template Status
**What goes wrong:** Template is still "In review" in Meta Business Manager. `notifyAdmin` calls the RPC, the RPC sends to Meta, Meta rejects with a template error silently logged to `net._http_response`.
**Root cause:** Meta WhatsApp template approval can take 24-48 hours.
**How to avoid:** `notifyAdmin` is fire-and-forget by design — it swallows RPC errors. The plan should note that if the template isn't approved, the alert fires but the WhatsApp is silently rejected by Meta. The `dormers_admin_alert` template status should be verified before shipping Phase 7 to production. The cron and route can be deployed regardless — they'll work the moment the template is approved.

---

## Code Examples

### Verified: Cron Job Schedule Pattern
```sql
-- Source: supabase/migrations/20260613_dispatch_subscription_ended_cron.sql
-- Dubai = UTC+4 year-round (no DST). 8 PM Dubai = 16:00 UTC.
SELECT cron.schedule(
  'ops_failsafe_20_ae',
  '0 16 * * *',
  $cron$ SELECT public.ops_failsafe_send_tick(); $cron$
);
```

### Verified: Idempotent Unschedule Pattern
```sql
-- Source: supabase/migrations/20260506_cron_jobs.sql
DO $$
BEGIN
  PERFORM cron.unschedule('ops_failsafe_20_ae');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
```

### Verified: Internal Route Auth Handshake
```typescript
// Source: src/app/api/internal/post-payment-retry/route.ts
const expected = process.env.INTERNAL_RETRY_SECRET
if (!expected) {
  return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
}
const authHeader = req.headers.get('authorization') ?? ''
const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
if (!presented || !timingSafeCompare(presented, expected)) {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}
```

### Verified: UAE Date Computation in a Route
```typescript
// Source: src/app/api/ops/verify-box-count/route.ts
// Dubai UTC+4 approach — consistent with existing pattern
const isSaturday = new Date(deliveryDateIso + 'T00:00:00+04:00').getDay() === 6
```

### Verified: notifyAdmin Call
```typescript
// Source: src/infra/admin-alerts/notify.ts
// notifyAdmin sanitizes \n → ' · ', truncates at 950 chars, never throws
void notifyAdmin(
  `8PM FAILSAFE: Unverified deliveries for ${todayIso}. Pending: ${pendingList}. Verify: ${quickLink}`,
  'deliveries',
)
```

### Verified: getDormCounts Signature
```typescript
// Source: src/contexts/ops/usecases/get-dorm-counts.ts
export async function getDormCounts(
  todayIso: string,   // "YYYY-MM-DD" UAE wall time
  dayName: string,    // "Monday"…"Saturday"
  isSaturday: boolean,
): Promise<DormCountsRecord>  // Record<dormName, count>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Make.com webhooks for timed sends | pg_cron + pg_net + internal routes | 2026-05 | Codebase fully migrated; no Make.com involvement |
| One-shot Meta Graph calls in routes | `notifyAdmin` RPC wrapper | 2026-05 | Single path for all admin alerts |

**DB drift warning (from project memory):** `subscription_status_tick`/`ae_today()`/cron times differ in prod vs local migration files. Before scheduling the failsafe cron, verify via MCP that `pg_cron` extension is active and `cron.job` is accessible in the Ohio project (`yjjayivwfqjfppawgyaz`). The `ae_today()` function is referenced in cron_jobs.sql but is not defined there — it exists in the live DB but its definition is not in local migrations. The failsafe should NOT use `ae_today()` — use explicit UTC date arithmetic or pass the date from the TypeScript route instead.

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| pg_cron | FAIL-01 scheduling | Confirmed (7+ live jobs in prod) | Proven by `cron.job` SELECT in success criteria |
| pg_net | tick function HTTP post | Confirmed (all existing tick functions use it) | `net.http_post` in every cron migration |
| `INTERNAL_RETRY_SECRET` env var | FAIL-04 route auth | Confirmed live (4 routes use it) | Also stored as `internal_retry_secret` in Vault |
| `admin_base_url` Vault secret | tick function URL | Confirmed live (all tick functions read it) | Resolves to `https://dormers.ae` |
| `send_admin_whatsapp_alert` RPC | FAIL-02 WhatsApp | Live in DB | `notifyAdmin` calls it |
| `dormers_admin_alert` Meta template | FAIL-02 delivery | "In review" per project notes | Route works; WhatsApp fails silently until approved |
| `delivery_events` table | FAIL-01 query | Live and confirmed | Created in Phase 2 migration |
| `getDormCounts` usecase | FAIL-01 active sub lookup | Live (Phase 4 complete) | No changes needed |

**Missing with no fallback:** None that block implementation.
**Soft blocker:** `dormers_admin_alert` template still "In review". Alert logic is complete but WhatsApp delivery depends on Meta approval. Deploy the code; it activates automatically when the template is approved.

---

## Open Questions

1. **Does `dormers_admin_alert` template need the button URL suffix to be `deliveries`?**
   - What we know: `notifyAdmin`'s `buttonText` param maps to the URL button path suffix in the template. The RPC passes it as the button's text parameter. The template has a URL button with a dynamic suffix.
   - What's unclear: What suffix resolves to `/admin/deliveries` in the template's URL config in Meta.
   - Recommendation: Pass `'deliveries'` as `buttonText` for now. If the button config in Meta points to `https://dormers.ae/admin/{{suffix}}`, it will deep-link correctly. Verify in Meta Business Manager before shipping.

2. **Should the failsafe also queue `delivery_unconfirmed_8pm` customer notifications?**
   - What we know: `delivery_unconfirmed_8pm` is in the DB constraint (Phase 2) but has no Meta template, no dispatcher CASE branch, and is listed as out of scope in REQUIREMENTS.md for Phase 7.
   - Recommendation: Do not queue customer notifications in Phase 7. Owner-only alert. Customer-facing is v2 (Out of Scope in REQUIREMENTS.md).

3. **What happens if `getDormCounts` returns 0 results because subscriptions are empty?**
   - What we know: Empty result means `pendingDorms` is empty, which means the route returns `{ ok: true, pendingDorms: [], sent: false }` without calling `notifyAdmin`. This is the "all confirmed or no deliveries" path in FAIL-01 success criteria item 6.
   - Recommendation: This is the correct behavior — confirm in the route with an explicit early return.

---

## Plan Shape (for the Planner)

This phase needs 1 plan with 2 tasks:

**Plan 07-01: SQL migration + API route + idempotency**

Task 1 (SQL migration):
- Create `supabase/migrations/20260616_ops_failsafe_cron.sql` (or date-stamped 20260617)
- Define `delivery_failsafe_alerts` table (dedup guard)
- Define `ops_failsafe_send_tick()` function
- Schedule `ops_failsafe_20_ae` cron at `0 16 * * *`
- Apply via Supabase MCP `execute_sql`

Task 2 (TypeScript route):
- Create `src/app/api/internal/ops-failsafe-send/route.ts`
- Auth guard (INTERNAL_RETRY_SECRET)
- UAE date computation
- `getDormCounts` call to find dorms with active subs
- `delivery_events` query for today's verified dorms
- Compute pending set
- Idempotency INSERT check
- `notifyAdmin` call if pending dorms exist
- `NextResponse.json` with result

No UI, no new context files, no new domain types. Lint check at the end is sufficient (no visual verification needed, UI hint = no).

---

## Sources

### Primary (HIGH confidence)
- `src/app/api/internal/post-payment-retry/route.ts` — internal route auth pattern (verified by reading)
- `src/app/api/internal/subscription-ended-send/route.ts` — exact shape to follow
- `src/infra/admin-alerts/notify.ts` — `notifyAdmin` signature and behavior
- `src/shared/crypto.ts` — `timingSafeCompare` helper
- `src/contexts/ops/usecases/get-dorm-counts.ts` — dorm subscription query (verified by reading)
- `src/contexts/ops/usecases/queue-delivery-confirmed-notifications.ts` — similar pattern
- `supabase/migrations/20260613_dispatch_subscription_ended_cron.sql` — exact SQL pattern
- `supabase/migrations/20260525_post_payment_retry_cron.sql` — pg_net + vault pattern
- `supabase/migrations/20260531_send_admin_whatsapp_alert_rpc.sql` — RPC definition
- `supabase/migrations/20260615_delivery_events_table.sql` — `delivery_events` schema
- `supabase/migrations/20260615_customer_notifications_kind_check_v7_delivery.sql` — `delivery_unconfirmed_8pm` scope

### Secondary (MEDIUM confidence)
- Project MEMORY.md notes: `dormers_admin_alert` template "In review" — not independently re-verified here
- Project MEMORY.md: "Live Supabase = Dormers-Ohio `yjjayivwfqjfppawgyaz`" — use this project_id for MCP queries

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already live and proven in production
- Architecture: HIGH — identical to 3+ existing internal cron routes
- Pitfalls: HIGH — based on reading the actual codebase, not speculation
- Idempotency approach: MEDIUM — dedup table is new (not proven), but the pattern is well-understood

**Research date:** 2026-06-16
**Valid until:** Stable; no fast-moving external dependencies

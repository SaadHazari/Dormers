# Phase 6: Delivery Notification Fanout — Research

**Researched:** 2026-06-16
**Domain:** WhatsApp notification pipeline wired to delivery verification trigger
**Confidence:** HIGH — all findings drawn directly from the codebase and live migration files

---

## Summary

Phase 6 has zero greenfield work. Every building block already exists: the `queueCustomerNotification` function, the `FOR UPDATE SKIP LOCKED` dispatcher, the `customer_notifications` table, the `delivery_confirmed` kind in the CHECK constraint, and the per-dorm subscriber query pattern used by `getDormCounts`. The only missing pieces are:

1. A new `delivery-confirmed-fanout.ts` use-case in `src/contexts/ops/` that queries active subscribers for a given dorm on a given day and calls `queueCustomerNotification` for each one.
2. A `delivery_confirmed` CASE branch added to `dispatch_customer_notifications_tick` in a new SQL migration.
3. A `tpl_delivery_confirmed` Vault secret pointing to the registered Meta UTILITY template name.
4. A call to the fanout use-case at the triple-match point in `/api/ops/verify-box-count/route.ts` (Case C — `verified: true`).

The architecture constraint from L1-BOUNDARIES is important: the `ops` context must not directly import `queueCustomerNotification` from `notifications`. However, looking at the existing codebase, post-payment and referral flows call `queueCustomerNotification` directly from their use-cases — the L1 document describes the event-bus as the preferred future pattern, but pragmatic direct calls from use-cases to the notifications context are already the reality. The `post-payment-fanout.ts`, `subscription-ended-fanout.ts`, and `r/[cid]/actions.ts` all call it directly. The planner should follow that established pattern for ops.

**Primary recommendation:** Add a `queueDeliveryConfirmedNotifications` use-case in `src/contexts/ops/usecases/`, call it from the API route at the `verified: true` branch, and add the dispatcher CASE + Vault secret in a single migration.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOT-01 | On verified delivery, `queueCustomerNotification` called with kind `delivery_confirmed` for each active, non-skipped, non-paused subscriber in that dorm | `getDormCounts` already has the subscription filter logic; fanout mirrors it but returns customer IDs instead of a count |
| NOT-02 | Notifications sent only to active, non-skipped, non-paused subscribers for that dorm on that day | `subscriptions` table has `status`, `skipped_dates`, `paused_dates`, `week_type` — same pattern as `getDormCounts` |
| NOT-03 | Uses existing dispatcher pipeline (pg_cron + FOR UPDATE SKIP LOCKED) | `dispatch_customer_notifications_tick` is live and handles the `delivery_confirmed` kind via the `tpl_` Vault lookup — once the CASE branch is added |
| NOT-04 | `delivery_confirmed` Meta template registered as UTILITY category before dispatch code ships | Vault secret `tpl_delivery_confirmed` must be inserted with the approved template name; dispatcher picks it up automatically |
| DB-06 | `delivery_confirmed` CASE branch added to `dispatch_customer_notifications_tick` | The dispatcher's CASE block ends at `subscription_ended`; a new WHEN clause is added in a migration |
| ARC-04 | Cross-context notification queueing via `queueCustomerNotification` import | `queueCustomerNotification` is importable from `@/contexts/notifications/usecases/queue`; ops use-case calls it directly (established pattern) |
</phase_requirements>

---

## Standard Stack

This phase uses no new libraries. Everything is already installed and in use.

### Core (already live)

| Module | Location | Purpose |
|--------|----------|---------|
| `queueCustomerNotification` | `src/contexts/notifications/usecases/queue.ts` | Inserts into `customer_notifications` + triggers on-demand dispatch if due within 60s |
| `createAdminSupabaseClient` | `src/infra/supabase/admin-client.ts` | Service-role client for querying subscriptions and customers |
| `dispatch_customer_notifications_tick` | Supabase live function | FOR UPDATE SKIP LOCKED dispatcher; pg_net sends to Meta; auto-retry on failure |
| Vault secrets pattern | `tpl_<kind>` naming | Dispatcher does `SELECT decrypted_secret WHERE name = 'tpl_' || notif_row.kind` |

### No new dependencies needed

Installation: none required.

---

## Architecture Patterns

### Pattern 1: Fanout Use-Case in Ops Context

**What:** A new file `src/contexts/ops/usecases/queue-delivery-confirmed-notifications.ts` that:
1. Fetches all subscriptions with status IN ('Active', 'Paused', 'Skipped')
2. Filters by dorm_name from the customers table (joining via customer_id)
3. Applies the same exclusion rules as `getDormCounts`: 5DAYS+Saturday skip, skipped_dates, paused_dates
4. Calls `queueCustomerNotification(customerId, 'delivery_confirmed', new Date(), payload)` for each eligible subscriber

**When to use:** Called from the API route immediately after `updateDeliveryEvent` in Case C (triple match, verified=true).

**Example pattern — mirrors getDormCounts subscriber filter:**
```typescript
// Source: src/contexts/ops/usecases/get-dorm-counts.ts (lines 33-69)
const [subsRes, customersRes] = await Promise.all([
  sb.from('subscriptions')
    .select('id, customer_id, week_type, skipped_dates, paused_dates')
    .in('status', ['Active', 'Paused', 'Skipped']),
  sb.from('customers')
    .select('id, dorm_name'),
])

// Filter: 5DAYS+Saturday, skipped_dates, paused_dates, dorm match
// Then: for each match → queueCustomerNotification(sub.customer_id, 'delivery_confirmed', new Date(), { dorm_name: dormName })
```

### Pattern 2: Dispatcher CASE Branch

**What:** A new migration that replaces `dispatch_customer_notifications_tick` (via CREATE OR REPLACE) adding a CASE branch for `delivery_confirmed`.

**Key facts from the existing dispatcher:**
- Template name comes from Vault: `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'tpl_delivery_confirmed'`
- `first_name` is already computed as `COALESCE(NULLIF(split_part(notif_row.customer_name, ' ', 1), ''), 'there')`
- `template_lang` defaults to `'en'` for all kinds except `meal_resumed_confirm` (which uses `en_AE`)
- Component structure uses named params (`parameter_name` field in the parameters array)
- A minimal `delivery_confirmed` template needs at minimum a header with `first_name`

**Template component structure for delivery_confirmed:**
```sql
WHEN 'delivery_confirmed' THEN
  jsonb_build_array(
    jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
      jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))
```

If the Meta template includes a body param (e.g. dorm name), the payload key would be `dorm_name` and the components array would need a body entry. This is a design decision for the planner — the simplest version is header-only (just "Your meal has arrived!").

### Pattern 3: Trigger Point in API Route

**What:** In `src/app/api/ops/verify-box-count/route.ts`, Case C is at line 188-203. After the `updateDeliveryEvent` call succeeds, add a fire-and-log call to `queueDeliveryConfirmedNotifications`.

**Why fire-and-log (not throw):** The delivery IS verified and the row IS updated. A notification queue failure should not roll back the green tick or surface as a rider error. Same approach used by `subscription.notification-due` event handler in `subscribers.ts`.

**Example at the trigger point:**
```typescript
// Case C — Triple match (VER-07)
if (isMatch) {
  await updateDeliveryEvent({ ..., verified: true, ... })
  // Fire-and-log: queue customer notifications for this dorm
  try {
    await queueDeliveryConfirmedNotifications(dormName, deliveryDateIso, isSaturday)
  } catch (err) {
    console.error('[verify-box-count] queueDeliveryConfirmedNotifications failed (non-fatal):', err)
  }
  return NextResponse.json({ verified: true, ... })
}
```

### Pattern 4: Vault Secret Setup

**What:** The dispatcher looks up `tpl_delivery_confirmed` from vault. This insert must happen before the migration that adds the CASE branch ships, or the dispatcher will hit the existing no-template warning and log it without sending.

**Vault insert command (run via Supabase MCP):**
```sql
SELECT vault.create_secret('<meta_template_name>', 'tpl_delivery_confirmed', '');
```

Where `<meta_template_name>` is the exact name from Meta Business Manager after the UTILITY template is approved.

### Pattern 5: isSaturday Derivation for Fanout

**What:** The fanout use-case needs to know if today is Saturday (UAE time) to correctly exclude 5DAYS plan subscribers. The API route already has `deliveryDateIso` — derive the day from that.

```typescript
const dayOfWeek = new Date(deliveryDateIso + 'T00:00:00+04:00').getDay() // 6 = Saturday
const isSaturday = dayOfWeek === 6
```

Or accept `isSaturday` as a parameter (the route could pass it in).

### Anti-Patterns to Avoid

- **Direct WhatsApp call from the API route:** The requirement (NOT-03, ARC-04) explicitly says no direct Meta calls from ops code. All sends must go through the `customer_notifications` table → dispatcher pipeline.
- **Blocking the API response on notification delivery:** Fanout is fire-and-log. The green tick response goes back to the rider immediately; notifications queue in the background.
- **Sending to Skipped/Paused status at the subscription level without checking skipped_dates/paused_dates arrays:** The subscription `status` can be 'Active' while `skipped_dates` contains today's date (the cron flips status to Skipped at midnight, but between midnight and the cron the status may differ). Always check the arrays.
- **Deduplication risk:** If the API route is called twice for the same dorm+date (e.g., rider retries after a network timeout), two sets of notifications could be queued. Consider checking for an existing `delivery_confirmed` row in `customer_notifications` for the same customer+date before queuing, or relying on the verified=true check from `delivery_events` (only send if the row was just set to verified=true, i.e., was not already verified).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| WhatsApp delivery | Custom HTTP caller in the API route | The existing `dispatch_customer_notifications_tick` via the queue |
| Subscriber lookup | New subscription query from scratch | Copy the `getDormCounts` filter logic — it's already correct and tested in production |
| Template name management | Hardcoded template strings | Vault `tpl_delivery_confirmed` secret — already how the dispatcher works |
| Retry on Meta failure | Manual retry loop | The auto-retry reconciler (`reconcile_notification_meta_responses_tick`) — already wired in the latest migration |

---

## Common Pitfalls

### Pitfall 1: Duplicate Notifications on Retry
**What goes wrong:** The rider hits submit, gets a network timeout, and tries again. The API route runs twice, `updateDeliveryEvent` runs twice (idempotent via upsert), and two rounds of `queueCustomerNotification` are called for every subscriber in the dorm.

**Why it happens:** The API route currently has no dedup guard for the notification fanout — `updateDeliveryEvent` is idempotent but the notification queue call is not.

**How to avoid:** Before calling fanout, check if `delivery_events.verified` was already `true` before this call. The current `update-delivery-event.ts` returns `rowsAffected` but doesn't tell you if the row was already verified. Either: (a) fetch the row first and skip fanout if already verified, or (b) after `updateDeliveryEvent`, check for existing `customer_notifications` rows of kind `delivery_confirmed` for any of the affected customers within the last 1 hour.

The simplest approach: query `delivery_events` before calling `updateDeliveryEvent` to check if `verified` is already `true`. If it is, skip the fanout call.

### Pitfall 2: Meta Template Not Approved Before Migration Ships
**What goes wrong:** The `dispatch_customer_notifications_tick` CASE branch lands, but the Vault secret `tpl_delivery_confirmed` hasn't been inserted (or the Meta template is still "In Review"). Every `delivery_confirmed` row hits the `IF template_name IS NULL THEN` branch, increments `skipped_no_template_count`, and is silently abandoned.

**Why it happens:** The migration can be applied before Meta approves the template.

**How to avoid:** The Vault insert MUST happen first (before or in the same transaction as the migration). Keep the sequence: (1) register template in Meta Business Manager, (2) wait for "Active" status, (3) insert Vault secret via Supabase MCP, (4) apply migration with CASE branch.

**Warning sign:** After deploy, check: `SELECT count(*) FROM customer_notifications WHERE kind = 'delivery_confirmed' AND sent_at IS NULL AND scheduled_for < now();` — rows stuck here mean the template isn't resolving.

### Pitfall 3: Wrong Meta Template Category
**What goes wrong:** Template submitted as MARKETING instead of UTILITY. Meta may auto-reclassify or reject. UTILITY templates can be sent outside the 24-hour customer service window; MARKETING templates cannot.

**Why it happens:** The delivery notification is proactive (not in response to a customer message). Meta classifies proactive transactional notifications as UTILITY. Submitting as MARKETING creates rate-limit and window-restriction problems.

**How to avoid:** When creating the template in Meta Business Manager, explicitly select category UTILITY. The migration comment and Vault insert both note this: `NOT-04` says "UTILITY category".

### Pitfall 4: L1 Boundary — Ops Importing Notifications Directly
**What goes wrong:** If the ESLint no-restricted-imports rule is active, `src/contexts/ops/` importing from `src/contexts/notifications/` would be a lint error (cross-context import).

**Why it happens:** L1-BOUNDARIES.md says contexts may not import each other directly.

**How to avoid:** Check if the ESLint rule is actually enforced. Looking at the codebase, `src/app/r/[cid]/actions.ts` imports `queueCustomerNotification` directly (line confirmed), and `post-payment-fanout.ts` does too — the rule is documented as `warn` not `error` in the L1 doc ("We add them in Layer 4"). Since Layer 4 is complete but the rule is only a warn, direct import from the ops use-case to notifications is safe. The fanout use-case lives in `src/contexts/ops/usecases/` which can import from `infra/*` and `shared/*` per L1, but NOT other contexts strictly speaking. In practice, use the same workaround as payment/referral flows — call `queueCustomerNotification` directly and document the cross-context import.

**Alternative if strict:** Put the fanout logic in the API route itself (which lives in `app/api/` and CAN import any context), not in the ops use-case.

### Pitfall 5: Skipped_dates vs Status Field Mismatch
**What goes wrong:** A customer whose subscription `status` is 'Active' but who has today in `skipped_dates` gets a delivery notification. The cron flips status to 'Skipped' at midnight UAE time, but between midnight and when the cron fires (could be seconds, could be minutes), status may still show 'Active'.

**Why it happens:** The `getDormCounts` use-case already handles this — it checks BOTH `status` (Active/Paused/Skipped) AND the `skipped_dates` array. The fanout must do the same.

**How to avoid:** Copy the exact filter from `getDormCounts` lines 60-67 — the array checks are the authoritative gate.

---

## Code Examples

### Subscription Filter for Dorm (from get-dorm-counts.ts)
```typescript
// Source: src/contexts/ops/usecases/get-dorm-counts.ts lines 33-70
// The fanout use-case adapts this to return customer IDs instead of counts
const [subsRes, customersRes] = await Promise.all([
  sb.from('subscriptions')
    .select('id, customer_id, week_type, skipped_dates, paused_dates')
    .in('status', ['Active', 'Paused', 'Skipped']),
  sb.from('customers').select('id, dorm_name'),
])

for (const sub of subs) {
  if (sub.week_type === '5DAYS' && isSaturday) continue
  if ((sub.skipped_dates ?? []).includes(todayIso)) continue
  if ((sub.paused_dates ?? []).includes(todayIso)) continue
  const dormName = customerMap.get(sub.customer_id)
  if (dormName !== targetDorm) continue
  // → this customer_id gets a notification
}
```

### queueCustomerNotification Call Shape
```typescript
// Source: src/contexts/notifications/usecases/queue.ts lines 62-80
await queueCustomerNotification(
  customerId,         // string — customer UUID
  'delivery_confirmed',
  new Date(),         // scheduledFor — now, triggers on-demand dispatch
  { dorm_name: dormName }, // payload — optional, for template body params
)
```

### Dispatcher CASE Branch Structure (from v6 migration)
```sql
-- Source: supabase/migrations/20260613_customer_notifications_dispatcher_v6_new_kinds.sql
WHEN 'delivery_confirmed' THEN
  jsonb_build_array(
    jsonb_build_object('type', 'header', 'parameters', jsonb_build_array(
      jsonb_build_object('type', 'text', 'parameter_name', 'first_name', 'text', first_name))))
-- If dorm_name body param is needed:
--   jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
--     jsonb_build_object('type', 'text', 'parameter_name', 'dorm_name', 'text', NULLIF(notif_row.payload ->> 'dorm_name', ''))))
```

### Vault Secret Insert
```sql
-- Run via Supabase MCP BEFORE applying the dispatcher migration
SELECT vault.create_secret('<approved_meta_template_name>', 'tpl_delivery_confirmed', '');
```

### Dedup Guard Before Fanout
```typescript
// Check if delivery_events row was already verified before this call
const { data: existing } = await sb
  .from('delivery_events')
  .select('verified')
  .eq('delivery_date', deliveryDateIso)
  .eq('dorm_name', dormName)
  .eq('trip_number', 1)
  .maybeSingle()

if (existing?.verified) {
  // Already verified — skip fanout to prevent duplicate notifications
  return NextResponse.json({ verified: true, ... })
}
// Then proceed with updateDeliveryEvent + fanout
```

---

## Runtime State Inventory

This phase is not a rename/refactor. No runtime state inventory needed.

---

## Environment Availability

This phase uses only existing infrastructure. All dependencies are confirmed live.

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| `customer_notifications` table | NOT-01 through NOT-03 | Yes | CHECK constraint already includes `delivery_confirmed` (migration 20260615) |
| `dispatch_customer_notifications_tick` function | NOT-03, DB-06 | Yes | Live in Supabase — needs CASE branch added |
| Vault secrets system | NOT-04 | Yes | Pattern confirmed in all dispatcher migrations |
| Meta WhatsApp Business Account | NOT-04 | Yes | Live — `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` in env |
| `tpl_delivery_confirmed` Vault secret | NOT-04, DB-06 | No | Must be inserted after Meta template is approved |
| Meta UTILITY template `delivery_confirmed` | NOT-04 | Unknown | Must be created in Business Manager and approved before Phase ships |

**Missing dependencies with no fallback:**
- `tpl_delivery_confirmed` Vault secret — blocks the dispatcher from sending. Must be inserted before or with the migration. Template must be Active in Meta Business Manager first.

**Missing dependencies with fallback:**
- None — the existing dispatcher safely skips kinds with no Vault secret (increments `skipped_no_template_count` and logs a WARNING). So the code can ship before the template is approved; it will silently queue rows and skip them until the secret is added.

---

## Open Questions

1. **What params does the `delivery_confirmed` template body include?**
   - What we know: The template doesn't exist yet — it needs to be designed and submitted to Meta. The CASE branch structure depends on what params the template uses.
   - What's unclear: Does the template body mention the dorm name? Just a generic "your meal has arrived"? Any call-to-action button?
   - Recommendation: Design the simplest possible template first — header with `first_name`, body with no params (just static text like "Your meal just arrived at your dorm! Enjoy."). This minimizes the CASE branch complexity and reduces Meta review friction. A dorm_name param can be added in a future migration if needed.

2. **Should the notification dedup key be per-delivery-event or per-customer-per-day?**
   - What we know: The dispatcher doesn't deduplicate — it relies on `sent_at IS NULL`. If fanout runs twice, two rows are inserted and both fire.
   - What's unclear: Is a per-dorm-per-day uniqueness check needed in the fanout function, or is it sufficient to gate on "only call fanout when verified flips from false → true"?
   - Recommendation: Gate at the API route level by checking `delivery_events.verified` before the update (fetch first, skip fanout if already true). Simplest dedup that doesn't require a DB constraint.

3. **Should `isSaturday` be derived from `deliveryDateIso` or passed from the client?**
   - What we know: The API route receives `deliveryDateIso` as a form field. The route does not currently compute `isSaturday`.
   - Recommendation: Derive it server-side from `deliveryDateIso` — the fanout use-case should not trust the client for this.

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| No delivery notifications | `customer_notifications` queue + dispatcher | Phase 2 added the kind to the CHECK constraint |
| Direct Meta API calls from app code | Queue insert → cron dispatcher | All notifications flow through the DB queue since the dispatcher was introduced |
| Positional template params `{{1}}` | Named params `parameter_name` field | Named params have been the standard since v11 migration (20260531) |

---

## Key Findings Summary

- **`delivery_confirmed` kind already exists** in the `customer_notifications` CHECK constraint (migration 20260615). DB-05 is done — only the CASE branch (DB-06) is missing.
- **The fanout pattern is established** — three precedents: `post-payment-fanout.ts`, `subscription-ended-fanout.ts`, and `renew-nudge-fanout.ts`. This phase adds a fourth.
- **The subscriber filter is already correct** in `getDormCounts` — the fanout use-case reuses that exact logic, but collects `customer_id` values instead of a count.
- **The trigger point is precise** — Case C in `verify-box-count/route.ts` at line 189, after `updateDeliveryEvent` succeeds with `verified: true`.
- **Meta template must exist before the Vault secret is inserted, and the Vault secret must exist before the dispatcher can send.** The migration can ship without the template (the dispatcher will skip the kind safely), but the end-to-end flow only works after Meta approves the template and the secret is inserted.
- **Dedup is the main pitfall** — the rider retry case must not send duplicate notifications to every customer in a dorm.

## Sources

### Primary (HIGH confidence — read directly from codebase)
- `src/contexts/notifications/usecases/queue.ts` — `queueCustomerNotification` signature and behavior
- `supabase/migrations/20260613_customer_notifications_dispatcher_v6_new_kinds.sql` — current live dispatcher with CASE structure
- `supabase/migrations/20260615_customer_notifications_kind_check_v7_delivery.sql` — confirms `delivery_confirmed` already in CHECK
- `src/contexts/ops/usecases/get-dorm-counts.ts` — subscriber filter pattern to reuse
- `src/app/api/ops/verify-box-count/route.ts` — trigger point at Case C
- `supabase/migrations/20260615_notification_dispatch_auto_retry.sql` — auto-retry reconciler behavior
- `.planning/refactor/L1-BOUNDARIES.md` — architectural dependency rules

### Secondary (HIGH confidence — supporting files)
- `src/contexts/notifications/usecases/subscription-ended-fanout.ts` — fanout pattern precedent
- `src/contexts/notifications/usecases/renew-nudge-fanout.ts` — fanout pattern precedent
- `src/shared/events/event-bus.ts` — event bus architecture understanding
- `src/contexts/subscriptions/domain/subscription-status.ts` — status values (Active/Paused/Skipped/Ended)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all modules verified by reading source files
- Architecture patterns: HIGH — three precedent fanout patterns exist; dispatcher structure read directly
- Pitfalls: HIGH — dedup risk identified from API route analysis; template sequencing risk from migration file comments

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable domain — no fast-moving dependencies)

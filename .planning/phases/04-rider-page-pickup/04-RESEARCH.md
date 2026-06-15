# Phase 4: Rider Page — Pickup — Research

**Researched:** 2026-06-15
**Domain:** Next.js RSC + Server Actions, Supabase per-dorm subscription counts, SVG dorm shapes, delivery_events INSERT
**Confidence:** HIGH

---

## Summary

Phase 4 builds `/ops/[token]` — the rider's pickup screen. The rider opens this URL on their phone, sees one big tap target per dorm (the same shapes from the printed labels), each showing how many boxes to grab, then taps "Confirm Pickup" to log the event.

Every building block already exists. Token validation, UAE time logic, the subscription count query, and all five dorm shape SVGs are live in the codebase. The page structure is a direct parallel to `/kitchen/[token]`: RSC token-gates with `validateOpsToken(token, 'rider')`, computes per-dorm counts server-side, passes data to a thin `'use client'` component that handles the single interactive moment (the confirm button).

The only genuinely new work is: (1) a `getDormCounts` use-case that groups subscriptions by `customers.dorm_name`, and (2) a Server Action that INSERTs into `delivery_events` with the pickup timestamp. The UI is intentional — large tap targets (80×80px min), 2-column grid, cream/beige palette matching the kitchen page.

**Primary recommendation:** Mirror the kitchen page pattern exactly. RSC owns all UAE time and DB reads. `RiderClient` is the 'use client' shell for the confirm button and the post-confirm transition to "drop-off ready" state (Phase 5 will fill the actual drop-off flow).

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RID-01 | `/ops/[token]` renders dorm buttons with label shapes (Myriad=circle, KSK=square, Yugo=triangle, DSOA=hexagon, Study World=star) | `DORM_SHAPE_MAP` and `dormShapeSvg()` in `src/shared/dorm-shapes.ts` — all five shapes defined with correct SVG paths |
| RID-02 | Dorm buttons are 80×80px min tap targets in 2-column grid with SVG + name label | Pure CSS grid on the client component; shapes render as SVG via `dormShapeSvg()` or inline `SHAPE_PATHS` — no external lib |
| RID-03 | Expected meal count per dorm displayed on each button | New `getDormCounts` use-case — mirrors `getKitchenCounts` but groups by `customers.dorm_name` instead of summing veg/non-veg |
| RID-04 | Rider confirms pickup — timestamp logged to `delivery_events` | Server Action calling `createAdminSupabaseClient().from('delivery_events').insert(...)` with `delivery_date`, `dorm_name`, `expected_count`, `ops_token_id`, `confirmed_at` |
</phase_requirements>

---

## Standard Stack

### Core (all pre-installed, zero new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | ^15.5.14 | RSC page, `notFound()`, async params, Server Actions | Existing; async params pattern from Phase 3 confirmed |
| Supabase JS | via admin-client | `delivery_events` INSERT, subscription/customer SELECT | `createAdminSupabaseClient()` already configured |
| React (client) | 19.2.5 | Confirm button state, post-confirm transition | 'use client' child component, same pattern as `KitchenClient` |
| Montserrat | `var(--font-montserrat)` | Font loaded in root layout | Already available at all weights |

### No New Packages

STATE.md (Phase 2 research): "Zero new npm packages needed — all capabilities from existing stack." Confirmed again for Phase 4.

---

## Architecture Patterns

### Recommended File Structure

```
src/app/ops/
└── [token]/
    ├── page.tsx           # RSC: token validate (role='rider'), per-dorm count, Sunday guard
    └── RiderClient.tsx    # 'use client': dorm button grid, confirm action, state transition

src/contexts/ops/usecases/
├── validate-token.ts      # EXISTS (Phase 2)
├── get-kitchen-counts.ts  # EXISTS (Phase 3)
└── get-dorm-counts.ts     # NEW: per-dorm subscription count query
```

One new Server Action sits either in `page.tsx` (acceptable for a single action) or a co-located `actions.ts` file:

```
src/app/ops/[token]/
├── page.tsx
├── RiderClient.tsx
└── actions.ts             # 'use server': confirmPickup(dormName, expectedCount, tokenId)
```

### Pattern 1: RSC Token Gate with role='rider'

Identical to the kitchen page but with role `'rider'` and route `/ops/[token]`:

```typescript
// src/app/ops/[token]/page.tsx
import { notFound } from 'next/navigation'
import { validateOpsToken } from '@/contexts/ops/usecases/validate-token'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Rider — Dormers',
  other: { referrer: 'no-referrer' },
}

export default async function OpsPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const opsToken = await validateOpsToken(token, 'rider')
  if (!opsToken) notFound()
  // ...data fetch, then <RiderClient ... />
}
```

`notFound()` is the correct way to handle invalid/revoked tokens — no redirect, no error detail. This is exactly how the kitchen page handles it (Phase 3 confirmed).

### Pattern 2: Per-Dorm Count Query (new use-case)

The kitchen page sums veg+nonveg globally. The rider needs counts grouped by dorm. The query is the same subscriptions join, but instead of two counters, it builds a `Map<dormName, count>`.

```typescript
// src/contexts/ops/usecases/get-dorm-counts.ts
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { isVegOnDayName } from '@/contexts/subscriptions/domain/veg-day'

export type DormCounts = Map<string, number>  // dorm_name -> total meal count

export async function getDormCounts(
  todayIso: string,
  dayName: string,
  isSaturday: boolean,
): Promise<DormCounts> {
  const sb = createAdminSupabaseClient()

  const [subsRes, customersRes] = await Promise.all([
    sb
      .from('subscriptions')
      .select('id, customer_id, week_type, skipped_dates, paused_dates')
      .in('status', ['Active', 'Paused', 'Skipped']),
    sb
      .from('customers')
      .select('id, dorm_name, meal_preference_type, veg_days'),
  ])

  const customerMap = new Map<
    string,
    { dormName: string | null; pref: string | null; vegDays: string[] | null }
  >()
  for (const c of (customersRes.data ?? [])) {
    customerMap.set(c.id, {
      dormName: c.dorm_name,
      pref: c.meal_preference_type,
      vegDays: c.veg_days,
    })
  }

  const counts: DormCounts = new Map()

  for (const sub of (subsRes.data ?? [])) {
    if (sub.week_type === '5DAYS' && isSaturday) continue
    if ((sub.skipped_dates ?? []).includes(todayIso)) continue
    if ((sub.paused_dates ?? []).includes(todayIso)) continue

    const cust = customerMap.get(sub.customer_id)
    if (!cust?.dormName) continue

    // Dorm-level count: all meals for this dorm regardless of veg/non-veg
    // (rider carries both types to the same dorm)
    const current = counts.get(cust.dormName) ?? 0
    counts.set(cust.dormName, current + 1)
  }

  return counts
}
```

Key design: `getDormCounts` takes the same three pure-computed params as `getKitchenCounts` — the RSC owns all UAE time logic, the use-case stays pure and testable.

### Pattern 3: Rendering Dorm Shape Buttons

`DORM_SHAPE_MAP` in `src/shared/dorm-shapes.ts` defines all five dorms. Iterate the canonical map order to render a stable 2-column grid. `dormShapeSvg()` generates the SVG string with the dorm number inside the shape — use `dangerouslySetInnerHTML` to render it (same approach the label renderer uses).

```typescript
// Inside RiderClient.tsx — dorm button rendering
import { DORM_SHAPE_MAP, dormShapeSvg } from '@/shared/dorm-shapes'

// Exclude 'Other' from the rider view — only named dorms get delivery
const RIDER_DORMS = Object.entries(DORM_SHAPE_MAP).filter(
  ([key]) => key !== 'Other'
)

// Per button:
{RIDER_DORMS.map(([dormKey, dormInfo]) => {
  const count = dormCounts[dormKey] ?? 0
  const svgString = dormShapeSvg(dormInfo.shape, dormInfo.number, 72, 'light')
  return (
    <button key={dormKey} style={{ minWidth: 80, minHeight: 80, ... }}>
      <div dangerouslySetInnerHTML={{ __html: svgString }} />
      <div>{dormInfo.displayName}</div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{count}</div>
    </button>
  )
})}
```

The RSC converts `Map<string, number>` to a plain `Record<string, number>` before passing as a prop — Maps are not serializable across the RSC/client boundary.

### Pattern 4: Server Action for Pickup Confirmation

```typescript
// src/app/ops/[token]/actions.ts
'use server'

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'

export async function confirmPickup(
  dormName: string,
  expectedCount: number,
  opsTokenId: string,
  deliveryDateIso: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = createAdminSupabaseClient()

  const { error } = await sb.from('delivery_events').upsert(
    {
      delivery_date: deliveryDateIso,
      dorm_name: dormName,
      trip_number: 1,
      expected_count: expectedCount,
      ops_token_id: opsTokenId,
      confirmed_at: new Date().toISOString(),
      verified: false,
    },
    { onConflict: 'delivery_date,dorm_name,trip_number' },
  )

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

Note on upsert vs insert: the `delivery_events` table has `UNIQUE(delivery_date, dorm_name, trip_number)`. Using upsert with `onConflict` lets the rider re-tap confirm without a unique constraint error (idempotent). Phase 5 will fill in `rider_count`, `gemini_count`, `photo_path`, `verified` — the pickup step only sets `expected_count` and `confirmed_at`.

### Pattern 5: UI — Light Cream/Beige, Same Palette as Kitchen

The kitchen page override (owner decision, Phase 3) established the light palette for ops pages. Use the same tokens:

```typescript
const BG       = '#faf8f4'  // cream background
const BG_CARD  = '#ffffff'  // button surface
const NAVY     = '#091825'  // primary text
const MUTED    = '#64748b'  // secondary text
const BORDER   = '#e5e2dc'  // borders
const ORANGE   = '#f57f20'  // brand orange for highlights
const FONT     = 'var(--font-montserrat), Arial, Helvetica, sans-serif'
```

### Pattern 6: Post-Confirm State Transition (Phase 5 handoff)

After pickup confirmation the dorm buttons transition to "drop-off ready" state. Phase 5 builds the actual drop-off flow. Phase 4 just needs to show the state has changed — a visual indicator on each dorm button is enough. This state can live in React local state (no persistence needed — the rider will open the URL again for drop-off which Phase 5 will detect via `delivery_events` row existence).

```typescript
// RiderClient local state
const [pickedUp, setPickedUp] = useState(false)

// After confirmPickup() resolves ok:
setPickedUp(true)
// Render changes: "Confirm Pickup" → "Pickup Confirmed ✓", buttons show "Drop-off ready"
```

### Anti-Patterns to Avoid

- **Pass a Map as a prop to a client component:** Maps are not serializable. Convert to `Record<string, number>` in the RSC before passing.
- **Call `validateOpsToken(token, 'kitchen')` on the ops page:** Must use role `'rider'` or the token check returns null.
- **Use CtaButton on this page:** Memory rule — kitchen and ops pages are standalone, no theme-aware shell. Use inline button with explicit styles.
- **Set `background` shorthand alongside `backgroundImage`:** Memory rule — use `backgroundColor` and `backgroundImage` as separate props.
- **Forget to exclude 'Other' dorm:** `DORM_SHAPE_MAP` has an 'Other' entry for customers without a known dorm. The rider page should only show named dorms. Filter it out before rendering.
- **Compute per-dorm counts in a client component:** Keep count logic in the use-case (pure function, testable). The RSC fetches and passes `Record<string, number>` as a prop.
- **Use `new Date()` inside the Server Action for `delivery_date`:** Must compute `deliveryDateIso` in the RSC (UAE wall time) and pass it as a parameter to the action, not compute it inside the action where the timezone could be wrong.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token validation | Custom role check | `validateOpsToken(token, 'rider')` | Already handles is_active, revoked_at, role; Phase 2 |
| UAE date/time | Custom tz lib | `new Date(Date.now() + 4*60*60*1000)` inline | Pattern used 20+ times in codebase; consistent |
| Dorm SVG shapes | Custom SVG | `dormShapeSvg(shape, number, size, 'light')` | Already battle-tested from label pipeline; Phase 2 move |
| Subscription count per dorm | Raw SQL aggregate | JS loop over `subscriptions + customers` join | Same pattern as kitchen counts and label pipeline; handles 5DAYS/Saturday/skip/pause edge cases |
| Veg/non-veg preference | Custom logic | `isVegOnDayName(pref, vegDays, dayName)` | Religious mix, case-insensitive, tested |
| 404 for bad token | Custom error state | `notFound()` | Next.js standard, no error detail leak |
| delivery_events write | REST POST | Server Action via `createAdminSupabaseClient()` | Service-role client bypasses RLS; consistent with all admin writes |

---

## Common Pitfalls

### Pitfall 1: dorm_name Key Mismatch

**What goes wrong:** `customers.dorm_name` stores exact strings like `'The Myriad'`, `'KSK Homes'`, `'Yugo'`, `'DSOA Residence'`, `'Study World'`. The `DORM_SHAPE_MAP` keys are those exact same strings. If any trimming, casing, or aliasing differs, `counts.get(dormKey)` returns `undefined` for that dorm.

**Why it happens:** The label pipeline's `getDormMapping(cust.dorm_name)` calls `DORM_SHAPE_MAP[dormName] ?? DORM_SHAPE_MAP['Other']` — silently falling back. The rider page must display a count of 0 for a dorm with no matching customers, not crash.

**How to avoid:** Use `counts.get(dormKey) ?? 0` when reading per-dorm counts. Verify by checking the Supabase `customers` table for distinct `dorm_name` values — the Phase 3 research confirmed `customers.dorm_name` is the right column.

**Warning signs:** A dorm shows 0 when admin deliveries page shows non-zero for that dorm.

### Pitfall 2: Sunday — No Deliveries

**What goes wrong:** All subs return 0 counts. Rider sees an empty page with all zeroes.

**Why it happens:** No deliveries on Sunday.

**How to avoid:** Same Sunday guard as the kitchen page — check `aeNow.getUTCDay() === 0` early in the RSC, render a "No deliveries today" message. `getDormCounts` will still work correctly (returns all zeros) but a clear message beats silent zeros.

### Pitfall 3: Map Not Serializable as RSC Prop

**What goes wrong:** Passing `Map<string, number>` from RSC to a client component throws a Next.js serialization error.

**Why it happens:** Next.js RSC-to-client props must be JSON-serializable. Maps are not.

**How to avoid:** Convert in the RSC before passing:
```typescript
const countsRecord: Record<string, number> = {}
for (const [dorm, count] of dormCounts) {
  countsRecord[dorm] = count
}
// Pass countsRecord (plain object) as prop to RiderClient
```

### Pitfall 4: delivery_events UNIQUE Constraint on Re-Tap

**What goes wrong:** Rider taps "Confirm Pickup" twice (e.g., double-tap). A plain INSERT throws a unique constraint error on `(delivery_date, dorm_name, trip_number)`.

**Why it happens:** The table enforces uniqueness per delivery slot.

**How to avoid:** Use `.upsert(..., { onConflict: 'delivery_date,dorm_name,trip_number' })` instead of `.insert()`. Idempotent — second call updates the row with the same data. Phase 5 will then UPDATE that row to add `rider_count`, `gemini_count`, `verified`.

### Pitfall 5: deliveryDateIso from Server Action vs RSC

**What goes wrong:** The Server Action computes `new Date().toISOString().slice(0, 10)` which uses server UTC, not UAE UTC+4. A delivery at 11 PM UAE time would log for the next calendar day.

**Why it happens:** `new Date()` in a Server Action runs at call time in UTC (Node.js default).

**How to avoid:** Compute `deliveryDateIso` in the RSC using the UAE offset pattern and pass it as a parameter to `confirmPickup(dormName, expectedCount, opsTokenId, deliveryDateIso)`. The RSC is already doing this computation for `getDormCounts`.

### Pitfall 6: 5DAYS Plans on Saturday Inflating Counts

**What goes wrong:** Rider sees higher counts on Saturday than actually packed.

**Why it happens:** 5DAYS plans (Mon–Fri) don't deliver Saturday, but `status = 'Active'` still includes them.

**How to avoid:** Same guard as `getKitchenCounts` and the label pipeline: `if (sub.week_type === '5DAYS' && isSaturday) continue`.

---

## Code Examples

### UAE Time Computation (RSC, from Phase 3 — identical pattern)

```typescript
// Source: src/app/kitchen/[token]/page.tsx (Phase 3)
const AE_OFFSET_MS = 4 * 60 * 60 * 1000
const aeNow = new Date(Date.now() + AE_OFFSET_MS)
const aeDow = aeNow.getUTCDay()
const isSunday = aeDow === 0
const isSaturday = aeDow === 6
const todayIso = aeNow.toISOString().slice(0, 10)
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayName = DAYS_OF_WEEK[isSunday ? 1 : aeDow]
```

### DORM_SHAPE_MAP Iteration (from src/shared/dorm-shapes.ts)

```typescript
// Source: src/shared/dorm-shapes.ts
// Keys: 'The Myriad', 'KSK Homes', 'Yugo', 'DSOA Residence', 'Study World', 'Other'
import { DORM_SHAPE_MAP, dormShapeSvg } from '@/shared/dorm-shapes'

// Rider page only shows named dorms (exclude 'Other')
const RIDER_DORM_KEYS = Object.keys(DORM_SHAPE_MAP).filter(k => k !== 'Other')
// ['The Myriad', 'KSK Homes', 'Yugo', 'DSOA Residence', 'Study World']
```

### dormShapeSvg Usage (from src/shared/dorm-shapes.ts)

```typescript
// Source: src/shared/dorm-shapes.ts
// dormShapeSvg(shape, number, size, variant)
// variant 'light' = cream fill (#ede8da) with navy number text (#091825)
// variant 'dark'  = navy fill (#091825) with cream number text (#ede8da)
const svg = dormShapeSvg('circle', 1, 72, 'light')
// Returns SVG string for Myriad's circle shape, 72×72px, light variant
// Embed with: <div dangerouslySetInnerHTML={{ __html: svg }} />
```

### delivery_events Upsert (Server Action)

```typescript
// Source: src/contexts/ops/domain/delivery-event.ts (schema reference)
// + src/infra/supabase/admin-client.ts pattern
'use server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'

export async function confirmPickup(
  dormName: string,
  expectedCount: number,
  opsTokenId: string,
  deliveryDateIso: string,  // computed in RSC, not here — UAE timezone
): Promise<{ ok: boolean; error?: string }> {
  const sb = createAdminSupabaseClient()
  const { error } = await sb.from('delivery_events').upsert(
    {
      delivery_date: deliveryDateIso,
      dorm_name: dormName,
      trip_number: 1,
      expected_count: expectedCount,
      ops_token_id: opsTokenId,
      confirmed_at: new Date().toISOString(),
      verified: false,
    },
    { onConflict: 'delivery_date,dorm_name,trip_number' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Synchronous params `{ params: { token: string } }` | `params: Promise<{ token: string }>` + `await params` | Next.js 15 | Must use async params — same as kitchen page |
| dorm-shapes in `src/app/admin/labels/` | `src/shared/dorm-shapes.ts` with backward-compat re-export at old path | Phase 2 | Import from `@/shared/dorm-shapes`, not the admin path |
| Custom per-route API handlers for simple DB writes | Server Actions (`'use server'` functions) | Next.js 13+ | `confirmPickup` is a Server Action, not an API route — no extra boilerplate, errors surface naturally |

---

## Open Questions

1. **Should the pickup confirm happen per-dorm or as one global "all dorms" action?**
   - What we know: RID-04 says "Rider confirms pickup" with a timestamp. The success criterion says "logs a timestamp to `delivery_events` with the expected count." The table has one row per dorm per day.
   - What's unclear: Is the confirmation one button click that logs ALL dorms at once, or does the rider tap each dorm button to confirm per-dorm?
   - Recommendation: One "Confirm Pickup" button at the bottom that logs all dorms in parallel. The rider picks up from the kitchen as a single trip — they don't confirm dorm by dorm. This also matches Phase 5 more cleanly (drop-off is per-dorm because each dorm is a separate delivery stop).

2. **What if a dorm has zero active subs today?**
   - What we know: `getDormCounts` returns only dorms with at least one active sub. All five DORM_SHAPE_MAP dorms may not have subscribers on a given day.
   - What's unclear: Should zero-count dorms still show on the screen?
   - Recommendation: Show all five dorms always (rider needs to know "0 boxes for DSOA today"), but grey out or de-emphasize dorms with count = 0. Do not create `delivery_events` rows for zero-count dorms on confirm.

3. **Does the Phase 5 drop-off detection use `delivery_events.confirmed_at IS NOT NULL` to decide "pickup confirmed"?**
   - What we know: Phase 5 is out of scope for this phase but the data model must support it.
   - Recommendation: Yes — Phase 5 will check for `confirmed_at IS NOT NULL AND verified = false` to show the drop-off state. Phase 4 must ensure the upsert sets `confirmed_at` to a non-null timestamp.

---

## Environment Availability

Step 2.6: SKIPPED — no new external dependencies. All DB writes use `createAdminSupabaseClient()` with existing env vars (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`). No new services, CLIs, or runtimes needed.

---

## Validation Architecture

`nyquist_validation` is explicitly `false` in `.planning/config.json`. Section skipped.

---

## Sources

### Primary (HIGH confidence)

- `src/shared/dorm-shapes.ts` — `DORM_SHAPE_MAP`, `dormShapeSvg()`, `DormShape` type, all five SVG shape paths
- `src/app/kitchen/[token]/page.tsx` — complete RSC pattern: async params, `validateOpsToken`, UAE time, Sunday guard, `notFound()`, `export const dynamic = 'force-dynamic'`
- `src/app/kitchen/[token]/KitchenClient.tsx` — 'use client' palette, font constants, `router.refresh()` pattern
- `src/contexts/ops/usecases/get-kitchen-counts.ts` — exact query and loop pattern to mirror for `getDormCounts`
- `src/contexts/ops/usecases/validate-token.ts` — `validateOpsToken(token, role)` — `'rider'` is a valid role per CHECK constraint
- `src/contexts/ops/domain/delivery-event.ts` — `DeliveryEvent` type, column names, `isTripleMatch()`
- `src/app/admin/deliveries/page.tsx` — confirmed that `customers.dorm_name` is the column, query pattern for subscriptions + customers join
- `src/app/admin/labels/data.ts` — Saturday/Sunday guards, 5DAYS filter, `getDormMapping(cust.dorm_name)` usage — confirms exact string keys match
- `supabase/migrations/20260615_delivery_events_table.sql` — column names, types, UNIQUE constraint `(delivery_date, dorm_name, trip_number)`, RLS posture (service_role only)
- `supabase/migrations/20260615_ops_tokens_table.sql` — `role CHECK ('kitchen', 'rider')` — confirms 'rider' role exists
- `.planning/config.json` — `nyquist_validation: false`

### Secondary (MEDIUM confidence)

- STATE.md decision log: "ops_tokens stores plain-text high-entropy tokens; validate-token returns null for invalid/revoked/wrong-role tokens (callers render 404)"
- STATE.md: "[Phase 03]: getKitchenCounts takes pre-computed todayIso/dayName/isSaturday — RSC owns all UAE time logic, use-case stays pure"
- REQUIREMENTS.md: RID-01 through RID-04 — exact acceptance criteria

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all imports traced to live files
- Architecture: HIGH — direct parallel to Phase 3 kitchen page; no new patterns
- Per-dorm count query: HIGH — traced from `getKitchenCounts` and deliveries page; difference is groupBy dorm_name not veg/nonveg sum
- delivery_events INSERT: HIGH — schema read from migration file; upsert pattern from Supabase JS docs
- Pitfalls: HIGH — all identified from direct code reading, not inference

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable — no fast-moving external APIs)

# Phase 3: Kitchen Display — Research

**Researched:** 2026-06-15
**Domain:** Next.js RSC dynamic routes, Supabase queries, subscription counting, recipe rendering, dark mobile UI
**Confidence:** HIGH

---

## Summary

Phase 3 builds `/kitchen/[token]` — a dark, ungated, mobile-first page kitchen staff open on any phone to see today's dishes and meal counts. Token validation is already built in Phase 2 (`validateOpsToken`). The count logic already exists in the admin deliveries page and label pipeline. The recipe JSONB shape is defined and seeded. The main work is assembling known pieces into a new route with a dark UI, a 2 PM time-gate for estimated vs confirmed counts, and a 60-second auto-refresh.

Everything needed is inside the existing codebase. No new npm packages are required.

**Primary recommendation:** Compose existing building blocks — `validateOpsToken`, `findDishForDateWithOverrides`, the subscriptions query from the admin deliveries page, and `isVegOnDayName` — into a single RSC page with a thin 'use client' child for the recipe modal and auto-refresh.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOK-03 | `<meta name="referrer" content="no-referrer">` on kitchen page | Add via Next.js `metadata` export or `<Head>` in the RSC |
| KIT-01 | `/kitchen/[token]` shows today's veg + non-veg dish with photo and name | `findDishForDateWithOverrides` for both isVeg=true and isVeg=false |
| KIT-02 | Tap dish card opens full-screen recipe modal with sticky Ingredients/Method/Notes tabs | Client component reading `recipe` JSONB from a separate query on `dishes` |
| KIT-03 | Before 2 PM UAE: estimated approximate veg/non-veg counts labeled "Estimated ~X" | Same query as admin deliveries; `status IN ('Active','Paused','Skipped')` minus today-skipped; check `skipped_dates` for today |
| KIT-04 | After 2 PM UAE: confirmed counts labeled "Confirmed" | Same query; at 2 PM the kitchen prep cutoff has passed so skips are processed |
| KIT-05 | 2 PM cutoff evaluated server-side in RSC, never client-side | `const aeHour = new Date(Date.now() + 4*60*60*1000).getUTCHours()` in the RSC |
| KIT-06 | Dark background, Montserrat font, 18px+ body, 32px+ dish names | Inline styles with `var(--font-montserrat)`; dark palette matching HubClient |
| KIT-07 | Works at 375px mobile and desktop — no login | Ungated route, no auth middleware; responsive CSS |
| KIT-08 | 60-second auto-refresh with "last updated HH:MM" timestamp | Client component with `setInterval(() => router.refresh(), 60000)` |
| KIT-09 | Veg = emerald green (#10b981), non-veg = brand orange (#f57f20) | Hardcoded color constants in the client component |
| ARC-05 | `export const dynamic = 'force-dynamic'` on page route | One-line export at top of `page.tsx` |
</phase_requirements>

---

## Standard Stack

### Core (all pre-installed, no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | ^15.5.14 | RSC page + `notFound()` | Already in use; async params pattern confirmed |
| Supabase JS | (via admin-client) | DB reads for subs + dishes | Existing `createAdminSupabaseClient()` |
| React (client) | 19.2.5 | Recipe modal tab state, auto-refresh | Already in use |
| Montserrat | via `var(--font-montserrat)` | Font already loaded in root layout | `next/font/google` at weights 400–900 |
| Lucide React | ^0.525.0 | Icons if needed | Already installed |

### No New Packages

The STATE.md research note from Phase 2 explicitly confirmed: "Zero new npm packages needed — all capabilities from existing stack." Phase 3 confirms the same.

---

## Architecture Patterns

### Recommended File Structure

```
src/app/kitchen/
└── [token]/
    ├── page.tsx          # RSC: token validate, dish fetch, count fetch, 2PM gate
    └── KitchenClient.tsx # 'use client': dish cards, recipe modal, auto-refresh
```

The ops context gets a new query helper:

```
src/contexts/ops/usecases/
├── validate-token.ts     # EXISTS (Phase 2)
└── get-kitchen-counts.ts # NEW: subscription count query for kitchen
```

A new infra-level helper (or added to menu-catalog.ts):

```
src/infra/supabase/menu-catalog.ts  # EXISTS — findDishForDateWithOverrides already here
```

### Pattern 1: RSC Token Gate with notFound()

```typescript
// src/app/kitchen/[token]/page.tsx
import { notFound } from 'next/navigation'
import { validateOpsToken } from '@/contexts/ops/usecases/validate-token'

export const dynamic = 'force-dynamic'

export default async function KitchenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const opsToken = await validateOpsToken(token, 'kitchen')
  if (!opsToken) notFound()
  // ... rest of data fetch
}
```

`notFound()` throws Next.js's not-found signal — renders the app's `not-found.tsx`. No redirect, no error detail exposed to the client. This is exactly how `src/app/admin/customers/[id]/page.tsx` handles missing resources.

### Pattern 2: UAE 2 PM Time Gate (server-side)

The project uses `Date.now() + 4 * 60 * 60 * 1000` universally for UAE wall time. The shared `src/shared/time/dubai-day.ts` exists but does not expose a raw-hour getter — use the same inline pattern used throughout the codebase:

```typescript
// Inside the RSC, after token validation
const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000)
const aeHour = aeNow.getUTCHours()      // 0–23 in AE wall time
const isPast2pm = aeHour >= 14
const lastUpdated = aeNow.toISOString().slice(11, 16) // "HH:MM"
```

KIT-05 requires this evaluation to happen in the RSC — never pass a boolean flag computed client-side.

### Pattern 3: Meal Count Query (the confirmed count logic)

The admin deliveries page at `src/app/admin/deliveries/page.tsx` is the canonical source for count logic. This is the exact query and logic the kitchen confirmed count must match:

```typescript
// Mirrors src/app/admin/deliveries/page.tsx
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function deliveryDayName(): string {
  const aeDow = new Date(Date.now() + 4 * 60 * 60 * 1000).getUTCDay()
  return DAYS_OF_WEEK[aeDow === 0 ? 1 : aeDow]
}

// In the RSC:
const sb = createAdminSupabaseClient()
const [activeSubsRes, customersRes] = await Promise.all([
  sb.from('subscriptions')
    .select('id, customer_id, week_type, skipped_dates, paused_dates')
    .in('status', ['Active', 'Paused', 'Skipped']),
  sb.from('customers').select('id, meal_preference_type, veg_days'),
])
```

Then count with `isVegOnDayName` from `@/contexts/subscriptions/domain/veg-day`:

```typescript
import { isVegOnDayName } from '@/contexts/subscriptions/domain/veg-day'

const dayName = deliveryDayName()
const todayIso = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)

let vegCount = 0
let nonVegCount = 0

for (const sub of subs) {
  const cust = customerMap.get(sub.customer_id)
  if (!cust) continue
  // Saturday exclusion for 5DAYS plans
  const isSaturday = new Date(Date.now() + 4*60*60*1000).getUTCDay() === 6
  if (sub.week_type === '5DAYS' && isSaturday) continue
  // Skip if today is in skipped_dates (before 2PM = estimated, still exclude)
  if ((sub.skipped_dates ?? []).includes(todayIso)) continue
  if ((sub.paused_dates ?? []).includes(todayIso)) continue

  const isVeg = isVegOnDayName(cust.meal_preference_type, cust.veg_days, dayName)
  if (isVeg) vegCount++
  else nonVegCount++
}
```

**Key distinction — Estimated vs Confirmed:**
- **Before 2 PM (Estimated):** Use `status IN ('Active', 'Paused', 'Skipped')` — include Paused subs because their meals will be skipped today but the subscription is live. Exclude any already in `skipped_dates` for today. Label as "Estimated ~X".
- **After 2 PM (Confirmed):** Same query. By 2 PM, the kitchen cutoff has passed — skips entered after this point do not affect today's prep. Numbers match what the admin deliveries page shows. Label as "Confirmed".

The label pipeline (`src/app/admin/labels/data.ts`) is even stricter: `status = 'Active'` only + `lte('start_date', dateIso)` + `gte('end_date', dateIso)`. The kitchen confirmed count should use the deliveries page pattern (includes Paused/Skipped) for consistency with what the admin sees.

### Pattern 4: Dish + Recipe Fetch

The `recipe` JSONB column is on `dishes` but `findDishForDateWithOverrides` (in `src/infra/supabase/menu-catalog.ts`) does NOT select the `recipe` column — the DishRow type there omits it intentionally. A separate query is needed to fetch recipes:

```typescript
// After getting vegDish and nonVegDish dish names from findDishForDateWithOverrides,
// fetch recipes by matching dish names against the dishes table directly:
const dishNames = [vegDish?.name, nonVegDish?.name].filter(Boolean)
const { data: recipeRows } = await sb
  .from('dishes')
  .select('name, recipe')
  .in('name', dishNames)
```

Or add a new `findDishWithRecipe(date, isVeg)` query in menu-catalog.ts that selects `id, name, description, image_path, recipe` and extends `DishRow`.

**Recipe JSONB structure** (defined in `scripts/seed-recipes.ts`):

```typescript
interface RecipeSection {
  heading: string
  items: string[]       // ingredient lines
}

interface RecipeJson {
  sections: RecipeSection[]   // e.g. [{ heading: "For the Marinade", items: [...] }]
  method: string[]            // ordered cooking steps
  notes: string               // single notes block or ""
}
```

Tabs map directly: "Ingredients" → `recipe.sections`, "Method" → `recipe.method`, "Notes" → `recipe.notes`.

### Pattern 5: 60-Second Auto-Refresh

`router.refresh()` re-runs the RSC without a full page reload. The pattern used across the dashboard:

```typescript
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function KitchenClient({ ... }) {
  const router = useRouter()
  
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(id)
  }, [router])
  
  // Also re-render "last updated" timestamp every minute
  // Pass lastUpdated as prop from RSC (server-rendered HH:MM)
}
```

### Pattern 6: Dark Page with No CtaButton

Memory rule: do not use `CtaButton` on dark pages. HubClient (`src/app/dashboard/dorm-wars/hub/HubClient.tsx`) is the reference for Dormers dark-page styling:

```typescript
// From HubClient — palette to reuse
const BG_DEEP = '#091825'
const BG_MID  = '#1e3a4f'
const CREAM   = '#ede8da'
const GOLD    = '#f57f20'   // brand orange = non-veg color
const BODY    = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

// Veg color (per KIT-09 spec)
const EMERALD = '#10b981'   // emerald-500 — matches DeliveriesClient
```

Inline styles throughout; no Tailwind dark classes.

### Pattern 7: referrer no-referrer Meta Tag

Next.js 15 `metadata` export supports this:

```typescript
export const metadata: Metadata = {
  other: { referrer: 'no-referrer' },
}
```

Or via a layout `<head>` with `<meta name="referrer" content="no-referrer" />` in a local layout file for the `/kitchen` route group.

### Anti-Patterns to Avoid

- **Computing 2 PM gate client-side:** KIT-05 requires server-side evaluation. Never pass `new Date()` from a client component to determine pre/post-2PM — it uses the user's device time, not UAE time.
- **Using CtaButton on the kitchen page:** Memory rule. Use inline button with explicit dark styles and dashed-border disabled affordance.
- **Using background shorthand with backgroundImage in React inline styles:** Memory rule. Use `backgroundColor` and `backgroundImage` as separate longhand properties.
- **styled-jsx scoped rules on motion.div/Link:** Memory rule. Wrap in `:global()` or use plain DOM elements for scoped classes.
- **Importing `MENU_DATA` directly on a dish surface:** Memory rule. Use `findDishForDateWithOverrides` from `src/infra/supabase/menu-catalog.ts` which does the DB-first lookup with static fallback.
- **Setting `end_date` manually for bonus_meals:** Memory rule (unrelated to this phase, but noted for completeness).
- **Fetching recipe inside `menu-catalog.ts` `loadCatalog()`:** The catalog cache wraps the full menu — don't add recipe to it. A targeted per-dish query is faster and avoids bloating the cached response.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UAE timezone | Custom timezone library | `Date.now() + 4 * 60 * 60 * 1000` inline pattern | Consistent with all 20+ existing uses in codebase |
| Token validation | Custom token middleware | `validateOpsToken(token, 'kitchen')` from Phase 2 | Already handles is_active, revoked_at, role check |
| Menu dish lookup | Custom DB query | `findDishForDateWithOverrides(today, isVeg)` | CMS-aware, handles static fallback, week rotation |
| Veg/non-veg per customer | Custom pref logic | `isVegOnDayName(pref, vegDays, dayName)` | Handles religious mix, case-insensitive, tested |
| Daily subscription count | Custom aggregation | Mirror the deliveries page query | Already battle-tested for correctness |
| 404 for invalid token | Custom error page | `notFound()` from `next/navigation` | Renders app-level not-found, no error detail leak |

---

## Common Pitfalls

### Pitfall 1: Sunday Has No Deliveries

**What goes wrong:** The deliveries page has `aeDow === 0 ? 1 : aeDow` — Sunday is mapped to Monday for the day name. The label pipeline returns `noDeliveryReason: 'Sunday — no deliveries'`.

**Why it happens:** Subscriptions don't deliver on Sunday.

**How to avoid:** Check `aeNow.getUTCDay() === 0` early in the RSC. If Sunday, render a "No deliveries today" state instead of counts. Both veg and non-veg dish will be null (jsDow=0 returns null from `findDishForDateWithOverrides`).

**Warning signs:** `vegDish` or `nonVegDish` is null — handle gracefully.

### Pitfall 2: recipe Column Not in menu-catalog.ts's DishRow

**What goes wrong:** `findDishForDateWithOverrides` returns a `Dish` object with no `recipe` field. Trying to read `dish.recipe` gives undefined at runtime.

**Why it happens:** `DishRow` in `menu-catalog.ts` omits `recipe` intentionally (it's kitchen ops data, not customer-facing).

**How to avoid:** Run a second query against `dishes` table selecting `recipe` by the dish's name or id. Do not modify the catalog loader.

### Pitfall 3: 5DAYS Plans on Saturday

**What goes wrong:** Counting all Active/Paused/Skipped subs without filtering 5DAYS on Saturday over-counts by including those customers.

**Why it happens:** `week_type = '5DAYS'` means Mon-Fri delivery only.

**How to avoid:** In the count loop: `if (sub.week_type === '5DAYS' && isSaturday) continue` — same guard as the label pipeline.

### Pitfall 4: paused_dates vs status = 'Paused'

**What goes wrong:** A subscription with `status = 'Paused'` may still have today in `paused_dates`. Or a subscription with `status = 'Active'` may have today in `paused_dates` from a planned pause.

**Why it happens:** The pause system uses both the `status` column and the `paused_dates` array for planned vs immediate pauses.

**How to avoid:** Exclude today from both `skipped_dates` AND `paused_dates` arrays when counting, regardless of `status`. The confirmed count should match only subs actually receiving a meal today.

**Refinement for confirmed count:** The admin deliveries page uses `.in('status', ['Active', 'Paused', 'Skipped'])` and then `isVegOnDayName` to determine the veg flag — it does NOT exclude Paused/Skipped subs from the count (they appear in the queue). For the kitchen confirmed count, we want deliveries actually going out — use `status = 'Active'` only, matching the label pipeline, or explicitly exclude `skipped_dates` and `paused_dates` hits. **Decision for planner:** The success criterion says "accounts for skips/pauses" and "matches the admin deliveries page". The admin page includes Paused and Skipped subs in its total count (87 subs = all live). Use `.in('status', ['Active', 'Paused', 'Skipped'])` and exclude today's skipped/paused dates — this gives the same total the admin sees.

### Pitfall 5: router.refresh() and lastUpdated Timestamp

**What goes wrong:** The "Last updated HH:MM" displays the server render time, but if `router.refresh()` doesn't trigger on the first client mount, it shows a stale time from SSR.

**Why it happens:** The RSC renders the timestamp at request time. The client component shows it until the next `router.refresh()` completes.

**How to avoid:** Pass `lastUpdated` as a prop from the RSC (it's always the current server time). When `router.refresh()` fires, the RSC re-runs and a new `lastUpdated` flows down. This is correct behavior — the client doesn't need to maintain its own clock for this.

### Pitfall 6: Dark Page Body Background

**What goes wrong:** The global CSS has `--background: #ffffff` for light mode. A dark kitchen page inside the same app shell would show white body flash on load.

**Why it happens:** ThemeProvider defaults to `dark` (`defaultTheme="dark"` in layout.tsx), but some surfaces are affected by the system.

**How to avoid:** The `/kitchen/[token]` route has no auth wrapper or theme-aware shell — it's a standalone page. Set `backgroundColor: '#091825'` directly on the outermost container `<div>` using inline styles. Do not rely on CSS variables or theme classes.

---

## Code Examples

### Today's Dishes (verified pattern from menu-catalog.ts)

```typescript
// Source: src/infra/supabase/menu-catalog.ts — findDishForDateWithOverrides
import { findDishForDateWithOverrides } from '@/infra/supabase/menu-catalog'

const aeToday = new Date(Date.now() + 4 * 60 * 60 * 1000)
const [vegDish, nonVegDish] = await Promise.all([
  findDishForDateWithOverrides(aeToday, true),   // isVeg = true
  findDishForDateWithOverrides(aeToday, false),  // isVeg = false
])
// Both can be null on Sunday or if the DB is unseeded
```

### UAE Day and 2 PM Gate

```typescript
// Source: src/app/admin/deliveries/page.tsx + src/app/admin/labels/data.ts
const AE_OFFSET_MS = 4 * 60 * 60 * 1000
const aeNow = new Date(Date.now() + AE_OFFSET_MS)
const aeDow = aeNow.getUTCDay()                // 0=Sun, 1=Mon … 6=Sat
const aeHour = aeNow.getUTCHours()             // 0–23 in AE wall time
const isSunday = aeDow === 0
const isSaturday = aeDow === 6
const isPast2pm = aeHour >= 14
const todayIso = aeNow.toISOString().slice(0, 10)   // "YYYY-MM-DD"
const lastUpdatedHHMM = `${String(aeNow.getUTCHours()).padStart(2, '0')}:${String(aeNow.getUTCMinutes()).padStart(2, '0')}`
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayName = DAYS_OF_WEEK[isSunday ? 1 : aeDow]
```

### Subscription Count Query

```typescript
// Source: mirrors src/app/admin/deliveries/page.tsx
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { isVegOnDayName } from '@/contexts/subscriptions/domain/veg-day'

const sb = createAdminSupabaseClient()
const [subsRes, customersRes] = await Promise.all([
  sb.from('subscriptions')
    .select('id, customer_id, week_type, skipped_dates, paused_dates')
    .in('status', ['Active', 'Paused', 'Skipped']),
  sb.from('customers')
    .select('id, meal_preference_type, veg_days'),
])

const customerMap = new Map(
  (customersRes.data ?? []).map(c => [c.id, c])
)

let vegCount = 0, nonVegCount = 0
for (const sub of (subsRes.data ?? [])) {
  if (sub.week_type === '5DAYS' && isSaturday) continue
  if ((sub.skipped_dates ?? []).includes(todayIso)) continue
  if ((sub.paused_dates ?? []).includes(todayIso)) continue
  const cust = customerMap.get(sub.customer_id)
  if (!cust) continue
  if (isVegOnDayName(cust.meal_preference_type, cust.veg_days, dayName)) vegCount++
  else nonVegCount++
}
```

### validate-token Usage (from Phase 2)

```typescript
// Source: src/contexts/ops/usecases/validate-token.ts (Phase 2 — already exists)
import { validateOpsToken } from '@/contexts/ops/usecases/validate-token'

const opsToken = await validateOpsToken(token, 'kitchen')
if (!opsToken) notFound()
// opsToken is OpsToken — id, token, role, label, is_active, revoked_at
```

### Recipe Fetch (new — recipe column not in menu-catalog)

```typescript
// Direct query for recipe JSONB — NOT via findDishForDateWithOverrides
const dishIds = [vegDish?.name, nonVegDish?.name].filter(Boolean)
const { data: recipeData } = await sb
  .from('dishes')
  .select('name, recipe')
  .in('name', dishIds)

// recipe shape (from scripts/seed-recipes.ts):
// { sections: [{ heading: string, items: string[] }], method: string[], notes: string }
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Params synchronous `{ params: { token: string } }` | `params: Promise<{ token: string }>` + `await params` | Next.js 15 | Must use async params — verified in dish/[id]/page.tsx and customers/[id]/page.tsx |
| Static MENU_DATA for dish names | `findDishForDateWithOverrides` DB-first | Menu CMS milestone (v1.0) | Always use DB-first; never import MENU_DATA on a dish surface |
| Inline UTC+4 everywhere | `src/shared/time/dubai-day.ts` for day helpers | Layered refactor | `dubai-day.ts` exists for day-boundary helpers, but raw `Date.now() + 4*60*60*1000` remains the idiomatic pattern for wall-clock time |

---

## Open Questions

1. **Estimated count: include Paused subs or only Active?**
   - What we know: Admin deliveries page includes `status IN ('Active', 'Paused', 'Skipped')`. Label pipeline uses only `status = 'Active'`.
   - What's unclear: The success criterion says confirmed count "matches the admin deliveries page" — this implies using the deliveries page query.
   - Recommendation: Use `.in('status', ['Active', 'Paused', 'Skipped'])` for both estimated and confirmed, then filter by `skipped_dates`/`paused_dates` for today. This matches admin deliveries page behavior exactly.

2. **Recipe fetch: by dish name or dish ID?**
   - What we know: `findDishForDateWithOverrides` returns a `Dish` object with a numeric `id` (legacy_id) and `name`. The dishes table has a UUID primary key (`id`).
   - What's unclear: The `Dish` type's `id` is the legacy integer, not the UUID.
   - Recommendation: Query by `name` (case-sensitive match with `.in('name', dishNames)`). The name is the canonical link since `findDishForDateWithOverrides` returns it. Alternatively, add `recipe` to a new targeted query function in `menu-catalog.ts`.

3. **No-referrer meta: metadata export or layout head?**
   - What we know: Next.js 15 `metadata` with `other: { referrer: 'no-referrer' }` renders as `<meta name="referrer" content="no-referrer">`.
   - Recommendation: Use `export const metadata = { other: { referrer: 'no-referrer' } }` in `page.tsx`. Clean and co-located.

---

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies — all queries use `createAdminSupabaseClient()` which is configured via existing env vars `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`).

---

## Validation Architecture

nyquist_validation is explicitly `false` in `.planning/config.json`. Section skipped.

---

## Sources

### Primary (HIGH confidence)

- `src/app/admin/deliveries/page.tsx` — confirmed count query pattern, UAE day calculation, `isVegOnDayName` usage
- `src/app/admin/labels/data.ts` — `aeToday()`, `isoDate()`, Saturday/Sunday guards, subscription filter
- `src/contexts/ops/usecases/validate-token.ts` — existing token validation usecase (Phase 2)
- `src/contexts/ops/domain/ops-token.ts` — `OpsToken` type, `isTokenValid()` function
- `src/infra/supabase/menu-catalog.ts` — `findDishForDateWithOverrides`, `DishRow` shape (no recipe field)
- `src/contexts/subscriptions/domain/veg-day.ts` — `isVegOnDayName`, WORKING_DAY_NAMES
- `src/contexts/subscriptions/domain/subscriptions.ts` — `Subscription` type, `skipped_dates`, `paused_dates` arrays
- `src/app/dashboard/dorm-wars/hub/HubClient.tsx` — dark page palette reference (`BG_DEEP`, `CREAM`, `GOLD`)
- `src/app/layout.tsx` — Montserrat loaded at `var(--font-montserrat)`, weights 400–900
- `scripts/seed-recipes.ts` — canonical `RecipeJson` shape: `{ sections, method, notes }`
- `src/shared/time/dubai-day.ts` — shared AE time helpers (not used directly but confirms offset pattern)
- `.planning/config.json` — `nyquist_validation: false`

### Secondary (MEDIUM confidence)

- STATE.md research note: "Zero new npm packages needed" (confirmed by code audit)
- `src/app/admin/customers/[id]/page.tsx` — async params pattern for Next.js 15 dynamic routes

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified all imports and patterns from live code
- Architecture: HIGH — route structure follows established patterns in codebase
- Count logic: HIGH — traced exactly from deliveries page and label pipeline
- Recipe shape: HIGH — defined in seed script, referenced in DB-01/02 requirements
- Pitfalls: HIGH — all from direct code reading, not inference

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable, no fast-moving external APIs)

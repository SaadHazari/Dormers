# Phase 9: iOS Shortcuts + PWA + Polish — Research

**Researched:** 2026-06-16
**Domain:** iOS Shortcuts, PWA manifest, Next.js 15 metadata, admin token rotation UI
**Confidence:** HIGH (Next.js PWA, admin patterns) / MEDIUM (iOS Shortcuts signing constraint)

---

## Summary

Phase 9 has four distinct workstreams: iOS Shortcut files for the owner, PWA manifest for `/kitchen` and `/ops`, iOS meta tags on both page layouts, and a token rotation UI inside the admin panel.

The PWA work is straightforward Next.js 15 — a `manifest.ts` file in `src/app` and `appleWebApp` metadata in the kitchen and ops page files. No layout files exist for those routes yet; the metadata must be exported from the page files themselves. The existing `public/icon.png` is 1024×1024 PNG and can be used directly in the manifest plus resized to 192×192 and 512×512 for the two PWA icon sizes browsers require.

The iOS Shortcut work has a critical constraint: **since iOS 15, `.shortcut` files must be cryptographically signed by Apple's infrastructure to be imported on-device**. You cannot programmatically generate a `.shortcut` binary and AirDrop it. The correct flow is: build the shortcut once inside the Shortcuts app on iPhone, then share it as an iCloud link or a signed `.shortcut` file. This research documents exactly what the shortcut should contain (a "Get Contents of URL" POST to the ops failsafe-send API with bearer auth), but the owner must build it manually in the Shortcuts app once.

The token rotation UI fits naturally inside the admin panel as a new route `/admin/ops-tokens`. It follows the same pattern as every other admin sub-page: RSC page that fetches data, a client component for interactivity, server action for mutation. The `ops_tokens` table already exists and is fully capable of supporting revoke + create in a single transaction.

**Primary recommendation:** Build PWA manifest + iOS meta tags in one plan, build the token rotation admin page in one plan, and document the iOS Shortcut manual creation process with exact shortcut content in a third plan rather than generating binary files.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PWA-01 | iOS Shortcut file generated for each dorm — one-tap delivery confirmation for owner | Shortcut must be built manually in Shortcuts app (signing constraint); research documents exact shortcut content (URL, method, headers, body) |
| PWA-02 | PWA manifest for `/kitchen` and `/ops` routes enabling add-to-home-screen | `src/app/manifest.ts` via Next.js `MetadataRoute.Manifest`; existing 1024×1024 icon.png can be resized to 192/512 sizes |
| PWA-03 | iOS meta tags for standalone display (apple-mobile-web-app-capable, status-bar-style, title) | `appleWebApp` field in `metadata` export on kitchen/ops page.tsx files; Next.js generates correct `<meta>` tags |
| TOK-04 | Token rotation via admin panel without requiring a deploy | New `/admin/ops-tokens` page + server action using `createAdminSupabaseClient()`; insert new token, set old `is_active=false, revoked_at=now()` |
</phase_requirements>

---

## What Already Exists

| Item | Status | Notes |
|------|--------|-------|
| `src/app/manifest.ts` | Does NOT exist | Must be created from scratch |
| Kitchen layout.tsx | Does NOT exist | Only `page.tsx` exists at `src/app/kitchen/[token]/page.tsx` |
| Ops layout.tsx | Does NOT exist | Only `page.tsx` exists at `src/app/ops/[token]/page.tsx` |
| Admin panel | Exists | `/admin` with sidebar, `AdminShell`, `AdminSidebar`, `AdminModal` components ready |
| `ops_tokens` table | Exists in DB | Columns: id, token, role, label, is_active, revoked_at, created_at |
| `public/icon.png` | Exists | 1024×1024 RGBA PNG — usable as source for all PWA icon sizes |
| Production domain | `dormers.ae` | `NEXT_PUBLIC_BASE_URL=https://dormers.ae` in .env.example |

---

## Standard Stack

### Core (all already installed — no new packages needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^15.5.14 | `manifest.ts` route, metadata API | Built-in — no library needed |
| React | 19.2.5 | Admin UI components | Already in project |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `crypto.randomBytes(16).toString('hex')` | Generate new 32-char hex token | In server action — no npm package needed |
| Sharp (optional) | Resize 1024px icon to 192/512 | Only needed if browser complaints about icon sizes; else reference icon.png with correct `sizes` attributes |

No new npm packages are required for this phase.

---

## Architecture Patterns

### PWA Manifest — `src/app/manifest.ts`

```typescript
// Source: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dormers' Ops",
    short_name: 'Dormers Ops',
    description: 'Kitchen and rider operations',
    start_url: '/',
    display: 'standalone',
    background_color: '#ede8da',   // cream — matches kitchen light theme
    theme_color: '#f57f20',         // brand orange — ceiling color per CLAUDE.md
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
```

**Important:** `manifest.ts` in `src/app/` is automatically served at `/manifest.webmanifest` by Next.js. No extra route handler needed. The kitchen and ops pages inherit it from the root app directory.

### iOS Meta Tags — Added to page.tsx metadata exports

Since no `layout.tsx` exists for `/kitchen/[token]` or `/ops/[token]`, iOS meta tags must be added to the existing `metadata` export in each page.tsx. Next.js merges metadata from the nearest page outward.

```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/generate-metadata#applewebapp
// Add to kitchen/[token]/page.tsx and ops/[token]/page.tsx

export const metadata: Metadata = {
  title: 'Kitchen — Dormers',  // existing
  other: { referrer: 'no-referrer' },  // existing
  appleWebApp: {
    capable: true,            // generates: <meta name="mobile-web-app-capable" content="yes">
                              // AND:       <meta name="apple-mobile-web-app-capable" content="yes">
                              // (Next.js emits both for compatibility)
    statusBarStyle: 'default',  // generates: <meta name="apple-mobile-web-app-status-bar-style" content="default">
    title: 'Kitchen',           // generates: <meta name="apple-mobile-web-app-title" content="Kitchen">
  },
}
```

**Note on `apple-mobile-web-app-capable` deprecation:** Next.js 15.0.0 changed the generated tag from `apple-mobile-web-app-capable` to `mobile-web-app-capable`. However, per GitHub issue #74524, iOS Safari still requires the old tag for splash screens and full standalone behavior. The `appleWebApp.capable: true` metadata field in Next.js emits `mobile-web-app-capable`. For guaranteed iOS standalone behavior, also add the old tag via `other: { 'apple-mobile-web-app-capable': 'yes' }`. This is safe to do alongside the new field.

**Correct pattern for full iOS compatibility:**
```typescript
export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kitchen',
  },
  other: {
    referrer: 'no-referrer',
    'apple-mobile-web-app-capable': 'yes',  // belt-and-suspenders for iOS Safari
  },
}
```

### Token Rotation Admin Page Pattern

Follows the exact same pattern as every other admin page (e.g., `src/app/admin/cron/`):

```
src/app/admin/ops-tokens/
├── page.tsx          — RSC: requireAdmin(), fetch all ops_tokens, pass to client
├── OpsTokensClient.tsx  — 'use client': table of tokens + rotate buttons
└── actions.ts        — 'use server': rotateToken(oldId, role, label) server action
```

**Server action for rotation:**
```typescript
// Source: pattern from src/app/admin/pricing/actions.ts
'use server'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import crypto from 'crypto'

export async function rotateToken(
  oldTokenId: string,
  role: 'kitchen' | 'rider',
  label: string,
): Promise<{ ok: boolean; newToken?: string; message: string }> {
  await requireAdmin()
  const sb = createAdminSupabaseClient()
  const newToken = crypto.randomBytes(16).toString('hex')  // 32-char hex

  // Revoke old
  const { error: revokeErr } = await sb
    .from('ops_tokens')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', oldTokenId)
  if (revokeErr) return { ok: false, message: 'Failed to revoke old token' }

  // Insert new
  const { data, error: insertErr } = await sb
    .from('ops_tokens')
    .insert({ token: newToken, role, label, is_active: true })
    .select('token')
    .single()
  if (insertErr || !data) return { ok: false, message: 'Failed to create new token' }

  await logAdminAction(...)
  return { ok: true, newToken: data.token, message: 'Token rotated' }
}
```

**The new URL is:** `https://dormers.ae/kitchen/[newToken]` or `https://dormers.ae/ops/[newToken]`

The admin UI should display the full URL prominently so the owner can copy-paste it. No deploy needed — token validation is always DB-driven (`validateOpsToken` reads live from Supabase).

### Admin Sidebar — Adding `ops-tokens` Entry

The `AdminSidebar.tsx` has a hardcoded `NAV_GROUPS` array (`const NAV_GROUPS = [...] as const`). Adding a new item requires:
1. Add import for a suitable Lucide icon (e.g., `KeyRound` or `RotateCcw`)
2. Add entry to the `'Operations'` group in `NAV_GROUPS`
3. Add corresponding command to `NAV_COMMANDS` in `AdminShell.tsx`

Both files must be edited. The pattern is straightforward — 2-line addition per file.

### iOS Shortcut Manual Build Process

**Critical finding:** iOS Shortcuts files have been cryptographically signed since iOS 15. You cannot generate a `.shortcut` binary programmatically and have it install on a user's device. The correct workflow is:

1. Owner builds the shortcut manually in the iPhone Shortcuts app
2. Shares it as an iCloud link or signed `.shortcut` file
3. Other devices install from the iCloud link

**What the shortcut should contain (document for owner):**

The shortcut uses the "Get Contents of URL" action with these settings:
- **URL:** `https://dormers.ae/api/internal/ops-failsafe-send` (the internal failsafe endpoint) — OR better, a dedicated per-dorm delivery-confirm endpoint that Phase 8 already provides
- **Method:** POST
- **Headers:** `Authorization: Bearer [INTERNAL_RETRY_SECRET]`
- **Request Body:** JSON — `{ "dorm": "The Myriad" }` (per dorm)

**Better target endpoint for owner one-tap:** The existing failsafe route at `/api/internal/ops-failsafe-send` alerts on _missing_ deliveries. For one-tap _confirmation_, the shortcut should call the verify-box-count API route (Phase 5) or the rider confirm action. However, Phase 5 (drop-off verification) is still pending. The clearest path that doesn't depend on Phase 5 is:

- Create a minimal `/api/ops/owner-confirm` POST route that takes `{ dorm, token }` and marks a delivery as confirmed in `delivery_events` — but this is new scope.
- Alternatively, the shortcut fires the _rider_ ops page URL directly: `shortcuts://open-url?url=https://dormers.ae/ops/[riderToken]` — this opens the ops PWA page on the owner's phone so they can confirm visually. This is the simplest, no-new-API approach.

**Recommended approach for PWA-01 (confirmed with scope):** Create a `/api/ops/mark-delivered` endpoint that accepts `{ dorm_name, token }` and logs a delivery_event with `verified: true`. The shortcut POSTs to this with a hardcoded rider token in the Authorization header. One shortcut per dorm.

**Shortcut build instructions for owner:**
1. Open Shortcuts app on iPhone
2. New Shortcut → add "Get Contents of URL" action
3. URL: `https://dormers.ae/api/ops/mark-delivered`
4. Advanced → Method: POST
5. Request Body: JSON → add key `dorm_name` = `The Myriad` (one per dorm)
6. Add header `Authorization: Bearer [ops_token_value]`
7. Name the shortcut "Myriad Delivered"
8. Share as iCloud Link → AirDrop to other devices

**Alternative, no-new-API approach:** Since the shortcut requirement says "tapping fires the delivery confirmation API" — if Phase 5 is complete by Phase 9, the shortcut calls `/api/ops/verify-box-count` directly with a fixed photo placeholder and count. But Phase 5 is pending, so Phase 9 needs its own lightweight endpoint OR must document the shortcut as "open the ops URL" (URL scheme shortcut instead of API call).

**Decision needed from planner:** Define which API endpoint the shortcut calls. Options:
  - A) New `/api/ops/mark-delivered` route (2-3 lines, calls updateDeliveryEvent use-case)
  - B) Open the ops URL in Safari (shortcuts://open-url) — no new API
  - C) Wait for Phase 5 and call verify-box-count

Option A is the right call — lightweight, matches PWA-01 intent, uses existing use-cases.

---

## Icon Assets Needed

The standard PWA requires two icon sizes. The project has `public/icon.png` at 1024×1024.

**Option 1 (recommended):** Use a script or Next.js Image optimization to generate resized copies:
- `public/icon-192.png` — 192×192 pixels
- `public/icon-512.png` — 512×512 pixels

**Option 2:** Reference `icon.png` directly with `sizes: 'any'` — works but Chrome shows a warning in Lighthouse.

**For apple-touch-icon:** iOS uses `apple-touch-icon` link tag. The `icons.apple` field in Next.js metadata generates this:
```typescript
icons: {
  apple: [{ url: '/icon-192.png', sizes: '180x180', type: 'image/png' }]
}
```
180×180 is the canonical iOS touch icon size. Can be a third resize from `icon.png`.

**Practical plan:** Add three resized PNGs (`icon-192.png`, `icon-512.png`, `icon-180.png`) to `public/` using a one-time Node script with the `sharp` package (already likely a transitive dep) or ImageMagick. Then reference them in manifest.ts and page metadata.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PWA manifest serving | Custom API route | `src/app/manifest.ts` (Next.js built-in) | Automatic content-type, caching, no boilerplate |
| iOS meta tag injection | Raw `<meta>` in layout JSX | `metadata.appleWebApp` export | Next.js deduplicates, merges correctly |
| Token generation | UUID or timestamp-based IDs | `crypto.randomBytes(16).toString('hex')` | Already used in the codebase convention (matches TOK-01) |
| `.shortcut` binary generation | `bplist-creator` npm package + signing | Manual owner build in Shortcuts app | Apple signing blocks programmatic file install since iOS 15 |

---

## Common Pitfalls

### Pitfall 1: No `layout.tsx` for kitchen/ops — metadata goes on page.tsx
**What goes wrong:** Trying to create a new `layout.tsx` for `/kitchen/[token]` and adding metadata there. The existing pages already export `metadata` — a new layout would require re-exporting or merging.
**Why it happens:** Other routes (e.g., `/admin`) have layout.tsx files.
**How to avoid:** Add `appleWebApp` and `icons` directly to the existing `metadata` export in `page.tsx` for both kitchen and ops routes. No new layout files needed.

### Pitfall 2: `mobile-web-app-capable` vs `apple-mobile-web-app-capable`
**What goes wrong:** `appleWebApp.capable: true` in Next.js 15 only emits `mobile-web-app-capable`. iOS Safari still needs `apple-mobile-web-app-capable: yes` for standalone splash screens.
**Why it happens:** Next.js 15 followed Chrome's deprecation of the Apple-specific name.
**How to avoid:** Add both via the `other` metadata field (belt-and-suspenders).
**Warning sign:** iOS Safari shows the browser chrome (URL bar) even after "Add to Home Screen."

### Pitfall 3: `manifest.ts` at wrong nesting level
**What goes wrong:** Creating `manifest.ts` inside `/kitchen/` or `/ops/` subdirectories, which serves a scoped manifest only for those routes.
**Why it happens:** Misunderstanding of Next.js file conventions.
**How to avoid:** `manifest.ts` belongs at `src/app/manifest.ts` — the root app directory — so it applies globally and both pages can inherit it.

### Pitfall 4: Admin sidebar `as const` prevents easy addition
**What goes wrong:** TypeScript error when adding a nav item because `NAV_GROUPS` is typed `as const` and `badgeKey` only accepts `'referrals' | 'layer4'`.
**Why it happens:** The `BadgeKey` union type is narrow.
**How to avoid:** The new ops-tokens entry has no badge, so omit `badgeKey` entirely — it's already optional in the existing item type. The `as const` assertion is fine; just add the new item without a `badgeKey` property.

### Pitfall 5: Token display — show once, then gone
**What goes wrong:** The new token value is stored as a plain 32-char hex in the DB. After rotation, the admin UI shows it — but refreshing the page shows `****` (masked). Owner didn't copy it.
**Why it happens:** Tokens are security-sensitive and shouldn't be readable from the DB list endpoint in plaintext after the fact.
**How to avoid:** Return the new token string from the server action and display it in a copy-to-clipboard modal in the client component. The modal should only render once (on action completion), with a "Copy URL" button. The full URL format to show: `https://dormers.ae/kitchen/[token]`.

### Pitfall 6: iOS Shortcut signing — can't just generate a `.shortcut` file
**What goes wrong:** Using `bplist-creator` to generate a binary `.shortcut` file, AirDropping it to the owner's iPhone, and finding it won't import ("Shortcut is not trusted").
**Why it happens:** Apple requires `.shortcut` files to be signed since iOS 15. Third-party generated files fail the signature check.
**How to avoid:** The deliverable for PWA-01 is a written guide with exact shortcut settings + a screenshot of the built shortcut, not a binary file. Owner builds it once in the app.

### Pitfall 7: `theme_color` in manifest.ts vs viewport config
**What goes wrong:** Also setting `theme_color` in the root layout's `viewport` export causes a conflict — browsers pick one.
**Why it happens:** The root `layout.tsx` already exports a `viewport` object.
**How to avoid:** `theme_color` in `manifest.ts` is the canonical source. Do NOT add it to the `viewport` export (which already has `viewportFit: 'cover'`). The manifest value wins for installed PWAs.

---

## Code Examples

### manifest.ts (complete)
```typescript
// Source: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
// Location: src/app/manifest.ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dormers' Ops",
    short_name: 'Dormers Ops',
    description: 'Kitchen display and rider delivery interface',
    start_url: '/kitchen',
    display: 'standalone',
    background_color: '#ede8da',
    theme_color: '#f57f20',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
```

### iOS meta tags on kitchen page.tsx
```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/generate-metadata#applewebapp
// Augment existing metadata export in src/app/kitchen/[token]/page.tsx
export const metadata: Metadata = {
  title: 'Kitchen — Dormers',
  other: {
    referrer: 'no-referrer',
    'apple-mobile-web-app-capable': 'yes',  // belt-and-suspenders (iOS Safari)
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Dormers Kitchen',
  },
  icons: {
    apple: [{ url: '/icon-192.png', sizes: '180x180', type: 'image/png' }],
  },
}
```

### Token rotation server action
```typescript
// src/app/admin/ops-tokens/actions.ts
'use server'
import crypto from 'crypto'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'

export async function rotateOpsToken(
  oldTokenId: string,
  role: 'kitchen' | 'rider',
  label: string,
): Promise<{ ok: boolean; newToken?: string; newUrl?: string; message: string }> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()
  const newToken = crypto.randomBytes(16).toString('hex')

  const { error: revokeErr } = await sb
    .from('ops_tokens')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', oldTokenId)
  if (revokeErr) return { ok: false, message: `Revoke failed: ${revokeErr.message}` }

  const { data, error: insertErr } = await sb
    .from('ops_tokens')
    .insert({ token: newToken, role, label, is_active: true })
    .select('id, token')
    .single()
  if (insertErr || !data) return { ok: false, message: `Insert failed: ${insertErr?.message}` }

  const basePath = role === 'kitchen' ? 'kitchen' : 'ops'
  const newUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/${basePath}/${data.token}`

  await logAdminAction(admin.id, 'ops_token_rotated', { role, label, oldTokenId, newId: data.id })
  return { ok: true, newToken: data.token, newUrl, message: 'Token rotated successfully' }
}
```

### Per-dorm delivery confirm endpoint (new, for PWA-01 shortcuts)
```typescript
// src/app/api/ops/mark-delivered/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validateOpsToken } from '@/contexts/ops/usecases/validate-token'
import { updateDeliveryEvent } from '@/contexts/ops/usecases/update-delivery-event'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { dorm_name, token } = await req.json()
  const opsToken = await validateOpsToken(token, 'rider')
  if (!opsToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Mark delivery as owner-confirmed (no photo/count verification)
  await updateDeliveryEvent({ dormName: dorm_name, verified: true, source: 'owner_shortcut' })
  return NextResponse.json({ ok: true })
}
```

---

## iOS Shortcut — Owner Setup Guide (deliverable for PWA-01)

The plan should produce a Markdown file at `public/shortcuts/README.md` (or inline in the admin panel) with these exact steps:

1. On iPhone, open the **Shortcuts** app
2. Tap **+** → **Add Action** → search for **"Get Contents of URL"**
3. Set **URL** to: `https://dormers.ae/api/ops/mark-delivered`
4. Tap **Show More** → Method: **POST**
5. Request Body: **JSON**
   - Add field: `dorm_name` = `The Myriad` _(change per dorm)_
   - Add field: `token` = `[paste the rider token from admin panel]`
6. Name the shortcut **"Myriad Delivered"**
7. Repeat for each dorm (5 shortcuts total)
8. Share each shortcut: tap the share icon → **Copy iCloud Link** → paste in Notes for distribution

---

## Admin Panel — New Section Structure

New sidebar entry in the `'Operations'` group (between Delivery Queue and Labels):
- **Label:** `Ops Tokens`
- **Href:** `/admin/ops-tokens`
- **Icon:** `KeyRound` from lucide-react

The page shows a table:
| Label | Role | Created | Status | Action |
|-------|------|---------|--------|--------|
| Kitchen Token | kitchen | 2026-06-14 | Active | Rotate |
| Rider Token | rider | 2026-06-14 | Active | Rotate |
| (revoked) | kitchen | 2026-06-12 | Revoked | — |

After clicking **Rotate**, an `AdminModal` shows the new URL with a copy button. No new token is shown in the table (security) — only in the modal immediately after rotation.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code changes (Next.js metadata, server actions, new admin page). No external CLI tools, new services, or runtimes required. Supabase MCP is available for any DB verification needed.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `apple-mobile-web-app-capable` meta tag | `mobile-web-app-capable` (Chrome spec) | Next.js 15.0.0 | Must add old tag manually via `other` for iOS Safari compat |
| `themeColor` in metadata | `theme_color` in manifest.ts / `viewport` config | Next.js 14 | Don't put it in `metadata` export — use `manifest.ts` |
| `next-pwa` npm package | Native `manifest.ts` + service worker | Next.js 13+ App Router | No plugin needed; `next-pwa` is not maintained for App Router |
| Unsigned `.shortcut` binary | iCloud link sharing (signed) | iOS 15 | Cannot programmatically generate installable shortcut files |

**Deprecated/outdated:**
- `next-pwa`: Not compatible with Next.js 15 App Router; don't install it
- `themeColor` in `metadata` export: Deprecated since Next.js 14, use `viewport` or `manifest.ts`
- Unsigned `.shortcut` files: Cannot be imported on iOS 15+ devices without Apple's signing

---

## Open Questions

1. **Which API does the iOS Shortcut call?**
   - What we know: PWA-01 says "fires the delivery confirmation API" — the closest existing endpoint is the 8PM failsafe, but that checks for _missing_ deliveries, not confirms them
   - What's unclear: Does Phase 5 need to be complete first, or does Phase 9 create its own `/api/ops/mark-delivered` stub?
   - Recommendation: Create `/api/ops/mark-delivered` in Phase 9 as a simple owner-auth wrapper around `updateDeliveryEvent`. This is 20 lines and keeps Phase 9 self-contained.

2. **Icon resize — Sharp or manual?**
   - What we know: `public/icon.png` is 1024×1024 and can be resized
   - What's unclear: Is `sharp` already available as a transitive dep (likely yes via Next.js image optimization), or should the plan just include a one-time resize step?
   - Recommendation: Use `sharp` in a one-line Node script during the plan, or resize manually in any image editor. Not worth adding a dependency or npm script just for this.

3. **`start_url` in manifest — `/kitchen` or `/`?**
   - What we know: The manifest is shared across the whole app; `start_url: '/'` is the safe default
   - What's unclear: Should the manifest be scoped specifically to `/kitchen` so only the kitchen page installs as a PWA? Or use `/` and let both pages share the same manifest?
   - Recommendation: Use `start_url: '/'` (root) since both kitchen and ops pages share the same app. iOS add-to-home-screen captures the current URL regardless of `start_url`.

---

## Sources

### Primary (HIGH confidence)
- [Next.js manifest.json docs](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest) — confirmed `manifest.ts` format, MetadataRoute.Manifest type
- [Next.js generateMetadata docs](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#applewebapp) — confirmed `appleWebApp` field, exact HTML output
- [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps) — confirmed icon sizes, manifest.ts placement, install flow
- [Apple Safari Web Content Guide](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html) — confirmed apple-mobile-web-app-capable, status-bar-style, title meta tags

### Secondary (MEDIUM confidence)
- [GitHub issue #74524 vercel/next.js](https://github.com/vercel/next.js/issues/74524) — removal of `apple-mobile-web-app-capable` breaks iOS splash screens; confirmed need to add it manually via `other`
- [drewburchfield/shortcuts-toolkit](https://github.com/drewburchfield/shortcuts-toolkit) — `is.workflow.actions.downloadurl` confirmed as the action identifier for "Get Contents of URL"
- [shortcuts-toolkit reverse-engineering](https://github.com/drewburchfield/shortcuts-toolkit) — bplist format for shortcut files, WFHTTPMethod/WFHTTPHeaders parameters

### Tertiary (LOW confidence — verify against live iOS)
- [zachary7829.github.io Shortcuts file format](https://zachary7829.github.io/blog/shortcuts/fileformat) — iOS 15 signing requirement (one source; needs validation that iOS 18 still blocks unsigned files)
- [Automators Talk forum](https://talk.automators.fm/t/warning-heads-up-in-ios-13-1-you-cannot-import-shortcuts-from-shortcuts-files-only-icloud-links/5593) — historical context on signing requirement

---

## Metadata

**Confidence breakdown:**
- PWA manifest (manifest.ts): HIGH — official Next.js docs, confirmed API
- iOS meta tags (appleWebApp): HIGH — official docs confirmed; apple-mobile-web-app-capable workaround is MEDIUM (community-sourced but widely confirmed)
- Token rotation admin page: HIGH — follows established pattern, all dependencies exist
- iOS Shortcut binary generation: HIGH (that it's blocked) — MEDIUM on exact workaround steps since signing details are reverse-engineered

**Research date:** 2026-06-16
**Valid until:** 2026-09-16 (Next.js manifest API is stable; iOS Shortcut signing policy unlikely to change)

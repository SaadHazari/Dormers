# Phase 1 — DB timeouts + graceful fallback (L1) ✅  — closes macro Critical #1

Branch: `release-it/phase-1-db-timeouts` (stacked on Phase 0)

## The fix
Every Supabase call now inherits a 15s ceiling. Previously ~30 of the highest-traffic
paths used a raw client with NO timeout, so a slow Ohio region could hang an RSC render /
server action / API route until the Netlify wall-clock — a system-wide brownout. This was
the single highest-leverage finding in the audit (cited in 7 of 11 areas).

### Change 1 — user-scoped client (one file, huge coverage)
`src/utils/supabase/server.ts`: added the same `fetchWithTimeout` global.fetch override the
admin client already uses. This covers EVERY authenticated dashboard + funnel read in one
edit — subscriptions-repo, require-user, onboarding, referral claim, dorm-wars, checkout,
profile, menu-review, etc. all go through this client.

### Change 2 — service-role clients (21 files)
Swapped every raw `createClient(url, serviceRoleKey, …)` for `createAdminSupabaseClient()`
(the existing 15s timeout-wrapped factory):
awarder, admin referral-review-queue + layer4-queue actions, dashboard layout / dorm-wars /
profile-security / menu-review (x2), api/dorm-wars (google-review, streak/tick, streak-chest),
api/internal (renew-nudge, start-day, subscription-ended, post-payment-retry), api/referral/
inviter, api/whatsapp (start, check), onboarding, checkout, r/[cid].

## Why it's safe (Prime Directive: never worse)
- Happy path is byte-identical: same client, same queries, same options (the wrapper adds
  `auth.persistSession:false` + timeout — a superset of what the raw calls passed).
- Slow-DB path is strictly BETTER: PostgREST surfaces an aborted fetch as a normal query
  `error` (handled by existing `if (error)` branches) and any harder throw hits the route's
  existing `error.tsx` boundary — a fast, friendly retry instead of a ~26s hang-then-die.

## Verification
- `tsc --noEmit`: clean (the `SupabaseClient<any,any,any>` annotations accept the wrapper)
- `npm run lint`: clean (no unused imports; only pre-existing `<img>` warnings)
- Tests: 313 pass
- `npm run build`: green, 86/86 pages
- Runtime smoke (dev server): `/login` `/onboarding` `/privacy` `/maintenance` → 200, `/` → 307.
  `/onboarding` exercises both the timeout-wrapped user client and a swapped admin client.

## Net
−46 lines (verbose `(url, key)` blocks collapse to the one-line wrapper call). One mental
model for every Supabase call now: it always has a timeout.

## Not in scope (later phases, by design)
- A live slow-DB chaos test that visually exercises the friendly fallback → Phase 9 (Prove it).
- Gemini `streamText` has its own no-timeout issue → Phase 5 (it's not a Supabase client).

## Customer impact
Positive on slow-DB; none on the happy path.

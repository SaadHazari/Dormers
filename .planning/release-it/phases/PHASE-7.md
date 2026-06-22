# Phase 7 — Capacity discipline (L6) ◑ (hot paths)

Branch: `release-it/phase-7-capacity` (stacked on Phase 6)

Kills the full-table customer/subscription scans on the HOTTEST paths — the ones that run
constantly and grow linearly with the customer base. All changes are behavior-preserving (same
data rendered/queued; just bounded fetches).

## Done (hot paths — run thousands of times)
- **`getDormCounts`** (rider page load, every WhatsApp inbound, 8PM failsafe): was fetching ALL
  subs + ALL customers in parallel and joining in memory. Now fetches active subs first, then
  only those customers (`.in('id', activeSubCustomerIds)`). Bounded to the active working set.
- **`queueDeliveryConfirmedNotifications`** (every delivery confirmation): the target dorm is
  known, so it now fetches only THAT dorm's customers (`.eq('dorm_name', dormName)`) + their
  active subs (`.in('customer_id', …)`) instead of scanning everything and filtering in JS. The
  dorm-match check is now enforced by the query.
- **`getKitchenCounts`** (every 60s per open kitchen tab): same scope-to-active-sub-customers
  change, preserving the Phase 3 fail-loud handling (subs error and customers error each surface
  `unavailable: true` + Sentry).
- **KitchenClient 60s refresh**: now skips the refresh while the tab is hidden
  (`document.visibilityState`), so a forgotten kitchen tab stops hammering the DB in the
  background. Catches up on the next visible tick.

## Verification
- `get-kitchen-counts.test.ts` updated for the new sequential+scoped shape (and a test that
  needed non-empty subs so the scoped customers query actually runs) — 5 tests pass
- Full suite: 330 pass; tsc clean; lint clean; build green

## Customer impact
None — identical output (kitchen counts, dorm counts, delivery fanout recipients), just bounded
DB reads. Slightly more reads run sequentially (subs → scoped customers) instead of in parallel,
which is the correct trade for not scanning the whole table; negligible on these low-concurrency
paths.

## Deferred (same safe `.in(ids)` pattern, lower urgency — Phase 7b)
- Admin list pages (payments, deliveries, comms, referrals, credits, admin/dorm-wars) each fetch
  the full customers table purely to name-join a bounded list. Confirmed all five follow the
  identical pattern, so scoping to `.in(ids)` is mechanical + behavior-preserving. Deferred only
  because admin traffic is tiny (1–2 admins, occasional loads) vs. the hot paths above.
- admin/dorm-wars: also add `.limit()` to the lifetime_rewards select.
- Dashboard plan-history `.limit()`/load-more: it's a PER-USER query (bounded by one customer's
  ended plans), not a full-table scan — lowest urgency; needs a customer-facing "load more" so it
  never hides history.
- DB-side aggregate RPC for kitchen/dorm counts: possible later optimization; the `.in(ids)`
  scope already removes the table-size coupling without porting veg-day logic to SQL.

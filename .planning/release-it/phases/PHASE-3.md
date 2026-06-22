# Phase 3 — Kill the silent failures + observability (L5) ✅  — direct CX win

Branch: `release-it/phase-3-silent-failures` (stacked on Phase 1)

The dangerous failure mode the audit kept flagging: code that fails into a *believable wrong
state* with no alert. Three of those, all of which hurt real customers, are now loud.

## 1. Kitchen no longer shows a fake 0/0
- `get-kitchen-counts.ts`: a DB read error used to coalesce to empty arrays → `0 veg / 0 non-veg`,
  which could make the kitchen under-cook or skip a whole service. Now it returns
  `unavailable: true` and reports to Sentry (`captureError`).
- `KitchenClient.tsx`: renders an explicit **"Counts unavailable — check with admin before
  cooking, do not assume zero"** card instead of a fake zero. Normal state unchanged.
- `kitchen/[token]/page.tsx`: the recipe fetch is now best-effort (try/catch → empty map +
  `captureError`) so a recipe-table blip degrades to "dish cards without tap-for-recipe"
  instead of throwing the whole screen.
- New `kitchen/[token]/error.tsx`: friendly, retryable boundary in the light kitchen palette.

## 2. Deliveries marked verified but customers un-notified now alert
`verify-box-count`, `mark-delivered`, `whatsapp-inbound`: the customer-notification fanout was
wrapped in a try/catch that only `console.error`'d — so a delivery could be recorded as
VERIFIED (which suppresses the 8PM failsafe) while customers were never told their food
arrived. All three now `captureError` + `notifyAdmin` so ops can notify customers manually.

## 3. Anniversary credit failure now alerts (architecture-respecting)
`layer4.ts` (domain) used to `console.error` + return null on a credit-deposit failure — a
silently-lost once-a-year payout. The dependency rule (error-level ESLint) forbids the domain
importing infra, so instead the domain now **throws** (after self-healing the marker for retry)
and the single caller — `dashboard/dorm-wars/page.tsx` (app layer, infra-allowed) — does
`captureError` + `notifyAdmin`. Domain stays infra-free. Matches the streak-chest credit-fail path.

## Verification
- New `get-kitchen-counts.test.ts`: 5 tests (fail-loud on either read error, counting, 5DAYS
  Saturday skip, skipped-date) — all pass
- Full suite: 318 pass (was 313)
- `tsc` clean; `npm run lint` clean (boundary rule passed — no infra import in domain)
- `npm run build`: green

## Scope note
This phase delivered the high-value *silent-failure kills* + observability on those exact
paths. The broader "console.error → captureError across all of admin/staff/AI" sweep (to move
those areas' observability scores) is the remaining slice of L5 and rides a later pass.

## Customer impact
Positive: kitchen cooks the right amount (or is told to check), customers get notified when a
fanout would have silently dropped, missed credits surface for manual fix. None on happy paths.

## Not verified live (deferred to Phase 9 / Prove it)
The "counts unavailable" and kitchen `error.tsx` states only appear on a forced DB failure;
exercising them visually is a chaos test (Phase 9). Normal kitchen UI is structurally unchanged.

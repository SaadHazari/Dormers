# Release It! Hardening — Master Plan (6.1 → 10/10)

> Backbone for a slow-but-sure, multi-session hardening of the whole codebase against
> Michael Nygard's *Release It!* framework. Built from the 13-agent audit (see
> `AUDIT.md` companion / workflow run `wf_1494cc14-2e4`). Target: every one of the 12
> areas at a genuine **10/10**, system overall **10/10**.

---

## 0. The Prime Directive (non-negotiable)

**Nothing in this initiative may degrade the customer interaction. Every change is invisible to the customer or actively improves their experience. Never worse.**

This is not a slogan — it changes *how* we ship each fix. Concrete, enforced rules:

1. **A timeout/fail-fast must always resolve to a graceful fallback** — cached data, the
   shipped static fallback, or a friendly "one sec, retrying / message us on WhatsApp"
   state. We never replace a *hang* with a raw *error*. The fallback ships in the **same**
   change as the timeout, or the timeout doesn't ship.
2. **Rate limiters ship in shadow mode first.** Count would-be blocks, block nobody, for a
   real-traffic observation window. Thresholds are set far above measured real usage. The
   limiter **fails open** (limiter error → allow). A blocked request returns a friendly
   429 + WhatsApp escape, never a dead end. Only flip to enforce after shadow data proves
   no real customer is ever hit.
3. **Idempotency, observability, capacity, and config work are internal by construction** —
   zero customer-visible change. These are the safe bulk of the work.
4. **Every customer-facing change gets a headless screenshot at 375px** (the `/tmp/pw-runner`
   recipe) before it merges. Catches what HTML greps can't.
5. **Migrations are expand-only and reversible**, deployed *before* the code that needs them
   (expand → deploy code → backfill → contract later, never destructive in one step).
6. **Each phase is independently shippable and independently revertible.** Anything with a
   customer-facing behavior change goes behind a feature flag with a kill-switch.
7. **Verify-before-next.** Each phase has an explicit verification gate (build + lint +
   targeted tests + screenshot where relevant). Phase N+1 does not start until N is green.
   Per repo rule: pre-push runs `npm run lint`, not just tsc. Never auto-push.

---

## 1. What "10/10" actually means (the bar)

A 9 is "all the audit's fixes done." A **10** additionally requires *Release It!*'s
verification layer — resilience that is **proven, not theoretical**:

| Dimension | 9/10 (fixes done) | 10/10 (proven) |
|---|---|---|
| Anti-patterns | every integration timed out, queries bounded | + no blocked serial awaits anywhere in a hot path; verified by trace |
| Stability patterns | circuit breakers, retries, idempotency present | + breakers/idempotency **verified by failure-injection test** |
| Capacity | pagination, no full-table scans | + a written **capacity model** + one **load/soak test** proving headroom to 3× peak |
| Deployment | env validation, flags, reconciled migrations | + documented **instant-rollback** + canary path + boot-fails-loud config |
| Observability | pino + Sentry in every area | + **deep tiered health**, RED/USE metrics, **SLOs**, burn-rate alerts |
| Chaos | graceful degradation coded for every dep | + each degradation path **exercised by a design-time GameDay/test** |

So the plan has two arcs: **Phases 1–8 take every area to ~9**, then **Phase 9 ("Prove
it") takes the system to 10** by adding the test/metric/SLO/chaos layer on top.

---

## 2. The 8 shared lifts (fix once, raise many)

| ID | Lift | Raises | Areas touched |
|---|---|---|---|
| **L1** | Timeout-wrapped DB everywhere (+ graceful fallback) | anti-patterns, capacity, chaos | Marketing, Dashboard, Dorm Wars, Payments, Cron, WhatsApp, AI |
| **L2** | Stripe client hardening (timeout, retries, refund idempotency, checkout maxDuration) | stability, anti-patterns | Payments, Admin, Staff |
| **L3** | Shared rate limiter (shadow→enforce, fail-open) | anti-patterns (self-denial) | AI, Marketing, Staff, WhatsApp |
| **L4** | Circuit breaker + retry-with-jitter helper; non-WhatsApp alert backup | stability, chaos | system-wide |
| **L5** | Observability extension (pino+Sentry+metrics, kill silent failures) | observability, chaos | Admin, Kitchen, Ops, Staff, Dorm Wars, AI, Cron |
| **L6** | Capacity discipline (kill full-table scans, paginate, parallelize) | capacity | Admin, Ops, Kitchen, Dorm Wars, Dashboard |
| **L7** | Deployment hardening (env validation, flags, cron reconciler, migration drift) | deployment, observability | Platform, Cron, Admin, Staff |
| **L8** | Acquisition fallback (email/SMS OTP) | chaos | Marketing, WhatsApp, Staff |

**L1, L2, L4, L5 alone touch all 12 areas.** Leverage > volume.

---

## 3. The phases

Each phase lists: **Goal · Scope · Customer impact · Verification gate · Score movement.**
Customer impact is asserted explicitly for every phase per the Prime Directive.

### Phase 0 — Foundations (scaffolding, zero behavior change)
**Goal:** Build the shared primitives later phases plug into, wired to *nothing* yet.
**Scope:**
- `infra/http`: resilient client = `fetchWithTimeout` (exists) + retry-with-jitter + a
  circuit breaker (closed/open/half-open). Ships **unwired** (or shadow no-op).
- Rate-limiter module (Supabase token-bucket or Upstash). Ships in **shadow/log-only** mode,
  fail-open, generous defaults.
- Env-validation schema (zod) parsed at boot in `instrumentation.ts` — **warn-only** first.
- Observability helpers: shared `childLogger`, Sentry capture helper, correlation-id convention.
**Customer impact:** none — nothing is wired into a request path.
**Verification:** unit tests for breaker state machine, limiter math, env schema; build + lint.
**Score:** no movement yet; unblocks everything.

### Phase 1 — Timeout + graceful fallback the DB layer (L1)  ⟵ closes Critical #1
**Goal:** Every Supabase call inherits the 15s ceiling; every customer-facing path resolves
a timeout to a *friendly* state, never an error.
**Scope:** swap raw `createClient`/`createAdminClient` → `createAdminSupabaseClient` in
onboarding, referral claim, both `/api/whatsapp` routes, `/api/referral/inviter`, the 4
dorm-wars routes, support-chat, checkout, the 4 `/api/internal` routes; add a fetch timeout
to the **user-scoped** `utils/supabase/server.ts`. **Pair each customer-facing read with a
graceful fallback** (dashboard error boundary already exists; verify referral/onboarding show
a retry, not a 500).
**Customer impact:** **positive** — slow-DB hangs become fast, friendly retries instead of
spinning pages.
**Verification:** screenshot dashboard + onboarding + referral happy path AND simulated-slow
path (inject latency locally); confirm no raw error reaches a customer.
**Score:** Marketing 5.8→7, Dashboard 6.5→7.5, Dorm Wars +, Cron/WhatsApp/AI/Payments +.

### Phase 2 — Stripe money path (L2)
**Goal:** No hung checkouts, no double-refunds.
**Scope:** `infra/stripe/client.ts` → `{ timeout: 8000, maxNetworkRetries: 2 }`;
deterministic `idempotencyKey` on every `refunds.create` (e.g. `refund:{subId}:{kind}`);
`export const maxDuration` on checkout (~26s).
**Customer impact:** **positive** — checkout fails fast and cleanly instead of an 80s spin;
refunds become safe.
**Verification:** complete a real test checkout happy path; unit-test the idempotency key
shape; confirm a forced Stripe timeout returns a clean retryable state.
**Score:** Payments 6.4→7.5, Admin +, Staff +.

### Phase 3 — Kill silent failures + observe the dark areas (L5)  ⟵ direct CX win
**Goal:** No more believable-but-wrong states; the highest-blast-radius ops become visible.
**Scope:**
- Kitchen counts **fail loud** ("counts unavailable", never 0/0) + try/catch recipe fetch +
  `kitchen/error.tsx`.
- Ops: `notifyAdmin` when a *verified* delivery's customer fanout fails (today: silent).
- Dorm Wars: `notifyAdmin` on anniversary credit-fail (today: silent).
- pino + Sentry + correlation IDs into Admin, Kitchen, Ops, Staff, Dorm Wars, AI, Cron;
  alert on money-moving failures.
**Customer impact:** **positive** — customers actually get told their food arrived; kitchen
cooks the right amount; failed credits get caught. Pure satisfaction win.
**Verification:** force each error path locally, confirm the loud state + the alert fires;
screenshot the kitchen "counts unavailable" state.
**Score:** Admin 5.5→7, Kitchen 5.5→7, Ops 5.5→7, Dorm Wars 7→7.5, AI +, Cron 7→7.5.

### Phase 4 — Rate limiting (L3): shadow → tune → enforce
**Goal:** Close the self-denial-of-wallet vectors without ever touching a real customer.
**Scope:** apply the Phase-0 limiter to `/api/chat` (per-IP+session), `/api/whatsapp/start`
(per-IP on top of per-phone), `verifyStaffClaim` (per-IP+email lockout), `/referral/inviter`
(per-IP). **Ship shadow-first**; observe; tune thresholds above real peak; flip to enforce
with fail-open + friendly 429 + WhatsApp escape.
**Customer impact:** **positive / neutral** — protects OTP availability for real users;
real customers never blocked (shadow-proven, fail-open, generous).
**Verification:** shadow logs show zero real-customer hits over the window before enforce;
abuse simulation gets 429; limiter-down → request allowed.
**Score:** AI 4.5→6.5, Marketing +, Staff +, WhatsApp +.

### Phase 5 — Circuit breakers + graceful degradation (L4)
**Goal:** A down vendor degrades gracefully instead of hanging every request; alerts survive
a Meta outage.
**Scope:** wire the Phase-0 breaker into Meta, Stripe, Zoho, ZeptoMail, Gemini clients;
non-WhatsApp backup channel for `send_admin_whatsapp_alert` (email/Sentry); canned AI
"we're busy, message us" fallback; fast-ACK the WhatsApp inbound webhook (queue the fanout).
**Customer impact:** **positive** — during a vendor outage customers see a friendly fallback,
not a hang; messaging keeps flowing.
**Verification:** failure-injection per dependency (force 5xx/timeout), confirm breaker opens,
fallback shows, alert still arrives via backup channel.
**Score:** WhatsApp 6.8→8, AI 6.5→8, Payments +, Cron +, Platform +, Staff +.

### Phase 6 — Acquisition fallback (L8)
**Goal:** A Meta WhatsApp outage no longer halts 100% of signups.
**Scope:** email-OTP fallback across onboarding, referral claim, staff claim, triggered when
Meta send fails repeatedly; distinct "verification temporarily unavailable" state. WhatsApp
stays primary; this is purely additive.
**Customer impact:** **positive** — signup survives a Meta outage; no regression to the
WhatsApp-first happy path.
**Verification:** happy path unchanged (screenshot); forced Meta-down path offers email OTP
and completes signup.
**Score:** Marketing →8.5, WhatsApp →8.5, Staff →8.

### Phase 7 — Capacity discipline (L6)
**Goal:** Nothing scales with table size; nothing hot is serial.
**Scope:** scope admin/dorm-wars customer joins to `.in(ids)`; push dorm filter into the DB
for ops counts + delivery fanout; **paginate** dashboard history + `getAllSubscriptions`
(customer-facing — keep *all* history reachable via "load more", never hide data); bound
kitchen counts (RPC/aggregate) + pause 60s refresh when tab hidden; parallelize serial
fanouts with bounded concurrency.
**Customer impact:** **positive / neutral** — faster admin & dashboard; history stays fully
reachable (improvement, not removal).
**Verification:** confirm dashboard history still surfaces every prior plan via load-more
(screenshot); admin pages load with bounded payload; fanout completes for a large dorm.
**Score:** Admin 7→8.5, Ops 7→8.5, Kitchen 7→8.5, Dorm Wars +, Dashboard 7.5→9.

### Phase 8 — Deployment hardening (L7)
**Goal:** Misconfig fails at boot; runaway features have a kill-switch; cron health is real.
**Scope:** flip env-validation to **fail-fast**; feature-flag/kill-switch convention for
staff program, pricing editor, chat; cron-delivery reconciler (read `net._http_response`,
surface non-2xx into `admin_cron_health`) + backstop re-fire for start-day/failsafe; reconcile
repo-vs-live migration drift with an expand-contract + rollback checklist; `maxDuration` on all
internal/ops routes.
**Customer impact:** **positive (indirect)** — kill-switches let us pause a bad change without
a build; bad deploys never reach customers (boot-fails-loud).
**Verification:** boot fails on a missing key in a test env; toggling a flag pauses the feature
without redeploy; cron health reflects a forced internal-route 500.
**Score:** Platform 7→8.5, Cron 7.5→9, Admin →8.5, Staff →9.

### Phase 9 — Prove it (the 9 → 10 layer)
**Goal:** Turn "fixed" into "verified 10/10" per the *Release It!* bar.
**Scope (per area + system):**
- **Capacity model + load/soak test**: one documented model per area + a load test of the
  webhook + per-minute dispatch fanout to 3× peak against the Supabase pool ceiling.
- **SLOs/SLIs + symptom-based alerting** (error rate, latency, availability) + burn-rate alerts.
- **Deep tiered `/api/health`** (`?deep=1` pings ZeptoMail/Zoho auth + cron freshness).
- **Chaos / GameDay design-time tests**: a scripted failure-injection per dependency that
  *exercises* each graceful-degradation path added in Phases 1/5/6 and asserts the customer
  fallback — so resilience is proven, not assumed. (Design-time, run by us, blast-radius
  controlled — never autonomous in prod.)
- **DB function hardening**: explicit `search_path` on the ~25 SECURITY DEFINER functions;
  revoke stray `EXECUTE`/DML grants (ops_tokens, staff_members, handle_new_user, etc.);
  leaked-password protection; lock public dish-photos bucket listing.
- **Fill test gaps**: `scaleQuantity`, `getKitchenCounts`, OTP/idempotency, breaker, limiter.
**Customer impact:** none (verification + internal hardening only).
**Verification:** the tests/load-runs/chaos-scripts themselves are the verification; each area's
"definition of 10" (Appendix A) is checked off.
**Score:** every area → **10**, system → **10**.

---

## 4. Sequencing & dependencies

```
Phase 0 (foundations) ──┬─> Phase 1 (DB timeouts + fallback)   [Critical #1]
                        ├─> Phase 2 (Stripe)
                        ├─> Phase 3 (silent-fail + observability)  [CX win]
                        ├─> Phase 4 (rate limit: shadow→enforce)   [needs P0 limiter]
                        └─> Phase 5 (circuit breakers)             [needs P0 breaker]
Phase 5 ─> Phase 6 (acquisition fallback)
Phase 1/3 ─> Phase 7 (capacity)        Phase 0/3 ─> Phase 8 (deployment)
ALL ─> Phase 9 (prove it → 10)
```

- **Parallelizable after P0:** 1, 2, 3 are independent and can interleave.
- **P4 needs P0's limiter; P5 needs P0's breaker; P6 needs P5.**
- **P9 is last** — it verifies the degradation paths the earlier phases built.

**Recommended shipping order (CX-safety first, leverage first):**
0 → 1 → 3 → 2 → 5 → 4 → 6 → 7 → 8 → 9.
(P3 before P2 because the silent-failure kills are the most direct customer-satisfaction win
and are pure additions.)

---

## 5. Per-phase definition-of-done checklist (lives in PROGRESS.md as we go)

Each phase is done only when: code merged · `npm run lint` clean · targeted tests green ·
customer-facing screenshot(s) attached · Prime-Directive impact line asserted · revert path
noted. Push to `main` + `Production` together, only when explicitly told.

---

## Appendix A — "Definition of 10" per area (condensed)

- **AI Chatbot** (4.5→10): limiter enforced + breaker + abort/retry + onError + RED metrics +
  cost counter + aggregate prompt cap + load test of chat concurrency.
- **Admin** (5.5→10): `.in(ids)` + pagination + Stripe idempotency + Sentry/alerts + input
  bounds + pricing/menu kill-switch + audit-to-Sentry correlation.
- **Kitchen** (5.5→10): fail-loud counts + observability + recipe try/catch + scaleQuantity
  tests & hardening + ops_tokens grant revoke + bounded counts + visibility-aware refresh.
- **Ops/Rider** (5.5→10): timed outbound fetches + maxDuration + fanout-failure alert + DB-side
  dorm filter + parallel fanout + metrics + failsafe at-least-once + GameDay on Gemini-down.
- **Staff** (5.5→10): claim rate-limit + refund idempotency/timeout + observability + partial
  unique index on live subs + kill-switch.
- **Marketing/Auth** (5.8→10): timeout client + IP cap + inviter limit + breaker + email-OTP
  fallback + parallel claim reads + transactional claim/onboarding RPC + deep health.
- **Payments** (6.4→10): Stripe config + maxDuration + parallel pre-Stripe reads + processed-
  events table (event.id) + retry backoff/jitter + reconcile path + email off sync path + soak.
- **WhatsApp** (6.8→10): timed webhook fetches + fast-ACK/queue + OTP fallback + breaker +
  non-WhatsApp alert backup + verified_at CAS + template smoke check + throughput budget.
- **Dorm Wars** (7→10): timeout clients + Sentry/notifyAdmin + metrics + bounded admin queries
  + server cron backstop + rate-limit tick + batched review-cleanup.
- **Cron/Internal** (7→10): delivery reconciler + timeout clients + maxDuration + fanout cap +
  under-send alert + breaker + migration-drift reconcile.
- **Platform** (7→10): env validation + breaker helper + correlation logging + deep health +
  DB function hardening + load/soak + Stripe/streamText abort.
- **Dashboard** (6.5→10): user-client timeout + history pagination + Gemini abort/breaker +
  Sentry on swallowed errors + capacity model.

---

## Appendix B — Living trackers
- `PROGRESS.md` — phase status, per-phase DoD checkboxes, screenshots, revert notes.
- `AUDIT.md` — the raw 13-agent findings (workflow `wf_1494cc14-2e4`) for evidence/citations.

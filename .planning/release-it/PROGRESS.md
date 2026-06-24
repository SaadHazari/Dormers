# Release It! Hardening — Progress Tracker

Status key: ⬜ not started · 🟡 in progress · ✅ done & verified

| Phase | Title | Status | Notes |
|---|---|---|---|
| 0 | Foundations (http helper, limiter, env schema, obs helpers) | ✅ | branch `release-it/phase-0-foundations`; 35 new tests, 313 total pass, tsc+lint clean, build green; all unwired except warn-only env check at boot |
| 1 | DB timeouts + graceful fallback (L1) — Critical #1 | ✅ | branch `release-it/phase-1-db-timeouts`; user-client timeout + 21 raw service-role clients swapped to the 15s wrapper; tsc/lint/313 tests/build green; runtime smoke 200s; net −46 lines |
| 2 | Stripe money path (L2) | ✅ | branch `release-it/phase-2-stripe`; client timeout 8s + 2 retries; refund idempotency keys (decline/offboard scoped); checkout maxDuration 26; +3 tests (321 total); tsc/lint/build green |
| 3 | Kill silent failures + observability (L5) — CX win | ✅ | branch `release-it/phase-3-silent-failures`; kitchen fail-loud (no fake 0/0) + recipe try/catch + error.tsx; ops fanout-fail alerts (3 routes); dorm-wars anniversary credit-fail surfaces (domain throws → app alerts); +5 tests (318 total); tsc/lint/build green. Broad admin/staff/AI console.error→captureError sweep deferred (later slice of L5) |
| 4 | Rate limiting (L3) shadow→enforce | ◑ | branch `release-it/phase-4-rate-limiting`; durable Supabase store (table+RPC+GC cron) LIVE on Ohio via MCP; 4 endpoints wired in SHADOW (chat/otp-ip/staff-claim/inviter), fail-open; +7 tests (330 total); tsc/lint/build green. ENFORCE flip deferred until shadow data reviewed |
| 5 | Circuit breakers + graceful degradation (L4) | ◑ | branch `release-it/phase-5-circuit-breakers`; Meta WhatsApp breaker (sheds load on outage) + non-WhatsApp admin-alert backup (email→Sentry) + desktop chatbot onError fallback; +2 tests (323 total); tsc/lint/build green. Deferred: Zoho/Zepto/Stripe/Gemini breakers, webhook fast-ACK, streamText abort |
| 6 | Acquisition fallback / email-OTP (L8) | ✅ | branch `release-it/phase-6-email-otp-fallback`; owner chose "email fallback, verify phone later"; reuses existing Supabase email verify + checkout profile gate (no new email table/endpoints/dashboard prompt); send_failed_at signal LIVE on Ohio; whatsapp_verified=false → checkout re-verify; locked UI untouched; tsc/lint/330 tests/build/smoke green |
| 7 | Capacity discipline (L6) | ◑ | branch `release-it/phase-7-capacity`; HOT paths scoped (getDormCounts + fanout dorm-scoped + getKitchenCounts active-sub-scoped + kitchen visibility-aware refresh); behavior-preserving; 330 tests/tsc/lint/build green. Deferred (Phase 7b): admin list pages `.in(ids)` (low-frequency), dashboard history load-more (per-user) |
| 8 | Deployment hardening (L7) | ◑ | branch `release-it/phase-8-deploy-hardening`; fail-fast env (critical-only: Supabase trio) + maxDuration on 7 cron/ops routes + instant DB-backed kill-switches (feature_flags LIVE on Ohio; chat + staff_program wired, fail-open); +14 tests (337 total); tsc/lint/build green. Deferred → 8b: cron reconciler, migration-drift reconcile, DB advisor hardening |
| 9 | Prove it → 10/10 (load/soak, SLOs, chaos, DB hardening, tests) | ◑ | branch `release-it/arc2-prove-it`; DB over-exposed-fn revokes APPLIED+verified live; recipe-scaling tests; /api/health confirmed deep; load harness (scripts/loadtest.mjs) + SLO targets + chaos runbook authored (PHASE-9.md). Remaining: run load/chaos vs safe env, wire SLO alerts, delicate search_path+bucket, cron reconciler (item 4) |

## Per-phase Definition of Done
- [ ] code merged on a branch (never commit straight to main)
- [ ] `npm run lint` clean (Netlify treats no-unused-vars as error)
- [ ] targeted tests green
- [ ] customer-facing change → 375px headless screenshot attached (happy path AND degraded path)
- [ ] Prime-Directive impact line asserted (none / positive — never worse)
- [ ] revert path noted
- [ ] push only when explicitly told (main + Production together)

## Score ledger (update as phases land)
System: 6.1 → … → target 10

| Area | Start | Now | Target |
|---|---|---|---|
| AI Chatbot & Support | 4.5 | 7.0 | 10 |
| Admin Panel | 5.5 | 7.5 | 10 |
| Kitchen Panel | 5.5 | 8.2 | 10 |
| Delivery Rider / Ops | 5.5 | 7.5 | 10 |
| Staff / Intern | 5.5 | 7.5 | 10 |
| Marketing + Auth | 5.8 | 8.5 | 10 |
| Payments / Checkout | 6.4 | 7.5 | 10 |
| User Dashboard | 6.5 | 7.5 | 10 |
| WhatsApp Messaging | 6.8 | 8.7 | 10 |
| Dorm Wars | 7.0 | 8.0 | 10 |
| Cron / Internal | 7.0 | 8.5 | 10 |
| Platform / Infra | 7.0 | 9.5 | 10 |

_Phases 0–8 + Arc 1 (items 1–3) landed. System ~6.1 → ~8.2. Arc 1 finished most partials: item 1 (Zoho breaker + Gemini bound + webhook timeouts = L4/5b), item 2 (admin capacity = 7b), item 3 (observability sweep = L5). Branch `release-it/arc1-finish-partials`._

_Remaining: Arc 1 item 4 (cron reconciler + migration-drift — DEFERRED, live cron surgery, see ARC1.md), rate-limit shadow→enforce flip (after data review), and Phase 9 prove-it (load/soak, SLOs+alerting, chaos tests, DB advisor hardening). Minor leftovers: ZeptoMail breaker, webhook fast-ACK, dashboard history load-more, lower-stakes console.errors._

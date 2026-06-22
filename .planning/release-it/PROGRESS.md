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
| 7 | Capacity discipline (L6) | ⬜ | |
| 8 | Deployment hardening (L7) | ⬜ | |
| 9 | Prove it → 10/10 (load/soak, SLOs, chaos, DB hardening, tests) | ⬜ | |

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
| AI Chatbot & Support | 4.5 | 6.0 | 10 |
| Admin Panel | 5.5 | 6.0 | 10 |
| Kitchen Panel | 5.5 | 7.0 | 10 |
| Delivery Rider / Ops | 5.5 | 6.5 | 10 |
| Staff / Intern | 5.5 | 6.5 | 10 |
| Marketing + Auth | 5.8 | 8.5 | 10 |
| Payments / Checkout | 6.4 | 7.5 | 10 |
| User Dashboard | 6.5 | 7.5 | 10 |
| WhatsApp Messaging | 6.8 | 8.5 | 10 |
| Dorm Wars | 7.0 | 7.7 | 10 |
| Cron / Internal | 7.0 | 7.4 | 10 |
| Platform / Infra | 7.0 | 7.5 | 10 |

_Phases 0 + 1 + 3 + 2 + 5 + 4 + 6 landed. System ~6.1 → ~7.6. Phase 6 (email-OTP fallback) lifted Marketing + WhatsApp (acquisition survives a Meta outage). Partial phases: 5 (vendor breakers/webhook fast-ACK) + 4 (shadow→enforce flip). Remaining: 7 capacity, 8 deploy, 9 prove-it; plus the L5 admin/staff/AI Sentry sweep._

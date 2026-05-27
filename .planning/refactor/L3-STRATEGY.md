# Layer 3 — Refactor Strategy

**Status:** proposal, awaiting approval before any code moves
**Date:** 2026-05-27
**Skill used:** pragmatic-programmer (Hunt & Thomas)
**Predecessors:** [L1-BOUNDARIES.md](./L1-BOUNDARIES.md), [L2-MODULE-SHAPES.md](./L2-MODULE-SHAPES.md)

---

## The decision this doc makes

L1 said where the rooms go. L2 said the shape of each room. L3 answers: **do we renovate the whole house in one weekend, or one room at a time?** And how do we make sure the house stays livable while we work?

**Decision: tracer bullets, twelve phases, lowest-risk first, no big bang.** Old paths stay alive via re-export shims until the very last phase. Every phase ends with a working app, lint clean, build clean.

---

## The risk landscape (why "cautious" matters here)

Five things make this refactor more dangerous than the average:

1. **No automated tests at start.** Only `next lint` + `next build` + manual smoke tests. **Mitigation added 2026-05-27:** we introduce `vitest` in Phase 0 and write characterization tests (Feathers-style behavior lock-in tests) per phase, focused on pure-function domain code. Server actions, API routes, and React components stay covered by build + manual smoke.
2. **Production app with real customers + money flowing.** Stripe webhooks, WhatsApp queues, Zoho invoices — silent failures here cost real revenue.
3. **Two deploy branches (`main` + `Production`), Netlify on a paid plan.** Every push burns build credits. Strategy must minimize push count.
4. **Active feature work in flight.** Long-running refactor branches will rot. Each phase must be small enough to merge same-week.
5. **Pre-push runs `npm run lint`, not just tsc.** Netlify treats unused imports as errors. That's actually helpful here — it catches half-finished moves.

The Pragmatic Programmer answer to "no safety net + production system + concurrent feature work" is unambiguous: **tracer bullets, not big bang.** Build one thin end-to-end slice. Verify it works. Repeat.

---

## Strategy by principle

### DRY — every business rule has one home

After the refactor, the rules `LIVE_SUBSCRIPTION_STATUSES`, the kitchen-cutoff time (14:00 AE), the canonical WhatsApp number, the CID format, the end-date math — each lives in exactly one file that everything else imports. Today most of these are already SSOTs in `lib/`, just sitting in the wrong neighborhood. The refactor relocates them; it doesn't multiply them.

### Orthogonality — change one room without breaking another

The dependency rule from L1 is what enforces this. By the end of the refactor, changing the Stripe SDK touches `infra/stripe/` and nothing else. Changing the WhatsApp template language code touches `contexts/notifications/`. Changing the skip-meal rule touches `contexts/subscriptions/`. The whole point is to make the "what would I have to touch to change X" answer be one folder.

### Tracer bullets — prove the pattern before scaling it

The first context that gets refactored (menu — section below) is the tracer bullet. It validates: folder structure, import aliases, ESLint rules, the repository-interface pattern. If any of that is wrong, the cost of fixing it is one small context, not the whole codebase.

### Reversibility — keep the old paths alive

This is the most important pragmatic trick for this refactor. **For every file that moves, the old path becomes a one-line re-export shim** until the very last phase:

```ts
// src/lib/auth-helpers.ts  (after move, before cleanup)
export { requireUser } from '@/contexts/identity/usecases/require-user'
```

This means:
- Existing imports keep working without touching every call site at once.
- A phase can move ONE file at a time without breaking the build.
- If something breaks, `git mv` back. Reversible.
- Final cleanup phase deletes all the shims.

### Broken windows — no half-finished phases on `main`

Every phase ends in a working app. No phase leaves "TODO: move the rest of these queries". A half-done refactor is worse than no refactor.

### Design by contract — preserve every public signature

The refactor is structural, not semantic. Every server action, API route, and exported function keeps its exact public signature. The shim layer makes that enforceable — if the signature changes, the shim breaks at compile time.

### Estimation — honest ranges, not single points

Per phase, I'll commit a range (PERT-style: optimistic, likely, pessimistic). See the phase table below.

---

## Phase plan — twelve phases, low-risk first

Ordering principle: **each phase is independently shippable, leaves the app working, and proves something the next phase will rely on.**

| # | Phase | Risk | Estimate (h) | Why this order |
|---|---|---|---|---|
| 0 | **Foundation** — folder skeleton, tsconfig paths, ESLint rule (warn level), `vitest` setup + first characterization tests | Very low | 2-3 | Must come first; no behavior change. Test scaffold lands here so every later phase can use it. |
| 1 | **Menu (tracer bullet)** — extract `MenuRepository` interface, wrap `menuData.ts` | Very low | 2-3 | Smallest context; validates the whole pattern with zero domain risk. |
| 2 | **Shared time helpers** — pull `ae9amUtcOnDate` and `nextEligibleDeliveryDay` into `shared/time/` | Low | 1-2 | Pure functions, touches every later phase. Do early. |
| 3 | **Dorm Wars** — relocate `lib/dorm-wars/` + absorb its queries from `queries.ts` | Low | 4-6 | Already deep modules; biggest single chunk of `queries.ts` cleared. |
| 4 | **Chatbot** — relocate `chatBus`, `chatbot-knowledge`, `api/chat` | Low | 1-2 | Small, isolated. Validates UI-ring shape. |
| 5 | **Notifications** — extract context + `infra/meta-whatsapp` + `infra/zeptomail` | Medium | 4-6 | Silent failures possible; verify dispatcher cron still ticks. |
| 6 | **Referrals** — move `app/r/[cid]` + actions, introduce explicit event boundary with webhook | Medium | 3-5 | First time we replace a cross-context import with an event dispatch. |
| 7 | **Payments** — Stripe behind `infra/stripe`, extract `handleStripeEvent` use-case | High | 6-8 | Money. Manual webhook test required (Stripe CLI replay). |
| 8 | **Subscriptions** — split `dashboard/actions.ts`, move review queries | **Highest** | 8-12 | Touches every dashboard action. Smoke-test every modal in dev. |
| 9 | **Identity** — relocate `requireUser`, OTP routes, validators | Medium | 3-5 | Done late so the `requireUser` shim in `lib/` keeps every earlier phase compiling. |
| 10 | **Admin** — move existing queues, set up structure for future growth | Low | 2-3 | Defers user's planned admin expansion to a clean foundation. |
| 11 | **Cleanup** — delete all shims, tighten ESLint to error level, kill empty `lib/`, `queries.ts`, `actions.ts` | Low | 2-3 | Final pass. The repo never looked like this before. |
| 12 | **L5 polish** (clean-code skill) | Low | open-ended | Naming + function size + comment discipline. Time-boxed. |

**Total estimate:** 43-65 hours of focused work (was 37-57 before characterization tests were added), spread across 2-4 weeks of calendar time depending on how many feature interruptions land.

**Cost per phase to push:** one Netlify build. Probably 1 push per 2-3 phases bundled, so 4-6 deploys total — not 12.

---

## Validation gates (after EVERY phase)

Before I commit and report a phase done:

1. `npm run lint` — passes with zero new warnings. (Per memory rule: lint catches what tsc misses.)
2. `npx tsc --noEmit` — passes.
3. `npm test` — all characterization tests pass. (New after Phase 0.)
4. `npm run build` — succeeds. This is the proxy for "didn't break a server component import."
5. **Manual smoke test of the affected surface** in dev. Tied to the phase:
   - Phase 1 (menu): the marketing menu carousel renders.
   - Phase 3 (dorm wars): hub page loads, streak counter shows.
   - Phase 5 (notifications): inspect one queued notification in Supabase.
   - Phase 7 (payments): Stripe CLI replays a `checkout.session.completed` event; webhook handler completes.
   - Phase 8 (subscriptions): pause + skip + resume one test subscription end-to-end in dev.

If any gate fails, the phase rolls back. `git reset --hard HEAD~1` and rethink.

---

## What "with caution" means operationally

Concrete safety rails for this refactor:

1. **One commit per logical move.** Not one commit per phase — many small commits within each phase, each individually revertible.
2. **`git mv`, not delete+create.** Preserves blame history. If a file is renamed AND modified in the same commit, git tracks it; if both happen in separate steps in one commit, it doesn't.
3. **No pushes without explicit ask.** Per memory rule. I commit freely; you push when you're ready.
4. **Shims stay until Phase 11.** A move + delete in the same phase is risky. A move + shim is safe.
5. **No drive-by edits.** If I notice a bug or a smell during the refactor, I write it down in `.planning/refactor/FOLLOWUPS.md` and keep moving. Mixing fixes with moves makes the diff impossible to review.
6. **Each phase gets its own todo list.** I'll keep TodoWrite tracking the active phase's sub-tasks so progress is visible.

---

## Rollback plan

Per phase, if the validation gate fails:

| Failure mode | Rollback |
|---|---|
| Lint error after move | `git reset --hard HEAD~1`, fix the import in the calling file, redo the move. |
| Build fails (type error) | Same as above — usually a missed shim or a typo. |
| Smoke test fails in dev | `git reset --hard HEAD~1`, investigate WHY in a separate branch, restart phase. |
| Bug discovered after merge to `main` (caught before push) | Same — `git reset --hard origin/main`, redo. |
| Bug discovered AFTER push to Production | `git revert <commit>`, push the revert. Shims make this safe — most reverts are clean. |

Worst-case revert: the shim layer means even an aborted phase leaves the app working, because the old paths still re-export.

---

## What this strategy explicitly REJECTS

- **One-shot mega-refactor PR.** Too big to review, too big to test, too big to revert if anything breaks.
- **Branch off main for the whole refactor.** Long-running branches rot when feature work merges. We refactor on main with shims, not on a 6-week branch.
- **Refactoring the UI at the same time.** Per L1: the refactor moves code, it never restyles surfaces. Onboarding dark-mode, sidebar Now tray, all visual locked.
- **Adding the menu CMS during the refactor.** Tracer bullet first (Phase 1), CMS comes as a milestone AFTER L5 lands.
- **Touching the database schema.** Schema is unchanged. Only code moves. New tables (menu CMS) come later.
- **Rewriting `post-payment/fanout.ts`.** Already 9/10. Just moves.

---

## Knowledge portfolio note

Two patterns this refactor will leave behind that we can use elsewhere:

1. **Repository-interface-in-domain, implementation-in-infra.** Once Phase 1 proves it, the same shape applies to every future feature that touches the DB. New code starts cleaner because the template exists.
2. **Re-export shim during migration.** Useful any time we want to relocate a module without flag-day-style coordination across the codebase.

---

## The kickoff question

I have everything I need to start Phase 0 (foundation — folders, paths, ESLint rule at warn level, zero behavior change). It's 1-2 hours of low-risk plumbing.

But the cautious move is to stop here, let you scan this strategy doc, and explicitly green-light Phase 0 before I touch a single file. Two specific things worth your eyes:

1. **The order.** I put Subscriptions at Phase 8 (highest risk, done late). If you have a feature landing soon that touches `dashboard/actions.ts`, we should swap that one earlier or hold until after.
2. **The shim approach.** It means `src/lib/` will look largely unchanged on `main` until Phase 11 — old paths keep working via one-line re-exports. That's intentional; it's the only safe way without tests. Just want you to know that's what you'll see.

If both are fine, I proceed to Phase 0.

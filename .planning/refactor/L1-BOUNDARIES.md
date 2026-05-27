# Layer 1 — Boundaries

**Status:** proposal, awaiting approval before any file moves
**Date:** 2026-05-27
**Skills used:** domain-driven-design, clean-architecture
**Author:** Claude (Opus 4.7) with Saad Hazari

---

## What this doc decides

Where the lines go in this codebase: which folder owns which logic, what each piece is allowed to import from, and what counts as shared vs context-specific. Nothing in this doc moves code. Layer 4 does that.

---

## Where we are now

`src/` has four top-level folders that mix concerns:

- `src/app/` — Next.js pages, API routes, and `actions.ts` files. Includes a 1091-line `dashboard/actions.ts` and a 663-line `webhook/route.ts` that each blend 4-5 concerns.
- `src/lib/` — flat dump of 23 loose `.ts` files plus 5 subfolders. Auth helpers sit next to meal-planning rules sit next to WhatsApp API clients sit next to UI tokens (motion, glass). Nothing prevents a UI component from importing the WhatsApp Cloud API client.
- `src/utils/supabase/` — mis-labeled. Half is genuine infrastructure (clients, middleware). Half is `queries.ts` (697 lines) which is domain query logic dressed as a utility.
- `src/components/`, `src/hooks/` — small, fine as is.

**Diagnosis from clean-architecture:** the dependency rule is silently violated everywhere. There are no enforced inward-pointing dependencies because there are no rings.

**Diagnosis from DDD:** the ubiquitous language is already in the user's head (auth, meal planning, payments, dorm wars, notifications) but the folder structure doesn't reflect it. `src/lib/` is a single namespace pretending the whole app is one bounded context.

---

## The bounded contexts

Nine contexts identified from the code's actual language. Each has its own model and may use the same word ("customer", "subscription") differently than the others.

| # | Context | Strategic class | What it owns |
|---|---|---|---|
| 1 | **identity** | generic + WhatsApp-OTP twist | login, signup/onboarding, profile, OTP, password, name/phone/dorm validation |
| 2 | **subscriptions** | **CORE DOMAIN** | plans, the live subscription, preferences (pending vs effective), end-date computation, skip/pause, veg-day rules, weekly + monthly review |
| 3 | **payments** | generic (Stripe) + supporting (post-payment fanout) | checkout creation, Stripe webhook, invoice statuses, Zoho invoicing, post-payment day-1 onboarding |
| 4 | **notifications** | supporting | WhatsApp template queue, email send, language-code routing, dispatcher tick |
| 5 | **dorm-wars** | **CORE DOMAIN** | streaks, layer4 quests, coupon synthesis, doublers, Google-review verification, awarder, RNG |
| 6 | **referrals** | supporting | the `/r/[cid]` flow, inviter credit on conversion, trial-delivery scheduling |
| 7 | **menu** | supporting | the static meal catalog, dish images, allergens, veg/nonveg mapping |
| 8 | **chatbot** | supporting | AI chat support, knowledge base, open/close bus |
| 9 | **admin** | supporting | internal queues (layer4-queue, referral-review-queue), admin auth |

**Why subscriptions and dorm-wars are core:** they are the competitive advantage. Anybody can wire up Stripe + Supabase + WhatsApp. Nobody else has the kitchen-ops-aware end-date rules, the religious-mix veg-day mapping, or the dorm-wars gamification system. Per DDD strategic design, these get the deepest modeling and the strictest boundaries.

**Why identity is "generic + a twist":** auth-with-OTP is largely commodity, but the WhatsApp-OTP flow is custom enough that swapping it for off-the-shelf would be painful. Keep it; don't over-invest.

---

## The shared kernel

Things that genuinely cross all contexts. Kept small on purpose — DDD treats the shared kernel as dangerous because two teams co-owning code creates coupling. Anything that doesn't have to be here goes into a context instead.

| File / module | Used by | Why it's shared |
|---|---|---|
| `contacts.ts` (WhatsApp canonical URL) | identity, subscriptions, marketing, dashboard | One brand fact. Memory rule: only `wa.me/971504619384`. |
| `phone.ts` (E.164 normalize) | identity, admin, payments | Pure transform, no domain rules. |
| `cid.ts` (CID generator) | identity (onboarding), referrals (trial-claim) | Trial→subscription identity must use the same formula. |
| `validation.ts` (alpha-name, password rules) | identity, profile updates | Pure validators, no I/O. |
| Time helpers (Asia/Dubai day boundaries) | subscriptions, notifications, referrals | Kitchen-ops calendar is one truth across contexts. |

**What is NOT shared:** `monthly-review.ts`, `weekly-review.ts`, `preferences.ts`, `end-date.ts`, `subscription-status.ts`, `plans.ts` — all of these are subscriptions-context domain code that happens to be used in multiple subscriptions surfaces (dashboard, webhook, checkout). They stay inside `subscriptions/`, not in shared.

---

## The infrastructure ring

External adapters. None of these contain business rules. They wrap third-party APIs in our domain language and live at the outermost ring per clean architecture.

| Adapter | Wraps | Replaces today |
|---|---|---|
| `infra/supabase` | Supabase clients + middleware | `src/utils/supabase/{client,server,middleware}.ts` |
| `infra/stripe` | Stripe SDK | inline `new Stripe(...)` calls in `api/checkout` and `api/webhook` |
| `infra/meta-whatsapp` | Meta WhatsApp Cloud API | `src/lib/whatsapp.ts` |
| `infra/zeptomail` | ZeptoMail email client | `src/lib/email/zeptomail-client.ts` |
| `infra/zoho` | Zoho invoice API | `src/lib/zoho/*` |

The dependency rule says these are imported BY contexts (in their use-case layer), never the other way around. The Stripe SDK must not appear in any `domain/` file anywhere.

---

## The UI ring

Cross-context presentation primitives. These currently sit confused inside `src/lib/`.

| What | Goes to | From |
|---|---|---|
| Motion ease curves | `ui-system/tokens/motion.ts` | `src/lib/motion.ts` |
| Glassmorphism tokens | `ui-system/tokens/glass.ts` | `src/lib/glass.ts` |
| Auth-funnel theme tokens | `ui-system/tokens/auth-theme.ts` | `src/lib/auth-theme.ts` |
| `cn()` Tailwind helper | `ui-system/cn.ts` | `src/lib/utils.ts` |
| Cross-context React hooks | `ui-system/hooks/*` | `src/hooks/*` |
| Cross-context UI primitives | `ui-system/primitives/*` | `src/components/*` |

Dashboard-local UI (`_shared/tokens.ts`, `_shared/format.ts`, `_shared/types.ts`) stays where it is. That's deliberately co-located dashboard UI, not cross-context.

---

## Proposed top-level structure

```
src/
├── app/                              # Next.js framework layer — pages, routes, actions
│   ├── (auth)/                       # login, onboarding, etc.
│   ├── (marketing)/                  # public site (currently (main))
│   ├── (dashboard)/                  # the app shell
│   ├── api/                          # API route handlers — THIN controllers
│   ├── admin/                        # admin pages
│   └── middleware.ts
│
├── contexts/                         # the nine bounded contexts
│   ├── identity/
│   │   ├── domain/                   # validators, profile-completion rules, OTP types
│   │   ├── usecases/                 # requireUser, start-otp, verify-otp, update-profile
│   │   └── ui/                       # auth-theme bindings, login/onboarding UI primitives
│   │
│   ├── subscriptions/                # CORE — deepest modeling lives here
│   │   ├── domain/                   # plans, end-date, veg-day, preferences, statuses, review types
│   │   ├── usecases/                 # skip-meal, pause, save-pending, claim-trial, weekly-review, monthly-review
│   │   └── ui/                       # plan glyphs, modals, takeovers, draft hooks
│   │
│   ├── payments/
│   │   ├── domain/                   # invoice statuses, plan-resolution rules, fanout rules
│   │   ├── usecases/                 # create-checkout, handle-webhook, post-payment-fanout, retry-cron
│   │   └── ui/                       # CheckoutSuccessTakeover
│   │
│   ├── notifications/
│   │   ├── domain/                   # notification kinds, language-code map, template registry
│   │   ├── usecases/                 # queue, dispatch-tick, send-now
│   │   └── ui/                       # (none)
│   │
│   ├── dorm-wars/                    # CORE
│   │   ├── domain/                   # awarder, doubler, layer4, RNG, meal-pricing, constants
│   │   ├── usecases/                 # streak-tick, chest-claim, layer4-google-review, review-cleanup
│   │   └── ui/                       # HubClient, DormWarsCard
│   │
│   ├── referrals/
│   │   ├── domain/                   # trial-delivery rules, inviter-credit rules
│   │   ├── usecases/                 # claim-trial, credit-inviter
│   │   └── ui/                       # /r/[cid] primitives
│   │
│   ├── menu/
│   │   ├── domain/                   # menuData (static catalog), allergen + veg/nonveg types
│   │   └── ui/                       # menu carousels (desktop + mobile)
│   │
│   ├── chatbot/
│   │   ├── domain/                   # DORMERS_KNOWLEDGE, escalation rules
│   │   ├── usecases/                 # send-message
│   │   └── ui/                       # AIChatbot, ChatButton, chatBus
│   │
│   └── admin/
│       ├── domain/                   # admin auth rules
│       ├── usecases/                 # layer4-queue, referral-review-queue
│       └── ui/                       # admin pages
│
├── shared/                           # SHARED KERNEL — small, governed
│   ├── contacts.ts
│   ├── phone.ts
│   ├── cid.ts
│   ├── validation/
│   └── time/                         # Asia/Dubai day-boundary helpers
│
├── infra/                            # OUTER RING — external adapters only
│   ├── supabase/
│   ├── stripe/
│   ├── meta-whatsapp/
│   ├── zeptomail/
│   └── zoho/
│
└── ui/                               # CROSS-CONTEXT presentation
    ├── tokens/                       # motion, glass, auth-theme, cn
    ├── primitives/                   # buttons, modals, skeletons
    └── hooks/                        # useBodyScrollLock, useCapsLock, useIsLight
```

---

## The dependency rule (enforceable)

Arrows must always point inward. Concretely, what each layer is allowed to import:

| Layer | May import from |
|---|---|
| `app/` (pages, routes, server actions) | `contexts/*/ui`, `contexts/*/usecases`, `infra/*`, `shared/*`, `ui-system/*` |
| `contexts/<X>/ui` | same context's `usecases`, `shared/*`, `ui-system/*` |
| `contexts/<X>/usecases` | same context's `domain`, `infra/*`, `shared/*` |
| `contexts/<X>/domain` | `shared/*` ONLY |
| `infra/*` | `shared/*` ONLY |
| `shared/*` | nothing else in `src/` |

**Hard rules:**
- A `domain/` file may never import from `infra/`, `app/`, `ui-system/`, or another context. Domain is pure.
- Two contexts may never import each other directly. They communicate via the use-case layer + events (see below).
- The Stripe SDK, Supabase client, and WhatsApp Cloud API client may appear ONLY inside `infra/`. Anywhere else is a violation.

These can be enforced with ESLint `no-restricted-imports` rules. We add them in Layer 4.

---

## Cross-context communication

Contexts must not import each other. Today, e.g., `payments/webhook` directly calls `subscriptions` rules and `notifications` writers. That's an integration leak.

**Pattern:** domain events. Past-tense facts published by one context, consumed by others.

Already implicit in the code:
- `payment.completed` → triggers subscription creation + day-1 onboarding email + WhatsApp confirmation (this is what `post-payment/fanout.ts` does today, procedurally)
- `subscription.skipped` → triggers customer notification queue
- `referral.converted` → triggers inviter credit
- `dorm-wars.streak.broken` → triggers the wrap-up modal

**For now:** keep `post-payment/fanout.ts` as the integration point. Make event names explicit. Don't yet introduce a full event bus — that's a layer-3 decision (Pragmatic Programmer: reversibility). The shape just needs to be CLEAR so we can swap procedural fanout for an event bus later without rewriting domain code.

---

## What this fixes (concrete examples)

| Today | After |
|---|---|
| `src/app/dashboard/actions.ts` is 1091 lines doing profile + preferences + skip + pause + plan purchase | Split into `contexts/identity/usecases/update-profile.ts`, `contexts/subscriptions/usecases/{skip,pause,save-pending,purchase}.ts`. Each <200 lines. |
| `src/app/api/webhook/route.ts` is 663 lines doing Stripe verify + plan resolve + subscription create + fanout | Thin controller (~60 lines) calls `contexts/payments/usecases/handle-webhook.ts`. Stripe SDK behind `infra/stripe`. |
| `src/utils/supabase/queries.ts` is 697 lines of mixed-context queries | Each query moves into its context's `domain/repository.ts` interface, implementation behind `infra/supabase`. |
| `src/lib/whatsapp.ts` can be imported by any UI component | Lives in `infra/meta-whatsapp/`. Only `contexts/notifications/usecases/*` can import it. ESLint enforces. |
| `motion.ts` and `glass.ts` sit in `lib/` next to business rules | Move to `ui-system/tokens/`. Visual concerns separated from logic. |

---

## What we explicitly preserve

These are not refactor targets — they're intentional and the user has confirmed them:

- **Client-safe vs server-side review split** — `monthly-review.ts` / `weekly-review.ts` stay client-safe; their server queries stay in a separate file. This DDD pattern is already correct, just rehoused into `contexts/subscriptions/`.
- **Dashboard `_shared/`** — local UI primitives stay where they are. Not cross-context.
- **Onboarding dark-mode visuals** — locked. The refactor moves code, never restyles surfaces.
- **Sidebar "Now" tray architecture** — time-bound surfaces stay in the sidebar tray, not on content pages. The refactor honors this.
- **`menuData.ts` is 1277 lines of static data** — it's a catalog, not domain logic. Stays as one file inside `contexts/menu/`.

---

## Resolved decisions (2026-05-27)

1. **Marketing pages stay as plain `app/(marketing)/` routes.** No dedicated context — they have no business rules.
2. **Referrals stay as a separate context** from subscriptions. Different language (cid/inviter/trial-claim vs plan/end-date/preference). They meet at the trial→subscription boundary; that boundary becomes an explicit ACL.
3. **One `admin/` context** covers all internal queues. User plans to expand admin significantly — structure stays one context so growth is additive, not a re-org.

## Menu context — upgrade from static to dynamic (decided 2026-05-27)

The user surfaced a product reality: the menu rotates fast, and shipping a code deploy for every dish swap is friction. Decision: the menu context's domain types stay the same, but the SOURCE of menu data moves from a 1277-line static file to a Supabase-backed catalog managed via the admin context.

**What changes:**

| Layer | Today | After menu-CMS milestone |
|---|---|---|
| `contexts/menu/domain/types.ts` | Dish, AllergenTag, WeekType types | unchanged |
| `contexts/menu/domain/repository.ts` | (does not exist) | `interface MenuRepository` — port owned by domain |
| `contexts/menu/domain/menuData.ts` | 1277-line static catalog | deleted (becomes a seed) |
| `infra/supabase/menu-repo.ts` | (does not exist) | implements `MenuRepository` against new tables |
| `contexts/admin/usecases/menu/*` | (does not exist) | create-dish, update-dish, upload-image, assign-to-week |
| `contexts/admin/ui/menu/*` | (does not exist) | admin CMS pages |

**New Supabase tables (sketch — schema decided in a later phase):**
- `dishes` — id, name, slug, description, calories, macros (JSONB), allergens (array), veg/nonveg, active flag, image asset id
- `dish_assets` — id, dish_id, supabase-storage URL, alt text, sort order
- `menu_weeks` — id, week_number, week_type (5/6/7 days), start_date, end_date, status
- `week_meal_slots` — week_id, day_of_week, slot (nonveg1/nonveg2/veg), dish_id

**Strategic shift:** menu was classified as a *supporting* subdomain. With a CMS layer it becomes a stronger differentiator (operational velocity in a kitchen-ops business). Still supporting — not core — but worth more investment than the original classification suggested.

**Sequencing:** this is NOT part of the refactor itself. The refactor (L4) extracts the menu context with a static `MenuRepository` implementation that wraps today's `menuData.ts` array — zero behavior change. The CMS milestone happens AFTER the refactor finishes, swapping the static implementation for the Supabase one. Pragmatic-programmer tracer bullet: prove the pattern with a static repo first, then add the dynamic version when nothing else has to change to support it.

## Open questions (resolve before Layer 2)

(none — all resolved above)

---

## Score (per the skill rubrics)

- **DDD score (current codebase):** 3/10 — ubiquitous language exists in conversation but not in folders; no bounded contexts; god-files mix models.
- **Clean Architecture score (current codebase):** 2/10 — no rings, dependency rule violated freely, infra mixed with domain.
- **DDD score (proposed):** 9/10 — contexts named, language enforced in folder names, aggregates clear. Loses 1 point until domain events are formalized in Layer 3.
- **Clean Architecture score (proposed):** 9/10 — rings explicit, dependency rule enforceable by lint. Loses 1 point until repository interfaces are introduced in Layer 4.

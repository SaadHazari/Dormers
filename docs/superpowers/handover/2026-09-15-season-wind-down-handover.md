# Season wind-down: handover

Date: 2026-09-15, evening (Asia/Dubai). Plans A to G are built, reviewed,
rehearsed on the live database and deployed. This replaces the afternoon
handover written when the work was halted; nothing in that version is still
open.

Two documents carry the day-to-day:

- The owner's runbook: `docs/runbooks/season-wind-down.md`
- The design, with every owner decision: `docs/superpowers/specs/2026-09-14-season-wind-down-design.md`

---

## 1. Status at a glance

| Piece | State |
|---|---|
| Plan A: foundation, admin planner | Shipped 2026-09-14 (`846452b`) |
| Plan B: wind-down rules (sales against W, credited skips, buffer grants, skip reconciliation, sheets, wallet) | Shipped 2026-09-15 (`64140ae`) |
| Plan C: the break (holds, guards G1 to G6 and G9, break tick, reopen, release, cards and sheets, break board) | Shipped 2026-09-15 (`64140ae`), break cron live |
| Plan D: refunds with owner approval | Shipped 2026-09-15 (`fc43902`), `SEASON_REFUNDS_LIVE = true` |
| Plan E: messages (outbox, email, WhatsApp wiring, G7, G8, owner digest) | Shipped 2026-09-15 (`c686377`) |
| Plan F: reopening (audience, N15 to N19, follow-ups) | Shipped 2026-09-15 (`adb404a`) |
| Plan G: remaining invariants, alert dedupe, template pack, atlas, runbook | Shipped 2026-09-15 (this commit) |
| Season email templates | **Waiting on the owner**: eight ZeptoMail templates to paste in, one per moment, then their keys in Netlify (`docs/email-templates/SEASON-EMAILS.md`) |
| WhatsApp templates | **Waiting on the owner**: ten templates to create at Meta, Vault secrets, env flags (`docs/whatsapp-templates/season-templates.md`) |
| Customers today | Production runs the full system. The live season row is sandbox state (see section 4) |

Production branch and `main` are the same commit. Every season migration is
applied live and mirrored verbatim in `supabase/migrations/` with its live
version stamp.

---

## 2. What was decided along the way

Owner decisions D1 to D7 and X1 to X7 are in spec §2. Added during the build:

- **The kitchen day cost is kitchen-facing.** No AED figure derived from
  `kitchen_daily_cost_aed` appears on the admin panel or in owner messages.
  Day counts are fine.
- **The live seasonal pause is sandbox state.** Live customers have not
  started; nothing was timed around the current `winding_down` row.
- **Build directly, verify for real.** Every SQL change is read from live,
  rehearsed inside a rolled-back `DO` block before and after applying,
  mirrored, and its mirror verified byte for byte (md5 of the function body).
  Subagents were used for one boundary review of Plans B and C; its findings
  are all shipped (`64140ae`).
- **Refund states are money records.** A hold that reached
  `refund_processing`, `refund_failed` or `refunded` cannot be deleted by a
  cascade (trigger). Plain holds still cascade with their plan, so checkout
  rollbacks keep working.
- **A refund is retried with the same Stripe idempotency key** (`refund:season:<hold>`),
  and a Stripe refund whose recording failed is kept on the hold, so Retry
  never pays twice.
- **One ZeptoMail template per season moment** (owner, 2026-09-16), so
  delivery is tracked per moment in the ZeptoMail dashboard. The eight
  templates live in `docs/email-templates/season-*.html`; the app only picks
  the template and fills in the numbers. A message whose template is not set
  up yet retries every six hours rather than parking, and the owner is told
  which ones are waiting. WhatsApp waits on Meta approval behind fail-closed
  env flags.
- **Every season email carries the brand banner** (owner, 2026-09-16): the
  mark beside the wordmark on its own strip at the top of the card, the way
  the sign-in code email does it.
- **A pause carried into the break can ask for a refund** (owner, 2026-09-16,
  reversing X4). During the break that customer cannot resume even if they
  want to, so the wait is ours. A cancelled or declined request goes back to
  `paused_by_customer`, not `held`. The notices carry `can_refund` so an email
  never offers a refund the dashboard would hide.
- **`intake_back_open` takes `plan_name`** (owner checked Meta, 2026-09-16).
  The dispatcher sends it, and the reopening route skips the WhatsApp for
  anyone with no plan to name rather than letting Meta reject it.
- **Standing invariant breaches repeat every six hours**, not every hour.
- **A digest speaks only when something changed** since the last one; the
  facts it compares live in `intake_settings.season_digest_state`.

---

## 3. Where everything is

| What | Where |
|---|---|
| Main checkout | `/Users/SaadHazari/1Projects/Dormers Codebase/Dormers-Production`, `main` = Production |
| Season worktree | `.claude/worktrees/season-wind-down`, branch `feat/season-wind-down` (fully merged into `main`; safe to remove) |
| Stray worktree | `.claude/worktrees/agent-ad3eaf957cae537a3`, branch `fix/task8-reconcile` at `746bf36`. Superseded by the reconcile fix in `20260915094805_season_reconcile_fix.sql`. Safe to remove |
| Spec | `docs/superpowers/specs/2026-09-14-season-wind-down-design.md` |
| Plans A to C (historical) | `docs/superpowers/plans/2026-09-1{4,5}-season-wind-down-{A,B,C}-*.md` |
| Runbook | `docs/runbooks/season-wind-down.md` |
| Templates for Meta | `docs/whatsapp-templates/season-templates.md` |
| Live database | Supabase project `yjjayivwfqjfppawgyaz` (Dormers-Ohio), production |

**Code map (season):**

| Area | Files |
|---|---|
| Domain (pure) | `src/contexts/season/domain/`: `season-projection.ts` (meals walk, SQL twin `_season_project_plan`), `season-kitchen.ts`, `season-dates.ts`, `season-phase.ts`, `meal-value.ts`, `season-refund.ts`, `season-messages.ts`, `customer-hold.ts`, `resume-split.ts`, `skip-outcome.ts`, `season-release.ts` (flags) |
| Use cases | `src/contexts/season/usecases/`: `season-transitions.ts`, `season-schedule-notices.ts`, `skip-season.ts`, `release-hold.ts`, `season-refund-actions.ts` (customer), `season-refund-admin.ts` (owner), `season-notices-send.ts` (outbox loop), `season-skip-notices.ts`, `season-reopen-notices.ts` |
| Routes | `src/app/api/internal/season-notices-send/route.ts`; season branches in `renew-nudge-send`, `subscription-ended-send`, `broadcast-send` |
| Admin | `src/app/admin/season/` (planner, `BreakBoard.tsx`, `RefundQueue.tsx`, `season-data.ts`, `actions.ts`), `src/app/admin/_components/cron-registry.ts`, `/dev/season-admin` fixtures |
| Customer | `src/app/dashboard/_shared/` (`HeldPlanCard.tsx`, `SeasonSplitSheet.tsx`, `BreakResumeSheet.tsx`, `SeasonBreakNotice.tsx`, `season-break-copy.ts`, `season-skip-copy.ts`), preview knobs in `src/app/dashboard/page.tsx` (`?season=...`) |
| Payments | `src/contexts/payments/usecases/handle-stripe-event.ts` (season refund branch), `src/infra/stripe/refunds.ts` (`refundableFils`) |
| SQL mirrors | `supabase/migrations/2026091[456]*_season_*.sql` and `20260916_season_*.sql` |
| Checks | `scripts/check-season-customer.mjs` (38 renders), `scripts/check-season-planner.mjs` (20 renders), `scripts/season-projection-lockstep.ts`, `scripts/atlas/manifest.mjs` (section 4.3b) |

---

## 4. Live database state (verified 2026-09-15 evening)

- `intake_settings`: `season_phase = winding_down`, `paused = true`, no
  wrap-up day, no close day. Sandbox state per the owner; schedule W whenever
  the real season needs it.
- 3 live plans (a paid Monthly Premium on a test-mode order, a Staff Monthly
  that is a test account whose meal count and end date disagree harmlessly,
  one customer-paused Monthly Premium), 0 holds,
  0 season notices, 0 season-skip credits, 16 approved waitlist credits from
  earlier cycles.
- Every Stripe order is test mode, so credited skips use the 90% list-price
  fallback and no refund button shows until the first live payment.

**Season migrations, newest first** (all applied and mirrored):

| Version | Name |
|---|---|
| `20260915183423` | `season_invariants_g10` |
| `20260915183041` | `season_reopen_notices` |
| `20260915181736` | `season_notices` |
| `20260915135359` | `season_break_cron` |
| `20260915135222` | `season_refunds` |
| `20260915135218` | `season_review_fixes` |
| `20260915133118` | `season_start_day_emails` |
| `20260915130119` | `season_reopen_release` |
| `20260915125858` | `season_begin_break` |
| `20260915125614` | `season_status_triggers` |
| `20260915125421` | `season_kitchen_guards` |
| `20260915125204` | `season_project_plans` |
| `20260915094805` | `season_reconcile_fix` |
| `20260915082710` | `season_reconcile_skips` |
| `20260915080428` | `season_skip_guards` |
| `20260915044446` | `season_skip_credit_tick` |
| `20260915043834` | `season_skip_functions` |
| `20260915043100` | `season_credited_skip_ticks` |
| `20260914173723` | `season_transitions` |
| `20260914173304` | `season_wind_down_foundation` |

**Cron (UTC):** `season_break_tick` 20:20 and 20:50, `season_break_tick_last_retry`
21:20, `season_invariants_tick` hourly at :30, `season_skip_credit_tick` 20:40,
`dispatch_season_notices_tick` every 5 minutes, `season_admin_digest_tick`
14:00, `season_admin_digest_tick_close_day` 16:30, `season_reopen_followups_tick`
06:00, `dispatch_subscription_ended_0045_ae` moved to 06:00.
`intake_scheduled_pause_00_15_ae` is gone.

---

## 5. How this repo works (unchanged rules)

- Deploy: `git push origin main` **and** `git push origin main:Production`.
  Netlify builds Production. Confirm with `netlify api listSiteDeploys`.
- Live database is the source of truth. Read a function from live
  (`pg_get_functiondef`) before changing it; rehearse in a rolled-back `DO`
  block; apply; mirror verbatim; record the row in
  `supabase_migrations.schema_migrations`. The Management API
  (`POST /v1/projects/<ref>/database/query`) does all of this without the MCP.
- Every `season_*` function is `SECURITY DEFINER` with `EXECUTE` revoked from
  `public, anon, authenticated`; the app calls them with the service role
  after `withOwnedSubscription` or `requireAdmin`.
- Customer copy: plain words, no em or en dashes, no emoji. Tests enforce
  it on every season copy module.
- Checks: `npx vitest run` (1,543 tests), `npx tsc --noEmit`, `npx next lint`
  (one pre-existing `<img>` warning), and the two rendered checks against a
  dev server (`BASE_URL=http://localhost:3000 node scripts/check-season-customer.mjs`).

---

## 6. What the owner still has to do

1. **Season email templates**: create the eight in ZeptoMail by pasting each
   file, then put each template key in Netlify.
   `docs/email-templates/SEASON-EMAILS.md` is the step by step, with the
   subject lines and merge fields. `npm run mail:season-test` then sends one
   of each to the owner's inbox, skipping any that are not set up yet.
2. **WhatsApp templates**: create the ten templates at Meta, add the Vault
   secrets, switch on the env flags (`docs/whatsapp-templates/season-templates.md`).
   For `intake_reopened` and `intake_back_open`, confirm the variable names
   against the approved templates first.
3. **Order confirmation email**: add the `{{credit_used_aed}}` block to the
   existing ZeptoMail `order_confirmation` template (the snippet is at the end
   of `docs/email-templates/SEASON-EMAILS.md`). The merge field is already
   sent and left out when no credit was used (N19).
4. **Schedule W** when the real season needs it, from `/admin/season`.

## 7. Known warts (not blocking)

- Preview fixture `season=credited` uses a Sunday wrap-up day.
- The wallet hero prints "AED 69.8" without the trailing zero.
- The menu spotlight reads a held plan as "paused" (day cards are right).
- The invariants tick's "delivery after the close day" check trusts
  `last_delivery_tick_date`; a plan whose tick date was edited by hand can
  trip it.

## 8. Follow-ups outside the spec (unchanged)

Zoho credit notes for season refunds; the broadcast composer's two parked
fast-follows; the footer on `dormers_intake_ended_offer_v1`; credits stacking
across seasons with no cap; a restart-day picker for held plans if "tap
Resume" proves too blunt.

# Supabase Region Migration — Tokyo → Frankfurt

**Status:** planned, not scheduled. Needs a quiet 1-hour window.
**Written:** 2026-06-10. Live-project inventory verified via Supabase MCP on this date.

## Why

The dashboard's slowness is mostly geography, not code:

- Supabase project `butfgoqneixophdlwljd` ("Dormers") runs in **ap-northeast-1 (Tokyo)**
- Netlify serverless functions run in the **default us-east-2 (Ohio)** — no region pinned
- Customers are in the **UAE**

Every server-rendered dashboard request does: UAE → Netlify (US) → N× queries to Tokyo
at ~150ms per round trip. Pages run 5–7 queries each; middleware adds auth on top.

**Target:** Supabase in **eu-central-1 (Frankfurt)** + Netlify functions region pinned to
**eu-central-1**. Function↔DB drops to ~1–2ms; the UAE→Frankfurt hop (~110ms) is paid
once per navigation instead of per query. Frankfurt is the best co-location available:
Netlify offers no Gulf/India functions region, and co-locating functions with the DB
matters more than DB proximity to users (queries are the multiplied cost).

Netlify region is self-serve: Project configuration → Build & deploy → Continuous
deployment → Functions region → eu-central-1, then redeploy.
Docs: https://docs.netlify.com/build/functions/optional-configuration/

**⚠️ Sequencing rule:** do NOT pin Netlify to Frankfurt while the DB is still in Tokyo —
Frankfurt↔Tokyo (~240ms) is *worse* than today. Both moves happen in the same window,
DB first.

## Verified inventory (what actually has to move)

| Thing | Size / count | How it moves |
|---|---|---|
| Database (Postgres 17.6) | 19 MB | pg_dump/restore from LIVE db — minutes |
| Auth users | 31 | come with the dump (auth schema, hashes intact) |
| pg_cron jobs | 16 | **NOT in dump** — script out + replay (all are plain `SELECT fn()` calls, zero embedded URLs/refs — verified) |
| Vault secrets | 18 | **NOT portable** — encrypted per-project; read via `vault.decrypted_secrets`, re-insert with `vault.create_secret()`. Never write values to repo/files. |
| Storage | 3 buckets, 5 objects, ~1.2 MB | manual copy (trivial); bucket rows + RLS come with dump |
| Edge functions | none | — |
| Extensions | pg_cron, pg_net, pgcrypto, uuid-ossp, vault, pg_stat_statements | all standard, enable on new project |

**Important:** repo migrations are STALE vs live DB (see memory / known drift in
`subscription_status_tick`, `ae_today()`, cron times). The dump-from-live approach is
mandatory — do NOT rebuild the new project from repo migration files.

## Prep (no downtime, do any time before)

1. Create new Supabase project in **eu-central-1**, same org, Postgres 17. Record new
   ref + anon key + service-role key.
2. Generate the cron replay script from live:
   `SELECT format('SELECT cron.schedule(%L, %L, %L);', jobname, schedule, command) FROM cron.job;`
   Save output as a one-off setup script (commands are plain SQL — safe to keep in repo).
3. List every env var carrying the old ref/keys: Netlify env + `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, service-role key, any
   `SUPABASE_*`). Grep the repo for `butfgoqneixophdlwljd` — known hit:
   `next.config.ts` images.remotePatterns hostname (must ship with the env flip).
4. Replicate dashboard-only settings on the new project by hand: Auth site URL +
   redirect URLs, email/OTP provider + SMTP (ZeptoMail), rate limits, any OAuth
   providers. Screenshot the old project's Auth settings first.
5. Sweep DB for stored URLs pointing at the old project:
   any text column containing `butfgoqneixophdlwljd.supabase.co` (review-screenshot
   URLs are the likely place). Rewrite during cutover if found.
6. Dry-run: restore the dump into the Frankfurt project days ahead, click around against
   it locally (point `.env.local` at it). Wipe and re-restore fresh at cutover.

## Cutover (~15–30 min, quiet hour — suggest 03:00–04:00 UAE)

1. Unschedule the high-frequency crons on the OLD project first
   (`dispatch_zoho_due_every_minute`, the */5 ticks) — prevents double-dispatch.
2. Final dump from Tokyo; restore into Frankfurt (wipe dry-run data first).
3. Copy the 5 storage objects; verify bucket policies.
4. Replay cron script; re-insert the 18 vault secrets (values via MCP session only).
5. Verify on Frankfurt: row counts (customers, subscriptions, orders), 31 auth users,
   one manual run of a dispatch function, RLS spot-check with anon key.
6. Flip Netlify env vars to new URL/keys + set Functions region to eu-central-1 +
   deploy (single build, includes the next.config hostname change).
7. Smoke test production: OTP login, dashboard pages, checkout (Stripe), admin panel,
   label PDF, a WhatsApp template send.
8. Pause the Tokyo project — keep it ~2 weeks as rollback. Rollback = flip env vars
   back, re-enable old crons, redeploy.

## Known consequences

- **All sessions invalidate** (new JWT keys) — 31 users re-login. Acceptable; consider
  a WhatsApp heads-up.
- Two projects exist during overlap — check org billing; pause Tokyo promptly.
- Sentry, Stripe, Meta webhooks all point at the app domain, not supabase.co — no
  changes needed there (verify Meta during smoke test anyway).

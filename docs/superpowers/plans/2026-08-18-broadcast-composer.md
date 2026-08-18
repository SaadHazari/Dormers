# Broadcast Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The customer base-wide broadcast: an admin composer that queues an email to a chosen audience and a cron-driven dispatcher that drains the queue in bounded batches through ZeptoMail, including the season-reopening notice that finally gives `intake_waitlist.notified_at` its writer.

**Architecture:** Pressing send never sends. It snapshots the audience into a `broadcast_sends` queue table in one transaction, and a per-minute pg_cron tick POSTs an internal route that sends a bounded batch per invocation — so no Lambda timeout can truncate a broadcast, resume is free (unstamped rows), cancel is a status flip, and the ZeptoMail circuit breaker failing fast skips the tick instead of burning attempts. Two kinds: `custom` (admin-written body wrapped in the card-format shell) and `season_reopen` (the existing ZeptoMail `season-reopen` template with per-recipient merge keys).

**Tech Stack:** Next.js App Router server actions + internal API route, Supabase (Ohio) via MCP for all DDL, pg_cron + pg_net for the tick, ZeptoMail raw + template APIs through the existing breaker-wrapped client, vitest.

**Spec:** `docs/superpowers/specs/2026-08-15-seasonal-intake-pause-design.md` §9 (capability list, audiences, confirmation rules) — with the sending engine replaced by the queue+tick architecture agreed 2026-08-18, and §9.2's navy-banner email design replaced by `docs/email-templates/EMAIL-DESIGN.md` (owner decision 2026-08-18). Context: `.planning/seasonal-pause-handoff.md`.

## Global Constraints

- **Live Supabase is the Ohio project `yjjayivwfqjfppawgyaz`.** All DDL through the Supabase MCP against that project id; repo migration files are mirrors and are known to drift — never trust one as current state.
- **New tables and RPCs need explicit lockdown.** `anon` and `authenticated` inherit full default DML on every table and EXECUTE on every function: `enable row level security` + `revoke` on tables, `revoke execute ... from public, anon, authenticated` on functions.
- **Never degrade customer email.** The broadcast shares ZeptoMail with transactional sends. The dispatcher checks nothing before the breaker: if `CircuitOpenError` (name `'CircuitOpenError'`) surfaces, the tick stops WITHOUT counting attempts and lets transactional traffic recover.
- **The email shell follows `docs/email-templates/EMAIL-DESIGN.md`** — card format, brand lockup, no banner, no emoji, no em/en dashes, `wa.me/971504619384` only, `{{`/Mustache trap: this shell is rendered in OUR code (not ZeptoMail), so `{{first_name}}` is replaced server-side per recipient.
- **ZeptoMail Mustache (season_reopen kind only): empty string is TRUTHY.** Hide `credit_aed` by omitting the key. Never send `''` or `'0'`.
- **No SVG in email; the mark is `https://dormers.ae/email-mark.png`** (in `public/`, live after next push).
- **Copy carries no emoji and no em or en dashes.** Periods, commas, "to" for ranges. Curly apostrophes fine.
- **Test command:** `npx vitest run <path>`. **Before any push:** `npm run lint` (Netlify treats `no-unused-vars` as an error; tsc alone misses orphaned imports).
- **Never push to git.** Commit freely; push only when explicitly asked.
- **Indentation matches the file's neighbors:** 2-space in `src/infra` and `src/app/api`, 4-space in `src/app/admin`.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260818_broadcasts.sql` | Mirror: `broadcasts` + `broadcast_sends` DDL + RLS |
| `supabase/migrations/20260818_broadcast_audience_rpcs.sql` | Mirror: `broadcast_audience` + `broadcast_confirm` functions |
| `supabase/migrations/20260818_broadcast_tick.sql` | Mirror: `dispatch_broadcast_tick` + per-minute cron |
| `src/infra/zeptomail/broadcast-shell.ts` | Pure: card-format HTML shell + `{{first_name}}` personalization |
| `src/infra/zeptomail/broadcast-shell.test.ts` | Tests for the above |
| `src/app/api/internal/broadcast-send/route.ts` | The dispatcher: claims a bounded batch, sends, stamps |
| `src/app/admin/comms/broadcast/actions.ts` | Server actions: count, launch, progress, cancel, retry |
| `src/app/admin/comms/broadcast/page.tsx` | Server component: history + client mount |
| `src/app/admin/comms/broadcast/BroadcastClient.tsx` | Composer UI: form, preview, confirm, progress |

**Modified:**

| File | Change |
|---|---|
| `src/infra/zeptomail/client.ts` | Add `sendBroadcastEmail` (raw) — the season_reopen kind reuses existing `sendTemplate` |
| `src/app/admin/AdminSidebar.tsx` | `Broadcast` nav item next to Messages |
| `src/app/admin/season/SeasonClient.tsx` | Post-toggle-off offer linking to the composer's reopen preset |
| `.planning/seasonal-pause-handoff.md` | Close out "broadcast composer never started" |

---

### Task 1: The two tables

**Files:**
- Create: `supabase/migrations/20260818_broadcasts.sql`

**Interfaces:**
- Produces: tables `public.broadcasts` (kind, audience, status machine) and `public.broadcast_sends` (the queue; `sent_at IS NULL` = pending, `attempts` caps retries). Every later task reads these exact columns.

- [ ] **Step 1: Write the mirror migration file**

```sql
-- ============================================================================
-- Broadcast composer storage. Two tables:
--   broadcasts       — one row per broadcast; the status machine and audit.
--   broadcast_sends  — the queue. One row per recipient, written at confirm
--                      time in one transaction (broadcast_confirm). sent_at
--                      IS NULL means pending; attempts >= 3 means given up
--                      until an admin retries. The snapshot IS the audience:
--                      the confirmation count and the sent set can never
--                      disagree, and a crashed dispatcher resumes for free.
--
-- status: 'sending' → 'done' (dispatcher finds no pending rows)
--         'sending' → 'cancelled' (admin kill switch; already-sent rows stay)
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-18. This file is the source-control mirror.
-- ============================================================================

create table if not exists public.broadcasts (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null default 'custom'
                    check (kind in ('custom', 'season_reopen')),
  subject         text not null,
  heading         text not null default '',
  body            text not null default '',
  cta_label       text,
  cta_url         text,
  audience        text not null
                    check (audience in ('everyone', 'active_plans', 'early_access',
                                        'ended_not_renewed', 'dorm', 'reopen')),
  dorm_name       text,
  status          text not null default 'sending'
                    check (status in ('sending', 'done', 'cancelled')),
  recipient_count int not null default 0,
  created_by      text not null,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz,
  constraint dorm_requires_name check (audience <> 'dorm' or dorm_name is not null),
  constraint cta_pairs check ((cta_label is null) = (cta_url is null))
);

create table if not exists public.broadcast_sends (
  id           uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  email        text not null,
  first_name   text not null,
  sent_at      timestamptz,
  attempts     int not null default 0,
  last_error   text,
  unique (broadcast_id, customer_id)
);

-- What the dispatcher scans every tick.
create index if not exists broadcast_sends_pending_idx
  on public.broadcast_sends (broadcast_id)
  where sent_at is null;

alter table public.broadcasts enable row level security;
alter table public.broadcast_sends enable row level security;
revoke all on public.broadcasts from anon, authenticated;
revoke all on public.broadcast_sends from anon, authenticated;
grant all on public.broadcasts to service_role;
grant all on public.broadcast_sends to service_role;

drop policy if exists "service_role_full_access" on public.broadcasts;
create policy "service_role_full_access" on public.broadcasts
  for all using (true) with check (true);
drop policy if exists "service_role_full_access" on public.broadcast_sends;
create policy "service_role_full_access" on public.broadcast_sends
  for all using (true) with check (true);
```

- [ ] **Step 2: Apply it live via the Supabase MCP** (`apply_migration`, project `yjjayivwfqjfppawgyaz`, name `broadcasts`) with the exact SQL above.

- [ ] **Step 3: Verify the lockdown** via MCP `execute_sql`:

```sql
select grantee, privilege_type from information_schema.role_table_grants
where table_name in ('broadcasts', 'broadcast_sends')
  and grantee in ('anon', 'authenticated');
```

Expected: zero rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260818_broadcasts.sql
git commit -m "feat(broadcast): broadcasts + broadcast_sends tables (queue-backed sending)"
```

---

### Task 2: Audience resolution and the confirm transaction

**Files:**
- Create: `supabase/migrations/20260818_broadcast_audience_rpcs.sql`

**Interfaces:**
- Consumes: Task 1's tables.
- Produces: `public.broadcast_audience(p_audience text, p_dorm text default null) returns table(customer_id uuid, email text, first_name text)` — the ONE definition of every audience, used for both the live count and the snapshot so they cannot disagree. `public.broadcast_confirm(p_broadcast_id uuid) returns int` — snapshots the audience into `broadcast_sends` atomically and stamps `recipient_count`. Both service-role only, called via `sb.rpc(...)` from the admin client.

- [ ] **Step 1: Write the mirror migration file**

```sql
-- ============================================================================
-- Audience resolution + the confirm transaction for the broadcast composer.
--
-- broadcast_audience is the single source of truth for who each audience is.
-- The composer's live count and broadcast_confirm's snapshot both call it, so
-- the number the admin confirmed is exactly the set that gets queued.
--
-- 'reopen' = the early-access list UNION ended-and-not-renewed: the two
-- honest audiences for "we are back" (spec §7 promised the list they would
-- hear first; lapsed customers get the no-credit variant of the template).
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-18. This file is the source-control mirror.
-- ============================================================================

create or replace function public.broadcast_audience(p_audience text, p_dorm text default null)
returns table(customer_id uuid, email text, first_name text)
language sql
security definer
set search_path = public
as $$
  select c.id,
         c.email,
         coalesce(nullif(split_part(btrim(c.name), ' ', 1), ''), 'there')
  from public.customers c
  where c.email is not null
    and case p_audience
      when 'everyone' then true
      when 'active_plans' then exists (
        select 1 from public.subscriptions s
        where s.customer_id = c.id and s.status = 'Active')
      when 'early_access' then exists (
        select 1 from public.intake_waitlist w where w.customer_id = c.id)
      when 'ended_not_renewed' then
        exists (select 1 from public.subscriptions s
                where s.customer_id = c.id and s.status = 'Ended')
        and not exists (select 1 from public.subscriptions s
                        where s.customer_id = c.id and s.status = 'Active')
      when 'dorm' then c.dorm_name = p_dorm
      when 'reopen' then
        exists (select 1 from public.intake_waitlist w where w.customer_id = c.id)
        or (exists (select 1 from public.subscriptions s
                    where s.customer_id = c.id and s.status = 'Ended')
            and not exists (select 1 from public.subscriptions s
                            where s.customer_id = c.id and s.status = 'Active'))
      else false
    end
$$;

create or replace function public.broadcast_confirm(p_broadcast_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.broadcasts%rowtype;
  n int;
begin
  select * into b from public.broadcasts
    where id = p_broadcast_id and status = 'sending'
    for update;
  if not found then
    raise exception 'broadcast % not found or not in sending state', p_broadcast_id;
  end if;

  -- Idempotent: a retried confirm must not double the queue.
  if b.recipient_count > 0 then
    return b.recipient_count;
  end if;

  insert into public.broadcast_sends (broadcast_id, customer_id, email, first_name)
  select p_broadcast_id, a.customer_id, a.email, a.first_name
  from public.broadcast_audience(b.audience, b.dorm_name) a
  on conflict (broadcast_id, customer_id) do nothing;

  get diagnostics n = row_count;
  update public.broadcasts set recipient_count = n where id = p_broadcast_id;
  return n;
end
$$;

revoke execute on function public.broadcast_audience(text, text) from public, anon, authenticated;
revoke execute on function public.broadcast_confirm(uuid) from public, anon, authenticated;
```

- [ ] **Step 2: Apply via MCP** (`apply_migration`, name `broadcast_audience_rpcs`).

- [ ] **Step 3: Verify against the live QA fixtures** via MCP `execute_sql`:

```sql
select 'everyone' as aud, count(*) from public.broadcast_audience('everyone')
union all select 'active', count(*) from public.broadcast_audience('active_plans')
union all select 'ended_nr', count(*) from public.broadcast_audience('ended_not_renewed')
union all select 'reopen', count(*) from public.broadcast_audience('reopen');
```

Expected: everyone >= each other audience; no errors. Sanity-check `ended_not_renewed` excludes anyone who also holds an Active sub (the nine QA fixture accounts cover both states).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260818_broadcast_audience_rpcs.sql
git commit -m "feat(broadcast): audience resolution + atomic confirm snapshot RPCs"
```

---

### Task 3: The card-format shell (pure, tested)

**Files:**
- Create: `src/infra/zeptomail/broadcast-shell.ts`
- Test: `src/infra/zeptomail/broadcast-shell.test.ts`

**Interfaces:**
- Produces:
  - `personalizeBroadcast(text: string, firstName: string): string` — replaces every `{{first_name}}` (whitespace-tolerant) with the name.
  - `buildBroadcastEmailHtml(input: { firstName: string; heading: string; bodyText: string; ctaLabel?: string; ctaUrl?: string; reasonLine: string }): string` — the full card-format document per `docs/email-templates/EMAIL-DESIGN.md`.
  - `reasonLineFor(audience: string): string` — truthful footer line per audience.
- Consumed by: Task 4's dispatcher route.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { buildBroadcastEmailHtml, personalizeBroadcast, reasonLineFor } from './broadcast-shell'

describe('personalizeBroadcast', () => {
  it('replaces every {{first_name}} token, tolerating inner whitespace', () => {
    expect(personalizeBroadcast('Hi {{first_name}}, {{ first_name }}!', 'Ahmed'))
      .toBe('Hi Ahmed, Ahmed!')
  })
  it('leaves text without tokens untouched', () => {
    expect(personalizeBroadcast('No tokens here.', 'Ahmed')).toBe('No tokens here.')
  })
})

describe('reasonLineFor', () => {
  it('is truthful per audience', () => {
    expect(reasonLineFor('early_access')).toBe('You are getting this because you asked to hear from us.')
    expect(reasonLineFor('everyone')).toBe('You are getting this because you have a Dormers account.')
    expect(reasonLineFor('active_plans')).toBe('You are getting this because you have a Dormers plan.')
    expect(reasonLineFor('ended_not_renewed')).toBe('You are getting this because you were on a Dormers plan before.')
    expect(reasonLineFor('dorm')).toBe('You are getting this because you have a Dormers account.')
  })
})

describe('buildBroadcastEmailHtml', () => {
  const base = {
    firstName: 'Ahmed',
    heading: 'A quick heads up, {{first_name}}.',
    bodyText: 'First paragraph.\n\nSecond <paragraph> & more.',
    reasonLine: 'You are getting this because you have a Dormers account.',
  }
  it('personalizes the heading and splits body on blank lines', () => {
    const html = buildBroadcastEmailHtml(base)
    expect(html).toContain('A quick heads up, Ahmed.')
    expect(html).toContain('First paragraph.')
    expect(html).toContain('Second &lt;paragraph&gt; &amp; more.')
  })
  it('escapes admin HTML rather than rendering it', () => {
    const html = buildBroadcastEmailHtml({ ...base, heading: '<script>x</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
  it('renders the CTA box only when both label and url are present', () => {
    expect(buildBroadcastEmailHtml(base)).not.toContain('cta-button')
    const withCta = buildBroadcastEmailHtml({ ...base, ctaLabel: 'See the menu', ctaUrl: 'https://dormers.ae/menu' })
    expect(withCta).toContain('See the menu')
    expect(withCta).toContain('https://dormers.ae/menu')
  })
  it('carries the card format invariants', () => {
    const html = buildBroadcastEmailHtml(base)
    expect(html).toContain('border:2px solid #f57f20')          // perimeter border
    expect(html).toContain('https://dormers.ae/email-mark.png') // lockup mark
    expect(html).toContain('DORMERS&rsquo;')                    // live-text wordmark
    expect(html).toContain('https://wa.me/971504619384')        // support box
    expect(html).toContain(base.reasonLine)                     // truthful footer
    expect(html).not.toContain('border-collapse')               // the trap stays out
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/infra/zeptomail/broadcast-shell.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Open `docs/email-templates/season-plan-ended.html` and transplant its `<style>` block (dark-mode + mobile media queries), lockup table, sub-container markup, green support box, and footer verbatim into a template literal. Structure:

```ts
/**
 * The card-format shell for admin broadcasts, per
 * docs/email-templates/EMAIL-DESIGN.md. Rendered in OUR code — ZeptoMail
 * receives finished HTML, so Mustache semantics never apply here; the only
 * token is {{first_name}}, replaced server-side per recipient.
 *
 * Admin-authored text is escaped, never rendered as HTML: a composer that
 * can inject markup into 500 inboxes is an incident waiting for a typo.
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function personalizeBroadcast(text: string, firstName: string): string {
  return text.replace(/\{\{\s*first_name\s*\}\}/g, firstName)
}

export function reasonLineFor(audience: string): string {
  switch (audience) {
    case 'early_access': return 'You are getting this because you asked to hear from us.'
    case 'active_plans': return 'You are getting this because you have a Dormers plan.'
    case 'ended_not_renewed': return 'You are getting this because you were on a Dormers plan before.'
    default: return 'You are getting this because you have a Dormers account.'
  }
}

export function buildBroadcastEmailHtml(input: {
  firstName: string
  heading: string
  bodyText: string
  ctaLabel?: string
  ctaUrl?: string
  reasonLine: string
}): string {
  const heading = esc(personalizeBroadcast(input.heading, input.firstName))
  const paragraphs = personalizeBroadcast(input.bodyText, input.firstName)
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 20px 0; font-size:16px; line-height:26px;">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
  const ctaBox = input.ctaLabel && input.ctaUrl
    ? `<!-- orange sub-container with the cta-button, copied from the reference -->`
    : ''
  // ... full document assembled from the transplanted reference markup,
  // with ${heading}, ${paragraphs}, ${ctaBox}, ${esc(input.reasonLine)}
  return html
}
```

The CTA anchor must carry `class="cta cta-button"` so the "renders only when both present" test has a stable hook, and `esc(input.ctaUrl)` in `href`. The document is the FULL page (doctype, head with both media blocks, preheader omitted — broadcasts vary too much for a fixed one).

- [ ] **Step 4: Run tests until green**

Run: `npx vitest run src/infra/zeptomail/broadcast-shell.test.ts`
Expected: PASS.

- [ ] **Step 5: Visual verification against the format** — render one sample to the scratchpad and screenshot with the `/tmp/pw-runner` recipe (light, dark, 375px), comparing against the season template shots. The card border, rounded boxes, and lockup must match.

- [ ] **Step 6: Commit**

```bash
git add src/infra/zeptomail/broadcast-shell.ts src/infra/zeptomail/broadcast-shell.test.ts
git commit -m "feat(broadcast): card-format email shell with per-recipient personalization"
```

---

### Task 4: The dispatcher route

**Files:**
- Modify: `src/infra/zeptomail/client.ts` (one new export, next to `sendAdminCustomerEmail`)
- Create: `src/app/api/internal/broadcast-send/route.ts`

**Interfaces:**
- Consumes: `buildBroadcastEmailHtml`, `personalizeBroadcast`, `reasonLineFor` (Task 3); tables (Task 1); `CircuitOpenError` from `@/infra/http/circuit-breaker`; `sendTemplate` and the existing raw-send plumbing in `client.ts`; `getWaitlistStatus` from `@/infra/supabase/subscriptions-repo` and `getIntakeState` from `@/infra/config/intake` (both already exist — see `subscription-ended-send/route.ts:22-23` for the import shapes).
- Produces: `sendBroadcastEmail({ toEmail, toName, subject, html }): Promise<void>` in `client.ts`; `POST /api/internal/broadcast-send` returning `{ ok, broadcast_id?, sent, failed, remaining, done }` or `{ skipped: 'breaker_open' | 'no_active_broadcast' }`.

- [ ] **Step 1: Add `sendBroadcastEmail` to `client.ts`**

Mirror `sendAdminCustomerEmail` exactly (same env reads, same `zeptoFetch(RAW_API_URL, ...)`, same `SEND_TIMEOUT_MS`), but taking finished HTML:

```ts
/**
 * One broadcast recipient. Raw-HTML send through the same breaker-wrapped
 * path as every transactional email — the DISPATCHER is what protects
 * transactional traffic, by stopping its batch the moment the breaker opens
 * rather than hammering a struggling ZeptoMail with hundreds of sends.
 */
export async function sendBroadcastEmail(input: {
  toEmail: string;
  toName: string;
  subject: string;
  html: string;
}): Promise<void> {
  const token = process.env.ZEPTOMAIL_API_TOKEN;
  const fromAddress = process.env.ZEPTOMAIL_FROM_ADDRESS;
  const fromName = process.env.ZEPTOMAIL_FROM_NAME ?? 'Dormers';
  if (!token) throw new Error('ZEPTOMAIL_API_TOKEN is not set');
  if (!fromAddress) throw new Error('ZEPTOMAIL_FROM_ADDRESS is not set');

  const res = await zeptoFetch(RAW_API_URL, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      from: { address: fromAddress, name: fromName },
      to: [{ email_address: { address: input.toEmail, name: input.toName } }],
      subject: input.subject,
      htmlbody: input.html,
    }),
  }, { timeoutMs: SEND_TIMEOUT_MS });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ZeptoMail broadcast ${res.status}: ${text || res.statusText}`);
  }
}
```

- [ ] **Step 2: Write the route**

`src/app/api/internal/broadcast-send/route.ts`, auth block copied verbatim from `subscription-ended-send/route.ts:40-50` (Bearer `INTERNAL_RETRY_SECRET`, `timingSafeCompare`). No request body needed — the route finds its own work.

```ts
/**
 * Broadcast dispatcher tick. Called every minute by dispatch_broadcast_tick
 * (pg_cron) while any broadcast is in 'sending'. Sends a BOUNDED batch per
 * invocation so no audience size can outrun the function timeout; resume is
 * inherent because progress lives in broadcast_sends.sent_at, not in memory.
 *
 * Failure taxonomy:
 *   CircuitOpenError  → stop the whole tick, count NO attempts. ZeptoMail is
 *                       down or struggling; transactional email has priority
 *                       and the rows will still be here next tick.
 *   per-recipient err → attempts+1, last_error, keep going. At 3 attempts the
 *                       row is parked until an admin presses Retry failures.
 */
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { CircuitOpenError } from '@/infra/http/circuit-breaker'
import { sendBroadcastEmail, sendTemplate } from '@/infra/zeptomail/client'
import { buildBroadcastEmailHtml, personalizeBroadcast, reasonLineFor } from '@/infra/zeptomail/broadcast-shell'
import { getIntakeState } from '@/infra/config/intake'
import { getWaitlistStatus } from '@/infra/supabase/subscriptions-repo'
import { timingSafeCompare } from '@/shared/crypto'

const BATCH_SIZE = 25
export const maxDuration = 60

export async function POST(req: Request) {
  // ... auth block (verbatim from subscription-ended-send) ...

  const sb = createAdminSupabaseClient()

  const { data: broadcast } = await sb.from('broadcasts')
    .select('id, kind, subject, heading, body, cta_label, cta_url, audience, status')
    .eq('status', 'sending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!broadcast) return NextResponse.json({ ok: true, skipped: 'no_active_broadcast' })

  const { data: pending } = await sb.from('broadcast_sends')
    .select('id, customer_id, email, first_name')
    .eq('broadcast_id', broadcast.id)
    .is('sent_at', null)
    .lt('attempts', 3)
    .order('id')
    .limit(BATCH_SIZE)

  let sent = 0, failed = 0
  for (const row of pending ?? []) {
    try {
      if (broadcast.kind === 'season_reopen') {
        await sendSeasonReopenTo(sb, row)          // Task 7 fills this in
      } else {
        const html = buildBroadcastEmailHtml({
          firstName: row.first_name,
          heading: broadcast.heading,
          bodyText: broadcast.body,
          ctaLabel: broadcast.cta_label ?? undefined,
          ctaUrl: broadcast.cta_url ?? undefined,
          reasonLine: reasonLineFor(broadcast.audience),
        })
        await sendBroadcastEmail({
          toEmail: row.email,
          toName: row.first_name,
          subject: personalizeBroadcast(broadcast.subject, row.first_name),
          html,
        })
      }
      await sb.from('broadcast_sends')
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq('id', row.id)
      sent++
    } catch (err) {
      if (err instanceof CircuitOpenError || (err as Error)?.name === 'CircuitOpenError') {
        return NextResponse.json({ ok: false, skipped: 'breaker_open', sent, failed })
      }
      failed++
      await sb.from('broadcast_sends')
        .update({
          attempts: /* read-modify-write is racy across ticks but ticks are
                       serialized by pg_cron; still, use the returned row */ undefined,
          last_error: String((err as Error)?.message ?? err).slice(0, 500),
        })
        .eq('id', row.id)
    }
  }

  const { count: remaining } = await sb.from('broadcast_sends')
    .select('id', { count: 'exact', head: true })
    .eq('broadcast_id', broadcast.id)
    .is('sent_at', null)
    .lt('attempts', 3)

  const done = (remaining ?? 0) === 0
  if (done) {
    await sb.from('broadcasts')
      .update({ status: 'done', finished_at: new Date().toISOString() })
      .eq('id', broadcast.id)
      .eq('status', 'sending')
  }
  return NextResponse.json({ ok: true, broadcast_id: broadcast.id, sent, failed, remaining, done })
}
```

For the attempts increment, do it properly with a small RPC-free pattern: read `attempts` in the pending select (`select('id, customer_id, email, first_name, attempts')`) and write `attempts: row.attempts + 1`. Ticks are serialized (one cron, one route), so this is safe. Leave `sendSeasonReopenTo` as a thrown `Error('season_reopen not wired yet')` stub in this task — the kind cannot be created from the UI until Task 7 anyway.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Manual dispatch test against dev** — insert a one-recipient broadcast aimed at your own address via MCP `execute_sql`:

```sql
with b as (
  insert into public.broadcasts (kind, subject, heading, body, audience, created_by)
  values ('custom', '[Dispatcher test] Hello {{first_name}}', 'Testing the dispatcher, {{first_name}}.',
          'If you can read this, the queue drains.', 'everyone', 'plan-task-4')
  returning id
)
insert into public.broadcast_sends (broadcast_id, customer_id, email, first_name)
select b.id, c.id, 'saadhazari01@gmail.com', 'Saad'
from b, public.customers c limit 1;
```

Then with `npm run dev` running:

```bash
curl -s -X POST http://localhost:3000/api/internal/broadcast-send \
  -H "Authorization: Bearer $(grep '^INTERNAL_RETRY_SECRET=' .env.local | cut -d= -f2-)"
```

Expected: `{ ok: true, sent: 1, failed: 0, remaining: 0, done: true }`, the email arrives in the card format, and the `broadcasts` row flips to `done`. Clean up: `delete from public.broadcasts where created_by = 'plan-task-4';`

- [ ] **Step 5: Commit**

```bash
git add src/infra/zeptomail/client.ts src/app/api/internal/broadcast-send/route.ts
git commit -m "feat(broadcast): bounded-batch dispatcher route with breaker fail-fast"
```

---

### Task 5: The tick

**Files:**
- Create: `supabase/migrations/20260818_broadcast_tick.sql`

**Interfaces:**
- Consumes: the route from Task 4; vault secrets `admin_base_url` + `internal_retry_secret` (both already exist — `dispatch_start_day_emails_tick` reads them).
- Produces: `public.dispatch_broadcast_tick()` scheduled every minute as `dispatch_broadcast_every_minute`.

- [ ] **Step 1: Write the mirror migration file** — modeled directly on `supabase/migrations/20260525_dispatch_start_day_emails_cron.sql`:

```sql
-- ============================================================================
-- dispatch_broadcast_tick — per-minute cron that drives the broadcast
-- dispatcher. The EXISTS guard makes idle ticks free: no HTTP request unless
-- a broadcast is actually in 'sending', so the every-minute schedule costs
-- nothing between broadcasts. One POST per tick; the route bounds its own
-- batch (25), so throughput is ~25 emails/minute — deliberate pacing that
-- also staggers any CTA flash crowd.
--
-- Applied live to the Ohio project (yjjayivwfqjfppawgyaz) via Supabase MCP on
-- 2026-08-18. This file is the source-control mirror.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_broadcast_tick()
RETURNS TABLE(dispatched int, skipped_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  base_url     text;
  retry_secret text;
  http_req_id  bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.broadcasts WHERE status = 'sending') THEN
    dispatched := 0; skipped_reason := 'idle';
    RETURN NEXT; RETURN;
  END IF;

  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'admin_base_url' LIMIT 1;
  SELECT decrypted_secret INTO retry_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_retry_secret' LIMIT 1;

  IF base_url IS NULL OR retry_secret IS NULL THEN
    RAISE WARNING 'dispatch_broadcast_tick: required vault secrets missing';
    dispatched := 0; skipped_reason := 'no_config';
    RETURN NEXT; RETURN;
  END IF;

  SELECT net.http_post(
    url     := base_url || '/api/internal/broadcast-send',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || retry_secret,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  ) INTO http_req_id;

  dispatched := 1; skipped_reason := NULL;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.dispatch_broadcast_tick() IS
  'Per-minute broadcast pump. Free when idle (EXISTS guard); POSTs /api/internal/broadcast-send once per tick while a broadcast is sending.';

REVOKE EXECUTE ON FUNCTION public.dispatch_broadcast_tick() FROM public, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('dispatch_broadcast_every_minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'dispatch_broadcast_every_minute',
  '* * * * *',
  $cron$ SELECT public.dispatch_broadcast_tick(); $cron$
);

COMMIT;
```

- [ ] **Step 2: Apply via MCP** (`apply_migration`, name `broadcast_tick`).

- [ ] **Step 3: Verify idle behavior** via MCP `execute_sql`: `select * from public.dispatch_broadcast_tick();` → expected `(0, 'idle')`. Then check the schedule exists: `select jobname, schedule from cron.job where jobname = 'dispatch_broadcast_every_minute';`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260818_broadcast_tick.sql
git commit -m "feat(broadcast): per-minute dispatch tick, free when idle"
```

---

### Task 6: Server actions

**Files:**
- Create: `src/app/admin/comms/broadcast/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin` from `@/contexts/admin/usecases/require-admin`, `createAdminSupabaseClient`, `logAdminAction` from `@/contexts/admin/usecases/audit`, the two RPCs (Task 2). Follow `src/app/admin/reviews/email-actions.ts` for the action shape (4-space indent, `Result` type, validation-first).
- Produces (all `'use server'`):
  - `previewAudience(audience: string, dormName?: string): Promise<{ ok: boolean; count: number; message?: string }>`
  - `launchBroadcast(input: { kind: 'custom' | 'season_reopen'; subject: string; heading: string; body: string; ctaLabel?: string; ctaUrl?: string; audience: string; dormName?: string }): Promise<{ ok: boolean; id?: string; count?: number; message: string }>`
  - `getBroadcastProgress(id: string): Promise<{ ok: boolean; status: string; total: number; sent: number; failedParked: number }>`
  - `cancelBroadcast(id: string): Promise<{ ok: boolean; message: string }>`
  - `retryBroadcastFailures(id: string): Promise<{ ok: boolean; rearmed: number; message: string }>`

- [ ] **Step 1: Implement the five actions**

Key logic, validation-first like the sibling file:

```ts
export async function launchBroadcast(input: LaunchInput): Promise<LaunchResult> {
    const admin = await requireAdmin()

    const subject = input.subject.trim()
    if (input.kind === 'custom') {
        if (!subject) return { ok: false, message: 'Subject is required.' }
        if (subject.length > 200) return { ok: false, message: 'Subject is too long (max 200 characters).' }
        if (!input.heading.trim()) return { ok: false, message: 'Heading is required.' }
        if (!input.body.trim()) return { ok: false, message: 'Body is required.' }
        if (input.body.length > 8000) return { ok: false, message: 'Body is too long (max 8000 characters).' }
        if ((input.ctaLabel?.trim() ? 1 : 0) !== (input.ctaUrl?.trim() ? 1 : 0)) {
            return { ok: false, message: 'A button needs both a label and a link.' }
        }
        if (input.ctaUrl && !/^https:\/\//.test(input.ctaUrl.trim())) {
            return { ok: false, message: 'The button link must be a full https:// URL.' }
        }
    }
    if (input.kind === 'season_reopen' && input.audience !== 'reopen') {
        return { ok: false, message: 'The reopening notice always goes to the reopen audience.' }
    }
    if (input.audience === 'dorm' && !input.dormName?.trim()) {
        return { ok: false, message: 'Pick a dorm for a dorm-only broadcast.' }
    }

    const sb = createAdminSupabaseClient()
    const { data: created, error } = await sb.from('broadcasts').insert({
        kind: input.kind,
        subject: input.kind === 'season_reopen' ? 'Season reopening (ZeptoMail template)' : subject,
        heading: input.heading?.trim() ?? '',
        body: input.body?.trim() ?? '',
        cta_label: input.ctaLabel?.trim() || null,
        cta_url: input.ctaUrl?.trim() || null,
        audience: input.audience,
        dorm_name: input.dormName?.trim() || null,
        created_by: admin.email,
    }).select('id').single()
    if (error || !created) return { ok: false, message: `Could not create the broadcast: ${error?.message}` }

    const { data: count, error: confirmErr } = await sb.rpc('broadcast_confirm', { p_broadcast_id: created.id })
    if (confirmErr) {
        // A broadcast that failed to snapshot must not sit in 'sending' with
        // recipient_count 0 — the tick would immediately mark it done.
        await sb.from('broadcasts').delete().eq('id', created.id)
        return { ok: false, message: `Could not snapshot the audience: ${confirmErr.message}` }
    }

    await logAdminAction(admin.email, 'launch_broadcast', 'broadcast', created.id, {
        kind: input.kind, audience: input.audience, recipients: count,
    })
    revalidatePath('/admin/comms/broadcast')
    return { ok: true, id: created.id, count: count as number, message: `Broadcast queued to ${count} recipients.` }
}
```

`previewAudience`: `sb.rpc('broadcast_audience', { p_audience: audience, p_dorm: dormName ?? null })` and return `data?.length ?? 0`. `getBroadcastProgress`: one `broadcasts` read plus two head-counts on `broadcast_sends` (`sent_at not null` → sent; `sent_at is null and attempts >= 3` → failedParked). `cancelBroadcast`: `update ... set status='cancelled', finished_at=now() where id=? and status='sending'`, audit-log it. `retryBroadcastFailures`: `update broadcast_sends set attempts=0, last_error=null where broadcast_id=? and sent_at is null and attempts >= 3`, then flip the broadcast back to `'sending'` if it was `'done'` or `'cancelled'`, audit-log with the re-armed count.

- [ ] **Step 2: Typecheck and lint** — `npx tsc --noEmit && npm run lint`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/comms/broadcast/actions.ts
git commit -m "feat(broadcast): admin actions — preview, launch, progress, cancel, retry"
```

---

### Task 7: Season reopen mode

**Files:**
- Modify: `src/app/api/internal/broadcast-send/route.ts` (replace the Task 4 stub)
- Modify: `src/app/admin/season/SeasonClient.tsx` (post-toggle offer)

**Interfaces:**
- Consumes: `sendTemplate` (exists in `client.ts` — `{ templateKey, to: { email, name }, mergeInfo }`), `ZEPTOMAIL_TPL_SEASON_REOPEN` env, `getIntakeState()` (`{ paused, cycleStartedAt, ... }`), `getWaitlistStatus(sb, customerId, cycleStartedAt)` → `{ unspentCreditAed }`, `intake_waitlist` table.
- Produces: `sendSeasonReopenTo` — per-recipient merge keys honoring the omit-key contract; `notified_at` stamping.

- [ ] **Step 1: Implement `sendSeasonReopenTo` in the route**

```ts
/**
 * One reopen recipient via the ZeptoMail season-reopen template.
 * The template serves two audiences (docs/email-templates/season-reopen.html):
 * credit holders get the credit block + "Use my credit"; everyone else gets
 * "Restart my plan". credit_aed is OMITTED, never '', when absent — ZeptoMail
 * Mustache treats '' as truthy and would render a blank amount.
 * footer_reason must be TRUE per recipient (spam-complaint hygiene).
 */
async function sendSeasonReopenTo(
  sb: ReturnType<typeof createAdminSupabaseClient>,
  row: { customer_id: string; email: string; first_name: string },
): Promise<void> {
  const templateKey = process.env.ZEPTOMAIL_TPL_SEASON_REOPEN
  if (!templateKey) throw new Error('ZEPTOMAIL_TPL_SEASON_REOPEN is not set')

  const { data: waitlistRow } = await sb.from('intake_waitlist')
    .select('id').eq('customer_id', row.customer_id).maybeSingle()

  const intakeState = await getIntakeState()
  const { unspentCreditAed } = await getWaitlistStatus(sb, row.customer_id, intakeState.cycleStartedAt)

  const mergeInfo: Record<string, string> = {
    first_name: row.first_name,
    cta_label: unspentCreditAed > 0 ? 'Use my credit' : 'Restart my plan',
    footer_reason: waitlistRow
      ? 'You are getting this because you asked to hear when we reopened.'
      : 'You are getting this because you were on a Dormers plan before.',
  }
  if (unspentCreditAed > 0) mergeInfo.credit_aed = String(unspentCreditAed)

  await sendTemplate({
    templateKey,
    to: { email: row.email, name: row.first_name },
    mergeInfo,
  })

  if (waitlistRow) {
    await sb.from('intake_waitlist')
      .update({ notified_at: new Date().toISOString() })
      .eq('customer_id', row.customer_id)
      .is('notified_at', null)
  }
}
```

Check `sendTemplate`'s exact exported signature in `client.ts` before writing; if its `to` shape differs, follow the file, not this sketch.

- [ ] **Step 2: The post-toggle offer in `SeasonClient.tsx`** — read the component first; after the existing toggle-off success state, add a link styled like its neighboring admin buttons:

```tsx
<a href="/admin/comms/broadcast?preset=reopen">Send the reopening notice</a>
```

with one sentence of copy: "Intake is open again. The reopening notice tells the early access list their credit is ready, and lapsed customers that plans are back." Never automatic — this is a link to a confirm screen, not a send.

- [ ] **Step 3: Add `ZEPTOMAIL_TPL_SEASON_REOPEN` to Netlify production env** — it was deliberately withheld while nothing read it (`.planning/seasonal-pause-handoff.md`); this task is the moment code reads it. `netlify env:set ZEPTOMAIL_TPL_SEASON_REOPEN <key from .env.local> --context production` and verify with `netlify env:list --context production`.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/app/api/internal/broadcast-send/route.ts src/app/admin/season/SeasonClient.tsx
git commit -m "feat(broadcast): season reopen mode — template sends, waitlist notified_at writer"
```

---

### Task 8: The composer UI

**Files:**
- Create: `src/app/admin/comms/broadcast/page.tsx`
- Create: `src/app/admin/comms/broadcast/BroadcastClient.tsx`
- Modify: `src/app/admin/AdminSidebar.tsx`

**Interfaces:**
- Consumes: all five actions (Task 6), `buildBroadcastEmailHtml`/`reasonLineFor` (Task 3, for the live preview — imported into the server component, HTML passed down as a string), `AdminModal` from `../../_components/AdminModal` (`{ label, maxW?, onBackdrop, children }`), `AdminButton`/`AdminCard` (read their props before using).
- Produces: `/admin/comms/broadcast` — composer, preview, count-naming confirm, progress, history.

- [ ] **Step 1: `page.tsx`** — server component: `requireAdmin` via layout (check how `admin/comms/page.tsx` gates; it relies on the admin layout), `dynamic = 'force-dynamic'`, load the last 20 broadcasts with their counts and the distinct dorm list for the dorm audience picker:

```tsx
const { data: broadcasts } = await sb.from('broadcasts')
    .select('id, kind, subject, audience, dorm_name, status, recipient_count, created_by, created_at, finished_at')
    .order('created_at', { ascending: false })
    .limit(20)
const { data: dorms } = await sb.from('customers')
    .select('dorm_name').not('dorm_name', 'is', null)
```

Dedupe dorm names server-side; render `<BroadcastClient broadcasts={...} dorms={...} />`.

- [ ] **Step 2: `BroadcastClient.tsx`** — `'use client'`, admin light theme, following the visual conventions of `CommsClient.tsx`. Structure:

1. **Mode toggle:** "Custom email" / "Season reopening notice" (the latter preselected when `?preset=reopen`; use `useSearchParams`).
2. **Custom form:** subject, heading, body (textarea, blank line = new paragraph, `{{first_name}}` documented inline in helper text), optional CTA label + URL, audience `<select>` (everyone / active plans / early access list / ended and not renewed / one dorm) + dorm picker shown only for `dorm`.
3. **Live count:** on audience change call `previewAudience`; render "Will reach N customers." Debounce not needed — it fires on discrete select changes.
4. **Preview:** an `<iframe srcDoc={previewHtml} />` rendered from `buildBroadcastEmailHtml` with `firstName: 'Ahmed'` — build it in the client by importing the pure module (it has no server deps) so typing updates live. Season mode shows a static explanation instead: "This sends the season-reopen ZeptoMail template. Credit holders see their amount; everyone else gets the plain we-are-back version."
5. **Confirm gate (spec §9.1):** the send button opens `AdminModal` naming the EXACT count: "This emails N people and cannot be recalled once sent. Type SEND to confirm." — a text input must equal `SEND` to enable the final button, which calls `launchBroadcast`. Never one click.
6. **Progress:** after launch (and for any history row with status `sending`), poll `getBroadcastProgress` every 3s: progress bar (brand orange `#f57f20` fill — the ceiling, never darker), "sent / total, X parked after 3 attempts", plus **Cancel** (`cancelBroadcast`, confirm-modal too: "Stops everything unsent. Already-sent emails stay sent.") and **Retry failures** (`retryBroadcastFailures`) when parked > 0.
7. **History table:** the 20 rows with kind, audience, count, status, who, when.

- [ ] **Step 3: Sidebar entry** — in `AdminSidebar.tsx`, directly under the Messages item (line ~83): `{ label: 'Broadcast', href: '/admin/comms/broadcast', icon: <Megaphone size={ICON_SIZE} strokeWidth={ICON_STROKE} /> }` (import `Megaphone` from `lucide-react`).

- [ ] **Step 4: Typecheck and lint** — `npx tsc --noEmit && npm run lint`. Expected: clean.

- [ ] **Step 5: Visual verification** — with `npm run dev`, screenshot `/admin/comms/broadcast` via the `/tmp/pw-runner` recipe at 1440px and 375px: form, preview pane showing the card format, confirm modal open (check it names the count), progress view. Admin pages are system-pref themed — shoot light AND dark.

- [ ] **Step 6: End-to-end dry run** — audience `dorm` with a dorm that contains only QA fixture accounts (see `scripts/seed-test-accounts.ts`), body mentioning `{{first_name}}`; launch, watch the progress bar drain via the real cron tick (within a minute), verify the fixture inbox isn't required — check `broadcast_sends.sent_at` stamps and `status='done'` via MCP instead.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/comms/broadcast/ src/app/admin/AdminSidebar.tsx
git commit -m "feat(broadcast): composer UI — preview, count-naming confirm, progress, kill switch"
```

---

### Task 9: Close out

**Files:**
- Modify: `.planning/seasonal-pause-handoff.md`

- [ ] **Step 1: Full test suite + lint** — `npx vitest run` and `npm run lint`. Expected: green, clean.

- [ ] **Step 2: Update the handoff doc** — in the "broadcast / reopen messaging stream" section: the composer is BUILT (this plan, date), `notified_at` has its writer (dispatcher route, on successful reopen send to a waitlist member), `ZEPTOMAIL_TPL_SEASON_REOPEN` is now in Netlify production (Task 7 step 3), and the remaining gap is only the two reopen WhatsApp templates (`intake_reopened`, `intake_back_open`) which stay unbuilt — they follow the 4-step dispatcher contract and are explicitly out of this plan's scope.

- [ ] **Step 3: Commit**

```bash
git add .planning/seasonal-pause-handoff.md
git commit -m "docs: broadcast composer built; reopen WhatsApp templates remain the open item"
```

---

## Deferred (explicitly out of scope)

- The two reopen **WhatsApp** templates (`intake_reopened`, `intake_back_open`): no approved copy exists (the original was lost — see handoff). They ride the `customer_notifications` queue and the strict 4-step dispatcher order, not this email pipeline.
- Unsubscribe/preference management: these are operational announcements to existing customers, owner's standing call. Revisit if broadcasts drift toward marketing cadence.
- Scheduling a broadcast for later, drafts, and multi-admin edit locks: YAGNI until asked.

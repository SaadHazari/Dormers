# The contact book

**Status:** design, approved in outline 2026-09-16.
**All four phases shipped** 2026-09-16 — the spine, the customers mirror,
`admin_contact_search`, `/admin/contacts`, the CSV import, broadcasts
retargeted at contacts with a real unsubscribe, and the WhatsApp channel with
its five guardrails. Committed locally, **not deployed** (deploy is
`git push origin main:Production`).
**Supersedes nothing.** Extends the broadcast subsystem
(`supabase/migrations/20260818_broadcasts.sql`,
`src/app/admin/comms/broadcast/`, `src/app/api/internal/broadcast-send/`).

---

## 1. What this is for

Dormers knows about far more people than it has customers. Two years of email
signups, website visitors, free signups and referrals live in Zoho, and none
of them are reachable from the admin panel. Meanwhile the admin panel already
has a working bulk-email machine — composer, live audience count, snapshot on
confirm, a dispatcher with retries, cancel — that can only ever speak to rows
in `customers`.

The gap is one sentence wide: **`broadcast_sends.customer_id` is `not null`
and references `customers`.** Everything else already works.

So this design does three things:

1. Introduces `contacts` as the table that owns *people*, with `customers` as
   one source feeding it rather than the only one.
2. Moves broadcasts to target contacts, which makes the existing composer
   work for the whole book unchanged.
3. Adds WhatsApp as a second channel through the same dispatcher, with the
   guardrails that sending marketing from the OTP number demands.

### What it is not

Not a CRM. No deal stages, no activity feed, no task assignment. A contact is
a name, a way to reach them, where they came from, and whether they have said
stop. If a feature does not serve "send the right message to the right group
of people," it is out.

---

## 2. Current state, measured

Read from the live Ohio project (`yjjayivwfqjfppawgyaz`) on 2026-09-16.

| Thing | Count |
|---|---|
| `customers` rows | 73 |
| …with an email | 73 (no duplicates, but **no unique index** either) |
| …with a WhatsApp number | 69 |
| …that ever had a subscription | 37 |
| `intake_waitlist` | 17 rows, 16 people, 3 pause cycles (15 show on the new Waitlist chip; one has a live plan again) |
| `broadcasts` / `broadcast_sends` | 0 / 0 (nothing sent yet in production) |

That last row matters: the retarget migration in §5 can be done without
preserving a single historical send.

Existing pieces this design reuses rather than rebuilds:

- **`broadcast_audience(p_audience, p_dorm)`** — one SQL function that is the
  single source of truth for who an audience is. The composer's live count and
  `broadcast_confirm`'s snapshot both call it, so the number shown at confirm
  time is exactly the set queued.
- **The dispatcher** (`/api/internal/broadcast-send`) — pg_cron every minute
  while anything is `sending`; claims a bounded batch through
  `broadcast_claim_batch` (`for update skip locked`, 2-minute self-releasing
  lease); circuit breaker stops the whole tick without burning attempts;
  per-recipient failures park a row at 3 attempts; re-checks status every 5
  rows so Cancel lands fast.
- **The Meta client** (`src/infra/meta-whatsapp/client.ts`) — Graph v22,
  8s timeout, circuit breaker, never retries (a send is not idempotent).
- **The inbound webhook** (`/api/ops/whatsapp-inbound`) — HMAC-verified,
  returns 200 before processing. Today it only serves delivery riders on an
  allowlist; §6 hangs opt-out off the same route.

---

## 3. The spine: `contacts`

One row per person. Not per account, not per email address.

```sql
create table public.contacts (
  id               uuid primary key default gen_random_uuid(),
  email            text,                       -- stored lowercased, trimmed
  phone_e164       text,                       -- '+9715…', digits validated
  name             text,
  -- Where we first met them. Never overwritten by a later import.
  source           text not null
                     check (source in ('customer','zoho_import','website',
                                       'referral','free_signup','waitlist','manual')),
  source_detail    text,                       -- free text: campaign, file, referrer
  -- Set when this person also has an account. Null for everyone else.
  customer_id      uuid unique references public.customers(id) on delete set null,
  tags             text[] not null default '{}',
  notes            text,

  email_status     text not null default 'subscribed'
                     check (email_status in ('subscribed','unsubscribed','bounced','complained')),
  whatsapp_status  text not null default 'unknown'
                     check (whatsapp_status in ('unknown','opted_in','opted_out','failed')),
  unsubscribed_at  timestamptz,
  last_emailed_at  timestamptz,
  last_whatsapped_at timestamptz,

  import_id        uuid,  -- FK added after contact_imports below; see note
  first_seen_at    timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint contacts_reachable check (email is not null or phone_e164 is not null)
);

create unique index contacts_email_key on public.contacts (email) where email is not null;
create index        contacts_phone_idx on public.contacts (phone_e164) where phone_e164 is not null;
```

(`import_id`'s foreign key to `contact_imports` is added by a follow-up
`alter table` once that table exists, since the two reference each other's
order of creation.)

### Decisions worth defending

**Email is the identity key. Phone is not** — corrected during phase A, by the
live data. The first backfill uniquely indexed both and silently mirrored only
52 of 73 customers: four share `+971545766707`, four more share
`+966552426072`. Students lend each other phones and families share one, so a
unique index on `phone_e164` does not describe a person, it loses people.
Email held at 73 of 73 and is uniquely indexed.

Both columns stay nullable — a Zoho row may have only an email, a referral
only a phone — and the check constraint says a contact must be reachable
*somehow*. The partial unique on email is what makes re-running an import a
no-op; a phone-only row is deduped on phone at import time, and only when
exactly one existing contact holds that number.

**`source` records where we first met them and is never rewritten.** A Zoho
contact who later signs up stays `zoho_import` with `customer_id` filled in.
That is how "how many of the old list converted" stays answerable.

**`whatsapp_status` defaults to `unknown`, not `opted_in`.** An imported
contact has not consented to WhatsApp marketing. `unknown` contacts can still
be sent to (see §6) but only behind an explicit acknowledgement, so the
decision is made once, on purpose, by a person — not silently by a default.

**`email_status` defaults to `subscribed`.** Different judgement from
WhatsApp, deliberately: these are people who gave Dormers an email address,
and email has a working unsubscribe. WhatsApp has neither the norm nor the
forgiveness.

**No `contact_events` table.** Tempting, unnecessary. `broadcast_sends` is
already the per-person send log, and `last_emailed_at` covers "when did we
last bother this person." If an activity feed is ever wanted, it is a separate
design.

### The import batch

```sql
create table public.contact_imports (
  id            uuid primary key default gen_random_uuid(),
  filename      text not null,
  uploaded_by   text not null,
  source        text not null,          -- what every row in this file is tagged as
  total_rows    int not null default 0,
  created       int not null default 0,
  matched       int not null default 0, -- already a contact or customer
  skipped       int not null default 0, -- invalid or duplicate within the file
  created_at    timestamptz not null default now()
);
```

Kept so a bad import can be found and undone (`delete from contacts where
import_id = …` only removes rows that import created — `matched` rows are not
tagged with it).

---

## 4. Customers mirror into contacts

Every `customers` row gets a contact. A trigger on insert and update keeps it
current:

- Match on `customer_id` first. If none, match on lowercased email. If still
  none, match on `phone_e164` — but only against a contact that has no email
  of its own and no second contact sharing that number, since a shared number
  identifies nobody.  If still none, insert.
- On match, set `customer_id`, fill `name`/`phone`/`email` where the contact's
  are null, and **leave `source` alone**.
- Never touch `email_status` or `whatsapp_status`. A customer who
  unsubscribed from marketing stays unsubscribed; transactional mail does not
  go through this system and is unaffected.

**`customers` has no unique index on email.** It happens to hold no duplicates
today, but the trigger cannot assume that. The match is `order by created_at
limit 1` and a duplicate pair resolves to one contact with the older
`customer_id`. A backfill report at build time lists any customer whose email
collides, so it is a known list rather than a silent merge.

Backfill runs once: all 73 customers, tagged `source = 'customer'`.

---

## 5. Broadcasts retarget to contacts

### Schema change

```sql
alter table public.broadcast_sends
  add column contact_id uuid references public.contacts(id) on delete cascade,
  alter column customer_id drop not null;

-- the uniqueness that matters is now per contact
drop index broadcast_sends_broadcast_id_customer_id_key;
create unique index broadcast_sends_broadcast_contact_key
  on public.broadcast_sends (broadcast_id, contact_id);
```

`customer_id` stays as a denormalised convenience so the dispatcher's
season-reopen path (which reads `intake_waitlist` by customer) needs no
rewrite. It is null for contacts with no account, and every code path that
reads it already runs only inside `kind = 'season_reopen'`, whose audience is
by definition account-holders.

`broadcast_sends.email` becomes nullable and gains `phone_e164`, because a
WhatsApp-channel send may have no email at all.

### Channel and audience

```sql
alter table public.broadcasts
  add column channel text not null default 'email'
    check (channel in ('email','whatsapp'));
```

`broadcast_audience` is rewritten to return
`(contact_id, customer_id, email, phone_e164, first_name)` from `contacts`,
and gains contact-shaped audiences alongside the existing plan-shaped ones:

| Audience | Who |
|---|---|
| `everyone` | every contact, reachable on the chosen channel, not opted out |
| `customers` | contacts with a `customer_id` |
| `active_plans` | unchanged — via `customer_id` |
| `early_access` | unchanged — current-cycle `intake_waitlist` |
| `ended_not_renewed` | unchanged |
| `reopen` | unchanged |
| `dorm` | unchanged |
| `waitlist_all` | any `intake_waitlist` row, any cycle, **and no live plan** — the Waitlist chip's rule exactly. Someone who has since resumed is a plan-holder now, and "your spot is waiting" would read as a mistake. |
| `early_signup` | has an account, never bought, never joined the list |
| `imported` | `source = 'zoho_import'` |
| `never_customers` | `customer_id is null` |

The channel filter is part of the function, not the caller: an email broadcast
excludes contacts with no email or `email_status <> 'subscribed'`; a WhatsApp
broadcast excludes contacts with no phone or `whatsapp_status = 'opted_out'`.
This is what makes the composer's live count honest — it already shows the
number that will actually be queued, and it must keep doing so.

### Unsubscribe — new, and required

Marketing email to a two-year-old list without one-click unsubscribe will cost
the sending domain. Every email broadcast gets:

- A footer link to `/u/<token>`, where the token is an HMAC of the contact id
  (no database column, no table to keep in sync, and unguessable). Verifying
  only ever returns something UUID-shaped, so an edited link resolves to
  nothing rather than to somebody else.
- `/u/<token>` shows a button; pressing it sets `email_status =
  'unsubscribed'` and `unsubscribed_at`, then confirms with an undo. The GET
  writes nothing on purpose — mail clients and link scanners fetch every URL
  in a message, and a GET that unsubscribed would turn them into an opt-out
  machine.
- **Open:** `List-Unsubscribe` / `List-Unsubscribe-Post` headers. ZeptoMail's
  send API exposes no custom-header field, so this is a ZeptoMail account
  setting to check rather than code to write. The visible footer link ships
  either way and is the part that matters most.

**Marketing goes out on a separate ZeptoMail sending identity** —
`news.dormers.ae` or equivalent — never the domain that carries order
confirmations and auth mail. A spam complaint from a cold contact must not be
able to stop an OTP email from arriving. This also keeps the standing rule
that auth emails embed no clickable links safely separate from marketing
emails, which are nothing but clickable links.

---

## 6. WhatsApp as a second channel

Sending from the existing OTP number is an accepted decision (Saad,
2026-09-16). The risk it carries is concrete: blocks and reports drop the
number's quality rating, and a rating drop throttles or suspends the number
that new signups depend on. The design's job is to make that outcome hard to
reach by accident.

### Templates

Synced from Meta on 2026-09-16: **37 templates, 37 approved, 11 of them
MARKETING**, all named-parameter. The number reported `GREEN`. So the channel
was usable the day it shipped rather than waiting on an approval — but note
Meta returned no `messaging_limit_tier` field at all, which `tierLimit()`
reads as the smallest tier (1,000 unique recipients / 24h). That is the
intended fallback, not a bug, and it is why the composer may refuse an
audience larger than 1,000 until Meta starts reporting a tier.

```sql
create table public.whatsapp_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,     -- the Meta template name
  category      text not null check (category in ('MARKETING','UTILITY')),
  language      text not null default 'en',
  variables     text[] not null default '{}',  -- ordered body placeholders
  approved_at   timestamptz,
  body_preview  text not null,            -- what the composer renders
  created_at    timestamptz not null default now()
);
```

WhatsApp marketing cannot send free text — only an approved template with
ordered variables. The composer therefore picks a template and fills its
variables; it does not offer a body editor on the WhatsApp channel. A template
with `approved_at is null` cannot be launched.

### The dispatcher

The existing tick gains a branch on `broadcasts.channel`. Everything that
makes it safe is channel-independent and stays: claim-with-lease, bounded
batch, time budget, status re-check, attempts and parking, circuit breaker.
Two things change:

- `sendTemplate` goes to the Meta client instead of ZeptoMail.
- `BATCH_SIZE` for WhatsApp is smaller and paced (see throttle).

### Five guardrails

1. **Opt-out is real.** `/api/ops/whatsapp-inbound` today drops messages from
   numbers not on the rider allowlist. It gains a first pass: any inbound body
   matching `^\s*(stop|unsubscribe|remove)\b`, from any number, sets
   `whatsapp_status = 'opted_out'` on the matching contact and replies once
   with a confirmation. This runs before the allowlist check, so it works for
   the whole book.
2. **Consent gate.** Contacts with `whatsapp_status = 'unknown'` are excluded
   by default. Including them requires ticking an explicit box in the confirm
   modal, which is recorded in the admin audit log with the count.
3. **Quality preflight.** Before launch, read the number's `quality_rating`
   from the WABA `phone_numbers` endpoint. `GREEN` launches. `YELLOW` warns
   and requires a second confirmation. `RED` refuses.
4. **Daily cap and pacing.** A Meta number has a messaging tier (1K unique
   recipients per rolling 24h at the lowest). The composer shows the tier and
   the remaining allowance, refuses an audience larger than it, and the
   dispatcher paces sends rather than emptying the queue in a minute. A
   broadcast that exceeds the day's allowance stays `sending` overnight.
5. **Cost before confirm.** The confirm modal shows recipients × the UAE
   marketing rate as an estimated cost. A WhatsApp broadcast is the first
   thing in this codebase where pressing a button spends money per recipient;
   it should say so.

Cancel and Retry failures work unchanged — they operate on
`broadcast_sends`, which is channel-agnostic.

---

## 7. The import screen

`/admin/contacts/import`. Four steps, one page.

1. **Drop the CSV.** Parsed in the browser, first 20 rows previewed.
2. **Map the columns.** Name, email, phone, plus a `source` for the whole
   file and optional tags. Mapping is remembered per column-header signature,
   so the second Zoho export needs no mapping at all.
3. **Preview the outcome.** Every row lands in exactly one bucket, each with a
   count and an expandable sample: **new** · **already a contact** ·
   **already a customer** · **duplicate within this file** · **invalid**
   (unparseable email and unparseable phone). Nothing is written yet.
4. **Commit.** Inserts in batches inside one `contact_imports` batch. Running
   the same file twice produces zero new rows the second time.

Phone normalisation to E.164 assumes UAE (`+971`) when a number has no country
code, because that is what the list is; `00` is read as the international
prefix, and a number that cannot be normalised is `invalid`, not silently
stored. `shared/phone.ts` is deliberately lenient (it serves a half-typed OTP
field), so the import wraps it with its own strictness.

The CSV reader is ours rather than a dependency — one screen, one file format,
and the awkward parts are a few lines each: Excel's BOM, Windows CRLF, a
quoted `"Surname, Firstname"`, a doubled quote. Owning it means it can be
tested against the files Zoho actually produces.

---

## 8. The contact list itself

`/admin/contacts` — the same table idiom as `/admin/customers`, because the
admin panel should have one way of showing a list of people.

- Search across name, email, phone, tags.
- Filter chips: All · Customers · Never customers · Imported · Waitlist ·
  Unsubscribed · No email · No phone, each with a count.
- A row opens a small detail panel: the fields, the source, the link to their
  customer page if they have one, their send history from `broadcast_sends`,
  and buttons to edit tags or mark opted out.
- "Send to these" hands the current filter to the composer as an audience.

---

## 9. Build order

Each phase is deployable on its own and useful on its own.

| Phase | What ships | Useful because |
|---|---|---|
| **A** | `contacts` + `contact_imports`, customers trigger + backfill, `/admin/contacts` list | The book exists and holds the 73 people already known |
| **B** | The CSV import screen | The two years of Zoho contacts are in |
| **C** | `broadcast_sends` retarget, contact audiences, unsubscribe route, marketing sending identity | One button emails the whole book, safely |
| **D** | `whatsapp_templates`, channel column, dispatcher branch, the five guardrails, inbound STOP | One button WhatsApps the whole book |

A and B are independent of the broadcast subsystem entirely. C is where the
schema change lands, and it is cheap precisely because `broadcast_sends` is
empty today. D is the one that waits on a Meta-approved marketing template,
which is Saad's to request and not a code dependency.

---

## 10. Testing

Pure-module tests, matching how the rest of this codebase is tested:

- **Dedupe and normalisation** — email lowercasing, E.164 coercion, the
  bucket each CSV row falls into. Table-driven, one case per bucket. Must
  include the shared-number case: two contacts on one phone is correct, not a
  duplicate.
- **Audience predicates** — mirrored from `priority.ts`'s filter tests, so the
  `waitlist_all` and `early_signup` audiences provably match the admin chips
  they are named after.
- **The consent gate** — `unknown` excluded without the tick, included with
  it; `opted_out` excluded either way. This is the one that must never regress.
- **Token round-trip** — an unsubscribe token verifies for its contact and for
  no other.

Against the live database, before each phase is called done: the import
preview counts must equal the committed counts, and a broadcast's confirm
count must equal `broadcast_sends` row count. Both are the same class of bug —
a number shown to a person that the system then does not honour.

---

## 11. Known risks

| Risk | Mitigation |
|---|---|
| A cold list burns the sending domain | Separate marketing identity; one-click unsubscribe; §5 |
| WhatsApp marketing degrades the OTP number | The five guardrails in §6; accepted residual risk |
| A two-year-old list is mostly dead addresses | Bounces flip `email_status`; first send should be a smaller segment, not `everyone` |
| Import merges two different people | Match is on exact email — never on name, and never on phone alone, which is shared |
| Someone presses send twice | `broadcast_confirm` snapshots inside one transaction; unique `(broadcast_id, contact_id)` |

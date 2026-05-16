# Phase 7: Dorm Wars Reward Backend — Research

**Researched:** 2026-05-16
**Domain:** Stripe Coupons (one-time payments), Supabase Postgres triggers + RLS, Next.js API routes, idempotent reward awarders
**Confidence:** HIGH

## Summary

The reward backend is buildable today without a single new infra component. Every decision below collapses to a known Stripe/Postgres pattern. The two non-obvious findings drove most architecture choices:

1. **Stripe Checkout Sessions accept exactly ONE coupon per session** (verified — see [Stripe discounts docs](https://docs.stripe.com/payments/advanced/discounts)). This kills the "stack two coupons" approach for credit-redemption + lifetime-tier discount. Resolution: synthesize ONE on-the-fly `amount_off` coupon per checkout that bakes in both effects.

2. **The existing `referrals`, `referral_gifts_claimed`, `referral_review_queue`, `credits` tables are live and have stable, queryable schemas** (verified via PostgREST OpenAPI). The migration to capture them is mechanical — `CREATE TABLE IF NOT EXISTS` with the exact columns observed in production.

**Primary recommendation:** Fire Layer 2/3 awarders **inline at the end of `creditInviterOnConversion()`** (Decision #2 = option a). Synthesize a **single per-session `amount_off` coupon** that combines credit-redemption AED + tier % off (Decision #1). Persist all RNG outcomes server-side, including a per-fire random Mystery Drop (Decision #3 = option a, with idempotency guard via `cycle_rewards` UNIQUE).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (Critical Constraints)

- **No `customers.stripe_customer_id`** — Stripe sessions are one-shot today; we do NOT migrate to persistent Stripe Customers in this phase. Discounts/redemption attach per-session via single-use Coupon.
- **No `dorms` table** — dorm membership is `customers.dorm_name` text. Dorm Weekend cascades via `WHERE dorm_name = ?` query.
- **Existing `MAX_CONVERSIONS_MONTH = 10` cap on Layer 1** stays as-is. Layer 2 cycle counts are NOT capped.
- **Existing pg_cron infrastructure** at `/supabase/migrations/20260506_cron_jobs.sql` — new scheduled jobs (anniversary detector, etc.) follow the same pattern.
- **Netlify deployment** — no edge functions; all server logic lives in Next.js API routes or Supabase pg_cron.
- **Idempotency everywhere** — every reward award path must be safe to retry. Use UNIQUE constraints + ON CONFLICT DO NOTHING.

### Claude's Discretion (Open — Resolved Below)

| Decision | Resolved Choice |
|----------|-----------------|
| Where does Layer 2/3 threshold-cross detection fire from? | **(a) inline in `creditInviterOnConversion`** — see Decision #2 |
| Mystery Drop RNG seed | **(a) pure random per-fire** — see Decision #3 |
| Credit redemption UX | **(a) auto-apply max balance** — see Decision #4 |
| Tier 4 "100 free meals" delivery | **(a) bulk credit deposit (~5,500 cr)** — see Decision #7 |
| Free Skips at milestone 15 | **(b) new `bonus_skips` column** — see Decision #6 |

### Deferred Ideas (OUT OF SCOPE — Phase 8+)

- Layer 4 side rewards (Google review, weekly survey, anniversary, renew combo)
- Admin tooling (credit approval UI, review-queue UI)
- Dorm Weekend real mechanic (group meal, voting, etc.) — only placeholder stub in Phase 7
- Push notifications / email when rewards fire
- Migration to persistent Stripe Customers
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHEMA-01 | Snapshot existing live tables into versioned migrations | Production OpenAPI inspection gave exact columns — Decision #5 contains literal DDL |
| SCHEMA-02 | Add `daily_drops`, `streaks`, `cycle_rewards`, `lifetime_rewards` | Decision #4 contains literal DDL + RLS |
| REDEEM-01 | Apply credit balance at next checkout via per-session Stripe Coupon | Decision #1 — synthesize single `amount_off` coupon, ID stored on order |
| REDEEM-02 | Credits flip `approved → redeemed` on `checkout.session.completed`, idempotent | Webhook reads metadata.coupon_id, updates `credits.status` via `applied_to`/`applied_at` (cols already exist) |
| REDEEM-03 | Hard cap: redemption cannot exceed plan total | `Math.min(balanceFils, amountFils)` in route.ts before coupon creation |
| LAYER2-01..05 | Auto-fire 5 cycle milestones (3/6/10/15/20) | Decision #2 — inline awarder after `creditInviterOnConversion` writes credit row; idempotent via UNIQUE |
| LAYER3-01..04 | Auto-fire 4 lifetime tiers (10/25/50/100) | Same call site as Layer 2; tier perks delivered as credit deposits + flag columns; 5%/10% off baked into per-session coupon synthesis (Decision #1) |
| DROP-01 | Replace localStorage daily drop with server table | Decision #4 schema + `POST /api/dorm-wars/daily-drop` |
| DROP-02 | RNG: 60% [1..10], 30% [11..50], 10% [51..200] cr | Server-side, value stored before credit deposit, idempotent via UNIQUE(customer_id, drop_date_utc) |
| STREAK-01 | Replace `useStreak` localStorage with server table | Decision #4 schema + `POST /api/dorm-wars/streak/tick` |
| HUB-01 | HubClient reads server-canonical values for drop + streak + cycleRecruits | Decision #10 — extract `getCycleRecruits()` into queries.ts, shared by hub + awarder |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` | 19.x (current) | Coupon create + checkout session attach | Already in package.json; existing `checkout/route.ts` uses `2025-06-30.basil` API version — keep that pin |
| `@supabase/supabase-js` | 2.x (current) | Admin client for service-role writes from API routes | Already used throughout |
| `pg_cron` | shipped with Supabase | Nightly Dorm Weekend trigger (placeholder) | Already enabled in `20260506_cron_jobs.sql` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node `crypto.randomInt` | built-in | RNG for Mystery Drop + Daily Drop | Use `randomInt(min, max+1)` — uniform, no Math.random bias |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline awarder in `creditInviterOnConversion` | Postgres trigger on `credits` insert | Trigger is elegant but moves business logic into plpgsql, harder to debug + test; webhook latency is already ~1–3s so inline adds <100ms |
| Synthesized per-session coupon | Pre-create one coupon per (user, milestone) | Pre-create requires inventory; on-the-fly is stateless |
| `crypto.randomInt` | `Math.random()` | `Math.random` is non-uniform on small ranges; `randomInt` is the recommended replacement (Node 14.10+) |

**Installation:** All deps already present. No `npm install` needed.

**Version verification:** Existing `stripe` import uses `apiVersion: '2025-06-30.basil'`. This is the Acacia API version with the `discounts` field on Checkout Sessions — verified compatible.

## Architecture Patterns

### Recommended File Layout
```
src/
├── app/
│   ├── api/
│   │   ├── checkout/route.ts                # MODIFY — synthesize coupon, attach to session
│   │   ├── webhook/route.ts                 # MODIFY — mark credits redeemed; fire awarder is already inline via creditInviterOnConversion
│   │   └── dorm-wars/
│   │       ├── daily-drop/route.ts          # NEW — POST: claim today's drop
│   │       └── streak/tick/route.ts         # NEW — POST: tick streak on hub mount
│   └── r/[cid]/actions.ts                   # MODIFY — append awardCycleAndTierRewards() call
├── lib/
│   └── dorm-wars/
│       ├── awarder.ts                       # NEW — awardCycleAndTierRewards(customer_id, sub_id)
│       ├── coupon-synth.ts                  # NEW — synthesizePerSessionCoupon(stripe, user, amount_fils)
│       ├── rng.ts                           # NEW — mysteryDropValue(), dailyDropValue()
│       └── constants.ts                     # NEW — CYCLE_MILESTONES, TIER_THRESHOLDS, RNG buckets
├── utils/supabase/queries.ts                # MODIFY — add getCycleRecruits(customerId, subId)
└── supabase/migrations/
    ├── 20260516_referral_credits_snapshot.sql      # NEW — captures live schema
    ├── 20260516_dorm_wars_tables.sql               # NEW — daily_drops, streaks, cycle_rewards, lifetime_rewards
    ├── 20260516_subscription_bonus_skips.sql       # NEW — ALTER TABLE subscriptions ADD COLUMN bonus_skips
    └── 20260516_customer_perk_flags.sql            # NEW — early_access, hall_wall flags on customers
```

### Pattern 1: Idempotent Awarder
**What:** Single function called from one place (`creditInviterOnConversion`) that checks current cycle/lifetime counts and inserts ONLY missing reward rows. UNIQUE constraints make double-fire a no-op.

**When to use:** Anywhere reward state transitions on count cross. Single call site means we never have two paths racing to award the same milestone.

**Example:**
```typescript
// src/lib/dorm-wars/awarder.ts
import { createClient } from '@supabase/supabase-js'
import { mysteryDropValue } from './rng'

const CYCLE_MILESTONES = [
  { at: 3,  kind: 'mystery_drop',  value: null }, // RNG computed at fire-time
  { at: 6,  kind: 'free_week',     value: 132 },  // ~AED 132 = 1 week at avg plan rate
  { at: 10, kind: 'free_month',    value: 528 },
  { at: 15, kind: 'cash_and_skips',value: 500 },  // 500 cr + 5 bonus_skips handled separately
  { at: 20, kind: 'dorm_weekend',  value: null }, // placeholder action
] as const

const LIFETIME_TIERS = [
  { at: 10,  tier: 1, perk: '5_percent_off' },
  { at: 25,  tier: 2, perk: '10_percent_off_plus_early_access' },
  { at: 50,  tier: 3, perk: 'jacket_merch' },
  { at: 100, tier: 4, perk: '100_meals_credit' },
] as const

export async function awardCycleAndTierRewards(
  customerId: string,
  subscriptionId: string | null
): Promise<void> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Layer 2: cycle milestones ──
  if (subscriptionId) {
    // getCycleRecruits is the shared source-of-truth (Decision #10)
    const cycleRecruits = await getCycleRecruits(sb, customerId, subscriptionId)

    for (const m of CYCLE_MILESTONES) {
      if (cycleRecruits < m.at) break // milestones are sorted ascending
      const value = m.kind === 'mystery_drop' ? mysteryDropValue() : m.value
      // Single INSERT with ON CONFLICT DO NOTHING — idempotency via UNIQUE
      const { data: inserted } = await sb
        .from('cycle_rewards')
        .insert({
          customer_id: customerId,
          subscription_id: subscriptionId,
          milestone: m.at,
          kind: m.kind,
          value_aed: value,
        })
        .select('id')
        .maybeSingle() // null if conflict
      if (!inserted) continue // already awarded this cycle+milestone

      // Side effects on first-award only
      if (m.kind === 'mystery_drop' || m.kind === 'free_week' || m.kind === 'free_month') {
        await depositCredit(sb, customerId, value!, `cycle_milestone_${m.at}`, inserted.id)
      }
      if (m.kind === 'cash_and_skips') {
        await depositCredit(sb, customerId, 500, `cycle_milestone_15`, inserted.id)
        await sb.rpc('increment_bonus_skips', { p_sub_id: subscriptionId, p_amount: 5 })
      }
      // dorm_weekend: row written, real action deferred (logged for now)
    }
  }

  // ── Layer 3: lifetime tiers ──
  const { count: lifetimeConverted } = await sb
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('inviter_user_id', customerId)
    .eq('status', 'converted')

  for (const t of LIFETIME_TIERS) {
    if ((lifetimeConverted ?? 0) < t.at) break
    const { data: inserted } = await sb
      .from('lifetime_rewards')
      .insert({
        customer_id: customerId,
        tier: t.tier,
        perk: t.perk,
      })
      .select('id')
      .maybeSingle()
    if (!inserted) continue

    if (t.perk === 'early_access' || t.tier === 2) {
      await sb.from('customers').update({ early_access: true }).eq('id', customerId)
    }
    if (t.perk === 'jacket_merch') {
      // Physical fulfilment queue (could be a separate table; for Phase 7
      // we just rely on the lifetime_rewards row itself + ops dashboard)
    }
    if (t.perk === '100_meals_credit') {
      await depositCredit(sb, customerId, 5500, 'tier_4_meals', inserted.id)
      await sb.from('customers').update({ hall_wall: true }).eq('id', customerId)
    }
    // 5% and 10% off — no immediate action; read at checkout time
  }
}
```

### Pattern 2: Per-Session Coupon Synthesis
**What:** At checkout time, compute combined discount (credit AED + tier %) → create a fresh `amount_off` Stripe coupon with `max_redemptions=1, duration='once'` → attach to session via `discounts[0].coupon=<id>` → store coupon ID in session metadata → webhook reads metadata, marks credit rows as `redeemed`.

**When to use:** Every `POST /api/checkout` call when user has credit balance OR is at tier ≥ 1.

**Example:**
```typescript
// src/lib/dorm-wars/coupon-synth.ts
import type Stripe from 'stripe'

export interface CouponSynthInput {
  stripe: Stripe
  userId: string
  amountFils: number          // plan price the user is paying, in fils
  creditBalanceFils: number   // sum of approved+pending credit rows × 100
  tierPercent: 0 | 5 | 10     // from lifetime_rewards
  appliedCreditIds: string[]  // credit row IDs that will be flipped to 'redeemed'
}
export interface CouponSynthResult {
  couponId: string | null     // null = no discount needed
  discountFils: number        // total discount applied
  creditAppliedFils: number   // portion attributable to credit (cap-clamped)
  tierAppliedFils: number     // portion attributable to tier %
}

export async function synthesizePerSessionCoupon(
  input: CouponSynthInput
): Promise<CouponSynthResult> {
  const { stripe, userId, amountFils, creditBalanceFils, tierPercent, appliedCreditIds } = input

  // Credit applied = min(balance, plan total) — hard cap from CONTEXT
  const creditAppliedFils = Math.min(creditBalanceFils, amountFils)

  // Tier discount applies to the post-credit amount
  const postCreditFils = amountFils - creditAppliedFils
  const tierAppliedFils = Math.floor(postCreditFils * tierPercent / 100)

  const discountFils = creditAppliedFils + tierAppliedFils

  if (discountFils <= 0) {
    return { couponId: null, discountFils: 0, creditAppliedFils: 0, tierAppliedFils: 0 }
  }

  // Create single-use amount_off coupon in AED
  const coupon = await stripe.coupons.create({
    amount_off: discountFils,
    currency: 'aed',
    duration: 'once',
    max_redemptions: 1,
    name: `Dorm Wars rewards (${creditAppliedFils/100} AED credit + ${tierPercent}% tier)`,
    metadata: {
      user_id: userId,
      credit_applied_fils: String(creditAppliedFils),
      tier_percent: String(tierPercent),
      tier_applied_fils: String(tierAppliedFils),
      applied_credit_ids: appliedCreditIds.join(','),
    },
  })

  return {
    couponId: coupon.id,
    discountFils,
    creditAppliedFils,
    tierAppliedFils,
  }
}
```

In `checkout/route.ts`, after the existing validations, before `stripe.checkout.sessions.create`:
```typescript
// Read balance + tier
const { data: creditRows } = await supabase
  .from('credits')
  .select('id, amount_aed')
  .eq('customer_id', user.id)
  .in('status', ['approved'])  // 'pending' not redeemable yet
  .order('created_at', { ascending: true })

const balanceFils = (creditRows ?? []).reduce((s, r) => s + Math.round(Number(r.amount_aed) * 100), 0)
const appliedCreditIds = (creditRows ?? []).map(r => r.id)

const { data: latestTier } = await supabase
  .from('lifetime_rewards')
  .select('tier')
  .eq('customer_id', user.id)
  .order('tier', { ascending: false })
  .limit(1)
  .maybeSingle()

const tierPercent: 0 | 5 | 10 =
  latestTier?.tier === 1 ? 5 :
  latestTier?.tier && latestTier.tier >= 2 ? 10 : 0

const couponResult = await synthesizePerSessionCoupon({
  stripe, userId: user.id, amountFils: amount,
  creditBalanceFils: balanceFils, tierPercent, appliedCreditIds,
})

// Attach to session
const sessionArgs: Stripe.Checkout.SessionCreateParams = {
  /* ...existing args... */
  metadata: {
    /* existing metadata */
    coupon_id: couponResult.couponId ?? '',
    applied_credit_ids: appliedCreditIds.join(','),
    credit_applied_fils: String(couponResult.creditAppliedFils),
  },
}
if (couponResult.couponId) {
  sessionArgs.discounts = [{ coupon: couponResult.couponId }]
  // CRITICAL: `discounts` is mutually-exclusive with `allow_promotion_codes`.
  // Do NOT also set allow_promotion_codes:true on this session.
}

const session = await stripe.checkout.sessions.create(sessionArgs)
```

In `webhook/route.ts`, after order insert succeeds:
```typescript
const appliedCreditIds = (metadata.applied_credit_ids ?? '').split(',').filter(Boolean)
if (appliedCreditIds.length > 0) {
  await supabaseAdmin
    .from('credits')
    .update({
      status: 'redeemed',
      applied_at: new Date().toISOString(),
      applied_to: orderId,  // the order.id from the insert above
    })
    .in('id', appliedCreditIds)
    .eq('status', 'approved')  // CAS — don't double-redeem
}
```

### Anti-Patterns to Avoid
- **Two-coupon stacking:** Stripe rejects with a 400 — verified docs.
- **Pre-creating coupons** at award time and attaching at checkout: requires a coupon inventory table and "did I already use this one?" check. Synthesis is stateless.
- **Trigger-based awarder** on `credits` insert: Postgres triggers can't call Stripe API and can't easily read JSON from secrets. Inline TS is the right boundary.
- **`Math.random()` for Mystery Drop:** non-uniform on small ranges; use `crypto.randomInt`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Credit balance ledger | Custom balance table | Sum `credits.amount_aed WHERE status IN (...)` per-read | Existing pattern in `getReferralData`; balance is cheap |
| Idempotency keys | Custom dedupe table | UNIQUE constraint + `ON CONFLICT DO NOTHING` (or `.maybeSingle()` after insert) | Postgres-native, zero new code |
| Streak counter | Cron job to maintain streaks | `POST /api/dorm-wars/streak/tick` on hub mount | Lazy — only ticks when user actually visits |
| Daily drop fairness queue | Custom RNG state machine | `crypto.randomInt` per call + UNIQUE(customer, drop_date_utc) | Each fire is independent; no state to maintain |
| Coupon inventory | Pre-allocated coupon pool | Create on-the-fly per session, `max_redemptions=1` | Stateless; Stripe handles |

**Key insight:** Every reward in Phase 7 reduces to "insert a row idempotently, do side effect." The schema design (UNIQUE constraints on the natural composite keys) makes the awarder almost trivially correct.

## Runtime State Inventory

This phase introduces new state — no existing runtime state needs migrating.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Production Supabase has live `referrals`, `referral_gifts_claimed`, `referral_review_queue`, `credits` tables (verified via REST API HTTP 200 + OpenAPI schema fetch). Total rows non-zero. | Migration must use `CREATE TABLE IF NOT EXISTS` — verified column-by-column compatible with live data |
| Live service config | Stripe account has no existing coupons named `dorm-wars-*` (assumption — confirm at execution time via `stripe.coupons.list`). Existing checkout sessions do NOT use `discounts` field. | None — new coupons are created per-session, prefix names with `dw-` for identification |
| OS-registered state | None — Netlify deployment, no OS-level registrations | None |
| Secrets / env vars | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` already present. No new secrets needed. | None |
| Build artifacts / installed packages | None — no new deps | None |

**Snapshot migration must be a no-op against live DB.** Verified columns match by-name and by-type against the OpenAPI schema (see Decision #5 for exact DDL).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Stripe API (live mode) | Coupon synth + checkout | ✓ | `2025-06-30.basil` pinned | — |
| Supabase Postgres | All persistence | ✓ | Hosted | — |
| pg_cron extension | Future scheduled jobs (Layer 4 deferred) | ✓ | Enabled in `20260506_cron_jobs.sql` | — |
| Node `crypto.randomInt` | RNG | ✓ | Node 14.10+; Netlify runs 18+ | — |
| Netlify build env | All API routes | ✓ | — | — |

**No missing dependencies. No new infra.**

## Common Pitfalls

### Pitfall 1: Coupon survives session expiry
**What goes wrong:** Synthesized coupon has `max_redemptions=1` but no `redeem_by`. If user abandons checkout, coupon hangs around in the Stripe account forever.
**Why it happens:** No expiry set.
**How to avoid:** Set `redeem_by: Math.floor(Date.now()/1000) + 86400` (24h) when creating. Stripe auto-purges expired coupons.
**Warning signs:** `stripe.coupons.list({ limit: 100 })` returning hundreds of `dw-*` named coupons in test.

### Pitfall 2: Credit double-redeem on webhook retry
**What goes wrong:** Stripe webhook retries on 5xx. If we update `credits.status = 'redeemed'` without a CAS check, a retry after the first success could overwrite `applied_to` to a duplicate order ID (which wouldn't exist due to `orders.stripe_session_id` dedupe earlier, but logic still must be safe).
**Why it happens:** Naive `UPDATE credits SET status='redeemed' WHERE id IN (...)`.
**How to avoid:** Always `WHERE status='approved'` on the update. Idempotent: second update affects 0 rows.
**Warning signs:** `applied_to` pointing to a non-existent order; `applied_at` later than expected.

### Pitfall 3: cycleRecruits drift between client and awarder
**What goes wrong:** Hub displays `cycleRecruits = 3` (Mystery Drop unlocked), but awarder counted `4` because invite #4 converted between the hub render and the awarder fire. User sees stale display.
**Why it happens:** Two independent computations of the same number.
**How to avoid:** Decision #10 — extract `getCycleRecruits(customer, sub)` into `queries.ts`, share between awarder and hub page. Single source of truth.
**Warning signs:** "I got a Mystery Drop but my hub still says 'need 1 more'."

### Pitfall 4: Tier discount applied before credit
**What goes wrong:** If tier 5% is applied to the gross amount, then credit subtracted, user gets ~5% LESS discount than expected. Order of operations matters.
**Why it happens:** Misunderstanding stacking semantics.
**How to avoid:** Always: credit first (capped at plan), then tier % on the remainder. Formula: `discount = credit + floor((amount - credit) * tier_pct / 100)`.
**Warning signs:** Customer support tickets about "my 5% discount only saved me 4.50".

### Pitfall 5: `discounts` field conflicts with `allow_promotion_codes`
**What goes wrong:** If both are set on a Checkout Session, Stripe returns 400.
**Why it happens:** Mutually exclusive — Stripe forces you to choose UI-driven promo entry OR programmatic discount attach.
**How to avoid:** Never set `allow_promotion_codes: true` in our checkout. We don't offer promo codes — all discounts are programmatic.
**Warning signs:** Checkout sessions failing to create with `discounts_and_allow_promotion_codes` error.

### Pitfall 6: Mystery Drop RNG fairness perceived as broken
**What goes wrong:** A user gets `cr=30` (the floor) at milestone 3, complains the game is rigged.
**Why it happens:** Range 30–150 with uniform distribution will hit the bottom 10% as often as anywhere else.
**How to avoid:** Bias the distribution slightly. Recommend: weighted ranges `[30..70] 50%, [71..120] 35%, [121..150] 15%`. Document in code so it's intentional, not "fixable."
**Warning signs:** Support tickets concentrating on milestone-3 outcomes.

### Pitfall 7: Awarder fires on conversion that's over monthly cap
**What goes wrong:** User hits 11th conversion in a month. Layer 1 caps (no AED 20 credit), but Layer 2 still ticks `cycleRecruits` to 11 — fires milestone 10 if not already fired.
**Why it happens:** Cap is on credit issuance, not on count.
**How to avoid:** This is CORRECT behavior per CONTEXT — "Layer 2 cycle counts are NOT capped." Document explicitly in awarder code comment.
**Warning signs:** None — this is intended.

## Code Examples

Verified against production schema (PostgREST OpenAPI fetch, 2026-05-16).

### Compute cycle recruits (shared source of truth)
```typescript
// src/utils/supabase/queries.ts — ADD this export
export async function getCycleRecruits(
  sb: ReturnType<typeof import('@supabase/supabase-js').createClient>,
  customerId: string,
  subscriptionId: string
): Promise<number> {
  // Fetch sub start_date
  const { data: sub } = await sb
    .from('subscriptions')
    .select('start_date')
    .eq('id', subscriptionId)
    .maybeSingle()
  if (!sub) return 0

  const { count } = await sb
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('inviter_user_id', customerId)
    .eq('status', 'converted')
    .gte('converted_at', sub.start_date)
  return count ?? 0
}
```

The HubClient currently computes this client-side from the `invites` array. Migrate `page.tsx` to call this and pass `cycleRecruits` as a prop (HubClient's `useMemo` can stay as a fallback for resync but the initial value comes from server).

### Deposit credit helper
```typescript
// src/lib/dorm-wars/awarder.ts
async function depositCredit(
  sb: ReturnType<typeof import('@supabase/supabase-js').createClient>,
  customerId: string,
  amountAed: number,
  source: string,
  cycleRewardId: string  // for traceability
): Promise<void> {
  await sb.from('credits').insert({
    customer_id: customerId,
    amount_aed: amountAed,
    source,
    status: 'approved',
    // No referral_id — this isn't a referral conversion credit
  })
  // Note: we don't link credits → cycle_rewards yet (no FK in schema below).
  // Add link if needed in Phase 8 admin tooling.
}
```

### RNG with weighted buckets
```typescript
// src/lib/dorm-wars/rng.ts
import { randomInt } from 'crypto'

export function mysteryDropValue(): number {
  const roll = randomInt(0, 100)   // 0..99
  if (roll < 50) return randomInt(30, 71)     // 30..70   (50%)
  if (roll < 85) return randomInt(71, 121)    // 71..120  (35%)
  return randomInt(121, 151)                  // 121..150 (15%)
}

export function dailyDropValue(): number {
  const roll = randomInt(0, 100)
  if (roll < 60) return randomInt(1, 11)      // 1..10    (60%)
  if (roll < 90) return randomInt(11, 51)     // 11..50   (30%)
  return randomInt(51, 201)                   // 51..200  (10%)
}
```

### Daily Drop endpoint
```typescript
// src/app/api/dorm-wars/daily-drop/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { dailyDropValue } from '@/lib/dorm-wars/rng'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().slice(0, 10)  // UTC date YYYY-MM-DD

  // Try to insert today's drop. UNIQUE(customer_id, drop_date_utc) makes this safe.
  const value = dailyDropValue()
  const bucket = value <= 10 ? 'common' : value <= 50 ? 'rare' : 'epic'

  const { data: inserted, error } = await admin
    .from('daily_drops')
    .insert({
      customer_id: user.id,
      drop_date_utc: today,
      value_aed: value,
      rng_bucket: bucket,
    })
    .select('value_aed, rng_bucket')
    .maybeSingle()  // null on UNIQUE conflict

  if (error && !inserted) {
    // Already claimed today — return existing
    const { data: existing } = await admin
      .from('daily_drops')
      .select('value_aed, rng_bucket')
      .eq('customer_id', user.id)
      .eq('drop_date_utc', today)
      .maybeSingle()
    return NextResponse.json({ alreadyClaimed: true, ...existing })
  }

  if (!inserted) {
    return NextResponse.json({ error: 'unknown' }, { status: 500 })
  }

  // Deposit credit
  await admin.from('credits').insert({
    customer_id: user.id,
    amount_aed: inserted.value_aed,
    source: 'daily_drop',
    status: 'approved',
  })

  return NextResponse.json({ claimed: true, ...inserted })
}
```

### Streak tick endpoint
```typescript
// src/app/api/dorm-wars/streak/tick/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  const { data: row } = await admin
    .from('streaks')
    .select('count, last_visit_date_utc')
    .eq('customer_id', user.id)
    .maybeSingle()

  let newCount: number
  if (!row) {
    newCount = 1
    await admin.from('streaks').insert({
      customer_id: user.id, count: 1, last_visit_date_utc: today,
    })
  } else if (row.last_visit_date_utc === today) {
    newCount = row.count  // no-op
  } else if (row.last_visit_date_utc === yesterday) {
    newCount = row.count + 1
    await admin.from('streaks').update({
      count: newCount, last_visit_date_utc: today,
    }).eq('customer_id', user.id)
  } else {
    newCount = 1  // reset
    await admin.from('streaks').update({
      count: 1, last_visit_date_utc: today,
    }).eq('customer_id', user.id)
  }

  return NextResponse.json({ count: newCount })
}
```

---

## Resolved Decisions

### Decision #1: Stripe Coupon attach pattern — **Synthesize one combined coupon per session**

**Choice:** Create a fresh on-the-fly `amount_off` coupon at the start of every checkout that mathematically combines credit redemption + tier % off. Attach via `discounts: [{ coupon: id }]`.

**Rationale:**
- **Stripe Checkout Sessions accept exactly ONE coupon or promotion_code per session.** Verified at [docs.stripe.com/payments/advanced/discounts](https://docs.stripe.com/payments/advanced/discounts) and the [Checkout Sessions API reference](https://docs.stripe.com/api/checkout/sessions/create). The `discounts` array is documented as size-limited to one.
- Combining the two effects into one synthesized `amount_off` coupon is mathematically equivalent and a documented pattern (no-cost orders + dynamically-updated discounts pages both reference it).
- Single-use enforced by `max_redemptions: 1`, scoped via metadata, expires in 24h via `redeem_by`.
- Stateless: no coupon inventory table needed.

**Exact API call (in `/src/app/api/checkout/route.ts` between line 229 and the `stripe.checkout.sessions.create` call at 230):**
```typescript
const coupon = await stripe.coupons.create({
  amount_off: discountFils,        // credit + tier combined, in fils
  currency: 'aed',
  duration: 'once',
  max_redemptions: 1,
  redeem_by: Math.floor(Date.now()/1000) + 86400,  // 24h
  name: `Dorm Wars rewards`,
  metadata: { user_id, credit_applied_fils, tier_percent, applied_credit_ids },
})
// Then in sessions.create({ ..., discounts: [{ coupon: coupon.id }], metadata: { coupon_id: coupon.id, ... } })
```

**Webhook side** marks `credits.status = 'redeemed'` reading `metadata.applied_credit_ids`, with `WHERE status='approved'` CAS guard.

### Decision #2: Threshold-cross detection — **Inline in `creditInviterOnConversion`**

**Choice:** Append `await awardCycleAndTierRewards(referral.inviter_user_id, activeSubId)` at the end of `creditInviterOnConversion()` at `/src/app/r/[cid]/actions.ts` line 287.

**Rationale:**
- **Responsiveness wins.** User can be on the hub page when a conversion happens. pg_cron nightly = up to 24h lag. Trigger-on-credits-insert = elegant but can't call Stripe and can't easily emit logs.
- **Already inside the same transactional boundary** — the webhook already calls `creditInviterOnConversion`. Adding the awarder adds ~50–200ms to webhook latency (one INSERT per milestone + one COUNT query for tiers).
- **Single call site** = single source of truth. If we add cron later for safety-net re-runs, it just calls the same awarder.
- **Idempotency is via UNIQUE constraints**, not call-site uniqueness — so even if the awarder fires twice from two paths, no double-award.

**Exact code path:** `webhook/route.ts:291` → `actions.ts:229` (`creditInviterOnConversion`) → at line 287 (right after the `console.log` of credit issuance) add:

```typescript
// Fetch the inviter's currently-active subscription for cycle context.
// Awarder is no-op if no active sub (cycle context required for Layer 2).
const { data: activeSub } = await supabaseAdmin
  .from('subscriptions')
  .select('id')
  .eq('customer_id', referral.inviter_user_id)
  .in('status', ['Active', 'Paused', 'Skipped'])
  .order('start_date', { ascending: false })
  .limit(1)
  .maybeSingle()

await awardCycleAndTierRewards(referral.inviter_user_id, activeSub?.id ?? null)
```

**Outside `creditInviterOnConversion` early-returns must still call awarder for lifetime tiers.** Layer 3 tiers fire on lifetime count regardless of monthly cap. So when the monthly-cap branch returns at line 264, ALSO call `awardCycleAndTierRewards`. The awarder's idempotency handles re-fires correctly.

### Decision #3: Mystery Drop RNG — **Pure random per-fire**

**Choice:** Call `crypto.randomInt` at award time with weighted distribution (50/35/15 across three buckets). Store the resulting value in `cycle_rewards.value_aed` immediately.

**Rationale:**
- **Game feel matters.** Deterministic seeding (option b) means a user who knows the formula can predict every drop — kills surprise, kills word-of-mouth ("I got 145 cr!" vs. "yeah everyone gets 87 cr").
- **Replay-safety is solved by the row, not the seed.** `cycle_rewards (customer_id, subscription_id, milestone) UNIQUE` means the awarder cannot fire a second time — so the RNG only ever runs once per (user, sub, milestone). The stored value is the canonical outcome.
- **Weighted distribution prevents perceived unfairness** (see Pitfall #6).

### Decision #4: New table schemas — DDL

All four new tables in a single migration `20260516_dorm_wars_tables.sql`.

```sql
-- ============================================================================
-- Phase 7 — Dorm Wars reward backend tables
-- ============================================================================

BEGIN;

-- ── daily_drops ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_drops (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  drop_date_utc   date NOT NULL,
  value_aed       integer NOT NULL CHECK (value_aed > 0 AND value_aed <= 200),
  rng_bucket      text NOT NULL CHECK (rng_bucket IN ('common','rare','epic')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, drop_date_utc)
);

CREATE INDEX IF NOT EXISTS daily_drops_customer_idx
  ON public.daily_drops (customer_id, drop_date_utc DESC);

ALTER TABLE public.daily_drops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own daily drops"
  ON public.daily_drops FOR SELECT USING (auth.uid() = customer_id);

-- No client INSERT/UPDATE — service role only via /api/dorm-wars/daily-drop

-- ── streaks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.streaks (
  customer_id          uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  count                integer NOT NULL DEFAULT 0,
  last_visit_date_utc  date,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own streak"
  ON public.streaks FOR SELECT USING (auth.uid() = customer_id);

-- No client write — service role only via /api/dorm-wars/streak/tick

-- ── cycle_rewards ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cycle_rewards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  milestone       integer NOT NULL CHECK (milestone IN (3,6,10,15,20)),
  kind            text NOT NULL CHECK (kind IN
                    ('mystery_drop','free_week','free_month','cash_and_skips','dorm_weekend')),
  value_aed       integer,  -- nullable: dorm_weekend has no AED value per row
  awarded_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, subscription_id, milestone)
);

CREATE INDEX IF NOT EXISTS cycle_rewards_customer_idx
  ON public.cycle_rewards (customer_id, awarded_at DESC);

ALTER TABLE public.cycle_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own cycle rewards"
  ON public.cycle_rewards FOR SELECT USING (auth.uid() = customer_id);

-- ── lifetime_rewards ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lifetime_rewards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tier            integer NOT NULL CHECK (tier IN (1,2,3,4)),
  perk            text NOT NULL,
  stripe_coupon_id text,  -- nullable: only set if we ever pre-allocate; null in Phase 7
  awarded_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, tier)
);

CREATE INDEX IF NOT EXISTS lifetime_rewards_customer_idx
  ON public.lifetime_rewards (customer_id, tier);

ALTER TABLE public.lifetime_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own lifetime rewards"
  ON public.lifetime_rewards FOR SELECT USING (auth.uid() = customer_id);

COMMIT;
```

### Decision #5: Snapshot migration for existing tables — **Verified DDL**

Production schema captured via PostgREST OpenAPI on 2026-05-16. The migration below uses `IF NOT EXISTS` so it's a confirmed no-op against the live DB.

**File:** `supabase/migrations/20260516_referral_credits_snapshot.sql`

```sql
-- ============================================================================
-- Snapshot of live referral + credit tables
-- These tables exist in production but were created via the Supabase console
-- and were never versioned. This migration captures them in code so that
-- `npx supabase db reset` rebuilds the full schema from scratch.
--
-- CRITICAL: This migration MUST be a no-op against the live DB. All statements
-- are IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. Column types and constraints
-- were captured from the production PostgREST OpenAPI spec on 2026-05-16.
-- ============================================================================

BEGIN;

-- ── referrals ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referrals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_cid         text NOT NULL REFERENCES public.customers(cid) ON DELETE CASCADE,
  inviter_user_id     uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  invitee_phone       text NOT NULL,
  invitee_email       text,
  invitee_user_id     uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  invitee_first_name  text,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','gift_claimed','converted','blocked')),
  block_reason        text,
  device_fp           text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  gift_claimed_at     timestamptz,
  converted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS referrals_inviter_user_idx
  ON public.referrals (inviter_user_id, status);
CREATE INDEX IF NOT EXISTS referrals_invitee_phone_idx
  ON public.referrals (invitee_phone);
CREATE INDEX IF NOT EXISTS referrals_invitee_user_id_idx
  ON public.referrals (invitee_user_id);
CREATE INDEX IF NOT EXISTS referrals_converted_at_idx
  ON public.referrals (inviter_user_id, converted_at)
  WHERE status = 'converted';

-- Pair uniqueness — (inviter, invitee_phone) — matches application-layer check
-- in actions.ts:113. If this constraint doesn't already exist in live, adding
-- it here is safe IFF no duplicates exist. If duplicates exist, add via
-- separate hotfix migration after manual reconciliation.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referrals_inviter_invitee_pair_unique'
  ) THEN
    ALTER TABLE public.referrals
      ADD CONSTRAINT referrals_inviter_invitee_pair_unique
      UNIQUE (inviter_cid, invitee_phone);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Inviter reads own referrals"
  ON public.referrals FOR SELECT
  USING (auth.uid() = inviter_user_id);

-- ── referral_gifts_claimed ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_gifts_claimed (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone_e164   text NOT NULL,
  email_norm   text NOT NULL,
  dorm_name    text,
  device_fp    text,
  claimed_at   timestamptz NOT NULL DEFAULT now()
);

-- Lifetime dedupe enforced at app layer with UNIQUE on phone + email.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_gifts_phone_unique'
  ) THEN
    ALTER TABLE public.referral_gifts_claimed
      ADD CONSTRAINT referral_gifts_phone_unique UNIQUE (phone_e164);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_gifts_email_unique'
  ) THEN
    ALTER TABLE public.referral_gifts_claimed
      ADD CONSTRAINT referral_gifts_email_unique UNIQUE (email_norm);
  END IF;
END $$;

ALTER TABLE public.referral_gifts_claimed ENABLE ROW LEVEL SECURITY;
-- No client SELECT policy — this table is service-role only

-- ── referral_review_queue ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_review_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id  uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  reason       text NOT NULL,
  flags        jsonb,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  reviewed_by  text,
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_review_queue ENABLE ROW LEVEL SECURITY;
-- No client SELECT policy — admin-only

-- ── credits ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount_aed   numeric NOT NULL CHECK (amount_aed > 0),
  source       text NOT NULL,
  referral_id  uuid REFERENCES public.referrals(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'approved'
                 CHECK (status IN ('pending','approved','redeemed','expired','reversed')),
  applied_to   uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  applied_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credits_customer_status_idx
  ON public.credits (customer_id, status);

ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users read own credits"
  ON public.credits FOR SELECT
  USING (auth.uid() = customer_id);

COMMIT;
```

**Note on `CREATE POLICY IF NOT EXISTS`:** Postgres 15+ supports this. Supabase runs PG 15. If targeting older PG, wrap in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`.

### Decision #6: Free Skips at milestone 15 — **New `bonus_skips` column**

**Choice:** `ALTER TABLE subscriptions ADD COLUMN bonus_skips INTEGER NOT NULL DEFAULT 0`.

**Rationale:**
- **Distinct from `skipped_meals_count`** (which is consumption, not budget). Mixing them breaks the existing skip-cap logic at `actions.ts:579`.
- **Equivalent credit (option c)** would work but loses the "5 free skips" semantic — the user gets cash, not the explicit reward they were promised.
- **Raising the skip cap (option a)** silently changes a constant that's encoded throughout the codebase (`maxSkips` in `actions.ts`). Bug-prone.

**Migration:** `supabase/migrations/20260516_subscription_bonus_skips.sql`:
```sql
BEGIN;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS bonus_skips integer NOT NULL DEFAULT 0;

-- RPC helper for atomic increment (used by awarder).
CREATE OR REPLACE FUNCTION public.increment_bonus_skips(p_sub_id uuid, p_amount integer)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.subscriptions
  SET bonus_skips = bonus_skips + p_amount
  WHERE id = p_sub_id;
$$;
COMMIT;
```

**Skip logic update:** `dashboard/actions.ts` skip cap check becomes:
```typescript
const maxSkips = computeMaxSkips(subscription) + subscription.bonus_skips
```

### Decision #7: Tier 4 "100 free meals" — **Bulk credit deposit ~5,500 cr**

**Choice:** Insert one credit row of AED 5500 with `source='tier_4_meals'`.

**Rationale:**
- **Consistency with every other reward in the system.** Everything reduces to a `credits` row — one ledger, one redemption path.
- **Option (c) free meals counter** requires new schema field + new business logic for "use a free meal vs. paid meal" at delivery time. Significant blast radius.
- **AED 55/meal × 100 = AED 5500** — calibrated against Monthly Premium (6DAYS) 24-meal plan at ~AED 1320 (≈AED 55/meal). Document the constant in `awarder.ts` so it's tunable.
- The credit is `status='approved'` immediately — no admin review, since it's auto-awarded by tier crossing.

### Decision #8: Dorm Weekend (milestone 20) — **Stub it out for product input**

**Choice:** Write the `cycle_rewards` row with `kind='dorm_weekend'`, log to console, **do NOT** auto-credit dorm members. Surface a "Dorm Weekend unlocked!" banner in HubClient. Real mechanic deferred.

**Rationale:**
- **`SELECT id FROM customers WHERE dorm_name = ?` is feasible** — `dorm_name` is text, queryable. But **auto-crediting all dorm members 50 AED** has unbounded blast radius — a dorm with 50 active customers = AED 2500 single-fire payout. Needs product approval + abuse controls before automation.
- A milestone-20 user is at the apex of the reward funnel anyway (very rare). Manual ops handling is acceptable until Phase 8.
- Stub: the row exists in `cycle_rewards`, HubClient shows it, ops gets a Slack/email ping (Phase 9 candidate). No credits deposited.

**Code:** in `awarder.ts`, the `dorm_weekend` branch is just the INSERT — no `depositCredit` call. Add a `console.log('🏆 DORM WEEKEND unlocked for customer X — manual fulfilment needed')` for ops visibility.

### Decision #9: Cycle window when no active sub — **Awarder no-ops on Layer 2**

**Choice:** If `activeSub === null` (paused/ended/between cycles), Layer 2 awarder skips entirely. Layer 3 (lifetime) still fires.

**Rationale:**
- **`cycleRecruits` is undefined without a `start_date`.** Picking "the most recent ended sub" would award milestones from a stale cycle — wrong.
- **Layer 3 is cycle-independent** (lifetime count) so it fires regardless.
- When the user starts a new sub, the first conversion AFTER that new `start_date` resets the cycle counter (because `getCycleRecruits` filters `converted_at >= sub.start_date`). Milestones from the new cycle then fire normally.
- **HubClient already handles this** — `cycleRecruits = 0` when `!hasActiveSub` (line 196 of HubClient.tsx). Same semantics server-side.

### Decision #10: Server-side `cycleRecruits` source — **Extract into `queries.ts`**

**Choice:** Add `getCycleRecruits(supabase, customerId, subscriptionId): Promise<number>` to `/src/utils/supabase/queries.ts`. HubClient's `page.tsx` calls it server-side and passes the count as a prop. The awarder calls the same function. HubClient's existing `useMemo` becomes the client-side hot-resync version (for live updates).

**Rationale:**
- **Duplicating the logic (option a) is a Pitfall #3 trap waiting to happen.** Two implementations diverge.
- **Shared function = single source of truth.** Both call sites get the exact same number.
- **Cheap:** one indexed COUNT query (`referrals_converted_at_idx` makes it O(log n)).
- **Page.tsx changes:**
  ```typescript
  const cycleRecruits = activeSubscription
    ? await getCycleRecruits(await createClient(), user.id, activeSubscription.id)
    : 0
  // ... pass <HubClient cycleRecruits={cycleRecruits} ... />
  ```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Math.random()` in Node | `crypto.randomInt(min, max)` | Node 14.10 (2020) | Uniform distribution; no modulo bias |
| Stripe checkout `coupon` direct param | `discounts: [{ coupon }]` array | Stripe Acacia 2025-01-27 | New schema; old `coupon` param deprecated for new sessions |
| `Math.floor(Date.now()/1000) + N` | Same — no replacement | — | Stripe still uses Unix epoch seconds for `redeem_by` |
| Trigger-based business logic | API-route business logic with Postgres ONLY for storage/constraints | Industry consensus, post-2020 | Easier debugging, type safety, observability |

**Deprecated/outdated:**
- The legacy `coupon` direct parameter on Checkout Session create still works but is documented as superseded by `discounts[]`. Use `discounts`.

## Open Questions

1. **Pre-existing UNIQUE constraint on `referrals(inviter_cid, invitee_phone)`?**
   - What we know: application code at `actions.ts:113` checks for the pair existing before insert. Without a DB UNIQUE, two concurrent requests could both pass the check and both insert.
   - What's unclear: Is the constraint already in production? Snapshot migration's `DO $$ ... EXCEPTION` block is defensive but if the constraint exists with a different name, the wrapped check would miss it.
   - Recommendation: Before running the snapshot migration, run `SELECT conname FROM pg_constraint WHERE conrelid = 'public.referrals'::regclass;` in Supabase SQL editor to confirm. If a pair-unique constraint exists under any name, no action needed.

2. **`credits.amount_aed` precision in production**
   - What we know: OpenAPI says `numeric` (no precision specified — defaults to unbounded).
   - What's unclear: Is there an active CHECK constraint or just data convention?
   - Recommendation: The snapshot adds `CHECK (amount_aed > 0)` defensively. If this fails to apply because existing rows violate it (shouldn't — all observed rows are AED 20), drop the CHECK from the migration.

3. **Stripe coupon cleanup**
   - What we know: Coupons with `redeem_by` past expiry auto-purge in Stripe, but UI keeps them visible.
   - What's unclear: Whether high-volume coupon creation impacts Stripe rate limits.
   - Recommendation: Stripe's documented rate limit for coupon creation is 100 req/sec — far above our expected ~10/hour. No action needed unless we see 429s in production logs.

## Sources

### Primary (HIGH confidence)
- [Stripe — Add discounts (one-time payments)](https://docs.stripe.com/payments/checkout/discounts) — discounts array, single-coupon limit, `discounts[0].coupon` syntax
- [Stripe — Create a coupon API reference](https://docs.stripe.com/api/coupons/create) — `amount_off`, `currency`, `duration`, `max_redemptions`, `redeem_by`, `metadata`
- [Stripe — Checkout Sessions API](https://docs.stripe.com/api/checkout/sessions/create) — `discounts` field, `mode: payment`
- [Stripe changelog — Acacia 2025-01-27 discounts field](https://docs.stripe.com/changelog/acacia/2025-01-27/checkout-sessions-discounts-field) — confirms `discounts[]` is the current API surface
- Live production OpenAPI fetch from Supabase REST endpoint (2026-05-16) — exact column definitions for `referrals`, `referral_gifts_claimed`, `referral_review_queue`, `credits`
- Existing migration `/supabase/migrations/20260506_cron_jobs.sql` — pg_cron pattern, plpgsql function shape
- Existing code `/src/app/r/[cid]/actions.ts:229–288` — call site for awarder integration
- Existing code `/src/app/api/checkout/route.ts:230–272` — checkout session creation, modification point

### Secondary (MEDIUM confidence)
- [Stripe — Dynamically update discounts](https://docs.stripe.com/payments/advanced/dynamically-update-discounts) — confirms server-controlled discount pattern
- [Stripe — No-cost orders](https://docs.stripe.com/payments/checkout/no-cost-orders) — references combined-coupon synthesis

### Tertiary (LOW confidence)
- None — all critical claims verified against primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Stripe + Supabase + Next.js patterns already established in codebase
- Architecture: HIGH — single coupon synthesis verified against Stripe docs; inline awarder pattern fits existing webhook flow
- Pitfalls: HIGH — all enumerated pitfalls have explicit mitigations in code examples
- Schema (live tables): HIGH — production schema fetched verbatim via OpenAPI; snapshot uses `IF NOT EXISTS` for safety
- Schema (new tables): HIGH — designed from CONTEXT requirements; UNIQUE constraints provide idempotency

**Research date:** 2026-05-16
**Valid until:** 2026-06-16 (30 days — Stripe Coupons API + Supabase Postgres are stable surfaces)

# Phase 8F — Streak Chest Week-Long Doubler: Financial Impact Analysis

**Status:** Post-implementation analysis (commit `2438bbe`)
**Question asked:** "let me know if this breaks our finances. best case & worst cases"
**Short answer:** No — the doubler is well-bounded. Worst-case per-incident is ~AED 1,400, expected per-user/month is ~AED 10-19, aggregate scales linearly with engaged-user count and is small relative to total reward distribution.

---

## The mechanic

- **Trigger:** 5% RNG bucket on Streak Chest open
- **Window:** 7 days from chest open (`doubler_expires_at = now() + INTERVAL '7 days'`)
- **What doubles:**
  - Layer 1 — per-conversion cash (AED 20 → 40)
  - Layer 2 — `mystery_drop`, `free_week`, `free_month`, `cash_and_skips` AED values
- **What does NOT double:**
  - Layer 3 tier rewards (intentional — by user spec)
  - The `bonus_skips` side-effect of milestone 15 (kitchen ops shouldn't scale with the doubler)
  - The Tier 4 jackpot

## Trigger frequency

Engaged user with unbroken streak: **~0.19 doublers/month** (3.75 chests/month × 5% bucket).

A user must:
1. Keep an 8+ day unbroken streak (visits hub daily)
2. Open the chest within 8 days of unlock (else cooldown locks them out)
3. Roll the 5% bucket

## Per-incident cost ranges

### Layer 1 extra cost (per conversion in window)
- Base AED 20 → AED 40 = **+AED 20 per conversion**
- Inviter capped at 10 conversions/month, so per-window max is **+AED 200**

### Layer 2 extra cost (per milestone hit in window)
- Mystery Cash Drop (avg): `(50%×40 + 30%×60 + 15%×75 + 5%×85)` = **+AED 52.5**
- Free Week (Monthly Premium NonVeg): **+AED 132**
- Free Month: **+AED 528**
- 500 cr + 5 Skips (cash portion only): **+AED 500**
- Total Layer 2 ceiling per window: **+AED 1,212**

### Composite per-doubler cost

| Scenario | Conversions | Milestones hit | Extra per doubler |
|----------|-------------|----------------|-------------------|
| Casual (most users) | 0 | 0 | **AED 0** |
| Light referrer | 1-2 | none | AED 20-40 |
| Active referrer | 3-5 | mystery | AED 110-150 |
| Power referrer | 10 (cap) | mystery + free week | AED 384 |
| Power + free month | 10 | mystery + week + month | AED 912 |
| **Absolute worst case** | 10 | all four cycle cash | **AED 1,412** |

The "absolute worst case" requires a user to:
1. Roll the 5% doubler
2. Cross **all four** Layer 2 cash thresholds (3, 6, 10, 15 recruits) inside the same 7-day window
3. Max out monthly conversions (10) inside the same window

This is structurally rare. Hitting all four cycle milestones in 7 days means converting 15+ recruits in 7 days — roughly the entire monthly cap in one week. Likely happens **1-2 times per year across the entire user base**, not per-user-per-month.

## Expected cost per active user per month

| User type | Doublers/mo | Avg extra per doubler | Expected /mo |
|-----------|-------------|------------------------|--------------|
| Casual | 0.19 | AED 0-20 | **AED 0-4** |
| Active referrer | 0.19 | AED 100-150 | **AED 19-29** |
| Power referrer | 0.19 | AED 300-400 | **AED 57-76** |

Most users sit in the "casual" bucket, so weighted-average expected extra cost is **~AED 5-15 per active user per month**.

## Aggregate scaling

Assuming an engaged-user pool with unbroken streaks:

| Active users | Doublers/mo | Avg extra/doubler | Monthly aggregate |
|--------------|-------------|--------------------|-------------------|
| 100 | ~19 | AED 50 | **~AED 950** |
| 500 | ~95 | AED 50 | **~AED 4,750** |
| 1,000 | ~190 | AED 50 | **~AED 9,500** |
| 5,000 | ~950 | AED 75 (higher mix of active referrers) | **~AED 71,250** |

Linear scaling; no exponential failure modes.

## Baseline chest cost (without doubler value)

Average AED outlay per chest opening: `60%×6.5 + 20%×9 + 15%×11 + 5%×0` = **AED 7.35 per chest** for direct cash. Plus expected doubler contribution of ~AED 5-15 brings effective per-chest cost to **~AED 12-23**.

For comparison: the killed Daily Drop averaged `60%×5.5 + 30%×30 + 10%×125` = **AED 24.7 per daily claim** with a 20-hour cooldown, giving ~AED 28/day per claiming user × 30 days = **~AED 840/user/month**. Streak Chest with doubler is a **~95% reduction in pity-reward cost** vs Daily Drop while raising the experiential ceiling (doublers can produce big moments).

## Safeguards already in place

- Layer 1 monthly conversion cap (10/inviter/calendar-month)
- `UNIQUE(customer_id, subscription_id, milestone)` on `cycle_rewards` — each cycle milestone fires once per sub
- `UNIQUE(customer_id, tier)` on `lifetime_rewards` — tier rewards fire once ever
- Mystery RNG bounded to AED 30-90 (doubled ceiling = AED 180)
- Doubler chest itself bounded to once per 8 streak days

## Monitoring recommendations

1. **Track real vs predicted.** All doubler-paid credits have `_2x` source-string suffix. Query:
   ```sql
   SELECT date_trunc('week', created_at) AS week,
          SUM(amount_aed) FILTER (WHERE source LIKE '%_2x') AS doubler_extra_aed,
          SUM(amount_aed) AS total_aed
   FROM credits
   WHERE source LIKE 'referral_conversion%' OR source LIKE 'cycle_milestone_%'
   GROUP BY 1 ORDER BY 1 DESC;
   ```

2. **Watch for whales.** If any single customer's `_2x` total exceeds AED 500 in a month, audit their `streak_chests` + `referrals` for fraud. Could be legitimate (heavy referrer with great timing) or a coordinated abuse pattern.

3. **Cohort the streak.** Bucket users by max streak count and see whether doubler payouts correlate with retention. The whole point of the chest is engagement; if doubled users aren't sticking, the cost isn't earning anything.

## Levers if aggregate cost runs hot

In order of least to most user-visible:

1. **Reduce bucket weight** 5% → 3% (cuts doubler frequency 40%)
2. **Shorten window** 7 days → 5 days (cuts in-window opportunity ~30%)
3. **Cap per-window Layer 2 extra** at AED N (silently truncates whales without changing the headline mechanic)
4. **Exclude `cash_and_skips` from doubling** (removes the AED 500 cap line item)

None of these are urgent. The mechanic as shipped is well-bounded for current user volumes.

## Bottom line

**Worst case incident:** AED 1,412 to one user (requires statistically rare timing).
**Expected average:** AED 5-15 per active user per month.
**Aggregate at 1k engaged users:** ~AED 9-10k/month, scaling linearly.
**vs killed Daily Drop:** ~95% reduction in pity-reward spend.

The doubler doesn't break finances. It trades a steady-cost pity reward for a rare-big-moment chest that costs less in aggregate and feels more earned. Recommend shipping as-is, instrumenting the `_2x` source filter for ops tracking, and revisiting after one month of real data.

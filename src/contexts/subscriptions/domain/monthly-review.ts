/**
 * Monthly-review types and constants — client-safe.
 *
 * Server-side queries live in `src/utils/supabase/monthly-review-queries.ts`
 * (parallel to the weekly-review split) so this file can be safely imported
 * from client components without pulling `next/headers` into the bundle.
 */

export type MonthlyReviewBadge = 'active' | 'late' | 'none'

/**
 * Plan-tier classification used to drive plan-agnostic wrap copy + the
 * tier-specific pre-end eligibility window. Mirrors the renew-banner's
 * three tiers in src/app/dashboard/ActiveDashboard.tsx so the wrap opens
 * on the same schedule as the renew CTA.
 */
export type WrapPlanTier = 'monthly' | 'weekly' | 'trial'

/**
 * Vocabulary for the wrap surfaces + form copy. Keeps "wrap" as the
 * universal noun (user-confirmed) and varies the qualifier/period word
 * by plan tier so a weekly customer doesn't see "monthly" everywhere.
 */
export interface WrapVocab {
    /** Used in "{qualifier} wrap" eyebrows + nav labels. */
    qualifier: 'monthly' | 'weekly' | 'meal'
    /** Body-copy period noun: "your {period}, wrapped". */
    period: 'month' | 'week' | 'meal'
    /** Possessive form for "wrap your {period}" — same as period for now. */
    periodPossessive: 'month' | 'week' | 'meal'
}

export function wrapVocabFor(tier: WrapPlanTier): WrapVocab {
    switch (tier) {
        case 'monthly': return { qualifier: 'monthly', period: 'month', periodPossessive: 'month' }
        case 'weekly':  return { qualifier: 'weekly',  period: 'week',  periodPossessive: 'week'  }
        case 'trial':   return { qualifier: 'meal',    period: 'meal',  periodPossessive: 'meal'  }
    }
}

/**
 * Derive the wrap tier from a sub's plan_name. Defaults to 'monthly' for
 * unknown strings so we never crash on a new plan name — the worst case is
 * mildly off copy, not a missing wrap surface.
 */
export function planTierFrom(planName: string | null | undefined): WrapPlanTier {
    if (!planName) return 'monthly'
    if (planName.includes('One-Time') || planName.includes('Trial')) return 'trial'
    if (planName.includes('Weekly')) return 'weekly'
    return 'monthly'
}

/**
 * Days BEFORE a cycle's end_date when the wrap becomes eligible. Mirrors
 * the dashboard's renew banner for monthly/weekly so the wrap and renew
 * CTAs appear together as one "you're closing this cycle" moment.
 *   Monthly → 4 days lead-in (matches Monthly Premium/Max renew window)
 *   Weekly  → 2 days lead-in
 *   Trial   → 0 (post-end only — see below)
 *
 * Trial is special: end_date === start_date === delivery day (a trial is
 * one meal, see end-date.ts). A non-zero pre-end window would prompt the
 * customer to "wrap" a meal they haven't tasted yet. The wrap query
 * additionally requires `delivered_meals >= 1` for trials, so even on
 * delivery-day morning the wrap stays hidden until the meal is actually
 * marked delivered.
 */
export const PRE_END_WRAP_WINDOW: Record<WrapPlanTier, number> = {
    monthly: 4,
    weekly:  2,
    trial:   0,
}

/**
 * Plan-aware cycle label for the wrap surfaces + form.
 *
 * IMPORTANT: this returns a BARE noun phrase — no leading "your" or "the".
 * Templates that want a determiner ("Wrap your X", "Close out your X", "Your X
 * ends tonight") prepend it themselves. Returning "your trial" baked-in
 * caused a "your your trial" duplication bug — fixed by keeping the label
 * bare and standardising every template on the "your {cycleLabel}" pattern.
 *
 *   Monthly → "April cycle"           ("Wrap your April cycle"     ✓)
 *   Weekly  → "week of Apr 14"        ("Wrap your week of Apr 14"  ✓)
 *   Trial   → "trial"                  ("Wrap your trial"           ✓)
 *
 * Eyebrow-style usages (no determiner) take the label as-is — "monthly
 * wrap · April cycle", "meal wrap · trial" both read fine.
 */
export function cycleLabelFor(tier: WrapPlanTier, startDate: string | null): string | null {
    if (!startDate) return null
    const d = new Date(startDate.slice(0, 10) + 'T00:00:00Z')
    if (isNaN(d.getTime())) return null
    switch (tier) {
        case 'monthly':
            return d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) + ' cycle'
        case 'weekly':
            return 'week of ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
        case 'trial':
            return 'trial'
    }
}

export type RenewalIntent = 'definitely' | 'probably' | 'probably_not' | 'no'
export type RecommendAnswer = 'yes_specific' | 'yes_general' | 'maybe' | 'no'
export type AlternativeCostAed = 'under-15' | '15-25' | '25-40' | '40-plus'

export interface MonthlyReviewPayload {
    signupTriggers: string[]
    signupTriggersOther: string
    jobs: string[]
    jobsOther: string
    bestMoment: string
    frictionMoment: string
    alternative: string
    alternativeOther: string
    alternativeCostAed: AlternativeCostAed
    renewalIntent: RenewalIntent
    renewalReason: string
    recommend: RecommendAnswer
    recommendText: string
}

export type MonthlyReviewSubmitResult =
    | { ok: true; rewardPct: 50 | 100; revealStats: MonthlyRevealStats }
    | { ok: false; error: string }

export interface MonthlyRevealStats {
    /** Plan name, e.g. "Monthly Premium". */
    planName: string
    /** Cycle label, e.g. "April cycle" — month name of the cycle start. */
    cycleLabel: string
    /** Meals actually delivered this cycle. */
    mealsDelivered: number
    /** Total meals scheduled for the plan. */
    mealsTotal: number
    /** User's most-favorited dish across the cycle's weekly reviews. */
    favoriteDish: { name: string; image?: string } | null
    /** Week with the highest WSS rating (1-based week number). */
    topWeek: number | null
    /** Anonymized % of Dormers who also favorited the user's top dish this cycle. */
    favoriteSocialProofPct: number | null
    /** Total AED earned this cycle (sum of weekly + monthly review rewards). */
    aedEarnedThisCycle: number
    /** Count of weekly reviews submitted (max = total weeks in cycle). */
    weeklyReviewsSubmitted: number
    /** Total weekly reviews available this cycle. */
    weeklyReviewsTotal: number
}

export interface MonthlyReviewWindow {
    /** True when the cycle has ended and the survey window is open. */
    eligible: boolean
    /** True when already submitted (don't re-show takeover trigger). */
    submitted: boolean
    /** Days remaining in the 7-day full-reward window. Negative if past. */
    daysLeftForFullReward: number
    /**
     * Days since the cycle ended. Negative when the cycle hasn't ended yet
     * (wrap is eligible pre-end, within PRE_END_WRAP_WINDOW[planTier]) —
     * surfaces use the sign to switch chip copy between "Nd to end" and
     * "Nd left for full reward" / "Nd late".
     */
    daysSinceCycleEnd: number
    /** True when past the 30-day expiry. */
    expired: boolean
    /**
     * Narrow "evening of the last delivery day" window — after the meal is
     * delivered (>= MONTHLY_PRE_CRON_HOUR_AE wall clock) and before the
     * end-of-night cron flips the sub off Active. Drives the forcing overlay
     * on the Now-tray architecture; outside this window the tray card +
     * dashboard strip / empty banner take over with graceful degradation.
     * False when already submitted.
     */
    preCron: boolean
    /**
     * Plan-aware cycle label — "April cycle" for monthly, "the week of Apr 14"
     * for weekly, "your trial" for trial. Null when no eligible cycle exists.
     */
    cycleLabel: string | null
    /**
     * Plan tier of the cycle being wrapped. Drives the vocab helper
     * (qualifier/period words used in surface + form copy) and the
     * tier-specific pre-end eligibility window.
     */
    planTier: WrapPlanTier
}

// ── Business constants ──────────────────────────────────────────────────────

/** AED earned for a completed monthly review at 100% reward (on-time). */
export const MONTHLY_REWARD_AED = 5
/** AED earned for a completed monthly review at 50% reward (late). */
export const MONTHLY_LATE_REWARD_AED = 2
/** Days after cycle end during which monthly submission still earns 100%. */
export const MONTHLY_FULL_REWARD_WINDOW_DAYS = 7
/** Days after cycle end past which monthly review can no longer be submitted. */
export const MONTHLY_LATE_CAP_DAYS = 30
/**
 * Wall-clock hour (Asia/Dubai) after which we consider the customer to be in
 * the pre-cron window on their last delivery day. 7 PM = AE 19:00 — the slot
 * when meals are delivered (7–8 PM window). Before this hour the cycle's
 * last meal hasn't arrived yet, so prompting for a wrap is premature.
 */
export const MONTHLY_PRE_CRON_HOUR_AE = 19

/**
 * AED earned for the monthly wrap given its reward_pct. Mirrors the weekly
 * helper — late is a fixed AED 2, not 50% of 5.
 */
export function monthlyReviewAed(rewardPct: 50 | 100): number {
    return rewardPct === 100 ? MONTHLY_REWARD_AED : MONTHLY_LATE_REWARD_AED
}

/** Derive the Now-tray badge value for the monthly wrap from the window state. */
export function monthlyBadgeFromWindow(w: MonthlyReviewWindow): MonthlyReviewBadge {
    if (!w.eligible) return 'none'
    return w.daysLeftForFullReward > 0 ? 'active' : 'late'
}

// ── Q1 / Q2 chip option sets — used by both the form and the validators ────

export const SIGNUP_TRIGGER_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
    { id: 'new-semester', label: 'New semester' },
    { id: 'new-dorm', label: 'Just moved in' },
    { id: 'friend-recommended', label: 'A friend recommended Dormers' },
    { id: 'too-busy', label: 'Got too busy to cook' },
    { id: 'eat-better', label: 'Wanted to eat better' },
    { id: 'curious', label: 'Just curious — wanted to try' },
]

export const JOB_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
    { id: 'save-time', label: 'Save me time' },
    { id: 'eat-proper', label: 'Make sure I eat something proper' },
    { id: 'avoid-junk', label: 'Stop me from ordering junk' },
    { id: 'eat-healthier', label: 'Eat healthier without thinking about it' },
    { id: 'variety', label: 'Variety without cooking' },
    { id: 'feel-cared-for', label: 'Feel cared for' },
    { id: 'look-adult', label: 'Look like an adult who eats well' },
]

export const ALTERNATIVE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
    { id: 'cooked', label: 'Cooked at home' },
    { id: 'delivery', label: 'Ordered delivery' },
    { id: 'fast-food', label: 'Fast food' },
    { id: 'restaurant', label: 'Restaurant dine-in' },
    { id: 'family-friends', label: 'Family or friends' },
    { id: 'skipped', label: 'Skipped meals' },
]

export const ALTERNATIVE_COST_OPTIONS: ReadonlyArray<{ id: AlternativeCostAed; label: string }> = [
    { id: 'under-15', label: 'Under AED 15' },
    { id: '15-25',    label: 'AED 15 – 25' },
    { id: '25-40',    label: 'AED 25 – 40' },
    { id: '40-plus',  label: 'AED 40+' },
]

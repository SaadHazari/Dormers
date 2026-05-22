/**
 * Monthly-review types and constants — client-safe.
 *
 * Server-side queries live in `src/utils/supabase/monthly-review-queries.ts`
 * (parallel to the weekly-review split) so this file can be safely imported
 * from client components without pulling `next/headers` into the bundle.
 */

export type MonthlyReviewBadge = 'active' | 'late' | 'none'

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
    /** Days since the cycle ended. */
    daysSinceCycleEnd: number
    /** True when past the 30-day expiry. */
    expired: boolean
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
 * AED earned for the monthly wrap given its reward_pct. Mirrors the weekly
 * helper — late is a fixed AED 2, not 50% of 5.
 */
export function monthlyReviewAed(rewardPct: 50 | 100): number {
    return rewardPct === 100 ? MONTHLY_REWARD_AED : MONTHLY_LATE_REWARD_AED
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

/**
 * Weekly-review types, constants, and pure helpers shared between client
 * and server components.
 *
 * The async server-side query (`getWeeklyReviewState`) lives in
 * `src/utils/supabase/weekly-review-queries.ts` so this file can be safely
 * imported from client components without dragging `next/headers` along.
 */

export interface PendingItem { week: number; range: string; daysLeft: number }
export interface LateItem    { week: number; range: string; daysLate: number }
export interface SubmittedItem { week: number; rewardPct: 50 | 100 }

export interface RewardsCycle {
    submitted: number
    total: number
    aedEarned: number
    aedPending: number
    cycle: string
    label: string
}

export interface WeeklyReviewState {
    current: PendingItem | null
    late: LateItem[]
    justSubmitted: SubmittedItem | null
    rewards: RewardsCycle
}

export type WeeklyReviewBadge = 'active' | 'late' | 'none'

// ── Business constants ──────────────────────────────────────────────────────

/** AED earned per submitted weekly review at 100% reward (on-time). */
export const BASE_REWARD_AED = 5
/** AED earned per submitted weekly review at 50% reward (late, but counts toward threshold). */
export const LATE_REWARD_AED = 2
/** Days after a week ends during which a submission still earns the full reward. */
export const FULL_REWARD_WINDOW_DAYS = 7
/** Days after a week ends past which the review is no longer submittable. */
export const LATE_CAP_DAYS = 30
/** Hours after submission during which the just-submitted success state shows. */
export const JUST_SUBMITTED_WINDOW_HOURS = 24

/**
 * AED earned for a single weekly review given its reward_pct (100 or 50).
 * NOT a linear scaling — late submissions earn a fixed AED 2, not 50% of 5.
 * Use this helper everywhere instead of the per-pct math so the values
 * stay in lockstep across submit actions, cycle aggregations, and UI.
 */
export function weeklyReviewAed(rewardPct: 50 | 100): number {
    return rewardPct === 100 ? BASE_REWARD_AED : LATE_REWARD_AED
}

const DEFAULT_REWARDS: RewardsCycle = {
    submitted: 0,
    total: 0,
    aedEarned: 0,
    aedPending: 0,
    cycle: 'This cycle',
    label: 'Rewards',
}

/** Empty state — no pending review, no recent submission, zeroed rewards. Default for prop initializers. */
export const EMPTY_REVIEW_STATE: WeeklyReviewState = {
    current: null,
    late: [],
    justSubmitted: null,
    rewards: DEFAULT_REWARDS,
}

// ── Pure helpers ────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
    return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Asia/Dubai midnight today, as a date-only Date in UTC.
 *
 * Uses Intl.DateTimeFormat with the IANA zone instead of a manual +4h
 * offset. The manual approach happened to work because Dubai doesn't
 * observe DST, but it would silently break if the business ever expands
 * to a DST-observing market or if someone changes the offset constant.
 * The IANA zone is the only correct source of truth — let the runtime
 * figure out the wall-clock date.
 */
export function aeToday(): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dubai',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date())
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
    // 'en-CA' format = YYYY-MM-DD parts; build a UTC midnight on that date.
    return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`)
}

/** Split a subscription's date range into week buckets (1-indexed). */
export function getSubscriptionWeeks(
    startDate: Date,
    endDate: Date,
): Array<{ number: number; start: Date; end: Date }> {
    const totalDays = Math.max(0, daysBetween(startDate, endDate))
    const totalWeeks = Math.floor(totalDays / 7)
    const weeks: Array<{ number: number; start: Date; end: Date }> = []
    for (let i = 0; i < totalWeeks; i++) {
        const wStart = new Date(startDate.getTime() + i * 7 * 24 * 60 * 60 * 1000)
        const wEnd = new Date(wStart.getTime() + 6 * 24 * 60 * 60 * 1000)
        weeks.push({ number: i + 1, start: wStart, end: wEnd })
    }
    return weeks
}

/**
 * Reward percentage for a week submission attempted on `submittedAt`.
 * 100 if within the 7-day window after week end, 50 otherwise.
 */
export function rewardPctForWeekEnd(weekEndDate: Date, submittedAt: Date = aeToday()): 50 | 100 {
    return daysBetween(weekEndDate, submittedAt) <= FULL_REWARD_WINDOW_DAYS ? 100 : 50
}

/** Derive the sidebar badge value from the full state. */
export function badgeFromReviewState(s: WeeklyReviewState): WeeklyReviewBadge {
    if (s.current) return 'active'
    if (s.late.length > 0) return 'late'
    return 'none'
}

import { cache } from 'react'
import { createClient } from './server'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import {
    BASE_REWARD_AED,
    LATE_REWARD_AED,
    EMPTY_REVIEW_STATE,
    FULL_REWARD_WINDOW_DAYS,
    JUST_SUBMITTED_WINDOW_HOURS,
    LATE_CAP_DAYS,
    aeToday,
    getSubscriptionWeeks,
    weeklyReviewAed,
    type LateItem,
    type PendingItem,
    type RewardsCycle,
    type WeeklyReviewState,
} from '@/contexts/subscriptions/domain/weekly-review'
import { expectedReviewWeeks } from '@/contexts/subscriptions/domain/plans'

/**
 * Server-side query that computes the full weekly-review state for a user.
 * Lives here (not in `lib/weekly-review.ts`) because it imports
 * `next/headers` via the Supabase server client — keeping it separate
 * means the client-facing lib stays import-safe from React components.
 *
 * Flip `USE_DEMO` to bypass the query and return a hardcoded state —
 * useful for previewing UI variants without seeded data.
 */

const USE_DEMO = false
const DEMO_STATE: WeeklyReviewState = EMPTY_REVIEW_STATE

// Single pending, within 7-day window:
// const DEMO_STATE: WeeklyReviewState = {
//     current: { week: 4, range: 'Dec 16 — Dec 22', daysLeft: 5 },
//     late: [],
//     justSubmitted: null,
//     rewards: { submitted: 3, total: 4, aedEarned: 18, aedPending: 6, cycle: 'Dec cycle', label: 'Rewards' },
// }

// Multiple pending + catch-up backlog:
// const DEMO_STATE: WeeklyReviewState = {
//     current: { week: 4, range: 'Dec 16 — Dec 22', daysLeft: 5 },
//     late: [
//         { week: 3, range: 'Dec 9 — Dec 15',  daysLate: 11 },
//         { week: 2, range: 'Dec 2 — Dec 8',   daysLate: 18 },
//         { week: 1, range: 'Nov 25 — Dec 1',  daysLate: 25 },
//     ],
//     justSubmitted: null,
//     rewards: { submitted: 0, total: 4, aedEarned: 0, aedPending: 24, cycle: 'Dec cycle', label: 'Rewards' },
// }

interface WeeklyReviewRow {
    week_number: number
    reward_pct: 50 | 100
    submitted_at: string
}

function parseDateUTC(s: string): Date {
    const datePart = s.length > 10 ? s.slice(0, 10) : s
    return new Date(datePart + 'T00:00:00Z')
}

function formatRange(start: Date, end: Date): string {
    const fmt = (d: Date) =>
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    return `${fmt(start)} — ${fmt(end)}`
}

function cycleLabel(subStartDate: Date): string {
    return subStartDate.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) + ' cycle'
}

async function computeWeeklyReviewState(userId: string): Promise<WeeklyReviewState> {
    const supabase = await createClient()

    const { data: sub } = await supabase
        .from('subscriptions')
        .select('id, start_date, plan_name')
        .eq('customer_id', userId)
        .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED])
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (!sub) return EMPTY_REVIEW_STATE

    const startDate = parseDateUTC(sub.start_date)
    const today = aeToday()

    const weeks = getSubscriptionWeeks(startDate, expectedReviewWeeks(sub.plan_name))
    if (weeks.length === 0) return EMPTY_REVIEW_STATE

    const { data: reviews } = await supabase
        .from('weekly_reviews')
        .select('week_number, reward_pct, submitted_at')
        .eq('customer_id', userId)
        .eq('subscription_id', sub.id)
        .order('submitted_at', { ascending: false })
        .returns<WeeklyReviewRow[]>()

    const reviewsByWeek = new Map<number, WeeklyReviewRow>(
        (reviews ?? []).map((r) => [r.week_number, r]),
    )

    type Bucket = 'pending' | 'late' | 'submitted' | 'upcoming' | 'expired'
    const buckets: Array<{ week: { number: number; start: Date; end: Date }; bucket: Bucket; daysSinceEnd: number }> = []

    for (const week of weeks) {
        const daysSinceEnd = Math.floor((today.getTime() - week.end.getTime()) / (1000 * 60 * 60 * 24))
        if (daysSinceEnd < 1) {
            buckets.push({ week, bucket: 'upcoming', daysSinceEnd })
        } else if (reviewsByWeek.has(week.number)) {
            buckets.push({ week, bucket: 'submitted', daysSinceEnd })
        } else if (daysSinceEnd > LATE_CAP_DAYS) {
            buckets.push({ week, bucket: 'expired', daysSinceEnd })
        } else if (daysSinceEnd <= FULL_REWARD_WINDOW_DAYS) {
            buckets.push({ week, bucket: 'pending', daysSinceEnd })
        } else {
            buckets.push({ week, bucket: 'late', daysSinceEnd })
        }
    }

    const pendings = buckets.filter((b) => b.bucket === 'pending')
        .sort((a, b) => b.week.number - a.week.number)
    const lateBuckets = buckets.filter((b) => b.bucket === 'late')
        .sort((a, b) => b.week.number - a.week.number)

    const current: PendingItem | null = pendings[0]
        ? {
            week: pendings[0].week.number,
            range: formatRange(pendings[0].week.start, pendings[0].week.end),
            daysLeft: Math.max(0, FULL_REWARD_WINDOW_DAYS - pendings[0].daysSinceEnd),
        }
        : null

    const late: LateItem[] = lateBuckets.map((b) => ({
        week: b.week.number,
        range: formatRange(b.week.start, b.week.end),
        daysLate: b.daysSinceEnd,
    }))

    // Completed reviews for this cycle — drives the "Completed" section
    // of the weekly-reviews chooser modal. Newest first so the most
    // recent submission tops the list, matching the way users mentally
    // scan their own progress (latest → earliest).
    const completed = buckets
        .filter((b) => b.bucket === 'submitted')
        .map((b) => {
            const r = reviewsByWeek.get(b.week.number)!
            return {
                week: b.week.number,
                range: formatRange(b.week.start, b.week.end),
                rewardPct: r.reward_pct,
            }
        })
        .sort((a, b) => b.week - a.week)

    const justSubmitted = (() => {
        const recent = (reviews ?? [])[0]
        if (!recent) return null
        const hoursSince = (Date.now() - new Date(recent.submitted_at).getTime()) / (1000 * 60 * 60)
        if (hoursSince > JUST_SUBMITTED_WINDOW_HOURS) return null
        return { week: recent.week_number, rewardPct: recent.reward_pct }
    })()

    // Phase 8K (Model C) — under the all-or-nothing rule, "earned" only
    // exists once the threshold is met. Until then, every submission's
    // AED counts as PENDING. aedEarned populates only when the user has
    // hit `weeks.length` submissions for the cycle.
    const submittedReviewAed = (reviews ?? []).reduce(
        (sum, r) => sum + weeklyReviewAed(r.reward_pct),
        0,
    )
    const allInForCycle = (reviews?.length ?? 0) >= weeks.length && weeks.length > 0
    const aedEarned = allInForCycle ? submittedReviewAed : 0
    // Pending = AED already submitted but not yet locked in (will be 0 once
    // all-in flips), PLUS the AED that's still earnable (open + late slots).
    const pendingFromSubmitted = allInForCycle ? 0 : submittedReviewAed
    const earnableFromOpen     = pendings.length * BASE_REWARD_AED
    const earnableFromLate     = lateBuckets.length * LATE_REWARD_AED
    const aedPending = pendingFromSubmitted + earnableFromOpen + earnableFromLate

    const rewards: RewardsCycle = {
        submitted: reviews?.length ?? 0,
        total: weeks.length,
        aedEarned: Math.round(aedEarned),
        aedPending: Math.round(aedPending),
        cycle: cycleLabel(startDate),
        label: 'Rewards',
    }

    return { current, late, justSubmitted, completed, rewards }
}

export const getWeeklyReviewState = cache(async (userId: string): Promise<WeeklyReviewState> => {
    if (USE_DEMO) return DEMO_STATE
    return computeWeeklyReviewState(userId)
})

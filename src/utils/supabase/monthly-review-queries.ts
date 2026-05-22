import { cache } from 'react'
import { createClient } from './server'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/lib/subscription-status'
import {
    MONTHLY_FULL_REWARD_WINDOW_DAYS,
    MONTHLY_LATE_CAP_DAYS,
    type MonthlyReviewBadge,
    type MonthlyReviewWindow,
    type MonthlyRevealStats,
} from '@/lib/monthly-review'
import { weeklyReviewAed, getSubscriptionWeeks } from '@/lib/weekly-review'

/**
 * Server-side eligibility check for the monthly review.
 *
 * Eligible when:
 *   - User has a subscription whose end_date is on or before today (AE wall)
 *   - The cycle ended ≤30 days ago (not expired)
 *   - The user hasn't already submitted a monthly review for that subscription
 *
 * Returns daysLeftForFullReward (positive while in 7-day window, 0 on the
 * last day, negative after — same vocabulary as weekly review windows) so
 * the trigger UI can render the right urgency chip.
 *
 * `USE_DEMO` short-circuit available for previewing the takeover UI before
 * the user has any real eligible subscription.
 */

const USE_DEMO = false

function aeToday(): Date {
    const now = new Date()
    const ae = new Date(now.getTime() + 4 * 60 * 60 * 1000)
    return new Date(Date.UTC(ae.getUTCFullYear(), ae.getUTCMonth(), ae.getUTCDate()))
}

function daysBetween(a: Date, b: Date): number {
    return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function parseDateUTC(s: string): Date {
    const datePart = s.length > 10 ? s.slice(0, 10) : s
    return new Date(datePart + 'T00:00:00Z')
}

async function computeMonthlyReviewWindow(userId: string): Promise<MonthlyReviewWindow> {
    const supabase = await createClient()

    // Find the user's most recently ended cycle. Filtering to end_date in
    // the past prevents picking a still-active sub for a user who's
    // renewed — they should see the just-ended cycle's review window,
    // not the new cycle's future end date.
    const today = aeToday()
    const todayIso = today.toISOString().slice(0, 10)
    const { data: sub } = await supabase
        .from('subscriptions')
        .select('id, end_date, status')
        .eq('customer_id', userId)
        .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED, SUBSCRIPTION_STATUS.ENDED])
        .lte('end_date', todayIso)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (!sub) {
        return { eligible: false, submitted: false, daysLeftForFullReward: 0, daysSinceCycleEnd: 0, expired: false }
    }

    const endDate = parseDateUTC(sub.end_date)
    const daysSinceCycleEnd = daysBetween(endDate, today)

    if (daysSinceCycleEnd < 0) {
        // Defensive — the .lte filter above guards this, but TZ skew on
        // edge dates could in theory still land here.
        return { eligible: false, submitted: false, daysLeftForFullReward: 0, daysSinceCycleEnd, expired: false }
    }

    const expired = daysSinceCycleEnd > MONTHLY_LATE_CAP_DAYS

    // Has this user already submitted for this subscription?
    const { data: existing } = await supabase
        .from('monthly_reviews')
        .select('id')
        .eq('customer_id', userId)
        .eq('subscription_id', sub.id)
        .maybeSingle()

    const submitted = !!existing

    return {
        eligible: !expired && !submitted,
        submitted,
        daysLeftForFullReward: Math.max(0, MONTHLY_FULL_REWARD_WINDOW_DAYS - daysSinceCycleEnd),
        daysSinceCycleEnd,
        expired,
    }
}

export const getMonthlyReviewWindow = cache(async (userId: string): Promise<MonthlyReviewWindow> => {
    if (USE_DEMO) {
        return { eligible: true, submitted: false, daysLeftForFullReward: 5, daysSinceCycleEnd: 2, expired: false }
    }
    return computeMonthlyReviewWindow(userId)
})

export function monthlyBadgeFromWindow(w: MonthlyReviewWindow): MonthlyReviewBadge {
    if (!w.eligible) return 'none'
    return w.daysLeftForFullReward > 0 ? 'active' : 'late'
}

/**
 * Aggregate reveal-screen stats for the customer's most recent ended cycle.
 *
 * Computed on demand at reveal time. Reads from:
 *   - subscriptions (meals delivered, plan name, end date)
 *   - weekly_reviews (favorites, ratings, AED earned)
 *   - monthly_reviews (the just-submitted row, for AED total)
 *
 * `favoriteSocialProofPct` requires a cross-customer aggregation over the
 * same cycle window; left as null until the menu data layer can scope it
 * cleanly. The reveal UI handles the null case gracefully.
 */
interface WeeklyReviewAggregateRow {
    rating: number
    favorites: string[]
    reward_pct: number
    week_number: number
}

export async function getMonthlyRevealStats(
    userId: string,
    subscriptionId: string,
): Promise<MonthlyRevealStats | null> {
    const supabase = await createClient()

    const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan_name, start_date, end_date, delivered_meals, total_meals')
        .eq('id', subscriptionId)
        .eq('customer_id', userId)
        .maybeSingle()
    if (!sub) return null

    const { data: weeklies } = await supabase
        .from('weekly_reviews')
        .select('rating, favorites, reward_pct, week_number')
        .eq('customer_id', userId)
        .eq('subscription_id', subscriptionId)
        .returns<WeeklyReviewAggregateRow[]>()

    const weeklyRows = weeklies ?? []
    const startDate = parseDateUTC(sub.start_date)
    const cycleLabel = startDate.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) + ' cycle'

    // Favorite-dish tally across all weekly reviews this cycle.
    const tally = new Map<string, number>()
    for (const row of weeklyRows) {
        for (const id of row.favorites ?? []) {
            tally.set(id, (tally.get(id) ?? 0) + 1)
        }
    }
    let topId: string | null = null
    let topCount = 0
    for (const [id, count] of tally) {
        if (count > topCount) { topId = id; topCount = count }
    }

    // Top week = highest rating across submitted weeklies.
    let topWeek: number | null = null
    let topRating = -1
    for (const row of weeklyRows) {
        if (row.rating > topRating) { topRating = row.rating; topWeek = row.week_number }
    }

    // Phase 8K — under the all-or-nothing rule, weekly review AED only
    // "counts as earned" once the user hits the cycle's expected total.
    // The reveal screen renders right after the monthly wrap submits, so
    // at this point the cycle's review window is effectively closing — we
    // do the same all-in check the SSR getter does.
    const cycleEnd = sub.end_date
        ? new Date((sub.end_date as string).slice(0, 10) + 'T00:00:00Z')
        : null
    const weeks = startDate && cycleEnd
        ? getSubscriptionWeeks(startDate, cycleEnd)
        : []
    const allInForCycle = weeklyRows.length >= weeks.length && weeks.length > 0
    const aedEarnedFromWeeklies = allInForCycle
        ? weeklyRows.reduce(
            (sum, r) => sum + weeklyReviewAed(r.reward_pct as 50 | 100),
            0,
          )
        : 0

    return {
        planName: sub.plan_name ?? 'Plan',
        cycleLabel,
        mealsDelivered: sub.delivered_meals ?? 0,
        mealsTotal: sub.total_meals ?? 0,
        // Resolving the meal id → name happens at the route layer where
        // MENU_DATA is in scope. We pass the id through; the UI matches.
        favoriteDish: topId ? { name: topId } : null,
        topWeek,
        favoriteSocialProofPct: null,
        aedEarnedThisCycle: aedEarnedFromWeeklies,
        weeklyReviewsSubmitted: weeklyRows.length,
        weeklyReviewsTotal: weeks.length,
    }
}

import { cache } from 'react'
import { createClient } from './server'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import {
    MONTHLY_FULL_REWARD_WINDOW_DAYS,
    MONTHLY_LATE_CAP_DAYS,
    MONTHLY_PRE_CRON_HOUR_AE,
    PRE_END_WRAP_WINDOW,
    planTierFrom,
    cycleLabelFor,
    weeklyWrapGate,
    type MonthlyReviewWindow,
    type MonthlyRevealStats,
} from '@/contexts/subscriptions/domain/monthly-review'
import { weeklyReviewAed, getSubscriptionWeeks } from '@/contexts/subscriptions/domain/weekly-review'
import { expectedReviewWeeks } from '@/contexts/subscriptions/domain/plans'

/**
 * Server-side eligibility check for the wrap (formerly "monthly review").
 *
 * Eligible when:
 *   - User has a subscription whose end_date falls within the wrap window:
 *     • Up to PRE_END_WRAP_WINDOW[planTier] days BEFORE end_date (matches the
 *       dashboard's renew banner timing — 4d monthly / 2d weekly / 1d trial)
 *     • Up to 30 days AFTER end_date (the late-submission cap)
 *   - The user hasn't already submitted a wrap for that subscription
 *
 * Returns daysSinceCycleEnd signed: NEGATIVE when in the pre-end window,
 * positive when post-end. UI uses the sign to switch the chip vocabulary
 * between "Nd to end" and "Nd left for full reward" / "Nd late".
 *
 */

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

const EMPTY_WINDOW: MonthlyReviewWindow = {
    eligible: false,
    locked: false,
    submitted: false,
    daysLeftForFullReward: 0,
    daysSinceCycleEnd: 0,
    expired: false,
    preCron: false,
    cycleLabel: null,
    planTier: 'monthly',
}

// Broadest pre-end lead-in across all tiers — used to widen the SQL date
// filter so the query catches every tier's earliest possible surfacing. The
// tier-specific check happens in code after we know the plan_name.
//
// The floor of 7 exists for the weekly tier, which no longer surfaces off
// end_date at all: it appears on day 4 of a ~7-day plan, roughly 4 days
// before the end. A pre-end filter derived only from PRE_END_WRAP_WINDOW
// would be 4 and would clip that at the boundary. 7 buys headroom for any
// weekly plan whose end_date sits further out (5DAYS/7DAYS week types shift
// it), at the cost of considering one extra row that the tier check below
// discards anyway.
const MAX_PRE_END_DAYS = Math.max(...Object.values(PRE_END_WRAP_WINDOW), 7)

async function computeMonthlyReviewWindow(userId: string): Promise<MonthlyReviewWindow> {
    const supabase = await createClient()

    // Find the user's most recently ended (or about-to-end) cycle. The
    // date filter is widened from the original "<= today" to "<= today + N"
    // so the query also catches subs ending in the next few days — that's
    // the pre-end wrap window per tier (4d monthly / 2d weekly / 1d trial),
    // mirroring the dashboard's renew-banner timing exactly. The tier
    // check below narrows back per-customer.
    //
    // Selecting start_date + plan_name so we can derive the cycle label
    // and plan tier inline. Single source of truth instead of every caller
    // re-deriving the same fields.
    const today = aeToday()
    const todayIso = today.toISOString().slice(0, 10)
    const maxFuture = new Date(today); maxFuture.setUTCDate(today.getUTCDate() + MAX_PRE_END_DAYS)
    const maxFutureIso = maxFuture.toISOString().slice(0, 10)
    const { data: sub } = await supabase
        .from('subscriptions')
        .select('id, end_date, start_date, status, plan_name, delivered_meals')
        .eq('customer_id', userId)
        .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED, SUBSCRIPTION_STATUS.ENDED])
        .lte('end_date', maxFutureIso)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (!sub) return EMPTY_WINDOW

    const planTier = planTierFrom(sub.plan_name as string | null)
    const preEndWindow = PRE_END_WRAP_WINDOW[planTier]
    const endDate = parseDateUTC(sub.end_date)
    const daysSinceCycleEnd = daysBetween(endDate, today)

    const deliveredMeals = (sub.delivered_meals as number | null) ?? 0

    // Weekly is gated FORWARD from start_date, not backward from end_date:
    // on a 7-day plan "4 days before the end" is day 3, far too early to have
    // an opinion worth collecting. weeklyWrapGate shows the card locked from
    // day 4 and opens it on the 5th delivered meal — see its docblock for why
    // the open state counts meals rather than days.
    //
    // `locked` is carried through to the window so the three low-key surfaces
    // can render the greyed-out card; `eligible` stays false throughout, which
    // is what keeps the takeover and forcing overlay silent for free.
    let weeklyLocked = false
    if (planTier === 'weekly') {
        const startDateIso = sub.start_date as string | null
        if (!startDateIso) return { ...EMPTY_WINDOW, daysSinceCycleEnd, planTier }
        const gate = weeklyWrapGate({
            daysSinceStart: daysBetween(parseDateUTC(startDateIso), today),
            deliveredMeals,
            cycleEnded: daysSinceCycleEnd >= 0,
        })
        if (gate === 'hidden') return { ...EMPTY_WINDOW, daysSinceCycleEnd, planTier }
        weeklyLocked = gate === 'locked'
    } else if (daysSinceCycleEnd < -preEndWindow) {
        // Pre-end gating for the remaining tiers: the SQL filter is widened to
        // the broadest window, so here we narrow back to this customer's tier.
        // A monthly customer 5 days from end → too early (window is 4). A
        // trial is post-end only (window is 0) — see PRE_END_WRAP_WINDOW.
        //
        // daysSinceCycleEnd < -preEndWindow means: more days remain to end
        // than the tier's pre-end window allows.
        return { ...EMPTY_WINDOW, daysSinceCycleEnd, planTier }
    }

    // Trial-only gate: a trial is a single meal whose end_date == delivery
    // day, so eligibility must also wait for the meal to actually be marked
    // delivered. Without this, the wrap surfaces (strip + Now tray) appear
    // on delivery-day morning before the meal arrives — asking the customer
    // to reflect on a meal they haven't tasted. The 7 PM force overlay
    // doesn't catch this case because it gates on hour, not delivery.
    if (planTier === 'trial' && deliveredMeals < 1) {
        return { ...EMPTY_WINDOW, daysSinceCycleEnd, planTier }
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

    const cycleLabel = cycleLabelFor(planTier, sub.start_date as string | null)

    // Pre-cron window: end_date is TODAY AE and current AE hour is past the
    // delivery slot. After midnight, end_date becomes "yesterday" and we
    // fall into the regular post-cron eligibility path. Skips when already
    // submitted (no point forcing an overlay for a closed loop).
    const endIso = (sub.end_date as string).slice(0, 10)
    const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const aeHour = aeNow.getUTCHours()
    const preCron = !submitted && endIso === todayIso && aeHour >= MONTHLY_PRE_CRON_HOUR_AE

    return {
        // A locked weekly wrap is shown but not submittable, so it must not
        // read as eligible anywhere. Keeping the two mutually exclusive means
        // every existing `if (!eligible) return null` surface keeps working
        // untouched, and only the surfaces that opt into `locked` change.
        eligible: !expired && !submitted && !weeklyLocked,
        locked: weeklyLocked && !expired && !submitted,
        submitted,
        daysLeftForFullReward: Math.max(0, MONTHLY_FULL_REWARD_WINDOW_DAYS - daysSinceCycleEnd),
        daysSinceCycleEnd,
        expired,
        preCron,
        cycleLabel,
        planTier,
    }
}

export const getMonthlyReviewWindow = cache(async (userId: string): Promise<MonthlyReviewWindow> => {
    return computeMonthlyReviewWindow(userId)
})

// monthlyBadgeFromWindow moved to '@/contexts/subscriptions/domain/monthly-review' so client components
// (Sidebar, tray) can import it without pulling next/headers into the bundle.

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
    // Plan-aware cycle label so the reveal eyebrow reads correctly for
    // weekly/trial customers too (was hardcoded to "{Month} cycle" before).
    const planTier = planTierFrom(sub.plan_name as string | null)
    const cycleLabel = cycleLabelFor(planTier, sub.start_date as string | null) ?? 'cycle'

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
    const weeks = startDate
        ? getSubscriptionWeeks(startDate, expectedReviewWeeks(sub.plan_name as string | null))
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

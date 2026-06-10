import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer } from '@/infra/supabase/subscriptions-repo'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { getSubscriptionWeeks } from '@/contexts/subscriptions/domain/weekly-review'
import { expectedReviewWeeks } from '@/contexts/subscriptions/domain/plans'
import { getMenuWeek } from '@/contexts/menu/domain/catalog-data'
import { getMenuDishes } from '@/infra/supabase/menu-catalog'
import { vegDayNumbersFor, type WeekType } from '@/contexts/subscriptions/domain/veg-day'
import { ReviewClient } from './ReviewClient'
import type { WeeklyReviewMeal } from '../../../_shared/WeeklyReviewTakeover'

/**
 * Weekly review submission route — `/dashboard/menu/review/[week]`.
 *
 * Lives under /menu because the trigger surface (the "Last week" section)
 * lives there. Server-side guards:
 *   - User must be authenticated
 *   - User must have an active subscription
 *   - `week` param must be a valid week in that subscription
 *   - That week must have ended (no future reviews)
 *   - User must not have already submitted (re-attempts redirect to /menu)
 *   - Window must be open (≤30 days past week end)
 *
 * Meal data is pulled from the static `MENU_DATA` 4-week rotation,
 * filtered by the customer's veg/non-veg preference. Images flow through
 * to the takeover so the favorites/misses grids show real food photos.
 */
export default async function ReviewPage({
    params,
    searchParams,
}: {
    params: Promise<{ week: string }>
    searchParams?: Promise<{ just_submitted?: string; from?: string }>
}) {
    const { week: weekParam } = await params
    const sp = (await searchParams) ?? {}
    // Phase 8K — `?just_submitted=1` is set by the takeover via
    // window.history.replaceState() immediately before the server action
    // fires. Server actions trigger a route-level refresh after
    // revalidatePath; without this flag, the re-rendered page sees the
    // just-inserted row and redirects to /menu BEFORE the thank-you
    // screen renders. The flag tells us "you're mid-thank-you, skip the
    // bounce — the user will navigate manually when they click Done."
    const justSubmitted = sp.just_submitted === '1'
    const week = Number.parseInt(weekParam, 10)
    if (!Number.isFinite(week) || week < 1) redirect('/dashboard/menu')

    // Kick off the catalog load immediately — it needs no auth context and
    // never rejects (fails open to static MENU_DATA), so it downloads in
    // parallel with the auth + subscription round trips below.
    const menuDishesPromise = getMenuDishes()

    const [user, supabase] = await Promise.all([getUserFromHeaders(), createClient()])
    if (!user) redirect('/login')

    const [{ data: sub }, customer] = await Promise.all([
        supabase
            .from('subscriptions')
            .select('id, start_date, plan_name, week_type, veg_days, skipped_dates, paused_dates')
            .eq('customer_id', user.id)
            .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED])
            .order('start_date', { ascending: true })
            .limit(1)
            .maybeSingle(),
        getCustomer(user.id),
    ])

    if (!sub) redirect('/dashboard/menu')

    const startDate = new Date(sub.start_date.slice(0, 10) + 'T00:00:00Z')
    const weeks = getSubscriptionWeeks(startDate, expectedReviewWeeks(sub.plan_name))
    const target = weeks.find((w) => w.number === week)
    if (!target) redirect('/dashboard/menu')

    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const daysSinceEnd = Math.floor((today.getTime() - target.end.getTime()) / (1000 * 60 * 60 * 24))
    if (daysSinceEnd < 1) redirect('/dashboard/menu')
    if (daysSinceEnd > 30) redirect('/dashboard/menu')

    // Both weekly_reviews lookups only need sub.id — run them together,
    // alongside the catalog promise started at the top of the function.
    const [{ data: existing }, { count: priorSubmissionsCount }, menuDishes] = await Promise.all([
        // If a review for this week already exists, bounce back so the
        // just-submitted success bar can surface there instead.
        supabase
            .from('weekly_reviews')
            .select('id')
            .eq('customer_id', user.id)
            .eq('subscription_id', sub.id)
            .eq('week_number', week)
            .maybeSingle(),
        // Phase 8K — count prior submissions on this sub to drive the
        // first-time acknowledgement modal. If the user has already submitted
        // ≥1 review, they don't need to see the all-or-nothing rule explainer
        // (already learned it). Skips localStorage entirely for that case.
        supabase
            .from('weekly_reviews')
            .select('id', { count: 'exact', head: true })
            .eq('customer_id', user.id)
            .eq('subscription_id', sub.id),
        menuDishesPromise,
    ])
    // Skip the bounce when the takeover has just submitted and is
    // showing the thank-you screen client-side. The user will navigate
    // away via the "Back to dashboard" button.
    if (existing && !justSubmitted) redirect('/dashboard/menu')

    const priorSubmissions = priorSubmissionsCount ?? 0

    const fullName = customer?.name?.trim() ?? ''
    const userName = fullName.split(' ')[0] || 'there'

    const weekRange = `${formatDate(target.start)} — ${formatDate(target.end)}`
    const daysLeftForFullReward = Math.max(0, 7 - daysSinceEnd)
    const weekType: WeekType = sub.week_type === '5DAYS' ? '5DAYS' : '6DAYS'
    const meals = mealsForReviewWeek({
        weekStart: target.start,
        mealPreference: customer?.meal_preference_type,
        vegDays: sub.veg_days,
        weekType,
        skippedDates: sub.skipped_dates,
        pausedDates: sub.paused_dates,
        allDishes: menuDishes,
    })

    // Total weeks expected for this sub's cycle — drives the all-or-nothing
    // rule wording in the takeover. Skip the rule for single-week subs
    // (Weekly Flex), since there's no "all of one" to fail.
    const weeksExpected = weeks.length

    const returnTo = sp.from === 'dorm-wars' ? '/dashboard/dorm-wars' : '/dashboard'

    return (
        <ReviewClient
            userName={userName}
            week={week}
            weekRange={weekRange}
            meals={meals}
            daysLeftForFullReward={daysLeftForFullReward}
            priorSubmissions={priorSubmissions}
            weeksExpected={weeksExpected}
            returnTo={returnTo}
        />
    )
}

function formatDate(d: Date): string {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Resolve the dishes actually delivered during the reviewed week.
 *
 * Three refinements over the naive "give me all 6 dishes for menu_week + pref":
 *
 *   1. **Religious-mix awareness.** `vegDayNumbersFor` from `@/contexts/subscriptions/domain/veg-day`
 *      gives the canonical set of veg day indices for this customer. Pure
 *      Veg → all working days; pure Non-Veg → none; religious-mix → exactly
 *      the days the customer chose. Each day picks the matching dish from
 *      MENU_DATA — so a mix customer sees veg on Tuesday and non-veg on
 *      Monday/Wednesday/etc., matching what the kitchen actually delivered.
 *
 *   2. **Skip-day awareness.** Subscription.skipped_dates is a set of
 *      ISO date strings for individual days the customer skipped. Skipped
 *      days stay in the grid for week-context but render greyed-out and
 *      non-selectable, with a "Skipped meal" caption — so the user sees
 *      the full week at a glance and doesn't wonder "where's Wednesday?"
 *
 *   3. **Pause-day awareness.** Subscription.paused_dates is the same
 *      pattern, populated by the daily pause_tick + the resume action.
 *      Paused days render with a "Paused meal" caption.
 *
 * Working-day count (5 or 6) comes from week_type. Sunday is never a
 * delivery day for any week_type, so day indices 0..N-1 cover Mon..N.
 */
function mealsForReviewWeek({
    weekStart,
    mealPreference,
    vegDays,
    weekType,
    skippedDates,
    pausedDates,
    allDishes,
}: {
    weekStart: Date
    mealPreference: string | null | undefined
    vegDays: string[] | null | undefined
    weekType: WeekType
    skippedDates: string[] | null | undefined
    pausedDates: string[] | null | undefined
    allDishes: import('@/contexts/menu/domain/catalog-data').Dish[]
}): WeeklyReviewMeal[] {
    const menuWeek = getMenuWeek(weekStart)
    const vegDayNumbers = vegDayNumbersFor(mealPreference, vegDays, weekType)
    const totalDays = weekType === '5DAYS' ? 5 : 6
    const skippedSet = new Set(skippedDates ?? [])
    const pausedSet = new Set(pausedDates ?? [])

    const meals: WeeklyReviewMeal[] = []
    for (let dayOfWeek = 0; dayOfWeek < totalDays; dayOfWeek++) {
        const dayDate = new Date(weekStart.getTime() + dayOfWeek * 24 * 60 * 60 * 1000)
        const dayIso = dayDate.toISOString().slice(0, 10)
        const isSkipped = skippedSet.has(dayIso)
        // Skip takes precedence over pause when both are flagged for the same
        // day — a customer who skipped manually has a more specific intent
        // than the cron's pause record (which would never co-occur in
        // practice, but defensive).
        const isPaused = !isSkipped && pausedSet.has(dayIso)

        const isVegForToday = vegDayNumbers.has(dayOfWeek)
        const dish = allDishes.find((d) =>
            d.week === menuWeek && d.dayOfWeek === dayOfWeek && d.isVeg === isVegForToday,
        )
        if (!dish) continue

        meals.push({
            id: String(dish.id),
            name: dish.name,
            day: `${DAY_LABELS[dayOfWeek]} · ${formatDate(dayDate)}`,
            image: dish.image,
            skipped: isSkipped || undefined,
            paused: isPaused || undefined,
        })
    }
    return meals
}

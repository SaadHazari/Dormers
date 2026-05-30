'use client'

import { useRouter } from 'next/navigation'
import { WeeklyReviewTakeover, type WeeklyReviewMeal, type WeeklyReviewPayload } from '../../../_shared/WeeklyReviewTakeover'
import { submitWeeklyReview } from '../actions'

/**
 * Thin client wrapper for the WeeklyReviewTakeover that:
 *   - Calls the `submitWeeklyReview` server action on submit
 *   - Wires the post-submit chain CTA: when the takeover surfaces a
 *     "Continue to Week N" choice, route the user into that week's
 *     review page. The user explicitly picks this — no silent teleport.
 *   - Falls back to /dashboard when the user dismisses or picks
 *     "Save for later"
 */
export function ReviewClient({
    userName,
    week,
    weekRange,
    meals,
    daysLeftForFullReward,
    priorSubmissions,
    weeksExpected,
}: {
    userName: string
    week: number
    weekRange: string
    meals: WeeklyReviewMeal[]
    daysLeftForFullReward: number
    priorSubmissions: number
    weeksExpected: number
}) {
    const router = useRouter()

    return (
        <WeeklyReviewTakeover
            userName={userName}
            week={week}
            weekRange={weekRange}
            meals={meals}
            daysLeftForFullReward={daysLeftForFullReward}
            priorSubmissions={priorSubmissions}
            weeksExpected={weeksExpected}
            onSubmit={(payload: WeeklyReviewPayload) => submitWeeklyReview(week, payload)}
            onClose={() => router.push('/dashboard')}
            onContinueChain={(nextWeek) => router.push(`/dashboard/menu/review/${nextWeek}`)}
        />
    )
}

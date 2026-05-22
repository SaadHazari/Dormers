'use client'

import { useRouter } from 'next/navigation'
import { WeeklyReviewTakeover, type WeeklyReviewMeal, type WeeklyReviewPayload } from '../../../_shared/WeeklyReviewTakeover'
import { submitWeeklyReview } from '../actions'

/**
 * Thin client wrapper for the WeeklyReviewTakeover that:
 *   - Calls the `submitWeeklyReview` server action on submit
 *   - Routes back to /dashboard/menu when the user closes the takeover
 *     (via the X button or the post-thank-you CTA)
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
            onClose={() => router.push('/dashboard/menu')}
        />
    )
}

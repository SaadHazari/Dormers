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
            // Dismiss lands on the main dashboard, not /menu — the weekly
            // review trigger now lives in the Now tray (which is shell-level,
            // not menu-scoped), so /dashboard is the natural return surface.
            // See project_now_tray_architecture memory.
            onClose={() => router.push('/dashboard')}
        />
    )
}

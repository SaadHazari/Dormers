'use client'

import { useRouter } from 'next/navigation'
import { MonthlyReviewTakeover } from '../../../_shared/MonthlyReviewTakeover'
import type { MonthlyReviewPayload, WrapPlanTier } from '@/lib/monthly-review'
import { submitMonthlyReview } from './actions'

export function MonthlyReviewClient({
    userName,
    cycleLabel,
    daysLeftForFullReward,
    planTier,
}: {
    userName: string
    cycleLabel: string
    daysLeftForFullReward: number
    planTier: WrapPlanTier
}) {
    const router = useRouter()
    return (
        <MonthlyReviewTakeover
            userName={userName}
            cycleLabel={cycleLabel}
            daysLeftForFullReward={daysLeftForFullReward}
            planTier={planTier}
            onSubmit={(payload: MonthlyReviewPayload) => submitMonthlyReview(payload)}
            onClose={() => {
                router.refresh()
                // Wrap dismiss lands on the main dashboard, not /menu. Pre-tray
                // architecture, the wrap trigger lived on /menu and round-tripping
                // back there made sense. With the Now-tray model the wrap is a
                // dashboard-scoped surface (tray + strip + overlay + empty banner
                // all live on /dashboard or its shell), so dismissing should drop
                // the user back onto the dashboard's main view — same place the
                // tray opened from. See project_now_tray_architecture memory.
                router.push('/dashboard')
            }}
        />
    )
}

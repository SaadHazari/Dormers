'use client'

import { useRouter } from 'next/navigation'
import { MonthlyReviewTakeover } from '../../../_shared/MonthlyReviewTakeover'
import type { MonthlyReviewPayload, WrapPlanTier } from '@/contexts/subscriptions/domain/monthly-review'
import { submitMonthlyReview } from './actions'

export function MonthlyReviewClient({
    userName,
    cycleLabel,
    daysLeftForFullReward,
    planTier,
    returnTo = '/dashboard',
}: {
    userName: string
    cycleLabel: string
    daysLeftForFullReward: number
    planTier: WrapPlanTier
    returnTo?: string
}) {
    const router = useRouter()
    const returnLabel = returnTo.includes('dorm-wars') ? 'Back to Dorm Wars' : 'Back to dashboard'
    return (
        <MonthlyReviewTakeover
            userName={userName}
            cycleLabel={cycleLabel}
            daysLeftForFullReward={daysLeftForFullReward}
            planTier={planTier}
            onSubmit={(payload: MonthlyReviewPayload) => submitMonthlyReview(payload)}
            onClose={() => {
                router.refresh()
                router.push(returnTo)
            }}
            closeLabel={returnLabel}
        />
    )
}

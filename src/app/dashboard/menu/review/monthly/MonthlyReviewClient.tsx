'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MonthlyReviewTakeover } from '../../../_shared/MonthlyReviewTakeover'
import type { MonthlyReviewPayload, WrapPlanTier, MonthlyReviewSubmitResult } from '@/contexts/subscriptions/domain/monthly-review'
import { submitMonthlyReview } from './actions'

export function MonthlyReviewClient({
    userName,
    cycleLabel,
    daysLeftForFullReward,
    planTier,
    returnTo = '/dashboard',
    previewResult,
}: {
    userName: string
    cycleLabel: string
    daysLeftForFullReward: number
    planTier: WrapPlanTier
    returnTo?: string
    /** DEV-ONLY (preview harness): resolve the submit with this instead of the
     *  server action, so the reveal screen can be screenshot-verified. */
    previewResult?: MonthlyReviewSubmitResult
}) {
    const router = useRouter()
    const [isNavPending, startNavTransition] = useTransition()
    const returnLabel = returnTo.includes('dorm-wars') ? 'Back to Dorm Wars' : 'Back to dashboard'
    return (
        <MonthlyReviewTakeover
            userName={userName}
            cycleLabel={cycleLabel}
            daysLeftForFullReward={daysLeftForFullReward}
            planTier={planTier}
            onSubmit={(payload: MonthlyReviewPayload) => previewResult ? Promise.resolve(previewResult) : submitMonthlyReview(payload)}
            isClosePending={isNavPending}
            onClose={() => {
                startNavTransition(() => {
                    router.refresh()
                    router.push(returnTo)
                })
            }}
            closeLabel={returnLabel}
        />
    )
}

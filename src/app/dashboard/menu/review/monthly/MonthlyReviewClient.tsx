'use client'

import { useRouter } from 'next/navigation'
import { MonthlyReviewTakeover } from '../../../_shared/MonthlyReviewTakeover'
import type { MonthlyReviewPayload } from '@/lib/monthly-review'
import { submitMonthlyReview } from './actions'

export function MonthlyReviewClient({
    userName,
    cycleLabel,
    daysLeftForFullReward,
}: {
    userName: string
    cycleLabel: string
    daysLeftForFullReward: number
}) {
    const router = useRouter()
    return (
        <MonthlyReviewTakeover
            userName={userName}
            cycleLabel={cycleLabel}
            daysLeftForFullReward={daysLeftForFullReward}
            onSubmit={(payload: MonthlyReviewPayload) => submitMonthlyReview(payload)}
            onClose={() => {
                router.refresh()
                router.push('/dashboard/menu')
            }}
        />
    )
}

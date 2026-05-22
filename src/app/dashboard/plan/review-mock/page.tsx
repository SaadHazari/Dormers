'use client'

import { notFound, useRouter } from 'next/navigation'
import { WeeklyReviewTakeover, type WeeklyReviewMeal } from '../../_shared/WeeklyReviewTakeover'

const TEST_MEALS: WeeklyReviewMeal[] = [
    { id: 'mon', name: 'Chicken Biryani',  day: 'Mon · Day 15', gradient: 'linear-gradient(135deg, #d97706 0%, #7c2d12 100%)' },
    { id: 'tue', name: 'Beef Lasagna',     day: 'Tue · Day 16', gradient: 'linear-gradient(135deg, #b91c1c 0%, #581c1c 100%)' },
    { id: 'wed', name: 'Thai Green Curry', day: 'Wed · Day 17', gradient: 'linear-gradient(135deg, #65a30d 0%, #14532d 100%)' },
    { id: 'thu', name: 'Lamb Kebab Plate', day: 'Thu · Day 18', gradient: 'linear-gradient(135deg, #b45309 0%, #451a03 100%)' },
    { id: 'fri', name: 'Mushroom Risotto', day: 'Fri · Day 19', gradient: 'linear-gradient(135deg, #92400e 0%, #292524 100%)' },
    { id: 'sat', name: 'Tandoori Chicken', day: 'Sat · Day 20', gradient: 'linear-gradient(135deg, #dc2626 0%, #7f1d1d 100%)' },
]

/**
 * Design preview for the weekly review takeover. Renders the real component
 * with stubbed data and a no-op submit. Production route lives at
 * /dashboard/menu/review/[week] — see `menu/review/[week]/page.tsx`.
 *
 * Flip `LATE_DEMO = true` to preview the "Late · 50% reward" header chip.
 */
const LATE_DEMO = false

export default function WeeklyReviewTakeoverMockPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    const router = useRouter()
    return (
        <WeeklyReviewTakeover
            userName="Saad"
            week={3}
            weekRange="Dec 9 — Dec 15"
            meals={TEST_MEALS}
            daysLeftForFullReward={LATE_DEMO ? -1 : 5}
            onSubmit={async () => {
                // Mock: simulate latency then return success
                await new Promise((r) => setTimeout(r, 600))
                return { ok: true, rewardPct: LATE_DEMO ? 50 : 100, lumpSumApprovedAed: null }
            }}
            onClose={() => router.push('/dashboard/plan')}
        />
    )
}

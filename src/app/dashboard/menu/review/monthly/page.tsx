import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer } from '@/infra/supabase/subscriptions-repo'
import { redirect } from 'next/navigation'
import { getMonthlyReviewWindow } from '@/utils/supabase/monthly-review-queries'
import { MonthlyReviewClient } from './MonthlyReviewClient'
import type { MonthlyReviewSubmitResult } from '@/contexts/subscriptions/domain/monthly-review'

/**
 * Wrap takeover route — `/dashboard/menu/review/monthly`.
 *
 * Server-side guards:
 *   - User must be authenticated
 *   - User must have a cycle in the wrap window (pre-end or post-end up to 30d)
 *   - User must not have already submitted (eligibility check covers both)
 *
 * On any failure, redirects to /dashboard/menu. The window now also carries
 * cycleLabel + planTier (single source of truth from the query) so this
 * route no longer needs its own duplicate fetch.
 */
export default async function MonthlyReviewPage({
    searchParams,
}: {
    searchParams?: Promise<{ from?: string; preview?: string; tier?: string; late?: string; result?: string }>
}) {
    const sp0 = (await searchParams) ?? {}
    if (process.env.NODE_ENV === 'development' && sp0.preview === '1') {
        // Dev-only state harness:  ?tier=monthly|weekly|trial  ?late=1  ?result=error
        // Step is driven by the takeover's localStorage draft (dormers:monthly-review:draft:v1).
        const tier = (sp0.tier === 'weekly' || sp0.tier === 'trial') ? sp0.tier : 'monthly'
        const previewResult: MonthlyReviewSubmitResult = sp0.result === 'error'
            ? { ok: false, error: 'Could not save your wrap — please try again.' }
            : { ok: true, rewardPct: sp0.late === '1' ? 50 : 100, revealStats: {
                planName: tier === 'trial' ? 'Trial' : tier === 'weekly' ? 'Weekly Flex' : 'Monthly Premium',
                cycleLabel: 'August cycle', mealsDelivered: tier === 'trial' ? 1 : tier === 'weekly' ? 6 : 22, mealsTotal: tier === 'trial' ? 1 : tier === 'weekly' ? 6 : 24,
                favoriteDish: { name: 'Chicken Afghani w/ Yellow Rice', image: '/images/Week1/nonveg1/ChickenAfghan.jpg' },
                topWeek: 3, favoriteSocialProofPct: 41, aedEarnedThisCycle: 25, weeklyReviewsSubmitted: 4, weeklyReviewsTotal: 4,
            } }
        return (
            <MonthlyReviewClient
                userName="Saad"
                cycleLabel={tier === 'trial' ? 'Trial' : tier === 'weekly' ? 'Weekly Flex' : 'Monthly Premium'}
                daysLeftForFullReward={sp0.late === '1' ? 0 : 5}
                planTier={tier}
                returnTo={sp0.from === 'dorm-wars' ? '/dashboard/dorm-wars' : '/dashboard'}
                previewResult={previewResult}
            />
        )
    }

    const user = await getUserFromHeaders()
    if (!user) redirect('/login')

    const window = await getMonthlyReviewWindow(user.id)
    if (!window.eligible) redirect('/dashboard/menu')

    const customer = await getCustomer(user.id)
    const fullName = customer?.name?.trim() ?? ''
    const userName = fullName.split(' ')[0] || 'there'
    const sp = (await searchParams) ?? {}
    const returnTo = sp.from === 'dorm-wars' ? '/dashboard/dorm-wars' : '/dashboard'

    return (
        <MonthlyReviewClient
            userName={userName}
            cycleLabel={window.cycleLabel ?? 'cycle'}
            daysLeftForFullReward={window.daysLeftForFullReward}
            planTier={window.planTier}
            returnTo={returnTo}
        />
    )
}

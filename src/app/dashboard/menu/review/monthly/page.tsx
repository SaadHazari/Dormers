import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer } from '@/contexts/subscriptions/domain/repo'
import { redirect } from 'next/navigation'
import { getMonthlyReviewWindow } from '@/utils/supabase/monthly-review-queries'
import { MonthlyReviewClient } from './MonthlyReviewClient'

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
export default async function MonthlyReviewPage() {
    const user = await getUserFromHeaders()
    if (!user) redirect('/login')

    const window = await getMonthlyReviewWindow(user.id)
    if (!window.eligible) redirect('/dashboard/menu')

    const customer = await getCustomer(user.id)
    const fullName = customer?.name?.trim() ?? ''
    const userName = fullName.split(' ')[0] || 'there'

    return (
        <MonthlyReviewClient
            userName={userName}
            cycleLabel={window.cycleLabel ?? 'cycle'}
            daysLeftForFullReward={window.daysLeftForFullReward}
            planTier={window.planTier}
        />
    )
}

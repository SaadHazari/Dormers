import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer } from '@/utils/supabase/queries'
import { redirect } from 'next/navigation'
import { getMonthlyReviewWindow } from '@/utils/supabase/monthly-review-queries'
import { createClient } from '@/utils/supabase/server'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/lib/subscription-status'
import { MonthlyReviewClient } from './MonthlyReviewClient'

/**
 * Monthly review takeover route — `/dashboard/menu/review/monthly`.
 *
 * Server-side guards:
 *   - User must be authenticated
 *   - User must have a cycle that has ended within the 30-day late-cap window
 *   - User must not have already submitted (eligibility check covers both)
 *
 * On any failure, redirects to /dashboard/menu — the trigger surface on
 * /menu only shows the link when eligibility is true, but server-side
 * validation re-checks because URL guessing is possible.
 */
export default async function MonthlyReviewPage() {
    const user = await getUserFromHeaders()
    if (!user) redirect('/login')

    const window = await getMonthlyReviewWindow(user.id)
    if (!window.eligible) redirect('/dashboard/menu')

    const customer = await getCustomer(user.id)
    const fullName = customer?.name?.trim() ?? ''
    const userName = fullName.split(' ')[0] || 'there'

    // Cycle label — derived from the subscription's start month.
    const supabase = await createClient()
    const { data: sub } = await supabase
        .from('subscriptions')
        .select('start_date')
        .eq('customer_id', user.id)
        .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED, SUBSCRIPTION_STATUS.ENDED])
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle()

    const cycleLabel = sub
        ? new Date(sub.start_date.slice(0, 10) + 'T00:00:00Z')
            .toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) + ' cycle'
        : 'This cycle'

    return (
        <MonthlyReviewClient
            userName={userName}
            cycleLabel={cycleLabel}
            daysLeftForFullReward={window.daysLeftForFullReward}
        />
    )
}

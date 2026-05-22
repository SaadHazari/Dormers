import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getQueuedSubscription } from '@/utils/supabase/queries'
import { getWeeklyReviewState } from '@/utils/supabase/weekly-review-queries'
import { getMonthlyReviewWindow } from '@/utils/supabase/monthly-review-queries'
import { createClient } from '@/utils/supabase/server'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/lib/subscription-status'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import MenuClient from './MenuClient'

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    return (
      <Suspense>
        <MenuClient
          customer={{ id: 'preview', cid: 'TST0001', name: 'Test User', email: 'test@dormers.ae', meal_preference_type: 'Non Veg', dorm_name: 'YUGO', created_at: new Date().toISOString() }}
          activeSubscription={null}
          userEmail="test@dormers.ae"
          hasQueuedRenewal={false}
        />
      </Suspense>
    )
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  // Need the active sub to read week_type + veg_days (religious-mix per-day
  // snapshot). Falls back to customer.week_type if no sub yet.
  // queuedSub tells the menu whether to dim out-of-plan future days as
  // "Plan ends" — when a queued renewal exists those same days are simply
  // covered by the next cycle, so we leave them as normal "Upcoming".
  const [customer, activeSubscription, queuedSub, weeklyReviewState, monthlyWindow] = await Promise.all([
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getQueuedSubscription(user.id),
    getWeeklyReviewState(user.id),
    getMonthlyReviewWindow(user.id),
  ])

  // Cycle label for the monthly wrap trigger — derived from the most
  // recently ended subscription's start month.
  let monthlyCycleLabel = 'This cycle'
  if (monthlyWindow.eligible) {
    const supabase = await createClient()
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('start_date')
      .eq('customer_id', user.id)
      .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED, SUBSCRIPTION_STATUS.ENDED])
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (sub) {
      monthlyCycleLabel = new Date(sub.start_date.slice(0, 10) + 'T00:00:00Z')
        .toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) + ' cycle'
    }
  }

  return (
    <Suspense>
      <MenuClient
        customer={customer}
        activeSubscription={activeSubscription}
        userEmail={user.email}
        weeklyReviewState={weeklyReviewState}
        monthlyWindow={monthlyWindow}
        monthlyCycleLabel={monthlyCycleLabel}
        hasQueuedRenewal={!!queuedSub}
      />
    </Suspense>
  )
}

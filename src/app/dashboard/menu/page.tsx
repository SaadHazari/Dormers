import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getQueuedSubscription } from '@/infra/supabase/subscriptions-repo'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import MenuClient from './MenuClient'
import { getMenuDishes } from '@/infra/supabase/menu-catalog'

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
  // Note: weeklyReviewState + monthlyWindow are both fetched in the layout
  // (for the Now tray) and no longer needed here — LastWeekSection and
  // MonthlyWrapTrigger used to live on this page but moved into the tray.
  // See project_now_tray_architecture memory.
  const [customer, activeSubscription, queuedSub, menuDishes] = await Promise.all([
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getQueuedSubscription(user.id),
    getMenuDishes(),
  ])

  return (
    <Suspense>
      <MenuClient
        customer={customer}
        activeSubscription={activeSubscription}
        userEmail={user.email}
        hasQueuedRenewal={!!queuedSub}
        menuData={menuDishes}
      />
    </Suspense>
  )
}

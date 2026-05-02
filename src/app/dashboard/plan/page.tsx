import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getAllSubscriptions } from '@/utils/supabase/queries'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import PlanClient from './PlanClient'

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    return (
      <Suspense>
        <PlanClient
          customer={{ id: 'preview', cid: 'TST0001', name: 'Test User', email: 'test@dormers.ae', whatsapp_number: '+971 50 000 0000', dorm_name: 'YUGO', meal_preference_type: 'Non Veg', allergens: 'None', spice_level_preference: 'Medium', created_at: new Date().toISOString() }}
          activeSubscription={{ id: 'prev-sub', plan_name: 'Monthly Premium', status: 'Active', start_date: '2026-04-01', end_date: '2026-05-01', total_meals: 24, delivered_meals: 6, skipped_meals_count: 1, has_paused_before: false, pause_date: null, last_skipped_date: null, paused_days: 0, created_at: new Date().toISOString() }}
          allSubscriptions={[]}
          userEmail="test@dormers.ae"
        />
      </Suspense>
    )
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  const [customer, activeSubscription, allSubscriptions] = await Promise.all([
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getAllSubscriptions(user.id),
  ])

  return (
    <Suspense>
      <PlanClient
        customer={customer}
        activeSubscription={activeSubscription}
        allSubscriptions={allSubscriptions}
        userEmail={user.email}
      />
    </Suspense>
  )
}

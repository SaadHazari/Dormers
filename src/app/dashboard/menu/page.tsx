import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription } from '@/utils/supabase/queries'
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
        />
      </Suspense>
    )
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  // Need the active sub to read week_type + veg_days (religious-mix per-day
  // snapshot). Falls back to customer.week_type if no sub yet.
  const [customer, activeSubscription] = await Promise.all([
    getCustomer(user.id),
    getActiveSubscription(user.id),
  ])

  return (
    <Suspense>
      <MenuClient customer={customer} activeSubscription={activeSubscription} userEmail={user.email} />
    </Suspense>
  )
}

import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer } from '@/utils/supabase/queries'
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
          userEmail="test@dormers.ae"
        />
      </Suspense>
    )
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  const customer = await getCustomer(user.id)

  return (
    <Suspense>
      <MenuClient customer={customer} userEmail={user.email} />
    </Suspense>
  )
}

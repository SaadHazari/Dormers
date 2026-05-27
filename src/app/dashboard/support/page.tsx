import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getAllSubscriptions } from '@/infra/supabase/subscriptions-repo'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import SupportClient from './SupportClient'

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    return (
      <Suspense>
        <SupportClient
          customer={{ id: 'preview', cid: 'TST0001', name: 'Test User', email: 'test@dormers.ae', created_at: new Date().toISOString() }}
          userEmail="test@dormers.ae"
          totalDelivered={42}
        />
      </Suspense>
    )
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  const [customer, allSubscriptions] = await Promise.all([
    getCustomer(user.id),
    getAllSubscriptions(user.id),
  ])
  const totalDelivered = allSubscriptions.reduce((acc, s) => acc + (s.delivered_meals ?? 0), 0)

  return (
    <Suspense>
      <SupportClient customer={customer} userEmail={user.email} totalDelivered={totalDelivered} />
    </Suspense>
  )
}

import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer } from '@/utils/supabase/queries'
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
        />
      </Suspense>
    )
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  const customer = await getCustomer(user.id)

  return (
    <Suspense>
      <SupportClient customer={customer} userEmail={user.email} />
    </Suspense>
  )
}

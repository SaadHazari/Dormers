import { getUserFromHeaders } from '@/utils/supabase/auth'
import {
  getCustomer,
  getReferralData,
  getDormStats,
  getRecentInvites,
} from '@/utils/supabase/queries'
import { redirect } from 'next/navigation'
import DormWarsClient from './DormWarsClient'

export const metadata = { title: 'Dorm Wars — Dormers' }

export default async function DormWarsPage() {
  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  // Three independent reads happen in parallel; dormStats then waits on
  // customer.dorm_name (we need the dorm before we can ask about it).
  const [customer, referralData, invites] = await Promise.all([
    getCustomer(user.id),
    getReferralData(user.id),
    getRecentInvites(user.id),
  ])

  const dormStats = await getDormStats(customer?.dorm_name ?? '')

  return (
    <DormWarsClient
      customerCid={customer?.cid ?? ''}
      customerDorm={customer?.dorm_name ?? ''}
      referralData={referralData}
      dormStats={dormStats}
      invites={invites}
    />
  )
}

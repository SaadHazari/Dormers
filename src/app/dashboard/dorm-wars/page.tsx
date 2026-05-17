import { getUserFromHeaders } from '@/utils/supabase/auth'
import {
  getCustomer,
  getReferralData,
  getDormStats,
  getRecentInvites,
  getActiveSubscription,
  getDailyDropToday,
  getStreak,
} from '@/utils/supabase/queries'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import HubClient from './hub/HubClient'

export const metadata = { title: 'Dorm Wars — Dormers' }

export default async function DormWarsPage() {
  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  // SSR Supabase client — RLS on `daily_drops` and `streaks` lets the user
  // read their own rows (auth.uid() = customer_id), so we use the SSR client
  // (not the admin client) for these initial-state fetches.
  const supabase = await createClient()

  // Six independent reads happen in parallel; dormStats then waits on
  // customer.dorm_name (we need the dorm before we can ask about it).
  const [
    customer,
    referralData,
    invites,
    activeSubscription,
    initialDailyDrop,
    initialStreak,
  ] = await Promise.all([
    getCustomer(user.id),
    getReferralData(user.id),
    getRecentInvites(user.id),
    getActiveSubscription(user.id),
    getDailyDropToday(supabase, user.id),
    getStreak(supabase, user.id),
  ])

  const dormStats = await getDormStats(customer?.dorm_name ?? '')

  return (
    <HubClient
      customerCid={customer?.cid ?? ''}
      customerName={customer?.name ?? ''}
      customerDorm={customer?.dorm_name ?? ''}
      referralData={referralData}
      dormStats={dormStats}
      invites={invites}
      activeSubscription={activeSubscription}
      initialStreak={initialStreak}
      initialDailyDrop={initialDailyDrop}
    />
  )
}

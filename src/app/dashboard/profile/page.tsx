import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getAllSubscriptions } from '@/infra/supabase/subscriptions-repo'
import { endedPlansFrom } from '../_shared/past-plans'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { dormNames } from '@/shared/dorm-registry'
import ProfileClient from './ProfileClient'

export default async function ProfilePage() {
  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [{ data: authData }, customer, activeSubscription, allSubscriptions, locs] = await Promise.all([
    supabase.auth.getUser(),
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getAllSubscriptions(user.id),
    getDormLocations(),
  ])
  const emailConfirmed = !!authData?.user?.email_confirmed_at

  // Past plans live on this page (the account-records surface); the full
  // record is one link away at /dashboard/history. getAllSubscriptions is
  // React-cached and already selects every column, so this costs no extra
  // round-trip.
  const endedPlans = endedPlansFrom(allSubscriptions)

  return (
    <ProfileClient
      customer={customer}
      userEmail={user.email}
      emailConfirmed={emailConfirmed}
      activeSubscription={activeSubscription}
      endedPlans={endedPlans}
      dorms={dormNames(locs)}
    />
  )
}

import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription } from '@/infra/supabase/subscriptions-repo'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { dormNames } from '@/shared/dorm-registry'
import ProfileClient from './ProfileClient'

export default async function ProfilePage() {
  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [{ data: authData }, customer, activeSubscription, locs] = await Promise.all([
    supabase.auth.getUser(),
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getDormLocations(),
  ])
  const emailConfirmed = !!authData?.user?.email_confirmed_at

  return (
    <ProfileClient
      customer={customer}
      userEmail={user.email}
      emailConfirmed={emailConfirmed}
      activeSubscription={activeSubscription}
      dorms={dormNames(locs)}
    />
  )
}

import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription } from '@/contexts/subscriptions/domain/repo'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ProfileClient from './ProfileClient'

export default async function ProfilePage() {
  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  // Need the full auth-user record (not just headers) for email_confirmed_at.
  // Middleware-set headers don't carry email-verification state.
  // Also fetch activeSubscription so the profile can render the locked
  // veg-day snapshot for religious-mix customers.
  const supabase = await createClient()
  const [{ data: authData }, customer, activeSubscription] = await Promise.all([
    supabase.auth.getUser(),
    getCustomer(user.id),
    getActiveSubscription(user.id),
  ])
  const emailConfirmed = !!authData?.user?.email_confirmed_at

  return (
    <ProfileClient
      customer={customer}
      userEmail={user.email}
      emailConfirmed={emailConfirmed}
      activeSubscription={activeSubscription}
    />
  )
}

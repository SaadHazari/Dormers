import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer } from '@/utils/supabase/queries'
import { redirect } from 'next/navigation'
import ProfileClient from './ProfileClient'

export default async function ProfilePage() {
  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  const customer = await getCustomer(user.id)

  return <ProfileClient customer={customer} userEmail={user.email} />
}

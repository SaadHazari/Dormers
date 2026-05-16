import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getAllSubscriptions, getRedeemableCredit } from '@/utils/supabase/queries'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import PlanClient from '../plan/PlanClient'

const PREVIEW_CUSTOMER = {
  id: 'preview',
  cid: 'YUG6750',
  name: 'Saad Hazari',
  email: 'preview@dormers.ae',
  whatsapp_number: '+971 50 000 0000',
  dorm_name: 'YUGO',
  meal_preference_type: 'Carnivore',
  allergens: 'None',
  spice_level_preference: 'Medium',
  created_at: '2026-02-01T00:00:00Z',
}

export default async function ExplorePlansPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    return (
      <PlanClient
        customer={PREVIEW_CUSTOMER}
        activeSubscription={null}
        allSubscriptions={[]}
        userEmail={PREVIEW_CUSTOMER.email}
        mode="explore"
      />
    )
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  // Same SSR fetch as /dashboard/plan — the CheckoutPanel on this route
  // also needs the Dorm Wars approved credit balance to render the discount
  // row before submit.
  const supabase = await createClient()
  const [customer, activeSubscription, allSubscriptions, redeemable] = await Promise.all([
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getAllSubscriptions(user.id),
    getRedeemableCredit(supabase, user.id),
  ])
  const creditBalanceAed = redeemable.balanceFils / 100

  return (
    <PlanClient
      customer={customer}
      activeSubscription={activeSubscription}
      allSubscriptions={allSubscriptions}
      userEmail={user.email}
      mode="explore"
      creditBalanceAed={creditBalanceAed}
    />
  )
}

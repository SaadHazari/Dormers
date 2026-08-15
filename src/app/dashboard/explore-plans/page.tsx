import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getAllSubscriptions, getRedeemableCredit } from '@/infra/supabase/subscriptions-repo'
import { fetchActivePriceOverrides } from '@/infra/supabase/pricing-repo'
import { getIntakeState, creditAedFor, hasJoinedIntakeWaitlist } from '@/infra/config/intake'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import PlanClient from '../plan/PlanClient'

const PREVIEW_CUSTOMER = {
  id: 'preview',
  cid: 'YUG6750',
  name: 'Saad Hazari',
  email: 'preview@dormers.ae',
  whatsapp_number: '+971 50 000 0000',
  whatsapp_verified: true,
  dorm_name: 'YUGO',
  meal_preference_type: 'Non Veg',
  allergens: 'None',
  spice_level_preference: 'Medium',
  created_at: '2026-02-01T00:00:00Z',
}

// Skip the Router Cache so creditBalanceAed reflects the latest wallet
// state after checkout. Without this, the CheckoutPanel can show stale
// balance for ~30s post-redirect.
export const dynamic = 'force-dynamic'

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

  // Active staff don't buy public plans — their remuneration funnel (free
  // 5-day / prepaid Saturdays / renewal + approval) lives at /staff/plan.
  // This catches every "Renew" / "Explore plans" CTA across the dashboard.
  {
    const { createAdminSupabaseClient } = await import('@/infra/supabase/admin-client')
    const { data: staffRow } = await createAdminSupabaseClient()
      .from('staff_members')
      .select('id')
      .eq('customer_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (staffRow) redirect('/staff/plan')
  }

  // Same SSR fetch as /dashboard/plan — the CheckoutPanel on this route
  // also needs the Dorm Wars approved credit balance to render the discount
  // row before submit.
  const supabase = await createClient()
  const [customer, activeSubscription, allSubscriptions, redeemable, priceOverrides, intakeState, alreadyOnWaitlist] = await Promise.all([
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getAllSubscriptions(user.id),
    getRedeemableCredit(supabase, user.id),
    // Admin-set price overrides (plan_pricing) — the pricing grid, the
    // checkout sheet, and /api/checkout validation all read the same rows.
    fetchActivePriceOverrides(),
    // Seasonal intake pause — the operator switch that stops new plan
    // purchases between semesters. IntakePausedGate takes precedence over
    // the profile-completion gate in PlanClient.
    getIntakeState(),
    hasJoinedIntakeWaitlist(user.id),
  ])
  const creditBalanceAed = redeemable.balanceFils / 100
  const intake = {
    paused: intakeState.paused,
    headline: intakeState.headline,
    body: intakeState.body,
    creditAed: creditAedFor(intakeState, customer?.meal_preference_type),
    alreadyJoined: alreadyOnWaitlist,
  }

  return (
    <PlanClient
      customer={customer}
      activeSubscription={activeSubscription}
      allSubscriptions={allSubscriptions}
      userEmail={user.email}
      mode="explore"
      creditBalanceAed={creditBalanceAed}
      priceOverrides={priceOverrides}
      intake={intake}
    />
  )
}

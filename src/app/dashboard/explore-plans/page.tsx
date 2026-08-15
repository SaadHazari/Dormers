import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getAllSubscriptions, getCreditSplitByPlan } from '@/infra/supabase/subscriptions-repo'
import { fetchActivePriceOverrides } from '@/infra/supabase/pricing-repo'
import { getIntakeState, creditAedFor, hasJoinedIntakeWaitlist } from '@/infra/config/intake'
import { PLANS, PLAN_KEBAB } from '@/contexts/subscriptions/domain/pricing'
import type { PlanId as KebabPlanId } from '@/contexts/subscriptions/domain/plans'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import PlanClient from '../plan/PlanClient'
import type { CreditByPlan } from '../_shared/types'

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

// Skip the Router Cache so creditByPlan reflects the latest wallet
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

  // Same SSR fetch as /dashboard/plan. The CheckoutPanel and MobileCheckout
  // on THIS route are the ones that actually render (mode='explore' is the
  // only mode where the pricing grid + checkout mount), so this is where the
  // per-plan credit split matters for real. getCreditSplitByPlan does it in
  // ONE query: fetch the approved rows unfiltered, then compute each plan's
  // balance/locked split in memory, never one round trip per plan.
  const supabase = await createClient()
  const [customer, activeSubscription, allSubscriptions, creditSplitByKebab, priceOverrides, intakeState, alreadyOnWaitlist] = await Promise.all([
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getAllSubscriptions(user.id),
    getCreditSplitByPlan(supabase, user.id, PLANS.map(p => PLAN_KEBAB[p.id]) as KebabPlanId[]),
    // Admin-set price overrides (plan_pricing) — the pricing grid, the
    // checkout sheet, and /api/checkout validation all read the same rows.
    fetchActivePriceOverrides(),
    // Seasonal intake pause — the operator switch that stops new plan
    // purchases between semesters. IntakePausedGate takes precedence over
    // the profile-completion gate in PlanClient.
    getIntakeState(),
    hasJoinedIntakeWaitlist(user.id),
  ])
  // Re-key from the kebab plan_id (credit-eligibility's domain) to the
  // display PlanId ('Trial' | 'Weekly Flex' | …) the client components key
  // off of, so CheckoutPanel/MobileCheckout can index straight off `selected`.
  const creditByPlan: CreditByPlan = {}
  for (const p of PLANS) creditByPlan[p.id] = creditSplitByKebab[PLAN_KEBAB[p.id] as KebabPlanId]
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
      creditByPlan={creditByPlan}
      priceOverrides={priceOverrides}
      intake={intake}
    />
  )
}

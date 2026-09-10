import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getAllSubscriptions, getCreditSplitByPlan, getWaitlistStatus } from '@/infra/supabase/subscriptions-repo'
import { fetchActivePriceOverrides } from '@/infra/supabase/pricing-repo'
import { getIntakeState, creditAedFor } from '@/infra/config/intake'
import { PLANS, PLAN_KEBAB } from '@/contexts/subscriptions/domain/pricing'
import type { PlanId as KebabPlanId } from '@/contexts/subscriptions/domain/plans'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import PlanClient from '../plan/PlanClient'
import type { CreditByPlan } from '../_shared/types'
import { firstNameFrom } from '../_shared/intake-join-outcome'
import { buildPlanPreview } from '../_shared/preview-plan'
import ExploreLoading from './loading'

// Skip the Router Cache so creditByPlan reflects the latest wallet
// state after checkout. Without this, the CheckoutPanel can show stale
// balance for ~30s post-redirect.
export const dynamic = 'force-dynamic'

export default async function ExplorePlansPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; state?: string; credit?: string; pref?: string; week?: string; zone?: string; unverified?: string; loading?: string; error?: string }>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    // Same dev-only harness as /dashboard/plan (see _shared/preview-plan.ts),
    // always in explore mode so the sidebar highlights this route.
    if (params.loading === '1') return <ExploreLoading />
    if (params.error === '1') throw new Error('Preview: forced error boundary')
    const fx = buildPlanPreview({ ...params, explore: '1' })
    return (
      <PlanClient
        customer={fx.customer}
        activeSubscription={fx.activeSubscription}
        allSubscriptions={fx.allSubscriptions}
        userEmail={fx.customer.email ?? ''}
        mode="explore"
        creditByPlan={fx.creditByPlan}
        intake={fx.intake}
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
  // Seasonal intake pause — the operator switch that stops new plan
  // purchases between semesters. IntakePausedGate takes precedence over the
  // profile-completion gate in PlanClient. Resolved first (cached 30s, so
  // this is not a new round trip) so its cycleStartedAt can scope the
  // waitlist-join lookup below to the CURRENT pause.
  const intakeState = await getIntakeState()
  const [customer, activeSubscription, allSubscriptions, creditSplitByKebab, priceOverrides, waitlistStatus] = await Promise.all([
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getAllSubscriptions(user.id),
    getCreditSplitByPlan(supabase, user.id, PLANS.map(p => PLAN_KEBAB[p.id]) as KebabPlanId[]),
    // Admin-set price overrides (plan_pricing) — the pricing grid, the
    // checkout sheet, and /api/checkout validation all read the same rows.
    fetchActivePriceOverrides(),
    // Single source of truth for "has this customer joined the waitlist" —
    // shared with the Now-tray entries and the plan-ending banner so the
    // fact can't drift between surfaces. This page only needs `.joined`.
    getWaitlistStatus(supabase, user.id, intakeState.cycleStartedAt),
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
    firstName: firstNameFrom(customer?.name),
    alreadyJoined: waitlistStatus.joined,
    waitlistCreditAed: waitlistStatus.unspentCreditAed,
    cycleStartedAt: intakeState.cycleStartedAt,
    cycleEndedAt: intakeState.cycleEndedAt,
    // Season's last delivery day when a pause is SCHEDULED — this is the
    // route where the pricing grid + checkout actually mount, so it is the
    // taper's primary surface. See plan/page.tsx for the full note.
    lastDeliveryDay: intakeState.pauseScheduledFor,
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

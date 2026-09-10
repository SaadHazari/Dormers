import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getAllSubscriptions, getCreditSplitByPlan, getWaitlistStatus, getApprovedCreditRows } from '@/infra/supabase/subscriptions-repo'
import { fetchActivePriceOverrides } from '@/infra/supabase/pricing-repo'
import { getIntakeState, creditAedFor } from '@/infra/config/intake'
import { PLANS, PLAN_KEBAB } from '@/contexts/subscriptions/domain/pricing'
import type { PlanId as KebabPlanId } from '@/contexts/subscriptions/domain/plans'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import PlanClient from './PlanClient'
import type { CreditByPlan } from '../_shared/types'
import { firstNameFrom } from '../_shared/intake-join-outcome'
import { buildPlanPreview } from '../_shared/preview-plan'
import PlanLoading from './loading'

// Skip the Router Cache so the redeemable-credit prop reflects the latest
// state after checkout completes (credit rows flip from approved → applied
// in the webhook). Without this, the CheckoutPanel may show stale balance.
export const dynamic = 'force-dynamic'

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; explore?: string; credit?: string; state?: string; pref?: string; week?: string; zone?: string; unverified?: string; loading?: string; error?: string }>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    // Dev-only state harness — see _shared/preview-plan.ts for every knob.
    if (params.loading === '1') return <PlanLoading />
    if (params.error === '1') throw new Error('Preview: forced error boundary')
    const fx = buildPlanPreview(params)
    return (
      <Suspense>
        <PlanClient
          customer={fx.customer}
          activeSubscription={fx.activeSubscription}
          allSubscriptions={fx.allSubscriptions}
          userEmail={fx.customer.email ?? ''}
          mode={fx.mode}
          creditByPlan={fx.creditByPlan}
          creditRows={fx.creditRows}
          intake={fx.intake}
        />
      </Suspense>
    )
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  // Server-fetch the customer's approved credit balance, split per selectable
  // plan, so the CheckoutPanel can render "AED X applied" AND explain a
  // credit that does NOT apply to the plan on screen (e.g. the seasonal-
  // pause waitlist credit is monthly-only). getCreditSplitByPlan does this
  // in ONE query: it fetches the approved rows unfiltered, then computes
  // each plan's balance/locked split in memory, rather than one round trip
  // per selectable plan. RLS lets the user read their own rows, so the
  // user-scoped server client is sufficient.
  const supabase = await createClient()
  // Seasonal intake pause — the operator switch that stops new plan
  // purchases between semesters. IntakePausedGate takes precedence over the
  // profile-completion gate in PlanClient. Resolved first (cached 30s, so
  // this is not a new round trip) so its cycleStartedAt can scope the
  // waitlist-join lookup below to the CURRENT pause.
  const intakeState = await getIntakeState()
  const [customer, activeSubscription, allSubscriptions, creditSplitByKebab, priceOverrides, waitlistStatus, creditRows] = await Promise.all([
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getAllSubscriptions(user.id),
    getCreditSplitByPlan(supabase, user.id, PLANS.map(p => PLAN_KEBAB[p.id]) as KebabPlanId[]),
    // Admin-set price overrides (plan_pricing) — same rows /api/checkout
    // validates against, so displayed price === charged price.
    fetchActivePriceOverrides(),
    // Single source of truth for "has this customer joined the waitlist" —
    // shared with the Now-tray entries and the plan-ending banner so the
    // fact can't drift between surfaces. This page only needs `.joined`.
    getWaitlistStatus(supabase, user.id, intakeState.cycleStartedAt),
    // Raw approved rows for the credit row's amount line. cache()-wrapped and
    // already awaited by dashboard/layout.tsx for the sidebar chip in this
    // same request, so this adds no round trip. Deliberately NOT derived from
    // creditSplitByKebab above: creditOutlook owns the "is this universal or
    // plan-restricted" wording, and that rule must have one home.
    getApprovedCreditRows(user.id),
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
    // Season's last delivery day when an operator has SCHEDULED a pause.
    // Drives the sales taper (banner + per-plan availability + clamped date
    // pickers) while the shop is still open. Once the cron flips the switch,
    // `paused` takes over and the taper never renders alongside the gate.
    lastDeliveryDay: intakeState.pauseScheduledFor,
  }

  return (
    <Suspense>
      <PlanClient
        customer={customer}
        activeSubscription={activeSubscription}
        allSubscriptions={allSubscriptions}
        userEmail={user.email}
        creditByPlan={creditByPlan}
        creditRows={creditRows}
        priceOverrides={priceOverrides}
        intake={intake}
      />
    </Suspense>
  )
}

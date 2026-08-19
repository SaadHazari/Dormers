import { createClient } from '@/utils/supabase/server'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCreditSplitByPlan } from '@/infra/supabase/subscriptions-repo'
import { PLANS, PLAN_KEBAB } from '@/contexts/subscriptions/domain/pricing'
import type { PlanId as KebabPlanId } from '@/contexts/subscriptions/domain/plans'
import type { CreditByPlan } from '../_shared/types'
import { redirect } from 'next/navigation'
import CreditClient, { type CreditItem } from './CreditClient'

// Same freshness rule as the plan page: credit rows flip approved → applied
// in the checkout webhook, and this page must never show a stale statement.
export const dynamic = 'force-dynamic'

const PREVIEW_ITEMS: CreditItem[] = [
  { amount_aed: 100, eligible_plan_ids: ['monthly-max', 'monthly-premium'], source: 'intake_waitlist', status: 'approved', created_at: '2026-08-18T10:00:00Z' },
  { amount_aed: 30, eligible_plan_ids: null, source: 'referral_conversion', status: 'approved', created_at: '2026-07-02T10:00:00Z' },
  { amount_aed: 20, eligible_plan_ids: null, source: 'layer4_weekly_review', status: 'approved', created_at: '2026-06-21T10:00:00Z' },
  { amount_aed: 25, eligible_plan_ids: null, source: 'cycle_milestone_6', status: 'applied', created_at: '2026-05-12T10:00:00Z' },
  { amount_aed: 5, eligible_plan_ids: null, source: 'layer4_weekly_review', status: 'applied', created_at: '2026-04-28T10:00:00Z' },
]

const PREVIEW_SPLIT: CreditByPlan = {
  'Trial':           { balanceFils: 5000,  lockedFils: 10000 },
  'Weekly Flex':     { balanceFils: 5000,  lockedFils: 10000 },
  'Monthly Premium': { balanceFils: 15000, lockedFils: 0 },
  'Monthly Max':     { balanceFils: 15000, lockedFils: 0 },
}

export default async function CreditPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; empty?: string }>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    const empty = params.empty === '1'
    return <CreditClient items={empty ? [] : PREVIEW_ITEMS} creditByPlan={empty ? {} : PREVIEW_SPLIT} />
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [itemsResult, creditSplitByKebab] = await Promise.all([
    supabase
      .from('credits')
      .select('amount_aed, eligible_plan_ids, source, status, created_at')
      .eq('customer_id', user.id)
      .in('status', ['approved', 'applied'])
      .order('created_at', { ascending: false })
      .limit(40),
    // The hero's Monthly scenario uses checkout's own per-plan math — the
    // same split the plan cards and checkout render, so the page can never
    // promise an amount checkout will not apply.
    getCreditSplitByPlan(supabase, user.id, PLANS.map(p => PLAN_KEBAB[p.id]) as KebabPlanId[]),
  ])

  const creditByPlan: CreditByPlan = {}
  for (const p of PLANS) creditByPlan[p.id] = creditSplitByKebab[PLAN_KEBAB[p.id] as KebabPlanId]

  return (
    <CreditClient
      items={(itemsResult.data ?? []) as CreditItem[]}
      creditByPlan={creditByPlan}
    />
  )
}

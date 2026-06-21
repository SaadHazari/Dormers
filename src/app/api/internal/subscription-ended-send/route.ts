/**
 * Internal endpoint hit by the subscription-ended cron once per subscription
 * that just transitioned to Ended. Loads the sub + customer, computes the
 * recap values, and fans out WhatsApp + email via
 * runSubscriptionEndedForCustomer.
 *
 * Mirrors the renew-nudge-send route shape.
 *
 * Idempotency: the customer_notifications row inserted by
 * queueCustomerNotification acts as the dedup anchor — the cron's selection
 * SQL excludes any customer with an existing subscription_ended row in the
 * last 7 days.
 *
 * Auth: same shared secret as the other internal routes.
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { cycleSavings, type SubscriptionForSavings, type CustomerForSavings } from '@/contexts/subscriptions/domain/savings'
import { runSubscriptionEndedForCustomer } from '@/contexts/notifications/usecases/subscription-ended-fanout'
import { timingSafeCompare } from '@/shared/crypto'

const RENEW_LINK = 'https://dormers.ae/dashboard/plan?renew=1'

const REWARD_SOURCES = [
  'layer4_google_review',
  'layer4_weekly_review',
  'layer4_monthly_review',
  'daily_drop',
  'referral_conversion',
]

export async function POST(req: Request) {
  const expected = process.env.INTERNAL_RETRY_SECRET
  if (!expected) {
    console.error('❌ INTERNAL_RETRY_SECRET not set; refusing to process subscription-ended')
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!presented || !timingSafeCompare(presented, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { subscription_id?: string }
  try {
    body = (await req.json()) as { subscription_id?: string }
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const subId = body.subscription_id
  if (!subId) return NextResponse.json({ error: 'missing_subscription_id' }, { status: 400 })

  const supabase = createAdminSupabaseClient()

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, customer_id, plan_name, start_date, end_date, delivered_meals, total_meals, week_type, veg_days, status')
    .eq('id', subId)
    .maybeSingle()
  if (!sub) {
    return NextResponse.json({ error: 'subscription_not_found' }, { status: 404 })
  }
  if (sub.status !== 'Ended') {
    return NextResponse.json({ error: 'subscription_not_ended', status: sub.status }, { status: 422 })
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, email, meal_preference_type, takeout_benchmark_aed')
    .eq('id', sub.customer_id)
    .maybeSingle()
  if (!customer?.email) {
    return NextResponse.json(
      { error: 'customer_missing_email', subscription_id: subId },
      { status: 422 },
    )
  }

  const firstName = (customer.name ?? '').trim().split(/\s+/)[0] || 'there'

  const savings = cycleSavings(
    sub as SubscriptionForSavings,
    customer as CustomerForSavings,
  )
  const evenings = savings?.evenings ?? (sub.delivered_meals ?? 0)
  const aedSaved = savings?.saved ?? null

  const { data: credits } = await supabase
    .from('credits')
    .select('amount_aed')
    .eq('customer_id', customer.id)
    .eq('status', 'approved')
    .in('source', REWARD_SOURCES)
    .gte('created_at', sub.start_date)
    .lte('created_at', `${sub.end_date}T23:59:59Z`)
  const aedEarned = (credits ?? []).reduce(
    (sum, row) => sum + Number(row.amount_aed ?? 0),
    0,
  )

  const result = await runSubscriptionEndedForCustomer({
    customerId: customer.id,
    toEmail: customer.email,
    firstName,
    planName: sub.plan_name ?? 'Plan',
    mealsDelivered: sub.delivered_meals ?? 0,
    evenings,
    aedSaved,
    aedEarned: Math.round(aedEarned),
    renewLink: RENEW_LINK,
  })

  return NextResponse.json({ ok: true, subscription_id: subId, result })
}

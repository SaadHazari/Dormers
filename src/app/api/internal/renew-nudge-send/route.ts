/**
 * Internal endpoint hit by the renewal-nudge cron once per eligible
 * subscription. Loads the sub + customer, computes the recap values
 * (meals delivered, evenings, AED saved, AED earned), and fans out the
 * WhatsApp + email nudge via runRenewNudgeForCustomer.
 *
 * Idempotency: runRenewNudgeForCustomer inserts the customer_notifications
 * row BEFORE sending email. The cron's selection SQL excludes any
 * customer with an existing subscription_renew_nudge row in the last 7
 * days, so a successful WhatsApp insert anchors "we nudged this customer
 * already" — subsequent cron ticks skip them automatically.
 *
 * Auth: same shared secret as the post-payment retry route.
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { cycleSavings, type SubscriptionForSavings, type CustomerForSavings } from '@/contexts/subscriptions/domain/savings'
import { runRenewNudgeForCustomer } from '@/contexts/notifications/usecases/renew-nudge-fanout'
import { getIntakeState } from '@/infra/config/intake'
import { timingSafeCompare } from '@/shared/crypto'

const RENEW_LINK = 'https://dormers.ae/dashboard/plan?renew=1'

// Credit sources that count as "earned in rewards" for the recap. Excludes
// phase7_demo_* + test_* dev artifacts.
const REWARD_SOURCES = [
  'layer4_google_review',
  'layer4_weekly_review',
  'layer4_monthly_review',
  'daily_drop',
  'referral_conversion',
]

// Phase 8 (L7): bound wall-clock so a slow send fails fast in our control
// instead of being truncated at the platform's ~10s default.
export const maxDuration = 15

export async function POST(req: Request) {
  const expected = process.env.INTERNAL_RETRY_SECRET
  if (!expected) {
    console.error('❌ INTERNAL_RETRY_SECRET not set; refusing to process renew-nudge')
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

  // Seasonal pause: this nudge's whole payload is "renew now", and renewal
  // checkout refuses the customer while intake is paused. Nudging them at a
  // door we have locked is worse than staying quiet, so drop it entirely.
  //
  // Deliberately NO notification row here, unlike the ended fan-out's
  // skipped:intake_paused. A nudge is a moment, not a milestone: if the pause
  // lifts while the plan is still inside its T-3 window, the next tick should
  // be free to nudge for real, and a dedup row would have swallowed it.
  //
  // dispatch_renew_nudges_tick carries the same guard so the fleet of POSTs is
  // never fired in the first place. This check is the one that ships with the
  // deploy, and the backstop if that function is ever restored from the stale
  // repo migration. getIntakeState fails open — a settings-read problem
  // resolves to "not paused" and the nudge goes out as normal.
  const intakeState = await getIntakeState()
  if (intakeState.paused) {
    return NextResponse.json({ ok: true, subscription_id: subId, skipped: 'intake_paused' })
  }

  const supabase = createAdminSupabaseClient()

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, customer_id, plan_name, start_date, end_date, delivered_meals, total_meals, week_type, veg_days, status')
    .eq('id', subId)
    .maybeSingle()
  if (!sub) {
    return NextResponse.json({ error: 'subscription_not_found' }, { status: 404 })
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

  // Cycle savings handles the per-meal cost lookup + Monthly-Max evenings
  // math, and self-protects against unknown plan names by returning null.
  const savings = cycleSavings(
    sub as SubscriptionForSavings,
    customer as CustomerForSavings,
  )
  // When savings is null (unknown plan OR no benchmark set):
  //   • evenings fall back to delivered_meals (1 meal == 1 evening for non-Max
  //     plans; we accept the slight over-count on Monthly Max if the plan
  //     can't be resolved — the recap still reads honestly)
  //   • aedSaved becomes null → email helper hides the bullet
  const evenings = savings?.evenings ?? (sub.delivered_meals ?? 0)
  const aedSaved = savings?.saved ?? null

  // AED earned this cycle = approved reward credits created during the
  // subscription's window. Excludes pending/rejected and dev/test sources.
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

  const result = await runRenewNudgeForCustomer({
    customerId: customer.id,
    toEmail: customer.email,
    firstName,
    planName: sub.plan_name ?? 'Plan',
    endDateIso: sub.end_date,
    mealsDelivered: sub.delivered_meals ?? 0,
    evenings,
    aedSaved,
    aedEarned: Math.round(aedEarned),
    renewLink: RENEW_LINK,
  })

  return NextResponse.json({ ok: true, subscription_id: subId, result })
}

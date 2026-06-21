/**
 * Internal endpoint hit by the hourly retry cron to re-attempt failed
 * post-payment fan-out channels for a given order. Idempotent end-to-end:
 * runPostPaymentFanout reads each channel's marker before sending, so this
 * route can be hit repeatedly without re-sending channels that already
 * succeeded.
 *
 * Auth: shared secret in Authorization header. The cron reads the secret
 * from Supabase vault and passes it via pg_net. Not behind Supabase Auth
 * because pg_cron has no user context.
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { runPostPaymentFanout } from '@/contexts/payments/usecases/post-payment-fanout'
import { timingSafeCompare } from '@/shared/crypto'

export async function POST(req: Request) {
  const expected = process.env.INTERNAL_RETRY_SECRET
  if (!expected) {
    console.error('❌ INTERNAL_RETRY_SECRET not set; refusing to process retry')
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!presented || !timingSafeCompare(presented, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { order_id?: string }
  try {
    body = (await req.json()) as { order_id?: string }
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const orderId = body.order_id
  if (!orderId) return NextResponse.json({ error: 'missing_order_id' }, { status: 400 })

  const supabase = createAdminSupabaseClient()

  const { data: order } = await supabase
    .from('orders')
    .select(
      'id, customer_id, subscription_id, plan, meals_count, price_per_meal, stripe_session_id, stripe_payment_id, created_at, payment_date',
    )
    .eq('id', orderId)
    .maybeSingle()
  if (!order) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  }

  const [customerRes, subRes] = await Promise.all([
    supabase
      .from('customers')
      .select('name, email, whatsapp_number, cid')
      .eq('id', order.customer_id)
      .maybeSingle(),
    order.subscription_id
      ? supabase
          .from('subscriptions')
          .select('start_date, plan_name, total_meals')
          .eq('id', order.subscription_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const customer = customerRes.data
  const sub = subRes.data
  if (!customer?.email) {
    return NextResponse.json(
      { error: 'customer_missing_email', order_id: orderId },
      { status: 422 },
    )
  }

  const amountTotalAed =
    Number(order.price_per_meal ?? 0) * Number(order.meals_count ?? 0)
  const paymentDateIso =
    (order.payment_date ?? order.created_at ?? new Date().toISOString()).slice(0, 10)
  const startDateIso = (sub?.start_date ?? order.created_at).slice(0, 10)

  await runPostPaymentFanout({
    supabase,
    orderId: order.id,
    customerId: order.customer_id,
    customerCid: (customer as { cid?: string }).cid ?? '',
    customerName: customer.name ?? '',
    customerEmail: customer.email,
    customerPhone: customer.whatsapp_number ?? '',
    planName: sub?.plan_name ?? order.plan ?? 'Dormers Plan',
    mealsCount: Number(sub?.total_meals ?? order.meals_count ?? 0),
    pricePerMeal: Number(order.price_per_meal ?? 0),
    amountTotalAed,
    startDateIso,
    sessionId: order.stripe_session_id ?? '',
    paymentIntentId: order.stripe_payment_id ?? '',
    paymentDateIso,
  })

  return NextResponse.json({ ok: true, order_id: orderId })
}

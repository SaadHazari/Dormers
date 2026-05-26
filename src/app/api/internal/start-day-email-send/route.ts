/**
 * Internal endpoint hit by the 9 AM AE cron to send the day-1 "Today's
 * the day" email for a specific subscription that starts today. Idempotent
 * via `subscriptions.start_email_sent_at` — re-invocations on a sub that
 * already received the email return 200 and no-op.
 *
 * Auth: same shared secret as the post-payment retry route.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendStartDayEmail } from '@/lib/email/zeptomail-client'

export async function POST(req: Request) {
  const expected = process.env.INTERNAL_RETRY_SECRET
  if (!expected) {
    console.error('❌ INTERNAL_RETRY_SECRET not set; refusing to process start-day email')
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (presented !== expected) {
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, customer_id, start_email_sent_at')
    .eq('id', subId)
    .maybeSingle()
  if (!sub) {
    return NextResponse.json({ error: 'subscription_not_found' }, { status: 404 })
  }
  if (sub.start_email_sent_at) {
    return NextResponse.json({ ok: true, skipped: 'already_sent' })
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('name, email, dorm_name')
    .eq('id', sub.customer_id)
    .maybeSingle()
  if (!customer?.email) {
    return NextResponse.json(
      { error: 'customer_missing_email', subscription_id: subId },
      { status: 422 },
    )
  }

  const firstName =
    (customer.name ?? '').trim().split(/\s+/)[0] || 'there'

  await sendStartDayEmail({
    toEmail: customer.email,
    firstName,
    dormName: customer.dorm_name,
  })

  const { error: markErr } = await supabase
    .from('subscriptions')
    .update({ start_email_sent_at: new Date().toISOString() })
    .eq('id', subId)
  if (markErr) {
    console.error('⚠️  failed to mark start_email_sent_at:', markErr)
  }

  return NextResponse.json({ ok: true, subscription_id: subId })
}

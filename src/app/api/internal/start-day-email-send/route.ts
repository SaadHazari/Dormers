/**
 * Internal endpoint hit by the 9 AM AE cron to send the day-1 "Today's
 * the day" email for a specific subscription that starts today. Idempotent
 * via `subscriptions.start_email_sent_at` — re-invocations on a sub that
 * already received the email return 200 and no-op.
 *
 * Auth: same shared secret as the post-payment retry route.
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { sendStartDayEmail } from '@/infra/zeptomail/client'
import { timingSafeCompare } from '@/shared/crypto'
import { notifyAdmin } from '@/infra/admin-alerts/notify'

// Phase 8 (L7): bound wall-clock so a slow send fails fast in our control
// instead of being truncated at the platform's ~10s default.
export const maxDuration = 15

export async function POST(req: Request) {
  const expected = process.env.INTERNAL_RETRY_SECRET
  if (!expected) {
    console.error('❌ INTERNAL_RETRY_SECRET not set; refusing to process start-day email')
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

  try {
    await sendStartDayEmail({
      toEmail: customer.email,
      firstName,
      dormName: customer.dorm_name,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('❌ start-day email failed:', msg)
    void notifyAdmin(
      `Start-day email FAILED for subscription ${subId} (${customer.email}). ` +
      `Customer won't receive their "Today's the day" welcome. Error: ${msg}`,
      subId.slice(0, 18),
    )
    return NextResponse.json({ error: 'email_send_failed', subscription_id: subId }, { status: 502 })
  }

  const { error: markErr } = await supabase
    .from('subscriptions')
    .update({ start_email_sent_at: new Date().toISOString() })
    .eq('id', subId)
  if (markErr) {
    console.error('⚠️  failed to mark start_email_sent_at:', markErr)
  }

  return NextResponse.json({ ok: true, subscription_id: subId })
}

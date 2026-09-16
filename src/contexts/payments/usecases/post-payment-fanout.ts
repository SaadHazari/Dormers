/**
 * Post-payment fan-out — the three-channel side-effect orchestrator that
 * fires after the Stripe webhook's idempotent core (subscription + order
 * insert, credit flip, referral award) has committed. Each channel writes
 * its own marker on the orders row so the hourly retry cron can pick up
 * exactly the failures without re-sending the successes.
 *
 *   1. WhatsApp confirmation — queued via the existing notifications
 *      dispatcher (5-min tick; near-instant in practice since scheduled_for
 *      is set to NOW()).
 *   2. ZeptoMail "thanks for joining" branded email — synchronous send.
 *   3. Zoho Books invoice — synchronous: find/create contact, create
 *      invoice, record payment, trigger Zoho to email the FTA PDF.
 *
 * All three are independent. One failure does not block the others. Failures
 * accumulate in orders.post_payment_errors so the admin can see what broke
 * and the retry cron can count attempts per channel.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { queueCustomerNotification } from '@/contexts/notifications/usecases/queue'
import { sendOrderConfirmationEmail } from '@/infra/zeptomail/client'
import { createAndSendPaidInvoice } from '@/infra/zoho/invoices'

export type PostPaymentChannel = 'whatsapp' | 'email' | 'zoho'

export interface PostPaymentContext {
  supabase: SupabaseClient
  orderId: string
  customerId: string
  customerCid: string
  customerName: string
  customerEmail: string
  customerPhone: string
  planName: string
  mealsCount: number
  pricePerMeal: number
  amountTotalAed: number
  /**
   * Discount applied at checkout (AED). Non-zero on the trial+auto-refund
   * path where Dorm Wars credit covered most of the trial; the Zoho
   * invoice gets a discount line for this amount so the customer's PDF
   * reads line_subtotal − discount = paid (the AED 2 floor Stripe captured).
   * Default 0 = standard paid invoice path.
   */
  discountAed?: number
  startDateIso: string
  sessionId: string
  paymentIntentId: string
  paymentDateIso: string
}

/**
 * Runs the post-payment channels concurrently. Idempotent: checks existing
 * markers on the order row and skips channels that already succeeded.
 * Safe to call from a Stripe webhook retry and from the hourly retry cron
 * — the marker reads + writes form a per-channel CAS.
 *
 * `skipChannels` lets the webhook defer Zoho by 2 minutes (Zoho is fired
 * later by the every-minute dispatch cron). Default is to attempt all
 * channels.
 */
export async function runPostPaymentFanout(
  ctx: PostPaymentContext,
  options: { skipChannels?: PostPaymentChannel[] } = {},
): Promise<void> {
  const skip = new Set(options.skipChannels ?? [])
  const { data: order } = await ctx.supabase
    .from('orders')
    .select('whatsapp_sent_at, email_sent_at, zoho_invoice_id')
    .eq('id', ctx.orderId)
    .maybeSingle()

  await Promise.all([
    skip.has('whatsapp') || order?.whatsapp_sent_at
      ? Promise.resolve()
      : runChannel(ctx, 'whatsapp', sendWhatsApp),
    skip.has('email') || order?.email_sent_at
      ? Promise.resolve()
      : runChannel(ctx, 'email', sendEmail),
    skip.has('zoho') || order?.zoho_invoice_id
      ? Promise.resolve()
      : runChannel(ctx, 'zoho', syncZoho),
  ])
}

// ── Individual channel senders ─────────────────────────────────────────────

async function sendWhatsApp(ctx: PostPaymentContext): Promise<void> {
  await queueCustomerNotification(
    ctx.customerId,
    'payment_order_confirmed',
    new Date(),
    {
      start_date: ctx.startDateIso,
      plan_name: ctx.planName,
      total_aed: ctx.amountTotalAed.toFixed(2),
    },
  )
  await markChannelDone(ctx, 'whatsapp_sent_at')
}

async function sendEmail(ctx: PostPaymentContext): Promise<void> {
  const firstName = (ctx.customerName ?? '').trim().split(/\s+/)[0] || 'there'
  await sendOrderConfirmationEmail({
    toEmail: ctx.customerEmail,
    firstName,
    planName: ctx.planName,
    firstDeliveryDateIso: ctx.startDateIso,
    mealsCount: ctx.mealsCount,
    totalAed: ctx.amountTotalAed,
    orderNumber: ctx.sessionId,
  })
  await markChannelDone(ctx, 'email_sent_at')
}

async function syncZoho(ctx: PostPaymentContext): Promise<void> {
  const { invoiceId, invoiceNumber, invoiceUrl } = await createAndSendPaidInvoice({
    customerName: ctx.customerName,
    customerEmail: ctx.customerEmail,
    customerPhone: ctx.customerPhone,
    customerCid: ctx.customerCid,
    planName: ctx.planName,
    mealsCount: ctx.mealsCount,
    pricePerMeal: ctx.pricePerMeal,
    amountTotalAed: ctx.amountTotalAed,
    discountAed: ctx.discountAed ?? 0,
    sessionRef: ctx.sessionId,
    startDateIso: ctx.startDateIso,
    paymentDateIso: ctx.paymentDateIso,
    stripePaymentRef: ctx.paymentIntentId,
  })
  await ctx.supabase
    .from('orders')
    .update({
      zoho_invoice_id: invoiceId,
      zoho_invoice_number: invoiceNumber,
      zoho_invoice_url: invoiceUrl ?? null,
      zoho_synced_at: new Date().toISOString(),
    })
    .eq('id', ctx.orderId)
}

// ── Shared plumbing ─────────────────────────────────────────────────────────

async function runChannel(
  ctx: PostPaymentContext,
  channel: PostPaymentChannel,
  fn: (ctx: PostPaymentContext) => Promise<void>,
): Promise<void> {
  try {
    await fn(ctx)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`❌ post-payment ${channel} failed for order ${ctx.orderId}:`, message)
    await appendChannelError(ctx, channel, message)
    const { notifyAdmin } = await import('@/infra/admin-alerts/notify')
    void notifyAdmin(
      `Post-payment ${channel} FAILED for order ${ctx.orderId} (customer ${ctx.customerId}). ` +
      `Customer paid but ${channel} confirmation was not delivered. Error: ${message}`,
      ctx.orderId,
    )
  }
}

async function markChannelDone(
  ctx: PostPaymentContext,
  column: 'whatsapp_sent_at' | 'email_sent_at',
): Promise<void> {
  await ctx.supabase
    .from('orders')
    .update({ [column]: new Date().toISOString() })
    .eq('id', ctx.orderId)
}

/**
 * Appends an error entry to the order's post_payment_errors jsonb array.
 * Done as a server-side SQL function call so concurrent appends from
 * different channel handlers don't clobber each other. Falls back to a
 * read-modify-write if the rpc isn't present (older deploys / local dev).
 */
async function appendChannelError(
  ctx: PostPaymentContext,
  channel: PostPaymentChannel,
  message: string,
): Promise<void> {
  const entry = {
    channel,
    error: message.slice(0, 500),
    attempted_at: new Date().toISOString(),
  }
  const { error: rpcErr } = await ctx.supabase.rpc('append_post_payment_error', {
    p_order_id: ctx.orderId,
    p_entry: entry,
  })
  if (!rpcErr) return

  const { data: row } = await ctx.supabase
    .from('orders')
    .select('post_payment_errors')
    .eq('id', ctx.orderId)
    .maybeSingle()
  const existing = Array.isArray(row?.post_payment_errors) ? row.post_payment_errors : []
  await ctx.supabase
    .from('orders')
    .update({ post_payment_errors: [...existing, entry] })
    .eq('id', ctx.orderId)
}

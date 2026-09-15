/**
 * Backfills orders.amount_paid_fils and orders.credit_applied_fils for orders
 * tied to live plans (season spec §10.1, D7), so a season skip credit is worth
 * what the customer paid for the meal.
 *
 *   npm run backfill:order-money              dry run: prints what it would write
 *   npm run backfill:order-money -- --write   writes the two columns where still null
 *
 * Stripe runs in test mode for the pilot and test payments are not money
 * (decided 2026-09-15): cs_test_ orders and card orders without Stripe ids are
 * listed as unresolvable and left null, so their plans use the 90% fallback.
 *
 * Live-mode orders need a live key, read ONLY from STRIPE_LIVE_SECRET_KEY in
 * the process environment, never from .env.local, never printed, never
 * written. For example:
 *   STRIPE_LIVE_SECRET_KEY="$(netlify env:get STRIPE_SECRET_KEY --context production)" npm run backfill:order-money
 * npm run loads .env.local for the Supabase credentials (--env-file), so the
 * script refuses to run while .env.local defines STRIPE_LIVE_SECRET_KEY. A
 * Stripe failure is reported by its type and code only.
 *
 * Read-only against Stripe. Credit used is counted by loadCreditUsedFils, the
 * same reader the webhook and free checkout use.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { stripeClient, type Stripe } from '../src/infra/stripe/client'
import { loadCreditUsedFils } from '../src/infra/supabase/credit-usage-repo'
import {
  planOrderBackfill, creditOnlyMoney, stripeOrderMoney, redemptionFromMetadata, isLiveStripeKey,
  envFileDefinesLiveKey, stripeErrorSummary, type OrderMoneyColumns,
} from '../src/contexts/payments/domain/order-money'

// Refuse before anything else: a live key in .env.local would arrive through
// --env-file without anyone passing it. Only the variable name is checked.
const ENV_FILE = resolve(process.cwd(), '.env.local')
if (envFileDefinesLiveKey(existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf-8') : null)) {
  console.error('.env.local defines STRIPE_LIVE_SECRET_KEY. Delete that line and pass the key in the process environment only. Nothing was changed.')
  process.exit(1)
}

const WRITE = process.argv.includes('--write')
const LIVE_STATUSES = ['Active', 'Paused', 'Skipped', 'Scheduled']
const NO_ID = '00000000-0000-0000-0000-000000000000'
const HOUR_MS = 60 * 60 * 1000

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Nothing was changed.')
  process.exit(1)
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

type OrderRow = {
  id: string
  subscription_id: string | null
  customer_id: string
  payment_method: string | null
  stripe_session_id: string | null
  stripe_payment_id: string | null
  amount_paid_fils: number | null
  credit_applied_fils: number | null
  created_at: string
}

type ReportRow = { order: string | null; plan: string; status: string; result: string; detail: string }

async function liveStripeMoney(stripe: Stripe, order: OrderRow, sessionId: string | null, paymentIntentId: string | null): Promise<OrderMoneyColumns | { unresolvable: string }> {
  let session: Stripe.Checkout.Session | null = null
  let intent: Stripe.PaymentIntent | null = null
  try {
    session = sessionId
      ? await stripe.checkout.sessions.retrieve(sessionId)
      : paymentIntentId
        ? (await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 })).data[0] ?? null
        : null
    const sessionIntent = session?.payment_intent
    const intentId = paymentIntentId ?? (typeof sessionIntent === 'string' ? sessionIntent : sessionIntent?.id ?? null)
    intent = intentId ? await stripe.paymentIntents.retrieve(intentId) : null
  } catch (err) {
    // Type and code only: Stripe's invalid-key message repeats part of the key.
    return { unresolvable: stripeErrorSummary(err) }
  }

  const redemption = redemptionFromMetadata(session?.metadata ?? null)
  const creditUsed = redemption.hasCreditMetadata
    ? await loadCreditUsedFils(sb, { fullRowIds: redemption.fullRowIds, splitUseFils: redemption.splitUseFils })
    : null
  const { count, error: countErr } = await sb.from('credits').select('id', { count: 'exact', head: true }).eq('applied_to', order.id)
  if (countErr) return { unresolvable: `credit read failed: ${countErr.message}` }

  return stripeOrderMoney({
    amountReceivedFils: intent?.amount_received ?? null,
    sessionAmountTotalFils: session?.amount_total ?? null,
    hasCreditMetadata: redemption.hasCreditMetadata,
    creditUsedFils: creditUsed,
    creditsAppliedToOrder: count ?? 0,
  })
}

async function creditOnly(order: OrderRow): Promise<OrderMoneyColumns | { unresolvable: string }> {
  const applied = await sb.from('credits').select('id').eq('applied_to', order.id)
  if (applied.error) return { unresolvable: `credit read failed: ${applied.error.message}` }
  const at = Date.parse(order.created_at)
  const remainders = await sb.from('credits').select('id')
    .eq('customer_id', order.customer_id)
    .like('source', '%_split_remainder')
    .gte('created_at', new Date(at - HOUR_MS).toISOString())
    .lte('created_at', new Date(at + HOUR_MS).toISOString())
  if (remainders.error) return { unresolvable: `credit read failed: ${remainders.error.message}` }
  const splitRemainderNearby = (remainders.data ?? []).length > 0
  const creditUsed = splitRemainderNearby
    ? null
    : await loadCreditUsedFils(sb, { fullRowIds: (applied.data ?? []).map((r) => r.id as string), splitUseFils: null })
  const money = creditOnlyMoney({ creditUsedFils: creditUsed, splitRemainderNearby })
  if (money) return money
  return {
    unresolvable: splitRemainderNearby
      ? 'a split credit hides how much of it this order used'
      : 'the credit rows this order used could not be read',
  }
}

async function main() {
  const subs = await sb.from('subscriptions').select('id, plan_name, status').in('status', LIVE_STATUSES)
  if (subs.error) throw new Error(`plans read failed: ${subs.error.message}`)
  const plans = subs.data ?? []
  const orders = await sb.from('orders')
    .select('id, subscription_id, customer_id, payment_method, stripe_session_id, stripe_payment_id, amount_paid_fils, credit_applied_fils, created_at')
    .in('subscription_id', plans.length ? plans.map((p) => p.id) : [NO_ID])
  if (orders.error) throw new Error(`orders read failed: ${orders.error.message}`)
  const rows = (orders.data ?? []) as OrderRow[]

  const planned = rows.map((order) => ({
    order,
    plan: planOrderBackfill({
      paymentMethod: order.payment_method,
      stripeSessionId: order.stripe_session_id,
      stripePaymentId: order.stripe_payment_id,
      amountPaidFils: order.amount_paid_fils,
      creditAppliedFils: order.credit_applied_fils,
    }),
  }))

  let stripe: Stripe | null = null
  if (planned.some((p) => p.plan.kind === 'stripe_live')) {
    const liveKey = process.env.STRIPE_LIVE_SECRET_KEY
    if (!isLiveStripeKey(liveKey)) {
      console.error('Live-mode orders need a live Stripe key in STRIPE_LIVE_SECRET_KEY (process environment only). Nothing was changed.')
      process.exit(1)
    }
    process.env.STRIPE_SECRET_KEY = liveKey
    stripe = stripeClient()
  }

  const report: ReportRow[] = []
  let written = 0
  for (const { order, plan } of planned) {
    const owner = plans.find((p) => p.id === order.subscription_id)
    const base = { order: order.id.slice(0, 8), plan: owner?.plan_name ?? '?', status: owner?.status ?? '?' }
    if (plan.kind === 'skip' || plan.kind === 'unresolvable') {
      report.push({ ...base, result: plan.kind, detail: plan.reason })
      continue
    }
    const money = plan.kind === 'credit_only'
      ? await creditOnly(order)
      : await liveStripeMoney(stripe as Stripe, order, plan.sessionId, plan.paymentIntentId)
    if ('unresolvable' in money) {
      report.push({ ...base, result: 'unresolvable', detail: money.unresolvable })
      continue
    }
    if (WRITE) {
      const { error, count } = await sb.from('orders').update(money, { count: 'exact' }).eq('id', order.id).is('amount_paid_fils', null)
      if (error) {
        report.push({ ...base, result: 'write failed', detail: error.message })
        continue
      }
      if (count === 1) {
        written++
      } else {
        report.push({ ...base, result: 'skipped', detail: 'already recorded' })
        continue
      }
    }
    report.push({ ...base, result: WRITE ? 'written' : 'would write', detail: `card ${money.amount_paid_fils} fils, credit ${money.credit_applied_fils} fils` })
  }
  for (const p of plans) {
    if (!rows.some((o) => o.subscription_id === p.id)) {
      report.push({ order: null, plan: p.plan_name, status: p.status, result: 'no order', detail: 'not paid in cash: skip credit is 0' })
    }
  }

  console.log(JSON.stringify({ mode: WRITE ? 'write' : 'dry-run', stripeLookups: stripe ? 'live' : 'none', written, rows: report }, null, 2))
}

main().catch((err) => {
  // A Stripe failure is reduced to its type and code: its message can repeat part of the key.
  const fromStripe = typeof (err as { type?: unknown } | null)?.type === 'string'
  console.error(fromStripe ? stripeErrorSummary(err) : err instanceof Error ? err.message : String(err))
  process.exit(1)
})

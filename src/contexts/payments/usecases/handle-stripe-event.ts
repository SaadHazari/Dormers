/**
 * Payments context — Stripe webhook event handler.
 *
 * Extracted from src/app/api/webhook/route.ts in Improvement #3. The route
 * handler is now a thin controller that verifies the signature, parses the
 * event, and delegates the entire orchestration here.
 *
 * Public surface: one function — handleStripeEvent(event). It dispatches by
 * event.type to internal handlers, each of which owns the full idempotent
 * processing for that event family.
 *
 * Currently dispatches:
 *   • checkout.session.completed → handleCheckoutCompleted
 *   • charge.refunded            → handleChargeRefunded
 *
 * Returns a discriminated HandleResult so the route can shape HTTP responses
 * uniformly. Throws propagate up to the route's try/catch → 500.
 */

import * as Sentry from '@sentry/nextjs'
import type { Stripe } from '@/infra/stripe/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { resolvePlan, totalMealsFor, planKindOf } from '@/contexts/subscriptions/domain/plans'
import { creditInviterOnConversion } from '@/app/r/[cid]/actions'
import { getActiveLifetimeTierPercent } from '@/infra/supabase/dorm-wars-repo'
import {
  SUBSCRIPTION_STATUS,
  LIVE_SUBSCRIPTION_STATUSES,
  INVOICE_STATUS,
} from '@/contexts/subscriptions/domain/subscription-status'
import { computeEndDate, isoDate, type WeekType } from '@/contexts/subscriptions/domain/end-date'
import { runPostPaymentFanout } from '@/contexts/payments/usecases/post-payment-fanout'
import { notifyAdmin } from '@/infra/admin-alerts/notify'

export type HandleResult =
  | { ok: true; deduped?: boolean; refundHandled?: boolean; restored?: number }
  | { ok: false; status: number; error: string }

/**
 * Top-level Stripe event dispatcher. Owns the admin Supabase client lifecycle.
 * Returns a HandleResult; the route translates to an HTTP response. Unknown
 * event types are treated as no-ops (return ok:true so Stripe doesn't retry).
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<HandleResult> {
  const supabaseAdmin = createAdminSupabaseClient()

  if (event.type === 'checkout.session.completed') {
    return handleCheckoutCompleted(event, supabaseAdmin)
  }
  if (event.type === 'charge.refunded') {
    return handleChargeRefunded(event, supabaseAdmin)
  }
  if (event.type === 'payment_intent.payment_failed') {
    return handlePaymentFailed(event)
  }
  if (event.type === 'charge.dispute.created') {
    return handleDisputeCreated(event, supabaseAdmin)
  }
  if (event.type === 'checkout.session.expired') {
    return handleCheckoutExpired(event)
  }
  // Unknown event type — acknowledge so Stripe doesn't retry.
  return { ok: true }
}

// ── checkout.session.completed handler ────────────────────────────────────

async function handleCheckoutCompleted(
  event: Stripe.Event,
  supabaseAdmin: SupabaseClient,
): Promise<HandleResult> {
  const session = event.data.object as Stripe.Checkout.Session

  const metadata = session.metadata || {}
  const { user_id, plan, preference, location, vegDays, name, phone, start_date } = metadata

  if (!user_id) {
    console.error('❌ Webhook Error: No user_id in metadata')
    return { ok: false, status: 400, error: 'Missing user_id' }
  }

  // Idempotency with checkpointing (fixes audit P0-2). Stripe retries
  // on 5xx / timeout. We distinguish:
  //   1. webhook_completed_at IS NOT NULL → fully processed, skip all
  //   2. webhook_completed_at IS NULL     → order saved but downstream
  //      may have failed (credit flip, awarder, etc.). Skip the
  //      non-idempotent parts (subscription/order insert + customer
  //      patch) and resume the idempotent downstream steps from below.
  const { data: existingOrder } = await supabaseAdmin
    .from('orders')
    .select('id, subscription_id, webhook_completed_at')
    .eq('stripe_session_id', session.id)
    .maybeSingle()

  if (existingOrder?.webhook_completed_at) {
    console.log(`⏭️  Duplicate webhook for session ${session.id} — fully processed before, skipping`)
    return { ok: true, deduped: true }
  }
  const resumeMode = Boolean(existingOrder) // truthy when order exists but webhook_completed_at is null

  // Resolve the plan from the metadata. Unknown plans fall back to trial.
  const planDef = resolvePlan(plan) ?? resolvePlan('Trial')
  if (!planDef) {
    console.error('❌ Webhook Error: cannot resolve any plan')
    return { ok: false, status: 400, error: 'Unknown plan' }
  }
  const plan_name = planDef.label
  const meals_per_day = planDef.mealsPerDay

  // Snapshot the customer's week_type — once persisted on the sub, future
  // changes to customer.week_type won't retroactively rewrite this row's
  // delivery cadence or end_date math. We also fetch pending_* columns
  // so we can prefer pending values over current when the customer has
  // queued a change ("apply from next subscription"). Pending wins
  // because this IS the next subscription being created.
  const { data: customerRow } = await supabaseAdmin
    .from('customers')
    .select('cid, name, week_type, meal_preference_type, allergens, spice_level_preference, veg_days, pending_meal_preference_type, pending_week_type, pending_allergens, pending_spice_level_preference, pending_veg_days')
    .eq('id', user_id)
    .maybeSingle()
  const effectiveWeekTypeRaw =
    customerRow?.pending_week_type ?? customerRow?.week_type
  const weekType: WeekType =
    effectiveWeekTypeRaw === '5DAYS' ? '5DAYS' : '6DAYS'

  // Total meal count for this (plan, week_type). For 5DAYS plans this
  // is lower than the 6DAYS default (e.g., Monthly Premium 5DAYS = 20).
  const total_meals = totalMealsFor(planDef.id, weekType)

  // ── Determine start_date by queuing after the latest live tail ─────
  // Per state-machine spec: max 1 (Active|Paused|Skipped) + 1 Scheduled.
  // If any live sub exists, the new sub queues behind the latest one.
  // If nothing live, honour the user-picked start_date (or default today).
  const { data: liveSubs } = await supabaseAdmin
    .from('subscriptions')
    .select('id, end_date, status')
    .eq('customer_id', user_id)
    .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED])
    .order('end_date', { ascending: false })

  const tail = liveSubs?.[0]
  const todayMidnightUtc = new Date(); todayMidnightUtc.setUTCHours(0, 0, 0, 0)

  let startDate: Date
  if (tail) {
    // Queue: start the day after tail.end_date, shifted to next delivery day
    const dayAfter = new Date(tail.end_date + 'T00:00:00Z')
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1)
    startDate = nextDeliveryDay(dayAfter, weekType)
    if (start_date) {
      console.warn(`⚠️  User ${user_id} picked start_date ${start_date} but live sub ${tail.id} forces queue-after; using ${isoDate(startDate)}`)
    }
  } else {
    // No live sub — use user pick (date-picker-validated upstream) or today
    startDate = start_date ? new Date(start_date + 'T00:00:00Z') : new Date(todayMidnightUtc)
    if (isNaN(startDate.getTime())) startDate = new Date(todayMidnightUtc)
    // Shift to next delivery day in case of edge cases (e.g. trial picks a Sunday)
    startDate = nextDeliveryDay(startDate, weekType)
  }

  const status = startDate.getTime() > todayMidnightUtc.getTime()
    ? SUBSCRIPTION_STATUS.SCHEDULED
    : SUBSCRIPTION_STATUS.ACTIVE

  // Compute end_date upfront with the canonical formula so the inserted
  // row is correct on first write. The DB trigger will recompute the
  // identical value — passing it explicitly just avoids relying on the
  // trigger and makes the value available to log/return.
  const endDate = computeEndDate({
    startDate,
    planKind: planKindOf(planDef.id),
    weekType,
    skipCount: 0,
    pauseDays: 0,
  })

  // ── Subscription + Order insert (skipped in resume mode) ───────────
  // Both are non-idempotent (would create duplicates), so on retry of a
  // partially-completed webhook we reuse the existing IDs and jump
  // straight to the idempotent downstream steps.
  let orderId: string
  if (resumeMode) {
    orderId = existingOrder!.id as string
    console.log(
      `🔁 Resuming webhook for session ${session.id} — order ${orderId} ` +
      `already saved, replaying downstream steps`
    )
  } else {
    // 1. Insert Subscription
    const { data: subData, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        customer_id: user_id,
        plan_name: plan_name,
        status: status,
        start_date: isoDate(startDate),
        end_date: isoDate(endDate),
        week_type: weekType,
        meals_per_day: meals_per_day,
        total_meals: total_meals,
        delivered_meals: 0,
        paused_days: 0,
        has_paused_before: false,
        skipped_meals_count: 0,
        veg_days: (() => {
          if (!vegDays) return null
          const arr = String(vegDays).split(',').map(s => s.trim()).filter(Boolean)
          if (arr.length === 0) return null
          const allowed = new Set(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])
          const clean = arr.filter(d => allowed.has(d))
          // Checkout validated vegDays server-authoritatively before Stripe
          // saw the metadata, and Stripe metadata is immutable after session
          // create — a drop here means either a parser regression or
          // tampering. Flag it so we can investigate; the row still gets
          // the valid subset rather than throwing, so the customer's plan
          // still scheduled.
          if (clean.length !== arr.length) {
            void notifyAdmin(
              `vegDays parser dropped days for user ${user_id} (session ${session.id}). ` +
              `Raw metadata: "${vegDays}"; accepted: [${clean.join(',')}]. ` +
              `Investigate — checkout validation should have prevented this.`,
              session.id.slice(0, 18),
            )
          }
          return clean.length > 0 ? clean : null
        })(),
      })
      .select()
      .single()

    if (subError) {
      console.error('❌ Supabase Subscription Error:', subError)
      return { ok: false, status: 500, error: 'Failed to create subscription' }
    }

    // 2. Insert Order
    // Stripe gives us fils (integer cents of AED) in amount_total. Convert to
    // AED with /100 (clean 2dp). Per-meal rate gets rounded to 2dp before
    // storage: float division (amount_total / total_meals) can produce values
    // like 5.620833333... which Zoho then prints as a non-clean rate on the
    // FTA invoice. The qty × rate residual (bounded by total_meals × 0.005
    // AED ≈ a few fils) is absorbed by Zoho's line-total rounding and the
    // payment-recorded amount is the customer-paid total regardless.
    //
    // amount_subtotal is the PRE-discount plan total — what we want to
    // record as the order's gross. amount_total is post-discount (what
    // Stripe captured). For the trial+auto-refund path these differ;
    // the order's price_per_meal reflects the plan's real per-meal rate,
    // not the AED-2-divided-by-meals near-zero number Stripe charged.
    const planSubtotalAed = session.amount_subtotal
      ? session.amount_subtotal / 100
      : (session.amount_total ? session.amount_total / 100 : 0)
    const pricePerMeal = total_meals > 0
      ? Math.round((planSubtotalAed / total_meals) * 100) / 100
      : 0

    const { data: orderData, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        order_number: session.id,
        customer_id: user_id,
        subscription_id: subData.id,
        plan: plan_name,
        meal_preference: vegDays ? `${preference} (${vegDays})` : preference,
        meals_count: total_meals,
        price_per_meal: pricePerMeal,
        invoice_status: INVOICE_STATUS.PAID,
        checkout_url: session.url,
        stripe_session_id: session.id,
        stripe_payment_id: session.payment_intent as string,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (orderError || !orderData) {
      console.error('❌ Supabase Order Error:', orderError)
      // Roll back the orphan subscription we just inserted so this row
      // doesn't linger in (Active|Scheduled) with no matching order. Two
      // race scenarios force this hand:
      //   1. Concurrent webhook beat us on the orders UNIQUE constraint —
      //      that webhook's run owns this session; we defer to it.
      //   2. Transient DB hiccup on the order insert — Stripe will retry,
      //      and the retry should re-insert from a clean slate, not see
      //      our orphan and queue *another* sub behind it.
      // Best-effort delete; if it fails the audit query catches it.
      await supabaseAdmin.from('subscriptions').delete().eq('id', subData.id)
      // 23505 = unique_violation. Concurrent webhook won the race; return
      // ok:true so Stripe doesn't retry — the winning webhook handles the
      // downstream steps.
      if ((orderError as { code?: string } | null)?.code === '23505') {
        console.log(
          `⏭️  Concurrent webhook beat us for session ${session.id} ` +
          `(orphan sub ${subData.id} rolled back); deferring to winner`,
        )
        return { ok: true, deduped: true }
      }
      return { ok: false, status: 500, error: 'Failed to create order' }
    }

    orderId = orderData.id as string
  }

  // ── Dorm Wars: flip redeemed credits to 'applied' ─────────────────
  // Resolves which credit rows to flip + which boundary row to split from
  // session metadata (primary path) or by re-deriving from the user's
  // approved balance + Stripe's reported discount (fallback path).
  //
  // Primary signal is metadata.credit_applied_fils > 0 (set by the
  // checkout route). Even if applied_credit_ids is empty — which happens
  // when the FIRST credit row already exceeds the cap — the split fields
  // tell us what to do. Falling back to a FIFO walk when metadata is
  // genuinely missing must ALSO honor split-row semantics or it will
  // greedily burn the first row entirely (a 5500 AED row used to cover
  // a 1024 AED plan would have lost the user 4476 AED).
  //
  // Idempotency is via CAS guard (`.eq('status','approved')`) on the
  // flip + UNIQUE-like check on the split row before inserting the
  // remainder. Webhook retries match 0 rows the second time around.
  //
  // Must run BEFORE `creditInviterOnConversion` below so the redeemed
  // credits settle before any new conversion credit is awarded.

  const metaCreditFils = Number(session.metadata?.credit_applied_fils ?? '0') || 0
  const metaTierFils = Number(session.metadata?.tier_applied_fils ?? '0') || 0
  const reservationToken = session.metadata?.reservation_token ?? ''
  const stripeDiscountFils =
    (session.amount_subtotal ?? 0) - (session.amount_total ?? 0)

  // CAS source: when checkout reserved the rows (new flow), they're now
  // status='reserved' and we flip reserved→applied keyed by token. Older
  // sessions (pre-reservation deploy) or fallback path use the legacy
  // status='approved' CAS.
  const flipFromStatus = reservationToken ? 'reserved' : 'approved'

  let fullRowIds: string[] = []
  let splitToProcess: { id: string; useFils: number } | null = null

  if (metaCreditFils > 0) {
    // Trust metadata — primary path.
    fullRowIds = (session.metadata?.applied_credit_ids ?? '')
      .split(',')
      .filter(Boolean)
    const splitId = session.metadata?.split_credit_id ?? ''
    const splitUseFils = Number(session.metadata?.split_credit_use_fils ?? '0') || 0
    if (splitId && splitUseFils > 0) {
      splitToProcess = { id: splitId, useFils: splitUseFils }
    }
    console.log(
      `💳 credit flip (metadata) — session ${session.id} order ${orderId} ` +
      `creditFils=${metaCreditFils} fullIds=[${fullRowIds.join(',')}] ` +
      `split=${splitId || 'none'}:${splitUseFils}`
    )
  } else if (stripeDiscountFils > 0) {
    // Fallback — Stripe shows a discount but our metadata is empty.
    // Audit P1-15: the naive `stripeDiscountFils - metaTierFils` was
    // wrong because when metadata is missing metaTierFils is ALSO 0,
    // so the whole discount got attributed to credit and we over-burned
    // rows that should have been the tier % portion. Re-derive the
    // tier % from the user's current lifetime tier so the math matches
    // what coupon-synth would have produced at checkout time.
    let derivedTierFils = metaTierFils
    if (derivedTierFils === 0) {
      const tierPercent = await getActiveLifetimeTierPercent(supabaseAdmin, user_id)
      if (tierPercent > 0) {
        const planFils = session.amount_subtotal ?? 0
        derivedTierFils = Math.floor((planFils * tierPercent) / 100)
        console.log(
          `💳 fallback tier derivation — tierPercent=${tierPercent}% on ` +
          `planFils=${planFils} → tierFils=${derivedTierFils}`
        )
      }
    }
    const targetCreditFils = stripeDiscountFils - derivedTierFils
    if (targetCreditFils > 0) {
      const { data: candidates } = await supabaseAdmin
        .from('credits')
        .select('id, amount_aed')
        .eq('customer_id', user_id)
        .eq('status', 'approved')
        .order('created_at', { ascending: true })
      let acc = 0
      for (const c of candidates ?? []) {
        const cFils = Math.round(Number(c.amount_aed) * 100)
        if (acc + cFils <= targetCreditFils) {
          fullRowIds.push(c.id as string)
          acc += cFils
          if (acc === targetCreditFils) break
        } else {
          const useFils = targetCreditFils - acc
          if (useFils > 0) splitToProcess = { id: c.id as string, useFils }
          break
        }
      }
      console.log(
        `💳 credit flip (fallback) — session ${session.id} order ${orderId} ` +
        `targetCreditFils=${targetCreditFils} fullIds=[${fullRowIds.join(',')}] ` +
        `split=${splitToProcess?.id ?? 'none'}:${splitToProcess?.useFils ?? 0}`
      )
    }
  } else {
    console.log(
      `💳 credit flip skipped — no discount on session ${session.id}`
    )
  }

  // Apply the full-row flips with CAS guard. Source status is 'reserved'
  // when the reservation system locked them at checkout time (new flow),
  // 'approved' otherwise (legacy / fallback).
  if (fullRowIds.length > 0) {
    const { error: flipErr, count: flippedCount } = await supabaseAdmin
      .from('credits')
      .update(
        {
          status: 'applied',
          applied_at: new Date().toISOString(),
          applied_to: orderId,
          reserved_token: null,
          reserved_until: null,
        },
        { count: 'exact' },
      )
      .in('id', fullRowIds)
      .eq('status', flipFromStatus)
    if (flipErr) {
      console.error('⚠️  credit flip to applied failed (non-fatal):', flipErr)
      void notifyAdmin(
        `Credit flip FAILED for order ${orderId} (session ${session.id}). ` +
        `Wanted to flip ${fullRowIds.length} row(s); Supabase error: ${flipErr.message}. ` +
        `Stripe gave the discount but our DB didn't burn the credits — manual reconcile needed.`,
        orderId,
      )
    } else {
      console.log(
        `💳 Flipped ${flippedCount ?? 0}/${fullRowIds.length} credit row(s) ` +
        `from ${flipFromStatus} to applied for order ${orderId}`
      )
      // Partial mismatch: we redeemed N rows in Stripe but only flipped M < N
      // here. Stripe applied the discount but some credits weren't burned —
      // free money on the next checkout. Alert immediately.
      if ((flippedCount ?? 0) < fullRowIds.length) {
        void notifyAdmin(
          `Credit flip MISMATCH for order ${orderId} (session ${session.id}). ` +
          `Wanted ${fullRowIds.length} row(s), only flipped ${flippedCount ?? 0}. ` +
          `Customer kept ${fullRowIds.length - (flippedCount ?? 0)} credit row(s) they redeemed — reconcile.`,
          orderId,
        )
      }
    }
  }

  // Handle the split boundary row: flip the original AND insert a fresh
  // 'approved' row for the unused remainder. Without this, partial
  // redemption (wallet > plan total) burns the boundary row entirely.
  if (splitToProcess) {
    const { data: splitRow } = await supabaseAdmin
      .from('credits')
      .select('id, amount_aed, source, status')
      .eq('id', splitToProcess.id)
      .eq('status', flipFromStatus)
      .maybeSingle()
    if (!splitRow) {
      console.warn(
        `⚠️  split credit row ${splitToProcess.id} not found in expected ` +
        `status (${flipFromStatus}) — skipping split (idempotent re-run, ` +
        `or external state change)`
      )
    } else {
      const totalFils = Math.round(Number(splitRow.amount_aed) * 100)
      const remainderFils = totalFils - splitToProcess.useFils
      const { error: splitFlipErr } = await supabaseAdmin
        .from('credits')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString(),
          applied_to: orderId,
          reserved_token: null,
          reserved_until: null,
        })
        .eq('id', splitToProcess.id)
        .eq('status', flipFromStatus)
      if (splitFlipErr) {
        console.error('⚠️  split credit flip failed (non-fatal):', splitFlipErr)
      } else if (remainderFils > 0) {
        const { error: insertErr } = await supabaseAdmin.from('credits').insert({
          customer_id: user_id,
          amount_aed: remainderFils / 100,
          source: `${splitRow.source}_split_remainder`,
          status: 'approved',
        })
        if (insertErr) {
          console.error(
            '⚠️  split remainder insert failed — user may have lost credit:',
            insertErr,
          )
        } else {
          console.log(
            `💳 Split credit ${splitToProcess.id}: used ${splitToProcess.useFils} ` +
            `fils for order ${orderId}, carried ${remainderFils} fils forward`
          )
        }
      } else {
        console.log(
          `💳 Split credit ${splitToProcess.id}: fully consumed (remainder=0)`
        )
      }
    }
  }

  // 3. Update Customer Profile with the latest data + drain any pending
  // preferences. Skipped in resume mode — the first attempt already
  // patched the customer; re-running could clobber subsequent user
  // edits to pending_*.
  if (resumeMode) {
    console.log(`🔁 Resume mode — skipping customer patch (already applied)`)
  } else {
    const customerPatch: Record<string, unknown> = {
      whatsapp_number: phone,
      dorm_name: location,
      meal_preference_type:
        customerRow?.pending_meal_preference_type ?? preference,
      week_type: weekType,
    }
    // Only seed `name` on first checkout — don't clobber a stored richer
    // value (e.g. "Saif AlRashid" already set during onboarding) with the
    // metadata's possibly-shorter "Saif" from a renewal checkout. If the
    // user wants to change their name, that's a profile-edit, not a
    // payment side-effect.
    const storedName = ((customerRow as { name?: string } | null)?.name ?? '').trim()
    if (!storedName && name) {
      customerPatch.name = name
    }
    if (customerRow?.pending_allergens != null) {
      customerPatch.allergens = customerRow.pending_allergens
    }
    if (customerRow?.pending_spice_level_preference != null) {
      customerPatch.spice_level_preference =
        customerRow.pending_spice_level_preference
    }
    // Religious-mix veg_days: the checkout payload's vegDays IS the
    // authoritative pick for THIS subscription (the user just confirmed
    // it). Per Option A from the 2026-05-07 unification, those picks
    // also become the customer's standing preference (customer.veg_days)
    // so the next checkout's picker pre-fills from this. Order of
    // precedence: payload > pending > existing customer column.
    // Non-religious purchases null out customer.veg_days so a former
    // religious-mix customer who switches preference doesn't carry
    // stale day picks forward.
    const isReligiousNow = /religious/i.test(preference)
    if (isReligiousNow) {
      const allowedDays = new Set(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])
      const payloadDays =
        typeof vegDays === 'string' && vegDays.trim().length > 0
          ? vegDays.split(',').map(s => s.trim()).filter(d => allowedDays.has(d))
          : []
      if (payloadDays.length > 0) {
        customerPatch.veg_days = payloadDays
      } else if (Array.isArray(customerRow?.pending_veg_days) && customerRow.pending_veg_days.length > 0) {
        customerPatch.veg_days = customerRow.pending_veg_days
      }
    } else {
      customerPatch.veg_days = null
    }
    // Always clear pending_* — even if every field was null, the explicit
    // null-out is a no-op so the cost is negligible and it keeps the
    // post-state predictable.
    customerPatch.pending_meal_preference_type = null
    customerPatch.pending_week_type = null
    customerPatch.pending_allergens = null
    customerPatch.pending_spice_level_preference = null
    customerPatch.pending_veg_days = null

    const { error: customerError } = await supabaseAdmin
      .from('customers')
      .update(customerPatch)
      .eq('id', user_id)

    if (customerError) {
      // Don't fail the webhook — subscription + order are already saved.
      // Log for reconciliation between `customers` and `subscriptions`.
      console.error('⚠️  Customer profile update failed:', customerError)
    }
  }

  // Link the invitee's new account to any referral row waiting for their
  // user_id. The referral row was written with invitee_phone at
  // gift-claim time; now that signup is complete we close the loop so
  // future queries work. This MUST run BEFORE creditInviterOnConversion
  // so the awarder's queries (which key on inviter_user_id and look up
  // referrals.invitee_user_id) see the linked row.
  if (phone) {
    const { normalisePhone } = await import('@/shared/phone')
    const phoneE164 = normalisePhone(phone)
    const { error: linkErr } = await supabaseAdmin
      .from('referrals')
      .update({ invitee_user_id: user_id })
      .eq('invitee_phone', phoneE164)
      .is('invitee_user_id', null)
    if (linkErr) console.error('⚠️  referral user_id link failed:', linkErr)
  }

  // Fire referral conversion credit — MUST be awaited. On serverless
  // (Netlify Functions) the function instance can be torn down as soon as
  // the response is sent, killing any in-flight Promise. A fire-and-forget
  // here would intermittently drop Layer 1 (AED 20–35) credits and entire
  // Layer 2/3 milestone fires under load. Idempotent on retry via the
  // referrals.status='gift_claimed' guard inside creditInviterOnConversion.
  try {
    await creditInviterOnConversion(user_id)
  } catch (err) {
    console.error('⚠️  creditInviterOnConversion failed (non-fatal):', err)
    const msg = err instanceof Error ? err.message : String(err)
    void notifyAdmin(
      `Referral inviter credit FAILED for invitee ${user_id} (order ${orderId}). ` +
      `Error: ${msg}. Inviter has lost their Layer 1 credit (AED 20–35, and any Layer 2/3 milestone) — ` +
      `re-run the awarder manually after diagnosing.`,
      orderId,
    )
  }

  // Mark the order as fully processed so retries see the checkpoint and
  // skip re-running downstream steps. If this update fails (extremely
  // unlikely — pure UPDATE on a known row), the worst case is the next
  // retry redoes the idempotent downstream work, which is safe by design.
  const { error: completeErr } = await supabaseAdmin
    .from('orders')
    .update({ webhook_completed_at: new Date().toISOString() })
    .eq('id', orderId)
  if (completeErr) {
    console.error('⚠️  failed to mark webhook_completed_at:', completeErr)
  }

  // Phase 7 follow-up: trial auto-refund block removed. Zero-amount trials
  // now flow through the free-checkout path (no Stripe at all), so this
  // post-webhook refund is unreachable.

  // ── Post-payment fan-out ─────────────────────────────────────────────
  // Two synchronous channels fire immediately: WhatsApp confirmation
  // and ZeptoMail welcome from club@. The Zoho receipt email is
  // deliberately deferred 2 minutes via `orders.zoho_scheduled_for`
  // and picked up by the every-minute dispatch_zoho_due cron — back-
  // to-back arrivals from club@ + finance@ felt spammy.
  //
  // Awaited (not fire-and-forget) for the same reason
  // creditInviterOnConversion above is — Netlify Function instances can
  // be torn down the moment we return 200, killing any in-flight
  // Promise. The two-channel fan-out is fast (~1-2s) and stays well
  // within Stripe's 10s webhook timeout.
  // amount_total = what Stripe captured (post-discount). recordPayment +
  // customer-facing "Successful payment" WhatsApp echo this. For Zoho's
  // line subtotal, we use amount_subtotal (gross plan price) so the
  // discount line maths back to amount_total.
  const amountTotalAed = session.amount_total ? session.amount_total / 100 : 0
  const planSubtotalForFanout = session.amount_subtotal
    ? session.amount_subtotal / 100
    : amountTotalAed
  const pricePerMealEff = total_meals > 0
    ? Math.round((planSubtotalForFanout / total_meals) * 100) / 100
    : 0
  const customerEmail = session.customer_details?.email ?? ''
  if (customerEmail) {
    try {
      // Discount breakdown for Zoho's invoice line — trial+auto-refund
      // path sends a non-zero value so the FTA invoice PDF shows the
      // credit redemption rather than just the captured AED 2.
      const discountAed =
        Number(session.metadata?.discount_total_fils ?? '0') / 100 || 0
      await runPostPaymentFanout(
        {
          supabase: supabaseAdmin,
          orderId,
          customerId: user_id,
          customerCid: (customerRow?.cid as string | undefined) ?? '',
          customerName: name ?? '',
          customerEmail,
          customerPhone: phone ?? '',
          planName: plan_name,
          mealsCount: total_meals,
          pricePerMeal: pricePerMealEff,
          amountTotalAed,
          discountAed,
          startDateIso: isoDate(startDate),
          sessionId: session.id,
          paymentIntentId: (session.payment_intent as string) ?? '',
          paymentDateIso: new Date().toISOString().slice(0, 10),
        },
        { skipChannels: ['zoho'] },
      )
    } catch (err) {
      console.error('⚠️  post-payment fan-out wrapper threw:', err)
    }

    // Schedule the Zoho receipt for T+2min. The dispatch_zoho_due cron
    // picks this up next minute boundary.
    const { error: schedErr } = await supabaseAdmin
      .from('orders')
      .update({
        zoho_scheduled_for: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      })
      .eq('id', orderId)
    if (schedErr) {
      console.error('⚠️  failed to set zoho_scheduled_for:', schedErr)
    }
  } else {
    console.warn(
      `⚠️  post-payment fan-out skipped — no customer email on session ${session.id}; ` +
      `retry cron will catch this once the customers row is patched`,
    )
    // The retry cron won't actually pick this up either — its WHERE clause
    // depends on zoho_scheduled_for being set, which only happens inside
    // the email-present branch above. Without an alert this customer's
    // confirmation channel just disappears.
    void notifyAdmin(
      `Stripe webhook completed for session ${session.id} (order ${orderId}) but customer_details.email was missing — ` +
      `no confirmation WhatsApp / email / Zoho invoice will fire. Customer paid; ops needs to add the email and re-trigger fanout.`,
      orderId,
    )
  }

  console.log(`✅ Successfully processed checkout for user ${user_id} (resume=${resumeMode})`)
  Sentry.metrics.count('payment.checkout_completed', 1)
  return { ok: true }
}

// ── charge.refunded handler ───────────────────────────────────────────────

/**
 * Restore burned credits when ops refunds an order (audit P0-11). Without
 * this, a refund leaves the user with status='applied' credit rows tied to
 * a charge that no longer exists AND Stripe gives them cash back — net
 * result: the user loses the credit they "spent" on the refunded purchase.
 *
 * Mystery Cash Drop / cycle / tier deposits that landed AFTER the refunded
 * checkout are intentionally NOT clawed back — those are independent rewards.
 * Only the credits redeemed AT the refunded checkout flip back.
 */
async function handleChargeRefunded(
  event: Stripe.Event,
  supabaseAdmin: SupabaseClient,
): Promise<HandleResult> {
  const charge = event.data.object as Stripe.Charge
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id
  if (!paymentIntentId) {
    console.warn(`charge.refunded ${charge.id} had no payment_intent — skipping credit restore`)
    return { ok: true, refundHandled: false }
  }
  const { data: orderRow } = await supabaseAdmin
    .from('orders')
    .select('id, customer_id, invoice_status')
    .eq('stripe_payment_id', paymentIntentId)
    .maybeSingle()
  if (!orderRow) {
    console.warn(`charge.refunded for payment_intent=${paymentIntentId} matches no order — skipping`)
    // Make-era payment, manual-side Stripe refund, or a real bug. Either way
    // ops needs eyes-on — silently skipping risks an unrecognised refund
    // sitting forever.
    void notifyAdmin(
      `Refund came in for payment_intent=${paymentIntentId} (charge ${charge.id}, ${charge.amount_refunded}/${charge.amount} fils) but no orders row matches. Check Stripe dashboard + reconcile manually.`,
      paymentIntentId.slice(0, 18),
    )
    return { ok: true, refundHandled: false }
  }

  // Refund classification. Stripe's `amount_refunded` accumulates across
  // multiple partial refunds; `amount` is the original charge. Equal ⇒
  // fully refunded. Less ⇒ partial.
  //
  // Credit restore policy:
  //   • Full refund   → restore all applied credit rows.
  //   • Partial refund → DO NOT restore credits. Partial refunds in this
  //     business are typically issued for specific delivery issues (one
  //     missed meal, late by a day) on a plan the customer is still
  //     consuming. Restoring 100% of the credits the customer "spent" on
  //     the original order would be a net giveaway on top of Stripe's
  //     partial cash refund. Ops can manually add a credit row if a
  //     proportional adjustment is intended.
  const isFullRefund = charge.amount_refunded >= charge.amount
  let restoredCount = 0
  if (isFullRefund) {
    const { count, error: restoreErr } = await supabaseAdmin
      .from('credits')
      .update(
        { status: 'approved', applied_at: null, applied_to: null },
        { count: 'exact' },
      )
      .eq('applied_to', orderRow.id)
      .eq('status', 'applied')
    if (restoreErr) {
      console.error(`❌ refund credit restore failed for order ${orderRow.id}:`, restoreErr)
    } else {
      restoredCount = count ?? 0
      console.log(`↩️  Full refund — restored ${restoredCount} credit row(s) for order ${orderRow.id}`)
    }
  } else {
    console.log(
      `↩️  Partial refund (${charge.amount_refunded}/${charge.amount} fils) on order ${orderRow.id} ` +
      `— credits left applied; ops can add a manual credit if proportional refund intended`,
    )
  }

  // Mark the order so dashboards / reports reflect the refund state.
  await supabaseAdmin
    .from('orders')
    .update({ invoice_status: isFullRefund ? 'Refunded' : 'Partially Refunded' })
    .eq('id', orderRow.id)
  Sentry.metrics.count('payment.refund_handled', 1)
  return { ok: true, refundHandled: true, restored: restoredCount }
}

// ── payment_intent.payment_failed handler ────────────────────────────────
//
// Card decline / 3DS failure / insufficient funds. Stripe doesn't charge
// the customer, but Stripe DOES fire this event so we can know the
// checkout went bad. Historically silent — alert ops so a customer
// stuck on a failed card can be reached out to.
async function handlePaymentFailed(event: Stripe.Event): Promise<HandleResult> {
  const pi = event.data.object as Stripe.PaymentIntent
  const lastErr = pi.last_payment_error
  const reason = lastErr?.message ?? lastErr?.code ?? 'unknown'
  const amountAed = pi.amount ? (pi.amount / 100).toFixed(2) : '0.00'
  const customerEmail = pi.receipt_email ?? (pi.metadata?.email as string | undefined) ?? 'unknown'
  void notifyAdmin(
    `Payment FAILED on PI ${pi.id}. Customer ${customerEmail}, AED ${amountAed}. Reason: ${reason}. No order was created — reach out if the customer needs help with their card.`,
    pi.id.slice(0, 18),
  )
  Sentry.metrics.count('payment.payment_failed', 1)
  return { ok: true }
}

// ── charge.dispute.created handler ────────────────────────────────────────
//
// Customer (or their bank) filed a chargeback. The funds are already on
// hold at Stripe. We don't auto-cancel anything — disputes can be won —
// but the order's status flips to 'Disputed' so dashboards reflect
// reality, and ops gets a WhatsApp ping so they can respond inside
// Stripe's evidence window (typically 7–21 days).
async function handleDisputeCreated(
  event: Stripe.Event,
  supabaseAdmin: SupabaseClient,
): Promise<HandleResult> {
  const dispute = event.data.object as Stripe.Dispute
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id
  const reason = dispute.reason ?? 'unknown'
  const amountAed = dispute.amount ? (dispute.amount / 100).toFixed(2) : '0.00'

  let orderId: string | null = null
  if (chargeId) {
    const { data: charge } = await supabaseAdmin
      .from('orders')
      .select('id, customer_id')
      .eq('stripe_payment_id', chargeId)
      .maybeSingle()
    if (charge?.id) {
      orderId = charge.id as string
      await supabaseAdmin
        .from('orders')
        .update({ invoice_status: 'Disputed' })
        .eq('id', orderId)
    }
  }

  void notifyAdmin(
    `DISPUTE filed on charge ${chargeId ?? 'unknown'}${orderId ? ` (order ${orderId})` : ''}. ` +
    `Amount AED ${amountAed}, reason: ${reason}. ` +
    `Respond inside Stripe's evidence window — order marked Disputed.`,
    orderId ?? chargeId?.slice(0, 18) ?? 'unknown',
  )
  Sentry.metrics.count('payment.dispute_created', 1)
  return { ok: true }
}

// ── checkout.session.expired handler ─────────────────────────────────────
//
// Session opened, customer never paid, the 24h window lapsed and Stripe
// expired it. No money moved, no order, no customer-visible side effect
// — but it's the cleanest abandoned-checkout signal we have. Log only
// for now; analytics can join on this later if we want recovery emails.
function handleCheckoutExpired(event: Stripe.Event): HandleResult {
  const session = event.data.object as Stripe.Checkout.Session
  const email = session.customer_details?.email ?? session.metadata?.email ?? 'unknown'
  const amountAed = session.amount_total ? (session.amount_total / 100).toFixed(2) : '0.00'
  console.log(
    `⏳ checkout.session.expired ${session.id} — ${email} abandoned AED ${amountAed}`,
  )
  Sentry.metrics.count('payment.session_expired', 1)
  return { ok: true }
}

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * Forward a date to the next delivery day for the customer's week_type.
 * Sunday is non-delivery for 6DAYS; Sat+Sun for 5DAYS. Mirrors the
 * shift logic in compute_subscription_end_date / src/contexts/subscriptions/domain/end-date.ts.
 */
function nextDeliveryDay(d: Date, weekType: WeekType): Date {
  const r = new Date(d)
  for (let i = 0; i < 7; i++) {
    const dow = r.getUTCDay() === 0 ? 7 : r.getUTCDay() // 1=Mon..7=Sun
    const isDelivery =
      weekType === '7DAYS' ? true :
      weekType === '6DAYS' ? dow !== 7 :
      dow !== 6 && dow !== 7
    if (isDelivery) return r
    r.setUTCDate(r.getUTCDate() + 1)
  }
  return r // unreachable for sane inputs
}

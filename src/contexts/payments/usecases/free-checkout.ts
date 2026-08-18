/**
 * Free-checkout use case — provisions a paid subscription when the
 * customer's Dorm Wars credit + lifetime tier % fully cover the plan
 * total, so no Stripe transaction happens at all.
 *
 * Mirrors the webhook handler's idempotent core (subscription + order
 * insert, credit flip, customer patch, referral conversion, fanout) but:
 *   • No Stripe session / payment IDs on the order row
 *   • payment_method = 'credit'
 *   • amount_total = 0 → Zoho is skipped (no cash transaction to invoice)
 *   • webhook_completed_at stamped immediately (this IS the canonical
 *     processor for free checkouts — no Stripe webhook will ever fire)
 *
 * Idempotency: the caller (checkout route) reserves credit rows under a
 * `reservation_token` BEFORE calling this. A double-click that races
 * itself loses the reservation CAS and the second request returns 409
 * upstream — only one free checkout per token can succeed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolvePlan, totalMealsFor, planKindOf } from '@/contexts/subscriptions/domain/plans'
import {
  SUBSCRIPTION_STATUS,
  LIVE_SUBSCRIPTION_STATUSES,
  INVOICE_STATUS,
} from '@/contexts/subscriptions/domain/subscription-status'
import { computeEndDate, isoDate, type WeekType } from '@/contexts/subscriptions/domain/end-date'
import { runPostPaymentFanout } from '@/contexts/payments/usecases/post-payment-fanout'
import { createAndSendCompedInvoice } from '@/infra/zoho/invoices'
import { creditInviterOnConversion } from '@/app/r/[cid]/actions'
import { notifyAdmin } from '@/infra/admin-alerts/notify'
import { getIntakeState } from '@/infra/config/intake'

/**
 * Shared intake guard for the non-Stripe provisioning paths — free checkout
 * and referral gift claims. A claimed gift is a real meal the kitchen has to
 * cook, so it counts as intake and stops with everything else.
 *
 * Staff and intern provisioning is intentionally NOT guarded: it is assigned
 * by an admin rather than bought by a customer.
 */
export async function assertIntakeOpen(): Promise<void> {
  const intake = await getIntakeState()
  if (intake.paused) {
    throw new Error(
      intake.body || 'New plans are paused for now. Save your spot and we will message you the day we reopen.',
    )
  }
}

export interface FreeCheckoutInput {
  supabaseAdmin: SupabaseClient
  userId: string
  planString: string
  preference: string
  vegDays: string[] | string | null
  name: string
  phone: string
  location: string
  startDate: string | null
  /** Plan total in fils — what the order row records as the gross. */
  amountFils: number
  reservationToken: string | null
  creditAppliedFils: number
  tierAppliedFils: number
  appliedCreditIdsFull: string[]
  splitCredit: { id: string; useFils: number } | null
}

export async function runFreeCheckout(input: FreeCheckoutInput): Promise<void> {
  await assertIntakeOpen()

  const {
    supabaseAdmin, userId, planString, preference, vegDays,
    name, phone, location, startDate, amountFils, reservationToken,
    creditAppliedFils, appliedCreditIdsFull, splitCredit,
  } = input

  const planDef = resolvePlan(planString)
  if (!planDef) throw new Error(`free-checkout: cannot resolve plan '${planString}'`)

  // ── Customer snapshot + week_type resolution (matches webhook) ─────────
  type CustomerRow = {
    cid?: string
    name?: string
    week_type?: string
    meal_preference_type?: string
    allergens?: string[] | null
    spice_level_preference?: string | null
    veg_days?: string[] | null
    pending_meal_preference_type?: string | null
    pending_week_type?: string | null
    pending_allergens?: string[] | null
    pending_spice_level_preference?: string | null
    pending_veg_days?: string[] | null
  }
  const { data: customerRowRaw } = await supabaseAdmin
    .from('customers')
    .select(
      'cid, name, week_type, meal_preference_type, allergens, ' +
      'spice_level_preference, veg_days, ' +
      'pending_meal_preference_type, pending_week_type, pending_allergens, ' +
      'pending_spice_level_preference, pending_veg_days',
    )
    .eq('id', userId)
    .maybeSingle()
  const customerRow = customerRowRaw as CustomerRow | null
  const effectiveWeekTypeRaw =
    customerRow?.pending_week_type ?? customerRow?.week_type
  const weekType: WeekType =
    effectiveWeekTypeRaw === '5DAYS' ? '5DAYS' : '6DAYS'
  const total_meals = totalMealsFor(planDef.id, weekType)

  // ── Subscription start date (matches webhook tail-queueing rules) ──────
  const { data: liveSubs } = await supabaseAdmin
    .from('subscriptions')
    .select('id, end_date, status')
    .eq('customer_id', userId)
    .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED])
    .order('end_date', { ascending: false })
  const tail = liveSubs?.[0]
  const todayMidnightUtc = new Date(); todayMidnightUtc.setUTCHours(0, 0, 0, 0)
  let startDt: Date
  if (tail) {
    const dayAfter = new Date(tail.end_date + 'T00:00:00Z')
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1)
    startDt = nextDeliveryDay(dayAfter, weekType)
  } else {
    startDt = startDate ? new Date(startDate + 'T00:00:00Z') : new Date(todayMidnightUtc)
    if (isNaN(startDt.getTime())) startDt = new Date(todayMidnightUtc)
    startDt = nextDeliveryDay(startDt, weekType)
  }
  const status = startDt.getTime() > todayMidnightUtc.getTime()
    ? SUBSCRIPTION_STATUS.SCHEDULED
    : SUBSCRIPTION_STATUS.ACTIVE
  const endDate = computeEndDate({
    startDate: startDt,
    planKind: planKindOf(planDef.id),
    weekType,
    skipCount: 0,
    pauseDays: 0,
  })

  // ── Seasonal taper ────────────────────────────────────────────────────
  // Same refusal as the checkout route's taper guard, translated to this
  // path's throw-and-catch contract: with a pause scheduled, a journey that
  // would end after the last delivery day is done for the term. Fail open:
  // getIntakeState returns pauseScheduledFor: null on a settings-read blip.
  const intake = await getIntakeState()
  if (intake.pauseScheduledFor && isoDate(endDate) > intake.pauseScheduledFor) {
    const pretty = new Date(intake.pauseScheduledFor + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    throw new Error(`The semester wraps up on ${pretty}. This plan would run past it, so it is done for this term.`)
  }

  const vegDaysList = (() => {
    if (!vegDays) return null
    const raw = Array.isArray(vegDays)
      ? vegDays
      : String(vegDays).split(',').map(s => s.trim()).filter(Boolean)
    const allowed = new Set(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])
    const clean = raw.filter(d => allowed.has(d))
    return clean.length > 0 ? clean : null
  })()

  // ── Subscription insert ────────────────────────────────────────────────
  const { data: subData, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .insert({
      customer_id: userId,
      plan_name: planDef.label,
      status,
      start_date: isoDate(startDt),
      end_date: isoDate(endDate),
      week_type: weekType,
      meals_per_day: planDef.mealsPerDay,
      total_meals,
      delivered_meals: 0,
      paused_days: 0,
      has_paused_before: false,
      skipped_meals_count: 0,
      veg_days: vegDaysList,
    })
    .select()
    .single()
  if (subError || !subData) {
    throw new Error(`free-checkout: subscription insert failed: ${subError?.message}`)
  }

  // ── Order insert (no Stripe IDs, payment_method=credit) ────────────────
  // Synthetic order_number so the UNIQUE constraint on stripe_session_id /
  // order_number doesn't collide with future free checkouts. Prefix `free:`
  // so reports can distinguish at a glance.
  const syntheticOrderNumber = `free:${crypto.randomUUID()}`
  const amountTotalAed = amountFils / 100
  const pricePerMeal = total_meals > 0
    ? Math.round((amountTotalAed / total_meals) * 100) / 100
    : 0
  const { data: orderData, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      order_number: syntheticOrderNumber,
      customer_id: userId,
      subscription_id: subData.id,
      plan: planDef.label,
      meal_preference: vegDaysList ? `${preference} (${vegDaysList.join(',')})` : preference,
      meals_count: total_meals,
      price_per_meal: pricePerMeal,
      invoice_status: INVOICE_STATUS.PAID,
      payment_method: 'credit',
      stripe_session_id: syntheticOrderNumber,
      stripe_payment_id: null,
      created_at: new Date().toISOString(),
      webhook_completed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (orderError || !orderData) {
    await supabaseAdmin.from('subscriptions').delete().eq('id', subData.id)
    throw new Error(`free-checkout: order insert failed: ${orderError?.message}`)
  }
  const orderId = orderData.id as string

  // ── Credit flip (reserved → applied) + split-row handling ──────────────
  // Same shape as the webhook's credit flip, just keyed on reservation_token
  // instead of session metadata derivations.
  if (appliedCreditIdsFull.length > 0) {
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
      .in('id', appliedCreditIdsFull)
      .eq('status', 'reserved')
    if (flipErr) {
      console.error('❌ free-checkout credit flip failed — rolling back:', flipErr)
      await supabaseAdmin.from('subscriptions').delete().eq('id', subData.id)
      await supabaseAdmin.from('orders').delete().eq('id', orderId)
      void notifyAdmin(
        `Free-checkout credit flip FAILED for user ${userId}. ` +
        `Wanted ${appliedCreditIdsFull.length} row(s); Supabase error: ${flipErr.message}. ` +
        `Subscription + order rolled back. Customer should retry.`,
        userId.slice(0, 18),
      )
      throw new Error(`free-checkout: credit flip failed — rolled back sub+order: ${flipErr.message}`)
    } else if ((flippedCount ?? 0) < appliedCreditIdsFull.length) {
      void notifyAdmin(
        `Free-checkout credit MISMATCH for order ${orderId}. ` +
        `Wanted ${appliedCreditIdsFull.length} row(s), only flipped ${flippedCount ?? 0}. ` +
        `Some reservation slipped between checkout reserve and the free-checkout flip.`,
        orderId,
      )
    }
  }
  if (splitCredit) {
    const { data: splitRow } = await supabaseAdmin
      .from('credits')
      .select('id, amount_aed, source, status')
      .eq('id', splitCredit.id)
      .eq('status', 'reserved')
      .maybeSingle()
    if (splitRow) {
      const totalFils = Math.round(Number(splitRow.amount_aed) * 100)
      const remainderFils = totalFils - splitCredit.useFils
      await supabaseAdmin
        .from('credits')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString(),
          applied_to: orderId,
          reserved_token: null,
          reserved_until: null,
        })
        .eq('id', splitCredit.id)
        .eq('status', 'reserved')
      if (remainderFils > 0) {
        await supabaseAdmin.from('credits').insert({
          customer_id: userId,
          amount_aed: remainderFils / 100,
          source: `${splitRow.source}_split_remainder`,
          status: 'approved',
        })
      }
    }
  }

  console.log(
    `🎁 free-checkout — order ${orderId} provisioned for user ${userId} ` +
    `(plan=${planDef.label}, credit=${creditAppliedFils} fils, token=${reservationToken})`,
  )

  // ── Customer patch (matches webhook) ───────────────────────────────────
  const customerPatch: Record<string, unknown> = {
    whatsapp_number: phone,
    dorm_name: location,
    meal_preference_type:
      customerRow?.pending_meal_preference_type ?? preference,
    week_type: weekType,
  }
  const storedName = (customerRow?.name ?? '').trim()
  if (!storedName && name) customerPatch.name = name
  if (customerRow?.pending_allergens != null) {
    customerPatch.allergens = customerRow.pending_allergens
  }
  if (customerRow?.pending_spice_level_preference != null) {
    customerPatch.spice_level_preference = customerRow.pending_spice_level_preference
  }
  const isReligiousNow = /religious/i.test(preference)
  if (isReligiousNow) {
    if (vegDaysList && vegDaysList.length > 0) {
      customerPatch.veg_days = vegDaysList
    } else if (Array.isArray(customerRow?.pending_veg_days) && customerRow.pending_veg_days.length > 0) {
      customerPatch.veg_days = customerRow.pending_veg_days
    }
  } else {
    customerPatch.veg_days = null
  }
  customerPatch.pending_meal_preference_type = null
  customerPatch.pending_week_type = null
  customerPatch.pending_allergens = null
  customerPatch.pending_spice_level_preference = null
  customerPatch.pending_veg_days = null
  await supabaseAdmin.from('customers').update(customerPatch).eq('id', userId)

  // ── Referral linkage + conversion (matches webhook) ────────────────────
  if (phone) {
    const { normalisePhone } = await import('@/shared/phone')
    const phoneE164 = normalisePhone(phone)
    await supabaseAdmin
      .from('referrals')
      .update({ invitee_user_id: userId })
      .eq('invitee_phone', phoneE164)
      .is('invitee_user_id', null)
  }
  try {
    await creditInviterOnConversion(userId)
  } catch (err) {
    console.error('⚠️  free-checkout creditInviterOnConversion failed (non-fatal):', err)
    const msg = err instanceof Error ? err.message : String(err)
    void notifyAdmin(
      `Free-checkout referral inviter credit FAILED for invitee ${userId} (order ${orderId}). ` +
      `Error: ${msg}. Inviter lost their Layer 1 credit (AED 20–35) + milestone fires — re-run manually.`,
      orderId,
    )
  }

  // ── Customer-facing fanout ─────────────────────────────────────────────
  // WhatsApp + welcome email fire through the standard fanout. Zoho takes
  // a separate path (createAndSendCompedInvoice) — its invoice carries a
  // Dorm Wars Credit Redemption discount line that nets the balance to
  // AED 0, no payment record. Customer ends up with a real FTA invoice
  // they can keep, just without a Stripe payment receipt.
  const customerEmail = await supabaseAdmin
    .from('customers')
    .select('email')
    .eq('id', userId)
    .maybeSingle()
    .then(r => (r.data as { email?: string } | null)?.email ?? '')
  if (customerEmail) {
    // Fanout: WhatsApp + welcome email. Zoho is suppressed here; we call
    // it directly below with the comped-invoice helper.
    try {
      await runPostPaymentFanout(
        {
          supabase: supabaseAdmin,
          orderId,
          customerId: userId,
          customerCid: customerRow?.cid ?? '',
          customerName: name ?? '',
          customerEmail,
          customerPhone: phone ?? '',
          planName: planDef.label,
          mealsCount: total_meals,
          pricePerMeal,
          amountTotalAed,
          startDateIso: isoDate(startDt),
          sessionId: syntheticOrderNumber,
          paymentIntentId: '',
          paymentDateIso: new Date().toISOString().slice(0, 10),
        },
        { skipChannels: ['zoho'] },
      )
    } catch (err) {
      console.error('⚠️  free-checkout fanout wrapper threw:', err)
    }

    // Zoho comped invoice — plan price as line subtotal, equal discount,
    // balance lands at AED 0. Stamps zoho_invoice_id / number / url on the
    // order row the same way the paid path does, so the order looks fully
    // settled in dashboards.
    try {
      const { invoiceId, invoiceNumber, invoiceUrl } = await createAndSendCompedInvoice({
        customerName: name ?? '',
        customerEmail,
        customerPhone: phone ?? '',
        customerCid: customerRow?.cid ?? '',
        planName: planDef.label,
        mealsCount: total_meals,
        pricePerMeal,
        planTotalAed: pricePerMeal * total_meals,
        sessionRef: syntheticOrderNumber,
        startDateIso: isoDate(startDt),
        paymentDateIso: new Date().toISOString().slice(0, 10),
      })
      await supabaseAdmin
        .from('orders')
        .update({
          zoho_invoice_id: invoiceId,
          zoho_invoice_number: invoiceNumber,
          zoho_invoice_url: invoiceUrl ?? null,
          zoho_synced_at: new Date().toISOString(),
        })
        .eq('id', orderId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('⚠️  free-checkout Zoho comped invoice failed:', msg)
      void notifyAdmin(
        `Free-checkout Zoho invoice FAILED for order ${orderId} (user ${userId}). ` +
        `Customer got their plan + WhatsApp confirmation but no FTA invoice. ` +
        `Error: ${msg}. Investigate + manually mint the invoice if needed.`,
        orderId,
      )
    }
  }
}

function nextDeliveryDay(d: Date, weekType: WeekType): Date {
  const r = new Date(d)
  for (let i = 0; i < 7; i++) {
    const dow = r.getUTCDay() === 0 ? 7 : r.getUTCDay()
    const isDelivery =
      weekType === '7DAYS' ? true :
      weekType === '6DAYS' ? dow !== 7 :
      dow !== 6 && dow !== 7
    if (isDelivery) return r
    r.setUTCDate(r.getUTCDate() + 1)
  }
  return r
}

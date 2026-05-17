import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolvePlan, totalMealsFor, planKindOf } from '@/lib/plans';
import { creditInviterOnConversion } from '@/app/r/[cid]/actions';
import {
  SUBSCRIPTION_STATUS,
  LIVE_SUBSCRIPTION_STATUSES,
  INVOICE_STATUS,
} from '@/lib/subscription-status';
import { computeEndDate, isoDate, type WeekType } from '@/lib/end-date';

/**
 * Forward a date to the next delivery day for the customer's week_type.
 * Sunday is non-delivery for 6DAYS; Sat+Sun for 5DAYS. Mirrors the
 * shift logic in compute_subscription_end_date / src/lib/end-date.ts.
 */
function nextDeliveryDay(d: Date, weekType: WeekType): Date {
  const r = new Date(d);
  for (let i = 0; i < 7; i++) {
    const dow = r.getUTCDay() === 0 ? 7 : r.getUTCDay(); // 1=Mon..7=Sun
    const isDelivery =
      weekType === '7DAYS' ? true :
      weekType === '6DAYS' ? dow !== 7 :
      dow !== 6 && dow !== 7;
    if (isDelivery) return r;
    r.setUTCDate(r.getUTCDate() + 1);
  }
  return r; // unreachable for sane inputs
}

export async function POST(req: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: '2025-06-30.basil' as Stripe.LatestApiVersion,
  });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  try {
    const bodyText = await req.text();
    const signature = req.headers.get('stripe-signature') as string;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(bodyText, signature, webhookSecret);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`❌ Webhook Error: ${errorMessage}`);
      return NextResponse.json({ error: `Webhook Error: ${errorMessage}` }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const metadata = session.metadata || {};
      const { user_id, plan, preference, location, vegDays, name, phone, start_date } = metadata;

      if (!user_id) {
        console.error('❌ Webhook Error: No user_id in metadata');
        return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
      }

      // Idempotency — Stripe retries on 5xx / timeout. If we've already seen this session, exit early.
      const { data: existingOrder } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('stripe_session_id', session.id)
        .maybeSingle();

      if (existingOrder) {
        console.log(`⏭️  Duplicate webhook for session ${session.id} — skipping`);
        return NextResponse.json({ received: true, deduped: true });
      }

      // Resolve the plan from the metadata. Unknown plans fall back to trial.
      const planDef = resolvePlan(plan) ?? resolvePlan('Trial');
      if (!planDef) {
        console.error('❌ Webhook Error: cannot resolve any plan');
        return NextResponse.json({ error: 'Unknown plan' }, { status: 400 });
      }
      const plan_name = planDef.label;
      const meals_per_day = planDef.mealsPerDay;

      // Snapshot the customer's week_type — once persisted on the sub, future
      // changes to customer.week_type won't retroactively rewrite this row's
      // delivery cadence or end_date math. We also fetch pending_* columns
      // so we can prefer pending values over current when the customer has
      // queued a change ("apply from next subscription"). Pending wins
      // because this IS the next subscription being created.
      const { data: customerRow } = await supabaseAdmin
        .from('customers')
        .select('week_type, meal_preference_type, allergens, spice_level_preference, veg_days, pending_meal_preference_type, pending_week_type, pending_allergens, pending_spice_level_preference, pending_veg_days')
        .eq('id', user_id)
        .maybeSingle();
      const effectiveWeekTypeRaw =
        customerRow?.pending_week_type ?? customerRow?.week_type;
      const weekType: WeekType =
        effectiveWeekTypeRaw === '5DAYS' ? '5DAYS' : '6DAYS';

      // Total meal count for this (plan, week_type). For 5DAYS plans this
      // is lower than the 6DAYS default (e.g., Monthly Premium 5DAYS = 20).
      const total_meals = totalMealsFor(planDef.id, weekType);

      // ── Determine start_date by queuing after the latest live tail ─────
      // Per state-machine spec: max 1 (Active|Paused|Skipped) + 1 Scheduled.
      // If any live sub exists, the new sub queues behind the latest one.
      // If nothing live, honour the user-picked start_date (or default today).
      const { data: liveSubs } = await supabaseAdmin
        .from('subscriptions')
        .select('id, end_date, status')
        .eq('customer_id', user_id)
        .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED])
        .order('end_date', { ascending: false });

      const tail = liveSubs?.[0];
      const todayMidnightUtc = new Date(); todayMidnightUtc.setUTCHours(0, 0, 0, 0);

      let startDate: Date;
      if (tail) {
        // Queue: start the day after tail.end_date, shifted to next delivery day
        const dayAfter = new Date(tail.end_date + 'T00:00:00Z');
        dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
        startDate = nextDeliveryDay(dayAfter, weekType);
        if (start_date) {
          console.warn(`⚠️  User ${user_id} picked start_date ${start_date} but live sub ${tail.id} forces queue-after; using ${isoDate(startDate)}`);
        }
      } else {
        // No live sub — use user pick (date-picker-validated upstream) or today
        startDate = start_date ? new Date(start_date + 'T00:00:00Z') : new Date(todayMidnightUtc);
        if (isNaN(startDate.getTime())) startDate = new Date(todayMidnightUtc);
        // Shift to next delivery day in case of edge cases (e.g. trial picks a Sunday)
        startDate = nextDeliveryDay(startDate, weekType);
      }

      const status = startDate.getTime() > todayMidnightUtc.getTime()
        ? SUBSCRIPTION_STATUS.SCHEDULED
        : SUBSCRIPTION_STATUS.ACTIVE;

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
      });

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
          // Religious-mix subs persist their per-day veg-day choices so the
          // dashboard menu + ops can render the right dish per day. Stripe
          // metadata is a flat string ('Monday, Wednesday'), so split back
          // to an array and validate against the working-day set for safety.
          veg_days: (() => {
            if (!vegDays) return null;
            const arr = String(vegDays).split(',').map(s => s.trim()).filter(Boolean);
            if (arr.length === 0) return null;
            const allowed = new Set(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']);
            const clean = arr.filter(d => allowed.has(d));
            return clean.length > 0 ? clean : null;
          })(),
        })
        .select()
        .single();

      if (subError) {
        console.error('❌ Supabase Subscription Error:', subError);
        return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
      }

      // 2. Insert Order
      const amountTotal = session.amount_total ? session.amount_total / 100 : 0;
      const pricePerMeal = amountTotal / total_meals;

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
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (orderError || !orderData) {
        console.error('❌ Supabase Order Error:', orderError);
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
      }

      const orderId = orderData.id as string;

      // ── Dorm Wars: flip redeemed credits to 'applied' ─────────────────
      // Primary path: read the credit row IDs the checkout route stamped on
      // session metadata. The CAS guard (`.eq('status','approved')`) is the
      // idempotency key — a Stripe webhook retry re-runs this block but
      // matches 0 rows on the second pass (RESEARCH Pitfall #2).
      //
      // Fallback path: if metadata IDs are missing but Stripe shows a
      // discount was applied to this session, re-derive the credits to flip
      // from the approved-credit balance in created_at order. This handles
      // metadata loss in transit and partial-discount scenarios.
      //
      // Must run BEFORE `creditInviterOnConversion` below so the redeemed
      // credits settle before any new conversion credit is awarded.
      const metaIds = (session.metadata?.applied_credit_ids ?? '')
        .split(',')
        .filter(Boolean);
      const discountFils =
        (session.amount_subtotal ?? 0) - (session.amount_total ?? 0);

      console.log(
        `💳 credit flip — session ${session.id} order ${orderId} ` +
        `metadataIds=[${metaIds.join(',')}] discountFils=${discountFils}`
      );

      let idsToFlip: string[] = metaIds;
      if (idsToFlip.length === 0 && discountFils > 0) {
        // Fallback — pull approved credits, take in order until we cover the discount.
        const { data: candidates } = await supabaseAdmin
          .from('credits')
          .select('id, amount_aed')
          .eq('customer_id', user_id)
          .eq('status', 'approved')
          .order('created_at', { ascending: true });
        let acc = 0;
        const picked: string[] = [];
        for (const c of candidates ?? []) {
          if (acc >= discountFils) break;
          picked.push(c.id as string);
          acc += Math.round(Number(c.amount_aed) * 100);
        }
        idsToFlip = picked;
        console.log(
          `💳 metadata-loss fallback — picked ${picked.length} credit row(s) ` +
          `summing to ${acc} fils to cover ${discountFils} fils discount`
        );
      }

      if (idsToFlip.length > 0) {
        const { error: flipErr, count: flippedCount } = await supabaseAdmin
          .from('credits')
          .update(
            {
              status: 'applied',
              applied_at: new Date().toISOString(),
              applied_to: orderId,
            },
            { count: 'exact' },
          )
          .in('id', idsToFlip)
          .eq('status', 'approved');
        if (flipErr) {
          console.error('⚠️  credit flip to applied failed (non-fatal):', flipErr);
        } else {
          console.log(
            `💳 Flipped ${flippedCount ?? 0}/${idsToFlip.length} credit row(s) ` +
            `to applied for order ${orderId}`
          );
        }
      }

      // 3. Update Customer Profile with the latest data + drain any pending
      // preferences. The new subscription IS the "next subscription" the
      // pending_* values were waiting for — once it's been written, the
      // customer's canonical fields can flip to match, and pending_* is
      // cleared so the dashboard banner disappears.
      //
      // Field-by-field precedence: pending → request body → existing
      // customer column → null. The webhook payload already carries the
      // user's chosen veg_days; allergens / spice / week_type don't ride
      // the payload (they're profile-only), so pending_* is the channel
      // for those.
      const customerPatch: Record<string, unknown> = {
        name,
        whatsapp_number: phone,
        dorm_name: location,
        meal_preference_type:
          customerRow?.pending_meal_preference_type ?? preference,
        week_type: weekType,
      };
      if (customerRow?.pending_allergens != null) {
        customerPatch.allergens = customerRow.pending_allergens;
      }
      if (customerRow?.pending_spice_level_preference != null) {
        customerPatch.spice_level_preference =
          customerRow.pending_spice_level_preference;
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
      const isReligiousNow = /religious/i.test(preference);
      if (isReligiousNow) {
        const allowedDays = new Set(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']);
        const payloadDays =
          typeof vegDays === 'string' && vegDays.trim().length > 0
            ? vegDays.split(',').map(s => s.trim()).filter(d => allowedDays.has(d))
            : [];
        if (payloadDays.length > 0) {
          customerPatch.veg_days = payloadDays;
        } else if (Array.isArray(customerRow?.pending_veg_days) && customerRow.pending_veg_days.length > 0) {
          customerPatch.veg_days = customerRow.pending_veg_days;
        }
      } else {
        customerPatch.veg_days = null;
      }
      // Always clear pending_* — even if every field was null, the explicit
      // null-out is a no-op so the cost is negligible and it keeps the
      // post-state predictable.
      customerPatch.pending_meal_preference_type = null;
      customerPatch.pending_week_type = null;
      customerPatch.pending_allergens = null;
      customerPatch.pending_spice_level_preference = null;
      customerPatch.pending_veg_days = null;

      const { error: customerError } = await supabaseAdmin
        .from('customers')
        .update(customerPatch)
        .eq('id', user_id);

      if (customerError) {
        // Don't fail the webhook — subscription + order are already saved.
        // Log for reconciliation between `customers` and `subscriptions`.
        console.error('⚠️  Customer profile update failed:', customerError);
      }

      // Fire referral conversion credit — idempotent, non-blocking.
      // Runs after order is written so the inviter earns credit only on real payment.
      creditInviterOnConversion(user_id).catch(err =>
        console.error('⚠️  creditInviterOnConversion failed (non-fatal):', err)
      );

      // Link the invitee's new account to any referral row waiting for their user_id.
      // The referral row was written with invitee_phone at gift-claim time;
      // now that signup is complete we close the loop so future queries work.
      if (phone) {
        const { normalisePhone } = await import('@/lib/phone');
        const phoneE164 = normalisePhone(phone);
        supabaseAdmin
          .from('referrals')
          .update({ invitee_user_id: user_id })
          .eq('invitee_phone', phoneE164)
          .is('invitee_user_id', null)
          .then(({ error: linkErr }) => {
            if (linkErr) console.error('⚠️  referral user_id link failed:', linkErr);
          });
      }

      console.log(`✅ Successfully processed checkout for user ${user_id}`);
    }

    return NextResponse.json({ received: true });

  } catch (error: unknown) {
    console.error('❌ Webhook overall error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

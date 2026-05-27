import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolvePlan, totalMealsFor, planKindOf } from '@/contexts/subscriptions/domain/plans';
import { creditInviterOnConversion } from '@/app/r/[cid]/actions';
import { getActiveLifetimeTierPercent } from '@/contexts/dorm-wars/domain/repo';
import {
  SUBSCRIPTION_STATUS,
  LIVE_SUBSCRIPTION_STATUSES,
  INVOICE_STATUS,
} from '@/contexts/subscriptions/domain/subscription-status';
import { computeEndDate, isoDate, type WeekType } from '@/contexts/subscriptions/domain/end-date';
import { runPostPaymentFanout } from '@/contexts/payments/usecases/post-payment-fanout';

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
        .maybeSingle();

      if (existingOrder?.webhook_completed_at) {
        console.log(`⏭️  Duplicate webhook for session ${session.id} — fully processed before, skipping`);
        return NextResponse.json({ received: true, deduped: true });
      }
      const resumeMode = Boolean(existingOrder); // truthy when order exists but webhook_completed_at is null

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
        .select('cid, week_type, meal_preference_type, allergens, spice_level_preference, veg_days, pending_meal_preference_type, pending_week_type, pending_allergens, pending_spice_level_preference, pending_veg_days')
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

      // ── Subscription + Order insert (skipped in resume mode) ───────────
      // Both are non-idempotent (would create duplicates), so on retry of a
      // partially-completed webhook we reuse the existing IDs and jump
      // straight to the idempotent downstream steps.
      let orderId: string;
      if (resumeMode) {
        orderId = existingOrder!.id as string;
        console.log(
          `🔁 Resuming webhook for session ${session.id} — order ${orderId} ` +
          `already saved, replaying downstream steps`
        );
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

        orderId = orderData.id as string;
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

      const metaCreditFils = Number(session.metadata?.credit_applied_fils ?? '0') || 0;
      const metaTierFils = Number(session.metadata?.tier_applied_fils ?? '0') || 0;
      const reservationToken = session.metadata?.reservation_token ?? '';
      const stripeDiscountFils =
        (session.amount_subtotal ?? 0) - (session.amount_total ?? 0);

      // CAS source: when checkout reserved the rows (new flow), they're now
      // status='reserved' and we flip reserved→applied keyed by token. Older
      // sessions (pre-reservation deploy) or fallback path use the legacy
      // status='approved' CAS.
      const flipFromStatus = reservationToken ? 'reserved' : 'approved';

      let fullRowIds: string[] = [];
      let splitToProcess: { id: string; useFils: number } | null = null;

      if (metaCreditFils > 0) {
        // Trust metadata — primary path.
        fullRowIds = (session.metadata?.applied_credit_ids ?? '')
          .split(',')
          .filter(Boolean);
        const splitId = session.metadata?.split_credit_id ?? '';
        const splitUseFils = Number(session.metadata?.split_credit_use_fils ?? '0') || 0;
        if (splitId && splitUseFils > 0) {
          splitToProcess = { id: splitId, useFils: splitUseFils };
        }
        console.log(
          `💳 credit flip (metadata) — session ${session.id} order ${orderId} ` +
          `creditFils=${metaCreditFils} fullIds=[${fullRowIds.join(',')}] ` +
          `split=${splitId || 'none'}:${splitUseFils}`
        );
      } else if (stripeDiscountFils > 0) {
        // Fallback — Stripe shows a discount but our metadata is empty.
        // Audit P1-15: the naive `stripeDiscountFils - metaTierFils` was
        // wrong because when metadata is missing metaTierFils is ALSO 0,
        // so the whole discount got attributed to credit and we over-burned
        // rows that should have been the tier % portion. Re-derive the
        // tier % from the user's current lifetime tier so the math matches
        // what coupon-synth would have produced at checkout time.
        let derivedTierFils = metaTierFils;
        if (derivedTierFils === 0) {
          const tierPercent = await getActiveLifetimeTierPercent(supabaseAdmin, user_id);
          if (tierPercent > 0) {
            const planFils = session.amount_subtotal ?? 0;
            derivedTierFils = Math.floor((planFils * tierPercent) / 100);
            console.log(
              `💳 fallback tier derivation — tierPercent=${tierPercent}% on ` +
              `planFils=${planFils} → tierFils=${derivedTierFils}`
            );
          }
        }
        const targetCreditFils = stripeDiscountFils - derivedTierFils;
        if (targetCreditFils > 0) {
          const { data: candidates } = await supabaseAdmin
            .from('credits')
            .select('id, amount_aed')
            .eq('customer_id', user_id)
            .eq('status', 'approved')
            .order('created_at', { ascending: true });
          let acc = 0;
          for (const c of candidates ?? []) {
            const cFils = Math.round(Number(c.amount_aed) * 100);
            if (acc + cFils <= targetCreditFils) {
              fullRowIds.push(c.id as string);
              acc += cFils;
              if (acc === targetCreditFils) break;
            } else {
              const useFils = targetCreditFils - acc;
              if (useFils > 0) splitToProcess = { id: c.id as string, useFils };
              break;
            }
          }
          console.log(
            `💳 credit flip (fallback) — session ${session.id} order ${orderId} ` +
            `targetCreditFils=${targetCreditFils} fullIds=[${fullRowIds.join(',')}] ` +
            `split=${splitToProcess?.id ?? 'none'}:${splitToProcess?.useFils ?? 0}`
          );
        }
      } else {
        console.log(
          `💳 credit flip skipped — no discount on session ${session.id}`
        );
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
          .eq('status', flipFromStatus);
        if (flipErr) {
          console.error('⚠️  credit flip to applied failed (non-fatal):', flipErr);
        } else {
          console.log(
            `💳 Flipped ${flippedCount ?? 0}/${fullRowIds.length} credit row(s) ` +
            `from ${flipFromStatus} to applied for order ${orderId}`
          );
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
          .maybeSingle();
        if (!splitRow) {
          console.warn(
            `⚠️  split credit row ${splitToProcess.id} not found in expected ` +
            `status (${flipFromStatus}) — skipping split (idempotent re-run, ` +
            `or external state change)`
          );
        } else {
          const totalFils = Math.round(Number(splitRow.amount_aed) * 100);
          const remainderFils = totalFils - splitToProcess.useFils;
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
            .eq('status', flipFromStatus);
          if (splitFlipErr) {
            console.error('⚠️  split credit flip failed (non-fatal):', splitFlipErr);
          } else if (remainderFils > 0) {
            const { error: insertErr } = await supabaseAdmin.from('credits').insert({
              customer_id: user_id,
              amount_aed: remainderFils / 100,
              source: `${splitRow.source}_split_remainder`,
              status: 'approved',
            });
            if (insertErr) {
              console.error(
                '⚠️  split remainder insert failed — user may have lost credit:',
                insertErr,
              );
            } else {
              console.log(
                `💳 Split credit ${splitToProcess.id}: used ${splitToProcess.useFils} ` +
                `fils for order ${orderId}, carried ${remainderFils} fils forward`
              );
            }
          } else {
            console.log(
              `💳 Split credit ${splitToProcess.id}: fully consumed (remainder=0)`
            );
          }
        }
      }

      // 3. Update Customer Profile with the latest data + drain any pending
      // preferences. Skipped in resume mode — the first attempt already
      // patched the customer; re-running could clobber subsequent user
      // edits to pending_*.
      if (resumeMode) {
        console.log(`🔁 Resume mode — skipping customer patch (already applied)`);
      } else {
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
      } // end of !resumeMode

      // Link the invitee's new account to any referral row waiting for their
      // user_id. The referral row was written with invitee_phone at
      // gift-claim time; now that signup is complete we close the loop so
      // future queries work. This MUST run BEFORE creditInviterOnConversion
      // so the awarder's queries (which key on inviter_user_id and look up
      // referrals.invitee_user_id) see the linked row.
      if (phone) {
        const { normalisePhone } = await import('@/shared/phone');
        const phoneE164 = normalisePhone(phone);
        const { error: linkErr } = await supabaseAdmin
          .from('referrals')
          .update({ invitee_user_id: user_id })
          .eq('invitee_phone', phoneE164)
          .is('invitee_user_id', null);
        if (linkErr) console.error('⚠️  referral user_id link failed:', linkErr);
      }

      // Fire referral conversion credit — MUST be awaited. On serverless
      // (Netlify Functions) the function instance can be torn down as soon as
      // the response is sent, killing any in-flight Promise. A fire-and-forget
      // here would intermittently drop Layer 1 (AED 20) credits and entire
      // Layer 2/3 milestone fires under load. Idempotent on retry via the
      // referrals.status='gift_claimed' guard inside creditInviterOnConversion.
      try {
        await creditInviterOnConversion(user_id);
      } catch (err) {
        console.error('⚠️  creditInviterOnConversion failed (non-fatal):', err);
      }

      // Mark the order as fully processed so retries see the checkpoint and
      // skip re-running downstream steps. If this update fails (extremely
      // unlikely — pure UPDATE on a known row), the worst case is the next
      // retry redoes the idempotent downstream work, which is safe by design.
      const { error: completeErr } = await supabaseAdmin
        .from('orders')
        .update({ webhook_completed_at: new Date().toISOString() })
        .eq('id', orderId);
      if (completeErr) {
        console.error('⚠️  failed to mark webhook_completed_at:', completeErr);
      }

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
      const amountTotalAed = session.amount_total ? session.amount_total / 100 : 0;
      const pricePerMealEff = total_meals > 0 ? amountTotalAed / total_meals : 0;
      const customerEmail = session.customer_details?.email ?? '';
      if (customerEmail) {
        try {
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
              startDateIso: isoDate(startDate),
              sessionId: session.id,
              paymentIntentId: (session.payment_intent as string) ?? '',
              paymentDateIso: new Date().toISOString().slice(0, 10),
            },
            { skipChannels: ['zoho'] },
          );
        } catch (err) {
          console.error('⚠️  post-payment fan-out wrapper threw:', err);
        }

        // Schedule the Zoho receipt for T+2min. The dispatch_zoho_due cron
        // picks this up next minute boundary.
        const { error: schedErr } = await supabaseAdmin
          .from('orders')
          .update({
            zoho_scheduled_for: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
          })
          .eq('id', orderId);
        if (schedErr) {
          console.error('⚠️  failed to set zoho_scheduled_for:', schedErr);
        }
      } else {
        console.warn(
          `⚠️  post-payment fan-out skipped — no customer email on session ${session.id}; ` +
          `retry cron will catch this once the customers row is patched`,
        );
      }

      console.log(`✅ Successfully processed checkout for user ${user_id} (resume=${resumeMode})`);
    }

    // ── charge.refunded — restore burned credits when ops refunds an order
    // Fixes audit P0-11. Without this branch a refund flow leaves the user
    // with status='applied' credit rows tied to a charge that no longer
    // exists, AND Stripe gives them cash back — net result is the user loses
    // the credit they "spent" on the refunded purchase. We undo the flip:
    //   • Find the order by stripe_payment_id (the charge.id)
    //   • Flip every credits row with applied_to=<order.id> back to approved
    //   • Clear applied_at, applied_to so the rows look untouched
    //   • Mark the order as refunded (invoice_status='Refunded')
    //
    // Mystery Cash Drop / cycle / tier deposits that landed AFTER the refunded
    // checkout are intentionally NOT clawed back — those are independent
    // rewards. Only the credits redeemed AT the refunded checkout flip back.
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;
      if (!paymentIntentId) {
        console.warn(`charge.refunded ${charge.id} had no payment_intent — skipping credit restore`);
        return NextResponse.json({ received: true, refund_handled: false });
      }
      const { data: orderRow } = await supabaseAdmin
        .from('orders')
        .select('id, customer_id, invoice_status')
        .eq('stripe_payment_id', paymentIntentId)
        .maybeSingle();
      if (!orderRow) {
        console.warn(`charge.refunded for payment_intent=${paymentIntentId} matches no order — skipping`);
        return NextResponse.json({ received: true, refund_handled: false });
      }
      // Restore credits: applied → approved, clear the linkage.
      const { count: restoredCount, error: restoreErr } = await supabaseAdmin
        .from('credits')
        .update(
          { status: 'approved', applied_at: null, applied_to: null },
          { count: 'exact' },
        )
        .eq('applied_to', orderRow.id)
        .eq('status', 'applied');
      if (restoreErr) {
        console.error(`❌ refund credit restore failed for order ${orderRow.id}:`, restoreErr);
      } else {
        console.log(`↩️  Refund — restored ${restoredCount ?? 0} credit row(s) for order ${orderRow.id}`);
      }
      // Mark the order so dashboards / reports reflect the refund.
      await supabaseAdmin
        .from('orders')
        .update({ invoice_status: 'Refunded' })
        .eq('id', orderRow.id);
      return NextResponse.json({ received: true, refund_handled: true, restored: restoredCount ?? 0 });
    }

    return NextResponse.json({ received: true });

  } catch (error: unknown) {
    console.error('❌ Webhook overall error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

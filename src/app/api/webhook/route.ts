import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolvePlan } from '@/lib/plans';
import {
  SUBSCRIPTION_STATUS,
  LIVE_SUBSCRIPTION_STATUSES,
  INVOICE_STATUS,
} from '@/lib/subscription-status';

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

      // Resolve the plan from the metadata. Unknown plans fall back to the
      // trial definition (1 meal, 1 day) — same defensive default as before.
      const planDef = resolvePlan(plan) ?? {
        label: 'One-Time Trial',
        totalMeals: 1,
        durationDays: 1,
        mealsPerDay: 1,
      };
      const plan_name = planDef.label;
      const total_meals = planDef.totalMeals;
      const duration_days = planDef.durationDays;
      const meals_per_day = planDef.mealsPerDay;

      // Calculate start and end dates — honor user-picked start_date if provided
      const startDate = start_date ? new Date(start_date) : new Date();
      // Guard against invalid date
      if (isNaN(startDate.getTime())) startDate.setTime(Date.now());
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + duration_days);

      // If start date is in the future, mark as Scheduled — otherwise Active immediately.
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const status = startDate > todayMidnight ? SUBSCRIPTION_STATUS.SCHEDULED : SUBSCRIPTION_STATUS.ACTIVE;

      // If new sub overlaps an existing Active sub for this user (same start before existing end_date),
      // end the existing one. Future-dated subs do NOT touch the current Active.
      if (status === SUBSCRIPTION_STATUS.ACTIVE) {
        await supabaseAdmin
          .from('subscriptions')
          .update({ status: SUBSCRIPTION_STATUS.ENDED })
          .eq('customer_id', user_id)
          .in('status', LIVE_SUBSCRIPTION_STATUSES);
      }

      // 1. Insert Subscription
      const { data: subData, error: subError } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          customer_id: user_id,
          plan_name: plan_name,
          status: status,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          meals_per_day: meals_per_day,
          total_meals: total_meals,
          delivered_meals: 0,
          paused_days: 0,
          has_paused_before: false,
          skipped_meals_count: 0
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

      const { error: orderError } = await supabaseAdmin
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
        });

      if (orderError) {
        console.error('❌ Supabase Order Error:', orderError);
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
      }

      // 3. Update Customer Profile with the latest data
      const { error: customerError } = await supabaseAdmin
        .from('customers')
        .update({
          name: name,
          whatsapp_number: phone,
          dorm_name: location,
          meal_preference_type: preference
        })
        .eq('id', user_id);

      if (customerError) {
        // Don't fail the webhook — subscription + order are already saved.
        // Log for reconciliation between `customers` and `subscriptions`.
        console.error('⚠️  Customer profile update failed:', customerError);
      }

      console.log(`✅ Successfully processed checkout for user ${user_id}`);
    }

    return NextResponse.json({ received: true });

  } catch (error: unknown) {
    console.error('❌ Webhook overall error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

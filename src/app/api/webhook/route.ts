import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
      const { user_id, plan, preference, location, vegDays, name, phone } = metadata;

      if (!user_id) {
        console.error('❌ Webhook Error: No user_id in metadata');
        return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
      }

      // Determine Plan Constraints
      let plan_name = 'One-Time Trial';
      let total_meals = 1;
      let duration_days = 1;

      if (plan?.includes('Monthly Premium')) {
        plan_name = 'Monthly Premium';
        total_meals = 24;
        duration_days = 28;
      } else if (plan?.includes('Weekly Flex')) {
        plan_name = 'Weekly Flex';
        total_meals = 6;
        duration_days = 7;
      }

      // Calculate start and end dates
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + duration_days);

      // 1. Insert Subscription
      const { data: subData, error: subError } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          customer_id: user_id,
          plan_name: plan_name,
          status: 'Active',
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          meals_per_day: 1,
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
          invoice_status: 'Paid',
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
      await supabaseAdmin
        .from('customers')
        .update({
          name: name,
          whatsapp_number: phone,
          dorm_name: location,
          meal_preference_type: preference
        })
        .eq('id', user_id);

      console.log(`✅ Successfully processed checkout for user ${user_id}`);
    }

    return NextResponse.json({ received: true });

  } catch (error: unknown) {
    console.error('❌ Webhook overall error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

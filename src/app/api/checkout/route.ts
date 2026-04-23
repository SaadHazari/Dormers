import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    console.error("❌ Stripe secret key missing in environment!");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2025-06-30.basil' as Stripe.LatestApiVersion // <-- Replace with latest valid version
  });

  try {
    // Fetch the authenticated user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const body = await req.json();

    const {
      amount,
      name,
      email,
      phone,
      location,
      preference,
      plan,
      vegDays,
    }: {
      amount: number;
      name: string;
      email: string;
      phone: string;
      location: string;
      preference: string;
      plan: string;
      vegDays?: string[];
    } = body;

    if (!amount || amount < 100) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }



    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aed',
            product_data: {
              name: 'Dormer Meal Plan',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3004'}/dashboard?checkout_success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3004'}/dashboard?checkout_canceled=true`,
      payment_intent_data: {
        metadata: {
          user_id: user.id,
          name,
          email,
          phone,
          location,
          preference,
          plan,
          vegDays: vegDays ? vegDays.join(', ') : '',
        },
      },
      metadata: { // Added to session level as well for webhook ease
          user_id: user.id,
          name,
          email,
          phone,
          location,
          preference,
          plan,
          vegDays: vegDays ? vegDays.join(', ') : '',
      }
    });

    return NextResponse.json({ url: session.url });

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('❌ Stripe error:', err?.message || error);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

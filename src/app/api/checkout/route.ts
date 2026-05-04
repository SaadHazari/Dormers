import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { resolvePlan } from '@/lib/plans';

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
      start_date,
      cancel_path,
    }: {
      amount: number;
      name: string;
      email: string;
      phone: string;
      location: string;
      preference: string;
      plan: string;
      vegDays?: string[];
      start_date?: string;
      cancel_path?: string;
    } = body;

    if (!amount || amount < 100) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Plan whitelist + minimum-price guard — prevents charging AED 1 for a
    // "Monthly Max" plan by tampering with the body. Source of truth for
    // minimums is lib/plans.ts.
    const planDef = resolvePlan(plan);
    if (!planDef) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }
    if (amount < planDef.minPriceFils) {
      return NextResponse.json({ error: 'Amount too low for selected plan' }, { status: 400 });
    }

    // start_date must be a YYYY-MM-DD string for tomorrow ≤ start ≤ today+31
    // (the same window the date picker enforces). Without this guard, a
    // tampered POST could schedule a sub starting yesterday — which the webhook
    // would store as `Active` immediately, bypassing the kitchen-prep window.
    if (start_date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
        return NextResponse.json({ error: 'Invalid start_date format' }, { status: 400 });
      }
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const minStart = new Date(today); minStart.setDate(minStart.getDate() + 1);
      const maxStart = new Date(today); maxStart.setDate(maxStart.getDate() + 31);
      const requested = new Date(start_date + 'T00:00:00');
      if (isNaN(requested.getTime()) || requested < minStart || requested > maxStart) {
        return NextResponse.json({ error: 'start_date must be within the allowed window' }, { status: 400 });
      }
    }

    // Only accept same-origin paths to prevent open-redirect via Stripe.
    const safeCancelPath =
      typeof cancel_path === 'string' && /^\/[^/\\]/.test(cancel_path)
        ? cancel_path
        : '/dashboard';
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3004';
    const cancelSep = safeCancelPath.includes('?') ? '&' : '?';

    const session = await stripe.checkout.sessions.create({
      customer_email: user.email ?? email,
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
      success_url: `${base}/dashboard?checkout_success=true`,
      cancel_url: `${base}${safeCancelPath}${cancelSep}checkout_canceled=true`,
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
          start_date: start_date ?? '',
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
        start_date: start_date ?? '',
      }
    });

    return NextResponse.json({ url: session.url });

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('❌ Stripe error:', err?.message || error);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil' as Stripe.LatestApiVersion,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      amount,
      name,
      email,
      phone,
      location,
      mealType,
      duration,
      dietaryRestrictions,
      startDate,
    }: {
      amount: number;
      name: string;
      email: string;
      phone: string;
      location: string;
      mealType: string;
      duration: string;
      dietaryRestrictions: string;
      startDate: string;
    } = body;

    if (!amount || amount < 100) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const queryParams = new URLSearchParams({
      name,
      email,
      phone,
      location,
      mealType,
      duration,
      dietaryRestrictions,
      startDate,
    });

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
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?${queryParams}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/cancel`,
      payment_intent_data: {
        metadata: {
          name,
          email,
          phone,
          location,
          mealType,
          duration,
          dietaryRestrictions,
          startDate,
        },
      },
    });

    return NextResponse.json({ url: session.url });

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('❌ Stripe error:', err?.message || error);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

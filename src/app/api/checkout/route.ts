import Stripe from 'stripe';
import { NextResponse } from 'next/server';

console.log("🔐 Stripe Secret Key:", process.env.STRIPE_SECRET_KEY); // Check if key exists

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil' as any, // <-- bypass type check
});


export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("✅ Received payload:", body);

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
    } as Record<string, string>); // force type

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

  } catch (error: any) {
    console.error('❌ Stripe error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

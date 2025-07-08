import Stripe from 'stripe';
import { NextResponse } from 'next/server';

console.log('🔐 Starting Stripe Checkout handler');

// ✅ Add this log to check if secret key is loaded
console.log("🟡 process.env.STRIPE_SECRET_KEY exists:", !!process.env.STRIPE_SECRET_KEY);
console.log("🟡 process.env.NEXT_PUBLIC_BASE_URL:", process.env.NEXT_PUBLIC_BASE_URL);

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.error("❌ Stripe secret key missing in environment!");
  throw new Error("Missing Stripe secret key");
}

const stripe = new Stripe(stripeSecretKey, {
  // ✅ Use a valid public Stripe API version (don't use `.basil`)
  apiVersion: '2024-08-01' as Stripe.LatestApiVersion,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("✅ Received body:", JSON.stringify(body));

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
      console.warn("⚠️ Invalid amount received:", amount);
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

    console.log("🧾 Creating Stripe Checkout session...");
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

    console.log("✅ Stripe session created:", session.id);
    return NextResponse.json({ url: session.url });

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('❌ Stripe error:', err?.message || error);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

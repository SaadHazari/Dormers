
import Stripe from 'stripe';
import { NextResponse } from 'next/server';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
export async function POST(req: Request) {
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
    } = await req.json();

    if (!amount || amount < 100) {
        return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // ✅ Forward data to success_url as query params
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

    try {
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
        if (error instanceof Error) {
            console.error('Stripe error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        } else {
            console.error('Unexpected error', error);
            return NextResponse.json({ error: 'Unknown error occurred' }, { status: 500 });
        }
    }

}
// adil

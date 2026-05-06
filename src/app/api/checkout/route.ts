import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { resolvePlan, minPriceFilsFor } from '@/lib/plans';
import type { WeekType } from '@/lib/end-date';
import { SUBSCRIPTION_STATUS } from '@/lib/subscription-status';
import { missingProfileFields } from '@/lib/profile-completion';

// 15-day cooldown between Trial purchases per customer (per user spec).
const TRIAL_COOLDOWN_DAYS = 15;

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

    // Plan whitelist — minimum-price floor is checked AFTER we know the
    // customer's week_type below (the floor differs: 5DAYS Weekly Flex Veg
    // = AED 95, 6DAYS = AED 114; checking against the 6DAYS floor here
    // would reject legitimate 5DAYS submissions).
    const planDef = resolvePlan(plan);
    if (!planDef) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
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

    // ── Profile-completion gate ────────────────────────────────────────────
    // UI gate is bypassable via direct POST. Server is authoritative.
    // Also fetches customer.week_type which the religious-mix validation below
    // uses as the cap for vegDays count.
    const { data: customerRow } = await supabase
      .from('customers')
      .select('name, dorm_name, meal_preference_type, whatsapp_number, whatsapp_verified, week_type, out_of_zone')
      .eq('id', user.id)
      .maybeSingle();

    const missing = missingProfileFields(customerRow);
    if (missing.length > 0) {
      return NextResponse.json({
        error: 'PROFILE_INCOMPLETE',
        message: `Finish your profile before purchasing. Still needed: ${missing.join(', ')}.`,
        missing,
      }, { status: 409 });
    }

    // Minimum-price floor — week_type-aware so 5DAYS submissions don't get
    // rejected against the 6DAYS floor. Tamper-defense: prevents AED 1 /
    // Monthly Max via the cheapest-preference × cycle-meals lower bound.
    const customerWeekType: WeekType = customerRow?.week_type === '5DAYS' ? '5DAYS' : '6DAYS';
    if (amount < minPriceFilsFor(planDef.id, customerWeekType)) {
      return NextResponse.json({ error: 'Amount too low for selected plan' }, { status: 400 });
    }

    // ── Out-of-zone gate ───────────────────────────────────────────────────
    // Set true at onboarding when customer picked "Other" for dorm. Cleared
    // by customer-service via Supabase admin once delivery is confirmed.
    if (customerRow?.out_of_zone) {
      return NextResponse.json({
        error: 'OUT_OF_ZONE',
        message: 'Your dorm is outside our usual delivery radius. Please message us on WhatsApp so we can confirm coverage before you buy a plan.',
      }, { status: 409 });
    }

    // ── Religious-mix veg-days validation (week_type-aware) ────────────────
    // For a religious-mix purchase, vegDays must:
    //   • have length in 1..(W-1) where W = days/week (5 or 6)
    //     — picking all-veg defeats "mix"; those customers should switch
    //       their top-level preference to plain Veg instead
    //   • contain only working day names for this week_type
    //     (Mon–Fri for 5DAYS, Mon–Sat for 6DAYS)
    //   • be unique
    // Without this guard a tampered POST could submit 5 veg days for a
    // 5DAYS plan and get charged the wrong-tier price, or persist a stale
    // 'Saturday' that the dashboard menu would silently drop.
    if (preference === 'Religious Preference' || /religious/i.test(preference)) {
      const W = (customerRow?.week_type === '5DAYS') ? 5 : 6;
      const allowed = new Set(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].slice(0, W));
      const list = Array.isArray(vegDays) ? vegDays : [];
      const n = list.length;
      const unique = new Set(list).size === n;
      const allInRange = list.every(d => allowed.has(d));
      if (n < 1 || n > W - 1 || !unique || !allInRange) {
        return NextResponse.json({
          error: 'VEG_DAYS_INVALID',
          message: `Pick 1–${W - 1} unique veg days from your ${W}-day working week. Switch to fully vegetarian on your profile if you want all-veg.`,
        }, { status: 400 });
      }
    }

    // ── Live-sub guard — 1 queue slot per customer ─────────────────────────
    // The state machine allows at most: 1 (Active|Paused|Skipped) + 1 Scheduled.
    // If a Scheduled already exists, block this checkout — the user already
    // has the next plan queued. Doing this pre-Stripe avoids a charge that
    // can't be auto-refunded.
    const { data: existingScheduled } = await supabase
      .from('subscriptions')
      .select('id, plan_name, start_date')
      .eq('customer_id', user.id)
      .eq('status', SUBSCRIPTION_STATUS.SCHEDULED)
      .limit(1)
      .maybeSingle();

    if (existingScheduled) {
      return NextResponse.json({
        error: 'QUEUE_FULL',
        message: `You already have a ${existingScheduled.plan_name} queued to start ${existingScheduled.start_date}. Wait until your current plan ends before queuing another.`,
      }, { status: 409 });
    }

    // ── Trial cooldown — 15 days between Trial purchases ───────────────────
    if (planDef.id === 'trial') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - TRIAL_COOLDOWN_DAYS);
      const { data: recentTrial } = await supabase
        .from('subscriptions')
        .select('id, start_date')
        .eq('customer_id', user.id)
        .ilike('plan_name', '%trial%')
        .gte('start_date', cutoff.toISOString().slice(0, 10))
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentTrial) {
        const earliestNext = new Date(recentTrial.start_date);
        earliestNext.setDate(earliestNext.getDate() + TRIAL_COOLDOWN_DAYS);
        return NextResponse.json({
          error: 'TRIAL_COOLDOWN',
          message: `You can try the trial again from ${earliestNext.toISOString().slice(0, 10)}. Pick a full plan if you'd like to start sooner.`,
        }, { status: 409 });
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

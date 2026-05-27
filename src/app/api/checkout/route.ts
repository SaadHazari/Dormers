import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { resolvePlan, minPriceFilsFor } from '@/contexts/subscriptions/domain/plans';
import type { WeekType } from '@/contexts/subscriptions/domain/end-date';
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status';
import { missingProfileFields } from '@/contexts/subscriptions/domain/profile-completion';
import { synthesizePerSessionCoupon } from '@/contexts/dorm-wars/domain/coupon-synth';
import { getRedeemableCredit, getActiveLifetimeTierPercent } from '@/utils/supabase/queries';

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

    // start_date must be a YYYY-MM-DD inside the allowed window — the same
    // window the date picker enforces. Without this guard, a tampered POST
    // could schedule a sub starting yesterday — which the webhook would store
    // as `Active` immediately, bypassing the kitchen-prep window.
    //
    // Window depends on whether the customer already has a live sub and on
    // the Asia/Dubai clock:
    //   • Live sub                    → tomorrow ≤ start ≤ today+31 (no overlap)
    //   • No live sub, AE < 14:00 AE  → today    ≤ start ≤ today+31 (same-day allowed)
    //   • No live sub, AE ≥ 14:00 AE  → tomorrow ≤ start ≤ today+31 (kitchen prepping)
    if (start_date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
        return NextResponse.json({ error: 'Invalid start_date format' }, { status: 400 });
      }
      // Cheap pre-check for any live sub. If one exists, same-day starts are
      // disallowed regardless of clock time. Mirrors LIVE_SUBSCRIPTION_STATUSES
      // (Active | Paused | Skipped) — Scheduled is gated separately below.
      const { data: liveSub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('customer_id', user.id)
        .in('status', ['Active', 'Paused', 'Skipped'])
        .limit(1)
        .maybeSingle();

      // AE = UTC+4 year-round (no DST). Server-authoritative — even if the
      // client computed the cutoff differently, this is the boundary that
      // counts for what the kitchen can actually deliver.
      const aeHour = new Date(Date.now() + 4 * 60 * 60 * 1000).getUTCHours();
      const sameDayAllowed = !liveSub && aeHour < 14;

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const minStart = new Date(today);
      if (!sameDayAllowed) minStart.setDate(minStart.getDate() + 1);
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
      .select('name, dorm_name, meal_preference_type, whatsapp_number, whatsapp_verified, week_type, pending_week_type, out_of_zone')
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

    // Effective week_type — pending wins for renewals, mirroring the
    // webhook's create-time resolution. Without the pending fallback the
    // price-floor + veg-day caps below would judge a queued 5DAYS sub
    // against the customer's still-canonical 6DAYS column, allowing a
    // tampered submit (e.g. 5 veg days for a 5DAYS sub = all-veg, which
    // defeats "Religious Mix") to slip past validation.
    const effectiveWeekTypeRaw =
      customerRow?.pending_week_type ?? customerRow?.week_type;
    const customerWeekType: WeekType = effectiveWeekTypeRaw === '5DAYS' ? '5DAYS' : '6DAYS';

    // Minimum-price floor — week_type-aware so 5DAYS submissions don't get
    // rejected against the 6DAYS floor. Tamper-defense: prevents AED 1 /
    // Monthly Max via the cheapest-preference × cycle-meals lower bound.
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
      const W = customerWeekType === '5DAYS' ? 5 : 6;
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

    // ── Paused-plan guard ──────────────────────────────────────────────────
    // A paused plan's end date shifts each delivery day it stays paused, so
    // we can't compute a valid start date for the next plan until the customer
    // resumes and the end date is confirmed. Block checkout pre-Stripe to
    // avoid a charge that can't be cleanly scheduled.
    const { data: pausedSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('customer_id', user.id)
      .eq('status', SUBSCRIPTION_STATUS.PAUSED)
      .limit(1)
      .maybeSingle();

    if (pausedSub) {
      return NextResponse.json({
        error: 'PLAN_PAUSED',
        message: 'Your current plan is paused — resume it first so your end date is confirmed, then you can renew.',
      }, { status: 409 });
    }

    // Only accept same-origin paths to prevent open-redirect via Stripe.
    const safeCancelPath =
      typeof cancel_path === 'string' && /^\/[^/\\]/.test(cancel_path)
        ? cancel_path
        : '/dashboard';
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3004';
    const cancelSep = safeCancelPath.includes('?') ? '&' : '?';

    // ── Dorm Wars: credit redemption + lifetime-tier coupon synthesis ─────
    // `amount` is fils (AED × 100). The coupon-synth helper caps credit to
    // `amountFils` so a 5000 AED balance against a 200 AED plan applies 200,
    // not 300 → Stripe `coupon_amount_off_too_large` is impossible to trip.
    //
    // RESERVATION (audit P0-7): we use the service-role admin client here
    // because we need to FLIP credit rows to status='reserved' before the
    // Stripe coupon is created. Without this reservation, a user with two
    // browser tabs could synthesize two coupons against the same credit
    // rows and apply both discounts within the 24h coupon window. With it,
    // the second tab's reservation CAS fails on the already-reserved rows
    // and its coupon has nothing to apply.
    const { createClient: createAdminClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Lazy release: free any prior reservations for this customer whose 24h
    // hold has elapsed (e.g. user opened checkout earlier but never paid).
    await supabaseAdmin
      .from('credits')
      .update({ status: 'approved', reserved_token: null, reserved_until: null })
      .eq('customer_id', user.id)
      .eq('status', 'reserved')
      .lt('reserved_until', new Date().toISOString());

    const { rows: creditRows } = await getRedeemableCredit(supabase, user.id);
    const tierPercent = await getActiveLifetimeTierPercent(supabase, user.id);

    const couponResult = await synthesizePerSessionCoupon({
      stripe,
      userId: user.id,
      amountFils: amount,
      tierPercent,
      creditRows,
    });

    // Reserve the credit rows the coupon actually consumed. Done AFTER synth
    // so we know exactly which IDs to lock. CAS on status='approved' means
    // a concurrent checkout that beat us to a row will silently skip it.
    let reservationToken: string | null = null;
    const allReservedIds = [
      ...couponResult.appliedCreditIdsFull,
      ...(couponResult.splitCredit ? [couponResult.splitCredit.id] : []),
    ];
    if (allReservedIds.length > 0) {
      reservationToken = crypto.randomUUID();
      const reservedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { count: lockedCount } = await supabaseAdmin
        .from('credits')
        .update(
          { status: 'reserved', reserved_token: reservationToken, reserved_until: reservedUntil },
          { count: 'exact' },
        )
        .in('id', allReservedIds)
        .eq('status', 'approved');
      if ((lockedCount ?? 0) < allReservedIds.length) {
        // A concurrent checkout swallowed one of our credit rows between the
        // synth and the reservation. The coupon Stripe will create no longer
        // matches the credits we can actually claim — abort and ask the
        // user to retry from a fresh balance read.
        console.warn(
          `checkout reservation race — wanted ${allReservedIds.length} ` +
          `but locked ${lockedCount ?? 0}; aborting to prevent overdraw`
        );
        return NextResponse.json(
          { error: 'Credit balance changed mid-checkout. Please refresh and try again.' },
          { status: 409 },
        );
      }
    }

    // Build sessionArgs separately so we can conditionally attach `discounts`.
    // CRITICAL (RESEARCH Pitfall #5): `discounts[]` is mutually exclusive
    // with `allow_promotion_codes:true` — Stripe returns 400 if both are set.
    // This route does not set allow_promotion_codes (verified — grep clean),
    // so the discount attach is safe.
    const sessionArgs: Stripe.Checkout.SessionCreateParams = {
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
        // Dorm Wars redemption metadata — the webhook reads these to flip
        // `credits.status='approved' → 'applied'` after the order insert.
        // `applied_credit_ids` lists rows to flip wholesale; `split_credit_*`
        // identifies the boundary row that should be flipped AND have a fresh
        // approved row inserted for the unused remainder (when balance > plan).
        coupon_id: couponResult.couponId ?? '',
        applied_credit_ids: couponResult.appliedCreditIdsFull.join(','),
        credit_applied_fils: String(couponResult.creditAppliedFils),
        split_credit_id: couponResult.splitCredit?.id ?? '',
        split_credit_use_fils: couponResult.splitCredit
          ? String(couponResult.splitCredit.useFils)
          : '0',
        // Reservation token — webhook uses this to flip reserved → applied
        // for exactly the rows this session locked. Empty when no credit
        // was reserved (zero-balance checkout, tier-only discount, etc.).
        reservation_token: reservationToken ?? '',
      },
    };
    if (couponResult.couponId) {
      sessionArgs.discounts = [{ coupon: couponResult.couponId }];
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(sessionArgs);
    } catch (err) {
      // Stripe rejected the session — release the reservation immediately so
      // the credit returns to the wallet for the user's next attempt.
      if (reservationToken) {
        await supabaseAdmin
          .from('credits')
          .update({ status: 'approved', reserved_token: null, reserved_until: null })
          .eq('reserved_token', reservationToken)
          .eq('status', 'reserved');
      }
      throw err;
    }

    return NextResponse.json({ url: session.url });

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('❌ Stripe error:', err?.message || error);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

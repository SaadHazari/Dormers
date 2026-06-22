import { NextResponse } from 'next/server';
import { stripeClient, type Stripe } from '@/infra/stripe/client';
import { createClient } from '@/utils/supabase/server';
import { resolvePlan, planKindOf } from '@/contexts/subscriptions/domain/plans';
import { priceBoundsFils, PLAN_ID_BY_KEBAB } from '@/contexts/subscriptions/domain/pricing';
import { fetchActivePriceOverrides } from '@/infra/supabase/pricing-repo';
import type { WeekType } from '@/contexts/subscriptions/domain/end-date';
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status';
import { missingProfileFields } from '@/contexts/subscriptions/domain/profile-completion';
import { synthesizePerSessionCoupon } from '@/contexts/dorm-wars/domain/coupon-synth';
import { getRedeemableCredit } from '@/infra/supabase/subscriptions-repo';
import { getActiveLifetimeTierPercent } from '@/infra/supabase/dorm-wars-repo';
import { notifyAdmin } from '@/infra/admin-alerts/notify';

// Release It! L2: cap this route's wall-clock so a slow Stripe/Supabase chain
// fails fast inside our control instead of dying at the opaque platform limit
// mid-flight (which could orphan a coupon + reserved credit). The Stripe client
// is bounded to 8s/2 retries and the DB calls to 15s (Phase 1).
export const maxDuration = 26;

export async function POST(req: Request) {
  let stripe;
  try {
    stripe = stripeClient();
  } catch (err) {
    console.error("❌ Stripe client init failed:", err);
    void notifyAdmin("Stripe client INIT FAILED — every checkout is broken. Check STRIPE_SECRET_KEY env var immediately.");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

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

    // Stripe wants amount in fils (AED × 100). It MUST be a positive
    // integer — Stripe rejects floats at session create, but we'd rather
    // catch it here with a clear error than at the Stripe boundary.
    // Upper bound is paranoid (10M fils = AED 100,000) — no legitimate
    // checkout in this product goes anywhere near that.
    if (
      typeof amount !== 'number'
      || !Number.isFinite(amount)
      || !Number.isInteger(amount)
      || amount < 100
      || amount > 10_000_000
    ) {
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
    // Welcome Meal is provisioned by claimGift only — it has no price and
    // must never be purchasable. (Previously rejected implicitly by its
    // 0-fils ceiling; explicit now that bounds come from the price engine.)
    if (planKindOf(planDef.id) === 'gift') {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // ── Staff Monthly gate ─────────────────────────────────────────────────
    // Intern remuneration plan: only an ACTIVE staff record may buy it, and
    // only the paid 6-day flavor comes through here (the free 5-day plan is
    // provisioned server-side by contexts/staff, never via checkout). The
    // price is the flat Saturday surcharge, validated exactly below — the
    // generic preference band doesn't apply to this plan.
    const isStaffPlan = planDef.id === 'staff-monthly';
    if (isStaffPlan) {
      const { createAdminSupabaseClient } = await import('@/infra/supabase/admin-client');
      const { data: staffRow } = await createAdminSupabaseClient()
        .from('staff_members')
        .select('id')
        .eq('customer_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!staffRow) {
        return NextResponse.json({ error: 'Invalid plan' }, { status: 403 });
      }
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
      const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const aeHour = aeNow.getUTCHours();
      const sameDayAllowed = !liveSub && aeHour < 14;

      const today = new Date(Date.UTC(aeNow.getUTCFullYear(), aeNow.getUTCMonth(), aeNow.getUTCDate()));
      const minStart = new Date(today);
      if (!sameDayAllowed) minStart.setUTCDate(minStart.getUTCDate() + 1);
      const maxStart = new Date(today); maxStart.setUTCDate(maxStart.getUTCDate() + 31);
      const requested = new Date(start_date + 'T00:00:00Z');
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

    // Price band — week_type-aware so 5DAYS submissions don't get rejected
    // against the 6DAYS floor. Tamper-defense: prevents AED 1 / Monthly Max
    // via the cheapest-preference × cycle-meals lower bound.
    //
    // Bounds come from the EFFECTIVE price engine: code defaults overlaid
    // with active plan_pricing rows (admin-set). When an admin raises a
    // price, the floor rises with it — a stale tab still POSTing the old
    // amount gets rejected here instead of buying at the retired price.
    // fetchActivePriceOverrides fails open to [] (code prices), so a DB
    // blip degrades to defaults rather than blocking checkout.
    if (isStaffPlan) {
      // Exact-match: the paid staff flavor is 6DAYS at the flat Saturday
      // surcharge (AED 20 × 4), nothing else. A 5DAYS profile has no
      // business POSTing money — its plan is free and provisioned directly.
      const { staffSurchargeFils } = await import('@/contexts/staff/domain/staff-plan');
      if (customerWeekType !== '6DAYS' || amount !== staffSurchargeFils(customerWeekType)) {
        return NextResponse.json({ error: 'Invalid staff plan amount' }, { status: 400 });
      }
    } else {
      const priceOverrides = await fetchActivePriceOverrides();
      const bounds = priceBoundsFils(PLAN_ID_BY_KEBAB[planDef.id], customerWeekType, priceOverrides);
      if (amount < bounds.minFils) {
        return NextResponse.json({ error: 'Amount too low for selected plan' }, { status: 400 });
      }
      if (amount > bounds.maxFils) {
        return NextResponse.json({ error: 'Amount exceeds plan price' }, { status: 400 });
      }
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
    const { createAdminSupabaseClient } = await import('@/infra/supabase/admin-client');
    const supabaseAdmin = createAdminSupabaseClient();

    // Lazy release: free any prior reservations for this customer whose 24h
    // hold has elapsed (e.g. user opened checkout earlier but never paid).
    await supabaseAdmin
      .from('credits')
      .update({ status: 'approved', reserved_token: null, reserved_until: null })
      .eq('customer_id', user.id)
      .eq('status', 'reserved')
      .lt('reserved_until', new Date().toISOString());

    // Staff surcharge is exempt from every discount mechanism — credits,
    // lifetime tiers, and the welcome rate. The amount is already the
    // at-cost Saturday price, and clean refunds on offboarding need the
    // charge to be exactly AED 20 × 4 with no coupon math underneath.
    const { rows: creditRows } = isStaffPlan
      ? { rows: [] as Awaited<ReturnType<typeof getRedeemableCredit>>['rows'] }
      : await getRedeemableCredit(supabase, user.id);
    const tierPercent = isStaffPlan ? 0 : await getActiveLifetimeTierPercent(supabase, user.id);

    // ── Trial-convert welcome rate (5% off the first monthly+ plan) ───────
    // One-time 5% for a customer graduating from a trial/Welcome Meal to their
    // first paid MONTHLY plan (premium or max). Weekly is excluded. It does NOT
    // stack with a Dorm Wars lifetime tier — tier wins when present, and a fresh
    // convert has none, so the two are mutually exclusive. We therefore route
    // the 5% through the coupon-synth tier slot: the webhook already treats
    // `tier_applied_fils` as a pass-through discount (no credit-flip side
    // effects), and the customer-facing Zoho invoice shows a generic discount
    // line, so nothing is mislabelled downstream.
    //
    // Eligibility (abuse-resistant — fires exactly once, on the first monthly
    // plan): has a prior trial/gift sub in history AND no prior monthly/weekly
    // sub. After this purchase the customer owns a monthly sub, so they never
    // qualify again.
    let welcomePercent: 0 | 5 = 0;
    if (tierPercent === 0 && planKindOf(planDef.id) === 'monthly' && !isStaffPlan) {
      const { data: priorSubs } = await supabase
        .from('subscriptions')
        .select('plan_name')
        .eq('customer_id', user.id);
      const kinds = (priorSubs ?? []).map((s) => {
        const def = resolvePlan(s.plan_name as string | null);
        return def ? planKindOf(def.id) : null;
      });
      const hasTrialHistory = kinds.some((k) => k === 'trial' || k === 'gift');
      const hasPaidPlan = kinds.some((k) => k === 'monthly' || k === 'weekly');
      if (hasTrialHistory && !hasPaidPlan) welcomePercent = 5;
    }
    // Tier wins over welcome when both are notionally present (can't happen for
    // a true first-time convert, but the max keeps it safe and non-stacking).
    const effectiveTierPercent = (tierPercent > 0 ? tierPercent : welcomePercent) as 0 | 5 | 10;

    // Phase 7 follow-up: removed the trial-floor / auto-refund detour.
    // Trial + 100% credit coverage now flows through the same free-checkout
    // path as every other plan — no Stripe redirect, no AED 2 phantom
    // charge, no auto-refund. Customer hits an in-house success screen and
    // Zoho still mints an invoice with a discount line that nets to AED 0.
    const couponResult = await synthesizePerSessionCoupon({
      stripe,
      userId: user.id,
      amountFils: amount,
      tierPercent: effectiveTierPercent,
      creditRows,
    });
    const stripeNetFils = amount - couponResult.discountFils;
    if (stripeNetFils < 0) {
      return NextResponse.json({ error: 'Discount exceeds plan price' }, { status: 400 });
    }
    const isFreeCheckout = stripeNetFils === 0;

    // Reserve the credit rows the coupon actually consumed. Done AFTER synth
    // so we know exactly which IDs to lock. CAS on status='approved' means
    // a concurrent checkout that beat us to a row will silently skip it.
    // (Same reservation pattern serves both the Stripe and free-checkout
    // branches below — credits get locked here, flipped to 'applied' inside
    // whichever branch wins.)
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

    // ── Free-checkout branch (non-trial, 100% credit + tier covered) ──────
    // Discount equals plan total → Stripe would reject the session with
    // coupon_amount_off_too_large. Skip Stripe entirely and provision the
    // sub + order directly via the use case. Customer still gets WhatsApp +
    // email confirmations; Zoho is skipped (no cash transaction).
    if (isFreeCheckout) {
      const { runFreeCheckout } = await import('@/contexts/payments/usecases/free-checkout');
      try {
        await runFreeCheckout({
          supabaseAdmin,
          userId: user.id,
          planString: plan,
          preference,
          vegDays: vegDays ?? null,
          name,
          phone,
          location,
          startDate: start_date ?? null,
          amountFils: amount,
          reservationToken,
          creditAppliedFils: couponResult.creditAppliedFils,
          tierAppliedFils: couponResult.tierAppliedFils,
          appliedCreditIdsFull: couponResult.appliedCreditIdsFull,
          splitCredit: couponResult.splitCredit,
        });
      } catch (err) {
        // Release the reservation on failure so the user can retry without
        // losing their credit balance.
        if (reservationToken) {
          await supabaseAdmin
            .from('credits')
            .update({ status: 'approved', reserved_token: null, reserved_until: null })
            .eq('reserved_token', reservationToken)
            .eq('status', 'reserved');
        }
        throw err;
      }
      // Relative URL — the client navigates within its own host. Stripe
      // sessions need absolute URLs (Stripe's host redirects), but the
      // free-checkout path is purely in-app; an absolute one would pin
      // the user to whatever NEXT_PUBLIC_BASE_URL was configured for and
      // break local dev when ports differ.
      return NextResponse.json({ url: `/dashboard?checkout_success=true&via=credit` });
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
        // Stamp the discount breakdown so the webhook can pass it through
        // to the Zoho invoice (line subtotal − discount = paid).
        discount_total_fils: String(couponResult.discountFils),
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
    console.error('❌ Checkout error:', err?.message || error);
    void notifyAdmin(
      `Checkout CRASHED: ${err?.message || 'Unknown error'}. Customer was blocked from purchasing.`,
    );
    return NextResponse.json({ error: 'Checkout failed. Please try again or contact support.' }, { status: 500 });
  }
}

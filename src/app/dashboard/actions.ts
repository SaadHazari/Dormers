'use server';

import { revalidatePath } from 'next/cache';
import { resolvePlan } from '@/contexts/subscriptions/domain/plans';
import { requireUser } from '@/contexts/identity/usecases/require-user';
import { loadOwnedSubscription } from '@/contexts/subscriptions/domain/subscriptions';
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status';
import { createClient } from '@/utils/supabase/server';
import { queueCustomerNotification } from '@/contexts/notifications/usecases/queue';
import { ae9amUtcOnDate, nextEligibleDeliveryDay } from '@/shared/time/dubai-day';

/**
 * Saves account-detail fields that apply IMMEDIATELY (current cycle).
 * Whitelist: name, dorm_name. Allergens, spice level, meal preference,
 * delivery week, and religious veg days are NOT here — they ride the
 * pending-preferences flow in {@link savePendingPreferences} so a
 * mid-cycle change doesn't break the dashboard ↔ kitchen-ops contract.
 */
export async function updateProfile(data: {
  name: string;
  dorm_name: string;
  // NOTE: whatsapp_number is intentionally omitted. WhatsApp changes flow
  // through the verified OTP path in profile/SecuritySection so an unverified
  // number can never be persisted via this action.
}) {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  if (!data.name?.trim()) return { error: 'Full name is required.' };
  if (!data.dorm_name?.trim()) return { error: 'Dorm building is required.' };

  const { error } = await auth.supabase
    .from('customers')
    .update({ name: data.name.trim(), dorm_name: data.dorm_name.trim() })
    .eq('id', auth.user.id);

  if (error) return { error: 'Failed to update profile.' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/plan');
  revalidatePath('/dashboard/profile');
  return { success: true };
}

/**
 * Pending-preferences save — applies from the customer's NEXT subscription,
 * never the live one. Writes to the customers.pending_* columns; the
 * webhook drains them at next sub creation and updates the canonical
 * customer.* fields atomically with the new sub.
 *
 * If the customer has no live or queued sub, the change is applied
 * immediately to customer.* (and pending_* stays null) — this is the
 * normal path for between-cycle edits. The pending banner only renders
 * when a live/queued sub holds the change.
 *
 * Returns { applied: 'now' | 'next' } so the UI can render the right
 * confirmation copy.
 */
export type SavePendingPreferencesInput = {
  meal_preference_type: string;
  week_type: '5DAYS' | '6DAYS';
  allergens: string;
  spice_level_preference: string;
  /** Religious-mix only — veg working-day names. Empty/omitted otherwise. */
  veg_days?: string[];
};

export type SavePendingPreferencesResult =
  | { ok: true; applied: 'now' | 'next' }
  | { error: string };

export async function savePendingPreferences(
  input: SavePendingPreferencesInput,
): Promise<SavePendingPreferencesResult> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  if (input.week_type !== '5DAYS' && input.week_type !== '6DAYS') {
    return { error: 'Invalid delivery week.' };
  }
  if (!input.meal_preference_type?.trim()) {
    return { error: 'Pick a meal preference.' };
  }
  if (!input.spice_level_preference?.trim()) {
    return { error: 'Pick a spice level.' };
  }
  if (!input.allergens?.trim()) {
    return { error: 'Confirm allergens (or pick "None").' };
  }

  // Religious-mix veg-day validation — must contain 1..(W-1) unique working
  // day names for the chosen week_type. Same rules as /api/checkout to keep
  // the contract consistent across entry points.
  const isReligious = /religious/i.test(input.meal_preference_type);
  let cleanVegDays: string[] | null = null;
  if (isReligious) {
    const W = input.week_type === '5DAYS' ? 5 : 6;
    const allowed = new Set(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].slice(0, W));
    const list = Array.isArray(input.veg_days) ? input.veg_days : [];
    const unique = new Set(list).size === list.length;
    const allInRange = list.every(d => allowed.has(d));
    if (list.length < 1 || list.length > W - 1 || !unique || !allInRange) {
      return { error: `Pick between 1 and ${W - 1} veg days from your delivery week.` };
    }
    cleanVegDays = list;
  }

  // Decide path: live/queued sub → write to pending_*; otherwise apply now.
  // SCHEDULED counts as "live" for this check — a queued future sub means
  // the change must wait for the cycle after that, so it goes to pending_*
  // just like an active sub. Mirrors promotePendingPreferencesIfStale.
  const { data: liveSub } = await auth.supabase
    .from('subscriptions')
    .select('id')
    .eq('customer_id', auth.user.id)
    .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED])
    .limit(1)
    .maybeSingle();

  if (liveSub) {
    // Live sub: queue the change to pending_*. Canonical fields stay put
    // until the sub ends (kitchen contract for the current cycle).
    //
    // Exception — canonical veg_days when switching FROM religious TO
    // non-religious. customer.veg_days is the religious-mix memory for the
    // NEXT sub's pre-fill, not a kitchen-ops field. Once the user's stated
    // intent is non-religious, the religious-day memory is invalid; leaving
    // it makes Profile + Plan render stale "Religious-mix veg days" chips
    // alongside a Veg / Carnivore meal-type tag (the bug that prompted
    // this guard). Render-side gates are layered on top, but clearing here
    // is the upstream fix.
    const patch: Record<string, unknown> = {
      pending_meal_preference_type: input.meal_preference_type,
      pending_week_type: input.week_type,
      pending_allergens: input.allergens,
      pending_spice_level_preference: input.spice_level_preference,
      pending_veg_days: isReligious ? cleanVegDays : null,
    };
    if (!isReligious) {
      patch.veg_days = null;
    }
    const { error } = await auth.supabase
      .from('customers')
      .update(patch)
      .eq('id', auth.user.id);
    if (error) return { error: 'Failed to save preferences.' };

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/profile');
    return { ok: true, applied: 'next' };
  }

  // No live sub — write to current fields and clear any stale pending_*
  // (e.g. customer queued a change, the queued sub never materialised, and
  // they're now editing again with no live sub). Religious-mix users get
  // their veg-day picks persisted to customer.veg_days so the next
  // checkout's day picker pre-fills from this saved preference.
  const { error } = await auth.supabase
    .from('customers')
    .update({
      meal_preference_type: input.meal_preference_type,
      week_type: input.week_type,
      allergens: input.allergens,
      spice_level_preference: input.spice_level_preference,
      veg_days: isReligious ? cleanVegDays : null,
      pending_meal_preference_type: null,
      pending_week_type: null,
      pending_allergens: null,
      pending_spice_level_preference: null,
      pending_veg_days: null,
    })
    .eq('id', auth.user.id);
  if (error) return { error: 'Failed to save preferences.' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/profile');
  return { ok: true, applied: 'now' };
}

/**
 * Discard pending preferences — restores the customer to the current
 * canonical preferences without applying the queued change. Used by the
 * pending-changes banner's "Discard" affordance.
 */
export async function discardPendingPreferences(): Promise<{ ok: true } | { error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase
    .from('customers')
    .update({
      pending_meal_preference_type: null,
      pending_week_type: null,
      pending_allergens: null,
      pending_spice_level_preference: null,
      pending_veg_days: null,
    })
    .eq('id', auth.user.id);
  if (error) return { error: 'Failed to discard pending changes.' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/profile');
  return { ok: true };
}

/**
 * Auto-promote pending preferences when the customer's last subscription
 * has ended without a renewal. Called from the dashboard layout so every
 * dashboard route lands on canonical, drained data — Profile, Plan, and
 * Menu all read post-promotion values without each having to re-check.
 *
 * Promotion semantics: pending_* → canonical customer.* (per-field, only
 * for fields where pending_* is non-null), then null out all pending_*
 * and stamp preferences_promoted_at = now(). The "queued for next sub"
 * banner naturally disappears (pending_* are gone); the new "preferences
 * applied" banner appears in its place (gated on preferences_promoted_at
 * + !hasActiveSub at render time).
 *
 * Safe to call on every dashboard load — the live-sub guard makes it a
 * no-op in the common case (customer has an active sub OR has no pending
 * changes). Uses raw queries (not the React-cached helpers) because the
 * mutation must complete before any cached read sees the row.
 */
export async function promotePendingPreferencesIfStale(userId: string): Promise<void> {
  const supabase = await createClient();

  // Read pending columns + a single liveness probe in parallel to keep
  // the layout's critical path tight.
  const [{ data: customerRow }, { data: liveSub }] = await Promise.all([
    supabase
      .from('customers')
      .select('pending_meal_preference_type, pending_week_type, pending_allergens, pending_spice_level_preference, pending_veg_days')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('subscriptions')
      .select('id')
      .eq('customer_id', userId)
      .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED])
      .limit(1)
      .maybeSingle(),
  ]);

  if (liveSub) return;
  if (!customerRow) return;

  const hasPending =
    customerRow.pending_meal_preference_type != null ||
    customerRow.pending_week_type != null ||
    customerRow.pending_allergens != null ||
    customerRow.pending_spice_level_preference != null ||
    (Array.isArray(customerRow.pending_veg_days) && customerRow.pending_veg_days.length > 0);
  if (!hasPending) return;

  // Per-field promotion: only fields with a queued change get overwritten;
  // untouched fields keep their canonical value (mirrors the webhook drain
  // logic so the promote-on-end and promote-on-renew paths produce the
  // same end state).
  const patch: Record<string, unknown> = {
    pending_meal_preference_type: null,
    pending_week_type: null,
    pending_allergens: null,
    pending_spice_level_preference: null,
    pending_veg_days: null,
    preferences_promoted_at: new Date().toISOString(),
  };
  if (customerRow.pending_meal_preference_type != null) {
    patch.meal_preference_type = customerRow.pending_meal_preference_type;
  }
  if (customerRow.pending_week_type != null) {
    patch.week_type = customerRow.pending_week_type;
  }
  if (customerRow.pending_allergens != null) {
    patch.allergens = customerRow.pending_allergens;
  }
  if (customerRow.pending_spice_level_preference != null) {
    patch.spice_level_preference = customerRow.pending_spice_level_preference;
  }
  // pending_veg_days drains into customer.veg_days (the canonical religious-
  // mix preference memory, added 2026-05-07). Symmetric with the other
  // pending fields — every queued change now lands somewhere persistent
  // when the sub ends, so the next checkout pre-fills from the user's
  // last-known picks instead of starting blank.
  //
  // BUT: if the drained meal preference is non-religious, canonical veg_days
  // becomes orphaned data (UI surfaces would render "Religious-mix veg days"
  // for a Veg / Carnivore customer). Mirror the webhook's invariant —
  // veg_days only persists for religious-mix customers — by clearing it
  // when the post-drain preference isn't religious. Without this, a customer
  // who was religious, queued a change to Veg, and let the sub end ends up
  // with stale [Tue, Thu, Sat] in customer.veg_days indefinitely.
  const drainedMealPref =
    customerRow.pending_meal_preference_type ?? null;
  const willBeReligious = drainedMealPref != null
    ? /religious/i.test(drainedMealPref)
    : null; // unchanged → can't make a determination here
  if (Array.isArray(customerRow.pending_veg_days) && customerRow.pending_veg_days.length > 0) {
    patch.veg_days = customerRow.pending_veg_days;
  } else if (willBeReligious === false) {
    patch.veg_days = null;
  }

  await supabase.from('customers').update(patch).eq('id', userId);
}

export async function pauseSubscription(subscriptionId: string) {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  const subResult = await loadOwnedSubscription(auth.supabase, subscriptionId, auth.user.id);
  if (!subResult.ok) return { error: subResult.error };
  const { subscription } = subResult;

  // Validation
  if (subscription.status === SUBSCRIPTION_STATUS.PAUSED) return { error: 'Subscription is already paused.' };
  if (subscription.status === SUBSCRIPTION_STATUS.ENDED) return { error: 'Cannot pause an ended subscription.' };
  if (!resolvePlan(subscription.plan_name)?.canPause) {
    return { error: 'Only Monthly Premium and Monthly Max plans can be paused.' };
  }
  // has_paused_before with no planned_pause_start means the credit is already
  // spent (customer paused + resumed earlier this cycle). Reject.
  // has_paused_before WITH planned_pause_start means the credit is consumed by
  // a future-scheduled pause — pausing-now is a valid override that substitutes
  // "now" for the planned date. Allow it (the planned row is cleared below).
  const planExists = !!subscription.planned_pause_start;
  if (subscription.has_paused_before && !planExists) {
    return { error: 'You have already used your 1 allowed pause for this subscription.' };
  }

  // Block pause on the literal last day of the cycle. Pausing on end_date
  // doesn't protect any future meal (cycle ends after that day), and is a
  // potential abuse vector (pause-on-last-day → never resume → cycle drags
  // forever via paused_days extensions). Whether end_date is a natural
  // last day or a make-up day, that specific day is off-limits.
  const aeTodayForPause = aeTodayIso();
  if (subscription.end_date && aeTodayForPause >= subscription.end_date) {
    return { error: 'Can\'t pause on your last delivery day — there\'s no future meal to protect.' };
  }

  // Apply Pause. Note: paused_days is NOT touched here — the daily
  // subscription_pause_tick cron at 00:10 AE increments it by 1 for every
  // day the sub stays Paused, and the trigger pushes end_date out via the
  // canonical formula on each increment. has_paused_before stays true even
  // after resume so the 1-pause-per-cycle rule sticks.
  // planned_pause_start is force-cleared — if the customer had scheduled a
  // future pause and is now pausing manually, the plan is superseded by the
  // immediate action.
  // CAS guard: only flip Active → Paused. Stops a double-tap from re-pausing
  // an already-Paused row (which would no-op but reset pause_date) or racing
  // against a same-window skip.
  const { data: pauseRows, error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      status: SUBSCRIPTION_STATUS.PAUSED,
      pause_date: new Date().toISOString(),
      has_paused_before: true,
      planned_pause_start: null,
    })
    .eq('id', subscriptionId)
    .eq('status', SUBSCRIPTION_STATUS.ACTIVE)
    .select('id');

  if (updateError) return { error: 'Failed to pause subscription.' };
  if (!pauseRows || pauseRows.length === 0) {
    return { error: 'Pause didn\'t take. Refresh and try again, or message us on WhatsApp.' };
  }

  // ── WhatsApp confirmation ──────────────────────────────────────────────
  // Immediate "your plan is paused" confirm. Pause is open-ended — the
  // copy explicitly tells the user resume is their call, no fake auto-
  // resume date here. The matching "plan back on" message is scheduled
  // later from resumeSubscription() when the user comes back.
  await queueCustomerNotification(
    auth.user.id,
    'plan_paused_confirm',
    new Date(),
  );

  // Revalidate at layout level so the sidebar/topbar plan badge + every nested
  // route under /dashboard sees the new status.
  revalidatePath('/dashboard', 'layout');
  return { success: true };
}

export async function resumeSubscription(subscriptionId: string) {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  const subResult = await loadOwnedSubscription(auth.supabase, subscriptionId, auth.user.id);
  if (!subResult.ok) return { error: subResult.error };
  const { subscription } = subResult;

  if (subscription.status !== SUBSCRIPTION_STATUS.PAUSED) return { error: 'Subscription is not currently paused.' };

  // Same-day resume lock. Mirrors the UI gate in QuickActions so a client
  // bypass can't create kitchen ambiguity on the day of pause.
  const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const todayAE = aeNow.toISOString().slice(0, 10);

  if (subscription.pause_date) {
    const pauseAE = new Date(new Date(subscription.pause_date).getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (todayAE === pauseAE) {
      return { error: 'Your plan was paused today — resume becomes available tomorrow.' };
    }
  }

  // Detect post-cutoff resume on a delivery day. When the customer resumes
  // after 2 PM AE, the sub flips Active before delivery_tick fires at 20:00 AE,
  // which would otherwise increment delivered_meals even though no meal was
  // prepped. Setting resume_cutoff_date = today tells delivery_tick to skip
  // the row. The end_date is already correct — pause_tick ran at 00:10 AE and
  // extended it before any afternoon resume could happen.
  const aeHour = aeNow.getUTCHours();
  const aeIsoDow = ((aeNow.getUTCDay() + 6) % 7) + 1;
  const wt = subscription.week_type ?? '6DAYS';
  const isDeliveryToday =
    wt === '7DAYS' ? true :
    wt === '6DAYS' ? aeIsoDow !== 7 :
    /* 5DAYS */     aeIsoDow !== 6 && aeIsoDow !== 7;
  const setResumeCutoff = aeHour >= 14 && isDeliveryToday;

  // Apply Resume. paused_days is NOT touched — the subscription_pause_tick
  // cron has already been incrementing it by 1 for every midnight crossed
  // while paused, and the end_date trigger has been pushing the calendar
  // out accordingly. Adding diffDays here would double-count.
  // CAS guard: only flip Paused → Active. Prevents a stale "resume" from
  // overwriting a sub that's since been Ended by status_tick.
  //
  // paused_dates: when resume happens after the 2 PM AE cutoff on a
  // delivery day, delivery_tick will skip that day (no meal delivered).
  // The 00:10 AE pause_tick has NOT yet run for today (it fires at the
  // start of tomorrow, after the sub is already Active), so we append
  // today here so the review surface knows this day was paused.
  const todayDateOnly = todayAE  // already YYYY-MM-DD
  const existingPaused = (subscription as { paused_dates?: string[] | null }).paused_dates ?? []
  const nextPausedDates = setResumeCutoff && !existingPaused.includes(todayDateOnly)
    ? [...existingPaused, todayDateOnly]
    : existingPaused

  const { data: resumeRows, error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      pause_date: null,
      ...(setResumeCutoff ? { resume_cutoff_date: todayAE, paused_dates: nextPausedDates } : {}),
    })
    .eq('id', subscriptionId)
    .eq('status', SUBSCRIPTION_STATUS.PAUSED)
    .select('id');

  if (updateError) return { error: 'Failed to resume subscription.' };
  if (!resumeRows || resumeRows.length === 0) {
    return { error: 'Resume didn\'t take. Refresh and try again, or message us on WhatsApp.' };
  }

  // ── WhatsApp confirmation ──────────────────────────────────────────────
  // Schedule the "you're back on" message for 9 AM AE TOMORROW (or
  // technically the next eligible delivery day, since resume on a Friday
  // with a 5DAYS plan should land Monday morning, not Saturday).
  const tomorrowAEIso = (() => {
    const tomorrow = new Date(aeNow.getTime() + 24 * 60 * 60 * 1000);
    return `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;
  })();
  const resumeMsgDateIso = nextEligibleDeliveryDay({
    fromAeDateIso: todayAE,
    weekType:      (wt as '5DAYS' | '6DAYS' | '7DAYS'),
    skippedDates:  subscription.skipped_dates ?? [],
    pausedDates:   nextPausedDates,
    subEndDateIso: subscription.end_date,
  }) ?? tomorrowAEIso;
  await queueCustomerNotification(
    auth.user.id,
    'plan_resumed_confirm',
    ae9amUtcOnDate(resumeMsgDateIso),
    { resume_date: resumeMsgDateIso },
  );

  // Revalidate at layout level so the sidebar/topbar plan badge + every nested
  // route under /dashboard sees the new status.
  revalidatePath('/dashboard', 'layout');
  return { success: true };
}

/**
 * Move the start date of a Scheduled subscription. Only allowed *before* the
 * plan begins — once it's active, the only way to extend the timeline is via
 * skip / pause. Recomputes end_date from the plan's duration so the cycle
 * stays the same length.
 */
export async function changeStartDate(subscriptionId: string, newStartDate: string) {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  const subResult = await loadOwnedSubscription(auth.supabase, subscriptionId, auth.user.id);
  if (!subResult.ok) return { error: subResult.error };
  const { subscription } = subResult;

  // Gate on Scheduled — once a plan has started, the operations team is
  // already cooking on a schedule; moving the start date is a manual reschedule.
  const isScheduled =
    subscription.status === SUBSCRIPTION_STATUS.SCHEDULED ||
    new Date(subscription.start_date).getTime() > Date.now();
  if (!isScheduled) {
    return { error: 'Your plan has already started — message us on WhatsApp if you need to reschedule.' };
  }

  // ── Once-per-sub allowance ──────────────────────────────────────────────
  // Per state-machine spec: each Scheduled sub gets one date change. After
  // that the button is disabled in the UI; this server-side check is the
  // authoritative gate.
  if (subscription.start_date_changed_at) {
    return { error: 'You can only change the start date once per plan.' };
  }

  // YYYY-MM-DD format + window check (tomorrow ≤ newStart ≤ today + 31).
  // Mirror the same guards as /api/checkout so a tampered call can't bypass.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newStartDate)) {
    return { error: 'Invalid date format' };
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const minStart = new Date(today); minStart.setDate(minStart.getDate() + 1);
  const maxStart = new Date(today); maxStart.setDate(maxStart.getDate() + 31);
  const requested = new Date(newStartDate + 'T00:00:00');
  if (isNaN(requested.getTime()) || requested < minStart || requested > maxStart) {
    return { error: 'Pick a date within the next 30 days.' };
  }

  // Reject non-delivery-day picks for the sub's week_type. Without this, a
  // 5DAYS customer could submit a Saturday — the BEFORE end_date trigger
  // start-shifts internally to Mon for the math, but start_date is stored
  // as Sat, and the dashboard would show "starts Sat" with no Sat delivery.
  // ISO dow: 1=Mon … 7=Sun.
  const reqIsoDow = ((requested.getUTCDay() + 6) % 7) + 1;
  const wtChange = subscription.week_type ?? '6DAYS';
  const reqIsDelivery =
    wtChange === '7DAYS' ? true :
    wtChange === '6DAYS' ? reqIsoDow !== 7 :
    /* 5DAYS */          reqIsoDow !== 6 && reqIsoDow !== 7;
  if (!reqIsDelivery) {
    return { error: 'Pick a working delivery day for your plan (Mon–Fri for 5-day plans, Mon–Sat for 6-day plans).' };
  }

  // Reject if a primary live sub exists and the new start_date falls on or
  // before its end_date — otherwise the rescheduled Scheduled would overlap
  // with the customer's still-running primary. The shift trigger handles
  // pushes from the OTHER direction (primary's end_date moving forward),
  // but we never want to silently push the customer's explicit pick.
  const { data: primary } = await auth.supabase
    .from('subscriptions')
    .select('id, end_date')
    .eq('customer_id', auth.user.id)
    .neq('id', subscriptionId)
    .in('status', LIVE_SUBSCRIPTION_STATUSES)
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (primary?.end_date && newStartDate <= primary.end_date) {
    return {
      error: `Your current plan runs until ${primary.end_date}. Pick a date after that.`,
    };
  }

  // Note: end_date is recomputed automatically by the
  // trg_subscriptions_recompute_end_date trigger when start_date changes.
  // We only need to write start_date + the once-only marker.
  const { data: dateRows, error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      start_date: newStartDate,
      start_date_changed_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId)
    .eq('status', SUBSCRIPTION_STATUS.SCHEDULED)
    .select('id');

  if (updateError) return { error: 'Failed to update start date.' };
  if (!dateRows || dateRows.length === 0) {
    return { error: 'Date change didn\'t take. Refresh and try again, or message us on WhatsApp.' };
  }

  revalidatePath('/dashboard', 'layout');
  return { success: true };
}

export async function skipMeal(subscriptionId: string) {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  const subResult = await loadOwnedSubscription(auth.supabase, subscriptionId, auth.user.id);
  if (!subResult.ok) return { error: subResult.error };
  const { subscription } = subResult;

  // Skip is only meaningful from Active. Skipped subs can't be skipped again
  // today (already counted); Paused/Scheduled/Ended subs aren't delivering.
  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    return { error: 'Cannot skip a meal on an inactive or paused subscription.' };
  }

  // Operations cutoff — kitchen prep starts well before 7 PM delivery, so a
  // same-day skip is only honoured when requested before 14:00 Asia/Dubai.
  // After 2 PM AE the customer must wait until tomorrow to skip the next day's
  // meal. Server-side check, mirrored by a UI lockout in QuickActions.
  const SKIP_CUTOFF_HOUR_AE = 14;
  const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000); // shift UTC to AE wall time
  const aeHour = aeNow.getUTCHours();
  if (aeHour >= SKIP_CUTOFF_HOUR_AE) {
    return { error: `Skip cutoff for today is 2 PM. Try again tomorrow morning.` };
  }

  // Today must be a delivery day for this sub's week_type, otherwise the
  // customer would burn a skip credit + push end_date for nothing.
  // ISO dow: 1=Mon … 7=Sun. AE is UTC+4 — use AE wall date so the cutoff
  // matches the customer's local calendar.
  const aeIsoDow = ((aeNow.getUTCDay() + 6) % 7) + 1;
  const wt = subscription.week_type ?? '6DAYS';
  const isDeliveryToday =
    wt === '7DAYS' ? true :
    wt === '6DAYS' ? aeIsoDow !== 7 :
    /* 5DAYS */     aeIsoDow !== 6 && aeIsoDow !== 7;
  if (!isDeliveryToday) {
    return { error: 'Today isn\'t a delivery day for your plan, so there\'s nothing to skip.' };
  }

  // Bonus skips from Dorm Wars cycle milestone 15 (awarded via
  // increment_bonus_skips RPC) extend the plan's base skip cap. Without
  // this `+ bonus_skips` the milestone-15 reward is invisible to the user —
  // they get the badge but can never use the extra skips.
  const baseMaxSkips = resolvePlan(subscription.plan_name)?.maxSkips ?? 0;
  const bonusSkips   = (subscription as { bonus_skips?: number | null }).bonus_skips ?? 0;
  const maxSkips     = baseMaxSkips + bonusSkips;

  if (subscription.skipped_meals_count >= maxSkips) {
    return { error: `You have reached the maximum allowed skips (${maxSkips}) for this subscription plan.` };
  }

  // Today's AE wall date as YYYY-MM-DD. aeNow was already shifted by +4h
  // above, so getUTCFullYear/getUTCMonth/getUTCDate give AE date components
  // regardless of the server's local tz. Drives the new skipped_dates ledger
  // that the dashboard's calendar progress bar reads pill-by-pill.
  const todayAEIso = `${aeNow.getUTCFullYear()}-${String(aeNow.getUTCMonth() + 1).padStart(2, '0')}-${String(aeNow.getUTCDate()).padStart(2, '0')}`
  const nextSkippedDates = [...(subscription.skipped_dates ?? []), todayAEIso]

  // Promote skip to a real DB status — flips Active → Skipped. The
  // subscription_status_tick cron at 00:05 AE auto-reverts to Active so
  // tomorrow's delivery proceeds. The end_date trigger fires on the
  // skipped_meals_count change and pushes end_date out by the formula.
  // The .eq('status', Active) is a CAS guard against double-tap / concurrent
  // skip racing past the in-memory check above. If status has flipped between
  // the SELECT and this UPDATE, the WHERE matches zero rows and we surface
  // a "didn't take" error rather than incrementing the count twice — and the
  // append to skipped_dates is also guarded by the same CAS, so we never
  // double-append for the same skip event.
  const { data: skipRows, error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      status: SUBSCRIPTION_STATUS.SKIPPED,
      skipped_meals_count: subscription.skipped_meals_count + 1,
      last_skipped_date: new Date().toISOString(),
      skipped_dates: nextSkippedDates,
    })
    .eq('id', subscriptionId)
    .eq('status', SUBSCRIPTION_STATUS.ACTIVE)
    .select('id');

  if (updateError) return { error: 'Failed to skip meal.' };
  if (!skipRows || skipRows.length === 0) {
    return { error: 'Skip didn\'t take. Refresh and try again, or message us on WhatsApp.' };
  }

  // ── WhatsApp confirmations ──────────────────────────────────────────────
  // Two notifications:
  //   1. Immediate confirm — "your meal for today is skipped, carried forward"
  //   2. Morning-after resume confirm — fires at 9 AM AE on the next eligible
  //      delivery day. "Eligible" respects week_type, already-skipped/paused
  //      dates, AND the sub end_date — we don't promise a meal that won't
  //      come.
  // Both are fire-and-forget; if either insert fails the user's skip still
  // succeeded (the in-flight kitchen state is already correct).
  await queueCustomerNotification(
    auth.user.id,
    'meal_skipped_confirm',
    new Date(), // immediate
    { meal_date: todayAEIso },
  );
  const resumeOnIso = nextEligibleDeliveryDay({
    fromAeDateIso: todayAEIso,
    weekType:      (wt as '5DAYS' | '6DAYS' | '7DAYS'),
    skippedDates:  nextSkippedDates,
    pausedDates:   subscription.paused_dates ?? [],
    subEndDateIso: subscription.end_date,
  });
  if (resumeOnIso) {
    await queueCustomerNotification(
      auth.user.id,
      'meal_resumed_confirm',
      ae9amUtcOnDate(resumeOnIso),
      { resume_date: resumeOnIso },
    );
  }

  // Revalidate at layout level so the sidebar/topbar plan badge + every nested
  // route under /dashboard sees the new status.
  revalidatePath('/dashboard', 'layout');
  return { success: true };
}

// ── Future-skip helpers (module-local) ────────────────────────────────────────

function aeTodayIso(): string {
  const ae = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return `${ae.getUTCFullYear()}-${String(ae.getUTCMonth() + 1).padStart(2, '0')}-${String(ae.getUTCDate()).padStart(2, '0')}`;
}

function isWorkingDayForWeekType(d: Date, weekType: string): boolean {
  const isoDow = ((d.getDay() + 6) % 7) + 1; // 1=Mon..7=Sun
  if (weekType === '7DAYS') return true;
  if (weekType === '6DAYS') return isoDow !== 7;
  // 5DAYS
  return isoDow !== 6 && isoDow !== 7;
}

// 1-indexed position of `targetIso` among working days starting at `startIso`.
// Returns -1 if target is before start, or isn't a working day.
function workingDayPosition(startIso: string, targetIso: string, weekType: string): number {
  const target = new Date(targetIso + 'T00:00:00');
  const d = new Date(startIso + 'T00:00:00');
  if (target.getTime() < d.getTime()) return -1;
  let position = 0;
  while (d.getTime() <= target.getTime()) {
    if (isWorkingDayForWeekType(d, weekType)) {
      position++;
      if (d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth() && d.getDate() === target.getDate()) {
        return position;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return -1;
}

/**
 * Schedule a skip for a FUTURE date. Customer registers an intent to skip a
 * specific upcoming delivery day; the date lands in `skipped_dates`, the
 * skip count increments, and the end_date trigger extends the cycle by one
 * working day. On the morning of the skip date, the status_tick cron at
 * 00:05 AE promotes the sub from Active → Skipped so the existing 20:00 AE
 * delivery cron sees the right state and doesn't increment delivered_meals.
 *
 * Distinct from same-day skipMeal:
 *   • skipMeal      — today only, before 2 PM AE, irreversible. Flips status.
 *   • skipFutureDate — strictly future dates, reversible via unskipFutureDate
 *                       until the day BEFORE the skip. Doesn't flip status now.
 */
export async function skipFutureDate(subscriptionId: string, dateIso: string) {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  const subResult = await loadOwnedSubscription(auth.supabase, subscriptionId, auth.user.id);
  if (!subResult.ok) return { error: subResult.error };
  const { subscription } = subResult;

  // Active or Skipped only. Paused/Scheduled/Ended subs can't queue skips —
  // Paused has unstable end_date, Scheduled isn't delivering yet, Ended is done.
  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE && subscription.status !== SUBSCRIPTION_STATUS.SKIPPED) {
    return { error: 'Skips can only be scheduled on an active subscription.' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { error: 'Invalid date format.' };
  }

  // Strictly future. Today's skip goes through the same-day skipMeal path
  // (with the 2 PM cutoff). Keeps the two flows from stepping on each other.
  const todayIso = aeTodayIso();
  if (dateIso <= todayIso) {
    return { error: 'Pick a date in the future. Use the same-day skip button to skip today\'s meal.' };
  }

  // Within the current cycle window
  if (dateIso > subscription.end_date) {
    return { error: 'Pick a date inside your current cycle.' };
  }

  // Working day for this week_type
  const wt = subscription.week_type ?? '6DAYS';
  const targetD = new Date(dateIso + 'T00:00:00');
  if (!isWorkingDayForWeekType(targetD, wt)) {
    return { error: 'That isn\'t a delivery day for your plan — there\'s nothing to skip.' };
  }

  // Already scheduled?
  const existing: string[] = subscription.skipped_dates ?? [];
  if (existing.includes(dateIso)) {
    return { error: 'You\'ve already scheduled a skip for that day.' };
  }

  // Skip credits — base plan cap + Dorm Wars milestone-15 bonus.
  const baseMaxSkipsP = resolvePlan(subscription.plan_name)?.maxSkips ?? 0;
  const bonusSkipsP   = (subscription as { bonus_skips?: number | null }).bonus_skips ?? 0;
  const maxSkips      = baseMaxSkipsP + bonusSkipsP;
  if (subscription.skipped_meals_count >= maxSkips) {
    return { error: `You've used all ${maxSkips} of your skips for this cycle.` };
  }

  // Make-up day check. The cycle's "intrinsic" length is totalDeliveries
  // working days from start; anything past that is a make-up day earned by
  // earlier skips. Disallowing make-up skips prevents a runaway extension
  // loop (skip make-up → cycle extends → more make-up days → skip again…).
  const mealsPerDelivery = subscription.meals_per_day ?? 1;
  const totalDeliveries = Math.max(1, Math.ceil(subscription.total_meals / mealsPerDelivery));
  const targetPosition = workingDayPosition(subscription.start_date, dateIso, wt);
  if (targetPosition > totalDeliveries) {
    return { error: 'Make-up days can\'t be skipped — they\'re already extra days earned by earlier skips.' };
  }

  // Block skips inside (or on) a planned pause window. Variant B is open-
  // ended (no end date), so EVERY day from planned_pause_start onwards is
  // covered by the pause. Skipping inside that window would burn a credit
  // for no delivery — the pause already covers that day. Customer should
  // cancel the planned pause first if they want to skip a specific day in
  // the would-be pause range.
  if (subscription.planned_pause_start && dateIso >= subscription.planned_pause_start) {
    return { error: 'That day is inside your planned pause — no need to skip. Cancel the planned pause first if you want to skip this day specifically.' };
  }

  // Note on queued renewals: this used to reject, but the DB trigger
  // `trg_subscriptions_shift_queued_scheduled` (which fires on
  // skipped_meals_count changes) automatically shifts the queued sub's
  // start_date forward when end_date moves. The customer sees the
  // cascade explained via a banner in the FutureSkipModal — we let
  // the action proceed and trust the trigger to keep the dates clean.

  // Append + increment. CAS on skipped_meals_count guards against concurrent
  // skip requests racing past the credit check above.
  const nextSkippedDates = [...existing, dateIso].sort();
  const { data: rows, error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      skipped_meals_count: subscription.skipped_meals_count + 1,
      skipped_dates: nextSkippedDates,
    })
    .eq('id', subscriptionId)
    .eq('skipped_meals_count', subscription.skipped_meals_count)
    .select('id');

  if (updateError) return { error: 'Failed to schedule skip.' };
  if (!rows || rows.length === 0) {
    return { error: 'Couldn\'t schedule the skip — please refresh and try again.' };
  }

  revalidatePath('/dashboard', 'layout');
  return { success: true };
}

/**
 * Reverse a scheduled future skip. Only works for STRICTLY FUTURE dates —
 * today's same-day skips remain irreversible per the operational policy
 * (kitchen prep has already started by the time the customer's looking).
 *
 * Removes the date from `skipped_dates`, decrements `skipped_meals_count`,
 * and the existing end_date trigger contracts the cycle by one working day.
 */
export async function unskipFutureDate(subscriptionId: string, dateIso: string) {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  const subResult = await loadOwnedSubscription(auth.supabase, subscriptionId, auth.user.id);
  if (!subResult.ok) return { error: subResult.error };
  const { subscription } = subResult;

  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE && subscription.status !== SUBSCRIPTION_STATUS.SKIPPED) {
    return { error: 'Cannot un-skip on an inactive subscription.' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { error: 'Invalid date format.' };
  }

  // Same-day un-skip is intentionally not supported. Today's path goes through
  // skipMeal which is irreversible per project policy (kitchen ops cascade).
  const todayIso = aeTodayIso();
  if (dateIso <= todayIso) {
    return { error: 'Past skips and today\'s skip can\'t be undone.' };
  }

  const existing: string[] = subscription.skipped_dates ?? [];
  if (!existing.includes(dateIso)) {
    return { error: 'That day isn\'t scheduled as a skip.' };
  }

  const nextSkippedDates = existing.filter((d: string) => d !== dateIso);
  const newCount = Math.max(0, subscription.skipped_meals_count - 1);

  const { data: rows, error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      skipped_meals_count: newCount,
      skipped_dates: nextSkippedDates,
    })
    .eq('id', subscriptionId)
    .eq('skipped_meals_count', subscription.skipped_meals_count)
    .select('id');

  if (updateError) return { error: 'Failed to un-skip.' };
  if (!rows || rows.length === 0) {
    return { error: 'Couldn\'t un-skip — please refresh and try again.' };
  }

  revalidatePath('/dashboard', 'layout');
  return { success: true };
}

/**
 * Schedule a FUTURE pause start date (Variant B — open-ended).
 *
 * The customer specifies WHEN the pause begins; they resume manually when
 * they're back. On the start date AE, the subscription_status_tick cron at
 * 00:05 AE promotes Active|Skipped → Paused and clears planned_pause_start.
 *
 * Credit accounting: has_paused_before is set true at plan-time. The "1 free
 * pause per cycle" rule is now anchored on plan-commit, not pause-activation.
 * cancelPlannedPause refunds the credit (sets has_paused_before back to false)
 * BEFORE activation; once the cron flips status, the credit is fully spent.
 *
 * Distinct from immediate pauseSubscription:
 *   • pauseSubscription — flips status now. Cascade end_date as paused_days grow.
 *   • planPause         — sets a future date. No status change yet. Customer
 *                          can still pauseSubscription manually to override.
 */
export async function planPause(subscriptionId: string, startDateIso: string) {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  const subResult = await loadOwnedSubscription(auth.supabase, subscriptionId, auth.user.id);
  if (!subResult.ok) return { error: subResult.error };
  const { subscription } = subResult;

  // Status: Active or Skipped only. Paused/Scheduled/Ended can't queue a
  // future pause for the same reasons they can't queue a future skip.
  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE && subscription.status !== SUBSCRIPTION_STATUS.SKIPPED) {
    return { error: 'Pauses can only be scheduled on an active subscription.' };
  }

  // Tier gate — only Monthly Premium / Max can pause.
  if (!resolvePlan(subscription.plan_name)?.canPause) {
    return { error: 'Only Monthly Premium and Monthly Max plans can be paused.' };
  }

  // Credit check. has_paused_before with no existing plan means the credit is
  // spent (manual pause + resume happened earlier this cycle). With an existing
  // plan, the customer is trying to re-plan — that's a no-op error: they should
  // cancel the existing plan first.
  if (subscription.planned_pause_start) {
    return { error: 'You already have a pause scheduled. Cancel it first to pick a different date.' };
  }
  if (subscription.has_paused_before) {
    return { error: 'You\'ve already used your 1 allowed pause for this subscription.' };
  }

  // Date validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateIso)) {
    return { error: 'Invalid date format.' };
  }

  // Strictly future — same-day pause should use pauseSubscription directly.
  const todayIso = aeTodayIso();
  if (startDateIso <= todayIso) {
    return { error: 'Pick a date in the future. Use Pause now to pause today.' };
  }

  // Within the current cycle, AND not on the literal last day. Pausing on
  // end_date is meaningless (cycle ends after that day) and a potential
  // abuse vector — same rule as same-day pauseSubscription.
  if (startDateIso >= subscription.end_date) {
    return { error: 'Pick a date before your last delivery day — pausing on the final day doesn\'t save a meal.' };
  }

  // Working day for this week_type — pausing on a non-delivery day burns the
  // credit without protecting any meal that day (none was scheduled). Better
  // to start the pause on the next working day.
  const wt = subscription.week_type ?? '6DAYS';
  const targetD = new Date(startDateIso + 'T00:00:00');
  if (!isWorkingDayForWeekType(targetD, wt)) {
    return { error: 'Pick a delivery day — pausing on a non-delivery day doesn\'t save a meal.' };
  }

  // Not a make-up day (cycle's intrinsic length only).
  const mealsPerDelivery = subscription.meals_per_day ?? 1;
  const totalDeliveries = Math.max(1, Math.ceil(subscription.total_meals / mealsPerDelivery));
  const targetPosition = workingDayPosition(subscription.start_date, startDateIso, wt);
  if (targetPosition > totalDeliveries) {
    return { error: 'Pauses can\'t start on a make-up day — those are extra days earned by earlier skips.' };
  }

  // Auto-cancel any scheduled future skips that fall inside the new pause
  // window. Skipping inside a pause is wasted credit (the pause covers
  // the day) and double-extends the cycle. Refund those credits in the
  // same atomic update so the customer's net state is clean. The modal
  // surfaces this list as a warning before confirm, so this isn't a
  // silent side effect.
  const existingSkippedDates: string[] = subscription.skipped_dates ?? [];
  const skipsToKeep = existingSkippedDates.filter(d => d < startDateIso);
  const cancelledSkipsCount = existingSkippedDates.length - skipsToKeep.length;
  const newSkippedMealsCount = Math.max(0, subscription.skipped_meals_count - cancelledSkipsCount);

  // Commit. CAS on has_paused_before AND on skipped_meals_count guards
  // against concurrent plan-pause / skip-cancel races.
  const { data: rows, error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      planned_pause_start: startDateIso,
      has_paused_before: true,
      skipped_dates: skipsToKeep,
      skipped_meals_count: newSkippedMealsCount,
    })
    .eq('id', subscriptionId)
    .eq('has_paused_before', false)
    .eq('skipped_meals_count', subscription.skipped_meals_count)
    .is('planned_pause_start', null)
    .select('id');

  if (updateError) return { error: 'Failed to schedule pause.' };
  if (!rows || rows.length === 0) {
    return { error: 'Couldn\'t schedule the pause — please refresh and try again.' };
  }

  // ── WhatsApp confirmation ──────────────────────────────────────────────
  // Immediate confirm telling the user the date their plan WILL pause —
  // distinct from plan_paused_confirm (which fires when pause is now).
  // The cron's auto-activation on the planned date doesn't get its own
  // message; this scheduling confirm IS the receipt.
  await queueCustomerNotification(
    auth.user.id,
    'plan_pause_scheduled_confirm',
    new Date(),
    { start_date: startDateIso },
  );

  revalidatePath('/dashboard', 'layout');
  return { success: true };
}

/**
 * Cancel a pre-scheduled pause. Only valid BEFORE activation (the cron has
 * not yet flipped the sub to Paused). Refunds the pause credit by resetting
 * has_paused_before to false — the customer is restored to "1 unused pause"
 * for this cycle.
 *
 * Once the cron activates the pause (status → Paused), this action no longer
 * applies — the customer is genuinely paused and needs to call
 * resumeSubscription to come back.
 */
export async function cancelPlannedPause(subscriptionId: string) {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  const subResult = await loadOwnedSubscription(auth.supabase, subscriptionId, auth.user.id);
  if (!subResult.ok) return { error: subResult.error };
  const { subscription } = subResult;

  if (!subscription.planned_pause_start) {
    return { error: 'No pause is scheduled.' };
  }
  // If the sub has already activated into Paused, the customer should use
  // resume, not cancel. The planned_pause_start column gets cleared on
  // activation so this should be unreachable in practice — defensive check.
  if (subscription.status === SUBSCRIPTION_STATUS.PAUSED) {
    return { error: 'Your pause is already active — use Resume to come back.' };
  }

  const { data: rows, error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      planned_pause_start: null,
      has_paused_before: false,
    })
    .eq('id', subscriptionId)
    .eq('planned_pause_start', subscription.planned_pause_start)
    .select('id');

  if (updateError) return { error: 'Failed to cancel scheduled pause.' };
  if (!rows || rows.length === 0) {
    return { error: 'Couldn\'t cancel — please refresh and try again.' };
  }

  revalidatePath('/dashboard', 'layout');
  return { success: true };
}

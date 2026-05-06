'use server';

import { revalidatePath } from 'next/cache';
import { resolvePlan } from '@/lib/plans';
import { requireUser } from '@/lib/auth-helpers';
import { loadOwnedSubscription } from '@/lib/subscriptions';
import { SUBSCRIPTION_STATUS } from '@/lib/subscription-status';

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
  const { data: liveSub } = await auth.supabase
    .from('subscriptions')
    .select('id')
    .eq('customer_id', auth.user.id)
    .in('status', ['Active', 'Paused', 'Skipped', 'Scheduled'])
    .limit(1)
    .maybeSingle();

  if (liveSub) {
    const { error } = await auth.supabase
      .from('customers')
      .update({
        pending_meal_preference_type: input.meal_preference_type,
        pending_week_type: input.week_type,
        pending_allergens: input.allergens,
        pending_spice_level_preference: input.spice_level_preference,
        pending_veg_days: isReligious ? cleanVegDays : null,
      })
      .eq('id', auth.user.id);
    if (error) return { error: 'Failed to save preferences.' };

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/profile');
    return { ok: true, applied: 'next' };
  }

  // No live sub — write to current fields and clear any stale pending_*
  // (e.g. customer queued a change, the queued sub never materialised, and
  // they're now editing again with no live sub).
  const { error } = await auth.supabase
    .from('customers')
    .update({
      meal_preference_type: input.meal_preference_type,
      week_type: input.week_type,
      allergens: input.allergens,
      spice_level_preference: input.spice_level_preference,
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
  if (subscription.has_paused_before) return { error: 'You have already used your 1 allowed pause for this subscription.' };

  // Apply Pause. Note: paused_days is NOT touched here — the daily
  // subscription_pause_tick cron at 00:10 AE increments it by 1 for every
  // day the sub stays Paused, and the trigger pushes end_date out via the
  // canonical formula on each increment. has_paused_before stays true even
  // after resume so the 1-pause-per-cycle rule sticks.
  // CAS guard: only flip Active → Paused. Stops a double-tap from re-pausing
  // an already-Paused row (which would no-op but reset pause_date) or racing
  // against a same-window skip.
  const { data: pauseRows, error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      status: SUBSCRIPTION_STATUS.PAUSED,
      pause_date: new Date().toISOString(),
      has_paused_before: true
    })
    .eq('id', subscriptionId)
    .eq('status', SUBSCRIPTION_STATUS.ACTIVE)
    .select('id');

  if (updateError) return { error: 'Failed to pause subscription.' };
  if (!pauseRows || pauseRows.length === 0) {
    return { error: 'Pause didn\'t take. Refresh and try again, or message us on WhatsApp.' };
  }

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

  // Apply Resume. paused_days is NOT touched — the subscription_pause_tick
  // cron has already been incrementing it by 1 for every midnight crossed
  // while paused, and the end_date trigger has been pushing the calendar
  // out accordingly. Adding diffDays here would double-count.
  // CAS guard: only flip Paused → Active. Prevents a stale "resume" from
  // overwriting a sub that's since been Ended by status_tick.
  const { data: resumeRows, error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      pause_date: null,
    })
    .eq('id', subscriptionId)
    .eq('status', SUBSCRIPTION_STATUS.PAUSED)
    .select('id');

  if (updateError) return { error: 'Failed to resume subscription.' };
  if (!resumeRows || resumeRows.length === 0) {
    return { error: 'Resume didn\'t take. Refresh and try again, or message us on WhatsApp.' };
  }

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
    .in('status', ['Active', 'Paused', 'Skipped'])
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

  const maxSkips = resolvePlan(subscription.plan_name)?.maxSkips ?? 0;

  if (subscription.skipped_meals_count >= maxSkips) {
    return { error: `You have reached the maximum allowed skips (${maxSkips}) for this subscription plan.` };
  }

  // Promote skip to a real DB status — flips Active → Skipped. The
  // subscription_status_tick cron at 00:05 AE auto-reverts to Active so
  // tomorrow's delivery proceeds. The end_date trigger fires on the
  // skipped_meals_count change and pushes end_date out by the formula.
  // The .eq('status', Active) is a CAS guard against double-tap / concurrent
  // skip racing past the in-memory check above. If status has flipped between
  // the SELECT and this UPDATE, the WHERE matches zero rows and we surface
  // a "didn't take" error rather than incrementing the count twice.
  const { data: skipRows, error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      status: SUBSCRIPTION_STATUS.SKIPPED,
      skipped_meals_count: subscription.skipped_meals_count + 1,
      last_skipped_date: new Date().toISOString(),
    })
    .eq('id', subscriptionId)
    .eq('status', SUBSCRIPTION_STATUS.ACTIVE)
    .select('id');

  if (updateError) return { error: 'Failed to skip meal.' };
  if (!skipRows || skipRows.length === 0) {
    return { error: 'Skip didn\'t take. Refresh and try again, or message us on WhatsApp.' };
  }

  // Revalidate at layout level so the sidebar/topbar plan badge + every nested
  // route under /dashboard sees the new status.
  revalidatePath('/dashboard', 'layout');
  return { success: true };
}

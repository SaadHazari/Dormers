'use server';

import { revalidatePath } from 'next/cache';
import { resolvePlan } from '@/lib/plans';
import { requireUser } from '@/lib/auth-helpers';
import { loadOwnedSubscription } from '@/lib/subscriptions';
import { SUBSCRIPTION_STATUS } from '@/lib/subscription-status';

export async function updateProfile(data: {
  name: string;
  whatsapp_number: string;
  dorm_name: string;
  allergens: string;
  spice_level_preference: string;
  meal_preference_type?: string;
}) {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase
    .from('customers')
    .update(data)
    .eq('id', auth.user.id);

  if (error) return { error: 'Failed to update profile.' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/plan');
  return { success: true };
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

  // Apply Pause
  const { error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      status: SUBSCRIPTION_STATUS.PAUSED,
      pause_date: new Date().toISOString(),
      has_paused_before: true
    })
    .eq('id', subscriptionId);

  if (updateError) return { error: 'Failed to pause subscription.' };

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
  if (!subscription.pause_date) return { error: 'Pause date missing. Cannot calculate extension.' };

  // Calculate days passed since paused
  const pauseDate = new Date(subscription.pause_date);
  const now = new Date();
  
  // Calculate difference in whole days
  const diffTime = Math.abs(now.getTime() - pauseDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

  // Extend end_date by the number of days paused
  const newEndDate = new Date(subscription.end_date);
  newEndDate.setDate(newEndDate.getDate() + diffDays);

  const newPausedDaysTotal = (subscription.paused_days || 0) + diffDays;

  // Apply Resume
  const { error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      pause_date: null,
      end_date: newEndDate.toISOString(),
      paused_days: newPausedDaysTotal
    })
    .eq('id', subscriptionId);

  if (updateError) return { error: 'Failed to resume subscription.' };

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

  // Recompute end_date from the plan's canonical duration. Avoids drift if
  // the previous end_date was hand-edited or accumulated skip/pause extensions
  // (shouldn't be possible on a Scheduled sub, but defensive).
  const planDef = resolvePlan(subscription.plan_name);
  if (!planDef) return { error: 'Could not resolve plan' };
  const newEnd = new Date(requested);
  newEnd.setDate(newEnd.getDate() + planDef.durationDays);

  const { error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      start_date: requested.toISOString(),
      end_date: newEnd.toISOString(),
    })
    .eq('id', subscriptionId);

  if (updateError) return { error: 'Failed to update start date.' };

  revalidatePath('/dashboard', 'layout');
  return { success: true };
}

export async function skipMeal(subscriptionId: string) {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  const subResult = await loadOwnedSubscription(auth.supabase, subscriptionId, auth.user.id);
  if (!subResult.ok) return { error: subResult.error };
  const { subscription } = subResult;

  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) return { error: 'Cannot skip a meal on an inactive or paused subscription.' };

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

  const maxSkips = resolvePlan(subscription.plan_name)?.maxSkips ?? 0;

  if (subscription.skipped_meals_count >= maxSkips) {
    return { error: `You have reached the maximum allowed skips (${maxSkips}) for this subscription plan.` };
  }

  // Extend end_date by 1 day as the meal pushes back your final delivery date.
  // Sunday is a non-delivery day, so if the new end_date lands on Sunday, push to Monday.
  const newEndDate = new Date(subscription.end_date);
  newEndDate.setDate(newEndDate.getDate() + 1);
  if (newEndDate.getDay() === 0) {
    // 0 = Sunday → bump one more day so the user gets a real delivery
    newEndDate.setDate(newEndDate.getDate() + 1);
  }

  const { error: updateError } = await auth.supabase
    .from('subscriptions')
    .update({
      skipped_meals_count: subscription.skipped_meals_count + 1,
      last_skipped_date: new Date().toISOString(),
      end_date: newEndDate.toISOString()
    })
    .eq('id', subscriptionId);

  if (updateError) return { error: 'Failed to skip meal.' };

  // Revalidate at layout level so the sidebar/topbar plan badge + every nested
  // route under /dashboard sees the new status.
  revalidatePath('/dashboard', 'layout');
  return { success: true };
}

'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export async function pauseSubscription(subscriptionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'Unauthorized' };

  // Fetch the subscription
  const { data: subscription, error: fetchError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .eq('customer_id', user.id)
    .single();

  if (fetchError || !subscription) return { error: 'Subscription not found' };

  // Validation
  if (subscription.status === 'Paused') return { error: 'Subscription is already paused.' };
  if (subscription.status === 'Ended') return { error: 'Cannot pause an ended subscription.' };
  if (!subscription.plan_name.includes('Monthly Premium')) return { error: 'Only Monthly Premium plans can be paused.' };
  if (subscription.has_paused_before) return { error: 'You have already used your 1 allowed pause for this subscription.' };

  // Apply Pause
  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({
      status: 'Paused',
      pause_date: new Date().toISOString(),
      has_paused_before: true
    })
    .eq('id', subscriptionId);

  if (updateError) return { error: 'Failed to pause subscription.' };

  revalidatePath('/dashboard');
  return { success: true };
}

export async function resumeSubscription(subscriptionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'Unauthorized' };

  // Fetch the subscription
  const { data: subscription, error: fetchError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .eq('customer_id', user.id)
    .single();

  if (fetchError || !subscription) return { error: 'Subscription not found' };
  if (subscription.status !== 'Paused') return { error: 'Subscription is not currently paused.' };
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
  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({
      status: 'Active',
      pause_date: null,
      end_date: newEndDate.toISOString(),
      paused_days: newPausedDaysTotal
    })
    .eq('id', subscriptionId);

  if (updateError) return { error: 'Failed to resume subscription.' };

  revalidatePath('/dashboard');
  return { success: true };
}

export async function skipMeal(subscriptionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'Unauthorized' };

  // Fetch the subscription
  const { data: subscription, error: fetchError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .eq('customer_id', user.id)
    .single();

  if (fetchError || !subscription) return { error: 'Subscription not found' };

  if (subscription.status !== 'Active') return { error: 'Cannot skip a meal on an inactive or paused subscription.' };

  const isWeekly = subscription.plan_name.includes('Weekly Flex');
  const maxSkips = isWeekly ? 1 : 3;

  if (subscription.skipped_meals_count >= maxSkips) {
    return { error: `You have reached the maximum allowed skips (${maxSkips}) for this subscription plan.` };
  }

  // Extend end_date by 1 day as the meal pushes back your final delivery date
  const newEndDate = new Date(subscription.end_date);
  newEndDate.setDate(newEndDate.getDate() + 1);

  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({
      skipped_meals_count: subscription.skipped_meals_count + 1,
      last_skipped_date: new Date().toISOString(),
      end_date: newEndDate.toISOString()
    })
    .eq('id', subscriptionId);

  if (updateError) return { error: 'Failed to skip meal.' };

  revalidatePath('/dashboard');
  return { success: true };
}

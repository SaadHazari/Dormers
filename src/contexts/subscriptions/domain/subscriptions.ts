import type { SupabaseClient } from '@supabase/supabase-js'
import type { SubscriptionStatus } from './subscription-status'

/**
 * Subscription row shape as fetched from the `subscriptions` table.
 *
 * Hand-typed from the live Supabase schema (table `public.subscriptions`)
 * — matches columns + CHECK constraints + nullability exactly as of
 * 2026-05-28. When the Supabase generated types land, this becomes a
 * one-line `Database['public']['Tables']['subscriptions']['Row']` re-export.
 *
 * Used by:
 *   • SubscriptionMutations (pause/resume/skip/etc.) reads + writes
 *   • Repository functions (getActiveSubscription, getQueuedSubscription, …)
 *   • Dashboard render layers (HeroToday, PlanProgress, etc.)
 *
 * NOTE: `week_type` is narrower than the end-date computation's WeekType
 * (which includes '7DAYS' for the formula). At the DB level, customers can
 * only be on 5- or 6-day plans. Callers that need to pass week_type into
 * end-date helpers should widen at the call site.
 */
export type SubscriptionWeekType = '5DAYS' | '6DAYS'

export interface Subscription {
  id: string
  customer_id: string
  plan_name: string
  status: SubscriptionStatus | null
  start_date: string                          // YYYY-MM-DD
  end_date: string                            // YYYY-MM-DD
  meals_per_day: number | null                // default 1
  total_meals: number
  delivered_meals: number | null              // default 0
  paused_days: number | null                  // default 0
  pause_date: string | null                   // ISO timestamp
  has_paused_before: boolean | null           // default false
  last_skipped_date: string | null            // ISO timestamp
  skipped_meals_count: number                 // default 0
  created_at: string                          // ISO timestamp
  week_type: SubscriptionWeekType             // CHECK: '5DAYS' | '6DAYS'
  start_date_changed_at: string | null        // ISO timestamp
  veg_days: string[] | null                   // religious-mix only
  resume_cutoff_date: string | null           // YYYY-MM-DD
  skipped_dates: string[]                     // YYYY-MM-DD[], default []
  planned_pause_start: string | null          // YYYY-MM-DD
  original_start_date: string | null          // YYYY-MM-DD
  bonus_skips: number                         // default 0 (Dorm Wars milestone 15)
  paused_dates: string[]                      // YYYY-MM-DD[], default []
  start_email_sent_at: string | null          // ISO timestamp
  closure_days: number                        // default 0 — company-wide holiday extensions
}

/**
 * Back-compat alias — many call sites still import `SubscriptionRow`.
 * Same shape as Subscription; will be inlined and removed in a follow-up
 * once each consumer is updated to use Subscription directly.
 */
export type SubscriptionRow = Subscription

export type LoadSubscriptionResult =
    | { ok: true; subscription: Subscription }
    | { ok: false; error: string }

/**
 * Loads a subscription scoped to the calling user. Replaces the
 * `.from('subscriptions').select('*').eq('id', subId).eq('customer_id', userId).single()`
 * + null-check pattern that was duplicated across pause / resume / skip.
 *
 * Returns `{ ok: false, error: 'Subscription not found' }` for both
 * missing rows and rows owned by another user — same behaviour as the
 * inline version, with the security-relevant ownership check baked in.
 */
export async function loadOwnedSubscription(
    supabase: SupabaseClient,
    subscriptionId: string,
    userId: string,
): Promise<LoadSubscriptionResult> {
    const { data: subscription, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .eq('customer_id', userId)
        .single()

    if (error || !subscription) return { ok: false, error: 'Subscription not found' }
    return { ok: true, subscription: subscription as Subscription }
}

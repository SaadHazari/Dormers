import 'server-only';

/**
 * Pending-preference promotion, run by the dashboard layout for the signed-in
 * customer. A plain module, not a server action: it writes with the service
 * role for whichever user id it is given, so it must never be reachable from
 * a browser (moved out of preferences-actions.ts, security fix 2026-09-16).
 */

import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status';
import { createClient } from '@/utils/supabase/server';
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client';

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
  // for a Veg / Non Veg customer). Mirror the webhook's invariant —
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

  // Customers have no write access to their row; the service role writes it.
  await createAdminSupabaseClient().from('customers').update(patch).eq('id', userId);
}

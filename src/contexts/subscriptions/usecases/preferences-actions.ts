'use server';

/**
 * Subscriptions context — preferences use-case.
 *
 * Three server actions on the customer's PENDING preferences (apply from
 * NEXT subscription, not the live one). Carved out of the dashboard's
 * actions.ts god-file in Phase D of the layered refactor.
 *
 *   • savePendingPreferences          — write to pending_*, or apply now if no live sub
 *   • discardPendingPreferences       — restore canonical (clear pending_*)
 *   • promotePendingPreferencesIfStale — auto-drain on stale subs (called from layout)
 *
 * All three share the load/validate/mutate/revalidate skeleton; that's why
 * they live together as one deep module per L2-MODULE-SHAPES.md (#2 Subscriptions).
 */

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/contexts/identity/usecases/require-user';
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status';
import { createClient } from '@/utils/supabase/server';

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

/**
 * Effective preferences — the values to USE when creating the customer's
 * next subscription. Pending wins because the next sub IS what the
 * pending_* fields are queued for; if no pending value, fall back to the
 * canonical customer.* fields.
 *
 * The dashboard's CURRENT-cycle display still reads from the live
 * subscription's snapshot (sub.week_type, sub.veg_days, etc.) — pending
 * never affects what the customer sees today, only the next plan they buy.
 *
 * Used by:
 *   - /dashboard/plan checkout flow — populates the form for renewals so
 *     the customer's queued change is reflected in price + veg-day picker
 *   - PendingChangesBanner — diff the canonical against effective to
 *     render the before/after summary
 */

export type WeekType = '5DAYS' | '6DAYS'

export interface PreferencesShape {
  meal_preference_type?: string | null
  week_type?: WeekType | null
  allergens?: string | null
  spice_level_preference?: string | null
  // Canonical religious-mix preferred days (added 2026-05-07). Persists
  // across subscriptions; the fallback after pending_veg_days when
  // computing what the next sub will use.
  veg_days?: string[] | null
  pending_meal_preference_type?: string | null
  pending_week_type?: WeekType | null
  pending_allergens?: string | null
  pending_spice_level_preference?: string | null
  pending_veg_days?: string[] | null
}

export interface EffectivePreferences {
  meal_preference_type: string | null
  week_type: WeekType
  allergens: string | null
  spice_level_preference: string | null
  /** Religious-mix only; null otherwise. */
  veg_days: string[] | null
}

export function effectivePreferences(c: PreferencesShape | null | undefined): EffectivePreferences {
  const meal = c?.pending_meal_preference_type ?? c?.meal_preference_type ?? null
  const wt = c?.pending_week_type ?? c?.week_type ?? '6DAYS'
  return {
    meal_preference_type: meal,
    week_type: wt,
    allergens: c?.pending_allergens ?? c?.allergens ?? null,
    spice_level_preference: c?.pending_spice_level_preference ?? c?.spice_level_preference ?? null,
    // Precedence: queued change > saved canonical preference > none.
    // The canonical fallback (added 2026-05-07) means a returning religious-
    // mix customer who saved [Mon,Wed,Fri] in profile gets that count
    // pre-filled in the checkout's vegDayCount picker AND the day picker.
    veg_days: c?.pending_veg_days ?? c?.veg_days ?? null,
  }
}

/**
 * Has the customer queued ANY pending preference change? Drives whether
 * the pending-changes banner renders and whether the "Save for next
 * subscription" CTA is in its discard-secondary state.
 */
export function hasPendingPreferences(c: PreferencesShape | null | undefined): boolean {
  if (!c) return false
  return (
    c.pending_meal_preference_type != null ||
    c.pending_week_type != null ||
    c.pending_allergens != null ||
    c.pending_spice_level_preference != null ||
    (Array.isArray(c.pending_veg_days) && c.pending_veg_days.length > 0)
  )
}

/**
 * Per-field diff between canonical (current) and pending. Each entry's
 * `from` is what the live subscription was bought with; `to` is what the
 * next subscription will use. Only fields with an actual change are
 * included; identical pending values are filtered out so the banner
 * never shows "Veg → Veg" no-ops.
 */
export type PreferenceDiffEntry =
  | { key: 'meal_preference_type'; label: string; from: string | null; to: string }
  | { key: 'week_type'; label: string; from: WeekType | null; to: WeekType }
  | { key: 'allergens'; label: string; from: string | null; to: string }
  | { key: 'spice_level_preference'; label: string; from: string | null; to: string }
  | { key: 'veg_days'; label: string; from: string[] | null; to: string[] }

export function preferenceDiff(c: PreferencesShape | null | undefined): PreferenceDiffEntry[] {
  if (!c) return []
  const out: PreferenceDiffEntry[] = []

  if (c.pending_meal_preference_type != null && c.pending_meal_preference_type !== c.meal_preference_type) {
    out.push({
      key: 'meal_preference_type',
      label: 'Meal preference',
      from: c.meal_preference_type ?? null,
      to: c.pending_meal_preference_type,
    })
  }
  if (c.pending_week_type != null && c.pending_week_type !== c.week_type) {
    out.push({
      key: 'week_type',
      label: 'Delivery week',
      from: c.week_type ?? null,
      to: c.pending_week_type,
    })
  }
  if (c.pending_allergens != null && c.pending_allergens !== c.allergens) {
    out.push({
      key: 'allergens',
      label: 'Allergens',
      from: c.allergens ?? null,
      to: c.pending_allergens,
    })
  }
  if (c.pending_spice_level_preference != null && c.pending_spice_level_preference !== c.spice_level_preference) {
    out.push({
      key: 'spice_level_preference',
      label: 'Spice level',
      from: c.spice_level_preference ?? null,
      to: c.pending_spice_level_preference,
    })
  }
  // veg_days diff: only show if pending non-null and non-empty (the
  // savePendingPreferences action clears veg_days when meal pref isn't
  // religious so we don't carry stale picks).
  if (Array.isArray(c.pending_veg_days) && c.pending_veg_days.length > 0) {
    out.push({
      key: 'veg_days',
      label: 'Religious-mix veg days',
      from: null, // veg_days isn't a customer-level field; from is the prior sub.veg_days, but that's per-sub. Banner shows just the new picks.
      to: c.pending_veg_days,
    })
  }
  return out
}

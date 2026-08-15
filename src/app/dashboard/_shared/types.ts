import type { StaticImageData } from 'next/image'

/**
 * Shared dashboard types — pulled from ClientDashboard.tsx so extracted
 * sub-components (HeroToday, PlanProgress, etc.) can reference them
 * without circular imports.
 */

export interface Customer {
  id: string
  cid?: string | null
  name?: string | null
  whatsapp_number?: string | null
  dorm_name?: string | null
  meal_preference_type?: string | null
  allergens?: string | null
  spice_level_preference?: string | null
  // Religious-mix only — canonical "preferred veg days" memory. Kitchen
  // snapshots per-cycle into subscriptions.veg_days; this is the user's
  // standing preference, used to pre-fill the day picker at checkout
  // and rendered as the thumbnail chips when no live sub exists.
  veg_days?: string[] | null
  email?: string | null
  created_at: string
  // Phase 1 column. DB has NOT NULL DEFAULT '6DAYS' so reads always return
  // a value; nullable here only because legacy queries selected '*' before
  // the column existed and TS sees old shapes during incremental migrations.
  week_type?: '5DAYS' | '6DAYS' | null
  // Set during onboarding's WhatsApp OTP step or via security-actions
  // markWhatsappVerified. Never written from the inline profile form.
  whatsapp_verified?: boolean | null
  // True when the customer picked "Other" for dorm at onboarding (outside
  // listed delivery radius). Blocks plan purchase until customer-service
  // confirms coverage and clears it via Supabase admin.
  out_of_zone?: boolean | null
  // Pending preferences — apply from the customer's next subscription. Set
  // by Profile → Edit Preferences → "Save for next subscription" when a live
  // sub exists. Cleared by the webhook after the next sub is created.
  pending_meal_preference_type?: string | null
  pending_week_type?: '5DAYS' | '6DAYS' | null
  pending_allergens?: string | null
  pending_spice_level_preference?: string | null
  pending_veg_days?: string[] | null
  // Timestamp of the last auto-promotion of pending_* into canonical fields
  // (triggered when a sub ends without a renewal). Drives the post-end
  // "preferences applied" banner; gated on !hasActiveSub at render time.
  preferences_promoted_at?: string | null
  // Customer-supplied typical-takeout-cost benchmark (AED, 15-50). Drives the
  // "Saved this cycle" StatTile + lifetime savings in the greeting ribbon.
  // Null until the user answers the one-time slider question — in that state
  // the savings tile renders a "Set your benchmark" CTA instead of a number.
  takeout_benchmark_aed?: number | null
}

export interface Subscription {
  id: string
  plan_name: string
  status: string
  start_date: string
  end_date: string
  total_meals: number
  delivered_meals: number
  skipped_meals_count: number
  has_paused_before: boolean
  pause_date?: string | null
  last_skipped_date?: string | null
  paused_days?: number
  created_at: string
  // Phase 1 additions
  week_type?: '5DAYS' | '6DAYS' | null
  start_date_changed_at?: string | null
  // Goodwill meals an admin gifted onto this plan (damaged delivery, spice
  // complaint…). Already counted inside total_meals; the end_date trigger
  // appends one working day per gifted meal. Kept as its own column so the
  // plan page can label the gift instead of silently inflating the total.
  bonus_meals?: number | null
  // Religious-mix subs only — list of day names (e.g. ['Monday','Wednesday'])
  // that are veg deliveries. Length matches vegDayCount picked at checkout.
  // Drives per-day dish selection on the dashboard + /menu page.
  veg_days?: string[] | null
  // AE-wall-date ledger of every skip event on this sub (YYYY-MM-DD strings).
  // Drives per-pill state lookup in PlanProgress's calendar bar. Always
  // monotonically grows by skipMeal(); never rewritten. For legacy multi-skip
  // rows pre-dating the column, only the most recent skip is represented;
  // older skips are untraced and the bar renders them as a count-only fallback.
  skipped_dates?: string[] | null
  // AE-wall-date ledger of every paused delivery-day on this sub
  // (YYYY-MM-DD strings). Populated by subscription_pause_tick on each
  // 00:10 AE increment + by resumeSubscription when resume happens after
  // the 2 PM cutoff. Drives "Paused meal" greying in the weekly-review
  // grid so paused days aren't asked to review meals that never arrived.
  paused_dates?: string[] | null
  // Pre-scheduled pause start (AE wall date, YYYY-MM-DD). Set by planPause()
  // when a customer schedules a future pause; cleared by the status_tick cron
  // at 00:05 AE on the start date when it flips status to Paused. Also cleared
  // by cancelPlannedPause() or by pauseSubscription() (manual pause-now
  // overrides a planned pause). has_paused_before is set to true the moment
  // this is written — the pause credit is consumed at plan-time.
  planned_pause_start?: string | null
}

export interface CustomerProfile {
  week_type?: '5DAYS' | '6DAYS' | null
}

export type MealState = 'past' | 'today' | 'future'

export type MenuItem = {
  day: string                  // 'Mon', 'Tue', … 'Sat'
  date: string                 // 'Apr 1'
  dish: string
  sub: string
  tag: 'Veg' | 'Non Veg'
  heat: number
  image?: string | StaticImageData | null
  state: MealState
}

export type WeekStatus = 'live' | 'fallback' | 'empty'

/**
 * Seasonal intake pause state, threaded from the server component
 * (getIntakeState + creditAedFor + the customer's intake_waitlist row) down
 * through PlanClient to every surface that renders IntakePausedGate. Same
 * shape everywhere so the gate is a drop-in mount, not a bespoke prop list
 * per surface.
 */
export interface IntakeGateState {
  paused: boolean
  headline: string
  body: string
  creditAed: number
  alreadyJoined: boolean
}

/** Default for surfaces that don't thread a live `intake` prop (preview
 *  mode, tests) — never gates a purchase by accident. */
export const INTAKE_NOT_PAUSED: IntakeGateState = {
  paused: false,
  headline: '',
  body: '',
  creditAed: 0,
  alreadyJoined: false,
}

/**
 * Per-plan split of the customer's approved credit balance, keyed by the
 * display PlanId ('Trial' | 'Weekly Flex' | 'Monthly Premium' | 'Monthly
 * Max'). Server-computed ONCE from a single unfiltered credits fetch (see
 * getCreditSplitByPlan) and threaded down to the checkout leaf components
 * so switching plan cards updates the applied/locked amounts in memory,
 * no per-plan round trip. Partial because preview mode / a fetch failure
 * may leave it empty; every consumer must fall back to 0.
 */
export type CreditByPlan = Partial<Record<string, { balanceFils: number; lockedFils: number }>>

/**
 * UI-only computed status for the dashboard hero card. Distinct from
 * the persisted SubscriptionStatus — adds 'skipped' (derived from
 * `last_skipped_date`) which is not a stored sub.status value.
 */
export type LocalState = 'active' | 'skipped' | 'paused'

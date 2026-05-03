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
  email?: string | null
  created_at: string
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
 * UI-only computed status for the dashboard hero card. Distinct from
 * the persisted SubscriptionStatus — adds 'skipped' (derived from
 * `last_skipped_date`) which is not a stored sub.status value.
 */
export type LocalState = 'active' | 'skipped' | 'paused'

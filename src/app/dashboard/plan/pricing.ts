import type { LucideIcon } from 'lucide-react'
import {
  ChefHat, Globe, ShieldCheck, CalendarDays, SkipForward, RefreshCw,
  Unlock, BadgePercent, Pause, Zap,
} from 'lucide-react'

// Religious mix: index = number of veg days (0–6)
const MIXED_MONTHLY_PER_MEAL = [22, 22, 21, 20, 19, 18, 17]
const MIXED_WEEKLY_PER_MEAL = [23, 21.67, 21.67, 21, 21, 20, 19]

export type Pref = 'NonVeg' | 'Veg' | 'Religious'
export type PlanId = 'Trial' | 'Weekly Flex' | 'Monthly Premium' | 'Monthly Max'

export type Feature = { text: string; icon: LucideIcon }

export interface PlanDef {
  id: PlanId
  badge?: string
  badgeTone?: 'orange' | 'gold'
  duration: string
  meals: number
  period: '/meal' | '/week' | '/month'
  features: Feature[]
  disclaimer?: string
}

export const PLANS: PlanDef[] = [
  {
    id: 'Trial',
    badge: 'One-time trial',
    duration: 'Single delivery',
    meals: 1,
    period: '/meal',
    features: [
      { text: '1 freshly cooked meal', icon: ChefHat },
      { text: 'Any cuisine preference', icon: Globe },
      { text: 'No commitment whatsoever', icon: ShieldCheck },
    ],
  },
  {
    id: 'Weekly Flex',
    badge: 'Low commitment',
    duration: '1 week · 6 days/week',
    meals: 6,
    period: '/week',
    features: [
      { text: '6 meals per week', icon: CalendarDays },
      { text: '1 meal skip included', icon: SkipForward },
      { text: 'Renew or cancel weekly', icon: RefreshCw },
      { text: 'No long-term lock-in', icon: Unlock },
    ],
  },
  {
    id: 'Monthly Premium',
    badge: 'Best value',
    badgeTone: 'orange',
    duration: '4 weeks · 6 days/week',
    meals: 24,
    period: '/month',
    features: [
      { text: '24 meals per month', icon: CalendarDays },
      { text: 'Lowest price per meal', icon: BadgePercent },
      { text: '1 free pause (indefinite)', icon: Pause },
      { text: '3 meal skips included', icon: SkipForward },
      { text: 'Priority delivery slot', icon: Zap },
    ],
  },
  {
    id: 'Monthly Max',
    badge: 'For the hungry',
    badgeTone: 'gold',
    duration: '4 weeks · 6 days/week · 2 meals/day',
    meals: 48,
    period: '/month',
    features: [
      { text: '48 meals per month (24 days × 2)', icon: CalendarDays },
      { text: 'Lowest Price across the board', icon: BadgePercent },
      { text: '1 free pause (indefinite)', icon: Pause },
      { text: '3 meal skips included', icon: SkipForward },
      { text: 'Priority delivery slot', icon: Zap },
    ],
    disclaimer:
      'Both meals delivered together at 7:00–8:00 PM. Both meals are the same dish — not two different meals.',
  },
]

// Per-meal price for a plan given current preference
export function pricePerMeal(plan: PlanId, pref: Pref, vegDayCount: number): number {
  if (pref === 'Religious') {
    if (plan === 'Monthly Premium') return MIXED_MONTHLY_PER_MEAL[vegDayCount] ?? 22
    if (plan === 'Weekly Flex') return MIXED_WEEKLY_PER_MEAL[vegDayCount] ?? 23
    if (plan === 'Trial') return 25
    if (plan === 'Monthly Max') return Math.max(0, (MIXED_MONTHLY_PER_MEAL[vegDayCount] ?? 22) - 0.5)
  }
  if (pref === 'Veg') {
    if (plan === 'Monthly Premium') return 18
    if (plan === 'Weekly Flex') return 19
    if (plan === 'Trial') return 20
    if (plan === 'Monthly Max') return 17.5
  }
  if (plan === 'Monthly Premium') return 22
  if (plan === 'Weekly Flex') return 23
  if (plan === 'Trial') return 25
  if (plan === 'Monthly Max') return 21.5
  return 0
}

export function totalPrice(plan: PlanId, pref: Pref, vegDayCount: number): number {
  const p = pricePerMeal(plan, pref, vegDayCount)
  const def = PLANS.find(x => x.id === plan)!
  return Math.round(p * def.meals * 100) / 100
}

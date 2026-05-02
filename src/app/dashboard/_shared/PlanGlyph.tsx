import { Crown, Gem, Sparkles, Utensils, Star, type LucideIcon } from 'lucide-react'
import { OG } from './tokens'
import { resolvePlan, type PlanId } from '@/lib/plans'

// Single source of truth for the icon that sits adjacent to a plan name
// anywhere in the dashboard. Plan resolution is delegated to lib/plans.ts
// so any new plan automatically picks up an icon (or the Star fallback).
const GLYPHS: Record<PlanId, LucideIcon> = {
  'monthly-max': Crown,        // top tier, ceremonial
  'monthly-premium': Gem,      // the "diamond"
  'weekly-flex': Sparkles,     // light-touch, flexible
  'trial': Utensils,           // food-first, no commitment
}

export function PlanGlyph({
  planName,
  size = 14,
  color = OG,
  strokeWidth = 1.9,
}: {
  planName: string
  size?: number
  color?: string
  strokeWidth?: number
}) {
  const def = resolvePlan(planName)
  const Icon = def ? GLYPHS[def.id] : Star
  return <Icon size={size} strokeWidth={strokeWidth} color={color} />
}

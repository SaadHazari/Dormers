import { Crown, Gem, Sparkles, Utensils, Star } from 'lucide-react'
import { OG } from './tokens'

// Single source of truth for the icon that sits adjacent to a plan name
// anywhere in the dashboard. Matches `.includes()` so legacy decorated
// `plan_name` rows resolve correctly:
//   • Monthly Max     → Crown    (top tier, ceremonial)
//   • Monthly Premium → Gem      (the "diamond")
//   • Weekly Flex     → Sparkles (light-touch, flexible)
//   • One-Time / Trial → Utensils (food-first, no commitment)
//   • Anything else   → Star     (defensive fallback)
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
  if (planName.includes('Monthly Max'))     return <Crown    size={size} strokeWidth={strokeWidth} color={color} />
  if (planName.includes('Monthly Premium')) return <Gem      size={size} strokeWidth={strokeWidth} color={color} />
  if (planName.includes('Weekly Flex'))     return <Sparkles size={size} strokeWidth={strokeWidth} color={color} />
  if (planName.includes('One-Time') || planName.includes('Trial')) return <Utensils size={size} strokeWidth={strokeWidth} color={color} />
  return <Star size={size} strokeWidth={strokeWidth} color={color} />
}

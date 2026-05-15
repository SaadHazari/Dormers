'use client'

import { Flame } from 'lucide-react'  // Wave 5: swap to stencil flame
import { BODY } from '../../tokens'

const FLAME_COLOR = '#fff4d6'   // Cream warm-white — UI-SPEC Color: NOT OG (distinguishes from focus accent)

/**
 * HUD row 4: flame icon + integer streak + "DAY" label.
 * UI-SPEC: flame color cream warm-white (NOT OG); streak 14px/700 cream; "DAY" 10px/600 cream-muted (singular always per UI-SPEC Copywriting).
 *
 * On increment, the flame scales 1.0 → 1.15 → 1.0 over 240ms EXPO_OUT.
 * Reduced-motion: no scale animation.
 */
export function StreakFlame({ days }: { days: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: BODY,
    }}>
      <Flame size={16} strokeWidth={1.5} color={FLAME_COLOR} />
      <span style={{
        fontSize: 14,
        fontWeight: 700,
        color: '#ede8da',
        fontFeatureSettings: '"tnum"',
      }}>{Math.max(0, Math.floor(days))}</span>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(237,232,218,0.65)',
        letterSpacing: '0.08em',
      }}>DAY</span>
    </div>
  )
}

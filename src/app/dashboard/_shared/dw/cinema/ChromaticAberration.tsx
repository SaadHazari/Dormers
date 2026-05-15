'use client'

import type { ReactNode } from 'react'
import { useReducedMotionGate } from '../utils/useReducedMotionGate'

type ChromaticAberrationProps = {
  children: ReactNode
  active: boolean              // true while a stinger plays on this element
  durationMs?: number          // default 200 (UI-SPEC)
}

/**
 * Wraps a source element with a 1-2px RGB split filter chain.
 * Triggered when a stinger plays on/near the element (unlock, drop-reveal, warning,
 * milestone-fanfare, conversion-impact).
 *
 * UI-SPEC: 200ms ease-out — splits in over 60ms, holds 40ms, recombines over 100ms.
 * Applied to ELEMENT, not viewport (per UI-SPEC NOT applied to entire viewport).
 *
 * D-15 reduced-motion: disabled — element does NOT split. Children render normally.
 *
 * RESEARCH Code Examples: filter chain `drop-shadow(1px 0 0 rgba(255,0,0,0.5))
 * drop-shadow(-1px 0 0 rgba(0,0,255,0.5))`.
 */
export function ChromaticAberration({ children, active, durationMs = 200 }: ChromaticAberrationProps) {
  const reduced = useReducedMotionGate()
  const enabled = active && !reduced
  return (
    <span
      style={{
        display: 'inline-block',
        position: 'relative',
        filter: enabled
          ? 'drop-shadow(1px 0 0 rgba(255,0,0,0.5)) drop-shadow(-1px 0 0 rgba(0,0,255,0.5))'
          : 'none',
        transition: `filter ${durationMs}ms ease-out`,
      }}
    >
      {children}
    </span>
  )
}

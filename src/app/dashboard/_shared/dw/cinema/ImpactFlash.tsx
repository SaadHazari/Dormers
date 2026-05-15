'use client'

import { useEffect, useState } from 'react'
import { useReducedMotionGate } from '../utils/useReducedMotionGate'

type ImpactFlashProps = {
  trigger: number   // Incrementing counter — each increment re-fires the flash
}

/**
 * Full-viewport orange flash overlay. 80ms ease-out from 0.18 → 0 opacity.
 * UI-SPEC Motion Craft: triggered by friend-conversion event.
 *
 * D-15 reduced-motion: flash duration capped to 40ms (still a fade, not motion;
 * UI-SPEC Reduced Motion Map says "Flash still occurs (it's a fade, not a motion
 * — but capped to 40ms instead of 80ms)").
 *
 * z-index 9500: above HUD (9000) so the flash is visible over the wallet area
 * (anchored visually to the HUD's top-right corner where the wallet readout sits),
 * below modals (10000+) so cutscenes still cover it.
 */
export function ImpactFlash({ trigger }: ImpactFlashProps) {
  const reduced = useReducedMotionGate()
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (trigger === 0) return // initial mount — no flash
    setActive(true)
    const duration = reduced ? 40 : 80
    const id = setTimeout(() => setActive(false), duration)
    return () => clearTimeout(id)
  }, [trigger, reduced])

  return (
    <>
      <div
        aria-hidden
        className={active ? 'dw-impact-flash active' : 'dw-impact-flash'}
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 9500,                 // above HUD (9000), below modals (10000+)
          backgroundColor: 'rgba(245,127,32,0.18)',
          opacity: active ? 1 : 0,
        }}
      />
      <style>{`
        .dw-impact-flash {
          transition: opacity 80ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .dw-impact-flash { transition: opacity 40ms ease-out; }
        }
      `}</style>
    </>
  )
}

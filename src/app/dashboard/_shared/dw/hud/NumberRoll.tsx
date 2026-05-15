'use client'

import { useEffect, useRef } from 'react'
import { animate } from 'framer-motion'

const DIGIT_HEIGHT = 28           // px (UI-SPEC Wallet readout 24/700 + 4px breathing)
const ROLL_DURATION = 0.6         // 600ms (UI-SPEC NumberRoll spec)
const QUART_OUT: [number, number, number, number] = [0.25, 1, 0.5, 1]   // matches Phase 5 token

function DigitColumn({ value }: { value: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // RESEARCH Pitfall 4: imperative animate() does NOT auto-respect reduced-motion.
    // Check the MQ before each tween.
    const reduced = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const targetY = `translateY(${-value * DIGIT_HEIGHT}px)`
    if (reduced) {
      el.style.transform = targetY
      return
    }
    const ctrl = animate(
      el,
      { transform: targetY },
      { duration: ROLL_DURATION, ease: QUART_OUT }
    )
    return () => ctrl.stop()
  }, [value])
  return (
    <span style={{
      display: 'inline-block',
      height: DIGIT_HEIGHT,
      overflow: 'hidden',
      verticalAlign: 'top',
      fontFeatureSettings: '"tnum"',
    }}>
      <div ref={ref} style={{ display: 'flex', flexDirection: 'column' }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} style={{ height: DIGIT_HEIGHT, lineHeight: `${DIGIT_HEIGHT}px` }}>{i}</div>
        ))}
      </div>
    </span>
  )
}

/**
 * Tabular per-digit roll. Each digit column animates independently via framer-motion's `animate()`.
 * Only digits that change tween (per-digit useEffect dependency).
 *
 * Negative or non-integer values are coerced to 0.
 * D-15 reduced-motion: jump-sets transform without tween (verified via direct matchMedia check, per RESEARCH Pitfall 4).
 */
export function NumberRoll({ value }: { value: number }) {
  const safe = Math.max(0, Math.floor(value))
  const digits = String(safe).split('').map(Number)
  return (
    <span style={{ display: 'inline-flex', fontFeatureSettings: '"tnum"' }}>
      {digits.map((d, i) => <DigitColumn key={`${i}-${digits.length}`} value={d} />)}
    </span>
  )
}

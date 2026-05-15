'use client'
import { useEffect, useState } from 'react'

/**
 * Returns `true` when the user has set `prefers-reduced-motion: reduce` in their OS.
 * Subscribes to media-query change events so live OS toggles flip the gate without remount.
 * Phase 6 D-15: every motion module must early-return or jump to end-state when this returns true.
 */
export function useReducedMotionGate(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

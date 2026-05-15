'use client'
import { useEffect, useRef } from 'react'

// Module-scoped registry — one scroll listener for all layers.
type Entry = { el: HTMLElement; multiplier: number }
const layers: Entry[] = []
let rafId = 0

function tick() {
  const y = window.scrollY
  for (const { el, multiplier } of layers) {
    // Multiplier 1.0 = no parallax (foreground). 0.85 = mid. 0.5 = background.
    // Offset = scrollY * (1 - multiplier). Foreground gets 0 (no transform), background gets the biggest negative offset.
    const offset = y * (1 - multiplier)
    el.style.transform = `translate3d(0, ${offset}px, 0)`
  }
  rafId = 0
}

function onScroll() {
  if (!rafId) rafId = requestAnimationFrame(tick)
}

/**
 * Registers an element as a parallax layer with the given multiplier.
 * Multipliers: 0.5 (background, anchor image) | 0.85 (mid, hero glow + concentric circles) | 1.0 (foreground, normal scroll, no transform).
 * Phase 6 D-15: reduced-motion bails out — element stays at multiplier 1.0 (no transform).
 */
export function useParallaxLayer<T extends HTMLElement = HTMLDivElement>(multiplier: number) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const entry: Entry = { el, multiplier }
    layers.push(entry)
    if (layers.length === 1) window.addEventListener('scroll', onScroll, { passive: true })
    // Prime initial transform so layer doesn't pop on first scroll.
    tick()
    return () => {
      const i = layers.indexOf(entry)
      if (i >= 0) layers.splice(i, 1)
      if (layers.length === 0) window.removeEventListener('scroll', onScroll)
    }
  }, [multiplier])
  return ref
}

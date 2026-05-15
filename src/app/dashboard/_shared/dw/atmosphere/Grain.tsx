'use client'
import { useEffect, useState } from 'react'
import { useReducedMotionGate } from '../utils/useReducedMotionGate'

const FPS = 24                 // 24fps cycle (D-15 / RESEARCH Pattern 2). Drop to 12 if perf misses.
const FRAMES = 8               // 8 distinct grain frames
const OPACITY = 0.06           // 6% — middle of 4-8% range per UI-SPEC Atmosphere Stack
// TILE_SIZE not used directly — feTurbulence tiles via stitchTiles attribute. Kept for spec parity.

export function Grain() {
  const reduced = useReducedMotionGate()
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (reduced) return       // D-15: frozen at frame 0
    const id = setInterval(() => setFrame(f => (f + 1) % FRAMES), 1000 / FPS)
    return () => clearInterval(id)
  }, [reduced])
  // baseFrequency varies slightly per frame to mimic film-grain shimmer.
  const freq = (0.85 + (frame * 0.02)).toFixed(3)
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: OPACITY,
        mixBlendMode: 'overlay',
      }}
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <filter id="dw-grain-filter">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves="2" seed={frame} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#dw-grain-filter)" />
      </svg>
    </div>
  )
}

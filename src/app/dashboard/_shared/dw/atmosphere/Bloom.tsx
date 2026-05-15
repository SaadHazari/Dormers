'use client'
import type { ReactNode } from 'react'
import { useReducedMotionGate } from '../utils/useReducedMotionGate'

type BloomProps = {
  children: ReactNode
  color?: string                  // Bloom tint — default OG
  intensity?: number              // Baseline 0..2 (default 1.0)
  blurPx?: number                 // Default 24 (UI-SPEC: filter: blur(24px) saturate(1.4))
  audioReactive?: boolean         // Wave 2 wires real audio multiplier; this wave treats as 1.0
}

/**
 * Wraps a "hot" element with a duplicated blurred ghost sibling for additive glow.
 * Implementation: source renders normal; absolute-positioned span behind it carries `filter: blur() saturate()`.
 * CRITICAL: blur is on the GHOST sibling, NEVER on a parent — parent blur breaks position:fixed children
 * (RESEARCH Pitfall 1 — CSS filter creates a containing block for fixed/absolute descendants).
 * Reduced-motion: ghost stays at baseline intensity, no audio-reactive bumping.
 */
export function Bloom({
  children,
  color = '#f57f20',
  intensity = 1.0,
  blurPx = 24,
  audioReactive = false,
}: BloomProps) {
  const reduced = useReducedMotionGate()
  // Wave 2 will replace this stub with a useAudioReactive() multiplier; Wave 1 leaves it at 1.0.
  // The `audioReactive` prop is the seam for Wave 2 — kept in the API surface now so consumers
  // (DormWarsClient hot targets) don't need to be re-touched when audio lands.
  const audioMult = reduced || !audioReactive ? 1.0 : 1.0
  const finalIntensity = intensity * audioMult
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          color,
          filter: `blur(${blurPx}px) saturate(1.4)`,
          opacity: 0.6 * finalIntensity,
          pointerEvents: 'none',
          transform: `scale(${finalIntensity})`,
          transition: 'opacity 120ms linear, transform 120ms linear',
          zIndex: 0,
        }}
      >
        {children}
      </span>
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
    </span>
  )
}

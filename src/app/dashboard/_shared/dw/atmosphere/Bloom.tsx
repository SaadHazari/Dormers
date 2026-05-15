'use client'
import type { ReactNode } from 'react'
import { useReducedMotionGate } from '../utils/useReducedMotionGate'
import { useAudioReactive } from '../audio/useAudioReactive'

type BloomProps = {
  children: ReactNode
  color?: string                  // Bloom tint — default OG
  intensity?: number              // Baseline 0..2 (default 1.0)
  blurPx?: number                 // Default 24 (UI-SPEC: filter: blur(24px) saturate(1.4))
  audioReactive?: boolean         // When true, intensity gets analyser multiplier 1.0..1.4
  analyser?: AnalyserNode | null  // Wired by DormWarsClient when audio enabled
}

/**
 * Wraps a "hot" element with a duplicated blurred ghost sibling for additive glow.
 * Implementation: source renders normal; absolute-positioned span behind it carries `filter: blur() saturate()`.
 * CRITICAL: blur is on the GHOST sibling, NEVER on a parent — parent blur breaks position:fixed children
 * (RESEARCH Pitfall 1 — CSS filter creates a containing block for fixed/absolute descendants).
 *
 * Wave 1 mounted Bloom on the "war." headline with `audioReactive={false}`.
 * Wave 2 wires the `analyser` prop from useAudioBed's AnalyserNode and lets the
 * `audioReactive` flag pull the multiplier from useAudioReactive (1.0..1.4 range).
 *
 * Reduced-motion: useAudioReactive returns flat 1.0; static intensity preserved.
 */
export function Bloom({
  children,
  color = '#f57f20',
  intensity = 1.0,
  blurPx = 24,
  audioReactive = false,
  analyser = null,
}: BloomProps) {
  const reduced = useReducedMotionGate()
  const audioMult = useAudioReactive(analyser ?? null, audioReactive)
  // When audio is disabled or reduced-motion, audioMult is 1.0 baseline → stays at static intensity.
  const finalIntensity = reduced ? intensity : intensity * audioMult
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

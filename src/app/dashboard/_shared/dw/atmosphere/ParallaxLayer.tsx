'use client'
import type { CSSProperties, ReactNode } from 'react'
import { useParallaxLayer } from '../utils/useStratifiedParallax'

type ParallaxLayerProps = {
  multiplier: 0.5 | 0.85 | 1.0   // Allowed values from UI-SPEC Parallax Stratification table
  children: ReactNode
  style?: CSSProperties
  className?: string
}

/**
 * Wraps content with transform-driven parallax via shared rAF scroll listener.
 * 0.5 = background (anchor image, Wave 5). 0.85 = mid (hero glow, sub-headlines, concentric circles). 1.0 = foreground (no transform).
 * Reduced-motion: listener detaches, element stays at multiplier 1.0 (no transform).
 */
export function ParallaxLayer({ multiplier, children, style, className }: ParallaxLayerProps) {
  const ref = useParallaxLayer<HTMLDivElement>(multiplier)
  return (
    <div ref={ref} className={className} style={{ willChange: 'transform', ...style }}>
      {children}
    </div>
  )
}

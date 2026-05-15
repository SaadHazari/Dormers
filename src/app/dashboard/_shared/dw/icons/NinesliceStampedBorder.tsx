'use client'

import type { ReactNode, CSSProperties } from 'react'

type NinesliceProps = {
  children: ReactNode
  /** Stroke color for the corner marks. Defaults to currentColor (inherits). */
  color?: string
  /** Optional className for the outer wrapper. */
  className?: string
  /** Inline style passthrough on the outer wrapper. */
  style?: CSSProperties
}

/**
 * Vector 9-slice stamped/torn-edge border (Phase 6 D-08). Authored as 4 absolute-positioned
 * SVG corner pieces with currentColor stroke at 1.5px — the corners are present,
 * the edges are "implied" via negative space inside the wrapper. Slightly irregular
 * tick marks at the corner inflections mimic ink-stamp aesthetic.
 *
 * Applied (per UI-SPEC + D-08 scope):
 * - HUD rank pill (RankChevron) — wraps the OG-bordered pill
 * - Trophy Room earned tiles (locked tiles stay clean-edge to reinforce lock/unlock distinction)
 *
 * Implementation: vector-only (NOT raster). Uses `display: 'inline-block'` so the wrapper
 * sizes to its content. The corners overlay any existing border the inner content has.
 */
export function NinesliceStampedBorder({ children, color = 'currentColor', className, style }: NinesliceProps) {
  return (
    <span
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        padding: 4,
        color,
        ...style,
      }}
    >
      {/* Top-left corner */}
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ position: 'absolute', top: -1, left: -1, color, pointerEvents: 'none' }}>
        <polyline points="9 1 1 1 1 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" strokeLinecap="square" />
        <line x1="1" y1="3" x2="2.5" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      </svg>
      {/* Top-right corner */}
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ position: 'absolute', top: -1, right: -1, color, pointerEvents: 'none' }}>
        <polyline points="1 1 9 1 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" strokeLinecap="square" />
        <line x1="7.5" y1="3" x2="9" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      </svg>
      {/* Bottom-left corner */}
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ position: 'absolute', bottom: -1, left: -1, color, pointerEvents: 'none' }}>
        <polyline points="1 1 1 9 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" strokeLinecap="square" />
        <line x1="1" y1="7" x2="2.5" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      </svg>
      {/* Bottom-right corner */}
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ position: 'absolute', bottom: -1, right: -1, color, pointerEvents: 'none' }}>
        <polyline points="1 9 9 9 9 1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" strokeLinecap="square" />
        <line x1="7.5" y1="7" x2="9" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      </svg>
      {children}
    </span>
  )
}

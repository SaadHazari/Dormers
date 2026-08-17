'use client'

/**
 * BugReportTrigger — tiny ghost bug icon at the top-right corner of the
 * dashboard's cream content-border container. Intentionally hard to spot:
 * it's there for the user who's looking, not the user who's scanning.
 *
 * Hover surfaces a small "Found a bug?" tooltip below the icon. Clicking
 * opens Sentry's user-feedback dialog (configured in
 * src/instrumentation-client.ts with autoInject:false so this is the
 * single entry point — no floating widget glued to the viewport).
 *
 * Positioned absolutely inside .content-border (which sets position:relative
 * in dashboard/layout.tsx) so it scrolls with the page and lives at the
 * top-right of the cream surface, not the browser window.
 */

import { useEffect, useRef, useState } from 'react'
import { Bug } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { BODY, NV, S } from './tokens'
import { COMPACT } from './breakpoints'

export function BugReportTrigger() {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(false)
  // Desktop-only. Removed from the DOM on mobile (not just display:none) so no
  // cached/stale stylesheet can keep it on screen. The CSS rule stays too as a
  // no-flash guard for the pre-hydration frame.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(COMPACT)
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const button = buttonRef.current
    if (!button) return
    const feedback = Sentry.getFeedback()
    if (!feedback) return
    const unsubscribe = feedback.attachTo(button)
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  if (isMobile) return null

  return (
    <div
      className="bug-trigger"
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 5,
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        pointerEvents: 'auto',
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label="Report a bug"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          padding: 0,
          background: 'transparent',
          border: 0,
          color: S.fgFaint,
          opacity: 0.6,
          cursor: 'pointer',
          // No hover lift — user explicitly asked for a fixed faint state.
          // Tooltip is the only feedback.
        }}
      >
        <Bug size={14} strokeWidth={1.75} aria-hidden />
      </button>

      {/* Tooltip — sits below the icon, fades in on hover. Right-anchored
          so it never escapes the container edge. */}
      <div
        role="tooltip"
        aria-hidden={!hover}
        style={{
          fontFamily: BODY,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#f5f0e8',
          background: NV,
          padding: '6px 10px',
          borderRadius: 6,
          marginTop: 6,
          whiteSpace: 'nowrap',
          opacity: hover ? 1 : 0,
          transform: hover ? 'translateY(0)' : 'translateY(-2px)',
          pointerEvents: 'none',
          transition: 'opacity 140ms ease, transform 140ms ease',
          boxShadow: '0 4px 12px rgba(9,24,37,0.18)',
        }}
      >
        Found a bug?
      </div>
    </div>
  )
}

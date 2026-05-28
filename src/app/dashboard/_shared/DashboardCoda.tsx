'use client'

/**
 * DashboardCoda — the quiet closing line at the bottom of every dashboard
 * page. Two stacked centered captions:
 *
 *   MADE WITH ❤ IN DUBAI
 *      found a bug?
 *
 * The second line is hidden in plain sight — identical typographic family
 * to the brand signature above it, no chrome, no icon. Hover lifts the
 * color and reveals an underline; that's the only signal it's interactive.
 *
 * Clicking opens Sentry's user-feedback dialog (configured in
 * src/instrumentation-client.ts with autoInject:false so this is the
 * single entry point — no floating widget in the corner).
 *
 * Lives in the layout, not on individual pages, so every dashboard route
 * inherits the same coda without per-page upkeep.
 */

import { useEffect, useRef, useState } from 'react'
import { Heart } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { BODY, OG, S, NV } from './tokens'

export function DashboardCoda() {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(false)

  // Wire Sentry's feedback dialog to our custom button. attachTo returns
  // a cleanup that detaches the listener — important for React StrictMode
  // double-mount and for hot-reload not to double-bind.
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

  return (
    <div
      style={{
        textAlign: 'center',
        padding: '20px 0 16px',
        fontFamily: BODY,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: S.fgSub,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        Made with <Heart size={11} fill={OG} strokeWidth={0} aria-hidden /> in Dubai
      </span>
      <button
        ref={buttonRef}
        type="button"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          background: 'transparent',
          border: 0,
          padding: 0,
          margin: 0,
          // Inherit the wrapper's font + size + letter-spacing exactly so
          // the bug line is typographically indistinguishable from the
          // heart line above it — that's the "hidden in plain sight" trick.
          font: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          letterSpacing: 'inherit',
          textTransform: 'lowercase',
          color: hover ? NV : S.fgSub,
          textDecoration: hover ? 'underline' : 'none',
          textUnderlineOffset: 4,
          textDecorationThickness: 1,
          cursor: 'pointer',
          transition: 'color 150ms ease',
        }}
      >
        found a bug?
      </button>
    </div>
  )
}

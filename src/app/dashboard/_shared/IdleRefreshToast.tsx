'use client'

/**
 * IdleRefreshToast — small bottom-right toast that prompts a page refresh
 * after the user has likely been looking at stale data.
 *
 * Fires when either signal trips:
 *   • Tab was hidden for >= IDLE_HIDDEN_MS (returning to a tab left open
 *     overnight is the most common stale-data scenario)
 *   • No user activity for >= IDLE_ACTIVE_MS while the tab stayed visible
 *
 * Dismissed → suppressed for SUPPRESS_MS via sessionStorage so it doesn't
 * become a nag. State is per-tab — opening a new tab gets a fresh slate.
 *
 * Mounted once in the dashboard layout; no per-page wiring needed.
 */

import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { BODY, OG } from './tokens'

const IDLE_HIDDEN_MS  = 15 * 60 * 1000  // 15 min away in another tab = likely stale
const IDLE_ACTIVE_MS  = 30 * 60 * 1000  // 30 min idle while focused = probably stepped away
const SUPPRESS_MS     = 60 * 60 * 1000  // dismissed → quiet for an hour
const CHECK_INTERVAL  = 30 * 1000       // active-idle polling cadence
const SUPPRESS_KEY    = 'dormers:idle-refresh:suppressed-until'

export function IdleRefreshToast() {
  const [show, setShow] = useState(false)
  const lastActivityAt = useRef<number>(Date.now())
  const hiddenSince    = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const isSuppressed = () => {
      try {
        const raw = window.sessionStorage.getItem(SUPPRESS_KEY)
        return raw ? Date.now() < Number(raw) : false
      } catch { return false }
    }

    const markActivity = () => { lastActivityAt.current = Date.now() }
    const trigger = () => {
      if (isSuppressed()) return
      setShow(true)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince.current = Date.now()
      } else {
        const hidden = hiddenSince.current
        hiddenSince.current = null
        if (hidden && Date.now() - hidden >= IDLE_HIDDEN_MS) trigger()
        markActivity()
      }
    }

    const activityEvents: (keyof WindowEventMap)[] = [
      'mousemove', 'keydown', 'scroll', 'click', 'touchstart',
    ]
    activityEvents.forEach(ev => window.addEventListener(ev, markActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastActivityAt.current >= IDLE_ACTIVE_MS) trigger()
    }, CHECK_INTERVAL)

    return () => {
      activityEvents.forEach(ev => window.removeEventListener(ev, markActivity))
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
    }
  }, [])

  if (!show) return null

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(SUPPRESS_KEY, String(Date.now() + SUPPRESS_MS))
    } catch { /* storage disabled — toast stays gone for this render at least */ }
    lastActivityAt.current = Date.now()
    setShow(false)
  }

  const refresh = () => { window.location.reload() }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--ds-bg-surface, #ffffff)',
        border: '1px solid var(--ds-og-border)',
        boxShadow: '0 12px 32px rgba(9,24,37,0.16)',
        fontFamily: BODY,
        maxWidth: 320,
        animation: 'idle-refresh-slide-in 220ms ease-out',
      }}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: '50%',
        background: 'var(--ds-og-wash)', color: OG, flexShrink: 0,
      }}>
        <RefreshCw size={15} strokeWidth={2.2} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-fg)', lineHeight: 1.25 }}>
          You&rsquo;ve been away
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ds-fg-muted)', marginTop: 2, lineHeight: 1.35 }}>
          Refresh to see the latest.
        </div>
      </div>

      <button
        type="button"
        onClick={refresh}
        style={{
          padding: '6px 12px',
          borderRadius: 'var(--radius-pill)',
          background: OG, color: '#fff', border: 0,
          fontFamily: BODY, fontSize: 12, fontWeight: 700,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: '0 4px 12px rgba(245,127,32,0.30)',
        }}
      >
        Refresh
      </button>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          padding: 4,
          background: 'none', border: 0, cursor: 'pointer',
          color: 'var(--ds-fg-tint)', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={14} strokeWidth={2} />
      </button>

      <style>{`
        @keyframes idle-refresh-slide-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

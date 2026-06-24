'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useState } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  const [refreshing, setRefreshing] = useState(false)

  // A stale Server Action — the user is running a JS bundle from a previous
  // deploy, so the action id baked into their page no longer exists on the
  // server (Sentry JAVASCRIPT-NEXTJS-A on /login). The fix is a hard reload to
  // pull the fresh bundle; the action id will then match. We auto-reload once
  // (loop-guarded via sessionStorage) instead of showing an error screen for
  // what is really just "your tab is out of date".
  const isStaleServerAction =
    /Server Action .* was not found on the server|Failed to find Server Action/i.test(
      error?.message ?? '',
    )

  useEffect(() => {
    if (isStaleServerAction) {
      try {
        const KEY = 'dormers:stale-action-reloaded-at'
        const last = Number(sessionStorage.getItem(KEY) || 0)
        // Only auto-reload if we haven't just done so — a persistent mismatch
        // (e.g. CDN serving an old bundle) must not trap the user in a reload
        // loop; fall through to the manual error screen instead.
        if (Date.now() - last > 10_000) {
          sessionStorage.setItem(KEY, String(Date.now()))
          window.location.reload()
          return
        }
      } catch {
        /* sessionStorage blocked — fall through to the error screen */
      }
    }
    Sentry.captureException(error)
  }, [error, isStaleServerAction])

  const handleRefresh = () => {
    setRefreshing(true)
    setTimeout(() => window.location.reload(), 300)
  }

  return (
    <html>
      <body
        style={{
          margin: 0,
          backgroundColor: '#091825',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            textAlign: 'center',
            padding: '40px 28px',
            backgroundColor: 'rgba(245,127,32,0.06)',
            border: '1px solid rgba(245,127,32,0.35)',
            borderRadius: 18,
          }}
        >
          <div
            style={{
              fontSize: 11, fontWeight: 900, color: '#f57f20',
              letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 12,
            }}
          >
            Dormers
          </div>
          <h1
            style={{
              fontSize: 22, fontWeight: 900, color: '#ede8da',
              lineHeight: 1.2, margin: '0 0 12px',
            }}
          >
            Something went wrong.
          </h1>
          <p
            style={{
              fontSize: 13, fontWeight: 500, color: 'rgba(237,232,218,0.55)',
              lineHeight: 1.55, margin: '0 0 22px',
            }}
          >
            Your meals and plan are safe. Try refreshing, or reach out if it keeps happening.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 10, fontWeight: 600, color: 'rgba(237,232,218,0.25)',
                fontFamily: 'monospace', marginBottom: 18,
              }}
            >
              Ref: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                padding: '12px 28px', borderRadius: 999,
                backgroundColor: '#f57f20', color: '#ffffff', border: 'none',
                fontSize: 13, fontWeight: 900, letterSpacing: '0.10em',
                textTransform: 'uppercase',
                cursor: refreshing ? 'default' : 'pointer',
                opacity: refreshing ? 0.85 : 1,
                transition: 'opacity 150ms ease',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}
            >
              {refreshing && (
                <span
                  style={{
                    width: 14, height: 14,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'ge-spin 600ms linear infinite',
                    display: 'inline-block', flexShrink: 0,
                  }}
                />
              )}
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <a
              href="https://wa.me/971504619384"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '12px 24px', borderRadius: 999,
                backgroundColor: '#25D366', color: '#ffffff', border: 'none',
                fontSize: 13, fontWeight: 900, letterSpacing: '0.10em',
                textTransform: 'uppercase', textDecoration: 'none',
              }}
            >
              WhatsApp us
            </a>
          </div>
        </div>
        {refreshing && (
          <style>{`
            @keyframes ge-spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        )}
      </body>
    </html>
  )
}

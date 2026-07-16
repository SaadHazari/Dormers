'use client'

// Error boundary for /dashboard/dorm-wars. Without this file an unhandled
// throw in HubClient (e.g. a Supabase query barfing on a schema drift,
// the awarder helpers misbehaving, a malformed prop) would bubble up to
// the root error and show a generic "something went wrong" page that
// doesn't even acknowledge Dorm Wars exists. This boundary keeps the
// user oriented + offers a retry, and surfaces the underlying error to
// our logs (digest) for ops triage.

import { useEffect } from 'react'
import { useSilentRetry } from '../_shared/useSilentRetry'

export default function HubError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const retrying = useSilentRetry(reset)

  useEffect(() => {
    // Surface to whatever observability we have. console.error is the
    // current MVP; swap to a real logger when one ships.
    console.error('Dorm Wars hub error:', error)
  }, [error])

  // Silent retry in progress (see useSilentRetry) — hold a quiet dark
  // loading state instead of the dialog.
  if (retrying) {
    return (
      <div
        style={{
          backgroundColor: '#091825',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: '40px 24px',
          fontFamily: 'var(--font-montserrat), Arial, Helvetica, sans-serif',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '3px solid rgba(245,127,32,0.20)',
            borderTopColor: '#f57f20',
            animation: 'dash-retry-spin 0.8s linear infinite',
          }}
        />
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(237,232,218,0.65)' }}>
          Taking a moment longer than usual
        </div>
        <style>{'@keyframes dash-retry-spin { to { transform: rotate(360deg) } }'}</style>
      </div>
    )
  }

  return (
    <div
      style={{
        backgroundColor: '#091825',
        backgroundImage:
          'radial-gradient(ellipse at 50% -15%, rgba(245,127,32,0.14) 0%, transparent 55%),' +
          'linear-gradient(180deg, #091825 0%, #1e3a4f 55%, #162f40 100%)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        fontFamily: 'var(--font-montserrat), Arial, Helvetica, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          textAlign: 'center',
          backgroundColor: 'rgba(245,127,32,0.06)',
          border: '1px solid rgba(245,127,32,0.35)',
          borderRadius: 18,
          padding: '32px 28px',
          boxShadow: '0 10px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(245,127,32,0.18)',
        }}
      >
        <div
          style={{
            fontSize: 11, fontWeight: 900, color: '#f57f20',
            letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 12,
          }}
        >
          Dorm Wars hit a snag
        </div>
        <h1
          style={{
            fontSize: 22, fontWeight: 900, color: '#ede8da',
            letterSpacing: '-0.01em', lineHeight: 1.2, margin: '0 0 12px',
          }}
        >
          We&rsquo;re patching this up.
        </h1>
        <p
          style={{
            fontSize: 13, fontWeight: 500, color: 'rgba(237,232,218,0.65)',
            lineHeight: 1.55, margin: '0 0 22px',
          }}
        >
          Something on our end stopped the hub from loading. Your meals, plan, and credits are
          all safe — this only affected the rewards screen. Tap retry, or come back in a moment.
        </p>
        {error.digest && (
          <p
            style={{
              fontSize: 10, fontWeight: 600, color: 'rgba(237,232,218,0.30)',
              fontFamily: 'var(--font-jetbrains), monospace',
              marginBottom: 18, letterSpacing: '0.04em',
            }}
          >
            Ref: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            display: 'inline-block',
            padding: '12px 28px',
            borderRadius: 999,
            backgroundColor: '#f57f20',
            color: '#091825',
            border: 'none',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 900,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(245,127,32,0.45)',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}

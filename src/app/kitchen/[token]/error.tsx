'use client'

/**
 * Kitchen route error boundary (Release It! L5, Phase 3).
 *
 * If anything in the kitchen RSC throws (e.g. a Supabase outage on a path that
 * isn't fail-open), the kitchen station shows this friendly, retryable screen
 * in the light kitchen palette instead of the generic global-error page. The
 * 60s auto-refresh in KitchenClient won't be running here, so we give staff an
 * explicit "Try again" button.
 */

import { useEffect } from 'react'

const BG = '#faf8f4'
const NAVY = '#091825'
const MUTED = '#64748b'
const ORANGE = '#f57f20'
const FONT = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

export default function KitchenError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface to the browser console for on-site debugging; Sentry's
    // onRequestError already captured the server-side throw.
    console.error('[kitchen] render error:', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: BG,
        color: NAVY,
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        padding: '24px 16px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '22px', fontWeight: 800 }}>Kitchen display unavailable</div>
      <p style={{ fontSize: '15px', color: MUTED, maxWidth: '420px', lineHeight: 1.5, margin: 0 }}>
        Couldn’t load the kitchen screen just now. This is usually temporary — tap below to
        retry. If it keeps happening, check with admin before cooking.
      </p>
      <button
        onClick={reset}
        style={{
          padding: '14px 28px',
          borderRadius: '12px',
          border: 'none',
          backgroundColor: ORANGE,
          color: '#fff',
          fontSize: '16px',
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: FONT,
        }}
      >
        Try again
      </button>
    </div>
  )
}

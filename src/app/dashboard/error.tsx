'use client'

// Dashboard-level error boundary.
//
// PRIMARY JOB: catch UnrecognizedActionError — the Next.js error thrown when
// the client bundle's Server Action IDs (baked in at build time) don't match
// the server's IDs after a new deployment. This happens when a user has the
// page open across a deploy and then triggers a Server Action (e.g. sign-out).
//
// FIX: hard-reload so the browser fetches the fresh bundle with the correct
// action IDs. The user can then retry their action successfully.
//
// For all other errors we surface a simple retry UI instead of a blank crash.

import { useEffect, useState } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isStaleBundle =
    error.name === 'UnrecognizedActionError' ||
    error.message.includes('was not found on the server')

  const [reloading, setReloading] = useState(isStaleBundle)

  useEffect(() => {
    if (isStaleBundle) {
      // Force a full page reload so the browser fetches the latest JS bundle,
      // which will have the new Server Action IDs registered.
      window.location.reload()
    } else {
      console.error('Dashboard error:', error)
    }
  }, [error, isStaleBundle])

  if (reloading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-montserrat), Arial, Helvetica, sans-serif',
          color: 'var(--ds-text-secondary, #6b7280)',
          fontSize: 15,
          gap: 10,
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ animation: 'spin 1s linear infinite' }}
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        Updating&hellip;
      </div>
    )
  }

  return (
    <div
      style={{
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
          maxWidth: 420,
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: 16,
            color: 'var(--ds-text-secondary, #6b7280)',
            marginBottom: 24,
          }}
        >
          Something went wrong. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: '1px solid currentColor',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
'use client'

import { useEffect } from 'react'
import { whatsAppHref } from '@/shared/contacts'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '40px 24px',
        fontFamily: 'var(--font-montserrat), Arial, Helvetica, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          textAlign: 'center',
          backgroundColor: 'rgba(245,127,32,0.06)',
          border: '1px solid rgba(245,127,32,0.35)',
          borderRadius: 18,
          padding: '32px 28px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            color: '#f57f20',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Something went wrong
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: '#1a1a1a',
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
            margin: '0 0 12px',
          }}
        >
          We&rsquo;re on it.
        </h1>
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'rgba(26,26,26,0.55)',
            lineHeight: 1.55,
            margin: '0 0 22px',
          }}
        >
          Your meals, plan, and credits are all safe &mdash; the page just
          couldn&rsquo;t load this time. Tap retry, or reach out if it keeps
          happening.
        </p>
        {error.digest && (
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'rgba(26,26,26,0.25)',
              fontFamily: 'var(--font-jetbrains), monospace',
              marginBottom: 18,
              letterSpacing: '0.04em',
            }}
          >
            Ref: {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={reset}
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              borderRadius: 999,
              backgroundColor: '#f57f20',
              color: '#ffffff',
              border: 'none',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 900,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(245,127,32,0.35)',
            }}
          >
            Try again
          </button>
          <a
            href={whatsAppHref()}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '12px 24px',
              borderRadius: 999,
              backgroundColor: '#25D366',
              color: '#ffffff',
              border: 'none',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 900,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            WhatsApp us
          </a>
        </div>
      </div>
    </div>
  )
}

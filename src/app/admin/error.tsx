'use client'

import { useEffect, useState } from 'react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isLight, setIsLight] = useState(false)

  useEffect(() => {
    console.error('Admin error:', error)
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    setIsLight(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsLight(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [error])

  const bg = isLight ? '#f5f0e8' : '#091825'
  const cardBg = isLight ? '#ffffff' : '#0d2035'
  const cardBorder = isLight ? 'rgba(9,24,37,0.08)' : 'rgba(255,255,255,0.08)'
  const heading = isLight ? '#091825' : '#ede8da'
  const muted = isLight ? 'rgba(9,24,37,0.55)' : 'rgba(237,232,218,0.50)'
  const faint = isLight ? 'rgba(9,24,37,0.25)' : 'rgba(237,232,218,0.25)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '40px 24px',
        backgroundColor: bg,
        fontFamily: 'var(--font-montserrat), Arial, Helvetica, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          textAlign: 'center',
          backgroundColor: cardBg,
          border: `1px solid ${cardBorder}`,
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
          Connection lost
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: heading,
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
            margin: '0 0 12px',
          }}
        >
          Page couldn&rsquo;t load
        </h1>
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: muted,
            lineHeight: 1.55,
            margin: '0 0 22px',
          }}
        >
          The server took too long to respond. This usually resolves on retry.
        </p>
        {error.digest && (
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: faint,
              fontFamily: 'var(--font-jetbrains), monospace',
              marginBottom: 18,
              letterSpacing: '0.04em',
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
      </div>
    </div>
  )
}

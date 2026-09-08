'use client'

/**
 * Rider route error boundary.
 *
 * The kitchen display got one of these in the Phase 3 fail-loud pass; the rider
 * PWA did not, and the rider is the worse place to be missing it. A kitchen
 * tablet sits on a counter next to someone who can go find help. A rider is on
 * a phone, in a car, mid-shift, holding a van full of food — and without this
 * file a throw anywhere in the run drops them onto the bare root error page:
 * no chrome, no token in the URL any more, no way back into the route.
 *
 * So the one thing this screen must do is get them back. `reset()` re-renders
 * the segment, which is enough for a transient Supabase blip. If that fails,
 * a plain reload of the same URL keeps the ops token intact — which is why the
 * second button is a reload and not a link somewhere else.
 *
 * Deliberately NOT offering "skip this dorm" or any write action. A rider who
 * hit an error has no idea what committed and what didn't, and the drop-off
 * budget is read from the server row precisely so a confused client cannot
 * invent state. Recover the page; let the flow re-derive the truth.
 */

import { useEffect } from 'react'

const BG = '#faf8f4'
const CARD = '#ffffff'
const NAVY = '#091825'
const MUTED = '#64748b'
const ORANGE = '#f57f20'
const BORDER = '#e5e2dc'
const FONT = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

const btn = (primary: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '16px 24px',
  borderRadius: '14px',
  border: primary ? 'none' : `1.5px solid ${BORDER}`,
  backgroundColor: primary ? ORANGE : CARD,
  color: primary ? '#ffffff' : NAVY,
  fontSize: '16px',
  fontWeight: 700,
  fontFamily: FONT,
  cursor: 'pointer',
  // Thumb-sized targets: this is used one-handed, standing at a door.
  minHeight: '56px',
})

export default function RiderError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[ops/rider] render error:', error)
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
        gap: '18px',
        padding: '24px 20px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '22px', fontWeight: 800 }}>Run screen unavailable</div>

      <p style={{ fontSize: '15px', color: MUTED, maxWidth: '380px', lineHeight: 1.55, margin: 0 }}>
        Something went wrong loading your run. Your deliveries are safe — nothing
        you already confirmed has been lost. Tap below to get back in.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '340px', marginTop: '4px' }}>
        <button onClick={reset} style={btn(true)}>Try again</button>
        <button onClick={() => window.location.reload()} style={btn(false)}>Reload the page</button>
      </div>

      <p style={{ fontSize: '13px', color: MUTED, maxWidth: '380px', lineHeight: 1.5, margin: '6px 0 0' }}>
        Still stuck? Message the owner on WhatsApp and keep delivering — the food
        matters more than the app. Counts can be recorded afterwards.
      </p>

      {error.digest && (
        <code style={{ fontSize: '11px', color: MUTED, opacity: 0.7 }}>ref {error.digest}</code>
      )}
    </div>
  )
}
